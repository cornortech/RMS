// =====================================================================
// 📉 SLOW-SELLING ITEMS + 🏷️ ITEM OFFERS   (Manager / Admin only)
//
//   GET    /api/menu-offers/slow-items?tz=Asia/Kathmandu
//          → every menu item, how many were sold TODAY, YESTERDAY and the DAY BEFORE
//            (all bills: paid, pending, due… only CANCELLED bills are left out)
//            + a simple tip (discount / combo / check price)
//   GET    /api/menu-offers            → items that have an offer (running or planned)
//   PUT    /api/menu-offers/:id        → start / change an offer { kind, value, days, label }
//   DELETE /api/menu-offers/:id        → stop the offer
//
// The 3 days move by themselves: on Nov 17 → 15, 16, 17. On Nov 18 → 16, 17, 18.
// A day starts at 5 AM (same as the Dashboard).
// =====================================================================
const express = require("express");
const mongoose = require("mongoose");
const Menu = require("../models/menu");
const Bill = require("../models/bill");
const RestaurantStaff = require("../models/loginStaff");
const { activeOffer } = require("../utils/offer");

const router = express.Router();
const T = (x) => mongoose.trusted(x);
const DAY_START_HOUR = 5;
const DAY = 86400000;
const key = (s) => String(s || "").trim().toLowerCase();
const fail = (res, e, where) => {
  console.error(`🔴 MENU OFFERS ${where}:`, e);
  res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
};

function dayKeyMaker(tz) {
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu", year: "numeric", month: "2-digit", day: "2-digit" });
  }
  return (d) => fmt.format(new Date(new Date(d).getTime() - DAY_START_HOUR * 3600000));
}

const round10 = (n) => Math.max(10, Math.round(n / 10) * 10);
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---------------------------------------------------------------------
// GET /slow-items
// ---------------------------------------------------------------------
router.get("/slow-items", async (req, res) => {
  try {
    const rid = req.auth.restaurantId;
    const dayKey = dayKeyMaker(typeof req.query.tz === "string" ? req.query.tz.slice(0, 60) : "Asia/Kathmandu");
    const now = new Date();
    // [day before yesterday, yesterday, today]
    const keys = [2, 1, 0].map((n) => dayKey(new Date(now.getTime() - n * DAY)));
    const since = new Date(now.getTime() - 3 * DAY - 2 * 3600000); // a little extra, then filtered by day key

    const [menu, bills] = await Promise.all([
      Menu.find({ restaurantId: rid })
        .select("itemName category price status isCombo comboItems offer costPrice createdAt imageUrl")
        .lean(),
      Bill.find({ restaurantId: rid, status: T({ $ne: "Cancelled" }), date: T({ $gte: since, $lte: now }) })
        .select("items date")
        .limit(30000)
        .lean(),
    ]);

    // Count what each item sold on each of the 3 days
    const sold = new Map(); // name → { per: [0,0,0], revenue }
    let billCount = 0;
    let itemsSold = 0;
    for (const b of bills) {
      const idx = keys.indexOf(dayKey(b.date));
      if (idx === -1) continue;
      billCount += 1;
      for (const l of b.items || []) {
        const qty = Math.max(0, Number(l.quantity) || 0);
        if (!qty) continue;
        const k = key(l.itemName);
        const row = sold.get(k) || { per: [0, 0, 0], revenue: 0 };
        row.per[idx] += qty;
        row.revenue += Number(l.total) || qty * (Number(l.rate) || 0);
        sold.set(k, row);
        itemsSold += qty;
      }
    }

    const windowStart = new Date(now.getTime() - 3 * DAY);
    const selling = menu.filter((m) => (m.status || "Available") === "Available");
    const rows = selling.map((m) => {
      const s = sold.get(key(m.itemName)) || { per: [0, 0, 0], revenue: 0 };
      const qty = s.per[0] + s.per[1] + s.per[2];
      return {
        id: String(m._id),
        itemName: m.itemName,
        category: m.category || "",
        price: Number(m.price) || 0,
        imageUrl: m.imageUrl || "",
        isCombo: Boolean(m.isCombo) || m.category === "Combo",
        isNew: m.createdAt ? new Date(m.createdAt) > windowStart : false,
        costPrice: Number.isFinite(m.costPrice) ? m.costPrice : null,
        offer: activeOffer(m, now),
        plannedOffer: m.offer && !activeOffer(m, now) && m.offer.startsAt && new Date(m.offer.startsAt) > now ? m.offer : null,
        perDay: s.per,
        qty,
        revenue: Math.round(s.revenue),
      };
    });

    // Best sellers (used as combo partners)
    const best = [...rows].filter((r) => r.qty > 0 && !r.isCombo).sort((a, b) => b.qty - a.qty);
    const med = median(rows.filter((r) => !r.isNew).map((r) => r.qty));
    const catAvg = new Map();
    rows.forEach((r) => {
      const c = catAvg.get(r.category) || { sum: 0, n: 0 };
      c.sum += r.price;
      c.n += 1;
      catAvg.set(r.category, c);
    });

    const isDrink = (r) => /bever|drink|juice|tea|coffee|lassi|bar|shake/i.test(r.category);
    const partnerFor = (r) => {
      const others = best.filter((b) => b.id !== r.id);
      return (
        others.find((b) => isDrink(b) !== isDrink(r)) || // food + drink is the classic combo
        others.find((b) => b.category !== r.category) ||
        others[0] ||
        null
      );
    };

    rows.forEach((r) => {
      // How slow is it?
      r.level =
        r.qty === 0 ? "not-sold" : r.qty <= Math.max(1, Math.round(med * 0.25)) ? "very-low" : r.qty <= med * 0.5 ? "low" : "ok";

      // Biggest discount that still keeps ~30 % profit (only when the food cost is known)
      const safeMax = r.costPrice !== null && r.price > 0 ? Math.floor((1 - r.costPrice / r.price) * 100 - 30) : null;
      r.safeDiscount = safeMax === null ? null : Math.max(0, Math.min(safeMax, 50));

      const tips = [];
      let action = null;
      const partner = partnerFor(r);
      const comboPrice = partner ? round10((r.price + partner.price) * 0.9) : null;

      if (r.level === "ok") {
        action = null;
      } else if (r.isNew) {
        tips.push("New item — give it a few days. Tell customers about it.");
        action = "discount";
      } else if (r.offer && r.level === "not-sold") {
        tips.push("The offer is running but it still does not sell. Try a better photo or name, ask staff to suggest it, or take it off the menu.");
        action = partner && !r.isCombo ? "combo" : null;
      } else if (r.level === "not-sold") {
        if (partner && !r.isCombo) {
          tips.push(`Not sold in 3 days. Put it in a combo with ${partner.itemName} (a best seller) for about NPR ${comboPrice}.`);
          action = "combo";
        } else {
          tips.push("Not sold in 3 days. Give a discount, or take it off the menu.");
          action = "discount";
        }
      } else {
        const want = r.level === "very-low" ? 15 : 10;
        if (r.safeDiscount !== null && r.safeDiscount < 5) {
          tips.push("Sells slowly, but its profit is too small for a discount. A combo is better.");
          action = partner && !r.isCombo ? "combo" : null;
        } else {
          const pct = r.safeDiscount !== null ? Math.min(want, r.safeDiscount) : want;
          tips.push(`Sold only ${r.qty} in 3 days. Try ${pct}% off for 3 days.`);
          action = "discount";
          r.suggestedPercent = pct;
        }
      }
      const avg = catAvg.get(r.category);
      if (r.level !== "ok" && avg && avg.n > 2 && r.price > (avg.sum / avg.n) * 1.3) {
        tips.push(`Price is higher than other ${r.category} items (average NPR ${Math.round(avg.sum / avg.n)}).`);
      }
      r.tips = tips;
      r.action = action;
      r.suggestedPercent = r.suggestedPercent || (r.level === "not-sold" ? 15 : 10);
      r.partner = partner && !r.isCombo ? { id: partner.id, itemName: partner.itemName, price: partner.price } : null;
      r.comboPrice = r.partner ? comboPrice : null;
    });

    const order = { "not-sold": 0, "very-low": 1, low: 2, ok: 3 };
    rows.sort((a, b) => order[a.level] - order[b.level] || a.qty - b.qty || a.revenue - b.revenue || a.itemName.localeCompare(b.itemName));

    res.json({
      success: true,
      data: {
        days: keys,
        bills: billCount,
        itemsSold,
        median: med,
        notCounted: menu.length - selling.length, // items switched off / sold out are not checked
        counts: {
          notSold: rows.filter((r) => r.level === "not-sold").length,
          veryLow: rows.filter((r) => r.level === "very-low").length,
          low: rows.filter((r) => r.level === "low").length,
          withOffer: rows.filter((r) => r.offer).length,
        },
        items: rows,
        bestSellers: best.slice(0, 8).map((b) => ({ id: b.id, itemName: b.itemName, price: b.price, qty: b.qty, category: b.category })),
      },
    });
  } catch (e) {
    fail(res, e, "slow items");
  }
});

// ---------------------------------------------------------------------
// GET /   (items with an offer)
// ---------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const now = new Date();
    const items = await Menu.find({ restaurantId: req.auth.restaurantId, offer: T({ $ne: null }) })
      .select("itemName category price status offer")
      .lean();
    const data = items
      .filter((m) => m.offer && (!m.offer.endsAt || new Date(m.offer.endsAt) > now))
      .map((m) => ({
        id: String(m._id),
        itemName: m.itemName,
        category: m.category,
        price: m.price,
        status: m.status,
        offer: m.offer,
        running: Boolean(activeOffer(m, now)),
        offerPrice: activeOffer(m, now)?.price ?? null,
      }));
    res.json({ success: true, data });
  } catch (e) {
    fail(res, e, "list");
  }
});

// ---------------------------------------------------------------------
// PUT /:id   { kind: "percent"|"flat", value, days (1-60), label }
// ---------------------------------------------------------------------
router.put("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid item." });
    const item = await Menu.findOne({ _id: req.params.id, restaurantId: req.auth.restaurantId }).select("price itemName").lean();
    if (!item) return res.status(404).json({ success: false, message: "Menu item not found." });

    const kind = req.body?.kind === "flat" ? "flat" : req.body?.kind === "percent" ? "percent" : null;
    const value = Number(req.body?.value);
    const days = Number(req.body?.days);
    const label = typeof req.body?.label === "string" ? req.body.label.trim().slice(0, 40) : "";
    const price = Number(item.price) || 0;

    if (!kind) return res.status(400).json({ success: false, message: "Choose % off or NPR off." });
    if (kind === "percent" && (!Number.isFinite(value) || value < 1 || value > 90)) {
      return res.status(400).json({ success: false, message: "Discount must be 1% to 90%." });
    }
    if (kind === "flat" && (!Number.isFinite(value) || value < 1 || value >= price)) {
      return res.status(400).json({ success: false, message: `NPR off must be between 1 and ${Math.max(1, price - 1)}.` });
    }
    if (!Number.isInteger(days) || days < 1 || days > 60) {
      return res.status(400).json({ success: false, message: "Offer can run from 1 to 60 days." });
    }

    let by = "Admin";
    if (req.auth.kind === "staff") {
      const s = await RestaurantStaff.findById(req.auth.staffId).select("staffName").lean().catch(() => null);
      by = `${s?.staffName || "Staff"} (${req.auth.role})`.slice(0, 80);
    }
    const startsAt = new Date();
    // Ends at the END of the last day (5 AM the next morning, Nepal time)
    const endsAt = new Date(startsAt.getTime() + days * DAY);
    const offer = { kind, value: Math.round(value * 100) / 100, label, startsAt, endsAt, createdBy: by };

    await Menu.updateOne({ _id: req.params.id, restaurantId: req.auth.restaurantId }, { $set: { offer } });
    const now = activeOffer({ price, offer });
    res.json({
      success: true,
      message: `Offer started on ${item.itemName}: NPR ${price} → NPR ${now ? now.price : price}.`,
      data: { offer, offerPrice: now ? now.price : price },
    });
  } catch (e) {
    fail(res, e, "save");
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid item." });
    const r = await Menu.updateOne({ _id: req.params.id, restaurantId: req.auth.restaurantId }, { $set: { offer: null } });
    if (!r.matchedCount) return res.status(404).json({ success: false, message: "Menu item not found." });
    res.json({ success: true, message: "Offer stopped." });
  } catch (e) {
    fail(res, e, "stop");
  }
});

module.exports = router;