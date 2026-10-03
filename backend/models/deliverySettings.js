const mongoose = require("mongoose");

const areaSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    charge: { type: Number, default: 0, min: 0 },
    minOrder: { type: Number, default: 0, min: 0 }, // 0 = use the general minimum
    active: { type: Boolean, default: true },
  },
  { _id: true }
);

// One document per restaurant.
const deliverySettingsSchema = new mongoose.Schema(
  {
    restaurantId: { type: String, required: true, unique: true },
    acceptingOrders: { type: Boolean, default: true }, // the "open / closed" switch for the website
    acceptCOD: { type: Boolean, default: true },
    acceptOnline: { type: Boolean, default: true },
    sendToKitchen: { type: Boolean, default: true }, // also show accepted online orders on the Kitchen Display
    // How long the CUSTOMER may cancel by themselves on the tracking page:
    //   None = never | Pending = before you accept | Confirmed = until cooking starts | Preparing = until the food is ready
    customerCancelWindow: { type: String, enum: ["None", "Pending", "Confirmed", "Preparing"], default: "Confirmed" },
    onlinePaymentNote: { type: String, default: "" }, // e.g. "Pay to eSewa 98XXXXXXXX"

    baseCharge: { type: Number, default: 50, min: 0 }, // used when no delivery areas are set up
    minOrderAmount: { type: Number, default: 0, min: 0 },
    freeDeliveryAbove: { type: Number, default: 0, min: 0 }, // 0 = free delivery rule is off
    radiusKm: { type: Number, default: 0, min: 0 }, // 0 = no distance limit
    restaurantLat: { type: Number, default: null },
    restaurantLng: { type: Number, default: null },
    areas: { type: [areaSchema], default: [] },

    estimatedPrepMinutes: { type: Number, default: 30, min: 5 },
    orderSeq: { type: Number, default: 0 }, // counts orders to make DLV-1001, DLV-1002...
  },
  { timestamps: true }
);

module.exports = mongoose.model("DeliverySetting", deliverySettingsSchema);