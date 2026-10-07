// =====================================================================
// MENU PHOTOS
//   POST   /api/menu/:id/image   (form field "image")  → upload / replace
//   DELETE /api/menu/:id/image                          → remove
// Before this file runs, index.js already checked:
//   ✔ logged in   ✔ Manager / Admin   ✔ this menu item belongs to this restaurant
// =====================================================================
const express = require("express");
const multer = require("multer");
const Menu = require("../models/menu");
const { isConfigured, uploadMenuImage, deleteImage } = require("../utils/cloudinary");

const router = express.Router();

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

const upload = multer({
  storage: multer.memoryStorage(), // kept in memory only, never written to the server disk
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5 MB, one file
  fileFilter: (req, file, cb) => cb(null, ALLOWED.includes(file.mimetype)),
});

// Turn multer errors (file too big etc.) into a friendly message
const takeImage = (req, res, next) =>
  upload.single("image")(req, res, (err) => {
    if (!err) return next();
    const msg = err.code === "LIMIT_FILE_SIZE" ? "Photo is too big. Please use a photo under 5 MB." : "Could not read the photo.";
    return res.status(400).json({ success: false, message: msg });
  });

router.post("/:id/image", takeImage, async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ success: false, message: "Photo upload is not set up on the server yet." });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Please choose a JPG, PNG or WebP photo." });
    }

    const item = await Menu.findOne({ _id: req.params.id, restaurantId: req.auth.restaurantId });
    if (!item) return res.status(404).json({ success: false, message: "Menu item not found." });

    let uploaded;
    try {
      uploaded = await uploadMenuImage(req.file.buffer, req.auth.restaurantId);
    } catch (e) {
      console.error("🔴 MENU IMAGE UPLOAD:", e.message);
      return res.status(400).json({ success: false, message: "This file is not a valid photo, or the upload failed. Please try another photo." });
    }

    const oldPublicId = item.imagePublicId;
    item.imageUrl = uploaded.url;
    item.imagePublicId = uploaded.publicId;
    await item.save();

    if (oldPublicId && oldPublicId !== uploaded.publicId) deleteImage(oldPublicId); // clean up the old photo

    return res.json({ success: true, message: "Photo saved.", data: { imageUrl: item.imageUrl } });
  } catch (e) {
    console.error("🔴 MENU IMAGE SAVE:", e);
    return res.status(500).json({ success: false, message: "Could not save the photo." });
  }
});

router.delete("/:id/image", async (req, res) => {
  try {
    const item = await Menu.findOne({ _id: req.params.id, restaurantId: req.auth.restaurantId });
    if (!item) return res.status(404).json({ success: false, message: "Menu item not found." });

    const oldPublicId = item.imagePublicId;
    item.imageUrl = "";
    item.imagePublicId = "";
    await item.save();
    deleteImage(oldPublicId);

    return res.json({ success: true, message: "Photo removed." });
  } catch (e) {
    console.error("🔴 MENU IMAGE DELETE:", e);
    return res.status(500).json({ success: false, message: "Could not remove the photo." });
  }
});

module.exports = router;