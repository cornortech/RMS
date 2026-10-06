// Staff attendance + fingerprint machines for ONE restaurant (Manager or Admin only).
// The restaurant always comes from the login token (req.auth.uid), never from the browser,
// so a restaurant can only ever see or change its own attendance.
const express = require("express");
const mongoose = require("mongoose");
const Attendance = require("../models/attendance");
const AttendanceLog = require("../models/attendanceLog");
const AttendanceSetting = require("../models/attendanceSetting");
const AttendanceDevice = require("../models/attendanceDevice");
const RestaurantStaff = require("../models/loginStaff");
const Counter = require("../models/counter");
const { isOnline, cleanSerial, queueCommand } = require("../services/deviceSyncService");
const svc = require("../services/attendanceService");

const router = express.Router();
const MAX_REPORT_DAYS = 92;

const str = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const uidOf = (req) => req.auth.uid;
const joinDate = (s) => (s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 10) : "0000-00-00");

async function nextNumber(key) {
  const c = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { upsert: true, new: true }).lean();
  return c.seq;
}

// Status of one staff member on one day when there is NO attendance record
function missingStatus(date, today, settings, staff) {
  if (date > today) return "upcoming";
  if (date < joinDate(staff)) return "not_joined";
  if ((settings.weeklyOffDays || []).includes(svc.weekday(date))) return "weekly_off";
  return date === today ? "not_in_yet" : "absent";
}

const activeStaff = async (req) => (await svc.staffOf(uidOf(req))).filter((s) => s.isActive !== false);

// ======================================================================
// Attendance
// ======================================================================

// GET /api/attendance?date=YYYY-MM-DD
router.get("/", async (req, res) => {
  const uid = uidOf(req);
  const settings = await svc.getSettings(uid);
  const today = svc.localToday(settings.timezone);
  const date = svc.isDate(req.query.date) ? req.query.date : today;

  const [staff, records] = await Promise.all([activeStaff(req), Attendance.find({ restaurantUid: uid, date }).lean()]);
  const byStaff = new Map(records.map((r) => [r.staffRef, r]));

  const rows = staff
    .map((s) => ({ s, ref: String(s._id) }))
    .filter(({ s, ref }) => date >= joinDate(s) || byStaff.has(ref))
    .sort((a, b) => (a.s.staffName || a.s.id).localeCompare(b.s.staffName || b.s.id))
    .map(({ s, ref }) => {
      const r = byStaff.get(ref);
      const working = !!r && !r.checkOut && date === today;
      return {
        staffRef: ref,
        fullName: s.staffName || s.id,
        loginId: s.id,
        role: s.role,
        deviceUserId: s.deviceUserId || "",
        checkIn: r ? r.checkIn : "",
        checkOut: r ? r.checkOut : "",
        workingMinutes: r ? r.workingMinutes : 0,
        lateMinutes: r ? r.lateMinutes : 0,
        overtimeMinutes: r ? r.overtimeMinutes : 0,
        hasManual: r ? r.hasManual : false,
        status: r ? (working ? "working" : r.status) : missingStatus(date, today, settings, s),
        isLate: !!r && r.status === "late",
      };
    });

  const count = (fn) => rows.filter(fn).length;
  res.json({
    success: true,
    date,
    today,
    isWeeklyOff: (settings.weeklyOffDays || []).includes(svc.weekday(date)),
    summary: {
      totalStaff: rows.length,
      present: count((r) => ["present", "late", "working"].includes(r.status)),
      late: count((r) => r.isLate),
      absent: count((r) => r.status === "absent" || r.status === "not_in_yet"),
      currentlyWorking: count((r) => r.status === "working"),
      notLinked: count((r) => !r.deviceUserId),
    },
    rows,
  });
});

// GET /api/attendance/settings
router.get("/settings", async (req, res) => {
  const s = await svc.getSettings(uidOf(req));
  res.json({ success: true, settings: { workStart: s.workStart, workEnd: s.workEnd, graceMinutes: s.graceMinutes, weeklyOffDays: s.weeklyOffDays, timezone: s.timezone } });
});

// PUT /api/attendance/settings
router.put("/settings", async (req, res) => {
  const b = req.body || {};
  const start = svc.toMinutes(b.workStart);
  const end = svc.toMinutes(b.workEnd);
  if (start == null || end == null) return fail(res, 400, "Enter start and end time like 10:00 and 20:00.");
  if (end <= start) return fail(res, 400, "End time must be after start time.");
  const grace = Number(b.graceMinutes);
  if (!Number.isInteger(grace) || grace < 0 || grace > 240) return fail(res, 400, "Grace time must be between 0 and 240 minutes.");
  const offDays = Array.isArray(b.weeklyOffDays) ? [...new Set(b.weeklyOffDays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))] : [];
  const timezone = str(b.timezone, 60) || "Asia/Kathmandu";
  if (!svc.isValidTimezone(timezone)) return fail(res, 400, "Time zone is not valid (example: Asia/Kathmandu).");

  const settings = await AttendanceSetting.findOneAndUpdate(
    { restaurantUid: uidOf(req) },
    { $set: { workStart: svc.toHHMM(start), workEnd: svc.toHHMM(end), graceMinutes: grace, weeklyOffDays: offDays, timezone } },
    { upsert: true, new: true, lean: true }
  );
  const today = svc.localToday(timezone);
  const rebuilt = await svc.recomputeRecent(uidOf(req), `${today.slice(0, 7)}-01`);
  res.json({ success: true, message: `Working hours saved. ${rebuilt} record(s) of this month recalculated.`, settings });
});

// GET /api/attendance/report?from&to
router.get("/report", async (req, res) => {
  const uid = uidOf(req);
  const settings = await svc.getSettings(uid);
  const today = svc.localToday(settings.timezone);
  const from = svc.isDate(req.query.from) ? req.query.from : `${today.slice(0, 7)}-01`;
  const to = svc.isDate(req.query.to) ? req.query.to : today;
  if (to < from) return fail(res, 400, "The end date must be after the start date.");
  const days = svc.daysBetween(from, to);
  if (days.length > MAX_REPORT_DAYS) return fail(res, 400, `Please choose at most ${MAX_REPORT_DAYS} days.`);

  const [staff, records] = await Promise.all([
    activeStaff(req),
    Attendance.find({ restaurantUid: uid, date: mongoose.trusted({ $gte: from, $lte: to }) }).lean(),
  ]);
  const key = (ref, d) => `${ref}|${d}`;
  const recMap = new Map(records.map((r) => [key(r.staffRef, r.date), r]));
  const offDays = settings.weeklyOffDays || [];
  const countable = days.filter((d) => d <= today);

  const staffRows = staff
    .map((s) => {
      const ref = String(s._id);
      let present = 0, late = 0, absent = 0, workMin = 0, overtimeMin = 0, checkInSum = 0;
      for (const d of countable) {
        if (d < joinDate(s)) continue;
        const r = recMap.get(key(ref, d));
        if (r) {
          present++;
          if (r.status === "late") late++;
          workMin += r.workingMinutes;
          overtimeMin += r.overtimeMinutes;
          checkInSum += r.checkInMinutes || 0;
        } else if (!offDays.includes(svc.weekday(d)) && d !== today) {
          absent++;
        }
      }
      return {
        staffRef: ref,
        fullName: s.staffName || s.id,
        role: s.role,
        presentDays: present,
        lateDays: late,
        absentDays: absent,
        totalWorkingHours: Math.round((workMin / 60) * 100) / 100,
        overtimeHours: Math.round((overtimeMin / 60) * 100) / 100,
        averageCheckIn: present ? svc.toHHMM(Math.round(checkInSum / present)) : "",
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const daily = days.map((d) => {
    const off = offDays.includes(svc.weekday(d));
    const eligible = staff.filter((s) => d >= joinDate(s));
    const dayRecs = eligible.map((s) => recMap.get(key(String(s._id), d))).filter(Boolean);
    return {
      date: d,
      weeklyOff: off,
      present: dayRecs.length,
      late: dayRecs.filter((r) => r.status === "late").length,
      absent: d > today || off ? 0 : Math.max(0, eligible.length - dayRecs.length),
    };
  });

  const workingDays = countable.filter((d) => !offDays.includes(svc.weekday(d))).length;
  res.json({ success: true, from, to, today, workingDays, staff: staffRows, daily });
});

// Finds a staff member of THIS restaurant by their database _id
async function findMyStaff(req, staffRef) {
  if (!mongoose.isValidObjectId(staffRef)) return null;
  const staff = await RestaurantStaff.findById(staffRef).select("staffName id role deviceUserId restaurantName createdAt").lean();
  if (!staff || staff.restaurantName !== req.auth.restaurantName) return null;
  return staff;
}

// POST /api/attendance/manual  { staffRef, date, time, note }
router.post("/manual", async (req, res) => {
  const uid = uidOf(req);
  const b = req.body || {};
  const staff = await findMyStaff(req, str(b.staffRef, 40));
  if (!staff) return fail(res, 404, "Staff member not found.");
  const minutes = svc.toMinutes(b.time);
  if (!svc.isDate(b.date) || minutes == null) return fail(res, 400, "Choose a date and a time like 09:05.");
  const settings = await svc.getSettings(uid);
  if (b.date > svc.localToday(settings.timezone)) return fail(res, 400, "You can't add attendance for a future date.");

  const staffRef = String(staff._id);
  try {
    await AttendanceLog.create({
      restaurantUid: uid,
      deviceId: "MANUAL",
      deviceUserId: staffRef,
      staffRef,
      punchTime: `${b.date} ${svc.toHHMM(minutes)}:00`,
      date: b.date,
      minutes,
      source: "manual",
      note: str(b.note, 200),
      addedBy: req.auth.kind === "staff" ? `staff:${req.auth.staffId}` : "owner",
    });
  } catch (err) {
    if (err.code === 11000) return fail(res, 400, "This exact time is already saved for this person.");
    throw err;
  }
  await svc.recomputeDay(uid, staffRef, b.date);
  res.status(201).json({ success: true, message: `Scan at ${svc.toHHMM(minutes)} added for ${staff.staffName || staff.id}.` });
});

// GET /api/attendance/history/:staffRef?from&to
router.get("/history/:staffRef", async (req, res) => {
  const uid = uidOf(req);
  const staff = await findMyStaff(req, req.params.staffRef);
  if (!staff) return fail(res, 404, "Staff member not found.");

  const settings = await svc.getSettings(uid);
  const today = svc.localToday(settings.timezone);
  const from = svc.isDate(req.query.from) ? req.query.from : `${today.slice(0, 7)}-01`;
  const to = svc.isDate(req.query.to) ? req.query.to : today;
  if (to < from) return fail(res, 400, "The end date must be after the start date.");
  const days = svc.daysBetween(from, to);
  if (days.length > MAX_REPORT_DAYS) return fail(res, 400, `Please choose at most ${MAX_REPORT_DAYS} days.`);

  const staffRef = String(staff._id);
  const range = mongoose.trusted({ $gte: from, $lte: to });
  const [records, logs] = await Promise.all([
    Attendance.find({ restaurantUid: uid, staffRef, date: range }).lean(),
    AttendanceLog.find({ restaurantUid: uid, staffRef, date: range }).sort({ punchTime: 1 }).select("date punchTime source note deviceId").lean(),
  ]);
  const recMap = new Map(records.map((r) => [r.date, r]));
  const scans = new Map();
  for (const l of logs) {
    if (!scans.has(l.date)) scans.set(l.date, []);
    scans.get(l.date).push({ id: String(l._id), time: l.punchTime.slice(11, 16), source: l.source, note: l.note, deviceId: l.deviceId });
  }

  const history = days.slice().reverse().map((d) => {
    const r = recMap.get(d);
    return {
      date: d,
      checkIn: r ? r.checkIn : "",
      checkOut: r ? r.checkOut : "",
      workingMinutes: r ? r.workingMinutes : 0,
      status: r ? (!r.checkOut && d === today ? "working" : r.status) : missingStatus(d, today, settings, staff),
      scans: scans.get(d) || [],
    };
  });
  res.json({ success: true, staff: { staffRef, fullName: staff.staffName || staff.id }, from, to, history });
});

// ======================================================================
// Staff <-> fingerprint ID
// ======================================================================

// GET /api/attendance/staff
router.get("/staff", async (req, res) => {
  const staff = await svc.staffOf(uidOf(req));
  res.json({
    success: true,
    staff: staff
      .map((s) => ({ staffRef: String(s._id), fullName: s.staffName || s.id, loginId: s.id, role: s.role, isActive: s.isActive !== false, deviceUserId: s.deviceUserId || "" }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName)),
  });
});

// PUT /api/attendance/staff/:staffRef/device  { deviceUserId }   ("" removes the link)
router.put("/staff/:staffRef/device", async (req, res) => {
  const staff = await findMyStaff(req, req.params.staffRef);
  if (!staff) return fail(res, 404, "Staff member not found.");
  const deviceUserId = str(req.body?.deviceUserId, 20);
  if (deviceUserId && !/^[A-Za-z0-9]{1,20}$/.test(deviceUserId)) {
    return fail(res, 400, "Device User ID can only have letters and numbers (for example 101).");
  }
  if (deviceUserId) {
    const other = await RestaurantStaff.findOne({
      restaurantName: req.auth.restaurantName,
      deviceUserId,
      _id: mongoose.trusted({ $ne: staff._id }),
    }).select("staffName id").lean();
    if (other) return fail(res, 400, `Device User ID ${deviceUserId} is already used by ${other.staffName || other.id}.`);
  }

  await RestaurantStaff.updateOne({ _id: staff._id }, { $set: { deviceUserId } });
  let linked = 0;
  try {
    linked = await svc.linkUnmatchedLogs(uidOf(req), String(staff._id), deviceUserId);
  } catch (err) {
    console.error("🔴 ATTENDANCE LINK ERROR:", err.message);
  }
  const name = staff.staffName || staff.id;
  res.json({
    success: true,
    message: deviceUserId
      ? `${name} is now Device User ID ${deviceUserId}.${linked ? ` ${linked} earlier scan(s) linked.` : ""}`
      : `${name} is no longer linked to the fingerprint machine.`,
  });
});

// ======================================================================
// Fingerprint machines
// ======================================================================
const showDevice = (d) => ({
  deviceId: d.deviceId,
  name: d.name,
  serialNumber: d.serialNumber,
  location: d.location,
  status: d.status,
  lastSeenAt: d.lastSeenAt,
  lastIp: d.lastIp,
  lastLogAt: d.lastLogAt,
  info: d.info,
  totalLogs: d.totalLogs,
  online: isOnline(d),
});
const findDevice = (req, id) => AttendanceDevice.findOne({ restaurantUid: uidOf(req), deviceId: str(id, 40) });

// GET /api/attendance/devices
router.get("/devices", async (req, res) => {
  const devices = await AttendanceDevice.find({ restaurantUid: uidOf(req) }).sort({ deviceId: 1 }).lean();
  res.json({ success: true, devices: devices.map(showDevice) });
});

// POST /api/attendance/devices/connect  { name, serialNumber, location }
router.post("/devices/connect", async (req, res) => {
  const b = req.body || {};
  const name = str(b.name, 80);
  const serialNumber = cleanSerial(b.serialNumber);
  if (!name || !serialNumber) return fail(res, 400, "Device name and serial number are required.");
  if (!/^[A-Z0-9-]{4,40}$/.test(serialNumber)) return fail(res, 400, "Serial number can only have letters and numbers.");
  if (await AttendanceDevice.exists({ serialNumber })) {
    return fail(res, 400, "This serial number is already registered. Check the number on the machine.");
  }
  const n = await nextNumber(`${uidOf(req)}:attendance-device`);
  try {
    const device = await AttendanceDevice.create({
      restaurantUid: uidOf(req),
      deviceId: `DEV-${String(n).padStart(3, "0")}`,
      name,
      serialNumber,
      location: str(b.location, 100),
    });
    res.status(201).json({ success: true, message: `${name} added. Now set up the machine to send data to this server.`, device: showDevice(device.toObject()) });
  } catch (err) {
    if (err.code === 11000) return fail(res, 400, "This serial number is already registered.");
    throw err;
  }
});

// PUT /api/attendance/devices/:deviceId  { name, location, status }
router.put("/devices/:deviceId", async (req, res) => {
  const device = await findDevice(req, req.params.deviceId);
  if (!device) return fail(res, 404, "Device not found.");
  const b = req.body || {};
  if (str(b.name, 80)) device.name = str(b.name, 80);
  if (typeof b.location === "string") device.location = str(b.location, 100);
  if (b.status === "active" || b.status === "inactive") device.status = b.status;
  await device.save();
  res.json({ success: true, message: `${device.name} updated.`, device: showDevice(device.toObject()) });
});

// DELETE /api/attendance/devices/:deviceId  (scans already received are kept)
router.delete("/devices/:deviceId", async (req, res) => {
  const device = await findDevice(req, req.params.deviceId);
  if (!device) return fail(res, 404, "Device not found.");
  await device.deleteOne();
  res.json({ success: true, message: `${device.name} removed. Attendance already received is kept.` });
});

// GET /api/attendance/devices/logs  - latest scans + machine users not linked to anyone
router.get("/devices/logs", async (req, res) => {
  const uid = uidOf(req);
  const [logs, unlinkedLogs, staff] = await Promise.all([
    AttendanceLog.find({ restaurantUid: uid }).sort({ punchTime: -1 }).limit(200).lean(),
    AttendanceLog.find({ restaurantUid: uid, source: "device", staffRef: null }).sort({ punchTime: -1 }).limit(3000).select("deviceUserId deviceId punchTime").lean(),
    svc.staffOf(uid, "staffName id"),
  ]);
  const names = new Map(staff.map((s) => [String(s._id), s.staffName || s.id]));

  const groups = new Map();
  for (const l of unlinkedLogs) {
    const k = `${l.deviceId}|${l.deviceUserId}`;
    const g = groups.get(k) || { deviceUserId: l.deviceUserId, deviceId: l.deviceId, scans: 0, lastScan: "" };
    g.scans++;
    if (l.punchTime > g.lastScan) g.lastScan = l.punchTime;
    groups.set(k, g);
  }

  res.json({
    success: true,
    logs: logs.map((l) => ({
      id: String(l._id),
      deviceId: l.deviceId,
      deviceUserId: l.source === "manual" ? "" : l.deviceUserId,
      staffName: l.staffRef ? names.get(l.staffRef) || "(deleted staff)" : "",
      punchTime: l.punchTime,
      source: l.source,
    })),
    unlinked: [...groups.values()].sort((a, b) => b.lastScan.localeCompare(a.lastScan)).slice(0, 50),
  });
});

// DELETE /api/attendance/devices/logs/:id  - only manual scans can be removed
router.delete("/devices/logs/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Scan not found.");
  const log = await AttendanceLog.findOne({ _id: req.params.id, restaurantUid: uidOf(req) });
  if (!log) return fail(res, 404, "Scan not found.");
  if (log.source !== "manual") return fail(res, 400, "Scans from the machine can't be deleted. Only manual entries can.");
  await log.deleteOne();
  if (log.staffRef) await svc.recomputeDay(uidOf(req), log.staffRef, log.date);
  res.json({ success: true, message: "Manual scan removed." });
});

// POST /api/attendance/devices/sync  { deviceId }  - ask the machine to send all scans again
router.post("/devices/sync", async (req, res) => {
  const uid = uidOf(req);
  const deviceId = str(req.body?.deviceId, 40);
  let message = "";
  if (deviceId) {
    const device = await findDevice(req, deviceId);
    if (!device) return fail(res, 404, "Device not found.");
    await AttendanceDevice.updateOne({ _id: device._id }, { $set: { attlogStamp: "None" } });
    await queueCommand(device, "CHECK");
    message = isOnline(device)
      ? `${device.name} will send its scans again within a minute. `
      : `${device.name} is offline. It will send its scans when it connects. `;
  }
  const settings = await svc.getSettings(uid);
  const d = new Date(`${svc.localToday(settings.timezone)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 31);
  const rebuilt = await svc.recomputeRecent(uid, d.toISOString().slice(0, 10));
  res.json({ success: true, message: `${message}${rebuilt} attendance record(s) recalculated.` });
});

module.exports = router;