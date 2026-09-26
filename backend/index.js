require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");

const conectDb = require("./connectDb");
const Menu = require("./models/menu");
const Order = require("./models/createOrder");
const Table = require("./models/table");
const Bill = require("./models/bill");
const Stock = require("./models/stock");
const RestaurantUser = require("./models/login");
const RestaurantStaff = require("./models/loginStaff");
const { hashPassword, verifyPassword, needsRehash, validateNewPassword } = require("./utils/password");
const { signToken, requireAuth, requireAdmin, requireManager } = require("./utils/auth");
const loyaltyRoutes = require("./routes/loyalty");


const app = express();
const PORT = process.env.PORT || 5000;

// Neutralises NoSQL-injection such as {"id": {"$ne": null}} in query filters.
mongoose.set("sanitizeFilter", true);

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet());

// Only these websites may call the API from a browser (set ALLOWED_ORIGINS in .env).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:5173")
    .split(",").map((o) => o.trim()).filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("CORS: origin not allowed"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200
}));

app.use(express.json({ limit: "100kb" }));


// ---------- Helpers ----------
const getValue = (val, fallback) => (val !== undefined && val !== null && String(val).trim() !== "") ? val : fallback;

const parseNum = (val, fallback = 0) => {
    const parsed = Number(val);
    return isNaN(parsed) ? fallback : parsed;
};

// Only accept real strings from the browser (blocks object/array tricks).
const str = (v) => (typeof v === "string" ? v.trim() : "");



// ==========================================
// ⏱️ RESTAURANT SUBSCRIPTION TIME (self-service, read-only)
// ==========================================

// Deducts one day for every full calendar day since the last sync, saves it,
// and returns the restaurant with an up-to-date remainingTime. No cron job
// needed — this runs lazily, the moment anyone asks for the time left.
const syncRemainingTime = async (restaurant) => {
    const now = new Date();
    const last = restaurant.lastTimeSync || restaurant.createdAt || now;
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysPassed = Math.floor((now.getTime() - new Date(last).getTime()) / msPerDay);

    if (daysPassed > 0) {
        const currentRemaining = restaurant.remainingTime ?? restaurant.totalTime ?? 0;
        restaurant.remainingTime = Math.max(0, currentRemaining - daysPassed);
        restaurant.lastTimeSync = new Date(new Date(last).getTime() + daysPassed * msPerDay);
        await restaurant.save();
    }
    return restaurant;
};

// ==========================================
// PUBLIC ROUTES (no token needed)
// ==========================================
app.get("/health", (req, res) => res.json({ status: "ok" }));

// 10 FAILED attempts per IP per 15 min. Successful logins are not counted.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many login attempts. Please wait 15 minutes and try again." }
});

const publicUser = (r) => ({
    _id: r._id,
    id: r.id,
    restaurantName: r.restaurantName,
    phone: r.phone,
    email: r.email,
    location: r.location,
    PanOrVat: r.PanOrVat,
    isActive: r.isActive,
    isAdmin: r.isAdmin,
    totalTime: r.totalTime,
  remainingTime: r.remainingTime,
});

app.post("/api/auth/login", loginLimiter, async (req, res) => {
    try {
        const restaurantName = str(req.body?.restaurantName);
        const id = str(req.body?.id);
        const password = typeof req.body?.password === "string" ? req.body.password : "";

        if (!restaurantName || !id || !password) {
            return res.status(400).json({ success: false, message: "Restaurant name, ID and password are required." });
        }

        // One vague message for every failure, so attackers can't learn which part was wrong.
        const fail = () => res.status(401).json({ success: false, message: "Invalid restaurant name, ID or password." });

        const restaurant = await RestaurantUser.findOne({ id }).select("+password");
        if (!restaurant) return fail();
       if (String(restaurant.restaurantName || "").trim().toLowerCase() !== restaurantName.toLowerCase()) return fail();
        if (!(await verifyPassword(password, restaurant.password))) return fail();

        if (!restaurant.isActive) {
            return res.status(403).json({ success: false, message: "Account is deactivated. Contact Admin." });
        }

        // Upgrade an old plain-text password to a secure hash on the first successful login.
        if (needsRehash(restaurant.password)) {
            restaurant.password = await hashPassword(password);
            await restaurant.save();
        }

        const token = signToken({ kind: "restaurant", uid: String(restaurant._id) });
        return res.status(200).json({
            success: true,
            message: "Login successful!",
            token,
            user: publicUser(restaurant)
        });
    } catch (error) {
        console.error("🔴 LOGIN ERROR:", error);
        return res.status(500).json({ success: false, message: "Server error during login." });
    }
});

// ==========================================
// 🔒 EVERYTHING BELOW THIS LINE NEEDS A VALID TOKEN
// ==========================================
app.use("/api/public", require("./routes/publicMenu"));
app.use("/api", requireAuth);

app.post("/api/auth/verify", requireAuth, async (req, res) => {
    try {
        const restaurant = await RestaurantUser.findById(req.auth.uid);
        if (!restaurant) {
            return res.status(401).json({ success: false, message: "Invalid token" });
        }
        return res.json({ success: true, user: publicUser(restaurant) });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Server error." });
    }
});

app.post("/api/staff/login", loginLimiter, async (req, res) => {
    try {
        const id = str(req.body?.id);
        const password = typeof req.body?.password === "string" ? req.body.password : "";

        if (!id || !password) {
            return res.status(400).json({ success: false, message: "Staff ID and password are required." });
        }

        // This computer is already logged in as a restaurant.
        // Only THAT restaurant's staff can sign in here.
        const restaurantName = req.auth.restaurantName;

        const staff = await RestaurantStaff.findOne({ id, restaurantName })
            .collation({ locale: "en", strength: 2 })
            .select("+password");

        if (!staff || !(await verifyPassword(password, staff.password))) {
            return res.status(401).json({ success: false, message: "Invalid staff ID or password." });
        }
        if (staff.isActive === false) {
            return res.status(403).json({ success: false, message: "Your account is deactivated. Only active staff can log in." });
        }

        if (needsRehash(staff.password)) {
            staff.password = await hashPassword(password);
            await staff.save();
        }

        // uid = the restaurant from the current session, never looked up by name
        const token = signToken({ kind: "staff", uid: req.auth.uid, sid: String(staff._id) });

        return res.json({
            success: true,
            token,
            user: { id: staff.id, staffName: staff.staffName, role: staff.role, restaurantName: req.auth.restaurantName },
        });
    } catch (error) {
        console.error("🔴 STAFF LOGIN ERROR:", error);
        return res.status(500).json({ success: false, message: "Server error during staff login." });
    }
});

// Every write is forced to belong to the logged-in restaurant,
// even if someone edits the request in the browser.
app.use(["/api/menu", "/api/orders", "/api/tables", "/api/bills", "/api/stocks"], (req, res, next) => {
    if (["POST", "PUT", "PATCH"].includes(req.method) && req.body && typeof req.body === "object") {
        req.body.restaurantId = req.auth.restaurantId;
    }
    next();
});

// For /something/:id routes, make sure that record belongs to this restaurant.
const ownsDoc = (Model) => async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid id." });
        }
        const doc = await Model.findById(req.params.id).select("restaurantId").lean();
        if (!doc || doc.restaurantId !== req.auth.restaurantId) {
            return res.status(404).json({ success: false, message: "Not found." });
        }
        next();
    } catch (err) {
        next(err);
    }
};
app.use("/api/menu/:id", ownsDoc(Menu));
app.use("/api/orders/:id", ownsDoc(Order));
app.use("/api/tables/:id", ownsDoc(Table));
app.use("/api/bills/:id", ownsDoc(Bill));
app.use("/api/stocks/:id", ownsDoc(Stock));


// Server-side role checks (the sidebar hides pages, this enforces it)
const allowRoles = (...roles) => (req, res, next) =>
    req.auth?.isAdmin || (req.auth?.kind === "staff" && roles.includes(req.auth.role))
        ? next()
        : res.status(403).json({ success: false, message: "Your role is not allowed to do this." });

const guard = (path, rules) =>
    app.use(path, (req, res, next) => (rules[req.method] ? allowRoles(...rules[req.method])(req, res, next) : next()));

const M = "Manager", W = "Waiter", K = "Kitchen Staff", C = "Cashier";

guard("/api/menu",   { POST: [M], PUT: [M], DELETE: [M] });
guard("/api/orders", { POST: [M, W], PUT: [M, W, K, C], DELETE: [M] });
guard("/api/bills",  { POST: [M, C], PATCH: [M, C] });
guard("/api/tables", { POST: [M, C], PUT: [M, W, C], DELETE: [M] });
guard("/api/stocks", { POST: [M, K, C], PUT: [M, K, C], DELETE: [M] });



app.use("/api/loyalty", requireAuth, loyaltyRoutes);
app.use("/api/qr", require("./routes/qr"));

app.use("/api/table-qr", require("./routes/tableQr"));
app.use("/api/notifications", require("./routes/notifications"));




// ==========================================
// Menu
// ==========================================
const sanitizeComboItems = (items) =>
    Array.isArray(items)
        ? items
              .filter((c) => c && c.menuItemId)
              .map((c) => ({
                  menuItemId: String(c.menuItemId),
                  itemName: String(c.itemName || "").trim(),
                  quantity: Math.max(1, parseInt(c.quantity, 10) || 1),
                  price: parseNum(c.price || 0),
              }))
        : [];

// A combo must contain at least 2 items in total (e.g. 1 Momo + 1 Coke, or 2 Momo)
const comboItemCount = (items) => items.reduce((sum, c) => sum + (c.quantity || 0), 0);

// ==========================================
// POST: Create a New Menu Item (regular item or combo)
// ==========================================
app.post("/api/menu", async (req, res) => {
    try {
        const formData = req.body;

        const category = getValue(formData.category, "Uncategorized");
        const isCombo =
            formData.isCombo !== undefined ? Boolean(formData.isCombo) : category === COMBO_CATEGORY;
        const comboItems = isCombo ? sanitizeComboItems(formData.comboItems) : [];

        if (isCombo && comboItemCount(comboItems) < 2) {
            return res.status(400).json({
                success: false,
                message: "A combo needs at least 2 items.",
            });
        }

        const newMenuItem = await Menu.create({
            itemName: getValue(formData.itemName, "Unknown Dish"),
            description: getValue(formData.description, "No description provided"),
            category,
            price: parseNum(getValue(formData.price, 0)),
            status: getValue(formData.status, "Available"),
            skuBarcodeReference: getValue(formData.skuBarcodeReference, ""),
            restaurantId: getValue(formData.restaurantId, ""),
            isCombo,
            comboItems,
        });

        return res.status(201).json({
            success: true,
            message: isCombo ? "Combo created successfully!" : "Menu item added successfully!",
            data: newMenuItem,
        });
    } catch (error) {
        console.error("🔴 DATABASE WRITE CRASH:", error);

        if (error.code === 11000) {
            const duplicateField = Object.keys(error.keyValue)[0];
            return res.status(400).json({
                success: false,
                message: `A menu item with this ${duplicateField} ("${error.keyValue[duplicateField]}") already exists! Please use a unique value.`,
            });
        }

        return res.status(500).json({
            success: false,
            message: "Failed to save menu item to database.",
            error: process.env.NODE_ENV === "production" ? undefined : error.message,
        });
    }
});

// ==========================================
// GET: Fetch All Menu Items (compatible with all existing pages)
// ==========================================
app.get("/api/menu", async (req, res) => {
    try {
        // Works with or without auth middleware
        const restaurantId =
            (req.auth && req.auth.restaurantId) || req.query.restaurantId || "";
        const filter = restaurantId ? { restaurantId: String(restaurantId) } : {};

        // .lean() returns plain objects, so old/odd combo data can't crash Mongoose
        const dbItems = await Menu.find(filter).sort({ createdAt: -1 }).lean();

        const items = dbItems.map((item) => {
            // Keep only valid combo lines; ignore anything saved in an old format
            const comboItems = Array.isArray(item.comboItems)
                ? item.comboItems
                      .filter((c) => c && typeof c === "object" && c.menuItemId)
                      .map((c) => ({
                          menuItemId: String(c.menuItemId),
                          itemName: String(c.itemName || ""),
                          quantity: Number(c.quantity) || 1,
                          price: Number(c.price) || 0,
                      }))
                : [];

            return {
                id: item._id,
                _id: item._id,
                itemName: item.itemName,
                description: item.description,
                category: item.category,
                price: item.price,
                status: item.status,
                skuBarcodeReference: item.skuBarcodeReference || "",
                restaurantId: item.restaurantId,
                isCombo: Boolean(item.isCombo) || item.category === "Combo",
                comboItems,
                createdAt: item.createdAt || new Date().toISOString(),
            };
        });

        return res.status(200).json({ success: true, count: items.length, data: items });
    } catch (error) {
        console.error("🔴 Backend fetch failed:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching menu data.",
            error: error.message, // shows the real reason in the browser Network tab
        });
    }
});

// ==========================================
// PUT: Update an Existing Menu Item by ID
// Only the fields that are sent get changed, so a page that doesn't know
// about combos can never wipe a combo's contents.
// ==========================================
app.put("/api/menu/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        const updatedFields = {};

        if (updateData.itemName !== undefined) updatedFields.itemName = getValue(updateData.itemName, "Unknown Dish");
        if (updateData.description !== undefined) updatedFields.description = getValue(updateData.description, "No description provided");
        if (updateData.category !== undefined) updatedFields.category = getValue(updateData.category, "Uncategorized");
        if (updateData.price !== undefined) updatedFields.price = parseNum(getValue(updateData.price, 0));
        if (updateData.status !== undefined) updatedFields.status = getValue(updateData.status, "Available");
        if (updateData.skuBarcodeReference !== undefined) updatedFields.skuBarcodeReference = getValue(updateData.skuBarcodeReference, "");
        if (updateData.restaurantId) updatedFields.restaurantId = String(updateData.restaurantId);

        // Combo flag: explicit value wins; otherwise follow the category if it was sent
        if (updateData.isCombo !== undefined) {
            updatedFields.isCombo = Boolean(updateData.isCombo);
        } else if (updateData.category !== undefined) {
            updatedFields.isCombo = updateData.category === COMBO_CATEGORY;
        }

        // Combo contents: only touched when the request actually sends them
        if (Array.isArray(updateData.comboItems)) {
            updatedFields.comboItems = sanitizeComboItems(updateData.comboItems);
        }

        // Turning an item into a regular item clears its combo contents
        if (updatedFields.isCombo === false) {
            updatedFields.comboItems = [];
        }

        // A combo being saved with new contents still needs at least 2 items
        if (updatedFields.isCombo === true && updatedFields.comboItems && comboItemCount(updatedFields.comboItems) < 2) {
            return res.status(400).json({
                success: false,
                message: "A combo needs at least 2 items.",
            });
        }

        if (Object.keys(updatedFields).length === 0) {
            return res.status(400).json({ success: false, message: "Nothing to update." });
        }

        const updatedItem = await Menu.findByIdAndUpdate(
            id,
            { $set: updatedFields },
            { new: true, runValidators: true }
        );

        if (!updatedItem) {
            return res.status(404).json({ success: false, message: "Menu item not found." });
        }

        return res.status(200).json({
            success: true,
            message: "Menu item updated successfully!",
            data: updatedItem,
        });
    } catch (error) {
        console.error("🔴 Backend update failed:", error);

        if (error.code === 11000) {
            const duplicateField = Object.keys(error.keyValue)[0];
            return res.status(400).json({
                success: false,
                message: `Update rejected! Another item already uses this ${duplicateField}.`,
            });
        }

        return res.status(500).json({
            success: false,
            message: "Error updating menu entry.",
            error: process.env.NODE_ENV === "production" ? undefined : error.message,
        });
    }
});

// ==========================================
// DELETE: Remove a Menu Item by ID
// ==========================================
app.delete("/api/menu/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const deletedItem = await Menu.findByIdAndDelete(id);

        if (!deletedItem) {
            return res.status(404).json({ success: false, message: "Menu item not found." });
        }

        // Tell the caller which combos still reference this item (the UI shows them as "removed")
        const affectedCombos = await Menu.find(
            { isCombo: true, "comboItems.menuItemId": String(id) },
            { itemName: 1 }
        ).lean();

        return res.status(200).json({
            success: true,
            message: "Menu item deleted successfully!",
            deletedItemId: id,
            affectedCombos: affectedCombos.map((c) => ({ _id: c._id, itemName: c.itemName })),
        });
    } catch (error) {
        console.error("🔴 Backend deletion failed:", error);
        return res.status(500).json({ success: false, message: "Error deleting menu entry." });
    }
});

// ==========================================
// Order
// ==========================================

app.post("/api/orders", requireAuth, async (req, res) => {
    try {
        const formData = req.body;
        const restaurantId = req.auth.restaurantId; // Securely enforced from session

        // Save the staff "id" (e.g. "111"), NOT the _id.
        // 1) Use the id from the login token if auth.js provides it.
        // 2) Otherwise use the id the browser sent from localStorage,
        //    but only if that staff member exists in THIS restaurant.
        let staffId = req.auth.staffLoginId || null;
        if (!staffId) {
            const sentId = String(formData.staffId || "").trim();
            if (sentId) {
                const exists = await RestaurantStaff.exists({
                    restaurantName: req.auth.restaurantName,
                    id: sentId
                });
                if (exists) staffId = sentId;
            }
        }

        const newOrder = await Order.create({
            restaurantId: restaurantId,
            staffId: staffId,   // the staff "id" like "111"
            customerName: getValue(formData.customerName, "Guest"),
            tableNumber: getValue(formData.tableNumber, "N/A"),
            orderNote: getValue(formData.orderNote, ""),
            items: (formData.items || []).map(i => ({
                itemName: i.itemName || "Unknown Item",
                description: i.description || "",
                itemPrice: Number(i.itemPrice) || 0,
                quantity: Number(i.quantity) || 1,
            })),
            totalAmount: parseNum(getValue(formData.totalAmount, 0)),
            orderStatus: getValue(formData.orderStatus, "Pending"),
            paymentStatus: getValue(formData.paymentStatus, "Unpaid")
        });

        return res.status(201).json({
            success: true,
            message: "Order created successfully!",
            data: newOrder
        });

    } catch (error) {
        console.error("🔴 DATABASE WRITE CRASH:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to save order to database.",
            error: process.env.NODE_ENV === "production" ? undefined : error.message
        });
    }
});

app.get("/api/orders", requireAuth, async (req, res) => {
    try {
        const restaurantId = req.auth.restaurantId;
        const filter = req.auth.isAdmin ? {} : { restaurantId };

        const dbItems = await Order.find(filter).sort({ createdAt: -1 });

        const items = dbItems.map(item => ({
            id: item._id,
            _id: item._id,
            restaurantId: item.restaurantId,
            staffId: item.staffId || null, // <--- Mapping staffId to the response
            customerName: item.customerName,
            tableNumber: item.tableNumber,
            orderNote: item.orderNote,
            items: item.items,
            totalAmount: item.totalAmount,
            orderStatus: item.orderStatus,
            paymentStatus: item.paymentStatus,
            createdAt: item.createdAt || new Date().toISOString()
        }));

        return res.status(200).json({
            success: true,
            count: items.length,
            data: items
        });
    } catch (error) {
        console.error("🔴 Backend fetch failed:", error);
        return res.status(500).json({ success: false, message: "Error fetching orders data." });
    }
});
app.get("/api/staff/names", requireAuth, async (req, res) => {
    try {
        const staff = await RestaurantStaff
            .find({ restaurantName: req.auth.restaurantName })
            .select("id staffName role");

        res.status(200).json({
            success: true,
            data: staff.map((s) => ({ _id: s._id, id: s.id, staffName: s.staffName, role: s.role }))
        });
    } catch (err) {
        console.error("🔴 STAFF NAMES ERROR:", err);
        res.status(500).json({ success: false, message: "Error fetching staff names" });
    }
});

app.put("/api/orders/:id", requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const updatedFields = {};
        if (updateData.customerName !== undefined) updatedFields.customerName = updateData.customerName;
        if (updateData.tableNumber !== undefined) updatedFields.tableNumber = updateData.tableNumber;
        if (updateData.orderNote !== undefined) updatedFields.orderNote = updateData.orderNote;
        if (updateData.totalAmount !== undefined) updatedFields.totalAmount = Number(updateData.totalAmount);
        if (updateData.orderStatus !== undefined) updatedFields.orderStatus = updateData.orderStatus;
        if (updateData.paymentStatus !== undefined) updatedFields.paymentStatus = updateData.paymentStatus;
        if (updateData.staffId !== undefined) updatedFields.staffId = updateData.staffId; // <--- Allow updating staffId if needed

        if (updateData.items) {
            updatedFields.items = updateData.items.map(i => ({
                itemName: i.itemName || "Unknown Item",
                description: i.description || "",
                itemPrice: Number(i.itemPrice) || 0,
                quantity: Number(i.quantity) || 1,
            }));
        }

        const query = req.auth.isAdmin ? { _id: id } : { _id: id, restaurantId: req.auth.restaurantId };

        const updatedItem = await Order.findOneAndUpdate(
            query,
            { $set: updatedFields },
            { new: true, runValidators: true }
        );

        if (!updatedItem) {
            return res.status(404).json({ success: false, message: "Order not found or unauthorized." });
        }

        return res.status(200).json({
            success: true,
            message: "Order updated successfully!",
            data: updatedItem
        });
    } catch (error) {
        console.error("🔴 Backend update failed:", error);
        return res.status(500).json({
            success: false,
            message: "Error updating order entry.",
            error: process.env.NODE_ENV === "production" ? undefined : error.message
        });
    }
});

app.delete("/api/orders/:id", requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const query = req.auth.isAdmin ? { _id: id } : { _id: id, restaurantId: req.auth.restaurantId };

        const deletedItem = await Order.findOneAndDelete(query);

        if (!deletedItem) {
            return res.status(404).json({ success: false, message: "Order not found or unauthorized." });
        }

        return res.status(200).json({
            success: true,
            message: "Order deleted successfully!",
            deletedItemId: id
        });
    } catch (error) {
        console.error("🔴 Backend deletion failed:", error);
        return res.status(500).json({ success: false, message: "Error deleting order entry." });
    }
});



// ==========================================
// Table
// ==========================================

app.post("/api/tables", requireAuth, async (req, res) => {
    try {
        const formData = req.body;
        const restaurantId = req.auth.restaurantId;

        const capacity = parseNum(getValue(formData.capacity, 2));
        const occupiedSeats = parseNum(getValue(formData.occupiedSeats, 0));

        const newTable = await Table.create({
            restaurantId: restaurantId,
            tableName: getValue(formData.tableName, "Table 1"),
            capacity: capacity,
            occupiedSeats: Math.min(occupiedSeats, capacity), // ensures occupied doesn't exceed capacity
            status: getValue(formData.status, "Available")
        });

        return res.status(201).json({
            success: true,
            message: "Table added successfully!",
            data: newTable
        });

    } catch (error) {
        console.error("🔴 DATABASE WRITE CRASH:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to save table to database.",
            error: process.env.NODE_ENV === "production" ? undefined : error.message
        });
    }
});

app.get("/api/tables", requireAuth, async (req, res) => {
    try {
        const restaurantId = req.auth.restaurantId;
        const filter = req.auth.isAdmin ? {} : { restaurantId };

        const dbItems = await Table.find(filter).sort({ createdAt: -1 });

        const items = dbItems.map(item => ({
            id: item._id,
            _id: item._id,
            restaurantId: item.restaurantId,
            tableName: item.tableName,
            capacity: item.capacity,
            occupiedSeats: item.occupiedSeats ?? 0,
            freeSeats: item.freeSeats ?? Math.max(0, item.capacity - (item.occupiedSeats ?? 0)),
            status: item.status,
            createdAt: item.createdAt || new Date().toISOString()
        }));

        return res.status(200).json({
            success: true,
            count: items.length,
            data: items
        });
    } catch (error) {
        console.error("🔴 Backend fetch failed:", error);
        return res.status(500).json({ success: false, message: "Error fetching tables data." });
    }
});

app.put("/api/tables/:id", requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const capacity = parseNum(getValue(updateData.capacity, 2));
        const occupiedSeats = parseNum(getValue(updateData.occupiedSeats, 0));

        const updatedFields = {
            tableName: getValue(updateData.tableName, "Table 1"),
            capacity: capacity,
            occupiedSeats: Math.min(occupiedSeats, capacity),
            status: getValue(updateData.status, "Available")
        };

        const query = req.auth.isAdmin ? { _id: id } : { _id: id, restaurantId: req.auth.restaurantId };

        const updatedItem = await Table.findOneAndUpdate(
            query,
            { $set: updatedFields },
            { new: true, runValidators: true }
        );

        if (!updatedItem) {
            return res.status(404).json({ success: false, message: "Table not found or unauthorized." });
        }

        return res.status(200).json({
            success: true,
            message: "Table updated successfully!",
            data: updatedItem
        });
    } catch (error) {
        console.error("🔴 Backend update failed:", error);
        return res.status(500).json({
            success: false,
            message: "Error updating table entry.",
            error: process.env.NODE_ENV === "production" ? undefined : error.message
        });
    }
});

app.delete("/api/tables/:id", requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const query = req.auth.isAdmin ? { _id: id } : { _id: id, restaurantId: req.auth.restaurantId };

        const deletedItem = await Table.findOneAndDelete(query);

        if (!deletedItem) {
            return res.status(404).json({ success: false, message: "Table not found or unauthorized." });
        }

        return res.status(200).json({
            success: true,
            message: "Table deleted successfully!",
            deletedItemId: id
        });
    } catch (error) {
        console.error("🔴 Backend deletion failed:", error);
        return res.status(500).json({ success: false, message: "Error deleting table entry." });
    }
});

// ==========================================
// 🧾 BILLS ROUTES
// ==========================================

app.post("/api/bills", requireAuth, async (req, res) => {
    try {
        const formData = req.body;
        // Securely force the restaurantId from the logged-in user session
        const restaurantId = req.auth.restaurantId;

        const newBill = await Bill.create({
            restaurantName: getValue(formData.restaurantName, req.auth.restaurantName),
            location: getValue(formData.location, "N/A"),
            panOrVat: getValue(formData.panOrVat, "N/A"),
            invoiceNo: getValue(formData.invoiceNo, `INV-${Date.now()}`),
            billTo: getValue(formData.billTo, "Anonymous Customer"),
            tableNumber: getValue(formData.tableNumber, "N/A"),
            paymentMethod: getValue(formData.paymentMethod, "Cash"),
            cashPaidMoney: parseNum(getValue(formData.cashPaidMoney, 0)),
            eSewaPaidMoney: parseNum(getValue(formData.eSewaPaidMoney, 0)),
            khaltiPaidMoney: parseNum(getValue(formData.khaltiPaidMoney, 0)),
            imePayPaidMoney: parseNum(getValue(formData.imePayPaidMoney, 0)),
            date: formData.date ? new Date(formData.date) : new Date(),
            items: (formData.items || []).map(i => ({
                itemName: i.itemName || "Unknown Item",
                quantity: parseNum(getValue(i.quantity, 1)),
                rate: parseNum(getValue(i.rate, 0)),
                total: parseNum(getValue(i.total, 0)),
            })),
            subtotal: parseNum(getValue(formData.subtotal, 0)),
            discountPercent: parseNum(getValue(formData.discountPercent, 0)),
            discount: parseNum(getValue(formData.discount, 0)),
            vatRate: parseNum(getValue(formData.vatRate, 0)),
            taxableAmount: parseNum(getValue(formData.taxableAmount, 0)),
            vatCollected: parseNum(getValue(formData.vatCollected, 0)),
            grandTotal: parseNum(getValue(formData.grandTotal, 0)),
            restaurantId: restaurantId,
            orderId: getValue(formData.orderId, ""),
        });

        return res.status(201).json({
            success: true,
            message: "Bill generated and saved successfully!",
            data: newBill
        });
    } catch (error) {
        console.error("🔴 BILL WRITE CRASH:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to write billing record to database.",
            error: process.env.NODE_ENV === "production" ? undefined : error.message
        });
    }
});

app.get("/api/bills", requireAuth, async (req, res) => {
    try {
        const restaurantId = req.auth.restaurantId;
        // Admins can see all if needed, but standard users are strictly scoped
        const filter = req.auth.isAdmin ? {} : { restaurantId };

        const dbBills = await Bill.find(filter).sort({ createdAt: -1 });

        const bills = dbBills.map(bill => ({
            id: bill._id,
            _id: bill._id,
            orderId: bill.orderId,
            restaurantName: bill.restaurantName,
            location: bill.location,
            panOrVat: bill.panOrVat,
            invoiceNo: bill.invoiceNo,
            billTo: bill.billTo,
            tableNumber: bill.tableNumber,
            paymentMethod: bill.paymentMethod,
            cashPaidMoney: bill.cashPaidMoney,
            eSewaPaidMoney: bill.eSewaPaidMoney,
            khaltiPaidMoney: bill.khaltiPaidMoney,
            imePayPaidMoney: bill.imePayPaidMoney,
            date: bill.date,
            items: bill.items,
            subtotal: bill.subtotal,
            discount: bill.discount,
            taxableAmount: bill.taxableAmount,
            vatCollected: bill.vatCollected,
            grandTotal: bill.grandTotal,
            restaurantId: bill.restaurantId,
            createdAt: bill.createdAt
        }));

        return res.status(200).json({
            success: true,
            count: bills.length,
            data: bills
        });
    } catch (error) {
        console.error("🔴 Backend bills fetch failed:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching billing metrics from database."
        });
    }
});

app.patch("/api/bills/:id", requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { paymentMethod, cashPaidMoney, eSewaPaidMoney, khaltiPaidMoney, imePayPaidMoney } = req.body;

        const updateFields = {};
        if (paymentMethod !== undefined) updateFields.paymentMethod = paymentMethod;
        if (cashPaidMoney !== undefined) updateFields.cashPaidMoney = parseNum(cashPaidMoney);
        if (eSewaPaidMoney !== undefined) updateFields.eSewaPaidMoney = parseNum(eSewaPaidMoney);
        if (khaltiPaidMoney !== undefined) updateFields.khaltiPaidMoney = parseNum(khaltiPaidMoney);
        if (imePayPaidMoney !== undefined) updateFields.imePayPaidMoney = parseNum(imePayPaidMoney);

        // Ensure users can only update bills belonging to their restaurant (unless admin)
        const query = req.auth.isAdmin ? { _id: id } : { _id: id, restaurantId: req.auth.restaurantId };

        const updatedBill = await Bill.findOneAndUpdate(
            query,
            updateFields,
            { new: true, runValidators: true }
        );

        if (!updatedBill) {
            return res.status(404).json({ success: false, message: "Bill not found or unauthorized." });
        }

        return res.status(200).json({
            success: true,
            message: "Bill payment updated successfully.",
            data: updatedBill
        });
    } catch (error) {
        console.error("🔴 BILL PATCH CRASH:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update bill.",
            error: process.env.NODE_ENV === "production" ? undefined : error.message
        });
    }
});


// ==========================================
// 🧾 Stock
// ==========================================

app.post("/api/stocks", requireAuth, async (req, res) => {
    try {
        const { stockName, quantity, closingStock, perPiecePrice } = req.body;
        const restaurantId = req.auth.restaurantId; // Securely take from session

        const calculatedTotalPrice = parseNum(quantity) * parseNum(perPiecePrice);

        const newStock = new Stock({
            restaurantId,
            stockName,
            quantity,
            closingStock,
            perPiecePrice,
            totalPrice: calculatedTotalPrice,
        });

        const savedStock = await newStock.save();

        res.status(201).json({
            success: true,
            message: "Stock created successfully",
            data: savedStock,
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

app.get("/api/stocks", requireAuth, async (req, res) => {
    try {
        const restaurantId = req.auth.restaurantId;
        const filter = req.auth.isAdmin ? {} : { restaurantId };

        const stocks = await Stock.find(filter);

        res.status(200).json({
            success: true,
            count: stocks.length,
            data: stocks,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get("/api/stocks/:id", requireAuth, async (req, res) => {
    try {
        const query = req.auth.isAdmin 
            ? { _id: req.params.id } 
            : { _id: req.params.id, restaurantId: req.auth.restaurantId };

        const stock = await Stock.findOne(query);

        if (!stock) {
            return res.status(404).json({ success: false, message: "Stock item not found" });
        }

        res.status(200).json({ success: true, data: stock });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put("/api/stocks/:id", requireAuth, async (req, res) => {
    try {
        let updateData = { ...req.body };
        const query = req.auth.isAdmin 
            ? { _id: req.params.id } 
            : { _id: req.params.id, restaurantId: req.auth.restaurantId };

        if (updateData.quantity !== undefined || updateData.perPiecePrice !== undefined) {
            const existingStock = await Stock.findOne(query);
            if (!existingStock) {
                return res.status(404).json({ success: false, message: "Stock item not found" });
            }
            const q = updateData.quantity !== undefined ? parseNum(updateData.quantity) : existingStock.quantity;
            const p = updateData.perPiecePrice !== undefined ? parseNum(updateData.perPiecePrice) : existingStock.perPiecePrice;
            updateData.totalPrice = q * p;
        }

        const updatedStock = await Stock.findOneAndUpdate(
            query,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedStock) {
            return res.status(404).json({ success: false, message: "Stock item not found" });
        }

        res.status(200).json({ success: true, message: "Stock updated successfully", data: updatedStock });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

app.delete("/api/stocks/:id", requireAuth, async (req, res) => {
    try {
        const query = req.auth.isAdmin 
            ? { _id: req.params.id } 
            : { _id: req.params.id, restaurantId: req.auth.restaurantId };

        const deletedStock = await Stock.findOneAndDelete(query);

        if (!deletedStock) {
            return res.status(404).json({ success: false, message: "Stock item not found" });
        }

        res.status(200).json({ success: true, message: "Stock deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


app.get("/api/restaurant/time", requireAuth, async (req, res) => {
    try {
        // Non-admins can only ever see their own restaurant's time — same
        // restaurantId that /api/bills and /api/orders already use, taken
        // from the token, never trusted from the query string.
        const lookupId = req.auth.isAdmin
            ? (str(req.query.restaurantId) || req.auth.restaurantId)
            : req.auth.restaurantId;

        if (!lookupId) {
            return res.status(400).json({ success: false, message: "restaurantId is required." });
        }

        let restaurant = await RestaurantUser.findOne({ id: lookupId });
        if (!restaurant) {
            return res.status(404).json({ success: false, message: "Account not found." });
        }

        restaurant = await syncRemainingTime(restaurant);

        return res.status(200).json({
            success: true,
            data: {
                totalTime: restaurant.totalTime,
                remainingTime: restaurant.remainingTime,
            },
        });
    } catch (error) {
        console.error("🔴 RESTAURANT TIME ERROR:", error);
        return res.status(500).json({ success: false, message: "Could not load subscription time." });
    }
});

// ==========================================
// 🛠️ ADMIN ROUTES (restaurant accounts)
// ==========================================

// List all restaurant accounts (admin only). Passwords are never returned.
// Add requireAuth before requireAdmin
// Add requireAuth before requireAdmin
app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
        const users = await RestaurantUser.find({}).sort({ createdAt: -1 });
        res.json({ success: true, data: users.map(publicUser) });
    } catch (error) {
        console.error("🔴 ADMIN LIST ERROR:", error);
        res.status(500).json({ success: false, message: "Could not load accounts." });
    }
});

// Create a restaurant account (admin only)
app.post("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
        const b = req.body || {};
        const restaurantName = str(b.restaurantName || b.RESTAURANTName);
        const id = str(b.id);
        const phone = str(b.phone);
        const email = str(b.email);
        const location = str(b.location);
        const PanOrVat = str(b.PanOrVat);

        if (!restaurantName) {
            return res.status(400).json({ success: false, message: "Restaurant name is required." });
        }
        const pwError = validateNewPassword(b.password);
        if (pwError) return res.status(400).json({ success: false, message: pwError });

        if (await RestaurantUser.exists({ id })) {
            return res.status(400).json({ success: false, message: "User ID already exists." });
        }
        if (await RestaurantUser.exists({ restaurantName }).collation({ locale: "en", strength: 2 })) {
            return res.status(400).json({ success: false, message: "A restaurant with this name already exists." });
        }

        const created = await RestaurantUser.create({
            restaurantName,
            id,
            password: await hashPassword(b.password),
            phone,
            email,
            location,
            PanOrVat,
            isActive: true,
            totalTime: Number(b.totalTime) || 30,
            remainingTime: Number(b.remainingTime) || 30
        });

        return res.status(201).json({
            success: true,
            message: "New restaurant account created successfully!",
            data: publicUser(created)
        });
    } catch (error) {
        console.error("🔴 ADMIN USER CREATION ERROR:", error);
        return res.status(500).json({ success: false, message: "Server error while creating user." });
    }
});

// Update a restaurant account.
app.put("/api/admin/users/:userId", requireAuth, requireManager, async (req, res) => {
    try {
        const { userId } = req.params;
        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({ success: false, message: "Invalid id." });
        }
        if (!req.auth.isAdmin && userId !== req.auth.uid) {
            return res.status(403).json({ success: false, message: "You can only edit your own restaurant." });
        }

        const restaurant = await RestaurantUser.findById(userId).select("+password");
        if (!restaurant) return res.status(404).json({ success: false, message: "User not found." });

        const b = req.body || {};
        const oldName = restaurant.restaurantName;
        const oldId = restaurant.id;

        if (str(b.id) && str(b.id) !== restaurant.id) {
            if (await RestaurantUser.exists({ id: str(b.id) })) {
                return res.status(400).json({ success: false, message: "That ID is already taken." });
            }
            restaurant.id = str(b.id);
        }

        const newRestaurantName = str(b.restaurantName || b.RESTAURANTName);
        if (newRestaurantName && newRestaurantName !== restaurant.restaurantName) {
            const clash = await RestaurantUser
                .exists({ restaurantName: newRestaurantName, _id: mongoose.trusted({ $ne: restaurant._id }) })
                .collation({ locale: "en", strength: 2 });
            if (clash) return res.status(400).json({ success: false, message: "A restaurant with this name already exists." });
            restaurant.restaurantName = newRestaurantName;
        }

        if (str(b.phone)) restaurant.phone = str(b.phone);
        if (str(b.email)) restaurant.email = str(b.email);
        if (str(b.location)) restaurant.location = str(b.location);
        if (b.PanOrVat !== undefined) restaurant.PanOrVat = str(b.PanOrVat);

        // ✨ UPDATE TIME ALLOCATIONS (ADMIN ONLY)
        if (req.auth.isAdmin) {
            if (b.totalTime !== undefined) restaurant.totalTime = Number(b.totalTime);
            if (b.remainingTime !== undefined) restaurant.remainingTime = Number(b.remainingTime);
            // Restart the daily countdown from right now, so the elapsed days
            // since the account's last sync aren't immediately re-subtracted
            // from whatever new number the admin just set.
            if (b.totalTime !== undefined || b.remainingTime !== undefined) {
                restaurant.lastTimeSync = new Date();
            }
        }

        if (b.password) {
            const pwError = validateNewPassword(b.password);
            if (pwError) return res.status(400).json({ success: false, message: pwError });
            restaurant.password = await hashPassword(b.password);
        }

        if (req.auth.isAdmin && b.isActive !== undefined) {
            if (restaurant.isAdmin && b.isActive !== true) {
                return res.status(400).json({ success: false, message: "An admin account cannot be deactivated." });
            }
            restaurant.isActive = b.isActive === true;
        }

        await restaurant.save();

        if (restaurant.restaurantName !== oldName) {
            await RestaurantStaff.updateMany({ restaurantName: oldName }, { $set: { restaurantName: restaurant.restaurantName } });
        }
        if (restaurant.id !== oldId) {
            await Promise.all(
                [Menu, Order, Table, Bill, Stock].map((M) =>
                    M.updateMany({ restaurantId: oldId }, { $set: { restaurantId: restaurant.id } })
                )
            );
        }

        return res.status(200).json({ success: true, message: "Updated successfully.", data: publicUser(restaurant) });
    } catch (error) {
        console.error("🔴 UPDATE USER ERROR:", error);
        return res.status(500).json({ success: false, message: "Server error during update." });
    }
});

// Delete a restaurant account (admin only)
app.delete("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid id." });
        }
        const target = await RestaurantUser.findById(req.params.id);
        if (!target) return res.status(404).json({ success: false, message: "Account profile not found." });
        if (target.isAdmin) {
            return res.status(400).json({ success: false, message: "An admin account cannot be deleted." });
        }
        await target.deleteOne();
        return res.status(200).json({ success: true, message: "Restaurant account permanently deleted by Admin." });
    } catch (error) {
        console.error("🔴 ADMIN DELETE USER ERROR:", error);
        return res.status(500).json({ success: false, message: "Error deleting account." });
    }
});

// ==========================================
// 👥 STAFF ROUTES (Manager of that restaurant, or Admin)
// ==========================================
const STAFF_ROLES = ["Manager", "Waiter", "Kitchen Staff", "Cashier"];

const publicStaff = (s) => ({
    _id: s._id,
    id: s.id,
    staffName: s.staffName,
    role: s.role,
    restaurantName: s.restaurantName,
    isActive: s.isActive
});

// A non-admin may only touch staff of their own restaurant.
const findStaffInScope = async (req, mongoId) => {
    if (!mongoose.isValidObjectId(mongoId)) return null;
    const staff = await RestaurantStaff.findById(mongoId).select("+password");
    if (!staff) return null;
    if (!req.auth.isAdmin && staff.restaurantName !== req.auth.restaurantName) return null;
    return staff;
};

app.get("/api/admin/staff-by-restaurant/:restaurantName", requireAuth, requireManager, async (req, res) => {
    try {
        if (!req.auth.isAdmin && req.params.restaurantName !== req.auth.restaurantName) {
            return res.status(403).json({ success: false, message: "Not allowed." });
        }
        const staff = await RestaurantStaff.find({ restaurantName: req.params.restaurantName });
        res.status(200).json({ success: true, data: staff.map(publicStaff) });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error fetching staff" });
    }
});

app.post("/api/staff/create", requireAuth, requireManager, async (req, res) => {
    try {
        const b = req.body || {};
        const restaurantName = req.auth.isAdmin 
    ? str(b.restaurantName || b.RESTAURANTName) 
    : req.auth.restaurantName;
        const id = str(b.id);
        const staffName = str(b.staffName);
        const role = str(b.role);

        if (!restaurantName || !id || !staffName || !b.password) {
            return res.status(400).json({ success: false, message: "Staff name, ID and password are required." });
        }
        if (!STAFF_ROLES.includes(role)) {
            return res.status(400).json({ success: false, message: `Role must be one of: ${STAFF_ROLES.join(", ")}.` });
        }
        const pwError = validateNewPassword(b.password);
        if (pwError) return res.status(400).json({ success: false, message: pwError });

        if (!(await RestaurantUser.exists({ restaurantName }))) {
            return res.status(404).json({ success: false, message: "Restaurant not found." });
        }
        if (await RestaurantStaff.exists({ restaurantName, id })) {
            return res.status(400).json({ success: false, message: "A staff member with this ID already exists." });
        }

        const created = await RestaurantStaff.create({
            staffName,
            restaurantName,
            id,
            role,
            password: await hashPassword(b.password),
            isActive: b.isActive !== false
        });
        res.status(201).json({ success: true, message: "Staff created", data: publicStaff(created) });
    } catch (error) {
        console.error("🔴 STAFF CREATE ERROR:", error);
        res.status(500).json({ success: false, message: "Creation failed" });
    }
});

app.put("/api/staff/:id", requireAuth, requireManager, async (req, res) => {
    try {
        const staff = await findStaffInScope(req, req.params.id);
        if (!staff) return res.status(404).json({ success: false, message: "Staff member not found" });

        const b = req.body || {};
        const isSelf = String(staff._id) === req.auth.staffId;

        if (str(b.staffName)) staff.staffName = str(b.staffName);

        if (str(b.id) && str(b.id) !== staff.id) {
            if (await RestaurantStaff.exists({ restaurantName: staff.restaurantName, id: str(b.id) })) {
                return res.status(400).json({ success: false, message: "That staff ID is already taken." });
            }
            staff.id = str(b.id);
        }
        if (b.role !== undefined) {
            if (!STAFF_ROLES.includes(str(b.role))) {
                return res.status(400).json({ success: false, message: "Invalid role." });
            }
            if (isSelf && str(b.role) !== staff.role) {
                return res.status(400).json({ success: false, message: "You cannot change your own role." });
            }
            staff.role = str(b.role);
        }
        if (b.isActive !== undefined) {
            if (isSelf && b.isActive !== true) {
                return res.status(400).json({ success: false, message: "You cannot deactivate your own account." });
            }
            staff.isActive = b.isActive === true;
        }
        if (b.password) {
            const pwError = validateNewPassword(b.password);
            if (pwError) return res.status(400).json({ success: false, message: pwError });
            staff.password = await hashPassword(b.password);
        }

        await staff.save();
        res.status(200).json({ success: true, data: publicStaff(staff) });
    } catch (err) {
        console.error("🔴 STAFF UPDATE ERROR:", err);
        res.status(400).json({ success: false, message: "Could not update staff member." });
    }
});

app.delete("/api/staff/:id", requireAuth, requireManager, async (req, res) => {
    try {
        const staff = await findStaffInScope(req, req.params.id);
        if (!staff) return res.status(404).json({ success: false, message: "Staff member not found" });
        if (String(staff._id) === req.auth.staffId) {
            return res.status(400).json({ success: false, message: "You cannot delete your own account." });
        }
        await staff.deleteOne();
        res.status(200).json({ success: true, message: "Staff member deleted successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to delete staff" });
    }
});

// Placeholder so the dashboard's customer lookup does not fail (no customer feature yet).
app.get("/api/customers", (req, res) => {
    res.json({ success: true, data: [] });
});

// ==========================================
// Fallbacks
// ==========================================
app.use("/api", (req, res) => {
    res.status(404).json({ success: false, message: "API route not found." });
});

// Central error handler: never leak stack traces or internals to the browser.
app.use((err, req, res, next) => {
    if (err && err.message && err.message.startsWith("CORS")) {
        return res.status(403).json({ success: false, message: "Origin not allowed." });
    }
    // Bad JSON, body too large, etc. are the client's fault, not a server crash.
    if (err && err.status >= 400 && err.status < 500) {
        return res.status(err.status).json({
            success: false,
            message: err.type === "entity.too.large" ? "Request body is too large." : "Invalid request."
        });
    }
    console.error("🔴 UNHANDLED ERROR:", err);
    res.status(500).json({ success: false, message: "Something went wrong on the server." });
});

// Start the server ONLY after the database is connected.


conectDb()
    .then(async () => {
        // Automatically drop the old single-field index if it exists
        try {
            await mongoose.connection.collection('qrconfigs').dropIndex('restaurantName_1');
            console.log('✅ Old restaurantName_1 index dropped successfully.');
        } catch (err) {
            // Index already dropped or doesn't exist — safe to ignore
        }

        app.listen(Number(PORT), "0.0.0.0", () => {
            console.log(`✅ RMS server running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error("❌ Server not started: database connection failed.", err);
        process.exit(1);
    });


    