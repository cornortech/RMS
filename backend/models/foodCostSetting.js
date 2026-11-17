const mongoose = require("mongoose");

// =====================================================================
// 🍳 FOOD COST SETTINGS (one per restaurant)
//   estimatePercent → when an item has NO preparation cost written, its cost is
//                     guessed as this % of its selling price (most restaurants: 28–35 %)
//   useEstimate     → false = items without cost are left out of the profit
// =====================================================================
const foodCostSettingSchema = new mongoose.Schema(
  {
    restaurantId: { type: String, required: true, unique: true },
    estimatePercent: { type: Number, default: 33, min: 1, max: 95 },
    useEstimate: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("FoodCostSetting", foodCostSettingSchema, "foodcostsettings");