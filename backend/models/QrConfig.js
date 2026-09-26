const mongoose = require('mongoose');

const QrConfigSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    restaurantName: {
      type: String,
      required: true,
      trim: true,
    },
    providerName: {
      type: String, 
      required: true,
      trim: true,
    },
    staticPayload: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Allows multiple QRs per restaurant, but enforces ONE QR per provider
QrConfigSchema.index({ restaurantId: 1, providerName: 1 }, { unique: true });

module.exports = mongoose.model('QrConfig', QrConfigSchema);