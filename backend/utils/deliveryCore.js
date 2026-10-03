// =====================================================================
// DELIVERY CORE — the "brain" shared by the customer website, the admin
// pages and the rider page. Keeping the rules in ONE place means every
// part of the system follows the same rules.
//   • price calculation (never trust prices sent by the browser!)
//   • delivery rules (areas, charges, minimum order, free delivery, radius)
//   • allowed status changes
//   • sending a copy of the order to the kitchen screen
// =====================================================================
const crypto = require("crypto");
const mongoose = require("mongoose");

const Menu = require("../models/menu");
const Order = require("../models/createOrder");
const DeliveryMenuExtra = require("../models/deliveryMenuExtra");
const DeliverySetting = require("../models/deliverySettings");
const DeliveryOrder = require("../models/deliveryOrder");
const Rider = require("../models/rider");

const FINAL = ["Delivered", "Cancelled"];
const ACTIVE = ["Pending", "Confirmed", "Preparing", "Ready", "Assigned", "OutForDelivery"];

// from → [allowed next statuses]
const TRANSITIONS = {
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["Preparing", "Cancelled"],
  Preparing: ["Ready", "Cancelled"],
  Ready: ["Assigned", "Cancelled"],
  Assigned: ["OutForDelivery", "Ready", "Cancelled"],
  OutForDelivery: ["Delivered", "Cancelled"],
  Delivered: [],
  Cancelled: [],
};
const canMove = (from, to) => (TRANSITIONS[from] || []).includes(to);

// Which statuses may the CUSTOMER cancel from, for each restaurant setting?
const CANCEL_WINDOWS = {
  None: [],
  Pending: ["Pending"],
  Confirmed: ["Pending", "Confirmed"],
  Preparing: ["Pending", "Confirmed", "Preparing"],
};
const customerCancelableStatuses = (window) => CANCEL_WINDOWS[window] || CANCEL_WINDOWS.Confirmed;

const roundMoney = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const cleanText = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const cleanNum = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const validCoord = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Settings for a restaurant (or sensible defaults if it never saved any).
async function getSettings(restaurantId) {
  const saved = await DeliverySetting.findOne({ restaurantId }).lean();
  if (saved) return saved;
  return new DeliverySetting({ restaurantId }).toObject();
}

// Short readable number, e.g. DLV-1001, DLV-1002 ... (counted per restaurant)
async function nextOrderNo(restaurantId) {
  const doc = await DeliverySetting.findOneAndUpdate(
    { restaurantId },
    { $inc: { orderSeq: 1 }, $setOnInsert: { restaurantId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  return `DLV-${1000 + doc.orderSeq}`;
}

const newTrackingToken = () => crypto.randomBytes(18).toString("base64url");

// ---------------------------------------------------------------------
// QUOTE: turns the cart into trusted prices.
// cart = [{ menuItemId, quantity, addons: ["Extra cheese"], note }]
// ---------------------------------------------------------------------
async function buildQuote({ restaurantId, settings, cart, areaId, lat, lng }) {
  const errors = [];

  if (!Array.isArray(cart) || cart.length === 0) return { ok: false, errors: ["Your cart is empty."] };
  if (cart.length > 40) return { ok: false, errors: ["Too many different items in one order."] };

  const ids = [...new Set(cart.map((c) => String(c?.menuItemId || "")).filter((id) => mongoose.isValidObjectId(id)))];
  if (ids.length === 0) return { ok: false, errors: ["Your cart has invalid items."] };

  // 🔑 Menu is looked up by THIS restaurant's id, so a customer can't order another restaurant's item.
  const menuDocs = await Menu.find({ restaurantId, _id: mongoose.trusted({ $in: ids }) }).lean();
  const extras = await DeliveryMenuExtra.find({ restaurantId, menuItemId: mongoose.trusted({ $in: ids }) }).lean();
  const menuById = new Map(menuDocs.map((m) => [String(m._id), m]));
  const extraById = new Map(extras.map((e) => [String(e.menuItemId), e]));

  const lines = [];
  let subTotal = 0;

  for (const c of cart) {
    const id = String(c?.menuItemId || "");
    const menu = menuById.get(id);
    const extra = extraById.get(id);
    const qty = Math.floor(cleanNum(c?.quantity, 0));

    if (!menu) {
      errors.push("An item in your cart is no longer on the menu.");
      continue;
    }
    if (menu.status !== "Available" || (extra && extra.deliveryEnabled === false)) {
      errors.push(`${menu.itemName} is not available right now.`);
      continue;
    }
    if (qty < 1 || qty > 50) {
      errors.push(`Invalid quantity for ${menu.itemName}.`);
      continue;
    }

    // Add-ons must exist in the restaurant's list; the price comes from the DATABASE.
    const wanted = Array.isArray(c.addons) ? c.addons.map((a) => cleanText(a, 80)).filter(Boolean) : [];
    const addons = [];
    for (const name of [...new Set(wanted)]) {
      const found = (extra?.addons || []).find((a) => a.name === name && a.isAvailable !== false);
      if (!found) {
        errors.push(`Add-on "${name}" is not available for ${menu.itemName}.`);
        continue;
      }
      addons.push({ name: found.name, price: found.price || 0 });
    }

    const addonsTotal = addons.reduce((s, a) => s + a.price, 0);
    const lineTotal = roundMoney((menu.price + addonsTotal) * qty);
    subTotal += lineTotal;
    lines.push({
      menuItemId: id,
      itemName: menu.itemName,
      itemPrice: menu.price,
      quantity: qty,
      addons,
      note: cleanText(c.note, 200),
      lineTotal,
    });
  }
  subTotal = roundMoney(subTotal);
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };

  // ----- Delivery rules -----
  const activeAreas = (settings.areas || []).filter((a) => a.active !== false);
  let area = null;
  let deliveryCharge = settings.baseCharge || 0;
  let minOrder = settings.minOrderAmount || 0;

  if (activeAreas.length > 0) {
    area = activeAreas.find((a) => String(a._id) === String(areaId));
    if (!area) return { ok: false, errors: ["Please choose your delivery area."] };
    deliveryCharge = area.charge || 0;
    if (area.minOrder > 0) minOrder = area.minOrder;
  }

  if (minOrder > 0 && subTotal < minOrder) {
    return { ok: false, errors: [`Minimum order for delivery is Rs. ${minOrder}. Add Rs. ${roundMoney(minOrder - subTotal)} more.`], minOrder };
  }

  // Delivery radius (needs the customer's map pin AND the restaurant's location)
  let distanceKm = null;
  if (settings.radiusKm > 0 && validCoord(settings.restaurantLat, settings.restaurantLng)) {
    if (!validCoord(lat, lng)) {
      return { ok: false, errors: ["Please share your location pin so we can check that you are inside our delivery radius."], needsLocation: true };
    }
    distanceKm = roundMoney(haversineKm(settings.restaurantLat, settings.restaurantLng, lat, lng));
    if (distanceKm > settings.radiusKm) {
      return { ok: false, errors: [`Sorry, you are ${distanceKm} km away. We deliver within ${settings.radiusKm} km.`] };
    }
  }

  // Free delivery rule
  let freeDelivery = false;
  if (settings.freeDeliveryAbove > 0 && subTotal >= settings.freeDeliveryAbove) {
    deliveryCharge = 0;
    freeDelivery = true;
  }

  return {
    ok: true,
    errors: [],
    lines,
    subTotal,
    deliveryCharge: roundMoney(deliveryCharge),
    totalAmount: roundMoney(subTotal + deliveryCharge),
    freeDelivery,
    minOrder,
    area: area ? { _id: String(area._id), name: area.name } : null,
    distanceKm,
  };
}

// ---------------------------------------------------------------------
// STATUS CHANGE (changes the document in memory; the route saves it)
// ---------------------------------------------------------------------
function applyStatus(order, to, by, note = "") {
  const now = new Date();
  order.status = to;
  order.statusHistory.push({ status: to, at: now, by, note });

  if (to === "Confirmed") order.acceptedAt = now;
  if (to === "Ready") order.readyAt = now;
  if (to === "OutForDelivery") order.outForDeliveryAt = now;
  if (to === "Delivered") {
    order.deliveredAt = now;
    // Cash on Delivery: the rider collected the cash, so the order is now paid.
    if (order.paymentMethod === "COD") order.paymentStatus = "Paid";
  }
  if (to === "Cancelled") {
    order.cancelledAt = now;
    order.cancelReason = note || order.cancelReason || "";
    if (order.paymentStatus === "Paid") order.paymentStatus = "Refunded";
  }
  // Moving back to Ready removes the rider.
  if (to === "Ready" && order.riderId) {
    order.riderId = "";
    order.riderName = "";
    order.riderPhone = "";
  }
}

// Rider is "Busy" while carrying orders, "Available" when free. "Offline" is never changed automatically.
async function refreshRiderStatus(restaurantId, riderId) {
  if (!riderId || !mongoose.isValidObjectId(riderId)) return;
  const rider = await Rider.findOne({ _id: riderId, restaurantId });
  if (!rider || rider.status === "Offline") return;
  const busy = await DeliveryOrder.countDocuments({
    restaurantId,
    riderId: String(rider._id),
    status: mongoose.trusted({ $in: ["Assigned", "OutForDelivery"] }),
  });
  const next = busy > 0 ? "Busy" : "Available";
  if (rider.status !== next) {
    rider.status = next;
    await rider.save();
  }
}

// ---------------------------------------------------------------------
// KITCHEN SCREEN: when staff accept an online order we also create a normal
// RMS order, so it shows on your existing Kitchen Display.
// It is matched by tableNumber = "Delivery DLV-1001".
// ---------------------------------------------------------------------
const kitchenTable = (o) => `Delivery ${o.orderNo}`;

async function createKitchenTicket(o) {
  try {
    const exists = await Order.exists({ restaurantId: o.restaurantId, tableNumber: kitchenTable(o) });
    if (exists) return;
    await Order.create({
      restaurantId: o.restaurantId,
      customerName: `${o.customer.name} (Online)`,
      tableNumber: kitchenTable(o),
      orderNote: o.orderNote || "",
      items: o.items.map((i) => ({
        itemName: i.addons?.length ? `${i.itemName} + ${i.addons.map((a) => a.name).join(", ")}` : i.itemName,
        description: i.note || "",
        itemPrice: i.itemPrice + (i.addons || []).reduce((s, a) => s + a.price, 0),
        quantity: i.quantity,
      })),
      totalAmount: o.totalAmount,
      orderStatus: "Pending",
      paymentStatus: o.paymentStatus === "Paid" ? "Paid" : "Unpaid",
    });
  } catch (e) {
    console.error("⚠️ Could not create kitchen ticket:", e.message);
  }
}

const KITCHEN_STATUS = { Preparing: "Preparing", Ready: "Ready", Assigned: "Ready", OutForDelivery: "Ready", Delivered: "Completed", Cancelled: "Cancelled" };

async function syncKitchenTicket(o) {
  try {
    const next = KITCHEN_STATUS[o.status];
    if (!next) return;
    await Order.updateMany({ restaurantId: o.restaurantId, tableNumber: kitchenTable(o) }, { $set: { orderStatus: next } });
  } catch (e) {
    console.error("⚠️ Could not sync kitchen ticket:", e.message);
  }
}

// ---------------------------------------------------------------------
// VIEWS: what each kind of person is allowed to see
// ---------------------------------------------------------------------
const STEP_ORDER = ["Pending", "Confirmed", "Preparing", "Ready", "Assigned", "OutForDelivery", "Delivered"];

// Customer (tracking page). No restaurantId, no internal notes.
function publicOrderView(o, restaurant) {
  return {
    orderNo: o.orderNo,
    trackingToken: o.trackingToken,
    status: o.status,
    steps: STEP_ORDER,
    history: (o.statusHistory || []).map((h) => ({ status: h.status, at: h.at })),
    restaurant: restaurant ? { name: restaurant.restaurantName, phone: restaurant.phone, location: restaurant.location } : undefined,
    customer: { name: o.customer.name, address: o.customer.address, area: o.customer.area, lat: o.customer.lat, lng: o.customer.lng },
    items: o.items,
    subTotal: o.subTotal,
    deliveryCharge: o.deliveryCharge,
    totalAmount: o.totalAmount,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    cancelReason: o.status === "Cancelled" ? o.cancelReason : "",
    rider: o.riderId ? { name: o.riderName, phone: o.riderPhone } : null,
    riderLocation: null, // filled in by the route when the order is out for delivery
    etaMinutes: o.etaMinutes,
    createdAt: o.createdAt,
  };
}

// Rider app: only what a rider needs.
function riderOrderView(o) {
  return {
    _id: String(o._id),
    orderNo: o.orderNo,
    status: o.status,
    customer: o.customer,
    items: o.items.map((i) => ({ itemName: i.itemName, quantity: i.quantity, addons: i.addons, note: i.note })),
    orderNote: o.orderNote,
    totalAmount: o.totalAmount,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    cashToCollect: o.paymentMethod === "COD" && o.paymentStatus !== "Paid" ? o.totalAmount : 0,
    createdAt: o.createdAt,
  };
}

module.exports = {
  ACTIVE, FINAL, TRANSITIONS, STEP_ORDER,
  canMove, customerCancelableStatuses, roundMoney, cleanText, cleanNum, validCoord, haversineKm,
  getSettings, nextOrderNo, newTrackingToken, buildQuote, applyStatus,
  refreshRiderStatus, createKitchenTicket, syncKitchenTicket,
  publicOrderView, riderOrderView,
};