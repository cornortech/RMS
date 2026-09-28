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
        // The program this customer joined
    programId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "RestaurantLoyaltyProgram",
        index: true,
    },
    // Copied from the program (kept so older screens keep working)
    programName: {
        type: String,
        default: "",
        trim: true,
    },
    reward: {
        type: String,
        default: "",
        trim: true,
    },
    completeWithinDays: {
        type: Number,
        default: 1,
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
loyaltySchema.index({ restaurantId: 1, programId: 1 });

const Loyalty = mongoose.model("RestaurantLoyalty", loyaltySchema);
module.exports = Loyalty;