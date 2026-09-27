// =====================================================================
// IDEMPOTENCY MIDDLEWARE
// "Idempotent" = doing the same thing twice has the same result as once.
//
// The offline system gives every order/bill a unique key (a UUID) and sends
// it in the "Idempotency-Key" header. If the internet drops halfway and the
// same request is sent again later, this middleware sees the key was already
// used and returns the first result. So: NO duplicate orders, NO double bills.
// =====================================================================
const IdempotencyKey = require("../models/idempotencyKey");

const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
const STALE_AFTER_MS = 2 * 60 * 1000; // a "processing" key older than this is considered stuck

async function idempotency(req, res, next) {
  const key = req.get("Idempotency-Key");
  if (!key || !WRITE_METHODS.includes(req.method)) return next(); // normal request, nothing to do

  if (key.length > 100) {
    return res.status(400).json({ success: false, message: "Invalid Idempotency-Key." });
  }

  const restaurantId = req.auth.restaurantId;

  try {
    const existing = await IdempotencyKey.findOne({ restaurantId, key }).lean();

    if (existing) {
      // Already finished → send the saved answer again
      if (existing.status === "done") {
        res.set("Idempotent-Replay", "true");
        return res.status(existing.statusCode || 200).json(existing.body);
      }
      // Still running (or stuck) → ask the client to try again later
      const age = Date.now() - new Date(existing.createdAt).getTime();
      if (age < STALE_AFTER_MS) {
        return res.status(409).json({ success: false, message: "This request is still being processed." });
      }
      await IdempotencyKey.deleteOne({ _id: existing._id });
    }

    // Reserve the key BEFORE doing the work, so two copies can't run at once
    try {
      await IdempotencyKey.create({ restaurantId, key, status: "processing" });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ success: false, message: "This request is still being processed." });
      }
      throw err;
    }

    // When the route sends its answer, save a copy of it with the key
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 500) {
        const safeBody = JSON.parse(JSON.stringify(body ?? null));
        IdempotencyKey.updateOne(
          { restaurantId, key },
          { status: "done", statusCode: res.statusCode, body: safeBody }
        ).catch((e) => console.error("🔴 Idempotency save failed:", e.message));
      } else {
        // Server error → forget the key so the retry can really try again
        IdempotencyKey.deleteOne({ restaurantId, key }).catch(() => {});
      }
      return originalJson(body);
    };

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = idempotency;