const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: String,
            required: true,
            trim: true,
        },
        // Name is optional now: a customer can be saved with only a phone number
        customerName: { type: String, default: "", trim: true },
                customerPhone: { type: String, default: "", trim: true },
        customerAddress: { type: String, default: "", trim: true },
    },
    {
        timestamps: true,
    }
);

// Index for fast querying of customers by restaurant, ordered by newest first
customerSchema.index({ restaurantId: 1, createdAt: -1 });

const Customer = mongoose.model("CustomerName", customerSchema);
module.exports = Customer;