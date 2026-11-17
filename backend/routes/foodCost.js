// =====================================================================
// 🍳 FOOD PREPARATION COST + PROFIT
//
//   GET  /api/food-cost/items           → every menu item with its price, cost and profit per plate
//   PUT  /api/food-cost/items/:id       → save ONE item's cost      { costPrice, applyToPast }
//   PUT  /api/food-cost/items           → save MANY costs at once   { items: [{ id, costPrice }], applyToPast }
//   PUT  /api/food-cost/settings        → estimate % on/off (Manager / Admin only)
//   GET  /api/food-cost/profit?from&to&tz → profit from PAID bills + DELIVERED online orders
//
// Who can open it: Manager, Kitchen Staff, Cashier (and Admin). Waiters cannot.
// The restaurant ALWAYS comes from the login token.
//
// How profit is worked out (simple):
//   sale of a line   = line total, after the bill's discount, WITHOUT VAT and delivery charge
//   cost of a line   = preparation cost × quantity
//   profit           = sale − cost
// Cost used for a sale = the cost that was saved on the day of that sale (cost history).
// Item with NO cost:
//   • estimate ON  (default) → cost = selling price × estimate % (marked "Estimated")
//   • estimate OFF           → the line is left out of the profit and shown as "No cost"
// Combo with no cost of its own → the costs of the items inside it are added up.
// =====================================================================
const express = require("express");
const mongoose = require("mongoose");
const Menu = require("../models/menu");
const Bill = require("../models/bill");
const DeliveryOrder = require("../models/deliveryOrder");
const FoodCostSetting = require("../models/foodCostSetting");
const RestaurantStaff = require("../models/loginStaff");

const router = express.Router();
const T = (x) => mongoose.trusted(x);

const ALLOWED = ["Manager", "Kitchen Staff", "Cashier"];
const DAY_START_HOUR = 5; // same as the Dashboard: the business day starts at 5 AM
const MAX_COST = 10000000;
const MAX_RANGE_DAYS = 400;
const HISTORY_KEEP = 60;
const UNPAID_METHODS = ["Pending", "Due", "Delivery"];
const DEFAULTS = { estimatePercent: 33, useEstimate: true };

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const key = (s) => String(s || "").trim().toLowerCase();
const isManager = (req) => req.auth?.isAdmin || (req.auth?.kind === "staff" && req.auth.role === "Manager");
const fail = (res, e, where) => {
  console.error(`🔴 FOOD COST ${where}:`, e);
  res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
};

// 🔒 Only Manager / Kitchen Staff / Cashier / Admin
router.use((req, res, next) =>
  req.auth?.isAdmin || (req.auth?.kind === "staff" && ALLOWED.includes(req.auth.role))
    ? next()
    : res.status(403).json({ success: false, message: "Your role cannot open Food Preparation Cost." })
);

async function getSettings(restaurantId) {
  const doc = await FoodCostSetting.findOne({ restaurantId }).lean();
  return {
    estimatePercent: Number.isFinite(doc?.estimatePercent) ? doc.estimatePercent : DEFAULTS.estimatePercent,
    useEstimate: typeof doc?.useEstimate === "boolean" ? doc.useEstimate : DEFAULTS.useEstimate,
  };
}

// Cost of one item on a given day (null = no cost known)
function ownCostAt(m, at) {
  const hist = Array.isArray(m.costHistory) ? m.costHistory.filter((h) => h && h.from) : [];
  if (!hist.length) return Number.isFinite(m.costPrice) ? m.costPrice : null;
  const t = at ? new Date(at).getTime() : Date.now();
  let pick = null;
  for (const h of hist) if (new Date(h.from).getTime() <= t) pick = h; // history is oldest → newest
  // A sale from BEFORE the first cost was written → use the first cost written (best guess)
  if (!pick) pick = hist[0];
  return Number.isFinite(pick.cost) ? pick.cost : null;
}

/**
 * Builds a "cost book" for one restaurant's menu.
 * costOf(menuItem, at) → { cost, source } where source = "set" | "combo" | "estimate" | "missing"
 */
function makeBook(menuItems, settings) {
  const byId = new Map();
  const byName = new Map();
  menuItems.forEach((m) => {
    byId.set(String(m._id), m);
    if (!byName.has(key(m.itemName))) byName.set(key(m.itemName), m);
  });
  const pct = settings.estimatePercent / 100;

  const costOf = (m, at, depth = 0) => {
    const own = ownCostAt(m, at);
    if (own !== null) return { cost: own, source: "set" };

    const isCombo = Boolean(m.isCombo) || m.category === "Combo";
    if (isCombo && Array.isArray(m.comboItems) && m.comboItems.length && depth < 2) {
      let sum = 0;
      let estimated = false;
      for (const c of m.comboItems) {
        const part = byId.get(String(c.menuItemId)) || byName.get(key(c.itemName));
        const qty = Math.max(1, Number(c.quantity) || 1);
        const got = part ? costOf(part, at, depth + 1) : { cost: null, source: "missing" };
        if (got.cost === null) return settings.useEstimate ? { cost: (Number(m.price) || 0) * pct, source: "estimate" } : { cost: null, source: "missing" };
        if (got.source === "estimate") estimated = true;
        sum += got.cost * qty;
      }
      return { cost: sum, source: estimated ? "estimate" : "combo" };
    }

    if (settings.useEstimate) return { cost: (Number(m.price) || 0) * pct, source: "estimate" };
    return { cost: null, source: "missing" };
  };

  return { byId, byName, costOf, find: (id, name) => (id && byId.get(String(id))) || byName.get(key(name)) || null };
}

const loadMenu = (restaurantId) =>
  Menu.find({ restaurantId })
    .select("itemName category price status isCombo comboItems costPrice costHistory costUpdatedAt costUpdatedBy")
    .sort({ category: 1, itemName: 1 })
    .lean();

// ---------------------------------------------------------------------
// GET /items
// ---------------------------------------------------------------------
router.get("/items", async (req, res) => {
  try {
    const rid = req.auth.restaurantId;
    const [menu, settings] = await Promise.all([loadMenu(rid), getSettings(rid)]);
    const book = makeBook(menu, settings);

    const items = menu.map((m) => {
      const price = Number(m.price) || 0;
      const { cost, source } = book.costOf(m, new Date());
      const profit = cost === null ? null : price - cost;
      return {
        id: String(m._id),
        itemName: m.itemName,
        category: m.category || "",
        status: m.status || "Available",
        price,
        isCombo: Boolean(m.isCombo) || m.category === "Combo",
        comboItems: (m.comboItems || []).map((c) => ({ itemName: c.itemName, quantity: c.quantity })),
        costPrice: Number.isFinite(m.costPrice) ? m.costPrice : null, // what was written for this item
        cost: cost === null ? null : r2(cost),                          // cost used (written / combo / estimate)
        source,
        profit: profit === null ? null : r2(profit),
        margin: profit === null || price <= 0 ? null : r2((profit / price) * 100),
        costUpdatedAt: m.costUpdatedAt || null,
        costUpdatedBy: m.costUpdatedBy || "",
      };
    });

    const written = items.filter((i) => i.costPrice !== null).length;
    const auto = items.filter((i) => i.costPrice === null && i.source === "combo").length;
    res.json({
      success: true,
      data: {
        items,
        settings,
        canEditSettings: Boolean(isManager(req)),
        stats: { total: items.length, withCost: written + auto, written, combosAuto: auto, missing: items.length - written - auto },
      },
    });
  } catch (e) {
    fail(res, e, "items");
  }
});

// ---------------------------------------------------------------------
// Save costs
// ---------------------------------------------------------------------
// "" / null → remove the cost.  Otherwise a number 0 … 1 crore.
function readCost(v) {
  if (v === null || v === "" || v === undefined) return { ok: true, value: null };
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > MAX_COST) return { ok: false };
  return { ok: true, value: r2(n) };
}

async function whoIs(req) {
  if (req.auth.kind !== "staff") return req.auth.isAdmin ? "Admin" : "Owner";
  try {
    const s = await RestaurantStaff.findById(req.auth.staffId).select("staffName role").lean();
    return `${s?.staffName || "Staff"} (${req.auth.role})`.slice(0, 80);
  } catch {
    return req.auth.role || "Staff";
  }
}

async function saveCost(rid, id, value, applyToPast, by) {
  if (!mongoose.isValidObjectId(id)) return null;
  const m = await Menu.findOne({ _id: id, restaurantId: rid }).select("costPrice costHistory").lean();
  if (!m) return null;
  const now = new Date();
  let history = Array.isArray(m.costHistory) ? m.costHistory.filter((h) => h && h.from) : [];
  const same = (Number.isFinite(m.costPrice) ? m.costPrice : null) === value;

  if (applyToPast) {
    history = [{ cost: value, from: new Date(0) }]; // one cost for ALL sales, old and new
  } else if (!same) {
    // Item had a cost before but no history (should not happen) → keep it for older sales
    if (!history.length && Number.isFinite(m.costPrice)) history.push({ cost: m.costPrice, from: new Date(0) });
    history.push({ cost: value, from: now });
    if (history.length > HISTORY_KEEP) history = history.slice(-HISTORY_KEEP);
  } else {
    return { id, unchanged: true };
  }

  await Menu.updateOne(
    { _id: id, restaurantId: rid },
    { $set: { costPrice: value, costHistory: history, costUpdatedAt: now, costUpdatedBy: by } }
  );
  return { id, costPrice: value };
}

router.put("/items/:id", async (req, res) => {
  try {
    const c = readCost(req.body?.costPrice);
    if (!c.ok) return res.status(400).json({ success: false, message: "Cost must be a number from 0 to 1,00,00,000." });
    const by = await whoIs(req);
    const out = await saveCost(req.auth.restaurantId, req.params.id, c.value, req.body?.applyToPast === true, by);
    if (!out) return res.status(404).json({ success: false, message: "Menu item not found." });
    res.json({ success: true, message: "Cost saved.", data: out });
  } catch (e) {
    fail(res, e, "save one");
  }
});

router.put("/items", async (req, res) => {
  try {
    const list = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!list || !list.length) return res.status(400).json({ success: false, message: "Nothing to save." });
    if (list.length > 1000) return res.status(400).json({ success: false, message: "Too many items at once." });
    const clean = [];
    for (const row of list) {
      const c = readCost(row?.costPrice);
      if (!c.ok || typeof row?.id !== "string") {
        return res.status(400).json({ success: false, message: "One of the costs is not a valid number (0 to 1,00,00,000)." });
      }
      clean.push({ id: row.id, value: c.value });
    }
    const by = await whoIs(req);
    const applyToPast = req.body?.applyToPast === true;
    let saved = 0;
    let notFound = 0;
    for (const row of clean) {
      const out = await saveCost(req.auth.restaurantId, row.id, row.value, applyToPast, by);
      if (!out) notFound += 1;
      else if (!out.unchanged) saved += 1;
    }
    res.json({ success: true, message: `${saved} cost${saved === 1 ? "" : "s"} saved.`, data: { saved, notFound } });
  } catch (e) {
    fail(res, e, "save many");
  }
});

router.put("/settings", async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ success: false, message: "Only the Manager can change this." });
    const update = {};
    if (typeof req.body?.useEstimate === "boolean") update.useEstimate = req.body.useEstimate;
    if (req.body?.estimatePercent !== undefined) {
      const p = Number(req.body.estimatePercent);
      if (!Number.isFinite(p) || p < 1 || p > 95) {
        return res.status(400).json({ success: false, message: "Estimate must be between 1 and 95 %." });
      }
      update.estimatePercent = Math.round(p * 10) / 10;
    }
    await FoodCostSetting.updateOne(
      { restaurantId: req.auth.restaurantId },
      { $set: update, $setOnInsert: { restaurantId: req.auth.restaurantId } },
      { upsert: true }
    );
    res.json({ success: true, message: "Saved.", data: await getSettings(req.auth.restaurantId) });
  } catch (e) {
    fail(res, e, "settings");
  }
});

// ---------------------------------------------------------------------
// GET /profit?from=ISO&to=ISO&tz=Asia/Kathmandu
// ---------------------------------------------------------------------
function dayKeyMaker(tz) {
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu", year: "numeric", month: "2-digit", day: "2-digit" });
  }
  return (d) => fmt.format(new Date(new Date(d).getTime() - DAY_START_HOUR * 3600000));
}

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 1);

router.get("/profit", async (req, res) => {
  try {
    const rid = req.auth.restaurantId;
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(to.getTime() - 7 * 86400000);
    if (isNaN(from) || isNaN(to) || from > to) return res.status(400).json({ success: false, message: "Invalid dates." });
    if (to - from > MAX_RANGE_DAYS * 86400000) {
      return res.status(400).json({ success: false, message: "Please choose a range of one year or less." });
    }
    const dayKey = dayKeyMaker(typeof req.query.tz === "string" ? req.query.tz.slice(0, 60) : "Asia/Kathmandu");

    const [menu, settings, bills, deliveries] = await Promise.all([
      loadMenu(rid),
      getSettings(rid),
      // Paid bills: paid inside the range (old bills without paidAt → their bill date)
      Bill.find({
        restaurantId: rid,
        status: T({ $ne: "Cancelled" }),
        $or: [
          { paidAt: T({ $gte: from, $lte: to }) },
          { paidAt: null, paymentMethod: T({ $nin: UNPAID_METHODS }), date: T({ $gte: from, $lte: to }) },
        ],
      })
        .select("items subtotal discount taxableAmount tableNumber paymentMethod paidAt date")
        .limit(50000)
        .lean(),
      // Online delivery orders that were delivered (and not refunded)
      DeliveryOrder.find({
        restaurantId: rid,
        status: "Delivered",
        paymentStatus: T({ $ne: "Refunded" }),
        deliveredAt: T({ $gte: from, $lte: to }),
      })
        .select("items subTotal deliveryCharge totalAmount deliveredAt")
        .limit(20000)
        .lean(),
    ]);

    const book = makeBook(menu, settings);
    const items = new Map();
    const days = new Map();
    const totals = { revenue: 0, cost: 0, coveredRevenue: 0, estimatedRevenue: 0, estimatedCost: 0, missingRevenue: 0, qty: 0, bills: 0, deliveries: 0 };

    const addLine = ({ id, name, qty, revenue, at }) => {
      const m = book.find(id, name);
      let cost = null;
      let source = "missing";
      if (m) {
        const got = book.costOf(m, at);
        cost = got.cost === null ? null : got.cost * qty;
        source = got.source;
      } else if (settings.useEstimate) {
        // Item is not on the menu any more → estimate from what it was sold for
        cost = revenue * (settings.estimatePercent / 100);
        source = "estimate";
      }

      const k = m ? String(m._id) : `name:${key(name)}`;
      const row = items.get(k) || {
        key: k,
        menuId: m ? String(m._id) : null,
        name: m ? m.itemName : String(name || "Unknown item"),
        category: m ? m.category || "" : "Not on menu",
        qty: 0, revenue: 0, cost: 0, coveredRevenue: 0, missingQty: 0, estimatedQty: 0,
      };
      row.qty += qty;
      row.revenue += revenue;
      totals.qty += qty;
      totals.revenue += revenue;

      const dk = dayKey(at);
      const day = days.get(dk) || { day: dk, revenue: 0, cost: 0, coveredRevenue: 0 };
      day.revenue += revenue;

      if (cost === null) {
        row.missingQty += qty;
        totals.missingRevenue += revenue;
      } else {
        row.cost += cost;
        row.coveredRevenue += revenue;
        totals.cost += cost;
        totals.coveredRevenue += revenue;
        day.cost += cost;
        day.coveredRevenue += revenue;
        if (source === "estimate") {
          row.estimatedQty += qty;
          totals.estimatedRevenue += revenue;
          totals.estimatedCost += cost;
        }
      }
      items.set(k, row);
      days.set(dk, day);
    };

    for (const b of bills) {
      // Delivery bills made from online orders are counted from the delivery order below (no double count)
      if (String(b.tableNumber || "").startsWith("Delivery DLV-")) continue;
      const at = b.paidAt || b.date;
      const lines = Array.isArray(b.items) ? b.items : [];
      const sub = Number(b.subtotal) || lines.reduce((s, l) => s + (Number(l.total) || 0), 0);
      const taxable = Number(b.taxableAmount);
      const afterDiscount =
        Number.isFinite(taxable) && taxable > 0 && taxable <= sub + 0.01 ? taxable : sub - (Number(b.discount) || 0);
      const factor = sub > 0 ? clamp01(afterDiscount / sub) : 1;
      totals.bills += 1;
      for (const l of lines) {
        const qty = Math.max(0, Number(l.quantity) || 0);
        if (!qty) continue;
        const lineTotal = Number.isFinite(Number(l.total)) ? Number(l.total) : qty * (Number(l.rate) || 0);
        addLine({ id: null, name: l.itemName, qty, revenue: lineTotal * factor, at });
      }
    }

    for (const d of deliveries) {
      const sub = Number(d.subTotal) || 0;
      const factor = sub > 0 ? clamp01(((Number(d.totalAmount) || 0) - (Number(d.deliveryCharge) || 0)) / sub) : 1;
      totals.deliveries += 1;
      for (const l of d.items || []) {
        const qty = Math.max(0, Number(l.quantity) || 0);
        if (!qty) continue;
        addLine({ id: l.menuItemId, name: l.itemName, qty, revenue: (Number(l.lineTotal) || 0) * factor, at: d.deliveredAt });
      }
    }

    // With estimate OFF the profit only uses lines that HAVE a cost
    const base = settings.useEstimate ? totals.revenue : totals.coveredRevenue;
    const profit = base - totals.cost;

    const itemRows = Array.from(items.values())
      .map((r) => {
        const b2 = settings.useEstimate ? r.revenue : r.coveredRevenue;
        const p = r.qty === r.missingQty ? null : b2 - r.cost;
        return {
          key: r.key,
          menuId: r.menuId,
          name: r.name,
          category: r.category,
          qty: r2(r.qty),
          revenue: r2(r.revenue),
          cost: r.qty === r.missingQty ? null : r2(r.cost),
          profit: p === null ? null : r2(p),
          margin: p === null || b2 <= 0 ? null : r2((p / b2) * 100),
          source: r.missingQty === r.qty ? "missing" : r.missingQty > 0 ? "partly-missing" : r.estimatedQty === r.qty ? "estimate" : r.estimatedQty > 0 ? "partly-estimate" : "set",
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const dayRows = Array.from(days.values())
      .map((d) => {
        const b2 = settings.useEstimate ? d.revenue : d.coveredRevenue;
        return { day: d.day, revenue: r2(d.revenue), cost: r2(d.cost), profit: r2(b2 - d.cost) };
      })
      .sort((a, b) => (a.day < b.day ? -1 : 1));

    res.json({
      success: true,
      data: {
        range: { from, to },
        settings,
        totals: {
          revenue: r2(totals.revenue),
          cost: r2(totals.cost),
          profit: r2(profit),
          margin: base > 0 ? r2((profit / base) * 100) : null,
          costPercent: base > 0 ? r2((totals.cost / base) * 100) : null,
          coveredRevenue: r2(totals.coveredRevenue),
          estimatedRevenue: r2(totals.estimatedRevenue),
          estimatedCost: r2(totals.estimatedCost),
          missingRevenue: r2(totals.missingRevenue),
          qty: r2(totals.qty),
          bills: totals.bills,
          deliveries: totals.deliveries,
          // how much of the sales used a REAL written cost (not estimated, not missing)
          realCostShare: totals.revenue > 0 ? r2(((totals.coveredRevenue - totals.estimatedRevenue) / totals.revenue) * 100) : null,
        },
        items: itemRows,
        days: dayRows,
      },
    });
  } catch (e) {
    fail(res, e, "profit");
  }
});

module.exports = router;