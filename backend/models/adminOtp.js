const mongoose = require("mongoose");

// 🔐 One pending admin login (waiting for the email code).
// The code itself is NEVER saved — only a hash of it.
const adminOtpSchema = new mongoose.Schema({
  challengeId: { type: String, required: true, unique: true }, // random, sent to the browser
  userId: { type: String, required: true },                     // the admin account (_id)
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },                    // code works for 60 seconds
  attempts: { type: Number, default: 0 },                       // wrong tries for this login
  resends: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, expires: 15 * 60 }, // MongoDB deletes it after 15 min
});

module.exports = mongoose.model("AdminOtp", adminOtpSchema);