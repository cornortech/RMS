const jsQR = require('jsqr');
const sharp = require('sharp');
const QRCode = require('qrcode');

/**
 * Decodes a static QR image buffer uploaded by the user to extract the EMV payload string.
 */
async function decodeQrImage(buffer) {
  try {
    // Convert image buffer to raw RGBA data using sharp so jsqr can process it
    const image = sharp(buffer).ensureAlpha();
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

    const code = jsQR(new Uint8ClampedArray(data), info.width, info.height);
    if (!code || !code.data) {
      throw new Error('Could not find a valid QR code in the uploaded image.');
    }
    return code.data;
  } catch (err) {
    throw new Error('Failed to parse QR image: ' + err.message);
  }
}

/**
 * Calculates CRC16-CCITT checksum required for EMVCo QR specifications.
 */
function calculateCRC16(payload) {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    let x = ((crc >> 8) ^ payload.charCodeAt(i)) & 0xFF;
    x ^= x >> 4;
    crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Safely strips trailing CRC (Tag 6304XXXX) if present at the end of the payload.
 */
function stripTrailingCrc(payload) {
  if (payload.length >= 8 && payload.substring(payload.length - 8, payload.length - 4) === '6304') {
    return payload.slice(0, -8);
  }
  return payload;
}

/**
 * Parses root-level EMV TLV (Tag-Length-Value) tags into structured objects.
 */
function parseEmvTags(payload) {
  const clean = stripTrailingCrc(payload);
  const tags = [];
  let idx = 0;

  while (idx < clean.length) {
    if (idx + 4 > clean.length) {
      tags.push({ tag: 'RAW', val: clean.substring(idx) });
      break;
    }

    const tag = clean.substring(idx, idx + 2);
    const len = parseInt(clean.substring(idx + 2, idx + 4), 10);

    if (isNaN(len) || idx + 4 + len > clean.length) {
      tags.push({ tag: 'RAW', val: clean.substring(idx) });
      break;
    }

    const val = clean.substring(idx + 4, idx + 4 + len);
    tags.push({ tag, val });
    idx += 4 + len;
  }

  return tags;
}

/**
 * Injects or updates a specific sub-tag inside a parent TLV structure (e.g., Tag 62 sub-tags).
 */
function setSubTag(parentVal, subTag, value) {
  const subTagStr = String(subTag).padStart(2, '0');
  const valStr = String(value);
  const tags = [];
  let idx = 0;
  let found = false;

  while (idx < parentVal.length) {
    if (idx + 4 > parentVal.length) break;
    const tag = parentVal.substring(idx, idx + 2);
    const len = parseInt(parentVal.substring(idx + 2, idx + 4), 10);

    if (isNaN(len) || idx + 4 + len > parentVal.length) break;

    const val = parentVal.substring(idx + 4, idx + 4 + len);

    if (tag === subTagStr) {
      found = true;
      tags.push({ tag: subTagStr, val: valStr });
    } else {
      tags.push({ tag, val });
    }
    idx += 4 + len;
  }

  if (!found) {
    tags.push({ tag: subTagStr, val: valStr });
  }

  return tags.map((t) => t.tag + String(t.val.length).padStart(2, '0') + t.val).join('');
}

/**
 * Injects or updates a specific EMV root tag into an EMV payload string.
 */
function setEmvTag(payload, tag, value) {
  const tagStr = String(tag).padStart(2, '0');
  const valStr = String(value);
  const tags = parseEmvTags(payload);

  let found = false;
  const updatedTags = tags.map((t) => {
    if (t.tag === tagStr) {
      found = true;
      return { tag: tagStr, val: valStr };
    }
    return t;
  });

  if (!found) {
    updatedTags.push({ tag: tagStr, val: valStr });
  }

  // Reassemble payload
  let reconstructed = '';
  for (const t of updatedTags) {
    if (t.tag === 'RAW') {
      reconstructed += t.val;
    } else {
      const lenStr = String(t.val.length).padStart(2, '0');
      reconstructed += t.tag + lenStr + t.val;
    }
  }

  // Append CRC placeholder '6304' and compute final checksum
  reconstructed += '6304';
  const finalCrc = calculateCRC16(reconstructed);
  return reconstructed + finalCrc;
}

/**
 * True only for a standard EMV merchant QR (Fonepay Business QR etc.): starts with 000201 and every
 * tag is readable. A PERSONAL eSewa / Khalti QR (for example {"eSewa_id": ...}) is NOT EMV, so an
 * amount can never be added to it.
 */
function isEmvPayload(payload) {
  if (typeof payload !== 'string' || !payload.startsWith('000201')) return false;
  const clean = stripTrailingCrc(payload);
  let idx = 0;
  while (idx < clean.length) {
    if (idx + 4 > clean.length) return false;
    const len = parseInt(clean.substring(idx + 2, idx + 4), 10);
    if (isNaN(len) || idx + 4 + len > clean.length) return false;
    idx += 4 + len;
  }
  return idx === clean.length;
}

/**
 * Modifies the static Fonepay/EMV QR payload to insert dynamic amount & bill number.
 */
function makeDynamicPayload(staticPayload, { amount, billNo } = {}) {
  if (!staticPayload) {
    throw new Error('Static QR payload is missing.');
  }

  
  // A personal QR can't carry an amount. Editing it would only BREAK it ("QR not supported"),
  // so we return it unchanged and the customer types the amount themselves.
  if (!isEmvPayload(staticPayload)) return staticPayload;

  let updated = staticPayload;

  // 1. Transaction Amount (EMV Tag '54')
  if (amount !== undefined && amount !== null) {
    const formattedAmount = Number(amount).toFixed(2);
    updated = setEmvTag(updated, '54', formattedAmount);
  }

  // 2. Point of Initiation Method (EMV Tag '01' -> '12' denotes Dynamic QR)
  updated = setEmvTag(updated, '01', '12');

  // 3. Bill / Reference Number (EMV Tag '62' -> Sub-tag '05' Reference Label)
  if (billNo) {
    const tags = parseEmvTags(updated);
    const tag62 = tags.find((t) => t.tag === '62');
    const existingVal = tag62 ? tag62.val : '';
    const updatedTag62Val = setSubTag(existingVal, '05', String(billNo));
    updated = setEmvTag(updated, '62', updatedTag62Val);
  }

  return updated;
}

/**
 * Generates a base64 Data URL QR code image from the final EMV payload string.
 */
async function renderQR(payload) {
  try {
    const dataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 300,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });
    return dataUrl;
  } catch (err) {
    throw new Error('Failed to render QR graphics: ' + err.message);
  }
}

module.exports = {
  decodeQrImage,
    makeDynamicPayload,
  isEmvPayload,
  renderQR,
  setEmvTag,
  calculateCRC16,
};