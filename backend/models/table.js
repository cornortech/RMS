const mongoose = require("mongoose");

const tableSchema = mongoose.Schema({
    restaurantId: {
        type: String,
        required: true,
    },
    tableName: {
        type: String,
        required: true,
    },
    capacity: {
        type: Number, 
        required: true,
        min: 1,
        default: 2,
    },
    occupiedSeats: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
    },
    status: {
        type: String,
        enum: ["Available", "Occupied", "Reserved", "Out of Service"],
        default: "Available",
    },
},
{
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// Virtual field to automatically calculate free space (available seats)
tableSchema.virtual('freeSeats').get(function() {
    return Math.max(0, this.capacity - this.occupiedSeats);
});

const Table = mongoose.model("RestaurantTable", tableSchema);
module.exports = Table;