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

const DEFAULTS = { skipBeverageKot: false };
const view = (doc) => ({ skipBeverageKot: Boolean(doc?.skipBeverageKot) });

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