const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const { decodeQrImage, makeDynamicPayload, renderQR, isEmvPayload } = require('../utils/fonepayDynamicQr');
const QrConfig = require('../models/QrConfig');
const { requireManager } = require('../utils/auth');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Always the logged-in restaurant, never what the browser sends
const mine = (req) => ({
  restaurantId: req.auth.restaurantId,
  restaurantName: req.auth.restaurantName,
});

const badId = (res) => res.status(400).json({ success: false, message: 'Invalid id.' });
const serverError = (res, e, where) => {
  console.error(`🔴 QR ${where}:`, e);
  return res.status(500).json({ success: false, message: 'Something went wrong.' });
};

// 1. List this restaurant's QRs
router.get('/', async (req, res) => {
  try {
    const { restaurantId } = mine(req);
    const configs = await QrConfig.find({ restaurantId }).select('-staticPayload');
    res.json({ success: true, data: configs });
  } catch (e) {
    serverError(res, e, 'LIST');
  }
});

// 2. Status (must stay before /:id)
router.get('/status', async (req, res) => {
  try {
    const { restaurantId } = mine(req);
    const query = { restaurantId };
    const providerName = typeof req.query.providerName === 'string' ? req.query.providerName.trim() : '';
    if (providerName) query.providerName = new RegExp(`^${escapeRegex(providerName)}$`, 'i');

    const configs = await QrConfig.find(query);
    res.json({ success: true, configured: configs.length > 0, providers: configs.map((c) => c.providerName) });
  } catch (e) {
    serverError(res, e, 'STATUS');
  }
});

// 3. One QR preview (only if it belongs to this restaurant)
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const config = await QrConfig.findOne({ _id: req.params.id, restaurantId: mine(req).restaurantId });
    if (!config) return res.status(404).json({ success: false, message: 'QR Configuration not found.' });

    const image = await renderQR(config.staticPayload);
    res.json({
      success: true,
      data: {
        _id: config._id,
        providerName: config.providerName,
        restaurantName: config.restaurantName,
        createdAt: config.createdAt,
        image,
      },
    });
  } catch (e) {
    serverError(res, e, 'READ');
  }
});

// 4. Upload / replace (Manager only)
router.post('/upload', requireManager, upload.single('qr'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No QR image file uploaded.' });

    const providerName = typeof req.body.providerName === 'string' ? req.body.providerName.trim() : '';
    if (!providerName) return res.status(400).json({ success: false, message: 'providerName is required.' });

    const { restaurantId, restaurantName } = mine(req);
    const payload = await decodeQrImage(req.file.buffer);

    const config = await QrConfig.findOneAndUpdate(
      { restaurantId, providerName },
      { restaurantId, restaurantName, providerName, staticPayload: payload },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: isEmvPayload(payload)
        ? `${providerName} QR saved successfully.`
        : `${providerName} QR saved. Note: this looks like a personal QR, so the bill amount cannot be filled in automatically and the customer must type the amount. For automatic amounts, upload a Fonepay Business QR.`,
      data: {
        _id: config._id,
        restaurantId: config.restaurantId,
        restaurantName: config.restaurantName,
        providerName: config.providerName,
      },
    });
  } catch (e) {
    // Decoding errors are the user's image, so show a clear message
    res.status(400).json({ success: false, message: 'Could not read a QR code from that image. Try a clearer photo.' });
  }
});

// 5. Update (Manager only, own restaurant only)
router.put('/:id', requireManager, upload.single('qr'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);

    const updateData = {};
    if (typeof req.body.providerName === 'string' && req.body.providerName.trim()) {
      updateData.providerName = req.body.providerName.trim();
    }
    if (req.file) updateData.staticPayload = await decodeQrImage(req.file.buffer);

    const config = await QrConfig.findOneAndUpdate(
      { _id: req.params.id, restaurantId: mine(req).restaurantId },
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-staticPayload');

    if (!config) return res.status(404).json({ success: false, message: 'QR Configuration not found.' });
    res.json({ success: true, message: 'QR Configuration updated.', data: config });
  } catch (e) {
    res.status(400).json({ success: false, message: 'Could not update this QR.' });
  }
});

// 6. Delete (Manager only, own restaurant only)
router.delete('/:id', requireManager, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const deleted = await QrConfig.findOneAndDelete({ _id: req.params.id, restaurantId: mine(req).restaurantId });
    if (!deleted) return res.status(404).json({ success: false, message: 'QR Configuration not found.' });
    res.json({ success: true, message: `${deleted.providerName} QR configuration deleted.` });
  } catch (e) {
    serverError(res, e, 'DELETE');
  }
});

// 7. Dynamic QR for a bill amount (any logged-in staff)
router.post('/dynamic', async (req, res) => {
  try {
    const { restaurantId } = mine(req);
    const amount = Number(req.body.amount);
    const billNo = typeof req.body.billNo === 'string' ? req.body.billNo.slice(0, 50) : undefined;
    const providerName = typeof req.body.providerName === 'string' ? req.body.providerName.trim() : '';
    const qrId = req.body.qrId;

    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
      return res.status(400).json({ success: false, message: 'Enter a valid amount.' });
    }

    let cfg;
    if (qrId && mongoose.isValidObjectId(qrId)) {
      cfg = await QrConfig.findOne({ _id: qrId, restaurantId });
    } else if (providerName) {
      cfg = await QrConfig.findOne({ restaurantId, providerName: new RegExp(`^${escapeRegex(providerName)}$`, 'i') });
    } else {
      cfg = await QrConfig.findOne({ restaurantId });
    }

    if (!cfg) {
      return res.status(404).json({
        success: false,
        code: 'NO_QR',
        message: `No QR configuration found for ${providerName || 'this restaurant'}.`,
      });
    }

    const payload = makeDynamicPayload(cfg.staticPayload, { amount, billNo });
    const image = await renderQR(payload);
        res.json({ success: true, providerName: cfg.providerName, restaurantName: cfg.restaurantName, image, amountIncluded: isEmvPayload(cfg.staticPayload) });
  } catch (e) {
    serverError(res, e, 'DYNAMIC');
  }
});

module.exports = router;