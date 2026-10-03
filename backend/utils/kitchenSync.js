// =====================================================================
// KITCHEN → DELIVERY SYNC
// When the kitchen staff press "Preparing" / "Ready" on the Kitchen Display
// for an ONLINE order (its table name is "Delivery DLV-1001"), the matching
// delivery order is moved forward automatically and everyone is told live.
// (The other direction — Delivery page → Kitchen Display — is in deliveryCore.js)
// =====================================================================
const DeliveryOrder = require("../models/deliveryOrder");
const core = require("./deliveryCore");
const realtime = require("./realtime");

// kitchen status → delivery statuses it is allowed to move FROM
const RULES = {
  Preparing: { to: "Preparing", from: ["Confirmed"] },
  Ready: { to: "Ready", from: ["Confirmed", "Preparing"] },
};

async function syncFromKitchen(kitchenOrder) {
  if (!kitchenOrder) return null;
  const match = /^Delivery (DLV-\d+)$/.exec(String(kitchenOrder.tableNumber || ""));
  if (!match) return null; // a normal dine-in order — nothing to do

  const rule = RULES[kitchenOrder.orderStatus];
  if (!rule) return null; // Pending / Served / Completed … are ignored

  // 🔑 restaurantId comes from the kitchen order itself, so restaurants never mix
  const order = await DeliveryOrder.findOne({ restaurantId: kitchenOrder.restaurantId, orderNo: match[1] });
  if (!order || !rule.from.includes(order.status)) return null; // only ever move FORWARD

  // Kitchen jumped straight to Ready: record "Preparing" too so the timeline is complete
  if (order.status === "Confirmed" && rule.to === "Ready") core.applyStatus(order, "Preparing", "Kitchen");
  core.applyStatus(order, rule.to, "Kitchen");
  await order.save();

  const plain = order.toObject();
  realtime.emitToRestaurant(plain.restaurantId, "delivery:order", { type: "updated", order: plain });
  realtime.emitToTracking(plain.trackingToken, "delivery:update", core.publicOrderView(plain));
  return order;
}

module.exports = { syncFromKitchen };