// =====================================================================
// NOTIFICATION ROUTES — logged-in restaurant/staff only.
// Every query uses req.auth.restaurantId, so staff of one restaurant
// never see calls from another restaurant.
// =====================================================================
const express = require("express");
const mongoose = require("mongoose");
const WaiterCall = require("../models/waiterCall");

const router = express.Router();

// ---------------------------------------------------------------------
// GET /api/notifications?status=Pending   (status is optional: Pending | Attended | All)
// ---------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const filter = { restaurantId: req.auth.restaurantId };
    const status = typeof req.query.status === "string" ? req.query.status : "All";
    if (status === "Pending" || status === "Attended") filter.status = status;

    const calls = await WaiterCall.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    const pendingCount = await WaiterCall.countDocuments({
      restaurantId: req.auth.restaurantId,
      status: "Pending",
    });

    return res.json({ success: true, pendingCount, data: calls });
  } catch (err) {
    console.error("🔴 NOTIFICATIONS ERROR:", err);
    return res.status(500).json({ success: false, message: "Could not load notifications." });
  }
});

// ---------------------------------------------------------------------
// PATCH /api/notifications/:id/attend   → mark one call as handled
// ---------------------------------------------------------------------
router.patch("/:id/attend", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid id." });
    }

    const who = req.auth.kind === "staff" ? `${req.auth.role || "Staff"}` : "Owner";

    // Filtering by restaurantId too means nobody can mark another restaurant's call.
    const call = await WaiterCall.findOneAndUpdate(
      { _id: req.params.id, restaurantId: req.auth.restaurantId },
      { status: "Attended", attendedBy: who, attendedAt: new Date() },
      { new: true }
    );

    if (!call) return res.status(404).json({ success: false, message: "Not found." });
    return res.json({ success: true, data: call });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Could not update notification." });
  }
});

// ---------------------------------------------------------------------
// PATCH /api/notifications/attend-all   → mark every pending call as handled
// ---------------------------------------------------------------------
router.patch("/attend-all", async (req, res) => {
  try {
    const who = req.auth.kind === "staff" ? `${req.auth.role || "Staff"}` : "Owner";
    const result = await WaiterCall.updateMany(
      { restaurantId: req.auth.restaurantId, status: "Pending" },
      { status: "Attended", attendedBy: who, attendedAt: new Date() }
    );
    return res.json({ success: true, updated: result.modifiedCount });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Could not update notifications." });
  }
});

// ---------------------------------------------------------------------
// DELETE /api/notifications/attended   → clear the handled history
// ---------------------------------------------------------------------
router.delete("/attended", async (req, res) => {
  try {
    const result = await WaiterCall.deleteMany({ restaurantId: req.auth.restaurantId, status: "Attended" });
    return res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Could not clear notifications." });
  }
});

module.exports = router;