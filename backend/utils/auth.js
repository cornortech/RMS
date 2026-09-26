const jwt = require("jsonwebtoken");
const RestaurantUser = require("../models/login");
const RestaurantStaff = require("../models/loginStaff");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET is missing or shorter than 32 characters. Set it in backend/.env");
}

// The token only says WHO you are. Name, role and active status are re-read from
// the database on every request, so deactivated users lose access immediately.
function signToken({ kind, uid, sid }) {
  return jwt.sign({ kind, uid, sid }, JWT_SECRET, { expiresIn: "12h" });
}

async function requireAuth(req, res, next) {
  try {
    const [scheme, token] = (req.headers.authorization || "").split(" ");
    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ success: false, message: "Please log in first." });
    }

    let claims;
    try {
      claims = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
    }

    const restaurant = await RestaurantUser.findById(claims.uid)
      .select("id restaurantName isActive isAdmin")
      .lean();

    if (!restaurant || !restaurant.isActive) {
      return res.status(401).json({ success: false, message: "Account not found or deactivated." });
    }

    let role = null;
    if (claims.kind === "staff") {
      const staff = await RestaurantStaff.findById(claims.sid)
        .select("role isActive restaurantName")
        .lean();

      // Normalize restaurant names to avoid rejection due to capitalization or trailing spaces
      const staffRestName = (staff?.restaurantName || "").trim().toLowerCase();
      const ownerRestName = (restaurant?.restaurantName || "").trim().toLowerCase();

      if (!staff || staff.isActive === false || staffRestName !== ownerRestName) {
        return res.status(401).json({ success: false, message: "Staff account not found or deactivated." });
      }
      role = staff.role;
    }

    req.auth = {
      kind: claims.kind,
      uid: String(restaurant._id),
      staffId: claims.sid || null,
      role,
      isAdmin: restaurant.isAdmin === true,
      restaurantId: restaurant.id,
      restaurantName: restaurant.restaurantName,
    };

    next();
  } catch (err) {
    next(err);
  }
}

const requireAdmin = (req, res, next) =>
  req.auth?.isAdmin ? next() : res.status(403).json({ success: false, message: "Admin access only." });

const requireManager = (req, res, next) =>
  req.auth?.isAdmin || (req.auth?.kind === "staff" && req.auth.role === "Manager")
    ? next()
    : res.status(403).json({ success: false, message: "Manager access only." });

module.exports = { signToken, requireAuth, requireAdmin, requireManager };