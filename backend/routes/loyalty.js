const express = require("express");
const mongoose = require("mongoose");
const Loyalty = require("../models/loyalty");
const LoyaltyProgram = require("../models/loyaltyProgram");
const { requireManager } = require("../utils/auth");

const router = express.Router();
const DAY_MS = 24 * 60 * 60 * 1000;

// Always the logged-in restaurant, never what the browser sends
const rid = (req) => req.auth.restaurantId;
const text = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const wholeNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : NaN;
};

const findMember = (req) =>
  mongoose.isValidObjectId(req.params.id)
    ? Loyalty.findOne({ _id: req.params.id, restaurantId: rid(req) })
    : Promise.resolve(null);

const findProgram = (req, id) =>
  mongoose.isValidObjectId(id) ? LoyaltyProgram.findOne({ _id: id, restaurantId: rid(req) }) : Promise.resolve(null);

// Customers created with the old system had no program of their own.
// Create a program for each old program name and link those customers to it.
async function linkOldMembers(restaurantId) {
  const loose = await Loyalty.find({ restaurantId, programId: mongoose.trusted({ $exists: false }) }).lean();
  if (!loose.length) return;

  const byName = new Map();
  for (const m of loose) {
    const name = (m.programName || "").trim() || "General";
    if (!byName.has(name)) byName.set(name, m);
  }
  for (const [name, sample] of byName) {
    let program = await LoyaltyProgram.findOne({ restaurantId, name });
    if (!program) {
      try {
        program = await LoyaltyProgram.create({
          restaurantId,
          name,
          reward: sample.reward || "Reward",
          completeWithinDays: Math.max(Number(sample.completeWithinDays) || 30, 1),
          description: "",
        });
      } catch (err) {
        if (err.code !== 11000) throw err;
        program = await LoyaltyProgram.findOne({ restaurantId, name });
      }
    }
    const names = name === "General" ? mongoose.trusted({ $in: ["", "General", null] }) : name;
    await Loyalty.updateMany(
      { restaurantId, programName: names, programId: mongoose.trusted({ $exists: false }) },
      { $set: { programId: program._id, programName: program.name, reward: program.reward, completeWithinDays: program.completeWithinDays } }
    );
  }
}

// Adds "days left", "expired" and "reward ready" to a member
function withProgress(member, program) {
  const m = typeof member.toObject === "function" ? member.toObject() : { ...member };
  const joined = new Date(m.createdAt || Date.now()).getTime();
  const days = program?.completeWithinDays || m.completeWithinDays || 1;
  const expiresAt = new Date(joined + days * DAY_MS);
  const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / DAY_MS);
  const required = program?.pointsRequired || 0;
  return {
    ...m,
    joinedAt: m.createdAt,
    expiresAt,
    daysLeft: Math.max(daysLeft, 0),
    isExpired: daysLeft <= 0,
    pointsRequired: required,
    rewardReady: required > 0 && (m.points || 0) >= required,
  };
}

// ==========================================
// PROGRAMS
// ==========================================

// GET /api/loyalty/programs
router.get("/programs", async (req, res) => {
  try {
    const restaurantId = rid(req);
    await linkOldMembers(restaurantId);

    const [programs, members] = await Promise.all([
      LoyaltyProgram.find({ restaurantId }).sort({ createdAt: -1 }).lean(),
      Loyalty.find({ restaurantId }).select("programId points totalPointsEarned").lean(),
    ]);

    const data = programs.map((p) => {
      const mine = members.filter((m) => String(m.programId) === String(p._id));
      return {
        ...p,
        memberCount: mine.length,
        totalActivePoints: mine.reduce((s, m) => s + (m.points || 0), 0),
        rewardReadyCount: mine.filter((m) => (m.points || 0) >= p.pointsRequired).length,
      };
    });
    return res.json({ success: true, data });
  } catch (error) {
    console.error("🔴 Error loading loyalty programs:", error);
    return res.status(500).json({ success: false, message: "Failed to load loyalty programs." });
  }
});

function readProgram(body) {
  return {
    name: text(body.name, 80),
    reward: text(body.reward, 120),
    pointsRequired: wholeNumber(body.pointsRequired),
    completeWithinDays: wholeNumber(body.completeWithinDays),
    description: text(body.description, 300),
  };
}

function programProblem(p) {
  if (!p.name) return "Program name is required.";
  if (!p.reward) return "Reward is required.";
  if (!(p.pointsRequired >= 1)) return "Points needed must be at least 1.";
  if (!(p.completeWithinDays >= 1)) return "Complete within (days) must be at least 1.";
  return null;
}

// POST /api/loyalty/programs  (Manager)
router.post("/programs", requireManager, async (req, res) => {
  try {
    const restaurantId = rid(req);
    const p = readProgram(req.body || {});
    const problem = programProblem(p);
    if (problem) return res.status(400).json({ success: false, message: problem });

    if (await LoyaltyProgram.exists({ restaurantId, name: p.name })) {
      return res.status(400).json({ success: false, message: `A program named "${p.name}" already exists.` });
    }
    const program = await LoyaltyProgram.create({ restaurantId, ...p });
    return res.status(201).json({ success: true, message: `"${program.name}" created.`, data: program });
  } catch (error) {
    console.error("🔴 Error creating loyalty program:", error);
    return res.status(500).json({ success: false, message: "Failed to create the program." });
  }
});

// PUT /api/loyalty/programs/:programId  (Manager)
router.put("/programs/:programId", requireManager, async (req, res) => {
  try {
    const program = await findProgram(req, req.params.programId);
    if (!program) return res.status(404).json({ success: false, message: "Program not found." });

    const p = readProgram({ ...program.toObject(), ...(req.body || {}) });
    const problem = programProblem(p);
    if (problem) return res.status(400).json({ success: false, message: problem });

    if (p.name !== program.name && (await LoyaltyProgram.exists({ restaurantId: rid(req), name: p.name }))) {
      return res.status(400).json({ success: false, message: `A program named "${p.name}" already exists.` });
    }
    Object.assign(program, p);
    await program.save();

    // Keep the copy on each member in sync
    await Loyalty.updateMany(
      { restaurantId: rid(req), programId: program._id },
      { $set: { programName: program.name, reward: program.reward, completeWithinDays: program.completeWithinDays } }
    );
    return res.json({ success: true, message: `"${program.name}" updated.`, data: program });
  } catch (error) {
    console.error("🔴 Error updating loyalty program:", error);
    return res.status(500).json({ success: false, message: "Failed to update the program." });
  }
});

// DELETE /api/loyalty/programs/:programId  (Manager) - removes its members too
router.delete("/programs/:programId", requireManager, async (req, res) => {
  try {
    const program = await findProgram(req, req.params.programId);
    if (!program) return res.status(404).json({ success: false, message: "Program not found." });

    const removed = await Loyalty.deleteMany({ restaurantId: rid(req), programId: program._id });
    await program.deleteOne();
    return res.json({
      success: true,
      message: `"${program.name}" deleted${removed.deletedCount ? ` with ${removed.deletedCount} member(s)` : ""}.`,
    });
  } catch (error) {
    console.error("🔴 Error deleting loyalty program:", error);
    return res.status(500).json({ success: false, message: "Failed to delete the program." });
  }
});

// GET /api/loyalty/programs/:programId/members
router.get("/programs/:programId/members", async (req, res) => {
  try {
    const program = await findProgram(req, req.params.programId);
    if (!program) return res.status(404).json({ success: false, message: "Program not found." });

    const members = await Loyalty.find({ restaurantId: rid(req), programId: program._id }).sort({ points: -1 }).lean();
    return res.json({ success: true, program, data: members.map((m) => withProgress(m, program)) });
  } catch (error) {
    console.error("🔴 Error loading program members:", error);
    return res.status(500).json({ success: false, message: "Failed to load members." });
  }
});

// ==========================================
// MEMBERS (customers inside a program)
// ==========================================

// POST /api/loyalty  { programId, customerName, customerPhone, description, points }
router.post("/", async (req, res) => {
  try {
    const restaurantId = rid(req);
    const b = req.body || {};
    const phone = text(b.customerPhone, 20);
    if (!phone) return res.status(400).json({ success: false, message: "Customer phone number is required." });

    let program = await findProgram(req, b.programId);
    if (!program && text(b.programName)) program = await LoyaltyProgram.findOne({ restaurantId, name: text(b.programName, 80) });
    if (!program) return res.status(400).json({ success: false, message: "Please choose a loyalty program first." });

    if (await Loyalty.exists({ restaurantId, programId: program._id, customerPhone: phone })) {
      return res.status(400).json({ success: false, message: `This phone number is already in "${program.name}".` });
    }

    const startPoints = Math.max(wholeNumber(b.points) || 0, 0);
    const member = await Loyalty.create({
      restaurantId,
      programId: program._id,
      programName: program.name,
      reward: program.reward,
      completeWithinDays: program.completeWithinDays,
      customerPhone: phone,
      customerName: text(b.customerName, 80) || "Valued Customer",
      description: text(b.description, 300),
      points: startPoints,
      totalPointsEarned: startPoints,
    });
    return res.status(201).json({ success: true, message: `${member.customerName} joined "${program.name}".`, data: withProgress(member, program) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "This phone number is already in this program." });
    }
    console.error("🔴 Error creating loyalty member:", error);
    return res.status(500).json({ success: false, message: "Failed to add the customer." });
  }
});

// GET /api/loyalty?programId=...&search=...
router.get("/", async (req, res) => {
  try {
    const restaurantId = rid(req);
    await linkOldMembers(restaurantId);

    const filter = { restaurantId };
    if (mongoose.isValidObjectId(req.query.programId)) filter.programId = req.query.programId;

    const [all, programs] = await Promise.all([
      Loyalty.find(filter).sort({ updatedAt: -1 }).lean(),
      LoyaltyProgram.find({ restaurantId }).lean(),
    ]);
    const programOf = new Map(programs.map((p) => [String(p._id), p]));

    const q = text(req.query.search, 60).toLowerCase();
    const members = (q
      ? all.filter((m) =>
          [m.customerName, m.customerPhone, m.programName].some((v) => String(v || "").toLowerCase().includes(q))
        )
      : all
    ).map((m) => withProgress(m, programOf.get(String(m.programId))));

    const counts = {
      totalEnrollments: all.length,
      totalActivePoints: all.reduce((s, m) => s + (Number(m.points) || 0), 0),
      totalLifetimePoints: all.reduce((s, m) => s + (Number(m.totalPointsEarned) || 0), 0),
    };
    return res.json({ success: true, count: members.length, counts, data: members });
  } catch (error) {
    console.error("🔴 Error fetching loyalty members:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch loyalty members." });
  }
});

// PUT /api/loyalty/:id - edit a member's name, phone, description
router.put("/:id", async (req, res) => {
  try {
    const member = await findMember(req);
    if (!member) return res.status(404).json({ success: false, message: "Loyalty member not found." });

    const b = req.body || {};
    if (b.customerPhone !== undefined) {
      const phone = text(b.customerPhone, 20);
      if (!phone) return res.status(400).json({ success: false, message: "Phone number can't be empty." });
      if (phone !== member.customerPhone &&
          (await Loyalty.exists({ restaurantId: member.restaurantId, programId: member.programId, customerPhone: phone }))) {
        return res.status(400).json({ success: false, message: "This phone number is already in this program." });
      }
      member.customerPhone = phone;
    }
    if (b.customerName !== undefined) member.customerName = text(b.customerName, 80) || "Valued Customer";
    if (b.description !== undefined) member.description = text(b.description, 300);

    await member.save();
    return res.json({ success: true, message: "Customer updated.", data: member });
  } catch (error) {
    console.error("🔴 Error updating loyalty member:", error);
    return res.status(500).json({ success: false, message: "Failed to update the customer." });
  }
});

// PATCH /api/loyalty/:id/points  { action: "ADD" | "REDEEM" | "SET", points }
router.patch("/:id/points", async (req, res) => {
  try {
    const { action } = req.body || {};
    const numPoints = wholeNumber(req.body?.points);
    if (!["ADD", "REDEEM", "SET"].includes(action) || isNaN(numPoints) || numPoints < 0) {
      return res.status(400).json({ success: false, message: "Valid action (ADD, REDEEM, SET) and points (0 or more) are required." });
    }

    const member = await findMember(req);
    if (!member) return res.status(404).json({ success: false, message: "Loyalty member not found." });

    const current = Number(member.points) || 0;
    const lifetime = Number(member.totalPointsEarned) || 0;
    if (action === "ADD") {
      member.points = current + numPoints;
      member.totalPointsEarned = lifetime + numPoints;
    } else if (action === "REDEEM") {
      if (current < numPoints) return res.status(400).json({ success: false, message: "Not enough points." });
      member.points = current - numPoints;
    } else {
      member.points = numPoints;
      if (numPoints > lifetime) member.totalPointsEarned = numPoints;
    }
    await member.save();
    return res.json({ success: true, message: "Points updated.", data: member });
  } catch (error) {
    console.error("🔴 Error updating points:", error);
    return res.status(500).json({ success: false, message: "Failed to update points." });
  }
});

// DELETE /api/loyalty/:id - remove a customer from a program
router.delete("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid id." });
    const deleted = await Loyalty.findOneAndDelete({ _id: req.params.id, restaurantId: rid(req) });
    if (!deleted) return res.status(404).json({ success: false, message: "Loyalty member not found." });
    return res.json({ success: true, message: `${deleted.customerName} removed from the program.` });
  } catch (error) {
    console.error("🔴 Error deleting loyalty member:", error);
    return res.status(500).json({ success: false, message: "Failed to remove the customer." });
  }
});

module.exports = router;