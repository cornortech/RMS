const mongoose = require("mongoose");

const orderItemSchema = mongoose.Schema({
    itemName: {
        type: String,
        required: true,
    },
    description: {
        type: String,
    },
    itemPrice: {
        type: Number,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
        default: 1,
    },
}, { _id: false });

const createOrderSchema = mongoose.Schema({
    restaurantId: {
        type: String,
        required: true,
    },
    staffId: {
        type: String,
        required: false, 
    },
    customerName: {
        type: String,
    },
        customerPhone: { type: String, default: "" },
    customerAddress: { type: String, default: "" },
    deliveryCharge: { type: Number, default: 0, min: 0 },
    // 💳 Paid already when the order was taken? "" = Not paid
    paidVia: { type: String, enum: ["", "Cash", "eSewa", "Khalti", "Fonepay"], default: "" },
    // 💰 When the order's bill was actually paid (Total Sales counts the order on this day)
    paidAt: { type: Date, default: null },
    // true = only drinks and the "no beverage KOT" feature was ON → sent straight to billing, not the kitchen
    autoServed: { type: Boolean, default: false },
    // 🛵 Online (website) orders
    fromOnline: { type: Boolean, default: false }, // can be billed in Create Bill once Ready
    skipKitchen: { type: Boolean, default: false }, // "Send to kitchen" is OFF → hidden from Kitchen Display        
    tableNumber: {
        type: String,
    },
    orderNote: {
        type: String,
    },
    items: {
        type: [orderItemSchema],
        required: true,
    },
    totalAmount: {
        type: Number,
        required: true,
    },
    orderStatus: {
        type: String,
        enum: ["Pending","Served", "Preparing", "Ready", "Completed", "Cancelled"],
        default: "Pending",
    },
    paymentStatus: {
    type: String,
    enum: ["Unpaid", "Paid", "Refunded", "Pending"],
    default: "Unpaid",
},
},
{
    timestamps: true,
});

createOrderSchema.index({ restaurantId: 1, createdAt: -1 });
const Order = mongoose.model("RestaurantOrder", createOrderSchema);
module.exports = Order;