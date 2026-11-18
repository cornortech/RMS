import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Armchair, Search, UserRound, ArrowRight, Clock, Receipt, Flame, CheckCircle2, AlertCircle,
  Ban, Users, Utensils, ShoppingBag, Loader2, RefreshCw, Sparkles, Phone, CircleDollarSign, X, BellRing,
} from 'lucide-react';
import CreateOrder, { type OrderStart } from './CreateOrder';
import CreateBill from './CreateBill';
import { useLiveRefresh, quietReload } from '../utils/liveSync';

// =====================================================================
// 🍽️ TABLES & ORDERS  (the new "Create Order" page)
//
//   1. Board:   Busy tables + Free tables + Unavailable tables  (left)
//               Free tables as big cards + "Customer / Takeaway"   (main)
//   2. Pick a free table or a customer      → the normal Create Order screen opens
//      Pick a busy table / open order        → the same screen opens WITH its items (edit + Update)
//   3. From the order screen (or the board)  → "Create bill" opens the full Create Bill window
//      (discount, VAT, delivery, Cash / eSewa / Khalti / Fonepay / split, pay later, loyalty, print)
//
// A table is "busy" when it has an open order (not finished and not paid),
// so it frees itself when the bill is paid — nothing to do by hand.
// =====================================================================
const API_BASE = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');
const ORDERS_URL = `${API_BASE}/api/orders`;
const TABLES_URL = `${API_BASE}/api/tables`;
const CUSTOMERS_URL = `${API_BASE}/api/customers`;
const NO_TABLE = 'No Table';
const BILL_ROLES = ['Manager', 'Cashier'];

type Lang = 'en' | 'ne';

interface TableRow {
  id: string;
  name: string;
  capacity: number;
  status: string;
}
interface OrderRow {
  _id: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  tableNumber: string;
  orderNote?: string;
  items: { itemName: string; description?: string; itemPrice: number; quantity: number }[];
  totalAmount: number;
  deliveryCharge?: number;
  paidVia?: string;
  orderStatus: string;
  paymentStatus: string;
  fromOnline?: boolean;
  createdAt?: string;
  [k: string]: any;
}
interface Customer {
  name: string;
  phone: string;
  address: string;
}

const key = (s: string) => String(s || '').trim().toLowerCase();
const npr = (n: number) => `NPR ${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const orderTotal = (o: OrderRow) =>
  (o.items || []).reduce((s, i) => s + (Number(i.itemPrice) || 0) * (Number(i.quantity) || 0), 0) + (Number(o.deliveryCharge) || 0);
const itemCount = (o: OrderRow) => (o.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);

/** Open = still being served or not paid yet. Billed + ready/served = done. */
function isOpen(o: OrderRow) {
  if (['Completed', 'Cancelled'].includes(o.orderStatus)) return false;
  if (String(o.tableNumber || '').startsWith('Delivery DLV-')) return false; // online orders live in Delivery
  const billed = ['Paid', 'Pending', 'Refunded'].includes(o.paymentStatus);
  if (billed && ['Ready', 'Served'].includes(o.orderStatus)) return false;
  return true;
}

function minutesSince(iso?: string, now = Date.now()) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}
function ago(min: number) {
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}
const timeTone = (min: number) =>
  min >= 45 ? 'bg-rose-50 text-rose-700 ring-rose-200' : min >= 20 ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200';

const STATUS: Record<string, { label: string; dot: string; chip: string; bar: string }> = {
  Pending: { label: 'In queue', dot: 'bg-amber-400', chip: 'bg-amber-50 text-amber-700', bar: 'from-amber-400 to-orange-400' },
  Preparing: { label: 'Cooking', dot: 'bg-orange-500', chip: 'bg-orange-50 text-orange-700', bar: 'from-orange-400 to-rose-400' },
  Ready: { label: 'Ready', dot: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700', bar: 'from-sky-400 to-indigo-400' },
  Served: { label: 'Served', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700', bar: 'from-emerald-400 to-teal-400' },
};
const st = (s: string) => STATUS[s] || STATUS.Pending;

export default function OrderFloor({ lang = 'en' as Lang }: { lang?: Lang }) {
  const restaurantId = (() => {
    try {
      return String(JSON.parse(localStorage.getItem('user') || '{}')?.id || '');
    } catch {
      return '';
    }
  })();
  const staffRole = (() => {
    try {
      return localStorage.getItem('staffRole') || '';
    } catch {
      return '';
    }
  })();
  const canBill = BILL_ROLES.includes(staffRole);

  const [tables, setTables] = useState<TableRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  // Which screen: board / order screen / bill window
  const [start, setStart] = useState<OrderStart | null>(null);
  const [screenKey, setScreenKey] = useState(0);
  const [billOrder, setBillOrder] = useState<OrderRow | null>(null);
  const [billFromScreen, setBillFromScreen] = useState(false);

  const [search, setSearch] = useState('');
  const [seats, setSeats] = useState<'all' | '2' | '4' | '6'>('all');
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const flash = (ok: boolean, text: string) => {
    setToast({ ok, text });
    window.setTimeout(() => setToast(null), 3200);
  };

  // ---------------- data ----------------
  const load = useCallback(async () => {
    if (!quietReload()) setLoading(true);
    try {
      const q = restaurantId ? `?restaurantId=${encodeURIComponent(restaurantId)}` : '';
      const [tRes, oRes] = await Promise.all([fetch(`${TABLES_URL}${q}`), fetch(`${ORDERS_URL}${q}`)]);
      const tJson = await tRes.json().catch(() => ({}));
      const oJson = await oRes.json().catch(() => ({}));
      if (!tRes.ok || tJson.success === false) throw new Error(tJson.message || 'Could not load tables.');
      if (!oRes.ok || oJson.success === false) throw new Error(oJson.message || 'Could not load orders.');
      const tList = (Array.isArray(tJson) ? tJson : tJson.data || []) as any[];
      setTables(
        tList
          .map((t) => ({ id: String(t._id || t.id), name: String(t.tableName || 'Table'), capacity: Number(t.capacity) || 0, status: String(t.status || 'Available') }))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      );
      setOrders(((Array.isArray(oJson) ? oJson : oJson.data || []) as OrderRow[]).filter(isOpen));
      setError('');
    } catch (e: any) {
      setError(e.message || 'Could not connect to the server.');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  const loadCustomers = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const res = await fetch(`${CUSTOMERS_URL}/${encodeURIComponent(restaurantId)}`);
      const json = await res.json().catch(() => ({}));
      const raw = (Array.isArray(json) ? json : json.data || []) as any[];
      const seen = new Set<string>();
      setCustomers(
        raw
          .map((c) => ({ name: String(c.customerName || '').trim(), phone: String(c.customerPhone || '').trim(), address: String(c.customerAddress || '').trim() }))
          .filter((c) => c.name && !seen.has(key(c.name)) && seen.add(key(c.name)))
      );
    } catch {
      /* suggestions are optional */
    }
  }, [restaurantId]);

  useEffect(() => {
    load();
    loadCustomers();
  }, [load, loadCustomers]);
  useLiveRefresh(['orders', 'tables', 'bills', 'delivery'], load);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);

  // "/" jumps to search on the board
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (start || billOrder) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [start, billOrder]);

  // ---------------- grouping ----------------
  const ordersByTable = useMemo(() => {
    const m = new Map<string, OrderRow[]>();
    orders.forEach((o) => {
      if (!o.tableNumber || o.tableNumber === NO_TABLE) return;
      const k = key(o.tableNumber);
      m.set(k, [...(m.get(k) || []), o]);
    });
    return m;
  }, [orders]);

  const takeaway = useMemo(
    () => orders.filter((o) => !o.tableNumber || o.tableNumber === NO_TABLE || !tables.some((t) => key(t.name) === key(o.tableNumber))),
    [orders, tables]
  );

  const groups = useMemo(() => {
    const busy: { table: TableRow; orders: OrderRow[] }[] = [];
    const free: TableRow[] = [];
    const off: TableRow[] = [];
    tables.forEach((t) => {
      const list = ordersByTable.get(key(t.name)) || [];
      if (list.length || t.status === 'Occupied') busy.push({ table: t, orders: list });
      else if (t.status === 'Reserved' || t.status === 'Out of Service') off.push(t);
      else free.push(t);
    });
    return { busy, free, off };
  }, [tables, ordersByTable]);

  const q = key(search);
  const matchesOrder = (o: OrderRow) => !q || key(o.customerName).includes(q) || key(o.tableNumber).includes(q);
  const shownBusy = groups.busy.filter((g) => !q || key(g.table.name).includes(q) || g.orders.some(matchesOrder));
  const shownTakeaway = takeaway.filter(matchesOrder);
  const shownFree = groups.free.filter(
    (t) => (!q || key(t.name).includes(q)) && (seats === 'all' || (seats === '6' ? t.capacity >= 6 : t.capacity >= Number(seats)))
  );
  const runningTotal = orders.reduce((s, o) => s + (['Paid'].includes(o.paymentStatus) ? 0 : orderTotal(o)), 0);
  const readyCount = orders.filter((o) => o.orderStatus === 'Ready').length;

  const custMatches = useMemo(() => {
    const k = key(custName);
    if (!k) return customers.slice(0, 6);
    return customers.filter((c) => key(c.name).includes(k) || c.phone.includes(custName.trim())).slice(0, 6);
  }, [customers, custName]);

  // ---------------- actions ----------------
  const open = (s: OrderStart) => {
    setStart(s);
    setScreenKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const openTable = (t: TableRow) => {
    const list = ordersByTable.get(key(t.name)) || [];
    if (list.length) open({ tableId: t.id, tableName: t.name, existingOrder: list[list.length - 1] });
    else open({ tableId: t.id, tableName: t.name });
  };
  const openOrder = (o: OrderRow) => {
    const t = tables.find((x) => key(x.name) === key(o.tableNumber));
    open({ tableId: t?.id, tableName: t?.name, existingOrder: o });
  };
  const startCustomer = (c?: Customer) => {
    const name = (c?.name ?? custName).trim();
    if (!name) return flash(false, 'Type the customer name first.');
    open({ customerName: name, customerPhone: c?.phone ?? custPhone.trim(), customerAddress: c?.address || '' });
    setCustName('');
    setCustPhone('');
    setSuggestOpen(false);
  };
  const backToBoard = () => {
    setStart(null);
    load();
  };
  const bill = (o: OrderRow, fromScreen: boolean) => {
    setBillFromScreen(fromScreen);
    setBillOrder(o);
  };
  const billClosed = (billed: boolean) => {
    const o = billOrder;
    setBillOrder(null);
    load();
    if (billed) {
      const cooking = o && ['Pending', 'Preparing'].includes(o.orderStatus);
      flash(true, cooking ? 'Bill created. The kitchen is still cooking — the table frees itself when the food is ready.' : 'Bill created — the table is free again.');
      setStart(null);
    } else if (billFromScreen && o) {
      // Not billed → back to the order (fresh, with what was saved)
      const t = tables.find((x) => key(x.name) === key(o.tableNumber));
      open({ tableId: t?.id, tableName: t?.name, existingOrder: o });
    }
  };

  // ======================= ORDER SCREEN =======================
  const billWindow = billOrder && (
    <div hidden>
      <CreateBill lang={lang} embedOrder={billOrder} onEmbedClose={billClosed} />
    </div>
  );

  if (start) {
    return (
      <div className="of-in" key={`screen-${screenKey}`}>
        <FloorStyles />
        <CreateOrder
          start={start}
          canBill={canBill}
          onBack={backToBoard}
          onDone={(_o, mode) => {
            flash(true, mode === 'updated' ? 'Order updated.' : 'Order placed and sent to the kitchen.');
            backToBoard();
          }}
          onBill={(o) => bill(o, true)}
        />
        {billWindow}
        {toast && <Toast {...toast} />}
      </div>
    );
  }

  // ======================= BOARD =======================
  return (
    <div className="of-in space-y-5" id="order-floor">
      <FloorStyles />

      {/* ---------- HEADER ---------- */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-700 via-violet-700 to-indigo-700 p-5 text-white shadow-xl shadow-purple-900/20 sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
              <Utensils className="h-7 w-7" />
            </span>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">Tables & Orders</h1>
              <p className="text-sm text-purple-100">Pick a free table or a customer to start. Tap a busy table to open its order.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              { n: groups.busy.length, l: 'Busy tables', i: Flame },
              { n: groups.free.length, l: 'Free tables', i: Armchair },
              { n: takeaway.length, l: 'Takeaway', i: ShoppingBag },
              { n: npr(runningTotal), l: 'Running total', i: CircleDollarSign },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl bg-white/12 px-3.5 py-2.5 ring-1 ring-white/20 backdrop-blur">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-purple-100">
                  <s.i className="h-3.5 w-3.5" /> {s.l}
                </p>
                <p className="mt-0.5 font-mono text-lg font-extrabold tabular-nums">{s.n}</p>
              </div>
            ))}
          </div>
        </div>
        {readyCount > 0 && (
          <p className="relative mt-4 inline-flex items-center gap-2 rounded-full bg-sky-400/25 px-3 py-1.5 text-xs font-bold ring-1 ring-sky-200/40">
            <BellRing className="h-3.5 w-3.5 animate-pulse" /> {readyCount} order{readyCount === 1 ? ' is' : 's are'} ready to serve
          </p>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" /> {error}</span>
          <button type="button" onClick={load} className="cursor-pointer rounded-lg bg-white px-3 py-1.5 font-bold ring-1 ring-rose-200">Try again</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* ================= LEFT PANEL ================= */}
        <aside className="lg:col-span-4 xl:col-span-4">
          <div className="space-y-4 lg:sticky lg:top-24">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search table or customer…   ( / )"
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-9 text-sm shadow-sm outline-none transition focus:border-purple-400 focus:ring-4 focus:ring-purple-500/10"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer rounded-md p-0.5 text-slate-400 hover:text-slate-700">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* ---- BUSY ---- */}
            <Section title="Busy tables" count={shownBusy.length + shownTakeaway.length} tone="rose" icon={Flame}>
              {loading && !orders.length ? (
                <Skeletons />
              ) : shownBusy.length + shownTakeaway.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">No open orders right now.</p>
              ) : (
                <div className="space-y-2">
                  {shownBusy.map((g) =>
                    g.orders.length === 0 ? (
                      <button
                        key={g.table.id}
                        type="button"
                        onClick={() => open({ tableId: g.table.id, tableName: g.table.name })}
                        className="flex w-full cursor-pointer items-center justify-between rounded-2xl border border-dashed border-rose-200 bg-rose-50/40 px-3.5 py-3 text-left text-sm transition hover:bg-rose-50"
                      >
                        <span className="font-bold text-slate-800">{g.table.name}</span>
                        <span className="text-[11px] font-semibold text-rose-600">Marked busy · no order — tap to start</span>
                      </button>
                    ) : (
                      g.orders.map((o) => (
                        <React.Fragment key={o._id}>
                          <OrderCard o={o} label={g.table.name} now={now} canBill={canBill} onOpen={() => openOrder(o)} onBill={() => bill(o, false)} />
                        </React.Fragment>
                      ))
                    )
                  )}
                  {shownTakeaway.length > 0 && (
                    <p className="px-1 pt-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">Takeaway & customer orders</p>
                  )}
                  {shownTakeaway.map((o) => (
                    <React.Fragment key={o._id}>
                      <OrderCard o={o} label={/^Guest\b/.test(o.customerName) ? 'Guest' : o.customerName} takeaway now={now} canBill={canBill} onOpen={() => openOrder(o)} onBill={() => bill(o, false)} />
                    </React.Fragment>
                  ))}
                </div>
              )}
            </Section>

            {/* ---- FREE (compact) ---- */}
            <Section title="Free tables" count={groups.free.length} tone="emerald" icon={Armchair}>
              {groups.free.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">{tables.length ? 'Every table is busy.' : 'No tables yet.'}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {groups.free.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => openTable(t)}
                      className="cursor-pointer rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200 transition hover:-translate-y-0.5 hover:bg-emerald-100 hover:shadow-sm"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </Section>

            {/* ---- UNAVAILABLE ---- */}
            {groups.off.length > 0 && (
              <Section title="Unavailable" count={groups.off.length} tone="slate" icon={Ban}>
                <div className="space-y-1.5">
                  {groups.off.map((t) => (
                    <div key={t.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
                      <span className="font-bold text-slate-500 line-through decoration-slate-300">{t.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${t.status === 'Reserved' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>{t.status}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        </aside>

        {/* ================= MAIN ================= */}
        <main className="space-y-5 lg:col-span-8 xl:col-span-8">
          {/* ---- CUSTOMER / TAKEAWAY ---- */}
          <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex items-center gap-3 md:w-56">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white shadow-md shadow-purple-500/25">
                  <UserRound className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-extrabold text-slate-900">Customer / Takeaway</p>
                  <p className="text-[11px] text-slate-500">No table needed</p>
                </div>
              </div>
              <div className="relative flex-1">
                <input
                  value={custName}
                  onChange={(e) => {
                    setCustName(e.target.value);
                    setSuggestOpen(true);
                  }}
                  onFocus={() => setSuggestOpen(true)}
                  onBlur={() => window.setTimeout(() => setSuggestOpen(false), 150)}
                  onKeyDown={(e) => e.key === 'Enter' && startCustomer()}
                  placeholder="Customer name (search saved customers)"
                  aria-label="Customer name"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-purple-400 focus:bg-white focus:ring-4 focus:ring-purple-500/10"
                />
                {suggestOpen && custMatches.length > 0 && (
                  <div className="of-pop absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    {custMatches.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => startCustomer(c)}
                        className="flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm hover:bg-purple-50"
                      >
                        <span className="flex items-center gap-2 font-semibold text-slate-800">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-100 text-[11px] font-extrabold text-purple-700">{c.name.slice(0, 1).toUpperCase()}</span>
                          {c.name}
                        </span>
                        {c.phone && <span className="flex items-center gap-1 text-[11px] text-slate-400"><Phone className="h-3 w-3" />{c.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                value={custPhone}
                onChange={(e) => setCustPhone(e.target.value.replace(/[^0-9+\-\s]/g, '').slice(0, 20))}
                onKeyDown={(e) => e.key === 'Enter' && startCustomer()}
                placeholder="Phone (optional)"
                aria-label="Phone"
                inputMode="tel"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-purple-400 focus:bg-white focus:ring-4 focus:ring-purple-500/10 md:w-44"
              />
              <button
                type="button"
                onClick={() => startCustomer()}
                className="flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-purple-500/25 transition hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]"
              >
                Start order <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ---- FREE TABLES (big cards) ---- */}
          <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
                  <Sparkles className="h-4 w-4 text-purple-500" /> Pick a free table
                </h2>
                <p className="text-xs text-slate-500">Tap a table to start a new order for it.</p>
              </div>
              <div className="flex items-center gap-2">
                {(['all', '2', '4', '6'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeats(s)}
                    className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-bold transition ${seats === s ? 'bg-slate-900 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {s === 'all' ? 'All' : `${s}+ seats`}
                  </button>
                ))}
                <button type="button" onClick={load} title="Refresh" className="cursor-pointer rounded-full border border-purple-100 bg-white p-2 text-purple-600 transition hover:bg-purple-600 hover:text-white">
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {loading && !tables.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}
              </div>
            ) : shownFree.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 py-12 text-center">
                <Armchair className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-bold text-slate-700">{tables.length ? 'No free table matches' : 'No tables added yet'}</p>
                <p className="text-xs text-slate-400">{tables.length ? 'Busy tables are on the left. You can still take a customer / takeaway order.' : 'Add tables in the Tables page, or take a customer order above.'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {shownFree.map((t, i) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openTable(t)}
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                    className="of-card group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-white to-emerald-50/60 p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-purple-300 hover:shadow-xl hover:shadow-purple-500/10 focus:outline-none focus-visible:ring-4 focus-visible:ring-purple-500/20"
                  >
                    <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> FREE
                    </span>
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-100 transition group-hover:bg-purple-600 group-hover:text-white group-hover:ring-purple-600">
                      <Armchair className="h-5 w-5" />
                    </span>
                    <span className="mt-4 block">
                      <span className="block truncate text-lg font-extrabold text-slate-900">{t.name}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <Users className="h-3.5 w-3.5" /> {t.capacity || '—'} seats
                      </span>
                    </span>
                    <span className="mt-3 flex items-center gap-1 text-xs font-bold text-purple-600 opacity-0 transition group-hover:opacity-100">
                      Start order <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {billWindow}
      {toast && <Toast {...toast} />}
    </div>
  );
}

/* ---------------- small pieces ---------------- */
function OrderCard({
  o,
  label,
  now,
  canBill,
  takeaway = false,
  onOpen,
  onBill,
}: {
  o: OrderRow;
  label: string;
  now: number;
  canBill: boolean;
  takeaway?: boolean;
  onOpen: () => void;
  onBill: () => void;
}) {
  const s = st(o.orderStatus);
  const min = minutesSince(o.createdAt, now);
  const paid = o.paymentStatus === 'Paid';
  return (
    <div className="of-card group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-purple-200 hover:shadow-lg">
      <span className={`absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b ${s.bar}`} />
      <button type="button" onClick={onOpen} className="block w-full cursor-pointer py-3 pl-4 pr-3 text-left" title="Open this order">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-[15px] font-extrabold text-slate-900">
              {takeaway ? <ShoppingBag className="h-4 w-4 shrink-0 text-fuchsia-500" /> : <Armchair className="h-4 w-4 shrink-0 text-rose-500" />}
              {label}
            </p>
            {!takeaway && !/^Guest\b/.test(o.customerName) && <p className="truncate text-[11px] text-slate-500">{o.customerName}</p>}
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${timeTone(min)}`}>
            <Clock className="mr-0.5 inline h-3 w-3" />
            {ago(min)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${s.chip}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} /> {s.label}
            </span>
            {paid && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">PAID</span>}
            <span className="text-[11px] text-slate-400">{itemCount(o)} items</span>
          </span>
          <span className="font-mono text-sm font-extrabold text-slate-900">{npr(orderTotal(o))}</span>
        </div>
      </button>
      {canBill && !paid && (
        <div className="flex border-t border-slate-100">
          <button type="button" onClick={onOpen} className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50 hover:text-purple-700">
            <Utensils className="h-3.5 w-3.5" /> Open / add items
          </button>
          <button type="button" onClick={onBill} className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 border-l border-slate-100 py-2 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-50">
            <Receipt className="h-3.5 w-3.5" /> Bill & pay
          </button>
        </div>
      )}
    </div>
  );
}

function Section({ title, count, tone, icon: Icon, children }: { title: string; count: number; tone: 'rose' | 'emerald' | 'slate'; icon: React.ElementType; children: React.ReactNode }) {
  const c = { rose: 'bg-rose-500', emerald: 'bg-emerald-500', slate: 'bg-slate-400' }[tone];
  return (
    <section className="rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${c} text-white`}>
            <Icon className="h-4 w-4" />
          </span>
          {title}
        </h3>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs font-bold text-slate-600">{count}</span>
      </div>
      <div className="thin-scroll max-h-[46vh] overflow-y-auto pr-0.5">{children}</div>
    </section>
  );
}

function Skeletons() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-slate-100" />)}
    </div>
  );
}

function Toast({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div role="status" className={`of-pop fixed right-5 top-5 z-[140] flex max-w-sm items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-2xl ${ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>
      {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />} {text}
    </div>
  );
}

function FloorStyles() {
  return (
    <style>{`
      @keyframes ofIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      @keyframes ofCard { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: none; } }
      @keyframes ofPop { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
      .of-in { animation: ofIn .3s cubic-bezier(.22,1,.36,1); }
      .of-card { animation: ofCard .35s cubic-bezier(.22,1,.36,1) both; }
      .of-pop { animation: ofPop .2s cubic-bezier(.22,1,.36,1); }
      @media (prefers-reduced-motion: reduce) { .of-in, .of-card, .of-pop { animation: none; } }
    `}</style>
  );
}