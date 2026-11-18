// =====================================================================
// 🍳 ITEM-LEVEL KITCHEN STATUS
// Every line of an order keeps its own progress:
//   readyQty  = how many of this line the kitchen has finished
//   servedQty = how many of this line were given to the customer
//   cooking   = the kitchen has started this line
//   addedAt   = when this line was ordered (items added later get their own time)
// The ORDER status is worked out from its lines:
//   all served → Served · all finished → Ready · something started → Preparing · else Pending
// Old orders (saved before this) have no line fields → they follow the order status.
// =====================================================================

const FLOW = ["Pending", "Preparing", "Ready", "Served"];
const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);
const nameKey = (s) => String(s || "").trim().toLowerCase();

/** Line with all fields filled. `orderStatus` moves old / outside-changed lines forward. */
function normalizeLine(line, orderStatus) {
  const qty = Math.max(1, num(line.quantity) || 1);
  let readyQty = line.readyQty === undefined || line.readyQty === null ? 0 : Math.min(num(line.readyQty), qty);
  let servedQty = line.servedQty === undefined || line.servedQty === null ? 0 : Math.min(num(line.servedQty), qty);
  let cooking = !!line.cooking;
  // The whole order was moved forward (old order, Orders page, delivery) → its lines follow
  if (["Ready", "Served", "Completed"].includes(orderStatus)) readyQty = qty;
  if (["Served", "Completed"].includes(orderStatus)) servedQty = qty;
  if (orderStatus === "Preparing" && line.readyQty === undefined) cooking = true;
  servedQty = Math.min(servedQty, readyQty);
  if (readyQty >= qty) cooking = false;
  return {
    itemName: line.itemName,
    description: line.description || "",
    note: line.note || "",
    itemPrice: Number(line.itemPrice) || 0,
    quantity: qty,
    readyQty,
    servedQty,
    cooking,
    addedAt: line.addedAt || null,
    readyAt: line.readyAt || null,
    noKitchen: !!line.noKitchen,
  };
}

/** Order status from its lines. (Drinks that skip the kitchen don't make it "Preparing".) */
function deriveStatus(lines) {
  if (!lines.length) return "Pending";
  if (lines.every((l) => l.servedQty >= l.quantity)) return "Served";
  if (lines.every((l) => l.readyQty >= l.quantity)) return "Ready";
  if (lines.some((l) => l.servedQty > 0 || (!l.noKitchen && (l.readyQty > 0 || l.cooking)))) return "Preparing";
  return "Pending";
}

/** A brand-new line. Drinks that skip the kitchen are "finished" at once (ready to serve). */
function newLine(i, isBeverage, now = new Date()) {
  const qty = Math.max(1, num(i.quantity) || 1);
  const drink = !!(isBeverage && isBeverage(i.itemName));
  return {
    itemName: i.itemName || "Unknown Item",
    description: i.description || "",
    note: String(i.note || "").slice(0, 200),
    itemPrice: Number(i.itemPrice) || 0,
    quantity: qty,
    readyQty: drink ? qty : 0,
    servedQty: 0,
    cooking: false,
    addedAt: now,
    readyAt: drink ? now : null,
    noKitchen: drink,
  };
}

/**
 * Order edited (items added / removed / qty changed): keep each line's progress.
 * Lines are matched by name (in order). More quantity than before → the extra part waits for the kitchen.
 */
function mergeLines(oldLines, sentItems, isBeverage, now = new Date()) {
  const pool = oldLines.map((l) => ({ ...l, used: false }));
  return sentItems.map((i) => {
    const old = pool.find((p) => !p.used && nameKey(p.itemName) === nameKey(i.itemName));
    if (!old) return newLine(i, isBeverage, now);
    old.used = true;
    const qty = Math.max(1, num(i.quantity) || 1);
    const grew = qty > old.quantity;
    const drink = !!(isBeverage && isBeverage(i.itemName));
    const readyQty = drink ? qty : Math.min(old.readyQty, qty);
    return {
      itemName: i.itemName || old.itemName,
      description: i.description !== undefined ? i.description || "" : old.description,
      note: i.note !== undefined ? String(i.note || "").slice(0, 200) : old.note,
      itemPrice: Number(i.itemPrice) || 0,
      quantity: qty,
      readyQty,
      servedQty: Math.min(old.servedQty, readyQty),
      // The finished line got more → the new part is "waiting" (new time so it shows as new)
      cooking: readyQty < qty && old.cooking && !(grew && old.readyQty >= old.quantity),
      addedAt: grew && old.readyQty >= old.quantity ? now : old.addedAt || now,
      readyAt: readyQty >= qty ? old.readyAt || now : null,
      noKitchen: drink,
    };
  });
}

/** The whole order was set to a status by hand (Orders page …) → set every line to match. */
function applyOrderStatus(lines, status, now = new Date()) {
  return lines.map((l) => {
    if (status === "Pending") return { ...l, readyQty: 0, servedQty: 0, cooking: false, readyAt: null };
    if (status === "Preparing") return { ...l, cooking: l.readyQty < l.quantity, servedQty: Math.min(l.servedQty, l.readyQty) };
    if (status === "Ready") return { ...l, readyQty: l.quantity, cooking: false, readyAt: l.readyAt || now };
    if (status === "Served") return { ...l, readyQty: l.quantity, servedQty: l.quantity, cooking: false, readyAt: l.readyAt || now };
    return l;
  });
}

/**
 * One kitchen / waiter action on one line.
 *   start   → cooking        ready → all finished     ready1 → one more finished
 *   serve   → everything finished is given out         undo → one step back
 */
function applyLineAction(l, action, now = new Date()) {
  const x = { ...l };
  switch (action) {
    case "start":
      if (x.readyQty < x.quantity) x.cooking = true;
      break;
    case "ready":
      x.readyQty = x.quantity;
      x.cooking = false;
      x.readyAt = now;
      break;
    case "ready1":
      x.readyQty = Math.min(x.quantity, x.readyQty + 1);
      x.cooking = x.readyQty < x.quantity;
      if (x.readyQty >= x.quantity) x.readyAt = now;
      break;
    case "serve":
      x.servedQty = x.readyQty;
      break;
    case "undo":
      if (x.servedQty > 0) x.servedQty = 0; // served → back to finished
      else if (x.readyQty > 0) {
        x.readyQty = 0; // finished → back to cooking
        x.cooking = true;
        x.readyAt = null;
      } else x.cooking = false; // cooking → waiting
      break;
    default:
      return null;
  }
  return x;
}

module.exports = { FLOW, normalizeLine, deriveStatus, newLine, mergeLines, applyOrderStatus, applyLineAction, nameKey };