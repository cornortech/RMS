// Works out how many subscription days a restaurant has left.
// Blocking only happens when ENFORCE_SUBSCRIPTION=true.
const DAY_MS = 24 * 60 * 60 * 1000;

function daysLeft(restaurant) {
  const base = restaurant.remainingTime ?? restaurant.totalTime;
  if (base === undefined || base === null) return Infinity;
  const last = restaurant.lastTimeSync || restaurant.createdAt;
  const passed = last ? Math.max(0, Math.floor((Date.now() - new Date(last).getTime()) / DAY_MS)) : 0;
  return base - passed;
}

function isExpired(restaurant) {
  if (process.env.ENFORCE_SUBSCRIPTION !== "true") return false;
  if (restaurant.isAdmin) return false;
  return daysLeft(restaurant) <= 0;
}

const EXPIRED_MESSAGE = "Your subscription has expired. Please contact Atithi RMS (CornorTech) to renew.";

module.exports = { daysLeft, isExpired, EXPIRED_MESSAGE };