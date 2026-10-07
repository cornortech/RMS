// =====================================================================
// CLOUDINARY — stores menu photos.
// The photo goes to Cloudinary; only its web address (URL) is saved in MongoDB.
// Keys come from the .env file (never from the browser, never in GitHub).
// =====================================================================
const cloudinary = require("cloudinary").v2;
const sharp = require("sharp");

const isConfigured = () =>
  Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

if (isConfigured()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true, // always https:// links
  });
} else {
  console.warn("⚠️ Cloudinary keys are missing in .env — menu photo upload is turned off.");
}

// Folder names may only use safe characters
const safeFolder = (s) => String(s || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);

// 1. Make the photo small and clean (also proves it is a real image):
//    turn it the right way up, max 800×800, WebP, remove hidden info (GPS etc.)
async function shrinkImage(buffer) {
  return sharp(buffer, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(800, 800, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

// 2. Send it to Cloudinary, inside this restaurant's own folder
async function uploadMenuImage(buffer, restaurantId) {
  const small = await shrinkImage(buffer);
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `atithi-rms/${safeFolder(restaurantId)}/menu`,
        resource_type: "image",
        format: "webp",
      },
      (err, result) => (err ? reject(err) : resolve({ url: result.secure_url, publicId: result.public_id }))
    );
    stream.end(small);
  });
}

// 3. Remove an old photo (errors are only logged — never stop the main action)
async function deleteImage(publicId) {
  if (!publicId || !isConfigured()) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch (e) {
    console.error("⚠️ Could not delete old Cloudinary image:", e.message);
  }
}

module.exports = { isConfigured, uploadMenuImage, deleteImage };