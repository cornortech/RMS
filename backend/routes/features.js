// =====================================================================
// FEATURE SWITCHES   (Settings → Features)
//   GET /api/features   → any logged-in staff (the Kitchen Display needs it)
//   PUT /api/features   → Manager / Admin only
// The restaurant ALWAYS comes from the login token.
// =====================================================================
const express = require("express");
const RestaurantFeatures = require("../models/restaurantFeatures");
const { requireManager } = require("../utils/auth");

const router = express.Router();

const DEFAULTS = { skipBeverageKot: false, vatEnabled: false, vatRate: 13 };
const view = (doc) => ({
  skipBeverageKot: Boolean(doc?.skipBeverageKot),
  vatEnabled: Boolean(doc?.vatEnabled),
  vatRate: Number.isFinite(doc?.vatRate) ? doc.vatRate : 13,
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
    res.json({ success: true, message: "Saved.", data: view(doc) });
  } catch (e) {
    console.error("🔴 FEATURES PUT:", e);
    res.status(500).json({ success: false, message: "Could not save features." });
  }
});

module.exports = router;