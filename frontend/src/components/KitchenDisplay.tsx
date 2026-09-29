import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
} from 'lucide-react';

// ==========================================
// CONFIG
// ==========================================

const API_BASE = (import.meta.env.VITE_API_URL || (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '')).trim().replace(/\/+$/, '');
const ORDERS_URL = `${API_BASE}/api/orders`;

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

// How long a ticket can sit in a stage before it's flagged as running hot.
const WARN_AFTER_MIN = 8;
const CRITICAL_AFTER_MIN = 15;

// Poll interval for picking up new tickets fired in from the floor.
const POLL_MS = 8000;

// Whether the kitchen wants an audible chime on new/updated tickets,
// remembered across reloads of this screen.
const SOUND_PREF_KEY = 'kitchenDisplaySoundEnabled';

type OrderStatus = 'Pending' | 'Preparing' | 'Ready' | 'Served' | 'Cancelled';

interface OrderItem {
  itemName: string;
  description?: string;
  itemPrice: number;
  quantity: number;
}

interface Order {
  _id: string;
  restaurantId: string;
  customerName: string;
  tableNumber: string;
  orderNote?: string;
  items: OrderItem[];
  totalAmount: number;
  orderStatus: OrderStatus;
  paymentStatus: string;
  createdAt?: string;
  updatedAt?: string;
}

// The kitchen only ever sees tickets in these three lanes. Served and
// Cancelled tickets leave the pass immediately.
const LANES: { status: OrderStatus; label: string; sub: string; next: OrderStatus | null }[] = [
  { status: 'Pending', label: 'New', sub: 'Waiting to start', next: 'Preparing' },
  { status: 'Preparing', label: 'Cooking', sub: 'On the line', next: 'Ready' },
  { status: 'Ready', label: 'Ready', sub: 'Waiting for pickup', next: null },
];

// Each lane gets its own identity, but the chrome around them (header, page
// background, focus states) stays purple so the board reads as one product.
type LaneStyle = {
  dot: string;
  text: string;
  barFrom: string;
  barTo: string;
  chipBg: string;
  chipText: string;
  ring: string;
  buttonBg: string;
  buttonHover: string;
};

const LANE_STYLES: Record<string, LaneStyle> = {
  Pending: {
    dot: 'bg-amber-400',
    text: 'text-amber-700',
    barFrom: 'from-amber-400',
    barTo: 'to-orange-400',
    chipBg: 'bg-amber-50',
    chipText: 'text-amber-700',
    ring: 'ring-amber-200',
    buttonBg: 'bg-gradient-to-r from-amber-400 to-orange-400',
    buttonHover: 'hover:from-amber-500 hover:to-orange-500',
  },
  Preparing: {
    dot: 'bg-violet-500',
    text: 'text-violet-700',
    barFrom: 'from-violet-500',
    barTo: 'to-fuchsia-500',
    chipBg: 'bg-violet-50',
    chipText: 'text-violet-700',
    ring: 'ring-violet-200',
    buttonBg: 'bg-gradient-to-r from-violet-500 to-fuchsia-500',
    buttonHover: 'hover:from-violet-600 hover:to-fuchsia-600',
  },
  Ready: {
    dot: 'bg-emerald-400',
    text: 'text-emerald-700',
    barFrom: 'from-emerald-400',
    barTo: 'to-teal-400',
    chipBg: 'bg-emerald-50',
    chipText: 'text-emerald-700',
    ring: 'ring-emerald-200',
    buttonBg: 'bg-gradient-to-r from-emerald-500 to-teal-500',
    buttonHover: 'hover:from-emerald-600 hover:to-teal-600',
  },
};

// ==========================================
// TIME HELPERS
// ==========================================

function minutesSince(iso?: string, now: number = Date.now()): number {
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

function ageClass(mins: number): string {
  if (mins >= CRITICAL_AFTER_MIN) return 'text-red-600';
  if (mins >= WARN_AFTER_MIN) return 'text-amber-600';
  return 'text-gray-500';
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
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function formatClockDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

// Builds a stable fingerprint of an order's items so we can tell whether
// the item list actually changed between polls (added items, changed
// quantities, etc), independent of whatever the backend does to updatedAt.
function itemsSignature(order: Order): string {
  return (order.items || [])
    .map((i) => `${i.itemName}|${i.quantity}|${i.itemPrice}`)
    .join('~');
}

// ==========================================
// SOUND: short, friendly two-tone chime using the Web Audio API, so no
// external asset is needed and it works the instant a new ticket lands.
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
  const itemRows = (order.items || [])
    .map(
      (item) => `
        <tr>
          <td class="qty">${escapeHtml(String(item.quantity))}×</td>
          <td class="name">
            ${escapeHtml(item.itemName)}
            ${item.description ? `<div class="desc">${escapeHtml(item.description)}</div>` : ''}
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
    <div class="meta-row"><span class="meta-label">Table:</span><span class="meta-val">${escapeHtml(order.tableNumber)}</span></div>
    <div class="meta-row"><span class="meta-label">Customer:</span><span class="meta-val">${escapeHtml(order.customerName)}</span></div>
    <div class="meta-row"><span class="meta-label">Order #:</span><span class="meta-val">${escapeHtml(order._id.slice(-6).toUpperCase())}</span></div>
    <div class="meta-row"><span class="meta-label">Placed:</span><span class="meta-val">${escapeHtml(formatTicketDateTime(order.createdAt))}</span></div>
  </div>
  <table>
    <tbody>
      ${itemRows}
    </tbody>
  </table>
  ${
    order.orderNote
      ? `<div class="note"><strong>NOTE:</strong> ${escapeHtml(order.orderNote)}</div>`
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

      // Tell the printer the exact paper: 80mm wide, as long as the ticket
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
// TICKET CARD
// ==========================================

function TicketCard({
  order,
  now,
  onAdvance,
  onReprint,
  isUpdating,
}: {
  order: Order;
  now: number;
  onAdvance: (order: Order, next: OrderStatus) => void;
  onReprint: (order: Order) => void;
  isUpdating: boolean;
}) {
  const lane = LANES.find((l) => l.status === order.orderStatus);
  const styles = LANE_STYLES[order.orderStatus] || LANE_STYLES.Pending;
  const age = minutesSince(order.updatedAt || order.createdAt, now);
  const isHot = age >= CRITICAL_AFTER_MIN;
  const isWarm = age >= WARN_AFTER_MIN && !isHot;
  const itemCount = (order.items || []).reduce((sum, i) => sum + (i.quantity || 0), 0);

  return (
    <div
      className={`group relative rounded-3xl bg-white border border-purple-100/80 shadow-[0_2px_10px_rgba(124,58,237,0.06)] hover:shadow-[0_8px_24px_rgba(124,58,237,0.12)] transition-shadow duration-200 overflow-hidden ${
        isHot ? 'ring-2 ring-red-300' : isWarm ? 'ring-1 ring-amber-200' : ''
      }`}
    >
      {/* Colored identity bar for the lane this ticket belongs to */}
      <div className={`h-1.5 w-full bg-gradient-to-r ${styles.barFrom} ${styles.barTo}`} />

      {isHot && (
        <div className="absolute top-3 right-3 flex items-center gap-1 bg-red-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm animate-pulse">
          <AlertTriangle className="h-3 w-3" />
          Running late
        </div>
      )}

      <div className="p-4 flex flex-col gap-3">
        {/* Ticket header: table + elapsed time + reprint */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-medium text-purple-400">Table</p>
            <p className="font-mono text-2xl font-bold text-gray-900 leading-none mt-0.5">
              {order.tableNumber}
            </p>
          </div>
          <div className="flex items-start gap-2">
            <div className="text-right">
              <p className="text-[11px] font-medium text-purple-400 flex items-center justify-end gap-1">
                <Clock3 className="h-3 w-3" />
                Fired
              </p>
              <p className={`font-mono text-lg font-bold leading-none mt-0.5 ${ageClass(age)}`}>
                {formatElapsed(age)}
              </p>
            </div>
            <button
              onClick={() => onReprint(order)}
              className="p-1.5 bg-purple-50 hover:bg-purple-100 border border-purple-100 rounded-lg text-purple-400 hover:text-purple-700 transition-colors"
              title="Print ticket again"
            >
              <Printer className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Customer name + item count chip */}
        <div className="flex items-center justify-between border-t border-purple-50 pt-2.5">
          <p className="text-sm font-semibold text-gray-800 truncate pr-2">
            {order.customerName}
          </p>
          <span className={`shrink-0 text-[11px] font-bold ${styles.chipText} ${styles.chipBg} px-2.5 py-0.5 rounded-full`}>
            {itemCount} item{itemCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Items — the part that gets scanned fastest, so it's the biggest text on the card */}
        <div className="flex-1 space-y-1.5">
          {(order.items || []).map((item, idx) => (
            <div key={idx} className="flex items-baseline gap-2">
              <span className="font-mono text-base font-bold text-violet-600 shrink-0 w-6 text-right">
                {item.quantity}×
              </span>
              <span className="text-base font-medium text-gray-800 leading-tight">
                {item.itemName}
              </span>
            </div>
          ))}
        </div>

        {order.orderNote && (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1.5 flex items-start gap-1.5">
            <Bell className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <span>{order.orderNote}</span>
          </div>
        )}

        {/* Advance button — one tap moves the ticket to the next lane */}
        {lane?.next && (
          <button
            onClick={() => onAdvance(order, lane.next as OrderStatus)}
            disabled={isUpdating}
            className={`mt-1 w-full py-3 rounded-2xl font-bold text-sm text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm ${styles.buttonBg} ${styles.buttonHover}`}
          >
            {isUpdating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : order.orderStatus === 'Pending' ? (
              <Flame className="h-4 w-4" />
            ) : order.orderStatus === 'Preparing' ? (
              <ChefHat className="h-4 w-4" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
            {order.orderStatus === 'Pending'
              ? 'Start cooking'
              : order.orderStatus === 'Preparing'
              ? 'Mark ready'
              : 'Mark served'}
          </button>
        )}
      </div>
    </div>
  );
}

// ==========================================
// LANE COLUMN
// ==========================================

function LaneColumn({
  status,
  label,
  sub,
  orders,
  now,
  onAdvance,
  onReprint,
  updatingId,
}: {
  status: OrderStatus;
  label: string;
  sub: string;
  orders: Order[];
  now: number;
  onAdvance: (order: Order, next: OrderStatus) => void;
  onReprint: (order: Order) => void;
  updatingId: string | null;
}) {
  const styles = LANE_STYLES[status];
  const hotCount = orders.filter(
    (o) => minutesSince(o.updatedAt || o.createdAt, now) >= CRITICAL_AFTER_MIN
  ).length;

  return (
    <div className="flex flex-col min-w-0 h-full">
      <div className="rounded-2xl bg-white/70 border border-purple-100 px-4 py-3 mb-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} />
          <div>
            <div className="flex items-center gap-2">
              <h2 className={`text-sm font-bold ${styles.text}`}>{label}</h2>
              <span className="text-xs font-bold text-purple-700 bg-purple-100 rounded-full px-2 py-0.5">
                {orders.length}
              </span>
            </div>
            <p className="text-[11px] text-gray-400">{sub}</p>
          </div>
        </div>
        {hotCount > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-bold text-red-500">
            <AlertTriangle className="h-3.5 w-3.5" />
            {hotCount}
          </span>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1 pb-4">
        {orders.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-purple-200 bg-white/40 py-14 text-center flex flex-col items-center gap-2">
            <UtensilsCrossed className="h-6 w-6 text-purple-200" />
            <p className="text-xs font-medium text-purple-300">Nothing here right now</p>
          </div>
        ) : (
          orders.map((order) => (
            <TicketCard
              key={order._id}
              order={order}
              now={now}
              onAdvance={onAdvance}
              onReprint={onReprint}
              isUpdating={updatingId === order._id}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ==========================================
// MAIN DISPLAY
// ==========================================

export default function KitchenDisplay() {
  const restaurantId = getLoggedInRestaurantId();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [flash, setFlash] = useState<string | null>(null);
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
  // Separate from knownIds — tracks which order _ids have already been sent
  // to the printer, so a ticket is never auto-printed twice across polls
  // even if it lingers in the Pending lane for several fetch cycles.
  const printedIds = useRef<Set<string>>(new Set());
  // Tracks the items-signature we last printed for each order, so we can
  // tell when an already-seen order comes back from a poll with new/changed
  // items (i.e. it was edited via the Orders page) and print an update
  // ticket for just the delta — without reprinting on every unrelated poll.
  const printedSignatures = useRef<Map<string, string>>(new Map());
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  // Tick every second so the header clock and elapsed-time counters stay
  // live without re-rendering the whole board too aggressively.
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

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const fetchOrders = useCallback(async () => {
    setError('');
    try {
      const url = restaurantId
        ? `${ORDERS_URL}?restaurantId=${encodeURIComponent(restaurantId)}`
        : ORDERS_URL;
      const res = await fetch(url);
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to load orders.');
      }

      const kitchenOrders: Order[] = (result.data || []).filter((o: Order) =>
        ['Pending', 'Preparing', 'Ready'].includes(o.orderStatus)
      );

      if (!isFirstLoad.current) {
        // Brand-new tickets that have never been seen before at all.
        const newPendingTickets = kitchenOrders.filter(
          (o) => o.orderStatus === 'Pending' && !knownIds.current.has(o._id)
        );

        // Tickets we HAVE seen before, but whose item list changed since the
        // last time we printed them — this is the "order was edited and new
        // items were added" case from the Orders page.
        const updatedTickets = kitchenOrders.filter((o) => {
          if (!knownIds.current.has(o._id)) return false; // handled above as "new"
          const lastSig = printedSignatures.current.get(o._id);
          const currentSig = itemsSignature(o);
          return lastSig !== undefined && lastSig !== currentSig;
        });

        if (newPendingTickets.length > 0 || updatedTickets.length > 0) {
          if (newPendingTickets.length > 0) {
            const first = newPendingTickets[0];
            setFlash(
              newPendingTickets.length === 1
                ? `New order — Table ${first.tableNumber}`
                : `${newPendingTickets.length} new orders`
            );
            if (soundEnabledRef.current) playChime('new');
          } else if (updatedTickets.length > 0) {
            const first = updatedTickets[0];
            setFlash(
              updatedTickets.length === 1
                ? `Order updated — Table ${first.tableNumber}`
                : `${updatedTickets.length} orders updated`
            );
            if (soundEnabledRef.current) playChime('update');
          }
          window.setTimeout(() => setFlash(null), 4000);

          newPendingTickets.forEach((ticket) => {
            if (!printedIds.current.has(ticket._id)) {
              printedIds.current.add(ticket._id);
              printedSignatures.current.set(ticket._id, itemsSignature(ticket));
              autoPrintOrder(ticket, false);
            }
          });

          updatedTickets.forEach((ticket) => {
            printedSignatures.current.set(ticket._id, itemsSignature(ticket));
            autoPrintOrder(ticket, true);
          });
        }
      } else {
        // On the very first load of the board, don't mass-print every ticket
        // that was already sitting there — only mark them as seen/printed so
        // future genuinely-new tickets or edits trigger the printer correctly.
        kitchenOrders.forEach((o) => {
          printedIds.current.add(o._id);
          printedSignatures.current.set(o._id, itemsSignature(o));
        });
      }

      knownIds.current = new Set(kitchenOrders.map((o) => o._id));
      isFirstLoad.current = false;

      setOrders(kitchenOrders);
    } catch (err: any) {
      setError(err.message || 'Could not connect to the server.');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchOrders();
    const poll = window.setInterval(fetchOrders, POLL_MS);
    return () => window.clearInterval(poll);
  }, [fetchOrders]);

  // Manual reprint — always available from each ticket card, doesn't touch
  // printedIds/printedSignatures bookkeeping since it's user-initiated, not
  // part of the new/updated detection.
  const reprintOrder = useCallback((order: Order) => {
    autoPrintOrder(order, false);
  }, []);

  // Advancing a ticket sends the full order payload, same shape the existing
  // Orders page uses, so the backend's findByIdAndUpdate + runValidators pass.
  const advanceOrder = async (order: Order, newStatus: OrderStatus) => {
    setUpdatingId(order._id);

    // Optimistic update: Served tickets should feel like they leave the pass
    // instantly, not after a round trip.
    const prevOrders = orders;
    if (newStatus === 'Served') {
      setOrders((prev) => prev.filter((o) => o._id !== order._id));
    } else {
      setOrders((prev) =>
        prev.map((o) => (o._id === order._id ? { ...o, orderStatus: newStatus } : o))
      );
    }

    try {
      const res = await fetch(`${ORDERS_URL}/${order._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: order.restaurantId,
          customerName: order.customerName,
          tableNumber: order.tableNumber,
          orderNote: order.orderNote,
          items: order.items,
          totalAmount: order.totalAmount,
          orderStatus: newStatus,
          paymentStatus: order.paymentStatus,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data?.success) {
        // Roll back on failure so the board reflects reality, not the tap.
        setOrders(prevOrders);
        setError(data?.message || 'Failed to update order.');
        window.setTimeout(() => setError(''), 4000);
      }
    } catch (err) {
      setOrders(prevOrders);
      setError('Could not reach the server. Please try again.');
      window.setTimeout(() => setError(''), 4000);
    } finally {
      setUpdatingId(null);
    }
  };

  const ordersByLane = useMemo(() => {
    const grouped: Record<string, Order[]> = { Pending: [], Preparing: [], Ready: [] };
    for (const o of orders) {
      if (grouped[o.orderStatus]) grouped[o.orderStatus].push(o);
    }
    // Oldest first within each lane — the ticket that's waited longest sits
    // at the top, where it should get picked up first.
    for (const key of Object.keys(grouped)) {
      grouped[key].sort(
        (a, b) =>
          new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
      );
    }
    return grouped;
  }, [orders]);

  const hotTotal = useMemo(
    () => orders.filter((o) => minutesSince(o.updatedAt || o.createdAt, now) >= CRITICAL_AFTER_MIN).length,
    [orders, now]
  );

  const clockDate = new Date(now);

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      id="kitchen-display-root"
      style={{
        background:
          'radial-gradient(1200px 600px at 10% -10%, #F3E8FF 0%, transparent 60%), radial-gradient(1000px 500px at 100% 0%, #EDE9FE 0%, transparent 55%), #FAF7FF',
      }}
    >
      {/* New-ticket flash banner */}
      {flash && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-sm font-bold px-5 py-2.5 rounded-full shadow-lg shadow-violet-300/50">
          <Bell className="h-4 w-4" />
          {flash}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-red-500 text-white text-sm font-bold px-5 py-2.5 rounded-full shadow-lg">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-purple-100 bg-white/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-sm shadow-violet-200">
            <ChefHat className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-tight">Kitchen Display</h1>
            <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
              {orders.length} active ticket{orders.length !== 1 ? 's' : ''}
              {hotTotal > 0 && (
                <span className="inline-flex items-center gap-1 text-red-500 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                  {hotTotal} running late
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="font-mono text-base font-bold text-gray-900 leading-none">
              {formatClock(clockDate)}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">{formatClockDate(clockDate)}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleSound}
              className={`p-2.5 border rounded-xl transition-colors shadow-sm ${
                soundEnabled
                  ? 'bg-violet-50 border-violet-200 text-violet-600 hover:bg-violet-100'
                  : 'bg-white border-purple-100 text-gray-400 hover:text-gray-600 hover:bg-purple-50'
              }`}
              title={soundEnabled ? 'Mute new-order chime' : 'Unmute new-order chime'}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2.5 bg-white hover:bg-purple-50 border border-purple-100 rounded-xl text-gray-500 hover:text-violet-700 transition-colors shadow-sm"
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              onClick={fetchOrders}
              className="p-2.5 bg-white hover:bg-purple-50 border border-purple-100 rounded-xl text-gray-500 hover:text-violet-700 transition-colors shadow-sm"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Board */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="h-12 w-12 mx-auto rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center animate-pulse">
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            </div>
            <p className="text-sm font-medium text-gray-500">Loading tickets…</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-5 px-6 pt-5 min-h-0">
          {LANES.map((lane) => (
            <LaneColumn
              key={lane.status}
              status={lane.status}
              label={lane.label}
              sub={lane.sub}
              orders={ordersByLane[lane.status] || []}
              now={now}
              onAdvance={advanceOrder}
              onReprint={reprintOrder}
              updatingId={updatingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}