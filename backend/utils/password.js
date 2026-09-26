const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const isHashed = (v) => typeof v === "string" && /^\$2[aby]\$/.test(v);

async function hashPassword(plain) {
  return bcrypt.hash(String(plain), 12);
}

// Old accounts still hold plain-text passwords; support both until each logs in once.
async function verifyPassword(plain, stored) {
  if (typeof plain !== "string" || typeof stored !== "string" || !plain || !stored) return false;
  if (isHashed(stored)) return bcrypt.compare(plain, stored);
  const a = Buffer.from(plain), b = Buffer.from(stored);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const needsRehash = (stored) => !isHashed(stored);

function validateNewPassword(pw) {
  if (typeof pw !== "string" || pw.length < 8) return "Password must be at least 8 characters.";
  if (pw.length > 72) return "Password must be 72 characters or fewer.";
  return null;
}

module.exports = { hashPassword, verifyPassword, needsRehash, validateNewPassword };