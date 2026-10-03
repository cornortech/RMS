const mongoose = require("mongoose");

// All the steps an online order can go through.
const STATUSES = ["Pending", "Confirmed", "Preparing", "Ready", "Assigned", "OutForDelivery", "Delivered", "Cancelled"];

const addonSchema = new mongoose.Schema({ name: String, price: { type: Number, default: 0 } }, { _id: false });

const itemSchema = new mongoose.Schema(
  {
    menuItemId: { type: String, required: true },
    itemName: { type: String, required: true },
    itemPrice: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    addons: { type: [addonSchema], default: [] },
    note: { type: String, default: "" }, // special instruction for this item
    lineTotal: { type: Number, required: true },
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  {
    status: String,
    at: { type: Date, default: Date.now },
    by: { type: String, default: "" }, // "Customer", "Manager", "Rider: Ram"...
    note: { type: String, default: "" },
  },
  { _id: false }
);

const deliveryOrderSchema = new mongoose.Schema(
  {
    // 🔑 Same value as menu.restaurantId / orders.restaurantId (the restaurant's login ID).
    // EVERY query filters by this, so one restaurant never sees another's deliveries.
    restaurantId: { type: String, required: true },
    orderNo: { type: String, required: true },
    // Secret code in the customer's tracking link. Hard to guess, so no login is needed.
    trackingToken: { type: String, required: true, unique: true },

    customer: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      address: { type: String, required: true },
      landmark: { type: String, default: "" },
      area: { type: String, default: "" },
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },

    items: { type: [itemSchema], required: true },
    orderNote: { type: String, default: "" },

    subTotal: { type: Number, required: true },
    deliveryCharge: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },

    paymentMethod: { type: String, enum: ["COD", "Online"], required: true },
    paymentStatus: { type: String, enum: ["Unpaid", "Pending", "Paid", "Refunded"], default: "Unpaid" },
    paymentRef: { type: String, default: "" }, // e.g. transaction id for online payments
    paymentProvider: { type: String, default: "" }, // future: "esewa", "khalti", "stripe"...

    status: { type: String, enum: STATUSES, default: "Pending" },
    statusHistory: { type: [historySchema], default: [] },
    cancelReason: { type: String, default: "" },

    riderId: { type: String, default: "" },
    riderName: { type: String, default: "" },
    riderPhone: { type: String, default: "" },

    etaMinutes: { type: Number, default: 40 },
    acceptedAt: Date,
    readyAt: Date,
    outForDeliveryAt: Date,
    deliveredAt: Date,
    cancelledAt: Date,

    source: { type: String, default: "website" },
  },
  { timestamps: true }
);

deliveryOrderSchema.index({ restaurantId: 1, createdAt: -1 });
deliveryOrderSchema.index({ restaurantId: 1, status: 1 });
deliveryOrderSchema.index({ restaurantId: 1, riderId: 1, status: 1 });

const DeliveryOrder = mongoose.model("DeliveryOrder", deliveryOrderSchema);
module.exports = DeliveryOrder;
module.exports.STATUSES = STATUSES;