// =====================================================================
// TABLE QR ROUTES — logged-in restaurant only.
// Builds one QR code for every table of the logged-in restaurant.
// Because it reads req.auth.restaurantId (from the login token), a
// restaurant can only ever get QR codes for its own tables.
// =====================================================================
const express = require("express");
const QRCode = require("qrcode");
const Table = require("../models/table");

const router = express.Router();

// The website address customers open after scanning (your FRONTEND address).
// Set PUBLIC_APP_URL in backend/.env, e.g. https://myrms.com or http://192.168.1.5:3000
const getAppUrl = () => {
  const fromEnv = (process.env.PUBLIC_APP_URL || "").trim();
  const fallback = (process.env.ALLOWED_ORIGINS || "rms-seven-neon.vercel.app").split(",")[0].trim();
  return (fromEnv || fallback).replace(/\/+$/, "");
};

// ---------------------------------------------------------------------
// GET /api/table-qr
// Returns every table of this restaurant with its QR image (base64 PNG).
// New table added? It appears here automatically next time the page loads.
// ---------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const restaurantId = req.auth.restaurantId; // e.g. "resto01"
    const restaurantKey = req.auth.uid;         // the restaurant's database _id (goes inside the QR)

    const tables = await Table.find({ restaurantId })
      .select("tableName capacity")
      .sort({ createdAt: 1 })
      .lean();

    const appUrl = getAppUrl();

    const data = await Promise.all(
      tables.map(async (t) => {
        const scanUrl = `${appUrl}/scan/${restaurantKey}/${t._id}`;
        const qrImage = await QRCode.toDataURL(scanUrl, {
          width: 400,
          margin: 2,
          errorCorrectionLevel: "M",
        });
        return {
          tableId: t._id,
          tableName: t.tableName,
          capacity: t.capacity,
          scanUrl,
          qrImage,
        };
      })
    );

    // Natural sort so "Table 2" comes before "Table 10"
    data.sort((a, b) => a.tableName.localeCompare(b.tableName, undefined, { numeric: true }));

    return res.json({
      success: true,
      restaurantName: req.auth.restaurantName,
      count: data.length,
      data,
    });
  } catch (err) {
    console.error("🔴 TABLE QR ERROR:", err);
    return res.status(500).json({ success: false, message: "Could not generate table QR codes." });
  }
});

module.exports = router;