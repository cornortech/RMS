const mongoose = require("mongoose");

const riderSchema = new mongoose.Schema(
  {
    restaurantId: { type: String, required: true }, // the restaurant this rider works for
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, default: "", trim: true },
    vehicleType: { type: String, enum: ["Bike", "Scooter", "Bicycle", "Car", "Other"], default: "Bike" },
    vehicleNumber: { type: String, default: "", trim: true },
    vehicleModel: { type: String, default: "", trim: true },
    status: { type: String, enum: ["Available", "Busy", "Offline"], default: "Offline" },
    isActive: { type: Boolean, default: true },
    // The rider logs in to the rider page with phone + this PIN (stored hashed, never plain).
    pinHash: { type: String, required: true, select: false },
    lastLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      updatedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

riderSchema.index({ restaurantId: 1, phone: 1 }, { unique: true });
module.exports = mongoose.model("DeliveryRider", riderSchema);