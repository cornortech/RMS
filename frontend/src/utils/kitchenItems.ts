// =====================================================================
// 🍳 ITEM-LEVEL KITCHEN STATUS (same rules as backend/utils/kitchenItems.js)
// Each order line has its own progress: readyQty (finished), servedQty (given out), cooking.
// Old orders without these fields follow the order status.
// =====================================================================

export type LineAction = 'start' | 'ready' | 'ready1' | 'serve' | 'undo';
export type LineStatus = 'waiting' | 'cooking' | 'ready' | 'served';

export interface KLine {
  itemName: string;
  description?: string;
  note?: string;
  itemPrice: number;
  quantity: number;
  readyQty?: number;
  servedQty?: number;
  cooking?: boolean;
  noKitchen?: boolean;
  addedAt?: string | null;
  readyAt?: string | null;
}

export interface LineState {
  qty: number;
  readyQty: number;
  servedQty: number;
  cooking: boolean;
  toCook: number; // still to be made
  toServe: number; // finished, not given out yet
  status: LineStatus;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);
export const nameKey = (s: string) => String(s || '').trim().toLowerCase();

/** Full state of one line (old orders / whole-order changes follow the order status). */
export function lineState(line: KLine, orderStatus: string): LineState {
  const qty = Math.max(1, n(line.quantity) || 1);
  let readyQty = line.readyQty == null ? 0 : Math.min(n(line.readyQty), qty);
  let servedQty = line.servedQty == null ? 0 : Math.min(n(line.servedQty), qty);
  let cooking = !!line.cooking;
  if (['Ready', 'Served', 'Completed'].includes(orderStatus)) readyQty = qty;
  if (['Served', 'Completed'].includes(orderStatus)) servedQty = qty;
  if (orderStatus === 'Preparing' && line.readyQty == null) cooking = true;
  servedQty = Math.min(servedQty, readyQty);
  if (readyQty >= qty) cooking = false;
  const status: LineStatus =
    servedQty >= qty ? 'served' : readyQty >= qty ? 'ready' : cooking || readyQty > 0 ? 'cooking' : 'waiting';
  return { qty, readyQty, servedQty, cooking, toCook: qty - readyQty, toServe: readyQty - servedQty, status };
}

/** Every line with its real numbers filled in (so one change never touches the others). */
export function materialize(items: KLine[], orderStatus: string): KLine[] {
  return (items || []).map((l) => {
    const s = lineState(l, orderStatus);
    return { ...l, readyQty: s.readyQty, servedQty: s.servedQty, cooking: s.cooking };
  });
}

/** One kitchen / waiter action on a materialized line. */
export function applyLineAction(line: KLine, action: LineAction): KLine {
  const s = lineState(line, '');
  const x = { readyQty: s.readyQty, servedQty: s.servedQty, cooking: s.cooking };
  switch (action) {
    case 'start':
      if (x.readyQty < s.qty) x.cooking = true;
      break;
    case 'ready':
      x.readyQty = s.qty;
      x.cooking = false;
      break;
    case 'ready1':
      x.readyQty = Math.min(s.qty, x.readyQty + 1);
      x.cooking = x.readyQty < s.qty;
      break;
    case 'serve':
      x.servedQty = x.readyQty;
      break;
    case 'undo':
      if (x.servedQty > 0) x.servedQty = 0;
      else if (x.readyQty > 0) {
        x.readyQty = 0;
        x.cooking = true;
      } else x.cooking = false;
      break;
  }
  return { ...line, ...x, readyAt: x.readyQty >= s.qty ? line.readyAt || new Date().toISOString() : null };
}

/** Order status from materialized lines (drinks that skip the kitchen don't count as "started"). */
export function deriveStatus(lines: KLine[]): string {
  const st = lines.map((l) => ({ l, s: lineState(l, '') }));
  if (!st.length) return 'Pending';
  if (st.every(({ s }) => s.servedQty >= s.qty)) return 'Served';
  if (st.every(({ s }) => s.readyQty >= s.qty)) return 'Ready';
  if (st.some(({ l, s }) => s.servedQty > 0 || (!l.noKitchen && (s.readyQty > 0 || s.cooking)))) return 'Preparing';
  return 'Pending';
}

/** "4 of 5 prepared · 2 of 5 served" (counted by quantity). */
export function orderProgress(order: { items?: KLine[]; orderStatus: string }) {
  let total = 0,
    ready = 0,
    served = 0;
  (order.items || []).forEach((l) => {
    const s = lineState(l, order.orderStatus);
    total += s.qty;
    ready += s.readyQty;
    served += s.servedQty;
  });
  return { total, ready, served, toServe: ready - served, done: total > 0 && served >= total };
}