const mongoose = require("mongoose");

// One row per staff member per day.
const attendanceSchema = new mongoose.Schema(
  {
    restaurantUid: { type: String, required: true },
    staffRef: { type: String, required: true },
    date: { type: String, required: true },
    checkIn: { type: String, default: "" },
    checkOut: { type: String, default: "" },
    checkInMinutes: { type: Number, default: null },
    checkOutMinutes: { type: Number, default: null },
    workingMinutes: { type: Number, default: 0 },
    workingHours: { type: Number, default: 0 },
    lateMinutes: { type: Number, default: 0 },
    overtimeMinutes: { type: Number, default: 0 },
    status: { type: String, enum: ["present", "late"], default: "present" },
    punchCount: { type: Number, default: 0 },
    deviceId: { type: String, default: "" },
    hasManual: { type: Boolean, default: false },
  },
  { timestamps: true }
);

attendanceSchema.index({ restaurantUid: 1, staffRef: 1, date: 1 }, { unique: true });
attendanceSchema.index({ restaurantUid: 1, date: 1 });

module.exports = mongoose.model("Attendance", attendanceSchema, "attendances");