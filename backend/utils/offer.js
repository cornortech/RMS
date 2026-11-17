// =====================================================================
// 🏷️ ITEM OFFER (discount on ONE menu item, for a few days)
//   offer = { kind: "percent" | "flat", value, label, startsAt, endsAt }
//   percent → 10 = 10 % off        flat → 30 = NPR 30 off
// The DATABASE price never changes. Every place that sells (POS, bills, QR menu,
// online orders) asks offerPrice() for the price to charge right now.
// =====================================================================

/** Active offer of an item right now, or null. */
function activeOffer(m, now = new Date()) {
  const o = m && m.offer;
  if (!o || !o.kind || !(Number(o.value) > 0)) return null;
  const t = now.getTime();
  if (o.startsAt && new Date(o.startsAt).getTime() > t) return null;
  if (o.endsAt && new Date(o.endsAt).getTime() <= t) return null;
  const base = Number(m.price) || 0;
  const off = o.kind === "percent" ? (base * Math.min(Number(o.value), 90)) / 100 : Math.min(Number(o.value), base);
  const price = Math.max(0, Math.round(base - off)); // whole rupees on the bill
  if (price >= base) return null;
  return {
    kind: o.kind,
    value: Number(o.value),
    label: o.label || "",
    startsAt: o.startsAt || null,
    endsAt: o.endsAt || null,
    price,
    original: base,
    percentOff: base > 0 ? Math.round(((base - price) / base) * 100) : 0,
  };
}

/** Price to charge right now (offer price if an offer is running, else the normal price). */
const offerPrice = (m, now) => {
  const a = activeOffer(m, now);
  return a ? a.price : Number(m?.price) || 0;
};

module.exports = { activeOffer, offerPrice };