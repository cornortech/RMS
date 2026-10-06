// Public endpoints for fingerprint machines (they can't log in like a person).
// A machine is only trusted if its serial number was registered by a restaurant manager,
// and everything it sends is saved ONLY under that restaurant.
const express = require("express");
const AttendanceDevice = require("../models/attendanceDevice");
const { handshakeResponse, parseAttlog, parseInfo, commandResponse, parseCommandReplies } = require("../services/fingerprintConnector");
const { touchDevice, removeCommands, cleanSerial } = require("../services/deviceSyncService");
const { ingestDeviceLogs } = require("../services/attendanceService");

const router = express.Router();

// Machines send plain text, sometimes without a content type
router.use(express.text({ type: () => true, limit: "2mb" }));

const reply = (res, text) => res.status(200).type("text/plain").send(text);
const ipOf = (req) => String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();

// Wraps a handler: any error is logged and the machine still gets "OK"
const safe = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    console.error(`[fingerprint] ${req.method} ${req.path} SN=${req.query.SN || "?"} failed:`, err.message);
    if (!res.headersSent) reply(res, "OK");
  }
};

// 1) "Hello" from the machine
router.get(["/cdata", "/cdata.aspx"], safe(async (req, res) => {
  const sn = cleanSerial(req.query.SN);
  const device = await touchDevice(sn, ipOf(req));
  if (req.query.options === "all" || !req.query.table) {
    return reply(res, handshakeResponse(sn, device ? device.attlogStamp : "None"));
  }
  reply(res, "OK");
}));

// 2) Data from the machine
router.post(["/cdata", "/cdata.aspx"], safe(async (req, res) => {
  const sn = cleanSerial(req.query.SN);
  const table = String(req.query.table || "").toUpperCase();
  const device = await touchDevice(sn, ipOf(req));
  if (!device) return reply(res, "OK"); // not registered: ignore the data

  if (table === "ATTLOG") {
    const records = parseAttlog(req.body);
    const result = await ingestDeviceLogs(device, records);
    const update = { $inc: { totalLogs: result.saved } };
    const set = {};
    if (result.saved > 0) set.lastLogAt = new Date();
    if (req.query.Stamp) set.attlogStamp = String(req.query.Stamp).slice(0, 30);
    if (Object.keys(set).length) update.$set = set;
    await AttendanceDevice.updateOne({ _id: device._id }, update);
    if (result.saved) {
      console.log(`[fingerprint] ${sn}: ${result.saved} new scan(s), ${result.matched} linked to staff`);
    }
    return reply(res, `OK: ${records.length}`);
  }
  reply(res, "OK"); // other data types are not needed
}));

// 3) "Anything for me?" - every few seconds. Also tells us the machine is online.
router.get(["/getrequest", "/getrequest.aspx"], safe(async (req, res) => {
  const sn = cleanSerial(req.query.SN);
  const info = parseInfo(req.query.INFO);
  const device = await touchDevice(sn, ipOf(req), info ? { info } : {});
  if (device && device.pendingCommands && device.pendingCommands.length) {
    return reply(res, commandResponse(device.pendingCommands));
  }
  reply(res, "OK");
}));

// 4) "I finished command 3"
router.post(["/devicecmd", "/devicecmd.aspx"], safe(async (req, res) => {
  const sn = cleanSerial(req.query.SN);
  const device = await touchDevice(sn, ipOf(req));
  if (device) await removeCommands(device._id, parseCommandReplies(req.body));
  reply(res, "OK");
}));

// Anything else the machine may ask for
router.all("/{*rest}", (req, res) => reply(res, "OK"));

module.exports = router;