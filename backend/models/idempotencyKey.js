const mongoose = require("mongoose");

// Remembers every write request that came with an "Idempotency-Key" header.
// If the SAME key arrives again (e.g. the offline queue retries), we send back
// the saved answer instead of saving the order/bill a second time.
const idempotencyKeySchema = new mongoose.Schema(
  {
    restaurantId: { type: String, required: true },
    key: { type: String, required: true },
    status: { type: String, enum: ["processing", "done"], default: "processing" },
    statusCode: { type: Number },
    body: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

// One key per restaurant (two restaurants can never clash)
idempotencyKeySchema.index({ restaurantId: 1, key: 1 }, { unique: true });

// Delete old keys automatically after 30 days
idempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model("IdempotencyKey", idempotencyKeySchema);