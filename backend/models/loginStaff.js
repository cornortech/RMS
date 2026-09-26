const mongoose = require("mongoose");

const restaurantStaffSchema = new mongoose.Schema(
  {
    staffName: { type: String, trim: true },
    restaurantName: { type: String, required: true, trim: true },
    id: { type: String, required: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ["Manager", "Waiter", "Kitchen Staff", "Cashier"], required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RestaurantStaff", restaurantStaffSchema, "restaurantstaffs");