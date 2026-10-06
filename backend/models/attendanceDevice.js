const mongoose = require("mongoose");

// A fingerprint machine registered by a restaurant. It is identified by its serial number (SN),
// which it sends with every request. One serial number can belong to only one restaurant.
const attendanceDeviceSchema = new mongoose.Schema(
  {
    restaurantUid: { type: String, required: true }, // the restaurant's database _id (from the login token)
    deviceId: { type: String, required: true }, // DEV-001
    name: { type: String, required: true, trim: true },
    serialNumber: { type: String, required: true, uppercase: true, trim: true },
    location: { type: String, default: "" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    lastSeenAt: { type: Date },
    lastIp: { type: String, default: "" },
    lastLogAt: { type: Date },
    attlogStamp: { type: String, default: "None" },
    nextCommandId: { type: Number, default: 1 },
    pendingCommands: [{ _id: false, id: Number, cmd: String, createdAt: Date }],
    info: {
      firmware: { type: String, default: "" },
      userCount: { type: Number, default: 0 },
      fingerprintCount: { type: Number, default: 0 },
      logCount: { type: Number, default: 0 },
    },
    totalLogs: { type: Number, default: 0 },
  },
  { timestamps: true }
);

attendanceDeviceSchema.index({ serialNumber: 1 }, { unique: true });
attendanceDeviceSchema.index({ restaurantUid: 1, deviceId: 1 }, { unique: true });

module.exports = mongoose.model("AttendanceDevice", attendanceDeviceSchema, "attendancedevices");