// =====================================================================
// CUSTOMER WEBSITE API — no login needed (like the table-QR menu).
// URL:  /api/online/...
// Safety rules:
//   1. The restaurant comes from the link (its database _id) and is checked
//      to exist, be active and have a valid subscription.
//   2. Menu items, add-ons and PRICES are always read from the database.
//      The browser only says "item X, quantity 2".
//   3. A customer can only see an order if they know its secret tracking code.
// =====================================================================
const express = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");

const RestaurantUser = require("../models/login");
const Menu = require("../models/menu");
const QrConfig = require("../models/QrConfig");
const DeliveryOrder = require("../models/deliveryOrder");
const DeliveryMenuExtra = require("../models/deliveryMenuExtra");
const Rider = require("../models/rider");
const core = require("../utils/deliveryCore");
const realtime = require("../utils/realtime");
const { isExpired } = require("../utils/subscription");
const { makeDynamicPayload, renderQR, isEmvPayload } = require("../utils/fonepayDynamicQr");
const { getProvider } = require("../utils/paymentProviders");

const router = express.Router();

const orderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many orders from this device. Please wait a few minutes." },
});

// General limit for every public page call (menu, price check, tracking, QR) so nobody can hammer the database.
// 300/minute per IP is generous: many phones can share one mobile-network IP address.
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please slow down a little." },
});
router.use(readLimiter);

async function findRestaurant(key) {
  if (!mongoose.isValidObjectId(key)) return null;
  const r = await RestaurantUser.findById(key)
    .select("id restaurantName location phone isActive isAdmin totalTime remainingTime lastTimeSync createdAt")
    .lean();
  if (!r || !r.isActive || r.isAdmin || isExpired(r)) return null;
  return r;
}
const notFound = (res) => res.status(404).json({ success: false, message: "This restaurant link is not valid." });

// Settings the customer is allowed to see (never internal counters)
const publicSettings = (s) => ({
  acceptingOrders: s.acceptingOrders,
  acceptCOD: s.acceptCOD,
  acceptOnline: s.acceptOnline,
  onlinePaymentNote: s.onlinePaymentNote,
  baseCharge: s.baseCharge,
  minOrderAmount: s.minOrderAmount,
  freeDeliveryAbove: s.freeDeliveryAbove,
  radiusKm: s.radiusKm,
  restaurantLat: s.restaurantLat,
  restaurantLng: s.restaurantLng,
  estimatedPrepMinutes: s.estimatedPrepMinutes,
  areas: (s.areas || []).filter((a) => a.active !== false).map((a) => ({ _id: String(a._id), name: a.name, charge: a.charge, minOrder: a.minOrder })),
});

const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : "");

// Wallets that have a QR uploaded in RMS → Settings → QR (same list the Create Bill page uses)
const WALLET_ORDER = ["eSewa", "Khalti", "Fonepay"];
async function configuredProviders(restaurantId) {
  const rows = await QrConfig.find({ restaurantId }).select("providerName").lean();
  const names = [...new Set(rows.map((r) => r.providerName))];
  const rank = (n) => (WALLET_ORDER.indexOf(n) === -1 ? 99 : WALLET_ORDER.indexOf(n));
  return names.sort((a, b) => rank(a) - rank(b));
}

// ---------------------------------------------------------------------
// TRACKING (declared first so "track" is never mistaken for a restaurant key)
// ---------------------------------------------------------------------
async function loadByToken(token) {
  if (typeof token !== "string" || token.length < 10 || token.length > 64) return null;
  return DeliveryOrder.findOne({ trackingToken: token });
}

async function trackingView(order) {
  const restaurant = await RestaurantUser.findOne({ id: order.restaurantId }).select("restaurantName phone location").lean();
  const view = core.publicOrderView(order.toObject ? order.toObject() : order, restaurant);
  if (view.restaurant && restaurant) view.restaurant.key = String(restaurant._id); // so "Order again" can link back to the menu
  const settings = await core.getSettings(order.restaurantId);
  view.cancelWindow = settings.customerCancelWindow || "Confirmed"; // the tracking page uses this to show/hide Cancel
  if (order.riderId && order.status === "OutForDelivery" && mongoose.isValidObjectId(order.riderId)) {
    const rider = await Rider.findOne({ _id: order.riderId, restaurantId: order.restaurantId }).select("lastLocation").lean();
    if (rider?.lastLocation?.lat != null) view.riderLocation = rider.lastLocation;
  }
  return view;
}

router.get("/track/:token", async (req, res) => {
  try {
    const order = await loadByToken(req.params.token);
    if (!order) return res.status(404).json({ success: false, message: "Order not found. Check your tracking link." });
    return res.json({ success: true, data: await trackingView(order) });
  } catch (e) {
    console.error("🔴 TRACK ERROR:", e);
    return res.status(500).json({ success: false, message: "Could not load your order." });
  }
});

// Customer cancels their own order. The restaurant decides HOW LONG this is allowed
// (Delivery → Settings → "Customer can cancel online"). The rule is enforced here on the server.
router.post("/track/:token/cancel", async (req, res) => {
  try {
    const order = await loadByToken(req.params.token);
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });

    const settings = await core.getSettings(order.restaurantId);
    const allowed = core.customerCancelableStatuses(settings.customerCancelWindow);

    if (!allowed.includes(order.status)) {
      let message = "Your food is already being prepared, so it can no longer be cancelled online. Please call the restaurant.";
      if (order.status === "Cancelled") message = "This order is already cancelled.";
      else if (order.status === "Delivered") message = "This order has already been delivered.";
      else if (allowed.length === 0) message = "Online cancellation is not available. Please call the restaurant.";
      else if (["Assigned", "OutForDelivery"].includes(order.status)) message = "Your order is already on its way, so it can no longer be cancelled online. Please call the restaurant.";
      return res.status(400).json({ success: false, message });
    }

    const reason = core.cleanText(req.body?.reason, 150) || "No reason given";
    const wasPaid = order.paymentStatus === "Paid";
    core.applyStatus(order, "Cancelled", "Customer", `Customer: ${reason}`);
    await order.save();
    await core.syncKitchenTicket(order); // also cancels the ticket on the Kitchen Display

    const plain = order.toObject();
    realtime.emitToRestaurant(order.restaurantId, "delivery:order", { type: "updated", order: plain });
    const view = await trackingView(order);
    realtime.emitToTracking(order.trackingToken, "delivery:update", view);
    return res.json({ success: true, data: view, needsRefund: wasPaid });
  } catch (e) {
    if (e.name === "VersionError") {
      return res.status(409).json({ success: false, message: "The restaurant just updated your order. Please refresh the page and try again." });
    }
    console.error("🔴 CUSTOMER CANCEL ERROR:", e);
    return res.status(500).json({ success: false, message: "Could not cancel the order." });
  }
});

// Payment QR for "Online" orders — same dynamic QR as the Create Bill page.
// GET /track/:token/pay-qr?provider=eSewa   (provider is optional)
router.get("/track/:token/pay-qr", async (req, res) => {
  try {
    const order = await loadByToken(req.params.token);
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });

    const providers = await configuredProviders(order.restaurantId);
    if (order.paymentMethod !== "Online" || order.paymentStatus === "Paid" || order.status === "Cancelled") {
      return res.json({ success: true, image: null, providers });
    }

    // Use the wallet the customer asked for, else the one they chose when ordering, else the first one set up
    const wanted = (typeof req.query.provider === "string" ? req.query.provider : "").trim().toLowerCase();
    const chosen =
      providers.find((p) => p.toLowerCase() === wanted) ||
      providers.find((p) => p.toLowerCase() === String(order.paymentProvider || "").toLowerCase()) ||
      providers[0];
    if (!chosen) return res.json({ success: true, image: null, providers });

    // 🔑 always this order's own restaurant
    const cfg = await QrConfig.findOne({ restaurantId: order.restaurantId, providerName: chosen });
    if (!cfg) return res.json({ success: true, image: null, providers });

    const payload = makeDynamicPayload(cfg.staticPayload, { amount: order.totalAmount, billNo: order.orderNo });
    const image = await renderQR(payload);

    // Remember which wallet was used, so staff know where to check the money
    if (order.paymentProvider !== chosen) await DeliveryOrder.updateOne({ _id: order._id }, { $set: { paymentProvider: chosen } });

    // amountIncluded=false means a personal QR: the customer must type the amount (we tell them how much)
    return res.json({ success: true, image, providerName: chosen, providers, amountIncluded: isEmvPayload(cfg.staticPayload), amount: order.totalAmount, orderNo: order.orderNo });
  } catch (e) {
    console.error("🔴 PAY QR ERROR:", e);
    return res.json({ success: true, image: null, providers: [] });
  }
});

// ---------------------------------------------------------------------
// MENU for the website
// ---------------------------------------------------------------------
router.get("/:restaurantKey/menu", async (req, res) => {
  try {
    const restaurant = await findRestaurant(req.params.restaurantKey);
    if (!restaurant) return notFound(res);

    const settings = await core.getSettings(restaurant.id);
    const items = await Menu.find({
      restaurantId: restaurant.id,
      status: mongoose.trusted({ $in: ["Available", "Sold Out"] }),
    })
      .select("itemName description category price status isCombo comboItems imageUrl")
      .sort({ category: 1, itemName: 1 })
      .lean();

    const extras = await DeliveryMenuExtra.find({ restaurantId: restaurant.id }).lean();
    const extraById = new Map(extras.map((e) => [String(e.menuItemId), e]));

    const menu = items
      .filter((m) => extraById.get(String(m._id))?.deliveryEnabled !== false)
      .map((m) => {
        const x = extraById.get(String(m._id));
        return {
          _id: m._id,
          itemName: m.itemName,
          description: m.description,
          category: m.category,
          price: m.price,
          available: m.status === "Available",
          isCombo: m.isCombo,
          comboItems: (m.comboItems || []).map((c) => ({ itemName: c.itemName, quantity: c.quantity })),
          imageUrl: safeUrl(m.imageUrl), // 📷 photo from the Menu page
          addons: (x?.addons || []).filter((a) => a.isAvailable !== false).map((a) => ({ name: a.name, price: a.price })),
        };
      });

    return res.json({
      success: true,
      data: {
        restaurant: { name: restaurant.restaurantName, location: restaurant.location, phone: restaurant.phone },
                settings: publicSettings(settings),
        payProviders: await configuredProviders(restaurant.id), // wallets the customer can pick
        menu,
      },
    });
  } catch (e) {
    console.error("🔴 ONLINE MENU ERROR:", e);
    return res.status(500).json({ success: false, message: "Could not load the menu." });
  }
});

// ---------------------------------------------------------------------
// QUOTE: "how much will this cost?" (used live in the cart)
// ---------------------------------------------------------------------
router.post("/:restaurantKey/quote", async (req, res) => {
  try {
    const restaurant = await findRestaurant(req.params.restaurantKey);
    if (!restaurant) return notFound(res);
    const settings = await core.getSettings(restaurant.id);
    const q = await core.buildQuote({
      restaurantId: restaurant.id,
      settings,
      cart: req.body?.items,
      areaId: req.body?.areaId,
      lat: Number(req.body?.lat),
      lng: Number(req.body?.lng),
    });
    return res.json({ success: true, data: q });
  } catch (e) {
    console.error("🔴 QUOTE ERROR:", e);
    return res.status(500).json({ success: false, message: "Could not calculate the total." });
  }
});

// ---------------------------------------------------------------------
// PLACE ORDER
// ---------------------------------------------------------------------
router.post("/:restaurantKey/orders", orderLimiter, async (req, res) => {
  try {
    const restaurant = await findRestaurant(req.params.restaurantKey);
    if (!restaurant) return notFound(res);

    const settings = await core.getSettings(restaurant.id);
    if (!settings.acceptingOrders) {
      return res.status(403).json({ success: false, message: "Online ordering is paused right now. Please try again later." });
    }

    const b = req.body || {};
    const name = core.cleanText(b.name, 60);
    const phone = core.cleanText(b.phone, 20).replace(/[^\d+]/g, "");
    const address = core.cleanText(b.address, 250);
    const landmark = core.cleanText(b.landmark, 120);
    const orderNote = core.cleanText(b.orderNote, 300);
    const paymentMethod = b.paymentMethod === "Online" ? "Online" : b.paymentMethod === "COD" ? "COD" : "";
    const lat = Number(b.lat);
    const lng = Number(b.lng);

    if (name.length < 2) return res.status(400).json({ success: false, message: "Please enter your name." });
    if (phone.replace(/\D/g, "").length < 7) return res.status(400).json({ success: false, message: "Please enter a valid phone number." });
    if (address.length < 5) return res.status(400).json({ success: false, message: "Please enter your delivery address." });
    if (!paymentMethod) return res.status(400).json({ success: false, message: "Please choose a payment method." });
    if (paymentMethod === "COD" && !settings.acceptCOD) return res.status(400).json({ success: false, message: "Cash on Delivery is not available." });
    if (paymentMethod === "Online" && !settings.acceptOnline) return res.status(400).json({ success: false, message: "Online payment is not available." });

        // Online payment: the customer must pick one of the wallets the restaurant has set up
    let paymentProvider = "";
    if (paymentMethod === "Online") {
      const providers = await configuredProviders(restaurant.id);
      if (providers.length > 0) {
        const wanted = core.cleanText(b.paymentProvider, 30).toLowerCase();
        paymentProvider = providers.find((p) => p.toLowerCase() === wanted) || "";
        if (!paymentProvider) return res.status(400).json({ success: false, message: `Please choose how you want to pay: ${providers.join(", ")}.` });
      } else {
        paymentProvider = "manual"; // restaurant has no QR yet → customer follows the payment note
      }
    }

    const quote = await core.buildQuote({ restaurantId: restaurant.id, settings, cart: b.items, areaId: b.areaId, lat, lng });
    if (!quote.ok) return res.status(400).json({ success: false, message: quote.errors[0], errors: quote.errors });

    // Double-tap protection: same phone + same total within 60 seconds → give back the order we already made
    const dup = await DeliveryOrder.findOne({
      restaurantId: restaurant.id,
      "customer.phone": phone,
      totalAmount: quote.totalAmount,
      status: "Pending",
      createdAt: mongoose.trusted({ $gt: new Date(Date.now() - 60 * 1000) }),
    });
    if (dup) {
      return res.status(200).json({
        success: true,
        message: "Order already placed.",
        data: { orderNo: dup.orderNo, trackingToken: dup.trackingToken, totalAmount: dup.totalAmount, paymentMethod: dup.paymentMethod, paymentProvider: dup.paymentProvider, payment: null },
      });
    }

    const orderNo = await core.nextOrderNo(restaurant.id);
    const hasPin = core.validCoord(lat, lng);

    const order = await DeliveryOrder.create({
      restaurantId: restaurant.id, // 🔑 from the database, not from the browser
      orderNo,
      trackingToken: core.newTrackingToken(),
      customer: {
        name, phone, address, landmark,
        area: quote.area?.name || "",
        lat: hasPin ? lat : null,
        lng: hasPin ? lng : null,
      },
      items: quote.lines,
      orderNote,
      subTotal: quote.subTotal,
      deliveryCharge: quote.deliveryCharge,
      totalAmount: quote.totalAmount,
      paymentMethod,
      paymentStatus: paymentMethod === "Online" ? "Pending" : "Unpaid",
           paymentProvider,
      status: "Pending",
      statusHistory: [{ status: "Pending", at: new Date(), by: "Customer" }],
      etaMinutes: (settings.estimatedPrepMinutes || 30) + 15,
      source: "website",
    });

    const payment = paymentMethod === "Online" ? await getProvider("manual").start(order) : null;

    // 🔔 Tell the restaurant instantly
    realtime.emitToRestaurant(restaurant.id, "delivery:order", { type: "created", order: order.toObject() });

    return res.status(201).json({
      success: true,
      message: "Order placed!",
      data: {
        orderNo: order.orderNo,
        trackingToken: order.trackingToken,
        totalAmount: order.totalAmount,
           paymentMethod,
        paymentProvider,
        payment,
      },
    });
  } catch (e) {
    console.error("🔴 ONLINE ORDER ERROR:", e);
    return res.status(500).json({ success: false, message: "Could not place your order. Please try again." });
  }
});

module.exports = router;