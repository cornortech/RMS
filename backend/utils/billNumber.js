// =====================================================================
// OFFICIAL BILL NUMBERS (IRD)
// Every restaurant gets its own numbers: 1, 2, 3 ... with no gaps or repeats,
// starting again from 1 every fiscal year. The SERVER gives the number;
// the browser can't choose or change it.
//   invoiceNo example: "2082/83-00001"
// =====================================================================
const Counter = require("../models/counter");
const { fiscalYear } = require("./nepaliDate");

async function nextBillNumber(restaurantId, date = new Date()) {
  const fy = fiscalYear(date);
  const key = `${restaurantId}:bill:${fy}`;

  for (let attempt = 0; ; attempt++) {
    try {
      // $inc is atomic: two cashiers at the same second still get different numbers
      const doc = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { new: true, upsert: true });
      return {
        fiscalYear: fy,
        billNumber: doc.seq,
        invoiceNo: `${fy}-${String(doc.seq).padStart(5, "0")}`,
      };
    } catch (err) {
      // Two requests creating the first counter of the year at once: the loser tries again
      if (err.code !== 11000 || attempt >= 3) throw err;
    }
  }
}

module.exports = { nextBillNumber };