// =====================================================================
// REAL-TIME (Socket.IO)
// Three kinds of people connect, each in their own "room":
//   staff    → room "r:<restaurantId>"   (sees only THEIR restaurant's events)
//   customer → room "t:<trackingToken>"  (sees only THEIR order)
//   rider    → room "rider:<riderId>"    (sees only orders assigned to them)
// If the socket.io package isn't installed yet, the server still starts
// and the pages fall back to refreshing every few seconds.
// =====================================================================
const jwt = require("jsonwebtoken");
const RestaurantUser = require("../models/login");
const RestaurantStaff = require("../models/loginStaff");
const DeliveryOrder = require("../models/deliveryOrder");
const Rider = require("../models/rider");
const { verifyRiderToken } = require("./riderAuth");

let io = null;

function init(httpServer, allowedOrigins) {
  let Server;
  try {
    ({ Server } = require("socket.io"));
  } catch {
    console.warn("⚠️ socket.io is not installed — live updates are OFF (pages will auto-refresh instead). Run: npm install socket.io");
    return null;
  }

  io = new Server(httpServer, {
    cors: { origin: allowedOrigins, methods: ["GET", "POST"] },
    maxHttpBufferSize: 1e5,
  });

  io.use(async (socket, next) => {
    try {
      const { kind, token, trackingToken } = socket.handshake.auth || {};

      if (kind === "customer") {
        if (typeof trackingToken !== "string" || trackingToken.length < 10) return next(new Error("bad token"));
        const o = await DeliveryOrder.findOne({ trackingToken }).select("_id").lean();
        if (!o) return next(new Error("not found"));
        socket.join(`t:${trackingToken}`);
        return next();
      }

      if (kind === "rider") {
        const claims = verifyRiderToken(token);
        const rider = await Rider.findOne({ _id: claims.rid, restaurantId: claims.restaurantId, isActive: true }).select("_id").lean();
        if (!rider) return next(new Error("rider not found"));
        socket.join(`rider:${claims.rid}`);
        return next();
      }

      if (kind === "staff") {
        const claims = jwt.verify(String(token || ""), process.env.JWT_SECRET);
        if (claims.kind !== "restaurant" && claims.kind !== "staff") return next(new Error("bad token"));
        const restaurant = await RestaurantUser.findById(claims.uid).select("id isActive restaurantName").lean();
        if (!restaurant || !restaurant.isActive) return next(new Error("inactive"));
        if (claims.kind === "staff") {
          const staff = await RestaurantStaff.findById(claims.sid).select("isActive restaurantName").lean();
          if (!staff || staff.isActive === false || String(staff.restaurantName).trim().toLowerCase() !== String(restaurant.restaurantName).trim().toLowerCase()) {
            return next(new Error("inactive staff"));
          }
        }
        // The room name comes from the DATABASE, not from anything the browser says.
        socket.join(`r:${restaurant.id}`);
        return next();
      }
      return next(new Error("unknown kind"));
    } catch {
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => socket.emit("ready", { ok: true }));
  console.log("✅ Socket.IO live updates ready");
  return io;
}

const emitToRestaurant = (restaurantId, event, payload) => io && io.to(`r:${restaurantId}`).emit(event, payload);
const emitToTracking = (token, event, payload) => io && io.to(`t:${token}`).emit(event, payload);
const emitToRider = (riderId, event, payload) => io && io.to(`rider:${riderId}`).emit(event, payload);

module.exports = { init, emitToRestaurant, emitToTracking, emitToRider };