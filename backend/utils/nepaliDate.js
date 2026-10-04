// =====================================================================
// NEPALI DATE (Bikram Sambat) + FISCAL YEAR
// The server runs on UTC, so every date is first moved to Nepal time
// (UTC+5:45). Otherwise a bill made at 11 PM would get tomorrow's date.
// Nepal's fiscal year starts on Shrawan 1 (mid-July), e.g. "2082/83".
// =====================================================================
const converter = require("nepali-date-converter");
const NepaliDate = converter.default || converter;

const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;

// The calendar day in NEPAL for any moment in time
function nepalDay(date = new Date()) {
  const t = new Date(new Date(date).getTime() + NEPAL_OFFSET_MS);
  // Noon (local) of that day, so the server's own timezone can't shift it
  return new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 12);
}

// "2082-06-16"
function toBS(date = new Date()) {
  return new NepaliDate(nepalDay(date)).format("YYYY-MM-DD");
}

// "2082/83"  (Shrawan is month index 3)
function fiscalYear(date = new Date()) {
  const bs = new NepaliDate(nepalDay(date));
  const y = bs.getYear();
  const start = bs.getMonth() >= 3 ? y : y - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

module.exports = { toBS, fiscalYear, nepalDay };