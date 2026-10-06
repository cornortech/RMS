const mongoose = require("mongoose");

// Every single finger scan (or manual entry) exactly as it was received.
// Daily attendance is always calculated from these, so it can be rebuilt at any time.
const attendanceLogSchema = new mongoose.Schema(
  {
    restaurantUid: { type: String, required: true },
    deviceId: { type: String, required: true }, // DEV-001, or "MANUAL"
    serialNumber: { type: String, default: "" },
    deviceUserId: { type: String, required: true }, // the user ID on the machine, e.g. "101"
    staffRef: { type: String, default: null }, // staff _id; null until someone is linked to this device user ID
    punchTime: { type: String, required: true }, // "2026-10-01 09:05:12" (restaurant's local time)
    date: { type: String, required: true }, // "2026-10-01"
    minutes: { type: Number, required: true }, // minutes after midnight (9:05 -> 545)
    punchState: { type: String, default: "" },
    verifyMode: { type: String, default: "" },
    source: { type: String, enum: ["device", "manual"], default: "device" },
    note: { type: String, default: "" },
    addedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

// The same scan sent twice is stored only once
attendanceLogSchema.index({ restaurantUid: 1, deviceId: 1, deviceUserId: 1, punchTime: 1 }, { unique: true });
attendanceLogSchema.index({ restaurantUid: 1, staffRef: 1, date: 1 });
attendanceLogSchema.index({ restaurantUid: 1, deviceUserId: 1, staffRef: 1 });

module.exports = mongoose.model("AttendanceLog", attendanceLogSchema, "attendancelogs");