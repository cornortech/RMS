// =====================================================================
// PUBLIC ROUTES — used by customers who scan the table QR code.
// No login here, so every request is checked against the database:
//   1. the restaurant in the URL must exist and be active
//   2. the table in the URL must belong to THAT restaurant
// Only then do we return that restaurant's menu. A customer can never
// see another restaurant's menu, because the menu is looked up using the
// restaurant ID we read from the database, not anything the phone sends.
// =====================================================================
const express = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");

const RestaurantUser = require("../models/login");
const Table = require("../models/table");
const Menu = require("../models/menu");
const WaiterCall = require("../models/waiterCall");

const router = express.Router();

// Stop someone spamming the "Call Waiter" button (20 calls / 5 min per phone IP)
const callLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please wait a moment." },
});

// Finds the restaurant + table from the QR link, or returns null if anything is wrong.
async function findRestaurantAndTable(restaurantKey, tableId) {
  if (!mongoose.isValidObjectId(restaurantKey) || !mongoose.isValidObjectId(tableId)) return null;

  const restaurant = await RestaurantUser.findById(restaurantKey)
    .select("id restaurantName location phone isActive")
    .lean();
  if (!restaurant || !restaurant.isActive) return null;

  // The table must belong to this restaurant — this is the key safety check.
  const table = await Table.findOne({ _id: tableId, restaurantId: restaurant.id })
    .select("tableName restaurantId")
    .lean();
  if (!table) return null;

  return { restaurant, table };
}

// ---------------------------------------------------------------------
// GET /api/public/menu/:restaurantKey/:tableId
// Returns restaurant name, table name and the menu for the customer page.
// ---------------------------------------------------------------------
router.get("/menu/:restaurantKey/:tableId", async (req, res) => {
  try {
    const found = await findRestaurantAndTable(req.params.restaurantKey, req.params.tableId);
    if (!found) {
      return res.status(404).json({ success: false, message: "This QR code is not valid." });
    }
    const { restaurant, table } = found;

    // Hide items the restaurant switched off; show "Sold Out" items with a label.
    const items = await Menu.find({
      restaurantId: restaurant.id,
            status: mongoose.trusted({ $in: ["Available", "Sold Out"] }),
    })
      .select("itemName description category price status isCombo comboItems imageUrl")
      .sort({ category: 1, itemName: 1 })
      .lean();

    return res.json({
      success: true,
      data: {
        restaurantName: restaurant.restaurantName,
        location: restaurant.location,
        tableName: table.tableName,
        menu: items.map((m) => ({
          _id: m._id,
          itemName: m.itemName,
          description: m.description,
          category: m.category,
          price: m.price,
          status: m.status,
          isCombo: m.isCombo,
          imageUrl: m.imageUrl || "",
          comboItems: (m.comboItems || []).map((c) => ({ itemName: c.itemName, quantity: c.quantity })),
        })),
      },
    });
  } catch (err) {
    console.error("🔴 PUBLIC MENU ERROR:", err);
    return res.status(500).json({ success: false, message: "Could not load the menu." });
  }
});

// ---------------------------------------------------------------------
// POST /api/public/call-waiter   body: { restaurantKey, tableId }
// Creates a notification for that restaurant's staff.
// ---------------------------------------------------------------------
router.post("/call-waiter", callLimiter, async (req, res) => {
  try {
    const restaurantKey = typeof req.body?.restaurantKey === "string" ? req.body.restaurantKey : "";
    const tableId = typeof req.body?.tableId === "string" ? req.body.tableId : "";

    const found = await findRestaurantAndTable(restaurantKey, tableId);
    if (!found) {
      return res.status(404).json({ success: false, message: "This QR code is not valid." });
    }
    const { restaurant, table } = found;

    // If this table already has a waiting call from the last 2 minutes, don't create a duplicate.
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const existing = await WaiterCall.findOne({
      restaurantId: restaurant.id,
      tableId: String(table._id),
      status: "Pending",
      createdAt: mongoose.trusted({ $gte: twoMinutesAgo }),
    }).lean();

    if (existing) {
      return res.json({ success: true, alreadyCalled: true, message: "A waiter has already been called. Please wait." });
    }

    await WaiterCall.create({
      restaurantId: restaurant.id,
      tableId: String(table._id),
      tableName: table.tableName,
    });

    return res.status(201).json({ success: true, message: "A waiter is on the way!" });
  } catch (err) {
    console.error("🔴 CALL WAITER ERROR:", err);
    return res.status(500).json({ success: false, message: "Could not call the waiter. Please try again." });
  }
});

module.exports = router;