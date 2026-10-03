// =====================================================================
// RIDER LOGIN
// Riders are not restaurant staff, so they get their OWN kind of token.
// It is signed with a DIFFERENT secret (derived from JWT_SECRET). That means
// a rider token is rejected by the normal requireAuth, so a rider can never
// open the manager APIs, even by editing the browser.
// =====================================================================
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const Rider = require("../models/rider");

const riderSecret = () => crypto.createHmac("sha256", process.env.JWT_SECRET).update("rider-app-v1").digest("hex");

const signRiderToken = ({ rid, restaurantId }) => jwt.sign({ kind: "rider", rid, restaurantId }, riderSecret(), { expiresIn: "12h" });

function verifyRiderToken(token) {
  const claims = jwt.verify(String(token || ""), riderSecret());
  if (claims.kind !== "rider") throw new Error("not a rider token");
  return claims;
}

async function requireRider(req, res, next) {
  try {
    const [scheme, token] = (req.headers.authorization || "").split(" ");
    if (scheme !== "Bearer" || !token) return res.status(401).json({ success: false, message: "Please log in first." });
    let claims;
    try {
      claims = verifyRiderToken(token);
    } catch {
      return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
    }
    const rider = await Rider.findOne({ _id: claims.rid, restaurantId: claims.restaurantId });
    if (!rider || !rider.isActive) return res.status(401).json({ success: false, message: "Rider account not found or deactivated." });
    req.rider = rider; // always scoped to ONE restaurant
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { signRiderToken, verifyRiderToken, requireRider };