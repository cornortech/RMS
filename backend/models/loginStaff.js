const mongoose = require("mongoose");

const restaurantStaffSchema = new mongoose.Schema(
  {
    staffName: { type: String, trim: true },
    restaurantName: { type: String, required: true, trim: true },
    id: { type: String, required: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ["Manager", "Waiter", "Kitchen Staff", "Cashier"], required: true },
    isActive: { type: Boolean, default: true },
        // Fingerprint machine link: the user ID on the machine (e.g. "101"). Fingerprints stay inside the machine.
    deviceUserId: { type: String, default: "" },
  },
  { timestamps: true }
);

restaurantStaffSchema.index({ restaurantName: 1, id: 1 });
module.exports = mongoose.model("RestaurantStaff", restaurantStaffSchema, "restaurantstaffs");