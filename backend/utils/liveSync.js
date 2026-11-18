// =====================================================================
// 🔄 LIVE SYNC — no more pressing F5
// After ANY successful change (add / edit / delete) by a logged-in user, the server tells
// every open screen of THAT restaurant what changed, e.g. { area: "orders" }.
// Each page then reloads only its own data, quietly, by itself.
//   area = the first word after /api  →  orders, bills, menu, tables, stocks, food-cost …
// Only the restaurant's own room gets the message (room name comes from the login token).
// =====================================================================
const realtime = require("./realtime");

const WRITE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SKIP_AREAS = new Set(["activity", "auth"]); // "still open" pings + logins are not data changes
const pending = new Map(); // "restaurantId|area" → timer (many quick changes = one message)

module.exports = function liveSync(req, res, next) {
  if (!WRITE.has(req.method)) return next();
  const path = String(req.path || "");
  const area = path.split("/").filter(Boolean)[0] || "";
  if (!area || SKIP_AREAS.has(area) || /login|logout|otp/i.test(path)) return next();

  res.on("finish", () => {
    if (res.statusCode >= 400) return; // failed → nothing changed
    const rid = req.auth && req.auth.restaurantId;
    if (!rid) return;
    const key = `${rid}|${area}`;
    if (pending.has(key)) return;
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        realtime.emitToRestaurant(rid, "data:changed", { area, at: Date.now() });
      }, 250)
    );
  });
  next();
};