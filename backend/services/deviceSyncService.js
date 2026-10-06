// Keeps track of the fingerprint machines: who they belong to, when they were last online,
// and commands waiting to be sent to them.
const AttendanceDevice = require("../models/attendanceDevice");

const ONLINE_WINDOW_MS = 3 * 60 * 1000; // seen in the last 3 minutes = online
const isOnline = (device) => !!device.lastSeenAt && Date.now() - new Date(device.lastSeenAt).getTime() < ONLINE_WINDOW_MS;

const cleanSerial = (sn) => String(sn || "").trim().toUpperCase().slice(0, 40);

// Machines we don't know yet (helps when someone typed the serial number wrong). Kept in memory only.
const unknownSeen = new Map();
function rememberUnknown(serialNumber, ip) {
  if (!serialNumber) return;
  if (unknownSeen.size > 500) unknownSeen.clear();
  if (!unknownSeen.has(serialNumber)) console.warn(`[fingerprint] Unregistered device connected: SN=${serialNumber} from ${ip}`);
  unknownSeen.set(serialNumber, { ip, at: new Date() });
}

// Find an ACTIVE registered machine by serial number and mark it as seen
async function touchDevice(serialNumber, ip, extra = {}) {
  const sn = cleanSerial(serialNumber);
  if (!sn) return null;
  const device = await AttendanceDevice.findOneAndUpdate(
    { serialNumber: sn, status: "active" },
    { $set: { lastSeenAt: new Date(), lastIp: String(ip || "").slice(0, 60), ...extra } },
    { new: true }
  ).lean();
  if (!device) rememberUnknown(sn, ip);
  return device;
}

async function queueCommand(device, cmd) {
  const updated = await AttendanceDevice.findOneAndUpdate(
    { _id: device._id },
    { $inc: { nextCommandId: 1 } },
    { new: false }
  ).lean();
  const id = updated.nextCommandId;
  await AttendanceDevice.updateOne(
    { _id: device._id },
    { $push: { pendingCommands: { $each: [{ id, cmd, createdAt: new Date() }], $slice: -20 } } }
  );
  return id;
}

// The machine confirmed these command IDs - remove them from the waiting list
async function removeCommands(deviceMongoId, ids) {
  if (!ids.length) return;
  const device = await AttendanceDevice.findById(deviceMongoId).select("pendingCommands").lean();
  if (!device) return;
  const left = (device.pendingCommands || []).filter((c) => !ids.includes(c.id));
  await AttendanceDevice.updateOne({ _id: deviceMongoId }, { $set: { pendingCommands: left } });
}

module.exports = { isOnline, cleanSerial, touchDevice, queueCommand, removeCommands, ONLINE_WINDOW_MS };