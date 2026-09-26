const mongoose = require("mongoose");

const loyaltySchema = mongoose.Schema({
    restaurantId: {
        type: String,
        required: true,
        index: true,
    },
    customerPhone: {
        type: String,
        required: true,
        trim: true,
    },
    customerName: {
        type: String,
        default: "Valued Customer",
        trim: true,
    },
    programName: {
        type: String,
        required: true,
        trim: true,
    },
    reward: {
        type: String,
        required: true,
        trim: true,
    },
    completeWithinDays: {
        type: Number,
        required: true,
        min: 1,
    },
    description: {
        type: String,
        trim: true,
        default: "",
    },
     points: {
        type: Number,
        default: 0,
        min: 0,
    },
    totalPointsEarned: {
        type: Number,
        default: 0,
        min: 0,
    },
}, {
    timestamps: true,
});

// Compound index: ensures a customer phone number is unique per restaurant & program
loyaltySchema.index({ restaurantId: 1, customerPhone: 1, programName: 1 }, { unique: true });

const Loyalty = mongoose.model("RestaurantLoyalty", loyaltySchema);
module.exports = Loyalty;