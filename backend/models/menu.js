const mongoose = require("mongoose");

const comboItemSchema = new mongoose.Schema(
    {
        menuItemId: { type: String, required: true },
        itemName: { type: String, default: "" },
        quantity: { type: Number, default: 1, min: 1 },
        price: { type: Number, default: 0 },
    },
    { _id: false }
);

const restaurantMenuSchema = new mongoose.Schema(
    {
        itemName: { type: String, required: true, trim: true },
        description: { type: String, required: true, trim: true },
        category: { type: String, required: true },
        price: { type: Number, required: true, min: 0 },
        status: { type: String, default: "Available" },
        skuBarcodeReference: { type: String, default: "" },
        
        // 📷 Photo (the file lives in Cloudinary, we only keep its link here)
        imageUrl: { type: String, default: "" },
        imagePublicId: { type: String, default: "" }, // Cloudinary's name for the file (used to delete it)

        // 🏷️ OFFER: discount on this item for a few days (null = no offer). The normal price above never changes.
        offer: {
            type: new mongoose.Schema(
                {
                    kind: { type: String, enum: ["percent", "flat"], required: true },
                    value: { type: Number, required: true, min: 0 },
                    label: { type: String, default: "", maxlength: 40 },
                    startsAt: { type: Date, default: Date.now },
                    endsAt: { type: Date, default: null },
                    createdBy: { type: String, default: "" },
                },
                { _id: false }
            ),
            default: null,
        },
        restaurantId: { type: String, required: true, index: true },

        // Combo support
        isCombo: { type: Boolean, default: false },
        comboItems: { type: [comboItemSchema], default: [] },

        // 🍳 FOOD PREPARATION COST (what it costs the restaurant to make ONE plate)
        //    null = not written yet. Only Manager / Kitchen Staff / Cashier can see or change it.
        costPrice: { type: Number, default: null, min: 0 },
        // Every change is kept with its date, so old sales keep the cost they had at that time
        costHistory: {
            type: [{ _id: false, cost: { type: Number, default: null }, from: { type: Date, default: Date.now } }],
            default: [],
        },
        costUpdatedAt: { type: Date, default: null },
        costUpdatedBy: { type: String, default: "" },
    },
    { timestamps: true }
);

// Faster "which combos use this item?" lookups (used by DELETE /api/menu/:id)
restaurantMenuSchema.index({ restaurantId: 1, "comboItems.menuItemId": 1 });

const Menu = mongoose.model("RestaurantMenu", restaurantMenuSchema);
module.exports = Menu;