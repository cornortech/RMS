// All attendance calculations live here.
// Daily attendance is ALWAYS rebuilt from the stored scans, so receiving the same scan twice,
// receiving scans late, or adding a manual scan can never create wrong or duplicate records.
const mongoose = require("mongoose");
const Attendance = require("../models/attendance");
const AttendanceLog = require("../models/attendanceLog");
const AttendanceSetting = require("../models/attendanceSetting");
const RestaurantUser = require("../models/login");
const RestaurantStaff = require("../models/loginStaff");

const DUPLICATE_GAP_MINUTES = 2; // scans closer than this to the previous one are ignored

// ---------- time helpers ("HH:MM", "YYYY-MM-DD") ----------
const toMinutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
};
const toHHMM = (minutes) =>
  minutes == null ? "" : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const isValidTimezone = (tz) => {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// Today's date in the restaurant's own time zone (the server itself runs in UTC)
function localToday(timezone = "Asia/Kathmandu") {
  const tz = isValidTimezone(timezone) ? timezone : "Asia/Kathmandu";
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(`${v}T00:00:00Z`));
const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

function daysBetween(from, to) {
  const out = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end && out.length < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// "2026-10-01 09:05:12" -> { date, minutes, punchTime }  (null if the text is not a real time)
function parsePunchTime(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(text || "").trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s = "00"] = m;
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31 || Number(h) > 23 || Number(mi) > 59) return null;
  const date = `${y}-${mo}-${d}`;
  if (!isDate(date)) return null;
  return { date, minutes: Number(h) * 60 + Number(mi), punchTime: `${date} ${h.padStart(2, "0")}:${mi}:${s.padStart(2, "0")}` };
}

// ---------- settings ----------
async function getSettings(restaurantUid) {
  const found = await AttendanceSetting.findOne({ restaurantUid }).lean();
  if (found) return found;
  try {
    return (await AttendanceSetting.create({ restaurantUid })).toObject();
  } catch (err) {
    if (err.code === 11000) return AttendanceSetting.findOne({ restaurantUid }).lean();
    throw err;
  }
}

// ---------- the core rule: scans of one person on one day -> attendance ----------
// First scan = check-in. Last scan (if there are 2 or more) = check-out.
function computeDay(minutesList, settings) {
  const sorted = [...minutesList].sort((a, b) => a - b);
  const kept = [];
  for (const m of sorted) {
    if (!kept.length || m - kept[kept.length - 1] >= DUPLICATE_GAP_MINUTES) kept.push(m);
  }
  if (!kept.length) return null;

  const checkIn = kept[0];
  const checkOut = kept.length >= 2 ? kept[kept.length - 1] : null;
  const start = toMinutes(settings.workStart) ?? 600;
  const end = toMinutes(settings.workEnd) ?? 1200;
  const grace = Number(settings.graceMinutes) || 0;

  const lateMinutes = checkIn > start + grace ? checkIn - start : 0;
  const workingMinutes = checkOut != null ? checkOut - checkIn : 0;
  const overtimeMinutes = checkOut != null && checkOut > end ? checkOut - Math.max(end, checkIn) : 0;

  return {
    checkIn: toHHMM(checkIn),
    checkOut: toHHMM(checkOut),
    checkInMinutes: checkIn,
    checkOutMinutes: checkOut,
    workingMinutes,
    workingHours: Math.round((workingMinutes / 60) * 100) / 100,
    lateMinutes,
    overtimeMinutes,
    status: lateMinutes > 0 ? "late" : "present",
    punchCount: kept.length,
  };
}

const buildUpdate = (result, dayLogs) => {
  const firstDevice = dayLogs.find((l) => l.source === "device");
  return { ...result, deviceId: firstDevice ? firstDevice.deviceId : "MANUAL", hasManual: dayLogs.some((l) => l.source === "manual") };
};

// Rebuild many (staffRef, date) pairs at once with a few big database calls
async function recomputePairs(restaurantUid, pairs) {
  if (!pairs.length) return 0;
  const settings = await getSettings(restaurantUid);
  const unique = [...new Set(pairs.map((p) => `${p.staffRef}|${p.date}`))];

  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500).map((k) => k.split("|"));
    const logs = await AttendanceLog.find({
      restaurantUid,
      staffRef: mongoose.trusted({ $in: [...new Set(chunk.map(([s]) => s))] }),
      date: mongoose.trusted({ $in: [...new Set(chunk.map(([, d]) => d))] }),
    })
      .select("staffRef date minutes deviceId source")
      .lean();
    const byKey = new Map();
    for (const l of logs) {
      const k = `${l.staffRef}|${l.date}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(l);
    }

    const ops = chunk.map(([staffRef, date]) => {
      const dayLogs = byKey.get(`${staffRef}|${date}`) || [];
      const result = computeDay(dayLogs.map((l) => l.minutes), settings);
      if (!result) return { deleteOne: { filter: { restaurantUid, staffRef, date } } };
      return { updateOne: { filter: { restaurantUid, staffRef, date }, update: { $set: buildUpdate(result, dayLogs) }, upsert: true } };
    });

    try {
      await Attendance.bulkWrite(ops, { ordered: false });
    } catch (err) {
      // Another request created some of the same rows at the same moment - writing again updates them
      if (err.code !== 11000 && !(err.writeErrors || []).every((e) => e.code === 11000)) throw err;
      await Attendance.bulkWrite(ops, { ordered: false });
    }
  }
  return unique.length;
}

const recomputeDay = (restaurantUid, staffRef, date) => recomputePairs(restaurantUid, [{ staffRef, date }]);

// Staff of a restaurant. Staff are linked to their restaurant by restaurantName (same as the rest of the app).
async function staffOf(restaurantUid, select = "staffName id role isActive deviceUserId createdAt") {
  const restaurant = await RestaurantUser.findById(restaurantUid).select("restaurantName").lean();
  if (!restaurant) return [];
  return RestaurantStaff.find({ restaurantName: restaurant.restaurantName }).select(select).lean();
}

// Which staff member is "device user 101" in this restaurant?
async function staffMapFor(restaurantUid) {
  const map = new Map();
  for (const s of await staffOf(restaurantUid, "deviceUserId")) {
    if (s.deviceUserId) map.set(String(s.deviceUserId), String(s._id));
  }
  return map;
}

// Save scans that came from a machine, then update attendance. Safe to call with repeated scans.
async function ingestDeviceLogs(device, records) {
  const restaurantUid = device.restaurantUid;
  const map = await staffMapFor(restaurantUid);

  const docs = [];
  for (const r of records) {
    const t = parsePunchTime(r.punchTime);
    const deviceUserId = String(r.deviceUserId || "").trim().slice(0, 20);
    if (!t || !deviceUserId) continue;
    docs.push({
      restaurantUid,
      deviceId: device.deviceId,
      serialNumber: device.serialNumber,
      deviceUserId,
      staffRef: map.get(deviceUserId) || null,
      punchTime: t.punchTime,
      date: t.date,
      minutes: t.minutes,
      punchState: String(r.punchState ?? "").slice(0, 10),
      verifyMode: String(r.verifyMode ?? "").slice(0, 10),
      source: "device",
    });
  }
  if (!docs.length) return { received: records.length, saved: 0, matched: 0 };

  // Insert only scans we don't have yet (no error for duplicates)
  const ops = docs.map((d) => ({
    updateOne: {
      filter: { restaurantUid, deviceId: d.deviceId, deviceUserId: d.deviceUserId, punchTime: d.punchTime },
      update: { $setOnInsert: d },
      upsert: true,
    },
  }));
  let newIndexes = [];
  for (let i = 0; i < ops.length; i += 500) {
    const res = await AttendanceLog.bulkWrite(ops.slice(i, i + 500), { ordered: false });
    newIndexes = newIndexes.concat(Object.keys(res.upsertedIds || {}).map((k) => Number(k) + i));
  }

  const fresh = newIndexes.map((i) => docs[i]);
  const matched = fresh.filter((d) => d.staffRef);
  await recomputePairs(restaurantUid, matched.map((d) => ({ staffRef: d.staffRef, date: d.date })));
  return { received: records.length, saved: fresh.length, matched: matched.length };
}

// When a staff member gets a device user ID, attach their earlier unlinked scans
async function linkUnmatchedLogs(restaurantUid, staffRef, deviceUserId) {
  if (!deviceUserId) return 0;
  const filter = { restaurantUid, source: "device", deviceUserId: String(deviceUserId), staffRef: null };
  const logs = await AttendanceLog.find(filter).select("date").lean();
  if (!logs.length) return 0;
  await AttendanceLog.updateMany(filter, { $set: { staffRef } });
  await recomputePairs(restaurantUid, logs.map((l) => ({ staffRef, date: l.date })));
  return logs.length;
}

// Rebuild everything from a date onward (used by "Sync" and after settings change)
async function recomputeRecent(restaurantUid, fromDate) {
  const logs = await AttendanceLog.find({ restaurantUid, staffRef: mongoose.trusted({ $ne: null }), date: mongoose.trusted({ $gte: fromDate }) })
    .select("staffRef date")
    .lean();
  return recomputePairs(restaurantUid, logs.map((l) => ({ staffRef: l.staffRef, date: l.date })));
}

module.exports = {
  toMinutes,
  toHHMM,
  isValidTimezone,
  localToday,
  isDate,
  weekday,
  daysBetween,
  getSettings,
  computeDay,
  recomputeDay,
  recomputePairs,
  staffOf,
  ingestDeviceLogs,
  linkUnmatchedLogs,
  recomputeRecent,
};