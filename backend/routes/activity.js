const express = require("express");
const mongoose = require("mongoose");
const { RestaurantSession, ActivityEvent } = require("../models/activity");
const RestaurantUser = require("../models/login");
const RestaurantStaff = require("../models/loginStaff");
const Bill = require("../models/bill");
const { daysLeft } = require("../utils/subscription");

// =====================================================================
// 📋 ACTIVITY & SESSION LOG
//
// How "open / close" works:
//   1. When the app opens (after login) the browser calls  POST /api/activity/start  → session opened
//   2. Every 1 minute it calls                             POST /api/activity/ping   → "still open"
//   3. Log out                                             POST /api/activity/end    → closed (Logged out)
//      Close the tab / browser                             POST /api/activity/end    → closed (Tab closed)
//   4. PC switched off, sleep, internet lost (no signal for 5 minutes)
//      → the server closes it by itself at the time of the last signal (No signal)
//   5. Open again → a NEW session starts, so the log shows: open → close → open → close …
//   A page refresh does NOT make a new session (the same one continues).
// =====================================================================

const NO_SIGNAL_MS = 5 * 60 * 1000;     // no ping for 5 min → closed
const RESUME_MS = 3 * 60 * 1000;        // refresh within 3 min → same session continues
const MAX_RANGE_MS = 62 * 24 * 60 * 60 * 1000;
const UNPAID = ["Pending", "Due", "Delivery"];

const T = (q) => mongoose.trusted(q); // this server uses sanitizeFilter, so $ operators must be marked as ours

// ---------- small helpers ----------
const clientIp = (req) => String(req.ip || req.socket?.remoteAddress || "").replace(/^::ffff:/, "").slice(0, 64);

function deviceFrom(req) {
  const ua = String(req.get("user-agent") || "");
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /OPR\/|Opera/.test(ua) ? "Opera" :
    /SamsungBrowser/.test(ua) ? "Samsung Internet" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Safari\//.test(ua) ? "Safari" : "Browser";
  const os =
    /Android/.test(ua) ? "Android" :
    /iPhone/.test(ua) ? "iPhone" :
    /iPad/.test(ua) ? "iPad" :
    /Windows/.test(ua) ? "Windows" :
    /Mac OS X|Macintosh/.test(ua) ? "Mac" :
    /CrOS/.test(ua) ? "Chromebook" :
    /Linux/.test(ua) ? "Linux" : "Unknown";
  return `${browser} · ${os}`;
}

// Save one event. Never throws (a log problem must never break a login).
async function logEvent(req, restaurant, type, detail = "") {
  try {
    await ActivityEvent.create({
      restaurantUid: restaurant?._id || null,
      restaurantId: restaurant?.id || "",
      restaurantName: restaurant?.restaurantName || "",
      type,
      detail: String(detail).slice(0, 200),
      ip: req ? clientIp(req) : "",
      device: req ? deviceFrom(req) : "",
    });
  } catch (e) {
    console.error("🔴 ACTIVITY LOG:", e.message);
  }
}

// Close every session that stopped sending a signal (PC off, sleep, internet lost).
async function closeSilentSessions() {
  const cutoff = new Date(Date.now() - NO_SIGNAL_MS);
  const stale = await RestaurantSession.find({ closedAt: null, lastSeenAt: T({ $lt: cutoff }) })
    .select("_id lastSeenAt")
    .lean();
  await Promise.all(
    stale.map((s) =>
      RestaurantSession.updateOne({ _id: s._id, closedAt: null }, { $set: { closedAt: s.lastSeenAt, closeReason: "no-signal" } })
    )
  );
  return stale.length;
}

// Close all open sessions of one restaurant (used when it is deactivated).
async function closeAllFor(restaurantUid, reason) {
  await RestaurantSession.updateMany({ restaurantUid, closedAt: null }, { $set: { closedAt: new Date(), closeReason: reason } });
}

// ⏳ Subscription finished → account is deactivated automatically.
// Turn off with AUTO_DEACTIVATE_EXPIRED=false in .env
const autoDeactivateOn = () => process.env.AUTO_DEACTIVATE_EXPIRED !== "false";

async function deactivateForSubscription(restaurant, req = null) {
  const res = await RestaurantUser.updateOne(
    { _id: restaurant._id, isActive: true },
    { $set: { isActive: false, deactivatedReason: "subscription", deactivatedAt: new Date() } }
  );
  if (res.modifiedCount) {
    await closeAllFor(restaurant._id, "subscription");
    await logEvent(req, restaurant, "auto-deactivated", "Subscription days finished");
    console.log(`⏳ Auto-deactivated "${restaurant.restaurantName}" (subscription finished)`);
  }
}

async function deactivateExpiredRestaurants() {
  if (!autoDeactivateOn()) return 0;
  const list = await RestaurantUser.find({ isActive: true, isAdmin: T({ $ne: true }) })
    .select("id restaurantName isAdmin totalTime remainingTime lastTimeSync createdAt")
    .lean();
  const expired = list.filter((r) => daysLeft(r) <= 0);
  for (const r of expired) await deactivateForSubscription(r);
  return expired.length;
}

// Runs in the background while the server is on
function startActivityJobs() {
  const safe = (fn, name) => () => fn().catch((e) => console.error(`🔴 ${name}:`, e.message));
  setInterval(safe(closeSilentSessions, "SESSION SWEEP"), 60 * 1000);
  setInterval(safe(deactivateExpiredRestaurants, "SUBSCRIPTION CHECK"), 60 * 60 * 1000);
  setTimeout(safe(deactivateExpiredRestaurants, "SUBSCRIPTION CHECK"), 15 * 1000);
}

// Who is working on this session (only staff logins, read from the login token = trusted)
async function addStaff(session, req) {
  if (req.auth.kind !== "staff" || !req.auth.staffId) return;
  const already = (session.staff || []).some((s) => s.id === String(req.auth.staffId));
  if (already) return;
  const st = await RestaurantStaff.findById(req.auth.staffId).select("id staffName role").lean();
  if (!st) return;
  await RestaurantSession.updateOne(
    { _id: session._id },
    { $push: { staff: { id: String(req.auth.staffId), name: st.staffName || st.id, role: st.role, at: new Date() } } }
  );
}

// =====================================================================
// 1) THE APP (any logged-in restaurant) — open / still open / close
// =====================================================================
const sessionRouter = express.Router();

sessionRouter.post("/start", async (req, res) => {
  try {
    const now = new Date();
    const resumeId = req.body?.resumeId;

    // Page refresh → continue the same session
    if (typeof resumeId === "string" && mongoose.isValidObjectId(resumeId)) {
      const old = await RestaurantSession.findOne({ _id: resumeId, restaurantUid: req.auth.uid });
      if (old && (!old.closedAt || old.lastSeenAt.getTime() >= now.getTime() - RESUME_MS) && old.closeReason !== "logout" && old.closeReason !== "subscription") {
        old.closedAt = null;
        old.closeReason = null;
        old.lastSeenAt = now;
        await old.save();
        await addStaff(old, req);
        return res.json({ success: true, sessionId: String(old._id), resumed: true });
      }
    }

    const owner = await RestaurantUser.findById(req.auth.uid).select("isAdmin").lean();
    const s = await RestaurantSession.create({
      restaurantUid: req.auth.uid,
      restaurantId: req.auth.restaurantId,
      restaurantName: req.auth.restaurantName,
      isAdmin: owner?.isAdmin === true,
      openedAt: now,
      lastSeenAt: now,
      ip: clientIp(req),
      device: deviceFrom(req),
    });
    await addStaff(s, req);
    return res.status(201).json({ success: true, sessionId: String(s._id) });
  } catch (e) {
    console.error("🔴 SESSION START:", e.message);
    return res.status(500).json({ success: false, message: "Could not start the session log." });
  }
});

sessionRouter.post("/ping", async (req, res) => {
  try {
    const id = req.body?.sessionId;
    if (typeof id !== "string" || !mongoose.isValidObjectId(id)) return res.status(400).json({ success: false });
    const s = await RestaurantSession.findOneAndUpdate(
      { _id: id, restaurantUid: req.auth.uid, closedAt: null },
      { $set: { lastSeenAt: new Date() } },
      { new: true }
    );
    if (!s) return res.json({ success: true, closed: true }); // closed already → the app starts a new one
    await addStaff(s, req);
    return res.json({ success: true, closed: false });
  } catch (e) {
    return res.status(500).json({ success: false });
  }
});

sessionRouter.post("/end", async (req, res) => {
  try {
    const id = req.body?.sessionId;
    const reason = req.body?.reason === "logout" ? "logout" : "tab-closed";
    if (typeof id !== "string" || !mongoose.isValidObjectId(id)) return res.status(400).json({ success: false });
    const now = new Date();
    await RestaurantSession.updateOne(
      { _id: id, restaurantUid: req.auth.uid, closedAt: null },
      { $set: { closedAt: now, lastSeenAt: now, closeReason: reason } }
    );
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false });
  }
});

// =====================================================================
// 2) SUPER ADMIN — read the logs
// =====================================================================
const adminRouter = express.Router();

function parseRange(q) {
  const to = q.to ? new Date(String(q.to)) : new Date();
  let from = q.from ? new Date(String(q.from)) : new Date(to.getTime() - 24 * 60 * 60 * 1000);
  if (isNaN(to) || isNaN(from)) return null;
  if (to - from > MAX_RANGE_MS) from = new Date(to.getTime() - MAX_RANGE_MS);
  return { from, to };
}

// Paid bills (money received) in a time window
async function paidBills(restaurantIds, from, to) {
  const match = {
    status: T({ $ne: "Cancelled" }),
    paymentMethod: T({ $nin: UNPAID }),
    $or: [
      { paidAt: T({ $gte: from, $lte: to }) },
      { paidAt: null, date: T({ $gte: from, $lte: to }) }, // old bills without paidAt
    ],
  };
  if (restaurantIds) match.restaurantId = T({ $in: restaurantIds });
  const rows = await Bill.find(T(match))
    .select("restaurantId paidAt date grandTotal paymentMethod cashPaidMoney eSewaPaidMoney khaltiPaidMoney fonepayPaidMoney")
    .lean();
  return rows.map((b) => ({
    restaurantId: b.restaurantId,
    at: new Date(b.paidAt || b.date).getTime(),
    total: Number(b.grandTotal) || 0,
    method: b.paymentMethod || "Cash",
    split:
      b.paymentMethod === "Split"
        ? { Cash: +b.cashPaidMoney || 0, eSewa: +b.eSewaPaidMoney || 0, Khalti: +b.khaltiPaidMoney || 0, Fonepay: +b.fonepayPaidMoney || 0 }
        : null,
  }));
}

function sumBills(bills) {
  const byMethod = {};
  let total = 0;
  for (const b of bills) {
    total += b.total;
    if (b.split) {
      for (const [m, v] of Object.entries(b.split)) if (v) byMethod[m] = (byMethod[m] || 0) + v;
    } else {
      byMethod[b.method] = (byMethod[b.method] || 0) + b.total;
    }
  }
  return { total: Math.round(total * 100) / 100, bills: bills.length, byMethod };
}

// Total open time, counting overlapping sessions (2 tabs) only once
function openMs(sessions, from, to, now) {
  const parts = sessions
    .map((s) => [Math.max(+new Date(s.openedAt), +from), Math.min(+(s.closedAt ? new Date(s.closedAt) : now), +to)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0, curA = null, curB = null;
  for (const [a, b] of parts) {
    if (curB === null || a > curB) {
      if (curB !== null) total += curB - curA;
      curA = a; curB = b;
    } else curB = Math.max(curB, b);
  }
  if (curB !== null) total += curB - curA;
  return total;
}

const sessionView = (s, bills, now) => {
  const end = s.closedAt ? new Date(s.closedAt) : now;
  const mine = bills.filter((b) => b.restaurantId === s.restaurantId && b.at >= +new Date(s.openedAt) && b.at <= +end);
  return {
    _id: s._id,
    restaurantId: s.restaurantId,
    restaurantName: s.restaurantName,
    isAdmin: s.isAdmin,
    openedAt: s.openedAt,
    closedAt: s.closedAt,
    lastSeenAt: s.lastSeenAt,
    closeReason: s.closeReason,
    isOpen: !s.closedAt,
    durationMs: +end - +new Date(s.openedAt),
    ip: s.ip,
    device: s.device,
    staff: s.staff || [],
    money: sumBills(mine),
  };
};

// GET /api/admin/activity/overview?from=ISO   → live status of every restaurant + today's numbers
adminRouter.get("/overview", async (req, res) => {
  try {
    await closeSilentSessions();
    const now = new Date();
    const range = parseRange({ from: req.query.from, to: now.toISOString() });
    if (!range) return res.status(400).json({ success: false, message: "Bad date." });

    const [restaurants, todaySessions, openSessions, failed, bills] = await Promise.all([
      RestaurantUser.find({}).select("id restaurantName isActive isAdmin deactivatedReason totalTime remainingTime lastTimeSync createdAt").lean(),
      RestaurantSession.find({ $or: [{ openedAt: T({ $gte: range.from }) }, { closedAt: null }, { closedAt: T({ $gte: range.from }) }] }).lean(),
      RestaurantSession.find({ closedAt: null }).lean(),
      ActivityEvent.find({ type: T({ $in: ["login-failed", "blocked-deactivated", "blocked-expired"] }), at: T({ $gte: range.from }) }).lean(),
      paidBills(null, range.from, now),
    ]);

    // Latest session of each restaurant (uses the restaurantId + openedAt index)
    const lastList = await Promise.all(
      restaurants.map((r) => RestaurantSession.findOne({ restaurantId: r.id }).sort({ openedAt: -1 }).lean())
    );
    const lastBy = Object.fromEntries(restaurants.map((r, i) => [r.id, lastList[i]]));
    const rows = restaurants.map((r) => {
      const open = openSessions.filter((s) => s.restaurantId === r.id);
      const today = todaySessions.filter((s) => s.restaurantId === r.id);
      const last = lastBy[r.id] || null;
      const firstToday = today.reduce((m, s) => (!m || s.openedAt < m ? s.openedAt : m), null);
      const dl = daysLeft(r);
      return {
        _id: r._id,
        restaurantId: r.id,
        restaurantName: r.restaurantName,
        isActive: r.isActive,
        isAdmin: r.isAdmin === true,
        deactivatedReason: r.deactivatedReason || null,
        daysLeft: Number.isFinite(dl) ? Math.max(0, dl) : null,
        online: open.length > 0,
        openDevices: open.length,
        openSince: open.reduce((m, s) => (!m || s.openedAt < m ? s.openedAt : m), null),
        firstOpenToday: firstToday,
        lastSeenAt: last?.lastSeenAt || null,
        lastClosedAt: open.length ? null : last?.closedAt || null,
        lastCloseReason: open.length ? null : last?.closeReason || null,
        lastIp: last?.ip || "",
        lastDevice: last?.device || "",
        sessionsToday: today.length,
        openMsToday: openMs(today, range.from, now, now),
        today: sumBills(bills.filter((b) => b.restaurantId === r.id)),
        failedToday: failed.filter((f) => f.restaurantId === r.id).length,
      };
    });

    return res.json({
      success: true,
      data: {
        now,
        stats: {
          openNow: rows.filter((r) => r.online).length,
          sessionsToday: todaySessions.length,
          salesToday: sumBills(bills).total,
          billsToday: bills.length,
          failedToday: failed.length,
          deactivated: restaurants.filter((r) => !r.isActive).length,
        },
        restaurants: rows,
      },
    });
  } catch (e) {
    console.error("🔴 ACTIVITY OVERVIEW:", e);
    return res.status(500).json({ success: false, message: "Could not load the activity overview." });
  }
});

// GET /api/admin/activity/sessions?restaurantId=&from=&to=   → every open/close with money
adminRouter.get("/sessions", async (req, res) => {
  try {
    await closeSilentSessions();
    const range = parseRange(req.query);
    if (!range) return res.status(400).json({ success: false, message: "Bad date." });
    const now = new Date();
    const rid = typeof req.query.restaurantId === "string" ? req.query.restaurantId.trim() : "";

    const filter = {
      openedAt: T({ $lte: range.to }),
      $or: [{ closedAt: null }, { closedAt: T({ $gte: range.from }) }],
    };
    if (rid) filter.restaurantId = rid;
    else filter.isAdmin = T({ $ne: true }); // "All restaurants" = real restaurants (pick "Admin" in the list to see admin)
    const sessions = await RestaurantSession.find(T(filter)).sort({ openedAt: -1 }).limit(500).lean();

    const earliest = sessions.reduce((m, s) => Math.min(m, +new Date(s.openedAt)), +range.from);
    const ids = rid ? [rid] : [...new Set(sessions.map((s) => s.restaurantId))];
    const bills = ids.length ? await paidBills(ids, new Date(earliest), now) : [];
    const inRange = bills.filter((b) => b.at >= +range.from && b.at <= +range.to);

    const ipMap = {};
    for (const s of sessions) if (s.ip) ipMap[s.ip] = (ipMap[s.ip] || 0) + 1;

    return res.json({
      success: true,
      data: {
        sessions: sessions.map((s) => sessionView(s, bills, now)),
        summary: {
          sessions: sessions.length,
          openMs: openMs(sessions, range.from, range.to, now),
          money: sumBills(rid ? inRange : inRange.filter((b) => ids.includes(b.restaurantId))),
          ips: Object.entries(ipMap).sort((a, b) => b[1] - a[1]).map(([ip, count]) => ({ ip, count })),
          devices: [...new Set(sessions.map((s) => s.device).filter(Boolean))],
        },
      },
    });
  } catch (e) {
    console.error("🔴 ACTIVITY SESSIONS:", e);
    return res.status(500).json({ success: false, message: "Could not load sessions." });
  }
});

// GET /api/admin/activity/events?restaurantId=&from=&to=   → logins, wrong passwords, blocks…
adminRouter.get("/events", async (req, res) => {
  try {
    const range = parseRange(req.query);
    if (!range) return res.status(400).json({ success: false, message: "Bad date." });
    const filter = { at: T({ $gte: range.from, $lte: range.to }) };
    const rid = typeof req.query.restaurantId === "string" ? req.query.restaurantId.trim() : "";
    if (rid) filter.restaurantId = rid;
    const events = await ActivityEvent.find(filter).sort({ at: -1 }).limit(500).lean();
    return res.json({ success: true, data: events });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Could not load events." });
  }
});

module.exports = {
  sessionRouter,
  adminRouter,
  logEvent,
  closeAllFor,
  deactivateForSubscription,
  deactivateExpiredRestaurants,
  autoDeactivateOn,
  startActivityJobs,
};