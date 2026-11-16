import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ban,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  Globe,
  History,
  KeyRound,
  LogIn,
  LogOut,
  Monitor,
  Power,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Smartphone,
  Store,
  Timer,
  UserCheck,
  Users,
  Wallet,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import { toBS } from '../utils/nepaliDate';

// =====================================================================
// 📋 ACTIVITY & SESSION LOG (Super Admin)
//  • Live board  → which restaurant is open right now, today's money, open time
//  • Timeline    → every "opened → closed" with IP, device, staff and money collected
//  • Security    → logins, wrong passwords, blocked logins, auto-deactivated accounts
// =====================================================================

const API = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');
const REFRESH_MS = 30 * 1000;
const DAY = 24 * 60 * 60 * 1000;

type Money = { total: number; bills: number; byMethod: Record<string, number> };

interface Overview {
  now: string;
  stats: { openNow: number; sessionsToday: number; salesToday: number; billsToday: number; failedToday: number; deactivated: number };
  restaurants: BoardRow[];
}

interface BoardRow {
  _id: string;
  restaurantId: string;
  restaurantName: string;
  isActive: boolean;
  isAdmin: boolean;
  deactivatedReason: string | null;
  daysLeft: number | null;
  online: boolean;
  openDevices: number;
  openSince: string | null;
  firstOpenToday: string | null;
  lastSeenAt: string | null;
  lastClosedAt: string | null;
  lastCloseReason: string | null;
  lastIp: string;
  lastDevice: string;
  sessionsToday: number;
  openMsToday: number;
  today: Money;
  failedToday: number;
}

interface SessionRow {
  _id: string;
  restaurantId: string;
  restaurantName: string;
  isAdmin: boolean;
  openedAt: string;
  closedAt: string | null;
  lastSeenAt: string;
  closeReason: string | null;
  isOpen: boolean;
  durationMs: number;
  ip: string;
  device: string;
  staff: { id: string; name: string; role: string; at: string }[];
  money: Money;
}

interface SessionsData {
  sessions: SessionRow[];
  summary: { sessions: number; openMs: number; money: Money; ips: { ip: string; count: number }[]; devices: string[] };
}

interface EventRow {
  _id: string;
  restaurantId: string;
  restaurantName: string;
  type: string;
  detail: string;
  ip: string;
  device: string;
  at: string;
}

type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | 'day';

// ---------- formatting ----------
const npr = (n: number) => `NPR ${Math.round(n || 0).toLocaleString('en-IN')}`;
const time = (d?: string | null) => (d ? new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—');
const dateLong = (d: string | Date) =>
  new Date(d).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const dateTime = (d?: string | null) =>
  d ? `${new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}, ${time(d)}` : '—';
const dur = (ms: number) => {
  if (!ms || ms < 60 * 1000) return '< 1m';
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d) return `${d}d ${h % 24}h`;
  return h ? `${h}h ${m % 60}m` : `${m}m`;
};
const ago = (d?: string | null) => (d ? `${dur(Date.now() - +new Date(d))} ago` : '');
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const initials = (name: string) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

function rangeFor(key: RangeKey, day: string): { from: Date; to: Date; label: string } {
  const now = new Date();
  const today = startOfDay(now);
  switch (key) {
    case 'yesterday':
      return { from: new Date(+today - DAY), to: new Date(+today - 1), label: 'Yesterday' };
    case '7d':
      return { from: new Date(+today - 6 * DAY), to: now, label: 'Last 7 days' };
    case '30d':
      return { from: new Date(+today - 29 * DAY), to: now, label: 'Last 30 days' };
    case 'day': {
      const d = day ? new Date(`${day}T00:00:00`) : today;
      return { from: d, to: new Date(+d + DAY - 1), label: dateLong(d) };
    }
    default:
      return { from: today, to: now, label: 'Today' };
  }
}

// Why a session closed
const CLOSE: Record<string, { label: string; hint: string; icon: typeof LogOut; cls: string }> = {
  logout: { label: 'Logged out', hint: 'Pressed the Log out button', icon: LogOut, cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
  'tab-closed': { label: 'Tab / browser closed', hint: 'The browser tab or window was closed', icon: XCircle, cls: 'bg-sky-50 text-sky-700 ring-sky-100' },
  'no-signal': { label: 'No signal', hint: 'PC switched off, went to sleep, or the internet was lost', icon: WifiOff, cls: 'bg-amber-50 text-amber-700 ring-amber-100' },
  subscription: { label: 'Subscription ended', hint: 'Days finished — account deactivated automatically', icon: Ban, cls: 'bg-rose-50 text-rose-700 ring-rose-100' },
  deactivated: { label: 'Deactivated', hint: 'Account was deactivated', icon: Ban, cls: 'bg-rose-50 text-rose-700 ring-rose-100' },
};

// Security / login events
const EVENT: Record<string, { label: string; icon: typeof LogIn; cls: string; dot: string }> = {
  login: { label: 'Login', icon: LogIn, cls: 'bg-emerald-50 text-emerald-700 ring-emerald-100', dot: 'bg-emerald-500' },
  'staff-login': { label: 'Staff login', icon: UserCheck, cls: 'bg-purple-50 text-purple-700 ring-purple-100', dot: 'bg-purple-500' },
  'login-failed': { label: 'Wrong login', icon: KeyRound, cls: 'bg-rose-50 text-rose-700 ring-rose-100', dot: 'bg-rose-500' },
  'blocked-deactivated': { label: 'Blocked — deactivated', icon: Ban, cls: 'bg-amber-50 text-amber-800 ring-amber-100', dot: 'bg-amber-500' },
  'blocked-expired': { label: 'Blocked — subscription ended', icon: Ban, cls: 'bg-amber-50 text-amber-800 ring-amber-100', dot: 'bg-amber-500' },
  'auto-deactivated': { label: 'Auto-deactivated', icon: Power, cls: 'bg-rose-50 text-rose-700 ring-rose-100', dot: 'bg-rose-500' },
  reactivated: { label: 'Re-activated', icon: RotateCcw, cls: 'bg-emerald-50 text-emerald-700 ring-emerald-100', dot: 'bg-emerald-500' },
};

const METHOD_CLS: Record<string, string> = {
  Cash: 'bg-emerald-50 text-emerald-700',
  eSewa: 'bg-green-50 text-green-700',
  Khalti: 'bg-violet-50 text-violet-700',
  Fonepay: 'bg-red-50 text-red-700',
  Card: 'bg-sky-50 text-sky-700',
  IMEPay: 'bg-orange-50 text-orange-700',
};

const deviceIcon = (d: string) => (/Android|iPhone|iPad/.test(d) ? Smartphone : Monitor);

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.message || 'Could not load the activity log.');
  return data.data as T;
}

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// =====================================================================
// SMALL PIECES
// =====================================================================
function StatTile({ label, value, sub, icon: Icon, tone }: { label: string; value: string | number; sub?: string; icon: typeof Activity; tone: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 truncate text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] font-medium text-slate-400">{sub}</p>}
    </div>
  );
}

function MethodChips({ money }: { money: Money }) {
  const list = Object.entries(money.byMethod || {}).filter(([, v]) => v > 0);
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {list.map(([m, v]) => (
        <span key={m} className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${METHOD_CLS[m] || 'bg-slate-100 text-slate-600'}`}>
          {m} {Math.round(v).toLocaleString('en-IN')}
        </span>
      ))}
    </div>
  );
}

function LiveDot({ on }: { on: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {on && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-slate-300'}`} />
    </span>
  );
}

// =====================================================================
// MAIN
// =====================================================================
export default function ActivityLog({ focusId, onFocus }: { focusId: string; onFocus: (restaurantId: string) => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [sessions, setSessions] = useState<SessionsData | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [tab, setTab] = useState<'timeline' | 'events'>('timeline');
  const [rangeKey, setRangeKey] = useState<RangeKey>('today');
  const [day, setDay] = useState('');
  const [boardFilter, setBoardFilter] = useState<'all' | 'open' | 'closed' | 'alerts'>('all');
  const [boardSearch, setBoardSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [, tick] = useState(0);

  const range = useMemo(() => rangeFor(rangeKey, day), [rangeKey, day]);
  const focused = overview?.restaurants.find((r) => r.restaurantId === focusId) || null;

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const q = `from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}${
          focusId ? `&restaurantId=${encodeURIComponent(focusId)}` : ''
        }`;
        const [ov, ss, ev] = await Promise.all([
          getJson<Overview>(`/api/admin/activity/overview?from=${encodeURIComponent(startOfDay(new Date()).toISOString())}`),
          getJson<SessionsData>(`/api/admin/activity/sessions?${q}`),
          getJson<EventRow[]>(`/api/admin/activity/events?${q}`),
        ]);
        setOverview(ov);
        setSessions(ss);
        setEvents(ev);
        setError('');
        setUpdatedAt(new Date());
      } catch (e: any) {
        setError(e?.message || 'Could not load the activity log.');
      } finally {
        setLoading(false);
      }
    },
    [range, focusId]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Live: refresh every 30 s while this page is visible; re-draw "x min ago" every 30 s
  useEffect(() => {
    const id = setInterval(() => {
      tick((n) => n + 1);
      if (document.visibilityState === 'visible') load(true);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // ---------- live board ----------
  const board = useMemo(() => {
    const q = boardSearch.trim().toLowerCase();
    return (overview?.restaurants || [])
      .filter((r) => !r.isAdmin)
      .filter((r) => !q || r.restaurantName.toLowerCase().includes(q) || r.restaurantId.toLowerCase().includes(q))
      .filter((r) =>
        boardFilter === 'open'
          ? r.online
          : boardFilter === 'closed'
            ? !r.online
            : boardFilter === 'alerts'
              ? r.failedToday > 0 || !r.isActive || (r.daysLeft !== null && r.daysLeft <= 5)
              : true
      )
      .sort((a, b) => Number(b.online) - Number(a.online) || b.today.total - a.today.total || a.restaurantName.localeCompare(b.restaurantName));
  }, [overview, boardFilter, boardSearch]);

  // ---------- timeline grouped by day ----------
  const days = useMemo(() => {
    const groups: { key: string; date: Date; items: SessionRow[]; money: number; openMs: number }[] = [];
    for (const s of sessions?.sessions || []) {
      const d = startOfDay(new Date(s.openedAt));
      const key = d.toISOString();
      let g = groups.find((x) => x.key === key);
      if (!g) groups.push((g = { key, date: d, items: [], money: 0, openMs: 0 }));
      g.items.push(s);
    }
    for (const g of groups) {
      g.money = g.items.reduce((t, s) => t + s.money.total, 0);
      g.openMs = g.items.reduce((t, s) => t + s.durationMs, 0);
    }
    return groups;
  }, [sessions]);

  const choose = (id: string) => {
    onFocus(id);
    setTimeout(() => document.getElementById('activity-log-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const exportCsv = () => {
    if (tab === 'timeline') {
      downloadCsv(`activity-sessions-${focusId || 'all'}.csv`, [
        ['Restaurant', 'Opened', 'Closed', 'Duration', 'How it closed', 'IP address', 'Device', 'Staff', 'Bills', 'Money collected (NPR)'],
        ...(sessions?.sessions || []).map((s) => [
          s.restaurantName,
          new Date(s.openedAt).toLocaleString(),
          s.closedAt ? new Date(s.closedAt).toLocaleString() : 'Open now',
          dur(s.durationMs),
          s.isOpen ? 'Open now' : CLOSE[s.closeReason || '']?.label || s.closeReason || '',
          s.ip,
          s.device,
          s.staff.map((x) => `${x.name} (${x.role})`).join('; '),
          s.money.bills,
          Math.round(s.money.total),
        ]),
      ]);
    } else {
      downloadCsv(`activity-events-${focusId || 'all'}.csv`, [
        ['Time', 'Restaurant', 'Event', 'Detail', 'IP address', 'Device'],
        ...events.map((e) => [new Date(e.at).toLocaleString(), e.restaurantName || e.restaurantId, EVENT[e.type]?.label || e.type, e.detail, e.ip, e.device]),
      ]);
    }
  };

  const stats = overview?.stats;
  const selectCls =
    'rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10';

  return (
    <section className="space-y-6" id="activity-log">
      {/* ================= HEADER ================= */}
      <div className="relative overflow-hidden rounded-3xl border border-purple-100/80 bg-linear-to-r from-purple-50 via-white to-white p-5 shadow-xs sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-purple-200/30 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/25">
              <History className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-purple-600">
                <LiveDot on /> Live monitoring
              </div>
              <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Activity & Session Log</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                When each restaurant opened and closed the system, from which IP and device, and how much money it collected.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {updatedAt && (
              <span className="hidden text-[11px] font-semibold text-slate-400 sm:inline">Updated {time(updatedAt.toISOString())}</span>
            )}
            <button
              type="button"
              onClick={() => load()}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-purple-100 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 shadow-xs transition hover:border-purple-200 hover:text-purple-700"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-purple-600' : ''}`} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-xs font-medium text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* ================= TODAY STATS ================= */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatTile label="Open right now" value={stats?.openNow ?? '—'} sub="restaurants using the system" icon={Activity} tone="bg-emerald-50 text-emerald-600" />
        <StatTile label="Money today" value={stats ? npr(stats.salesToday) : '—'} sub={stats ? `${stats.billsToday} paid bills` : ''} icon={Wallet} tone="bg-purple-50 text-purple-600" />
        <StatTile label="Sessions today" value={stats?.sessionsToday ?? '—'} sub="open → close" icon={Clock} tone="bg-indigo-50 text-indigo-600" />
        <StatTile label="Wrong logins today" value={stats?.failedToday ?? '—'} sub="wrong password or blocked" icon={ShieldAlert} tone="bg-rose-50 text-rose-600" />
        <StatTile label="Deactivated" value={stats?.deactivated ?? '—'} sub="accounts switched off" icon={Ban} tone="bg-amber-50 text-amber-600" />
      </div>

      {/* ================= LIVE BOARD ================= */}
      <div className="space-y-4 rounded-3xl border border-slate-200/60 bg-white p-5 shadow-xs sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-400">
            <Store className="h-4 w-4 text-purple-600" /> Restaurants right now
          </h3>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={boardSearch}
                onChange={(e) => setBoardSearch(e.target.value)}
                placeholder="Find restaurant…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-medium outline-none transition focus:border-purple-500 sm:w-52"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
              {(['all', 'open', 'closed', 'alerts'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setBoardFilter(f)}
                  className={`cursor-pointer whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-bold capitalize transition ${
                    boardFilter === f ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {f === 'open' ? 'Open now' : f === 'alerts' ? 'Needs attention' : f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {board.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-xs font-medium text-slate-400">
            {overview ? 'No restaurants match this filter.' : 'Loading…'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {board.map((r) => {
              const close = CLOSE[r.lastCloseReason || ''];
              const DevIcon = deviceIcon(r.lastDevice);
              const selected = focusId === r.restaurantId;
              return (
                <button
                  key={r._id}
                  type="button"
                  onClick={() => choose(selected ? '' : r.restaurantId)}
                  className={`group cursor-pointer rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
                    selected
                      ? 'border-purple-400 bg-purple-50/40 ring-2 ring-purple-500/15'
                      : r.online
                        ? 'border-emerald-200/80 bg-linear-to-br from-emerald-50/60 to-white hover:border-emerald-300'
                        : 'border-slate-200/70 bg-white hover:border-purple-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-purple-500 to-indigo-500 text-[11px] font-black text-white shadow-sm">
                        {initials(r.restaurantName)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold text-slate-900 group-hover:text-purple-700">{r.restaurantName}</p>
                        <p className="truncate font-mono text-[10px] text-slate-400">{r.restaurantId}</p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ring-1 ${
                        r.online ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-50 text-slate-500 ring-slate-200'
                      }`}
                    >
                      <LiveDot on={r.online} />
                      {r.online ? 'Open' : 'Closed'}
                    </span>
                  </div>

                  <p className="mt-3 text-[11px] font-semibold text-slate-600">
                    {r.online ? (
                      <>
                        Open since <b className="text-slate-900">{time(r.openSince)}</b> · {dur(Date.now() - +new Date(r.openSince || Date.now()))}
                        {r.openDevices > 1 && <span className="text-purple-600"> · {r.openDevices} devices</span>}
                      </>
                    ) : r.lastClosedAt ? (
                      <>
                        Closed <b className="text-slate-900">{dateTime(r.lastClosedAt)}</b>
                        {close && <span className="text-slate-400"> · {close.label}</span>}
                      </>
                    ) : (
                      <span className="text-slate-400">Never opened yet</span>
                    )}
                  </p>

                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50/80 p-2.5">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Today</p>
                      <p className="truncate text-xs font-extrabold text-purple-700">{npr(r.today.total)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Bills</p>
                      <p className="text-xs font-extrabold text-slate-800">{r.today.bills}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Open time</p>
                      <p className="text-xs font-extrabold text-slate-800">{r.openMsToday ? dur(r.openMsToday) : '—'}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                    {r.lastIp && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono">
                        <Globe className="h-3 w-3" /> {r.lastIp}
                      </span>
                    )}
                    {r.lastDevice && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5">
                        <DevIcon className="h-3 w-3" /> {r.lastDevice}
                      </span>
                    )}
                    {r.failedToday > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 font-bold text-rose-700">
                        <KeyRound className="h-3 w-3" /> {r.failedToday} wrong login{r.failedToday > 1 ? 's' : ''}
                      </span>
                    )}
                    {!r.isActive && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 font-bold text-rose-700">
                        <Ban className="h-3 w-3" /> {r.deactivatedReason === 'subscription' ? 'Subscription ended' : 'Deactivated'}
                      </span>
                    )}
                    {r.isActive && r.daysLeft !== null && r.daysLeft <= 5 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 font-bold text-amber-700">
                        <Timer className="h-3 w-3" /> {r.daysLeft} day{r.daysLeft === 1 ? '' : 's'} left
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ================= LOG PANEL ================= */}
      <div id="activity-log-panel" className="scroll-mt-24 space-y-5 rounded-3xl border border-slate-200/60 bg-white p-5 shadow-xs sm:p-6">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
            {(
              [
                ['timeline', 'Open & close timeline', Clock],
                ['events', 'Logins & security', ShieldAlert],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition ${
                  tab === key ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
                {key === 'events' && events.some((e) => e.type === 'login-failed') && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select value={focusId} onChange={(e) => onFocus(e.target.value)} className={`${selectCls} max-w-[200px]`}>
              <option value="">All restaurants</option>
              {(overview?.restaurants || []).map((r) => (
                <option key={r._id} value={r.restaurantId}>
                  {r.restaurantName}
                  {r.isAdmin ? ' (Admin)' : ''}
                </option>
              ))}
            </select>
            <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
              {(
                [
                  ['today', 'Today'],
                  ['yesterday', 'Yesterday'],
                  ['7d', '7 days'],
                  ['30d', '30 days'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRangeKey(k)}
                  className={`cursor-pointer whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                    rangeKey === k ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className={`${selectCls} flex cursor-pointer items-center gap-1.5 ${rangeKey === 'day' ? 'border-purple-400 text-purple-700' : ''}`}>
              <CalendarDays className="h-3.5 w-3.5" />
              <input
                type="date"
                value={day}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => {
                  setDay(e.target.value);
                  setRangeKey(e.target.value ? 'day' : 'today');
                }}
                className="cursor-pointer bg-transparent text-[11px] font-bold outline-none"
              />
            </label>
            <button
              type="button"
              onClick={exportCsv}
              className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-purple-600/15 transition hover:bg-purple-500"
            >
              <Download className="h-3.5 w-3.5" /> Excel / CSV
            </button>
          </div>
        </div>

        {/* Summary for the chosen restaurant / range */}
        <div className="rounded-2xl border border-purple-100 bg-linear-to-br from-[#1e003a] via-[#2d0a52] to-[#3b1266] p-5 text-white shadow-lg shadow-purple-950/10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-purple-300">{range.label}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h3 className="truncate text-lg font-extrabold">{focused ? focused.restaurantName : 'All restaurants'}</h3>
                {focused && (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      focused.online ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/10 text-purple-200'
                    }`}
                  >
                    <LiveDot on={focused.online} /> {focused.online ? 'Open now' : 'Closed'}
                  </span>
                )}
                {focusId && (
                  <button
                    type="button"
                    onClick={() => onFocus('')}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-purple-100 transition hover:bg-white/20"
                  >
                    <X className="h-3 w-3" /> Show all
                  </button>
                )}
              </div>
              {focused && (
                <p className="mt-1 text-[11px] font-medium text-purple-200">
                  {focused.isActive
                    ? focused.daysLeft !== null
                      ? `${focused.daysLeft} subscription days left`
                      : 'Active'
                    : focused.deactivatedReason === 'subscription'
                      ? 'Deactivated automatically — subscription ended'
                      : 'Deactivated by admin'}
                </p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 sm:gap-6">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-purple-300">Money collected</p>
                <p className="text-lg font-extrabold sm:text-xl">{npr(sessions?.summary.money.total || 0)}</p>
                <p className="text-[10px] text-purple-200">{sessions?.summary.money.bills || 0} paid bills</p>
              </div>
              {focusId ? (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-purple-300">Open time</p>
                  <p className="text-lg font-extrabold sm:text-xl">{dur(sessions?.summary.openMs || 0)}</p>
                  <p className="text-[10px] text-purple-200">total</p>
                </div>
              ) : (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-purple-300">Restaurants</p>
                  <p className="text-lg font-extrabold sm:text-xl">
                    {new Set((sessions?.sessions || []).filter((s) => !s.isAdmin).map((s) => s.restaurantId)).size}
                  </p>
                  <p className="text-[10px] text-purple-200">opened the system</p>
                </div>
              )}
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-purple-300">Sessions</p>
                <p className="text-lg font-extrabold sm:text-xl">{sessions?.summary.sessions || 0}</p>
                <p className="text-[10px] text-purple-200">open → close</p>
              </div>
            </div>
          </div>
          {sessions && (Object.keys(sessions.summary.money.byMethod).length > 0 || sessions.summary.ips.length > 0) && (
            <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 md:flex-row md:items-start md:justify-between">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(sessions.summary.money.byMethod as Record<string, number>)
                  .filter(([, v]) => v > 0)
                  .map(([m, v]) => (
                    <span key={m} className="rounded-lg bg-white/10 px-2 py-1 text-[11px] font-bold">
                      {m} <span className="text-purple-200">{Math.round(v).toLocaleString('en-IN')}</span>
                    </span>
                  ))}
              </div>
              {sessions.summary.ips.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300">IP addresses</span>
                  {sessions.summary.ips.slice(0, 6).map((x) => (
                    <span key={x.ip} className="rounded-lg bg-white/10 px-2 py-1 font-mono text-[10px] font-bold">
                      {x.ip} <span className="text-purple-300">×{x.count}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---------- TIMELINE ---------- */}
        {tab === 'timeline' &&
          (days.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center">
              <Clock className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-bold text-slate-500">No open / close activity in this time</p>
              <p className="text-xs text-slate-400">Try another date or restaurant.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {days.map((g) => (
                <div key={g.key}>
                  <div className="sticky top-0 z-[1] -mx-1 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/95 px-1 py-1.5 backdrop-blur">
                    <p className="text-xs font-extrabold text-slate-900">
                      {dateLong(g.date)} <span className="font-mono font-semibold text-slate-400">· {toBS(g.date)} BS</span>
                    </p>
                    <p className="text-[11px] font-bold text-slate-500">
                      {g.items.length} session{g.items.length > 1 ? 's' : ''}
                      {!focusId ? '' : ` · ${dur(g.openMs)} open`} · <span className="text-purple-700">{npr(g.money)}</span>
                    </p>
                  </div>

                  <ol className="relative space-y-3 border-l-2 border-dashed border-purple-100 pl-5 sm:pl-6">
                    {g.items.map((s) => {
                      const close = CLOSE[s.closeReason || ''];
                      const CloseIcon = close?.icon || XCircle;
                      const DevIcon = deviceIcon(s.device);
                      return (
                        <li key={s._id} className="relative">
                          <span
                            className={`absolute -left-[29px] top-4 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white sm:-left-[33px] ${
                              s.isOpen ? 'bg-emerald-500' : 'bg-purple-400'
                            }`}
                          >
                            {s.isOpen && <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />}
                          </span>

                          <div
                            className={`rounded-2xl border p-4 transition hover:shadow-sm ${
                              s.isOpen ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200/70 bg-white'
                            }`}
                          >
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              {/* Left: open → close */}
                              <div className="min-w-0 space-y-2">
                                {!focusId && (
                                  <button
                                    type="button"
                                    onClick={() => choose(s.restaurantId)}
                                    className="flex cursor-pointer items-center gap-2 text-left text-sm font-extrabold text-slate-900 hover:text-purple-700"
                                  >
                                    {s.restaurantName}
                                    {s.isAdmin && (
                                      <span className="rounded-full bg-purple-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">Admin</span>
                                    )}
                                  </button>
                                )}
                                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700">
                                    <Power className="h-3.5 w-3.5" /> Opened {time(s.openedAt)}
                                  </span>
                                  <span className="text-slate-300">→</span>
                                  {s.isOpen ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-2 py-1 text-white">
                                      <LiveDot on /> Open now
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-slate-700">
                                      <LogOut className="h-3.5 w-3.5" /> Closed {time(s.closedAt)}
                                      {s.closedAt && startOfDay(new Date(s.closedAt)).getTime() !== startOfDay(new Date(s.openedAt)).getTime() && (
                                        <span className="text-[10px] text-slate-400">({dateLong(s.closedAt)})</span>
                                      )}
                                    </span>
                                  )}
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-purple-50 px-2 py-1 text-purple-700">
                                    <Timer className="h-3.5 w-3.5" /> {dur(s.durationMs)}
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                                  {s.isOpen ? (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-emerald-700 ring-1 ring-emerald-100">
                                      <CheckCircle2 className="h-3 w-3" /> Last signal {ago(s.lastSeenAt)}
                                    </span>
                                  ) : (
                                    close && (
                                      <span title={close.hint} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ring-1 ${close.cls}`}>
                                        <CloseIcon className="h-3 w-3" /> {close.label}
                                      </span>
                                    )
                                  )}
                                  {s.ip && (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono">
                                      <Globe className="h-3 w-3" /> {s.ip}
                                    </span>
                                  )}
                                  {s.device && (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5">
                                      <DevIcon className="h-3 w-3" /> {s.device}
                                    </span>
                                  )}
                                </div>

                                {s.staff.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <Users className="h-3.5 w-3.5 text-slate-400" />
                                    {s.staff.map((st) => (
                                      <span key={st.id} className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                                        {st.name} · {st.role} <span className="font-medium text-indigo-400">{time(st.at)}</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Right: money */}
                              <div className="shrink-0 rounded-xl bg-slate-50 p-3 lg:min-w-[190px] lg:text-right">
                                <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 lg:justify-end">
                                  <Receipt className="h-3 w-3" /> Collected in this time
                                </p>
                                <p className="text-base font-extrabold text-purple-700">{npr(s.money.total)}</p>
                                <p className="mb-1.5 text-[10px] font-semibold text-slate-400">{s.money.bills} paid bills</p>
                                <div className="lg:flex lg:justify-end">
                                  <MethodChips money={s.money} />
                                </div>
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
              {(sessions?.sessions.length || 0) >= 500 && (
                <p className="text-center text-[11px] font-semibold text-slate-400">Showing the latest 500 sessions. Pick a shorter time or one restaurant to see all.</p>
              )}
            </div>
          ))}

        {/* ---------- EVENTS ---------- */}
        {tab === 'events' &&
          (events.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center">
              <ShieldAlert className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-bold text-slate-500">No login activity in this time</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200/70">
              <ul className="divide-y divide-slate-100">
                {events.map((e) => {
                  const meta = EVENT[e.type] || { label: e.type, icon: Activity, cls: 'bg-slate-50 text-slate-600 ring-slate-100', dot: 'bg-slate-400' };
                  const Icon = meta.icon;
                  const DevIcon = deviceIcon(e.device);
                  return (
                    <li key={e._id} className="flex flex-col gap-2 p-3.5 transition hover:bg-slate-50/70 sm:flex-row sm:items-center sm:gap-4">
                      <div className="flex shrink-0 items-center gap-2 sm:w-36">
                        <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                        <span className="text-[11px] font-bold text-slate-700">{dateTime(e.at)}</span>
                      </div>
                      <span className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wider ring-1 sm:w-48 ${meta.cls}`}>
                        <Icon className="h-3.5 w-3.5" /> {meta.label}
                      </span>
                      <div className="min-w-0 flex-1">
                        {!focusId && (
                          <button
                            type="button"
                            onClick={() => e.restaurantId && choose(e.restaurantId)}
                            className="cursor-pointer truncate text-xs font-extrabold text-slate-900 hover:text-purple-700"
                          >
                            {e.restaurantName || e.restaurantId || 'Unknown'}
                          </button>
                        )}
                        <p className="truncate text-[11px] font-medium text-slate-500">{e.detail}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5 text-[10px] font-semibold text-slate-500">
                        {e.ip && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono">
                            <Globe className="h-3 w-3" /> {e.ip}
                          </span>
                        )}
                        {e.device && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5">
                            <DevIcon className="h-3 w-3" /> {e.device}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

        {/* How it works */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[10px] font-semibold text-slate-500">
          {Object.entries(CLOSE)
            .filter(([k]) => k !== 'deactivated')
            .map(([k, c]) => (
              <span key={k} className="inline-flex items-center gap-1">
                <c.icon className="h-3 w-3" /> <b className="text-slate-700">{c.label}:</b> {c.hint}
              </span>
            ))}
        </div>
      </div>
    </section>
  );
}