// =====================================================================
// FEATURE SWITCHES   (Settings → Features)
//   GET /api/features   → any logged-in staff (the Kitchen Display needs it)
//   PUT /api/features   → Manager / Admin only
// The restaurant ALWAYS comes from the login token.
// =====================================================================
const express = require("express");
const RestaurantFeatures = require("../models/restaurantFeatures");
const { requireManager } = require("../utils/auth");
const realtime = require("../utils/realtime");

const router = express.Router();

// 🧭 Pages that can be hidden from the sidebar. Dashboard + Settings can never be hidden
//    (so nobody can lock themselves out).
const HIDEABLE_PAGES = [
  "pos", "orders", "notifications", "delivery", "tables", "kitchen", "inventory", "stock",
  "createbill", "unpaidbill", "deliverybill", "totalorder", "foodcost", "billing", "staff", "attendance",
];
const DEFAULTS = { skipBeverageKot: false, vatEnabled: false, vatRate: 13, kitchenAlerts: false, hiddenPages: [], themeColor: "", themeBg: "" };
const HEX = /^#[0-9a-f]{6}$/i; // 🎨 theme color
const view = (doc) => ({
  skipBeverageKot: Boolean(doc?.skipBeverageKot),
  vatEnabled: Boolean(doc?.vatEnabled),
  vatRate: Number.isFinite(doc?.vatRate) ? doc.vatRate : 13,
  kitchenAlerts: Boolean(doc?.kitchenAlerts),
  hiddenPages: Array.isArray(doc?.hiddenPages) ? doc.hiddenPages.filter((p) => HIDEABLE_PAGES.includes(p)) : [],
  themeColor: HEX.test(doc?.themeColor || "") ? doc.themeColor.toLowerCase() : "",
  themeBg: HEX.test(doc?.themeBg || "") ? doc.themeBg.toLowerCase() : "",
});

router.get("/", async (req, res) => {
  try {
    const doc = await RestaurantFeatures.findOne({ restaurantId: req.auth.restaurantId }).lean();
    res.json({ success: true, data: doc ? view(doc) : DEFAULTS });
  } catch (e) {
    console.error("🔴 FEATURES GET:", e);
    res.status(500).json({ success: false, message: "Could not load features." });
  }
});

router.put("/", requireManager, async (req, res) => {
  try {
    const update = {};
    if (typeof req.body?.skipBeverageKot === "boolean") update.skipBeverageKot = req.body.skipBeverageKot;
    if (typeof req.body?.vatEnabled === "boolean") update.vatEnabled = req.body.vatEnabled;
    if (typeof req.body?.kitchenAlerts === "boolean") update.kitchenAlerts = req.body.kitchenAlerts;
    if (req.body?.hiddenPages !== undefined) {
      if (!Array.isArray(req.body.hiddenPages) || req.body.hiddenPages.some((p) => typeof p !== "string")) {
        return res.status(400).json({ success: false, message: "Invalid sidebar list." });
      }
      // only known pages, no duplicates
      update.hiddenPages = [...new Set(req.body.hiddenPages.filter((p) => HIDEABLE_PAGES.includes(p)))];
    }
    if (req.body?.themeColor !== undefined) {
      const c = req.body.themeColor;
      if (c !== "" && !(typeof c === "string" && HEX.test(c))) {
        return res.status(400).json({ success: false, message: "Theme color must look like #2563eb." });
      }
      update.themeColor = c.toLowerCase();
    }
    if (req.body?.themeBg !== undefined) {
      const c = req.body.themeBg;
      if (c !== "" && !(typeof c === "string" && HEX.test(c))) {
        return res.status(400).json({ success: false, message: "Background color must look like #fdf6e9." });
      }
      update.themeBg = c.toLowerCase();
    }
    if (req.body?.vatRate !== undefined) {
      const rate = Number(req.body.vatRate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        return res.status(400).json({ success: false, message: "VAT must be between 0 and 100 %." });
      }
      update.vatRate = Math.round(rate * 100) / 100;
    }
    const doc = await RestaurantFeatures.findOneAndUpdate(
      { restaurantId: req.auth.restaurantId },
      { $set: update, $setOnInsert: { restaurantId: req.auth.restaurantId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
        // Other open screens of this restaurant pick up the change (e.g. kitchen notifications on/off)
    realtime.emitToRestaurant(req.auth.restaurantId, "features:update", view(doc));
    res.json({ success: true, message: "Saved.", data: view(doc) });
  } catch (e) {
    console.error("🔴 FEATURES PUT:", e);
    res.status(500).json({ success: false, message: "Could not save features." });
  }
});

module.exports = router;