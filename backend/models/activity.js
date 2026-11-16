const mongoose = require("mongoose");

// =====================================================================
// 📋 ACTIVITY LOG (Super Admin → Activity & Session Log)
//
// RestaurantSession = one "open → close" of the app on one browser tab.
//   • opened  when the restaurant logs in / opens the app
//   • closed  when they log out, close the tab/browser, or the PC stops sending a signal
// ActivityEvent = single things that happened (login, wrong password, blocked, auto-deactivated…)
// Both are deleted automatically after 1 year so the database does not grow forever.
// =====================================================================

const ONE_YEAR = 365 * 24 * 60 * 60;

const sessionSchema = new mongoose.Schema(
  {
    restaurantUid: { type: mongoose.Schema.Types.ObjectId, ref: "RestaurantUser", required: true },
    restaurantId: { type: String, required: true },
    restaurantName: { type: String, default: "" },
    isAdmin: { type: Boolean, default: false },
    openedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now }, // last "I am still open" signal
    closedAt: { type: Date, default: null },       // null = open right now
    // logout | tab-closed | no-signal | subscription | deactivated
    closeReason: { type: String, default: null },
    ip: { type: String, default: "" },
    device: { type: String, default: "" },         // e.g. "Chrome · Windows"
    staff: {
      type: [{ _id: false, id: String, name: String, role: String, at: Date }],
      default: [],
    },
  },
  { versionKey: false }
);
sessionSchema.index({ restaurantId: 1, openedAt: -1 });
sessionSchema.index({ closedAt: 1, lastSeenAt: 1 });
sessionSchema.index({ openedAt: 1 }, { expireAfterSeconds: ONE_YEAR });

const eventSchema = new mongoose.Schema(
  {
    restaurantUid: { type: mongoose.Schema.Types.ObjectId, ref: "RestaurantUser", default: null },
    restaurantId: { type: String, default: "" },
    restaurantName: { type: String, default: "" },
    // login | login-failed | blocked-deactivated | blocked-expired | auto-deactivated | reactivated | staff-login
    type: { type: String, required: true },
    detail: { type: String, default: "" },
    ip: { type: String, default: "" },
    device: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
eventSchema.index({ restaurantId: 1, at: -1 });
eventSchema.index({ at: 1 }, { expireAfterSeconds: ONE_YEAR });

module.exports = {
  RestaurantSession: mongoose.model("RestaurantSession", sessionSchema, "restaurantsessions"),
  ActivityEvent: mongoose.model("ActivityEvent", eventSchema, "activityevents"),
};