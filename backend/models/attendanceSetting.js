const mongoose = require("mongoose");

// Working hours of one restaurant. Used to calculate late arrival and overtime.
const attendanceSettingSchema = new mongoose.Schema(
  {
    restaurantUid: { type: String, required: true, unique: true },
    workStart: { type: String, default: "10:00" },
    workEnd: { type: String, default: "20:00" },
    graceMinutes: { type: Number, default: 10, min: 0, max: 240 },
    weeklyOffDays: { type: [Number], default: [] }, // 0 = Sunday ... 6 = Saturday (restaurants usually open every day)
    timezone: { type: String, default: "Asia/Kathmandu" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AttendanceSetting", attendanceSettingSchema, "attendancesettings");