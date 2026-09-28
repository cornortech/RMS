const mongoose = require("mongoose");

const billItemSchema = mongoose.Schema({
    itemName: {
        type: String,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
        default: 1,
    },
    rate: {
        type: Number,
        required: true,
        default: 0,
    },
    total: {
        type: Number,
        required: true,
    },
}, { _id: false });
const restaurantBillingSchema = mongoose.Schema({
    restaurantName: {
        type: String,
        required: true,
    },
    location: {
        type: String,
    },
    panOrVat: {
        type: String,
    },
    invoiceNo: {
        type: String,
        required: true,
    },
    billTo: {
        type: String, 
        default: "Guest",
    },
    tableNumber: {
        type: String,
    },
    paymentMethod: {
        type: String,
        enum: ["Cash", "eSewa", "Khalti", "Fonepay", "IMEPay",  "Card", "Due","Pending","Split"],
        default: "Cash",
    },
    cashPaidMoney: {
        type: Number,
        default: 0,
    },
    eSewaPaidMoney: {
        type: Number,
        default: 0,
    },
    khaltiPaidMoney: {
        type: Number,
        default: 0,
    },
    fonepayPaidMoney: {
        type: Number,
        default: 0,
    },
    date: {
        type: Date,
        default: Date.now,
    },
    items: {
        type: [billItemSchema],
        required: true,
    },
    subtotal: {
        type: Number,
        required: true,
    },
    discountPercent: {
        type: Number,
        default: 0,
    },
    discount: {
        type: Number,
        default: 0,
    },
    vatRate: {
        type: Number,
        default: 0,
    },
    taxableAmount: {
        type: Number,
    },
    vatCollected: {
        type: Number,
    },
    grandTotal: {
        type: Number,
        required: true,
    },
    restaurantId: {
        type: String,
        required: true,
    },
    orderId: {
        type: String,
    },
},
{
    timestamps: true,
});

restaurantBillingSchema.index({ restaurantId: 1, createdAt: -1 });
const Bill = mongoose.model("RestaurantBill", restaurantBillingSchema);
module.exports = Bill;