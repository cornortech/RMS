// =====================================================================
// DELIVERY — STAFF / ADMIN API   (/api/delivery/...)
// Mounted AFTER requireAuth, so req.auth is always set.
// EVERY query below uses req.auth.restaurantId (from the login token), never a
// restaurantId sent by the browser → a restaurant only ever sees its own data.
// =====================================================================
const express = require("express");
const mongoose = require("mongoose");
const QRCode = require("qrcode");

const Menu = require("../models/menu");
const Rider = require("../models/rider");
const DeliveryOrder = require("../models/deliveryOrder");
const DeliverySetting = require("../models/deliverySettings");
const DeliveryMenuExtra = require("../models/deliveryMenuExtra");
const core = require("../utils/deliveryCore");
const realtime = require("../utils/realtime");
const { hashPassword } = require("../utils/password");

const router = express.Router();

const MANAGER = ["Manager"];
const FRONT = ["Manager", "Waiter", "Cashier"]; // people who deal with customers
const KITCHEN = ["Kitchen Staff"];

// Same rule as the rest of your app: Admin, or a signed-in staff member with the right role.
const only = (...roles) => (req, res, next) =>
  req.auth?.isAdmin || (req.auth?.kind === "staff" && roles.includes(req.auth.role))
    ? next()
    : res.status(403).json({ success: false, message: "Your role is not allowed to do this." });

const rid = (req) => req.auth.restaurantId;
const bad = (res, msg, code = 400) => res.status(code).json({ success: false, message: msg });
const fail = (res, e, where) => {
  console.error(`🔴 DELIVERY ${where}:`, e);
  return res.status(500).json({ success: false, message: "Something went wrong." });
};
const who = (req) => (req.auth.kind === "staff" ? req.auth.role || "Staff" : "Owner");

const getAppUrl = () => {
  const fromEnv = (process.env.PUBLIC_APP_URL || "").trim();
  const fallback = (process.env.ALLOWED_ORIGINS || "https://rms-seven-neon.vercel.app").split(",")[0].trim();
  return (fromEnv || fallback).replace(/\/+$/, "");
};

// Tell everybody who should know that an order changed.
async function broadcast(order, type = "updated") {
  const plain = order.toObject ? order.toObject() : order;
  realtime.emitToRestaurant(plain.restaurantId, "delivery:order", { type, order: plain });
  realtime.emitToTracking(plain.trackingToken, "delivery:update", core.publicOrderView(plain));
  if (plain.riderId) realtime.emitToRider(plain.riderId, "delivery:assigned", { orderId: String(plain._id), status: plain.status });
}

async function findMyOrder(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    bad(res, "Invalid id.");
    return null;
  }
  const order = await DeliveryOrder.findOne({ _id: req.params.id, restaurantId: rid(req) });
  if (!order) bad(res, "Order not found.", 404);
  return order;
}

// ---------------------------------------------------------------------
// LINKS (share these with customers and riders)
// ---------------------------------------------------------------------
router.get("/links", async (req, res) => {
  try {
    const base = getAppUrl();
    const orderUrl = `${base}/order/${req.auth.uid}`;
    const riderUrl = `${base}/rider/${req.auth.uid}`;
    const qrImage = await QRCode.toDataURL(orderUrl, { width: 360, margin: 2, errorCorrectionLevel: "M" });
    res.json({ success: true, data: { orderUrl, riderUrl, qrImage, restaurantName: req.auth.restaurantName } });
  } catch (e) {
    fail(res, e, "LINKS");
  }
});

// ---------------------------------------------------------------------
// ORDERS
// GET /orders?view=active|history|all  &q=search  &limit=
// ---------------------------------------------------------------------
router.get("/orders", async (req, res) => {
  try {
    const view = typeof req.query.view === "string" ? req.query.view : "active";
    const filter = { restaurantId: rid(req) };
    if (view === "active") filter.status = mongoose.trusted({ $in: core.ACTIVE });
    else if (view === "history") filter.status = mongoose.trusted({ $in: core.FINAL });

    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 40) : "";
    if (q) {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      filter.$or = [{ orderNo: mongoose.trusted({ $regex: rx }) }, { "customer.name": mongoose.trusted({ $regex: rx }) }, { "customer.phone": mongoose.trusted({ $regex: rx }) }];
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 150, 1), 300);
    const orders = await DeliveryOrder.find(filter).sort({ createdAt: -1 }).limit(limit).lean();

    const counts = await DeliveryOrder.aggregate([
      { $match: { restaurantId: rid(req), status: { $in: core.ACTIVE } } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map((c) => [c._id, c.n]));

    res.json({ success: true, data: orders, counts: countMap });
  } catch (e) {
    fail(res, e, "LIST");
  }
});

router.get("/orders/:id", async (req, res) => {
  try {
    const order = await findMyOrder(req, res);
    if (order) res.json({ success: true, data: order });
  } catch (e) {
    fail(res, e, "GET");
  }
});

// Accept, Reject, Start Preparing, Mark Ready, Out for delivery, Complete, Cancel
router.patch("/orders/:id/status", async (req, res) => {
  try {
    const to = req.body?.status;
    if (!core.TRANSITIONS[to]) return bad(res, "Unknown status.");

    // Kitchen staff may only do the kitchen steps; front staff & managers can do everything.
    const allowed = to === "Preparing" || to === "Ready" ? [...FRONT, ...KITCHEN] : FRONT;
    if (!(req.auth.isAdmin || (req.auth.kind === "staff" && allowed.includes(req.auth.role)))) {
      return bad(res, "Your role is not allowed to do this.", 403);
    }
    if (to === "Assigned") return bad(res, "Use the Assign Rider button to assign a rider.");

    const order = await findMyOrder(req, res);
    if (!order) return;
    if (!core.canMove(order.status, to)) return bad(res, `You cannot change "${order.status}" to "${to}".`);

    const reason = core.cleanText(req.body?.reason, 200);
    if (to === "Cancelled" && !reason) return bad(res, "Please write a reason for cancelling.");

    const oldRider = order.riderId;
    core.applyStatus(order, to, who(req), reason);
    await order.save();

    const settings = await core.getSettings(rid(req));
    if (to === "Confirmed" && settings.sendToKitchen !== false) await core.createKitchenTicket(order);
    else await core.syncKitchenTicket(order);

    if (oldRider) await core.refreshRiderStatus(rid(req), oldRider);
    await broadcast(order);
    res.json({ success: true, data: order });
  } catch (e) {
    fail(res, e, "STATUS");
  }
});

router.post("/orders/:id/assign", only(...FRONT), async (req, res) => {
  try {
    const riderId = String(req.body?.riderId || "");
    if (!mongoose.isValidObjectId(riderId)) return bad(res, "Choose a rider.");

    const order = await findMyOrder(req, res);
    if (!order) return;
    if (!["Ready", "Assigned"].includes(order.status)) return bad(res, "Mark the order as Ready before assigning a rider.");

    const rider = await Rider.findOne({ _id: riderId, restaurantId: rid(req), isActive: true });
    if (!rider) return bad(res, "Rider not found.", 404);
    if (rider.status === "Offline") return bad(res, `${rider.name} is offline. Choose an available rider.`);

    const previous = order.riderId;
    order.riderId = String(rider._id);
    order.riderName = rider.name;
    order.riderPhone = rider.phone;
    if (order.status !== "Assigned") core.applyStatus(order, "Assigned", who(req), `Rider: ${rider.name}`);
    else order.statusHistory.push({ status: "Assigned", at: new Date(), by: who(req), note: `Reassigned to ${rider.name}` });
    await order.save();

    await core.syncKitchenTicket(order);
    await core.refreshRiderStatus(rid(req), String(rider._id));
    if (previous && previous !== String(rider._id)) {
      await core.refreshRiderStatus(rid(req), previous);
      realtime.emitToRider(previous, "delivery:assigned", { orderId: String(order._id), status: "Unassigned" });
    }
    await broadcast(order);
    res.json({ success: true, data: order });
  } catch (e) {
    fail(res, e, "ASSIGN");
  }
});

// Online payments: staff confirm the money arrived.
router.patch("/orders/:id/payment", only(...FRONT), async (req, res) => {
  try {
    const next = req.body?.paymentStatus;
    if (!["Paid", "Unpaid", "Refunded"].includes(next)) return bad(res, "Invalid payment status.");
    const order = await findMyOrder(req, res);
    if (!order) return;
    order.paymentStatus = next;
    order.paymentRef = core.cleanText(req.body?.paymentRef, 80) || order.paymentRef;
    await order.save();
    await broadcast(order);
    res.json({ success: true, data: order });
  } catch (e) {
    fail(res, e, "PAYMENT");
  }
});

// ---------------------------------------------------------------------
// RIDERS
// ---------------------------------------------------------------------
const riderInput = (b) => ({
  name: core.cleanText(b.name, 60),
  phone: core.cleanText(b.phone, 20).replace(/[^\d+]/g, ""),
  address: core.cleanText(b.address, 200),
  vehicleType: ["Bike", "Scooter", "Bicycle", "Car", "Other"].includes(b.vehicleType) ? b.vehicleType : "Bike",
  vehicleNumber: core.cleanText(b.vehicleNumber, 30),
  vehicleModel: core.cleanText(b.vehicleModel, 40),
});

router.get("/riders", async (req, res) => {
  try {
    const riders = await Rider.find({ restaurantId: rid(req) }).sort({ createdAt: 1 }).lean();
    const loads = await DeliveryOrder.aggregate([
      { $match: { restaurantId: rid(req), status: { $in: ["Assigned", "OutForDelivery"] } } },
      { $group: { _id: "$riderId", n: { $sum: 1 } } },
    ]);
    const loadMap = Object.fromEntries(loads.map((l) => [l._id, l.n]));
    res.json({ success: true, data: riders.map((r) => ({ ...r, activeOrders: loadMap[String(r._id)] || 0 })) });
  } catch (e) {
    fail(res, e, "RIDERS");
  }
});

router.post("/riders", only(...MANAGER), async (req, res) => {
  try {
    const data = riderInput(req.body || {});
    const pin = typeof req.body?.pin === "string" ? req.body.pin : "";
    if (data.name.length < 2) return bad(res, "Rider name is required.");
    if (data.phone.replace(/\D/g, "").length < 7) return bad(res, "A valid phone number is required.");
    if (!/^\d{4,8}$/.test(pin)) return bad(res, "PIN must be 4 to 8 digits.");

    const rider = await Rider.create({ ...data, restaurantId: rid(req), pinHash: await hashPassword(pin), status: "Offline" });
    res.status(201).json({ success: true, data: { ...rider.toObject(), pinHash: undefined } });
  } catch (e) {
    if (e.code === 11000) return bad(res, "A rider with this phone number already exists.");
    fail(res, e, "RIDER CREATE");
  }
});

router.put("/riders/:id", only(...MANAGER), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return bad(res, "Invalid id.");
    const data = riderInput(req.body || {});
    if (data.name.length < 2 || data.phone.replace(/\D/g, "").length < 7) return bad(res, "Name and phone are required.");
    const update = { ...data };
    if (typeof req.body?.isActive === "boolean") update.isActive = req.body.isActive;
    if (req.body?.pin) {
      if (!/^\d{4,8}$/.test(String(req.body.pin))) return bad(res, "PIN must be 4 to 8 digits.");
      update.pinHash = await hashPassword(String(req.body.pin));
    }
    const rider = await Rider.findOneAndUpdate({ _id: req.params.id, restaurantId: rid(req) }, { $set: update }, { new: true });
    if (!rider) return bad(res, "Rider not found.", 404);
    res.json({ success: true, data: rider });
  } catch (e) {
    if (e.code === 11000) return bad(res, "Another rider already uses this phone number.");
    fail(res, e, "RIDER UPDATE");
  }
});

router.patch("/riders/:id/status", only(...FRONT), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return bad(res, "Invalid id.");
    const status = req.body?.status;
    if (!["Available", "Busy", "Offline"].includes(status)) return bad(res, "Invalid status.");
    const rider = await Rider.findOneAndUpdate({ _id: req.params.id, restaurantId: rid(req) }, { $set: { status } }, { new: true });
    if (!rider) return bad(res, "Rider not found.", 404);
    if (status !== "Offline") await core.refreshRiderStatus(rid(req), String(rider._id));
    res.json({ success: true, data: await Rider.findById(rider._id) });
  } catch (e) {
    fail(res, e, "RIDER STATUS");
  }
});

router.delete("/riders/:id", only(...MANAGER), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return bad(res, "Invalid id.");
    const busy = await DeliveryOrder.countDocuments({
      restaurantId: rid(req),
      riderId: req.params.id,
      status: mongoose.trusted({ $in: ["Assigned", "OutForDelivery"] }),
    });
    if (busy > 0) return bad(res, "This rider has active deliveries. Reassign them first.");
    const del = await Rider.findOneAndDelete({ _id: req.params.id, restaurantId: rid(req) });
    if (!del) return bad(res, "Rider not found.", 404);
    res.json({ success: true });
  } catch (e) {
    fail(res, e, "RIDER DELETE");
  }
});

// ---------------------------------------------------------------------
// SETTINGS (delivery areas, charges, minimum order, free delivery, radius)
// ---------------------------------------------------------------------
router.get("/settings", async (req, res) => {
  try {
    res.json({ success: true, data: await core.getSettings(rid(req)) });
  } catch (e) {
    fail(res, e, "SETTINGS GET");
  }
});

router.put("/settings", only(...MANAGER), async (req, res) => {
  try {
    const b = req.body || {};
    const money = (v, max = 1000000) => Math.min(Math.max(core.cleanNum(v, 0), 0), max);
    const coord = (v, limit) => {
      const n = Number(v);
      return v === "" || v === null || v === undefined || !Number.isFinite(n) || Math.abs(n) > limit ? null : n;
    };

    const areas = Array.isArray(b.areas)
      ? b.areas
          .slice(0, 100)
          .map((a) => ({
            ...(mongoose.isValidObjectId(a?._id) ? { _id: a._id } : {}),
            name: core.cleanText(a?.name, 60),
            charge: money(a?.charge),
            minOrder: money(a?.minOrder),
            active: a?.active !== false,
          }))
          .filter((a) => a.name)
      : [];

    const update = {
      acceptingOrders: b.acceptingOrders !== false,
      acceptCOD: b.acceptCOD !== false,
      acceptOnline: b.acceptOnline !== false,
      sendToKitchen: b.sendToKitchen !== false,
      customerCancelWindow: ["None", "Pending", "Confirmed", "Preparing"].includes(b.customerCancelWindow) ? b.customerCancelWindow : "Confirmed",
      onlinePaymentNote: core.cleanText(b.onlinePaymentNote, 300),
      baseCharge: money(b.baseCharge),
      minOrderAmount: money(b.minOrderAmount),
      freeDeliveryAbove: money(b.freeDeliveryAbove),
      radiusKm: money(b.radiusKm, 500),
      restaurantLat: coord(b.restaurantLat, 90),
      restaurantLng: coord(b.restaurantLng, 180),
      estimatedPrepMinutes: Math.min(Math.max(Math.round(core.cleanNum(b.estimatedPrepMinutes, 30)), 5), 240),
      areas,
    };
    if (!update.acceptCOD && !update.acceptOnline) return bad(res, "Turn on at least one payment method.");

    const saved = await DeliverySetting.findOneAndUpdate(
      { restaurantId: rid(req) },
      { $set: update, $setOnInsert: { restaurantId: rid(req) } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ success: true, data: saved });
  } catch (e) {
    fail(res, e, "SETTINGS PUT");
  }
});

// ---------------------------------------------------------------------
// ONLINE MENU EXTRAS (photo + add-ons per menu item)
// ---------------------------------------------------------------------
router.get("/menu-extras", async (req, res) => {
  try {
    const menu = await Menu.find({ restaurantId: rid(req) }).select("itemName category price status").sort({ category: 1, itemName: 1 }).lean();
    const extras = await DeliveryMenuExtra.find({ restaurantId: rid(req) }).lean();
    const byId = new Map(extras.map((e) => [String(e.menuItemId), e]));
    res.json({
      success: true,
      data: menu.map((m) => ({
        _id: String(m._id),
        itemName: m.itemName,
        category: m.category,
        price: m.price,
        status: m.status,
        imageUrl: byId.get(String(m._id))?.imageUrl || "",
        addons: byId.get(String(m._id))?.addons || [],
        deliveryEnabled: byId.get(String(m._id))?.deliveryEnabled !== false,
      })),
    });
  } catch (e) {
    fail(res, e, "EXTRAS GET");
  }
});

router.put("/menu-extras/:menuItemId", only(...MANAGER), async (req, res) => {
  try {
    const id = req.params.menuItemId;
    if (!mongoose.isValidObjectId(id)) return bad(res, "Invalid id.");
    // The menu item must belong to THIS restaurant
    const owns = await Menu.exists({ _id: id, restaurantId: rid(req) });
    if (!owns) return bad(res, "Menu item not found.", 404);

    const imageUrl = core.cleanText(req.body?.imageUrl, 500);
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) return bad(res, "Image link must start with http:// or https://");

    const addons = (Array.isArray(req.body?.addons) ? req.body.addons : [])
      .slice(0, 30)
      .map((a) => ({ name: core.cleanText(a?.name, 60), price: Math.min(Math.max(core.cleanNum(a?.price, 0), 0), 100000), isAvailable: a?.isAvailable !== false }))
      .filter((a) => a.name);

    const doc = await DeliveryMenuExtra.findOneAndUpdate(
      { restaurantId: rid(req), menuItemId: id },
      { $set: { imageUrl, addons, deliveryEnabled: req.body?.deliveryEnabled !== false } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ success: true, data: doc });
  } catch (e) {
    fail(res, e, "EXTRAS PUT");
  }
});

// ---------------------------------------------------------------------
// REPORTS   GET /reports?from=ISO&to=ISO&tz=Asia/Kathmandu
// ---------------------------------------------------------------------
router.get("/reports", async (req, res) => {
  try {
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(to.getTime() - 29 * 86400000);
    if (isNaN(from) || isNaN(to)) return bad(res, "Invalid dates.");
    if (to - from > 366 * 86400000) return bad(res, "Please choose a range of one year or less.");

    let tz = "UTC";
    try {
      const t = String(req.query.tz || "UTC");
      new Intl.DateTimeFormat("en", { timeZone: t });
      tz = t;
    } catch { /* keep UTC */ }

    const match = { restaurantId: rid(req), createdAt: { $gte: from, $lte: to } };

    const [byStatus, riderRows, daily] = await Promise.all([
      DeliveryOrder.aggregate([
        { $match: match },
        { $group: { _id: "$status", n: { $sum: 1 }, revenue: { $sum: "$totalAmount" }, charges: { $sum: "$deliveryCharge" } } },
      ]),
      DeliveryOrder.aggregate([
        { $match: { ...match, status: "Delivered", riderId: { $ne: "" } } },
        {
          $group: {
            _id: "$riderId",
            delivered: { $sum: 1 },
            revenue: { $sum: "$totalAmount" },
            charges: { $sum: "$deliveryCharge" },
            avgMinutes: {
              $avg: {
                $cond: [
                  { $and: [{ $ne: ["$deliveredAt", null] }, { $ne: ["$outForDeliveryAt", null] }] },
                  { $divide: [{ $subtract: ["$deliveredAt", "$outForDeliveryAt"] }, 60000] },
                  null,
                ],
              },
            },
          },
        },
        { $sort: { delivered: -1 } },
      ]),
      DeliveryOrder.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: tz } },
            orders: { $sum: 1 },
            delivered: { $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ["$status", "Cancelled"] }, 1, 0] } },
            revenue: { $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, "$totalAmount", 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const s = Object.fromEntries(byStatus.map((x) => [x._id, x]));
    const total = byStatus.reduce((a, x) => a + x.n, 0);
    const riders = await Rider.find({ restaurantId: rid(req) }).select("name phone vehicleType").lean();
    const riderById = new Map(riders.map((r) => [String(r._id), r]));

    res.json({
      success: true,
      data: {
        range: { from, to },
        totalDeliveries: total,
        completed: s.Delivered?.n || 0,
        cancelled: s.Cancelled?.n || 0,
        inProgress: total - (s.Delivered?.n || 0) - (s.Cancelled?.n || 0),
        deliveryRevenue: s.Delivered?.revenue || 0,
        deliveryChargesCollected: s.Delivered?.charges || 0,
        completionRate: total ? Math.round(((s.Delivered?.n || 0) / total) * 100) : 0,
        riders: riderRows.map((r) => ({
          riderId: r._id,
          name: riderById.get(r._id)?.name || "Removed rider",
          phone: riderById.get(r._id)?.phone || "",
          delivered: r.delivered,
          revenue: r.revenue,
          charges: r.charges,
          avgMinutes: r.avgMinutes == null ? null : Math.round(r.avgMinutes),
        })),
        daily: daily.map((d) => ({ date: d._id, orders: d.orders, delivered: d.delivered, cancelled: d.cancelled, revenue: d.revenue })),
      },
    });
  } catch (e) {
    fail(res, e, "REPORTS");
  }
});

module.exports = router;