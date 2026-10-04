// =====================================================================
// RIDER APP API — /api/rider-app
// Login with restaurant link + phone + PIN. Every query is filtered by the
// rider's own id AND restaurantId, so a rider only ever sees their own orders.
// =====================================================================
const express = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");

const RestaurantUser = require("../models/login");
const Rider = require("../models/rider");
const DeliveryOrder = require("../models/deliveryOrder");
const core = require("../utils/deliveryCore");
const realtime = require("../utils/realtime");
const { verifyPassword } = require("../utils/password");
const { isExpired } = require("../utils/subscription");
const { signRiderToken, requireRider } = require("../utils/riderAuth");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts. Please wait 15 minutes." },
});

// 2nd lock: per rider ACCOUNT (restaurant + phone). A 4-digit PIN has only 10,000 combinations,
// so without this someone could try many PINs from many different IP addresses.
const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${String(req.body?.restaurantKey || "").slice(0, 40)}:${String(req.body?.phone || "").replace(/[^\d+]/g, "").slice(0, 20)}`,
  message: { success: false, message: "Too many wrong attempts for this account. Please wait 15 minutes." },
});

const riderPublic = (r) => ({ _id: String(r._id), name: r.name, phone: r.phone, vehicleType: r.vehicleType, vehicleNumber: r.vehicleNumber, status: r.status });

router.post("/login", loginLimiter, accountLimiter, async (req, res) => {
  try {
    const restaurantKey = typeof req.body?.restaurantKey === "string" ? req.body.restaurantKey : "";
    const phone = core.cleanText(req.body?.phone, 20).replace(/[^\d+]/g, "");
    const pin = typeof req.body?.pin === "string" ? req.body.pin : "";
    const fail = () => res.status(401).json({ success: false, message: "Wrong phone number or PIN." });

    if (!mongoose.isValidObjectId(restaurantKey) || !phone || !pin) return fail();
    const restaurant = await RestaurantUser.findById(restaurantKey).select("id restaurantName isActive totalTime remainingTime lastTimeSync createdAt").lean();
    if (!restaurant || !restaurant.isActive || isExpired(restaurant)) return fail();

    const rider = await Rider.findOne({ restaurantId: restaurant.id, phone }).select("+pinHash");
    if (!rider || !rider.isActive || !(await verifyPassword(pin, rider.pinHash))) return fail();

    const token = signRiderToken({ rid: String(rider._id), restaurantId: restaurant.id });
    return res.json({ success: true, token, rider: riderPublic(rider), restaurantName: restaurant.restaurantName });
  } catch (e) {
    console.error("🔴 RIDER LOGIN ERROR:", e);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

router.use(requireRider);

router.get("/me", async (req, res) => {
  const restaurant = await RestaurantUser.findOne({ id: req.rider.restaurantId }).select("restaurantName").lean();
  res.json({ success: true, rider: riderPublic(req.rider), restaurantName: restaurant?.restaurantName || "" });
});

// Rider switches Available <-> Offline (Busy is automatic)
router.patch("/me/status", async (req, res) => {
  const next = req.body?.status;
  if (!["Available", "Offline"].includes(next)) return res.status(400).json({ success: false, message: "Invalid status." });
  req.rider.status = next;
  await req.rider.save();
  await core.refreshRiderStatus(req.rider.restaurantId, String(req.rider._id));
  const fresh = await Rider.findById(req.rider._id);
  res.json({ success: true, rider: riderPublic(fresh) });
});

router.get("/me/orders", async (req, res) => {
  try {
    const mine = { restaurantId: req.rider.restaurantId, riderId: String(req.rider._id) };
    const active = await DeliveryOrder.find({ ...mine, status: mongoose.trusted({ $in: ["Assigned", "OutForDelivery"] }) }).sort({ createdAt: 1 }).lean();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const done = await DeliveryOrder.find({ ...mine, status: "Delivered", deliveredAt: mongoose.trusted({ $gte: startOfDay }) }).sort({ deliveredAt: -1 }).limit(30).lean();
    res.json({
      success: true,
      active: active.map(core.riderOrderView),
      deliveredToday: done.map(core.riderOrderView),
      cashCollectedToday: done.filter((o) => o.paymentMethod === "COD").reduce((s, o) => s + o.totalAmount, 0),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "Could not load orders." });
  }
});

// Rider can only do: Assigned → OutForDelivery → Delivered
router.patch("/me/orders/:id/status", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid id." });
    const to = req.body?.status;
    if (!["OutForDelivery", "Delivered"].includes(to)) return res.status(400).json({ success: false, message: "You can only mark Out for delivery or Delivered." });

    const order = await DeliveryOrder.findOne({ _id: req.params.id, restaurantId: req.rider.restaurantId, riderId: String(req.rider._id) });
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });
    if (!core.canMove(order.status, to)) return res.status(400).json({ success: false, message: `This order is "${order.status}". You cannot change it to ${to}.` });

    core.applyStatus(order, to, `Rider: ${req.rider.name}`);
    await order.save();
    await core.syncKitchenTicket(order);
    await core.refreshRiderStatus(order.restaurantId, order.riderId);

    const plain = order.toObject();
    realtime.emitToRestaurant(order.restaurantId, "delivery:order", { type: "updated", order: plain });
    realtime.emitToTracking(order.trackingToken, "delivery:update", core.publicOrderView(plain));
    res.json({ success: true, order: core.riderOrderView(plain) });
  } catch (e) {
        if (e.name === "VersionError") return res.status(409).json({ success: false, message: "This order was just updated. Please refresh." });
    console.error("🔴 RIDER STATUS ERROR:", e);
    res.status(500).json({ success: false, message: "Could not update the order." });
  }
});

// Live GPS: the rider's phone sends its position every few seconds while delivering.
router.post("/me/location", async (req, res) => {
  try {
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (!core.validCoord(lat, lng)) return res.status(400).json({ success: false, message: "Invalid location." });

    req.rider.lastLocation = { lat, lng, updatedAt: new Date() };
    await req.rider.save();

    const orders = await DeliveryOrder.find({
      restaurantId: req.rider.restaurantId,
      riderId: String(req.rider._id),
      status: "OutForDelivery",
    }).select("trackingToken").lean();

    const payload = { lat, lng, updatedAt: req.rider.lastLocation.updatedAt };
    orders.forEach((o) => realtime.emitToTracking(o.trackingToken, "delivery:location", payload));
    realtime.emitToRestaurant(req.rider.restaurantId, "delivery:rider-location", { riderId: String(req.rider._id), ...payload });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: "Could not save location." });
  }
});

module.exports = router;