const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Loyalty = require("../models/loyalty");

// Always the logged-in restaurant, never what the browser sends
const rid = (req) => req.auth.restaurantId;

// Find a member ONLY inside this restaurant
const findMine = (req) =>
    mongoose.isValidObjectId(req.params.id)
        ? Loyalty.findOne({ _id: req.params.id, restaurantId: rid(req) })
        : Promise.resolve(null);

// 1. CREATE (Enroll customer in a specific program)
router.post("/", async (req, res) => {
    try {
        const restaurantId = rid(req);
        const phone = String(req.body.customerPhone ?? "").trim();
        const programName = String(req.body.programName ?? "").trim();
        const reward = String(req.body.reward ?? "").trim();
        const completeWithinDays = Number(req.body.completeWithinDays);

        if (!phone) return res.status(400).json({ success: false, message: "customerPhone is required." });
        if (!programName) return res.status(400).json({ success: false, message: "programName is required." });
        if (!reward) return res.status(400).json({ success: false, message: "reward is required." });
        if (!completeWithinDays || completeWithinDays < 1) {
            return res.status(400).json({ success: false, message: "completeWithinDays must be at least 1." });
        }

        // Check if customer is already enrolled in THIS specific program
        if (await Loyalty.findOne({ restaurantId, customerPhone: phone, programName })) {
            return res.status(400).json({ success: false, message: "Customer is already enrolled in this loyalty program." });
        }

        const initialPoints = Math.max(Number(req.body.points) || 0, 0);
        const newMember = await Loyalty.create({
            restaurantId,
            customerPhone: phone,
            customerName: String(req.body.customerName || "").trim() || "Valued Customer",
            programName,
            reward,
            completeWithinDays,
            description: String(req.body.description || "").trim(),
            points: initialPoints,
            totalPointsEarned: initialPoints,
        });

        return res.status(201).json({ success: true, message: "Customer successfully enrolled in program!", data: newMember });
    } catch (error) {
        console.error("🔴 Error creating loyalty enrollment:", error);
        return res.status(500).json({ success: false, message: "Failed to create customer enrollment." });
    }
});

// 2. READ (Fetch all or search by customer name, phone, or program name)
router.get("/", async (req, res) => {
    try {
        const restaurantId = rid(req);
        const q = String(req.query.search || "").trim().toLowerCase();

        const all = await Loyalty.find({ restaurantId }).sort({ updatedAt: -1 }).lean();
        const members = q
            ? all.filter(
                (m) =>
                    String(m.customerName || "").toLowerCase().includes(q) ||
                    String(m.customerPhone || "").toLowerCase().includes(q) ||
                    String(m.programName || "").toLowerCase().includes(q)
              )
            : all;

        const counts = {
            totalEnrollments: all.length,
            totalActivePoints: all.reduce((s, m) => s + (Number(m.points) || 0), 0),
            totalLifetimePoints: all.reduce((s, m) => s + (Number(m.totalPointsEarned) || 0), 0),
        };

        return res.status(200).json({ success: true, count: members.length, counts, data: members });
    } catch (error) {
        console.error("🔴 Error fetching loyalty members:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch loyalty members." });
    }
});

// 3. UPDATE details
router.put("/:id", async (req, res) => {
    try {
        const member = await findMine(req);
        if (!member) return res.status(404).json({ success: false, message: "Loyalty record not found." });

        const { customerName, customerPhone, programName, reward, completeWithinDays, description, points, totalPointsEarned } = req.body;

        // Handle Phone & Program uniqueness check if changed
        const newPhone = customerPhone !== undefined ? String(customerPhone).trim() : member.customerPhone;
        const newProgram = programName !== undefined ? String(programName).trim() : member.programName;

        if (newPhone !== member.customerPhone || newProgram !== member.programName) {
            const taken = await Loyalty.findOne({ 
                restaurantId: member.restaurantId, 
                customerPhone: newPhone, 
                programName: newProgram 
            });
            if (taken && String(taken._id) !== String(member._id)) {
                return res.status(400).json({ success: false, message: "An enrollment with this phone number and program name already exists." });
            }
        }

        if (customerPhone !== undefined) member.customerPhone = newPhone;
        if (programName !== undefined) member.programName = newProgram;
        if (customerName !== undefined) member.customerName = String(customerName).trim() || "Valued Customer";
        if (reward !== undefined) member.reward = String(reward).trim();
        if (completeWithinDays !== undefined && !isNaN(Number(completeWithinDays))) {
            member.completeWithinDays = Math.max(Number(completeWithinDays), 1);
        }
        if (description !== undefined) member.description = String(description).trim();
        if (points !== undefined && !isNaN(Number(points))) member.points = Math.max(Number(points), 0);
        if (totalPointsEarned !== undefined && !isNaN(Number(totalPointsEarned))) {
            member.totalPointsEarned = Math.max(Number(totalPointsEarned), 0);
        }

        await member.save();
        return res.status(200).json({ success: true, message: "Loyalty details updated successfully!", data: member });
    } catch (error) {
        console.error("🔴 Error updating customer details:", error);
        return res.status(500).json({ success: false, message: "Failed to update customer." });
    }
});

// 4. POINTS
router.patch("/:id/points", async (req, res) => {
    try {
        const { action } = req.body;
        const numPoints = Number(req.body.points);

        if (!["ADD", "REDEEM", "SET"].includes(action) || isNaN(numPoints) || numPoints < 0) {
            return res.status(400).json({
                success: false,
                message: "Valid action ('ADD', 'REDEEM', 'SET') and a non-negative points value are required.",
            });
        }

        const member = await findMine(req);
        if (!member) return res.status(404).json({ success: false, message: "Loyalty record not found." });

        const currentPoints = Number(member.points) || 0;
        const currentLifetime = Number(member.totalPointsEarned) || 0;

        if (action === "ADD") {
            member.points = currentPoints + numPoints;
            member.totalPointsEarned = currentLifetime + numPoints;
        } else if (action === "REDEEM") {
            if (currentPoints < numPoints) {
                return res.status(400).json({ success: false, message: "Insufficient point balance." });
            }
            member.points = currentPoints - numPoints;
        } else {
            member.points = numPoints;
            if (numPoints > currentLifetime) member.totalPointsEarned = numPoints;
        }

        await member.save();

        return res.status(200).json({ success: true, message: `Points updated successfully via ${action}!`, data: member });
    } catch (error) {
        console.error("🔴 Error updating points:", error);
        return res.status(500).json({ success: false, message: "Failed to update points." });
    }
});

// 5. DELETE
router.delete("/:id", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid id." });
        }
        const deleted = await Loyalty.findOneAndDelete({ _id: req.params.id, restaurantId: rid(req) });
        if (!deleted) return res.status(404).json({ success: false, message: "Loyalty record not found." });
        return res.status(200).json({ success: true, message: "Loyalty record deleted successfully." });
    } catch (error) {
        console.error("🔴 Error deleting loyalty profile:", error);
        return res.status(500).json({ success: false, message: "Failed to delete customer." });
    }
});

module.exports = router;