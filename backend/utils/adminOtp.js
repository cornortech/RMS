// =====================================================================
// 🔐 ADMIN LOGIN — 6-digit email code (2-step login)
//   1. Admin ID + password correct → a code is emailed to ADMIN_OTP_EMAIL
//   2. The code works for 60 seconds, once only
//   3. 5 wrong tries → that login is cancelled
//   4. "Send code again" only after the old code has expired
// Email is sent over HTTPS (Render's free plan blocks normal SMTP), in one of two ways:
//   A) Google Apps Script (Gmail sends it — recommended):
//        GAS_URL=https://script.google.com/macros/s/.../exec   GAS_SECRET=...   ADMIN_OTP_EMAIL=...
//   B) Brevo:
//        BREVO_API_KEY=...   MAIL_FROM=...   ADMIN_OTP_EMAIL=...
// If GAS_URL is set, Google is used. Otherwise Brevo.
// =====================================================================
const crypto = require("crypto");
const AdminOtp = require("../models/adminOtp");

const CODE_TTL_MS = 60 * 1000;     // ⏱️ 1 minute
const MAX_ATTEMPTS = 5;
const MAX_RESENDS = 5;
const LOGIN_WINDOW_MS = 10 * 60 * 1000; // the whole login must finish within 10 minutes

const useGoogle = () => !!(process.env.GAS_URL && process.env.GAS_SECRET);
const useBrevo = () => !!(process.env.BREVO_API_KEY && process.env.MAIL_FROM);
const isConfigured = () => !!process.env.ADMIN_OTP_EMAIL && (useGoogle() || useBrevo());

// ga••••••20@gmail.com
const maskEmail = (email = "") => {
  const [name, domain] = String(email).split("@");
  if (!name || !domain) return "your email";
  const keep = name.length <= 4 ? 1 : 2;
  return `${name.slice(0, keep)}${"•".repeat(Math.max(name.length - keep * 2, 3))}${name.slice(-keep)}@${domain}`;
};

const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");

// Hash tied to this login, using the server secret (so a database leak can't reveal codes)
const hashCode = (challengeId, code) =>
  crypto.createHmac("sha256", process.env.JWT_SECRET || "").update(`${challengeId}:${code}`).digest("hex");

const sameHash = (a, b) => {
  const x = Buffer.from(String(a), "hex");
  const y = Buffer.from(String(b), "hex");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function buildEmail(code) {
  return {
    subject: `${code} is your Atithi RMS admin login code`,
    text: `Your Atithi RMS admin login code is ${code}. It expires in 1 minute. If you did not try to log in, change the admin password now.`,
    html: `
        <div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;border:1px solid #eee;border-radius:16px">
          <h2 style="margin:0 0 8px;color:#6b21a8">Atithi RMS — Admin login</h2>
          <p style="color:#475569;margin:0 0 16px">Use this code to finish logging in to the Admin Dashboard:</p>
          <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#1e003a;background:#f5f3ff;border-radius:12px;padding:14px;text-align:center">${code}</div>
          <p style="color:#e11d48;font-weight:bold;margin:16px 0 4px">⏱ This code expires in 1 minute.</p>
          <p style="color:#94a3b8;font-size:12px;margin:0">If you did not try to log in, someone knows the admin password — change it now.</p>
        </div>`,
  };
}

async function sendCodeEmail(code) {
  const mail = buildEmail(code);

  // A) Google Apps Script → Gmail sends the email (the script only ever sends to the admin address)
  if (useGoogle()) {
    const res = await fetch(process.env.GAS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: process.env.GAS_SECRET, subject: mail.subject, text: mail.text, html: mail.html }),
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    const out = await res.json().catch(() => null);
    if (!res.ok || !out || out.ok !== true) {
      throw new Error(`Google script ${res.status}: ${out ? out.error || JSON.stringify(out) : "no JSON reply (check the web app URL and access)"}`);
    }
    return;
  }

  // B) Brevo
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "Atithi RMS Security", email: process.env.MAIL_FROM },
      to: [{ email: process.env.ADMIN_OTP_EMAIL }],
      subject: mail.subject,
      textContent: mail.text,
      htmlContent: mail.html,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Brevo ${res.status}: ${text.slice(0, 200)}`);
  }
}

// Step 1: password was correct → create the login + email the code
// ✉️ Only ONE email per minute: a double click, or logging in again while the last code
//    still works, re-uses that code instead of sending a new email.
const inFlight = new Map(); // admin id → the login that is being started right now

async function startAdminOtp(user) {
  const key = String(user._id);
  if (inFlight.has(key)) return inFlight.get(key); // two requests at the same moment → one email
  const job = startAdminOtpNow(user).finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

async function startAdminOtpNow(user) {
  if (!isConfigured()) {
    const err = new Error("Admin email code is not set up on the server.");
    err.status = 503;
    throw err;
  }
  // A code was sent less than a minute ago and still works → use that one, no new email
  const last = await AdminOtp.findOne({ userId: String(user._id) }).sort({ createdAt: -1 });
  const msLeft = last ? last.expiresAt.getTime() - Date.now() : 0;
  if (last && msLeft > 5000 && last.attempts < MAX_ATTEMPTS) {
    return {
      challengeId: last.challengeId,
      expiresIn: Math.floor(msLeft / 1000),
      sentTo: maskEmail(process.env.ADMIN_OTP_EMAIL),
      reused: true,
    };
  }

  await AdminOtp.deleteMany({ userId: String(user._id) }); // only one pending login per admin

  const challengeId = crypto.randomBytes(24).toString("hex");
  const code = newCode();
  await AdminOtp.create({
    challengeId,
    userId: String(user._id),
    codeHash: hashCode(challengeId, code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  try {
    await sendCodeEmail(code);
  } catch (e) {
    await AdminOtp.deleteOne({ challengeId });
    console.error("🔴 ADMIN OTP EMAIL:", e.message);
    const err = new Error("Could not send the login code email. Please try again.");
    err.status = 502;
    throw err;
  }

  return { challengeId, expiresIn: CODE_TTL_MS / 1000, sentTo: maskEmail(process.env.ADMIN_OTP_EMAIL) };
}

module.exports = {
  AdminOtp,
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  MAX_RESENDS,
  LOGIN_WINDOW_MS,
  isConfigured,
  maskEmail,
  newCode,
  hashCode,
  sameHash,
  sendCodeEmail,
  startAdminOtp,
};