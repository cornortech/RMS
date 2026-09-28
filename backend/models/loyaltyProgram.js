const mongoose = require("mongoose");

// A loyalty program the restaurant offers, e.g.
// "Momo Lovers" - collect 100 points within 60 days - reward: 1 free plate of momo
const loyaltyProgramSchema = new mongoose.Schema(
  {
    restaurantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    reward: { type: String, required: true, trim: true },
    pointsRequired: { type: Number, default: 100, min: 1 }, // points needed to get the reward
    completeWithinDays: { type: Number, required: true, min: 1 }, // days a customer has, from joining
    description: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Program names are unique inside one restaurant
loyaltyProgramSchema.index({ restaurantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("RestaurantLoyaltyProgram", loyaltyProgramSchema);