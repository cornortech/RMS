const mongoose = require("mongoose");

// One document = one "Call Waiter" press from a customer's phone.
const waiterCallSchema = new mongoose.Schema(
  {
    // Same value as table.restaurantId / menu.restaurantId (the restaurant's login ID).
    // Every query filters by this, so a restaurant only ever sees its own calls.
    restaurantId: { type: String, required: true, index: true },
    tableId: { type: String, required: true },
    tableName: { type: String, required: true },
    message: { type: String, default: "Customer is calling a waiter" },
    status: { type: String, enum: ["Pending", "Attended"], default: "Pending" },
    attendedBy: { type: String, default: "" },
    attendedAt: { type: Date },
  },
  { timestamps: true }
);

// Fast lookup for the notification page (newest pending first)
waiterCallSchema.index({ restaurantId: 1, status: 1, createdAt: -1 });

// Old calls are deleted automatically after 7 days so the collection stays small
waiterCallSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model("WaiterCall", waiterCallSchema);