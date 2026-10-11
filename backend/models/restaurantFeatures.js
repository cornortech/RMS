const mongoose = require("mongoose");

// On/off switches for optional features, one document per restaurant.
const restaurantFeaturesSchema = new mongoose.Schema(
  {
    restaurantId: { type: String, required: true, unique: true },
    // ON → Beverage items are left out of the KOT / Kitchen Display.
    //      An order with ONLY beverages never goes to the kitchen (it goes straight to Create Bill).
    skipBeverageKot: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RestaurantFeatures", restaurantFeaturesSchema);