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
        restaurantId: { type: String, required: true, index: true },

        // Combo support
        isCombo: { type: Boolean, default: false },
        comboItems: { type: [comboItemSchema], default: [] },
    },
    { timestamps: true }
);

// Faster "which combos use this item?" lookups (used by DELETE /api/menu/:id)
restaurantMenuSchema.index({ restaurantId: 1, "comboItems.menuItemId": 1 });

const Menu = mongoose.model("RestaurantMenu", restaurantMenuSchema);
module.exports = Menu;