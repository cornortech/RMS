const mongoose = require("mongoose");

// Extra info for the ONLINE menu (photo, add-ons) without touching your existing Menu table.
const addonSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, default: 0, min: 0 },
    isAvailable: { type: Boolean, default: true },
  },
  { _id: false }
);

const deliveryMenuExtraSchema = new mongoose.Schema(
  {
    restaurantId: { type: String, required: true },
    menuItemId: { type: String, required: true },
    imageUrl: { type: String, default: "" },
    addons: { type: [addonSchema], default: [] },
    deliveryEnabled: { type: Boolean, default: true }, // hide an item from the website only
  },
  { timestamps: true }
);

deliveryMenuExtraSchema.index({ restaurantId: 1, menuItemId: 1 }, { unique: true });
module.exports = mongoose.model("DeliveryMenuExtra", deliveryMenuExtraSchema);