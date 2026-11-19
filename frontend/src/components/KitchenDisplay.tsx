import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLiveRefresh } from '../utils/liveSync'; // 🔄 live updates (no F5)
import { useMenuDescriptions, pickDescription } from './ItemLabel'; // 📝 menu description
import {
  lineState,
  materialize,
  applyLineAction,
  deriveStatus,
  orderProgress,
  nameKey,
  type KLine,
  type LineAction,
  type LineState,
} from '../utils/kitchenItems'; // 🍳 item-level status
import {
  Flame,
  ChefHat,
  Bell,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Printer,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Clock3,
  UtensilsCrossed,
  HandPlatter,
  CheckCheck,
  Check,
  Play,
  Undo2,
  X,
  LayoutGrid,
  ListChecks,
  StickyNote,
  ShoppingBag,
  Globe,
  Armchair,
  CookingPot,
  Hourglass,
  PartyPopper,
  Plus,
  Sparkles,
} from 'lucide-react';

// =====================================================================
// 🍳 KITCHEN DISPLAY — ITEM BASED
//   "By item"  : one small card per dish (Lemon Tea, Fried Rice …) with how many are still to cook.
//                Tap it → everyone who ordered it (table / customer, qty, note, time) with their own status.
//                The chef cooks the same dish in one batch and finishes each person's part separately.
//   "Ready to serve" (right): finished items waiting at the pass → Serve one item, not the whole order.
//   "By order" : each order with its progress (4 of 5 prepared · 2 of 5 served).
// =====================================================================

const API_BASE = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');
const ORDERS_URL = `${API_BASE}/api/orders`;
const MENU_URL = `${API_BASE}/api/menu`;
const FEATURES_URL = `${API_BASE}/api/features`;

const getLoggedInRestaurantId = () => {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return parsed?.id ? String(parsed.id) : '';
  } catch {
    return '';
  }
};

// How long an item can wait before it's flagged as running hot.
const WARN_AFTER_MIN = 8;
const CRITICAL_AFTER_MIN = 15;
// Safety check for new orders (live updates normally bring them at once).
const POLL_MS = 8000;
// Completed orders stay visible in "By order" for a short while (so staff see them finish)
const SHOW_DONE_FOR_MIN = 3;

const SOUND_PREF_KEY = 'kitchenDisplaySoundEnabled';
const VIEW_PREF_KEY = 'kitchenDisplayView';

type View = 'items' | 'orders';
type SortBy = 'oldest' | 'most' | 'name';

interface Order {
  _id: string;
  restaurantId: string;
  customerName: string;
  customerPhone?: string;
  tableNumber: string;
  orderNote?: string;
  items: KLine[];
  // What the kitchen prints (drinks removed when that feature is ON). `items` stays complete.
  kitchenItems?: KLine[];
  skipKitchen?: boolean;
  autoServed?: boolean;
  fromOnline?: boolean;
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  createdAt?: string;
  updatedAt?: string;
}

/** One person's part of one dish. */
interface Entry {
  key: string; // orderId:index
  order: Order;
  index: number;
  line: KLine;
  st: LineState;
  at: string; // when this item was ordered
  late: boolean; // added after the order was placed
}

type ActFn = (targets: Entry[], action: LineAction) => Promise<boolean | void> | void;

// ==========================================
// HELPERS
// ==========================================

// "No Table" = order taken with customer details (no table). Hide it on tickets.
const isRealTable = (t?: string) => {
  const v = String(t || '').trim().toLowerCase();
  return !!v && v !== 'no table' && v !== 'n/a' && !v.startsWith('delivery dlv-');
};

/** "Table 2" / "John" — who the item is for. */
const whoLabel = (o: Order) =>
  isRealTable(o.tableNumber) ? o.tableNumber : String(o.customerName || 'Guest').replace(/\s*\(Online\)$/, '');
const whoKind = (o: Order): 'table' | 'online' | 'takeaway' =>
  isRealTable(o.tableNumber) ? 'table' : o.fromOnline ? 'online' : 'takeaway';
const cleanNote = (s?: string) => String(s || '').replace(/^\[\+ Added:[^\]]*\]\s*/, '').trim();

function minutesSince(iso?: string | null, now: number = Date.now()): number {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, (now - then) / 60000);
}

function formatElapsed(mins: number): string {
  const total = Math.floor(mins);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const ageTone = (mins: number) =>
  mins >= CRITICAL_AFTER_MIN
    ? 'bg-red-50 text-red-600 ring-red-200'
    : mins >= WARN_AFTER_MIN
    ? 'bg-amber-50 text-amber-700 ring-amber-200'
    : 'bg-slate-50 text-slate-500 ring-slate-200';

function formatTime(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatTicketDateTime(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

function formatClockDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// Fingerprint of what the kitchen has to make (to notice added items between checks)
function itemsSignature(order: Order): string {
  return (order.kitchenItems ?? order.items ?? []).map((i) => `${i.itemName}|${i.quantity}`).join('~');
}

// ==========================================
// SOUND: short two-tone chime (Web Audio, no file needed)
// ==========================================

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioCtx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return null;
      sharedAudioCtx = new Ctx();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

function playChime(kind: 'new' | 'update' = 'new') {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const notes = kind === 'new' ? [880, 1108.73] : [659.25, 880];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = ctx.currentTime + i * 0.16;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.34);
  });
}

// ==========================================
// AUTO-PRINT: builds a kitchen-ticket HTML doc and sends it straight to
// the browser print dialog inside a hidden iframe, no user click needed.
// Kept plain black-on-white — thermal printers don't render color/gradients.
// ==========================================

function escapeHtml(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// isUpdate flags the ticket as an updated order (new items added after
// the original was fired) so the kitchen can tell it apart from a fresh
// ticket at a glance.
function buildTicketHtml(order: Order, isUpdate: boolean = false): string {
  const itemRows = (order.kitchenItems ?? order.items ?? [])
    .map(
      (item) => `
        <tr>
          <td class="qty">${escapeHtml(String(item.quantity))}×</td>
          <td class="name">
            ${escapeHtml(item.itemName)}
            ${item.description ? `<div class="desc">${escapeHtml(item.description)}</div>` : ''}
            ${item.note ? `<div class="desc">** ${escapeHtml(item.note)} **</div>` : ''}
          </td>
        </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Kitchen Ticket</title>
<style>
  /* Real paper size is set just before printing (80mm x ticket length).
     Chrome ignores "80mm auto", which printed on A4/Letter = blank ticket. */
  @page { margin: 0; }
  * { 
    box-sizing: border-box; 
    -webkit-print-color-adjust: exact; 
  }
  body {
    font-family: 'Courier New', Courier, monospace;
    width: 72mm;
    margin: 0;            /* left edge: stays on an 80mm roll whatever paper is selected */
    padding: 4mm 2mm;
    color: #000000;
    background: #ffffff;
    font-weight: 900; /* Forces maximum black fill on thermal heads */
  }
  .center { text-align: center; }
  h1 {
    font-size: 18px;
    font-weight: 900;
    margin: 0 0 4px;
    letter-spacing: 1px;
  }
  .update-flag {
    display: inline-block;
    font-size: 13px;
    font-weight: 900;
    border: 2px solid #000;
    padding: 2px 8px;
    margin-bottom: 6px;
  }
  .meta {
    font-size: 14px;
    font-weight: 900;
    line-height: 1.5;
    border-bottom: 2px solid #000;
    padding-bottom: 6px;
    margin-bottom: 8px;
  }
  .meta-row {
    display: table;
    width: 100%;
  }
  .meta-label, .meta-val {
    display: table-cell;
    padding: 1px 0;
    font-weight: 900;
  }
  .meta-val {
    text-align: right;
  }
  table { 
    width: 100%; 
    border-collapse: collapse; 
    margin-bottom: 8px; 
  }
  td { 
    font-size: 16px; 
    font-weight: 900; 
    padding: 4px 0; 
    vertical-align: top; 
    color: #000000;
  }
  td.qty { 
    width: 35px; 
  } 
  td.name { 
    font-weight: 900; 
  }
  .desc { 
    font-size: 12px; 
    font-weight: 900; 
    color: #000000; 
    margin-top: 2px;
  }
  .note {
    font-size: 14px;
    font-weight: 900;
    border-top: 2px dashed #000;
    border-bottom: 2px dashed #000;
    padding: 6px 0;
    margin-top: 6px;
    margin-bottom: 6px;
  }
  .footer {
    text-align: center;
    font-size: 12px;
    font-weight: 900;
    border-top: 1px solid #000;
    margin-top: 10px;
    padding-top: 6px;
  }
</style>
</head>
<body>
  <div class="center">
    ${isUpdate ? '<div class="update-flag">*** UPDATED ORDER ***</div><br/>' : ''}
    <h1>KITCHEN TICKET</h1>
  </div>
  <div class="meta">
    ${isRealTable(order.tableNumber) ? `<div class="meta-row"><span class="meta-label">Table:</span><span class="meta-val">${escapeHtml(order.tableNumber)}</span></div>` : ''}
    <div class="meta-row"><span class="meta-label">Customer:</span><span class="meta-val">${escapeHtml(order.customerName)}</span></div>
        ${order.customerPhone ? `<div class="meta-row"><span class="meta-label">Phone:</span><span class="meta-val">${escapeHtml(order.customerPhone)}</span></div>` : ''}
    <div class="meta-row"><span class="meta-label">Order #:</span><span class="meta-val">${escapeHtml(order._id.slice(-6).toUpperCase())}</span></div>
    <div class="meta-row"><span class="meta-label">Placed:</span><span class="meta-val">${escapeHtml(formatTicketDateTime(order.createdAt))}</span></div>
  </div>
  <table>
    <tbody>
      ${itemRows}
    </tbody>
  </table>
  ${
    cleanNote(order.orderNote)
      ? `<div class="note"><strong>NOTE:</strong> ${escapeHtml(cleanNote(order.orderNote))}</div>`
      : ''
  }
  <div class="footer">Printed: ${escapeHtml(formatTicketDateTime(new Date().toISOString()))}</div>
</body>
</html>`;
}

// Prints via a hidden iframe rather than window.open, so no new tab/window
// ever appears - the ticket just goes straight to the printer.
function autoPrintOrder(order: Order, isUpdate: boolean = false) {
  const iframe = document.createElement('iframe');
  // Real size but off-screen. A 0x0 or hidden frame prints a BLANK page in some browsers.
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '80mm';
  iframe.style.height = '200mm';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    iframe.remove();
    return;
  }

  doc.open();
  doc.write(buildTicketHtml(order, isUpdate));
  doc.close();

  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    // Wait before removing: removing the frame too early can cancel the print job.
    window.setTimeout(() => iframe.remove(), 3000);
  };

  const print = async () => {
    try {
      // Make sure fonts are ready so the text is actually drawn
      if (doc.fonts?.ready) await doc.fonts.ready;

      // No page height: the printer's own 80mm roll decides the length
      const pageStyle = doc.createElement('style');
      pageStyle.textContent = '@page { margin: 0; }';
      doc.head.appendChild(pageStyle);

      win.onafterprint = cleanup;
      win.focus();
      win.print();
    } catch (err) {
      console.error('Kitchen ticket print failed:', err);
    }
    // Fallback in case onafterprint never fires
    window.setTimeout(cleanup, 60000);
  };

  // Give the frame a moment to lay out before printing
  window.setTimeout(print, 300);
}

// ==========================================
// SMALL PIECES
// ==========================================

const STATUS_UI: Record<string, { label: string; chip: string; dot: string; icon: React.ElementType }> = {
  waiting: { label: 'Waiting', chip: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-400', icon: Hourglass },
  cooking: { label: 'Cooking', chip: 'bg-violet-50 text-violet-700 ring-violet-200', dot: 'bg-violet-500', icon: Flame },
  ready: { label: 'Finished', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500', icon: Check },
  served: { label: 'Served', chip: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500', icon: HandPlatter },
};

function StatusChip({ st }: { st: LineState }) {
  const ui = STATUS_UI[st.status];
  const Icon = ui.icon;
  const partial = st.status === 'cooking' && st.readyQty > 0;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${ui.chip}`}>
      <Icon className={`h-3 w-3 ${st.status === 'cooking' ? 'kds-flicker' : ''}`} />
      {ui.label}
      {partial && <span className="font-mono">· {st.readyQty}/{st.qty}</span>}
    </span>
  );
}

function WhoBadge({ o, big = false }: { o: Order; big?: boolean }) {
  const kind = whoKind(o);
  const Icon = kind === 'table' ? Armchair : kind === 'online' ? Globe : ShoppingBag;
  const tone =
    kind === 'table'
      ? 'bg-violet-100 text-violet-700'
      : kind === 'online'
      ? 'bg-sky-100 text-sky-700'
      : 'bg-fuchsia-100 text-fuchsia-700';
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className={`flex shrink-0 items-center justify-center rounded-xl ${tone} ${big ? 'h-10 w-10' : 'h-8 w-8'}`}>
        <Icon className={big ? 'h-5 w-5' : 'h-4 w-4'} />
      </span>
      <span className="min-w-0">
        <span className={`block truncate font-extrabold text-slate-900 ${big ? 'text-lg' : 'text-[15px]'}`}>{whoLabel(o)}</span>
        {kind !== 'table' && (
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">{kind === 'online' ? 'Online order' : 'Takeaway'}</span>
        )}
        {kind === 'table' && !/^Guest\b/.test(o.customerName) && (
          <span className="block truncate text-[11px] text-slate-500">{o.customerName}</span>
        )}
      </span>
    </span>
  );
}

function ActBtn({
  onClick,
  busy,
  tone,
  icon: Icon,
  children,
  title,
  small = false,
}: {
  onClick: () => void;
  busy?: boolean;
  tone: 'violet' | 'emerald' | 'sky' | 'ghost';
  icon: React.ElementType;
  children?: React.ReactNode;
  title?: string;
  small?: boolean;
}) {
  const tones = {
    violet: 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-300/40 hover:from-violet-600 hover:to-fuchsia-600',
    emerald: 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-300/40 hover:from-emerald-600 hover:to-teal-600',
    sky: 'bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow-sm shadow-sky-300/40 hover:from-sky-600 hover:to-indigo-600',
    ghost: 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800',
  }[tone];
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={busy}
      title={title}
      aria-label={title}
      className={`inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl font-bold transition active:scale-95 disabled:cursor-wait disabled:opacity-50 ${tones} ${
        small ? 'h-9 px-2.5 text-xs' : 'h-11 px-4 text-sm'
      }`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}

function Empty({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-purple-200 bg-white/50 px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-300">
        <Icon className="h-6 w-6" />
      </span>
      <p className="text-sm font-bold text-slate-700">{title}</p>
      <p className="max-w-xs text-xs text-slate-400">{sub}</p>
    </div>
  );
}

// ==========================================
// ITEM CARD (compact: dish + how many to cook)
// ==========================================

interface ItemGroup {
  key: string;
  name: string;
  description: string;
  todo: Entry[]; // still to cook (waiting / cooking)
  done: Entry[]; // finished, not served yet (for undo)
  toCook: number;
  waiting: number;
  cooking: number;
  oldest: number; // minutes the oldest part has waited
}

function ItemCard({ g, selected, onOpen, now }: { g: ItemGroup; selected: boolean; onOpen: () => void; now: number }) {
  const hot = g.oldest >= CRITICAL_AFTER_MIN;
  const warm = g.oldest >= WARN_AFTER_MIN && !hot;
  const who = g.todo.map((e) => whoLabel(e.order));
  const cookingPct = g.toCook ? Math.round((g.cooking / g.toCook) * 100) : 0;
  void now;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${g.name}: ${g.toCook} to cook`}
      className={`kds-card group relative flex h-full min-h-[150px] w-full cursor-pointer flex-col overflow-hidden rounded-3xl border bg-white p-4 text-left shadow-[0_2px_10px_rgba(124,58,237,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(124,58,237,0.14)] focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-300/50 ${
        selected ? 'border-violet-400 ring-4 ring-violet-200' : hot ? 'border-red-300 ring-2 ring-red-200' : warm ? 'border-amber-200' : 'border-purple-100/80'
      }`}
    >
      <span
        className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${
          hot ? 'from-red-500 to-rose-400' : warm ? 'from-amber-400 to-orange-400' : 'from-violet-500 to-fuchsia-500'
        }`}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-[17px] font-extrabold leading-snug text-slate-900">{g.name}</p>
          <p className="mt-1 truncate text-[11px] font-semibold text-slate-400">
            {who.slice(0, 3).join(' · ')}
            {who.length > 3 ? ` +${who.length - 3}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className={`font-mono text-4xl font-black leading-none tabular-nums ${hot ? 'text-red-600' : 'text-violet-700'}`}>{g.toCook}</p>
          <p className="mt-1 whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-slate-400">to cook</p>
        </div>
      </div>

      <div className="mt-auto pt-4">
        {/* cooking / waiting split */}
        <div className="mb-2.5 h-1.5 w-full overflow-hidden rounded-full bg-amber-100">
          <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500" style={{ width: `${cookingPct}%` }} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {g.waiting > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
              <Hourglass className="h-3 w-3" /> {g.waiting} waiting
            </span>
          )}
          {g.cooking > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700">
              <Flame className="kds-flicker h-3 w-3" /> {g.cooking} cooking
            </span>
          )}
          <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${ageTone(g.oldest)}`}>
            <Clock3 className="h-3 w-3" /> {formatElapsed(g.oldest)}
          </span>
        </div>
      </div>
      {hot && (
        <span className="absolute right-3 top-3 hidden items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white group-hover:flex">
          <AlertTriangle className="h-3 w-3" /> Late
        </span>
      )}
    </button>
  );
}

// ==========================================
// ITEM DRAWER (everyone who ordered this dish)
// ==========================================

function EntryRow({
  e,
  now,
  busy,
  act,
}: {
  e: Entry;
  now: number;
  busy: boolean;
  act: ActFn;
}) {
  const mins = minutesSince(e.at, now);
  const note = e.line.note;
  const orderNote = cleanNote(e.order.orderNote);
  const finished = e.st.status === 'ready' || e.st.status === 'served';

  // Serve straight from the drawer: finish first if still cooking, then serve
  const serveNow = async () => {
    if (e.st.toCook > 0) {
      const ok = await act([e], 'ready');
      if (ok === false) return; // finishing failed, so don't try to serve
    }
    await act([e], 'serve');
  };

  return (
    <div
      className={`kds-row rounded-2xl border p-3 transition ${
        finished ? 'border-emerald-100 bg-emerald-50/40' : e.st.status === 'cooking' ? 'border-violet-200 bg-violet-50/40' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <WhoBadge o={e.order} />
        </div>
        <span className="font-mono text-2xl font-black tabular-nums text-slate-900">×{finished ? e.st.qty : e.st.toCook}</span>
      </div>

      {(note || orderNote) && (
        <div className="mt-2 space-y-1">
          {note && (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
              <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {note}
            </p>
          )}
          {orderNote && (
            <p className="flex items-start gap-1.5 px-1 text-[11px] text-slate-500">
              <Bell className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" /> Order note: {orderNote}
            </p>
          )}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <StatusChip st={e.st} />
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${ageTone(finished ? 0 : mins)}`}>
          <Clock3 className="h-3 w-3" /> {formatTime(e.at)} · {formatElapsed(mins)} ago
        </span>
        {e.late && (
          <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-50 px-2 py-0.5 text-[10px] font-bold text-fuchsia-700 ring-1 ring-inset ring-fuchsia-200">
            <Plus className="h-3 w-3" /> Added later
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {finished ? (
            <>
              <ActBtn small tone="ghost" icon={Undo2} busy={busy} onClick={() => act([e], 'undo')} title="Undo (back to cooking)">
                Undo
              </ActBtn>
              {e.st.toServe > 0 && (
                <ActBtn small tone="sky" icon={HandPlatter} busy={busy} onClick={serveNow} title="Serve">
                  Serve
                </ActBtn>
              )}
            </>
          ) : (
            <>
              {e.st.status === 'waiting' && (
                <ActBtn small tone="violet" icon={Play} busy={busy} onClick={() => act([e], 'start')} title="Start cooking">
                  Start
                </ActBtn>
              )}
              {e.st.toCook > 1 && (
                <ActBtn small tone="ghost" icon={Plus} busy={busy} onClick={() => act([e], 'ready1')} title="One of these is finished">
                  1 done
                </ActBtn>
              )}
              <ActBtn small tone="emerald" icon={Check} busy={busy} onClick={() => act([e], 'ready')} title="Finished">
                Finished
              </ActBtn>
              <ActBtn small tone="sky" icon={HandPlatter} busy={busy} onClick={serveNow} title="Finish and serve now">
                Serve
              </ActBtn>
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function ItemDrawer({
  g,
  name,
  now,
  busyKeys,
  act,
  onClose,
}: {
  g: ItemGroup | null;
  name: string;
  now: number;
  busyKeys: Set<string>;
  act: ActFn;
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const todo = g?.todo || [];
  const done = g?.done || [];
  const waiting = todo.filter((e) => e.st.status === 'waiting');
  const anyBusy = (list: Entry[]) => list.some((e) => busyKeys.has(e.key));

  const serveAll = async () => {
    const ok = await act(todo, 'ready');
    if (ok === false) return;
    await act(todo, 'serve');
  };

  // On top of everything (sidebar + top bar too)
  return createPortal(
    <div className="fixed inset-0 z-[150] flex justify-end" role="dialog" aria-modal="true" aria-label={`${name} orders`}>
      <div className="kds-fade absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="kds-slide relative flex h-full w-full max-w-[520px] flex-col bg-[#FBF9FF] shadow-2xl">
        {/* Head */}
        <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 px-5 pb-5 pt-4 text-white">
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-100">Cook together</p>
              <h2 className="mt-0.5 text-2xl font-black leading-tight">{name}</h2>
              {g?.description && <p className="mt-0.5 line-clamp-2 text-xs text-violet-100">{g.description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="cursor-pointer rounded-xl bg-white/15 p-2 ring-1 ring-white/25 transition hover:bg-white/25"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative mt-4 grid grid-cols-3 gap-2">
            {[
              { n: g?.toCook || 0, l: 'To cook' },
              { n: g?.waiting || 0, l: 'Waiting' },
              { n: g?.cooking || 0, l: 'Cooking' },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl bg-white/12 px-3 py-2 ring-1 ring-white/20">
                <p className="font-mono text-2xl font-black tabular-nums">{s.n}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-100">{s.l}</p>
              </div>
            ))}
          </div>
          {todo.length > 0 && (
            <div className="relative mt-4 flex gap-2">
              {waiting.length > 0 && (
                <button
                  type="button"
                  onClick={() => act(waiting, 'start')}
                  disabled={anyBusy(waiting)}
                  className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-white/15 text-sm font-bold ring-1 ring-white/30 transition hover:bg-white/25 active:scale-[0.98] disabled:opacity-50"
                >
                  <Play className="h-4 w-4" /> Start all ({waiting.reduce((s, e) => s + e.st.toCook, 0)})
                </button>
              )}
              <button
                type="button"
                onClick={() => act(todo, 'ready')}
                disabled={anyBusy(todo)}
                className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-white text-sm font-extrabold text-emerald-700 shadow-lg transition hover:bg-emerald-50 active:scale-[0.98] disabled:opacity-50"
              >
                <CheckCheck className="h-4 w-4" /> Finish all ({g?.toCook || 0})
              </button>

                            <button
                type="button"
                onClick={serveAll}
                disabled={anyBusy(todo)}
                className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-500 text-sm font-extrabold text-white shadow-lg transition hover:bg-sky-600 active:scale-[0.98] disabled:opacity-50"
              >
                <HandPlatter className="h-4 w-4" /> Serve all
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
          {todo.length === 0 ? (
            <div className="kds-pop flex flex-col items-center gap-2 rounded-3xl border border-emerald-200 bg-emerald-50/60 px-6 py-10 text-center">
              <PartyPopper className="h-8 w-8 text-emerald-500" />
              <p className="text-sm font-extrabold text-emerald-800">All {name} done!</p>
              <p className="text-xs text-emerald-700/80">Waiting at the pass to be served.</p>
            </div>
          ) : (
            todo.map((e) => (
              <React.Fragment key={e.key}>
                <EntryRow e={e} now={now} busy={busyKeys.has(e.key)} act={act} />
              </React.Fragment>
            ))
          )}

          {done.length > 0 && (
            <div className="pt-3">
              <p className="mb-2 flex items-center gap-2 px-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-600">
                <Check className="h-3.5 w-3.5" /> Finished · waiting to be served ({done.length})
              </p>
              <div className="space-y-2">
                {done.map((e) => (
                  <React.Fragment key={e.key}>
                    <EntryRow e={e} now={now} busy={busyKeys.has(e.key)} act={act} />
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}

// ==========================================
// PASS: finished items waiting to be served (per order)
// ==========================================

function PassPanel({
  orders,
  now,
  busyKeys,
  act,
  allEntries,
}: {
  orders: Order[];
  now: number;
  busyKeys: Set<string>;
  act: (targets: Entry[], action: LineAction) => void;
  allEntries: (o: Order) => Entry[];
}) {
  const rows = orders
    .map((o) => ({ o, ready: allEntries(o).filter((e) => e.st.toServe > 0), p: orderProgress(o) }))
    .filter((r) => r.ready.length > 0)
    .sort((a, b) => {
      const ta = Math.min(...a.ready.map((e) => new Date(e.line.readyAt || e.at).getTime()));
      const tb = Math.min(...b.ready.map((e) => new Date(e.line.readyAt || e.at).getTime()));
      return ta - tb;
    });
  const count = rows.reduce((s, r) => s + r.ready.reduce((x, e) => x + e.st.toServe, 0), 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex shrink-0 items-center justify-between rounded-2xl border border-emerald-100 bg-white/80 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white">
            <HandPlatter className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Ready to serve</h2>
            <p className="text-[11px] text-slate-400">Serve finished items now — no need to wait for the whole order</p>
          </div>
        </div>
        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-mono text-xs font-bold text-emerald-700">{count}</span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pb-4 pr-1">
        {rows.length === 0 ? (
          <Empty icon={HandPlatter} title="Nothing at the pass" sub="Finished items show here so the waiter can take them at once." />
        ) : (
          rows.map(({ o, ready, p }) => {
            const waitMin = minutesSince(ready[0].line.readyAt || ready[0].at, now);
            const busy = ready.some((e) => busyKeys.has(e.key));
            return (
              <div key={o._id} className="kds-card overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-2 border-b border-emerald-50 px-4 py-3">
                  <WhoBadge o={o} />
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${ageTone(waitMin * 2)}`}>
                    <Clock3 className="mr-0.5 inline h-3 w-3" /> {formatElapsed(waitMin)}
                  </span>
                </div>
                <div className="space-y-1.5 px-4 py-3">
                  {ready.map((e) => (
                    <div key={e.key} className="flex items-center gap-2">
                      <span className="w-8 shrink-0 font-mono text-base font-black text-emerald-600">{e.st.toServe}×</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">
                        {e.line.itemName}
                        {e.line.noKitchen && <span className="ml-1.5 rounded bg-sky-50 px-1 text-[10px] font-bold text-sky-600">drink</span>}
                      </span>
                      <ActBtn small tone="ghost" icon={HandPlatter} busy={busyKeys.has(e.key)} onClick={() => act([e], 'serve')} title={`Serve ${e.line.itemName}`}>
                        Serve
                      </ActBtn>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-slate-500">
                      {p.served} of {p.total} served
                    </p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-500" style={{ width: `${(p.served / Math.max(1, p.total)) * 100}%` }} />
                    </div>
                  </div>
                  {ready.length > 1 && (
                    <ActBtn small tone="sky" icon={CheckCheck} busy={busy} onClick={() => act(ready, 'serve')}>
                      Serve all
                    </ActBtn>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ==========================================
// BY ORDER: one card per order with its progress
// ==========================================

function OrderCard({
  o,
  now,
  busyKeys,
  act,
  entries,
  onReprint,
}: {
  o: Order;
  now: number;
  busyKeys: Set<string>;
  act: (targets: Entry[], action: LineAction) => void;
  entries: Entry[];
  onReprint: (o: Order) => void;
}) {
  const p = orderProgress(o);
  const age = minutesSince(o.createdAt, now);
  const toCook = entries.filter((e) => e.st.toCook > 0 && !e.line.noKitchen);
  const toServe = entries.filter((e) => e.st.toServe > 0);
  const anyBusy = (l: Entry[]) => l.some((e) => busyKeys.has(e.key));
  const done = p.done;

  return (
    <div
      className={`kds-card flex flex-col overflow-hidden rounded-3xl border bg-white shadow-[0_2px_10px_rgba(124,58,237,0.06)] ${
        done ? 'border-emerald-200 opacity-80' : age >= CRITICAL_AFTER_MIN && toCook.length ? 'border-red-200 ring-2 ring-red-100' : 'border-purple-100/80'
      }`}
    >
      <div className={`h-1.5 w-full bg-gradient-to-r ${done ? 'from-emerald-400 to-teal-400' : 'from-violet-500 to-fuchsia-500'}`} />
      <div className="flex items-start justify-between gap-2 px-4 pt-3">
        <WhoBadge o={o} big />
        <div className="flex items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${ageTone(done ? 0 : age)}`}>
            <Clock3 className="mr-0.5 inline h-3 w-3" /> {formatElapsed(age)}
          </span>
          <button
            type="button"
            onClick={() => onReprint(o)}
            className="cursor-pointer rounded-lg border border-purple-100 bg-purple-50 p-1.5 text-purple-400 transition hover:bg-purple-100 hover:text-purple-700"
            title="Print ticket again"
            aria-label="Print ticket again"
          >
            <Printer className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* progress */}
      <div className="mt-3 space-y-1.5 px-4">
        {done ? (
          <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-extrabold text-emerald-700">
            <PartyPopper className="h-4 w-4" /> Order completed — all {p.total} served
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
              <span>
                <b className="text-emerald-700">{p.ready}</b> of {p.total} prepared
              </span>
              <span>
                <b className="text-sky-700">{p.served}</b> of {p.total} served
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-300 transition-all duration-500" style={{ width: `${(p.ready / Math.max(1, p.total)) * 100}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-500" style={{ width: `${(p.served / Math.max(1, p.total)) * 100}%` }} />
            </div>
          </>
        )}
      </div>

      {/* lines */}
      <div className="flex-1 space-y-1.5 px-4 py-3">
        {entries.map((e) => {
          const busy = busyKeys.has(e.key);
          const ui = STATUS_UI[e.st.status];
          return (
            <div key={e.key} className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ui.dot}`} title={ui.label} />
              <span className="w-7 shrink-0 font-mono text-sm font-black text-violet-600">{e.st.qty}×</span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm font-bold ${e.st.status === 'served' ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-800'}`}>
                  {e.line.itemName}
                </span>
                {e.line.note && <span className="block truncate text-[11px] font-semibold text-amber-700">✎ {e.line.note}</span>}
              </span>
              {e.st.status === 'waiting' && !e.line.noKitchen && (
                <ActBtn small tone="ghost" icon={Play} busy={busy} onClick={() => act([e], 'start')} title="Start cooking" />
              )}
              {(e.st.status === 'waiting' || e.st.status === 'cooking') && !e.line.noKitchen && (
                <ActBtn small tone="emerald" icon={Check} busy={busy} onClick={() => act([e], 'ready')} title="Finished" />
              )}
              {e.st.toServe > 0 && (
                <ActBtn small tone="sky" icon={HandPlatter} busy={busy} onClick={() => act([e], 'serve')} title="Serve">
                  Serve
                </ActBtn>
              )}
              {e.st.status === 'served' && (
                <ActBtn small tone="ghost" icon={Undo2} busy={busy} onClick={() => act([e], 'undo')} title="Undo serve" />
              )}
            </div>
          );
        })}
        {cleanNote(o.orderNote) && (
          <p className="mt-2 flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
            <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /> {cleanNote(o.orderNote)}
          </p>
        )}
      </div>

      {!done && (toCook.length > 0 || toServe.length > 0) && (
        <div className="flex gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          {toCook.length > 0 && (
            <button
              type="button"
              onClick={() => act(toCook, 'ready')}
              disabled={anyBusy(toCook)}
              className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-xs font-bold text-white shadow-sm transition hover:from-emerald-600 hover:to-teal-600 active:scale-[0.98] disabled:opacity-50"
            >
              <CheckCheck className="h-4 w-4" /> Finish all
            </button>
          )}
          {toServe.length > 0 && (
            <button
              type="button"
              onClick={() => act(toServe, 'serve')}
              disabled={anyBusy(toServe)}
              className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 text-xs font-bold text-white shadow-sm transition hover:from-sky-600 hover:to-indigo-600 active:scale-[0.98] disabled:opacity-50"
            >
              <HandPlatter className="h-4 w-4" /> Serve ready ({toServe.reduce((s, e) => s + e.st.toServe, 0)})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// MAIN DISPLAY
// ==========================================

export default function KitchenDisplay() {
  const restaurantId = getLoggedInRestaurantId();
  const menuDesc = useMenuDescriptions(); // 📝 description for the item drawer

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [flash, setFlash] = useState<string | null>(null);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [openItem, setOpenItem] = useState<string | null>(null); // item name key
  const [sortBy, setSortBy] = useState<SortBy>('oldest');
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_PREF_KEY) === 'orders' ? 'orders' : 'items';
    } catch {
      return 'items';
    }
  });
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SOUND_PREF_KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const knownIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);
  const printedIds = useRef<Set<string>>(new Set());
  const printedSignatures = useRef<Map<string, string>>(new Map());
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const isBeverageRef = useRef<((name: string) => boolean) | null>(null);

  // 🥤 "Don't send beverages to the kitchen" (Settings → Features). Re-checked at most once a minute.
  const beverageFilter = useRef<{ at: number; isBeverage: ((name: string) => boolean) | null }>({ at: 0, isBeverage: null });
  const getBeverageFilter = async () => {
    if (Date.now() - beverageFilter.current.at < 60000) return beverageFilter.current.isBeverage;
    try {
      const fRes = await fetch(FEATURES_URL);
      const f = await fRes.json();
      let isBeverage: ((name: string) => boolean) | null = null;
      if (fRes.ok && f?.data?.skipBeverageKot) {
        const mRes = await fetch(restaurantId ? `${MENU_URL}?restaurantId=${encodeURIComponent(restaurantId)}` : MENU_URL);
        const m = await mRes.json();
        const names = new Set(
          (m?.data || []).filter((x: any) => x.category === 'Beverage').map((x: any) => String(x.itemName || '').trim().toLowerCase())
        );
        isBeverage = (name: string) => names.has(String(name || '').split(' + ')[0].trim().toLowerCase());
      }
      beverageFilter.current = { at: Date.now(), isBeverage };
    } catch {
      /* keep the last known setting */
    }
    return beverageFilter.current.isBeverage;
  };

  // Live clock (every second)
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SOUND_PREF_KEY, next ? 'on' : 'off');
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_PREF_KEY, v);
    } catch {
      /* ignore */
    }
  };
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  };

  /** Is this line made in the kitchen? (drinks that skip the kitchen are not) */
  const isKitchenLine = (l: KLine) => !l.noKitchen && !(isBeverageRef.current && isBeverageRef.current(l.itemName));

  const fetchOrders = useCallback(async () => {
    try {
      const url = restaurantId ? `${ORDERS_URL}?restaurantId=${encodeURIComponent(restaurantId)}` : ORDERS_URL;
      const res = await fetch(url);
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'Failed to load orders.');

      const isBeverage = await getBeverageFilter();
      isBeverageRef.current = isBeverage;
      const kitchenLine = (l: KLine) => !l.noKitchen && !(isBeverage && isBeverage(l.itemName));
      const nowMs = Date.now();

      const list: Order[] = (result.data || [])
        .filter(
          (o: Order) =>
            !o.skipKitchen &&
            (['Pending', 'Preparing', 'Ready'].includes(o.orderStatus) ||
              // just completed → stays a moment in "By order"
              (o.orderStatus === 'Served' && !o.autoServed && minutesSince(o.updatedAt, nowMs) < SHOW_DONE_FOR_MIN))
        )
        .map((o: Order) => ({ ...o, kitchenItems: (o.items || []).filter(kitchenLine) }));

      // 🖨️ New / changed orders → chime + kitchen ticket (KOT)
      const active = list.filter((o) => o.orderStatus !== 'Served' && (o.kitchenItems || []).length > 0);
      if (!isFirstLoad.current) {
        const fresh = active.filter((o) => !knownIds.current.has(o._id) && !printedIds.current.has(o._id));
        const changed = active.filter((o) => {
          if (!knownIds.current.has(o._id)) return false;
          const last = printedSignatures.current.get(o._id);
          return last !== undefined && last !== itemsSignature(o);
        });
        if (fresh.length || changed.length) {
          const first = fresh[0] || changed[0];
          setFlash(
            fresh.length
              ? fresh.length === 1
                ? `New order — ${whoLabel(first)}`
                : `${fresh.length} new orders`
              : changed.length === 1
              ? `Items added — ${whoLabel(first)}`
              : `${changed.length} orders updated`
          );
          if (soundEnabledRef.current) playChime(fresh.length ? 'new' : 'update');
          window.setTimeout(() => setFlash(null), 4000);
          fresh.forEach((o) => {
            printedIds.current.add(o._id);
            printedSignatures.current.set(o._id, itemsSignature(o));
            autoPrintOrder(o, false);
          });
          changed.forEach((o) => {
            printedSignatures.current.set(o._id, itemsSignature(o));
            // Update ticket: only what still has to be cooked
            const todo = (o.kitchenItems || [])
              .map((l) => ({ l, s: lineState(l, o.orderStatus) }))
              .filter(({ s }) => s.toCook > 0)
              .map(({ l, s }) => ({ ...l, quantity: s.toCook }));
            if (todo.length) autoPrintOrder({ ...o, kitchenItems: todo }, true);
          });
        }
      } else {
        active.forEach((o) => {
          printedIds.current.add(o._id);
          printedSignatures.current.set(o._id, itemsSignature(o));
        });
      }
      active.forEach((o) => {
        if (!printedSignatures.current.has(o._id)) printedSignatures.current.set(o._id, itemsSignature(o));
      });
      knownIds.current = new Set(active.map((o) => o._id));
      isFirstLoad.current = false;

      setOrders(list);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Could not connect to the server.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  useEffect(() => {
    fetchOrders();
    const poll = window.setInterval(fetchOrders, POLL_MS);
    return () => window.clearInterval(poll);
  }, [fetchOrders]);

  // 🔄 New orders and changes from other screens show at once
  useLiveRefresh(['orders'], fetchOrders);

  const reprintOrder = useCallback((order: Order) => autoPrintOrder(order, false), []);

  // ---------------- entries ----------------
  const entriesOf = useCallback(
    (o: Order): Entry[] => {
      const created = new Date(o.createdAt || 0).getTime();
      return (o.items || []).map((line, index) => {
        const at = line.addedAt || o.createdAt || '';
        return {
          key: `${o._id}:${index}`,
          order: o,
          index,
          line,
          st: lineState(line, o.orderStatus),
          at,
          late: !!line.addedAt && new Date(line.addedAt).getTime() - created > 60000,
        };
      });
    },
    []
  );

  const activeOrders = useMemo(() => orders.filter((o) => o.orderStatus !== 'Served'), [orders]);

  // One group per dish: everything still to cook + finished-not-served (for undo)
  const groups = useMemo(() => {
    const m = new Map<string, ItemGroup>();
    activeOrders.forEach((o) =>
      entriesOf(o).forEach((e) => {
        if (!isKitchenLine(e.line)) return;
        if (e.st.toCook === 0 && e.st.toServe === 0) return;
        const k = nameKey(e.line.itemName);
        const g =
          m.get(k) ||
          ({ key: k, name: e.line.itemName, description: '', todo: [], done: [], toCook: 0, waiting: 0, cooking: 0, oldest: 0 } as ItemGroup);
        if (!g.description) g.description = pickDescription(menuDesc, e.line.itemName, e.line.description) || '';
        if (e.st.toCook > 0) {
          g.todo.push(e);
          g.toCook += e.st.toCook;
          if (e.st.status === 'waiting') g.waiting += e.st.toCook;
          else g.cooking += e.st.toCook;
          g.oldest = Math.max(g.oldest, minutesSince(e.at, now));
        } else g.done.push(e);
        m.set(k, g);
      })
    );
    const byTime = (a: Entry, b: Entry) => new Date(a.at).getTime() - new Date(b.at).getTime();
    m.forEach((g) => {
      g.todo.sort(byTime);
      g.done.sort(byTime);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrders, entriesOf, menuDesc, now]);

  const cards = useMemo(() => {
    const list = [...groups.values()].filter((g) => g.toCook > 0);
    if (sortBy === 'most') list.sort((a, b) => b.toCook - a.toCook || b.oldest - a.oldest);
    else if (sortBy === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else list.sort((a, b) => b.oldest - a.oldest || b.toCook - a.toCook);
    return list;
  }, [groups, sortBy]);

  const totals = useMemo(() => {
    let toCook = 0,
      cooking = 0,
      toServe = 0,
      late = 0;
    activeOrders.forEach((o) =>
      entriesOf(o).forEach((e) => {
        toServe += e.st.toServe;
        if (!isKitchenLine(e.line)) return;
        toCook += e.st.toCook;
        if (e.st.status === 'cooking') cooking += e.st.toCook;
        if (e.st.toCook > 0 && minutesSince(e.at, now) >= CRITICAL_AFTER_MIN) late++;
      })
    );
    return { toCook, cooking, toServe, late };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrders, entriesOf, now]);

  const ordersSorted = useMemo(
    () =>
      [...orders].sort((a, b) => {
        const da = a.orderStatus === 'Served' ? 1 : 0;
        const db = b.orderStatus === 'Served' ? 1 : 0;
        return da - db || new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      }),
    [orders]
  );

  // ---------------- actions (one person's item, or many at once) ----------------
  const act = useCallback(
    async (targets: Entry[], action: LineAction): Promise<boolean> => {
      if (!targets.length) return true;
      const byOrder = new Map<string, Entry[]>();
      targets.forEach((t) => byOrder.set(t.order._id, [...(byOrder.get(t.order._id) || []), t]));
      const keys = targets.map((t) => t.key);
      setBusyKeys((prev) => new Set([...prev, ...keys]));

      // Show the change at once (the server confirms right after)
      setOrders((prev) =>
        prev.map((o) => {
          const list = byOrder.get(o._id);
          if (!list) return o;
          const idx = new Set(list.map((e) => e.index));
          const items = materialize(o.items, o.orderStatus).map((l, i) => (idx.has(i) ? applyLineAction(l, action) : l));
          return { ...o, items, orderStatus: deriveStatus(items), updatedAt: new Date().toISOString() };
        })
      );

      const results = await Promise.all(
        [...byOrder.entries()].map(async ([id, list]) => {
          try {
            const res = await fetch(`${ORDERS_URL}/${id}/items`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action, lines: list.map((e) => ({ index: e.index, itemName: e.line.itemName })) }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data?.success === false) return data?.message || 'Could not update the item.';
            if (data?.data) {
              setOrders((prev) =>
                prev.map((o) => (o._id === id ? { ...o, items: data.data.items, orderStatus: data.data.orderStatus, updatedAt: data.data.updatedAt } : o))
              );
            }
            return '';
          } catch {
            return 'Could not reach the server. Please try again.';
          }
        })
      );

      setBusyKeys((prev) => {
        const next = new Set(prev);
        keys.forEach((k) => next.delete(k));
        return next;
      });
      const failed = results.find(Boolean);
      if (failed) {
        setError(failed);
        window.setTimeout(() => setError(''), 4000);
        fetchOrders(); // show what is really saved
      }
      return !failed;
    },
    [fetchOrders]
  );

  const closeDrawer = useCallback(() => setOpenItem(null), []);
  const clockDate = new Date(now);
  const drawerGroup = openItem ? groups.get(openItem) || null : null;
  const drawerName = drawerGroup?.name || cards.find((c) => c.key === openItem)?.name || '';
  const lastName = useRef('');
  if (drawerName) lastName.current = drawerName;

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      id="kitchen-display-root"
      style={{
        background:
          'radial-gradient(1200px 600px at 10% -10%, #F3E8FF 0%, transparent 60%), radial-gradient(1000px 500px at 100% 0%, #EDE9FE 0%, transparent 55%), #FAF7FF',
      }}
    >
      <KdsStyles />

      {flash && (
        <div className="kds-pop fixed left-1/2 top-5 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-300/50">
          <Bell className="h-4 w-4" />
          {flash}
        </div>
      )}
      {error && (
        <div className="kds-pop fixed left-1/2 top-5 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-full bg-red-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* ---------- HEADER ---------- */}
      <div className="shrink-0 border-b border-purple-100 bg-white/80 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-sm shadow-violet-200">
              <ChefHat className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight text-gray-900">Kitchen Display</h1>
              <p className="text-[11px] text-gray-400">Cook the same dish together · serve each item when it's ready</p>
            </div>
          </div>

          {/* view switch */}
          <div className="order-3 flex w-full rounded-2xl bg-purple-50 p-1 ring-1 ring-purple-100 sm:order-none sm:w-auto" role="tablist" aria-label="View">
            {([
              { v: 'items', l: 'By item', i: LayoutGrid },
              { v: 'orders', l: 'By order', i: ListChecks },
            ] as const).map((t) => (
              <button
                key={t.v}
                type="button"
                role="tab"
                aria-selected={view === t.v}
                onClick={() => changeView(t.v)}
                className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition sm:flex-none ${
                  view === t.v ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <t.i className="h-4 w-4" /> {t.l}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right md:block">
              <p className="font-mono text-base font-bold leading-none text-gray-900">{formatClock(clockDate)}</p>
              <p className="mt-0.5 text-[11px] text-gray-400">{formatClockDate(clockDate)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSound}
                className={`rounded-xl border p-2.5 shadow-sm transition-colors ${
                  soundEnabled ? 'border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100' : 'border-purple-100 bg-white text-gray-400 hover:bg-purple-50 hover:text-gray-600'
                }`}
                title={soundEnabled ? 'Mute new-order chime' : 'Unmute new-order chime'}
              >
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
              <button
                onClick={toggleFullscreen}
                className="rounded-xl border border-purple-100 bg-white p-2.5 text-gray-500 shadow-sm transition-colors hover:bg-purple-50 hover:text-violet-700"
                title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                onClick={fetchOrders}
                className="rounded-xl border border-purple-100 bg-white p-2.5 text-gray-500 shadow-sm transition-colors hover:bg-purple-50 hover:text-violet-700"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* stats */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { n: totals.toCook, l: 'To cook', i: CookingPot, c: 'text-violet-700 bg-violet-50 ring-violet-100' },
            { n: totals.cooking, l: 'Cooking now', i: Flame, c: 'text-fuchsia-700 bg-fuchsia-50 ring-fuchsia-100' },
            { n: totals.toServe, l: 'Ready to serve', i: HandPlatter, c: 'text-emerald-700 bg-emerald-50 ring-emerald-100' },
            { n: totals.late, l: 'Running late', i: AlertTriangle, c: totals.late ? 'text-red-600 bg-red-50 ring-red-200' : 'text-slate-500 bg-slate-50 ring-slate-100' },
          ].map((s) => (
            <div key={s.l} className={`flex items-center gap-2.5 rounded-2xl px-3 py-2 ring-1 ring-inset ${s.c}`}>
              <s.i className={`h-4 w-4 shrink-0 ${s.l === 'Running late' && totals.late ? 'animate-pulse' : ''}`} />
              <span className="font-mono text-xl font-black tabular-nums">{s.n}</span>
              <span className="truncate text-[11px] font-bold uppercase tracking-wider opacity-80">{s.l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- BOARD ---------- */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="space-y-3 text-center">
            <div className="mx-auto flex h-12 w-12 animate-pulse items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
            <p className="text-sm font-medium text-gray-500">Loading the kitchen…</p>
          </div>
        </div>
      ) : view === 'items' ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto px-4 pt-4 sm:px-6 lg:grid-cols-[1fr_360px] lg:overflow-hidden">
          {/* dishes */}
          <div className="flex min-h-0 flex-col">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-extrabold text-slate-800">
                <Sparkles className="h-4 w-4 text-violet-500" /> {cards.length} dish{cards.length === 1 ? '' : 'es'} to cook
                <span className="hidden text-xs font-medium text-slate-400 sm:inline">— tap a dish to see who ordered it</span>
              </p>
              <div className="flex rounded-full bg-white p-1 ring-1 ring-purple-100">
                {([
                  { v: 'oldest', l: 'Oldest' },
                  { v: 'most', l: 'Most' },
                  { v: 'name', l: 'A–Z' },
                ] as const).map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setSortBy(s.v)}
                    className={`cursor-pointer rounded-full px-3 py-1 text-xs font-bold transition ${sortBy === s.v ? 'bg-violet-600 text-white shadow' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    {s.l}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 pb-4 pr-1 lg:overflow-y-auto">
              {cards.length === 0 ? (
                <Empty icon={UtensilsCrossed} title="Nothing to cook right now" sub="New orders appear here by dish, so the same item can be cooked together." />
              ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {cards.map((g, i) => (
                    <div key={g.key} style={{ animationDelay: `${Math.min(i, 12) * 20}ms` }} className="kds-in">
                      <ItemCard g={g} now={now} selected={openItem === g.key} onOpen={() => setOpenItem(g.key)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* pass */}
          <div className="min-h-0 lg:pb-0">
            <PassPanel orders={activeOrders} now={now} busyKeys={busyKeys} act={act} allEntries={entriesOf} />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4 sm:px-6">
          {ordersSorted.length === 0 ? (
            <Empty icon={UtensilsCrossed} title="No open orders" sub="Orders show here with their progress, item by item." />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {ordersSorted.map((o) => (
                <React.Fragment key={o._id}>
                  <OrderCard o={o} now={now} busyKeys={busyKeys} act={act} entries={entriesOf(o)} onReprint={reprintOrder} />
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      )}

      {openItem && (
        <ItemDrawer g={drawerGroup} name={drawerName || lastName.current} now={now} busyKeys={busyKeys} act={act} onClose={closeDrawer} />
      )}
    </div>
  );
}

function KdsStyles() {
  return (
    <style>{`
      @keyframes kdsIn { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
      @keyframes kdsSlide { from { transform: translateX(100%); } to { transform: none; } }
      @keyframes kdsFade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes kdsPop { from { opacity: 0; transform: translateY(-6px) scale(.97); } to { opacity: 1; transform: none; } }
      @keyframes kdsFlicker { 0%,100% { transform: scale(1); } 50% { transform: scale(1.18) rotate(-6deg); } }
      .kds-in { animation: kdsIn .35s cubic-bezier(.22,1,.36,1) both; }
      .kds-card { animation: kdsIn .3s cubic-bezier(.22,1,.36,1) both; }
      .kds-row { animation: kdsIn .25s cubic-bezier(.22,1,.36,1) both; }
      .kds-slide { animation: kdsSlide .32s cubic-bezier(.22,1,.36,1); }
      .kds-fade { animation: kdsFade .2s ease-out; }
      .kds-pop { animation: kdsPop .22s cubic-bezier(.22,1,.36,1); }
      .kds-flicker { animation: kdsFlicker 1.2s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .kds-in, .kds-card, .kds-row, .kds-slide, .kds-fade, .kds-pop, .kds-flicker { animation: none; }
      }
    `}</style>
  );
}