const mongoose = require("mongoose");

const restaurantUserSchema = new mongoose.Schema(
  {
    restaurantName: { type: String, required: true, trim: true },
    id: { type: String, required: true, trim: true },
    password: { type: String, required: true, select: false },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    location: { type: String, required: true, trim: true },
    PanOrVat: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    isAdmin: { type: Boolean, default: false },
    totalTime: { type: Number, default: 30 },
    remainingTime: { type: Number, default: 30 },
    // Marks the last moment we deducted elapsed days from remainingTime.
    // Defaults to "now" for brand-new accounts so day 1 doesn't get
    // charged immediately after signup.
    lastTimeSync: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RestaurantUser", restaurantUserSchema, "restaurantusers");