import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChefHat, Loader2, RefreshCw, Search, AlertTriangle, CheckCircle2, Save, Undo2, TrendingUp,
  Wallet, Percent, ListChecks, Info, Download, Settings2, Sparkles, Layers,
} from 'lucide-react';

// =====================================================================
// 🍳 FOOD PREPARATION COST
//   Tab 1 "Set costs"      → write what ONE plate costs to make, see profit per plate
//   Tab 2 "Profit report"  → real profit from PAID bills + DELIVERED online orders
// Open for: Manager, Kitchen Staff, Cashier (server checks it too)
// =====================================================================
const API_BASE = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');
const FC_URL = `${API_BASE}/api/food-cost`;
const DAY_START_HOUR = 5; // same as the Dashboard (business day starts 5 AM)

type Source = 'set' | 'combo' | 'estimate' | 'missing' | 'partly-missing' | 'partly-estimate';

interface CostItem {
  id: string;
  itemName: string;
  category: string;
  status: string;
  price: number;
  isCombo: boolean;
  comboItems: { itemName: string; quantity: number }[];
  costPrice: number | null;
  cost: number | null;
  source: Source;
  profit: number | null;
  margin: number | null;
  costUpdatedAt: string | null;
  costUpdatedBy: string;
}
interface Settings {
  estimatePercent: number;
  useEstimate: boolean;
}
interface ProfitItem {
  key: string;
  name: string;
  category: string;
  qty: number;
  revenue: number;
  cost: number | null;
  profit: number | null;
  margin: number | null;
  source: Source;
}
interface ProfitData {
  settings: Settings;
  totals: {
    revenue: number;
    cost: number;
    profit: number;
    margin: number | null;
    costPercent: number | null;
    estimatedRevenue: number;
    missingRevenue: number;
    qty: number;
    bills: number;
    deliveries: number;
    realCostShare: number | null;
  };
  items: ProfitItem[];
  days: { day: string; revenue: number; cost: number; profit: number }[];
}

type Period = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';

const npr = (n: number) => `NPR ${Math.round(n).toLocaleString('en-IN')}`;
const npr2 = (n: number) => `NPR ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const dateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function businessStart(d = new Date()) {
  const x = new Date(d.getTime() - DAY_START_HOUR * 3600000);
  x.setHours(DAY_START_HOUR, 0, 0, 0);
  return x;
}
function rangeFor(p: Period, cFrom: string, cTo: string): { from: Date; to: Date } {
  const now = new Date();
  const today = businessStart(now);
  const day = 86400000;
  if (p === 'today') return { from: today, to: now };
  if (p === 'yesterday') return { from: new Date(today.getTime() - day), to: new Date(today.getTime() - 1) };
  if (p === '7d') return { from: new Date(today.getTime() - 6 * day), to: now };
  if (p === '30d') return { from: new Date(today.getTime() - 29 * day), to: now };
  if (p === 'month') {
    const m = new Date(today);
    m.setDate(1);
    return { from: m, to: now };
  }
  const f = new Date(`${cFrom}T00:00:00`);
  f.setHours(DAY_START_HOUR);
  const t = new Date(`${cTo}T00:00:00`);
  t.setHours(DAY_START_HOUR);
  return { from: f, to: new Date(Math.min(t.getTime() + day - 1, now.getTime())) };
}

// Food cost % → colour (most restaurants aim for 28–35 %)
function health(costPct: number | null) {
  if (costPct === null) return { text: 'text-slate-400', bar: 'bg-slate-300', chip: 'bg-slate-100 text-slate-500', label: '—' };
  if (costPct > 100) return { text: 'text-rose-600', bar: 'bg-rose-500', chip: 'bg-rose-100 text-rose-700', label: 'Loss' };
  if (costPct > 50) return { text: 'text-rose-600', bar: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700', label: 'Low profit' };
  if (costPct > 35) return { text: 'text-amber-600', bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700', label: 'OK' };
  return { text: 'text-emerald-600', bar: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700', label: 'Good' };
}

function SourceChip({ source }: { source: Source }) {
  const map: Record<Source, [string, string]> = {
    set: ['Cost added', 'bg-emerald-50 text-emerald-700 ring-emerald-200'],
    combo: ['Auto (combo)', 'bg-sky-50 text-sky-700 ring-sky-200'],
    estimate: ['Estimated', 'bg-amber-50 text-amber-700 ring-amber-200'],
    'partly-estimate': ['Part estimated', 'bg-amber-50 text-amber-700 ring-amber-200'],
    missing: ['No cost', 'bg-rose-50 text-rose-700 ring-rose-200'],
    'partly-missing': ['Part no cost', 'bg-rose-50 text-rose-700 ring-rose-200'],
  };
  const [label, cls] = map[source] || map.missing;
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${cls}`}>{label}</span>;
}

function Tile({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: React.ReactNode; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <div className="flex items-center gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ${tone}`}>{icon}</span>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      </div>
      <p className="mt-3 font-mono text-xl font-extrabold tabular-nums text-slate-900 sm:text-2xl">{value}</p>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export default function FoodCost() {
  const [tab, setTab] = useState<'costs' | 'report'>('costs');
  const [items, setItems] = useState<CostItem[]>([]);
  const [settings, setSettings] = useState<Settings>({ estimatePercent: 33, useEstimate: true });
  const [canEditSettings, setCanEditSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  // edits that are not saved yet: id → text in the box
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [applyToPast, setApplyToPast] = useState(false);
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'missing' | 'done' | 'loss'>('all');
  const [category, setCategory] = useState('all');

  const [period, setPeriod] = useState<Period>('7d');
  const [cFrom, setCFrom] = useState(dateInput(new Date(Date.now() - 6 * 86400000)));
  const [cTo, setCTo] = useState(dateInput(new Date()));
  const [profit, setProfit] = useState<ProfitData | null>(null);
  const [profitLoading, setProfitLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'profit' | 'revenue' | 'qty' | 'margin'>('profit');

  const [pctInput, setPctInput] = useState('33');

  const flash = (ok: boolean, text: string) => {
    setToast({ ok, text });
    window.setTimeout(() => setToast(null), 3500);
  };

  const loadItems = useCallback(async () => {
    try {
      const res = await fetch(`${FC_URL}/items`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'Could not load menu costs.');
      setItems(json.data.items || []);
      setSettings(json.data.settings);
      setPctInput(String(json.data.settings?.estimatePercent ?? 33));
      setCanEditSettings(Boolean(json.data.canEditSettings));
      setError('');
    } catch (e: any) {
      setError(e.message || 'Could not load menu costs.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProfit = useCallback(async () => {
    setProfitLoading(true);
    try {
      const { from, to } = rangeFor(period, cFrom, cTo);
      if (from > to) throw new Error('"From" date must be before "To" date.');
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kathmandu';
      const res = await fetch(
        `${FC_URL}/profit?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&tz=${encodeURIComponent(tz)}`
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'Could not load profit.');
      setProfit(json.data);
    } catch (e: any) {
      flash(false, e.message || 'Could not load profit.');
      setProfit(null);
    } finally {
      setProfitLoading(false);
    }
  }, [period, cFrom, cTo]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);
  useEffect(() => {
    loadProfit();
  }, [loadProfit]);

  // Warn before leaving with unsaved costs
  const dirtyIds = useMemo(
    () =>
      Object.keys(draft).filter((id) => {
        const it = items.find((i) => i.id === id);
        if (!it) return false;
        const v = draft[id].trim();
        const now = it.costPrice === null ? '' : String(it.costPrice);
        return v !== now && !(v !== '' && it.costPrice !== null && Number(v) === it.costPrice);
      }),
    [draft, items]
  );
  useEffect(() => {
    if (!dirtyIds.length) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirtyIds.length]);

  const badDraft = (v: string) => v.trim() !== '' && (!Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 10000000);

  const saveAll = async () => {
    if (!dirtyIds.length || saving) return;
    if (dirtyIds.some((id) => badDraft(draft[id]))) {
      flash(false, 'Some costs are not valid numbers. Fix the red boxes first.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${FC_URL}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: dirtyIds.map((id) => ({ id, costPrice: draft[id].trim() === '' ? null : Number(draft[id]) })),
          applyToPast,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'Could not save.');
      flash(true, json.message || 'Saved.');
      setDraft({});
      setApplyToPast(false);
      await Promise.all([loadItems(), loadProfit()]);
    } catch (e: any) {
      flash(false, e.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async (patch: Partial<Settings>) => {
    try {
      const res = await fetch(`${FC_URL}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'Could not save.');
      setSettings(json.data);
      setPctInput(String(json.data.estimatePercent));
      flash(true, 'Setting saved.');
      await Promise.all([loadItems(), loadProfit()]);
    } catch (e: any) {
      flash(false, e.message || 'Could not save.');
    }
  };

  const stats = useMemo(() => {
    const total = items.length;
    const written = items.filter((i) => i.costPrice !== null).length;
    const auto = items.filter((i) => i.costPrice === null && i.source === 'combo').length;
    const loss = items.filter((i) => i.profit !== null && i.profit < 0 && i.source !== 'estimate').length;
    return { total, done: written + auto, missing: total - written - auto, loss };
  }, [items]);

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category).filter(Boolean))).sort(), [items]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (q && !i.itemName.toLowerCase().includes(q) && !i.category.toLowerCase().includes(q)) return false;
      if (category !== 'all' && i.category !== category) return false;
      const done = i.costPrice !== null || i.source === 'combo';
      if (filter === 'missing' && done) return false;
      if (filter === 'done' && !done) return false;
      if (filter === 'loss' && !(i.profit !== null && i.profit < 0 && i.source !== 'estimate')) return false;
      return true;
    });
  }, [items, query, filter, category]);

  const reportRows = useMemo(() => {
    const rows = [...(profit?.items || [])];
    const v = (r: ProfitItem) =>
      sortBy === 'revenue' ? r.revenue : sortBy === 'qty' ? r.qty : sortBy === 'margin' ? r.margin ?? -1e9 : r.profit ?? -1e9;
    return rows.sort((a, b) => v(b) - v(a));
  }, [profit, sortBy]);

  const exportCsv = () => {
    if (!profit) return;
    const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const lines = [
      ['Item', 'Category', 'Sold', 'Sales (NPR)', 'Cost (NPR)', 'Profit (NPR)', 'Margin %', 'Cost type'].map(esc).join(','),
      ...reportRows.map((r) => [r.name, r.category, r.qty, r.revenue, r.cost ?? '', r.profit ?? '', r.margin ?? '', r.source].map(esc).join(',')),
      '',
      [esc('TOTAL'), '', profit.totals.qty, profit.totals.revenue, profit.totals.cost, profit.totals.profit, profit.totals.margin ?? '', ''].join(','),
    ];
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `food-cost-profit-${dateInput(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-purple-600" /> Loading food costs…
      </div>
    );
  }

  const T0 = profit?.totals;
  const maxDay = Math.max(1, ...(profit?.days || []).map((d) => Math.max(d.revenue, 0)));
  const est = settings.estimatePercent;

  return (
    <div className="space-y-6 pb-28" id="food-cost-page">
      {/* ---------- HEADER ---------- */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 via-rose-500 to-purple-600 text-white shadow-lg shadow-rose-500/30">
            <ChefHat className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Food Preparation Cost</h1>
            <p className="text-sm text-slate-500">Add what each plate costs to make, and see your real profit.</p>
          </div>
        </div>
        <div className="flex rounded-2xl border border-purple-100 bg-white p-1 shadow-sm">
          {(['costs', 'report'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`cursor-pointer rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                tab === k ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-purple-50'
              }`}
            >
              {k === 'costs' ? 'Set costs' : 'Profit report'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {error}</span>
          <button type="button" onClick={loadItems} className="cursor-pointer rounded-lg bg-white px-3 py-1.5 font-bold text-rose-700 ring-1 ring-rose-200">Try again</button>
        </div>
      )}

      {/* ---------- WHAT IF COSTS ARE MISSING ---------- */}
      {stats.total > 0 && stats.done === 0 ? (
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2e1065] via-purple-800 to-indigo-900 p-6 text-white shadow-xl">
          <Sparkles className="absolute -right-4 -top-4 h-28 w-28 text-white/10" />
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-purple-200">Start here</p>
          <h2 className="mt-1 text-xl font-extrabold">No preparation cost is added yet</h2>
          <p className="mt-2 max-w-2xl text-sm text-purple-100">
            {settings.useEstimate
              ? <>Until you add costs, profit is <b>estimated</b>: each plate is counted as costing <b>{est}%</b> of its selling price (most restaurants spend 28–35%). Add the real cost of your best-selling items first; they change your profit the most.</>
              : <>Estimate is turned off, so profit cannot be shown yet. Add the cost of your items below.</>}
          </p>
          <button
            type="button"
            onClick={() => { setTab('costs'); setFilter('missing'); }}
            className="mt-4 cursor-pointer rounded-xl bg-white px-4 py-2 text-sm font-bold text-purple-800 shadow hover:bg-purple-50"
          >
            Add costs now
          </button>
        </div>
      ) : stats.missing > 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              <b>{stats.missing} of {stats.total} items have no cost.</b>{' '}
              {settings.useEstimate ? `Their cost is estimated at ${est}% of the price, so profit is not 100% exact.` : 'They are left out of the profit.'}
            </p>
          </div>
          <button type="button" onClick={() => { setTab('costs'); setFilter('missing'); }} className="shrink-0 cursor-pointer rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow hover:bg-amber-600">
            Show missing
          </button>
        </div>
      ) : stats.total > 0 ? (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="h-5 w-5" /> All {stats.total} items have a cost. Profit is exact.
        </div>
      ) : null}

      {/* ---------- PERIOD + TOTALS ---------- */}
      <div className="rounded-3xl border border-slate-200/70 bg-white/70 p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          {([['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', '7 days'], ['30d', '30 days'], ['month', 'This month'], ['custom', 'Pick dates']] as [Period, string][]).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setPeriod(k)}
              className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                period === k ? 'bg-purple-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-purple-50 hover:text-purple-700'
              }`}
            >
              {l}
            </button>
          ))}
          {period === 'custom' && (
            <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
              <input type="date" value={cFrom} max={cTo} onChange={(e) => setCFrom(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1" />
              to
              <input type="date" value={cTo} min={cFrom} max={dateInput(new Date())} onChange={(e) => setCTo(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1" />
            </span>
          )}
          <button type="button" onClick={() => { loadItems(); loadProfit(); }} title="Refresh" className="ml-auto cursor-pointer rounded-xl border border-purple-100 bg-white p-2 text-purple-600 hover:bg-purple-600 hover:text-white">
            <RefreshCw className={`h-4 w-4 ${profitLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            icon={<Wallet className="h-4 w-4" />}
            tone="from-sky-500 to-blue-600"
            label="Food sales"
            value={T0 ? npr(T0.revenue) : '—'}
            sub={T0 ? `${T0.bills} bills · ${T0.deliveries} deliveries · no VAT` : 'Paid bills only'}
          />
          <Tile
            icon={<ChefHat className="h-4 w-4" />}
            tone="from-orange-500 to-rose-500"
            label="Preparation cost"
            value={T0 ? npr(T0.cost) : '—'}
            sub={T0?.costPercent != null ? <span className={health(T0.costPercent).text}>{T0.costPercent}% of sales</span> : '—'}
          />
          <Tile
            icon={<TrendingUp className="h-4 w-4" />}
            tone={T0 && T0.profit < 0 ? 'from-rose-500 to-red-600' : 'from-emerald-500 to-teal-600'}
            label="Profit"
            value={T0 ? npr(T0.profit) : '—'}
            sub={T0?.margin != null ? `${T0.margin}% margin${T0.estimatedRevenue > 0 ? ' · partly estimated' : ''}` : '—'}
          />
          <Tile
            icon={<ListChecks className="h-4 w-4" />}
            tone="from-purple-500 to-indigo-600"
            label="Items with cost"
            value={`${stats.done} / ${stats.total}`}
            sub={
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500" style={{ width: `${stats.total ? (stats.done / stats.total) * 100 : 0}%` }} />
              </div>
            }
          />
        </div>
        {T0 && !settings.useEstimate && T0.missingRevenue > 0 && (
          <p className="mt-3 text-xs font-semibold text-rose-600">
            {npr(T0.missingRevenue)} of sales are not in the profit because those items have no cost.
          </p>
        )}
      </div>

      {/* =================== TAB 1: SET COSTS =================== */}
      {tab === 'costs' && (
        <div className="rounded-3xl border border-slate-200/70 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search item or category…" className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-500/10" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {([['all', `All (${stats.total})`], ['missing', `No cost (${stats.missing})`], ['done', `Has cost (${stats.done})`], ['loss', `Loss (${stats.loss})`]] as [typeof filter, string][]).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setFilter(k)} className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-bold ${filter === k ? (k === 'missing' || k === 'loss' ? 'bg-rose-600 text-white' : 'bg-purple-600 text-white') : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {l}
                </button>
              ))}
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">
                <option value="all">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* column titles (big screens) */}
          <div className="hidden grid-cols-12 gap-3 bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 md:grid">
            <span className="col-span-4">Menu item</span>
            <span className="col-span-2 text-right">Selling price</span>
            <span className="col-span-2">Cost of 1 plate</span>
            <span className="col-span-2 text-right">Profit / plate</span>
            <span className="col-span-2">Food cost %</span>
          </div>

          <div className="divide-y divide-slate-100">
            {shown.length === 0 && <p className="p-8 text-center text-sm text-slate-400">{items.length ? 'No items match.' : 'Your menu is empty. Add items in the Menu page first.'}</p>}
            {shown.map((it) => {
              const val = draft[it.id] ?? (it.costPrice === null ? '' : String(it.costPrice));
              const isDirty = dirtyIds.includes(it.id);
              const bad = badDraft(val);
              // live preview while typing
              const typed = val.trim() !== '' && !bad;
              const cleared = val.trim() === '' && it.costPrice !== null; // cost removed → estimate (or nothing)
              const liveCost = typed ? Number(val) : bad ? null : cleared ? (settings.useEstimate ? (it.price * est) / 100 : null) : it.cost;
              const liveSource: Source = typed ? 'set' : bad ? 'missing' : cleared ? (settings.useEstimate ? 'estimate' : 'missing') : it.source;
              const liveProfit = liveCost === null ? null : it.price - liveCost;
              const costPct = liveCost === null || it.price <= 0 ? null : (liveCost / it.price) * 100;
              const h = health(costPct);
              return (
                <div key={it.id} className={`grid grid-cols-2 items-center gap-3 px-4 py-3 md:grid-cols-12 ${isDirty ? 'bg-purple-50/60' : ''}`}>
                  <div className="col-span-2 min-w-0 md:col-span-4">
                    <div className="flex items-center gap-2">
                      {it.isCombo && <Layers className="h-3.5 w-3.5 shrink-0 text-sky-600" />}
                      <p className="truncate font-semibold text-slate-900">{it.itemName}</p>
                      <SourceChip source={liveSource} />
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      {it.category}
                      {it.isCombo && it.comboItems.length > 0 && ` · ${it.comboItems.map((c) => `${c.quantity}× ${c.itemName}`).join(' + ')}`}
                      {it.costUpdatedAt && ` · updated ${new Date(it.costUpdatedAt).toLocaleDateString()} by ${it.costUpdatedBy}`}
                    </p>
                  </div>
                  <p className="text-sm text-slate-500 md:col-span-2 md:text-right">
                    <span className="md:hidden">Price: </span>
                    <span className="font-mono font-bold text-slate-800">{npr2(it.price)}</span>
                  </p>
                  <div className="md:col-span-2">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">NPR</span>
                      <input
                        inputMode="decimal"
                        value={val}
                        onChange={(e) => setDraft((d) => ({ ...d, [it.id]: e.target.value.replace(/[^0-9.]/g, '') }))}
                        onKeyDown={(e) => e.key === 'Enter' && saveAll()}
                        placeholder={it.cost !== null && it.costPrice === null ? `${it.source === 'combo' ? 'auto' : 'est.'} ${Math.round(it.cost)}` : 'Add cost'}
                        aria-label={`Preparation cost of ${it.itemName}`}
                        className={`w-full rounded-xl border py-2 pl-10 pr-2 text-right font-mono text-sm font-bold outline-none transition-all focus:ring-4 ${
                          bad ? 'border-rose-400 bg-rose-50 focus:ring-rose-500/10' : isDirty ? 'border-purple-400 bg-white focus:ring-purple-500/15' : 'border-slate-200 bg-slate-50 focus:border-purple-400 focus:bg-white focus:ring-purple-500/10'
                        }`}
                      />
                    </div>
                  </div>
                  <p className={`text-sm md:col-span-2 md:text-right ${liveProfit !== null && liveProfit < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    <span className="text-slate-500 md:hidden">Profit: </span>
                    <span className="font-mono font-bold">{liveProfit === null ? '—' : npr2(Math.round(liveProfit * 100) / 100)}</span>
                  </p>
                  <div className="md:col-span-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${h.bar}`} style={{ width: `${Math.min(costPct ?? 0, 100)}%` }} />
                      </div>
                      <span className={`w-12 text-right font-mono text-xs font-bold ${h.text}`}>{costPct === null ? '—' : `${Math.round(costPct)}%`}</span>
                    </div>
                    {costPct !== null && costPct > 100 && <p className="mt-0.5 text-[10px] font-bold text-rose-600">Cost is more than price!</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =================== TAB 2: PROFIT REPORT =================== */}
      {tab === 'report' && (
        <div className="space-y-6">
          {/* daily bars */}
          <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Day by day</h3>
              <span className="flex items-center gap-3 text-[11px] font-semibold text-slate-500">
                <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-orange-400" /> Cost</span>
                <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Profit</span>
              </span>
            </div>
            {profitLoading ? (
              <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-purple-600" /></div>
            ) : !profit?.days.length ? (
              <p className="py-10 text-center text-sm text-slate-400">No paid sales in this time.</p>
            ) : (
              <div className="mt-4 flex h-48 items-end gap-1.5 overflow-x-auto pb-6">
                {profit.days.map((d) => {
                  const costH = (Math.min(d.cost, d.revenue) / maxDay) * 100;
                  const profH = (Math.max(d.profit, 0) / maxDay) * 100;
                  return (
                    <div key={d.day} className="group relative flex h-full min-w-[22px] flex-1 flex-col justify-end" title={`${d.day}\nSales ${npr(d.revenue)}\nCost ${npr(d.cost)}\nProfit ${npr(d.profit)}`}>
                      <div className="w-full rounded-t-md bg-emerald-500 transition-all group-hover:bg-emerald-600" style={{ height: `${profH}%` }} />
                      <div className="w-full bg-orange-400 transition-all group-hover:bg-orange-500" style={{ height: `${costH}%` }} />
                      <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold text-slate-400">{d.day.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* per item */}
          <div className="rounded-3xl border border-slate-200/70 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-bold text-slate-900">Profit by item</h3>
              <div className="flex flex-wrap items-center gap-2">
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold">
                  <option value="profit">Most profit</option>
                  <option value="revenue">Most sales</option>
                  <option value="qty">Most sold</option>
                  <option value="margin">Best margin</option>
                </select>
                <button type="button" onClick={exportCsv} disabled={!profit?.items.length} className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-40">
                  <Download className="h-3.5 w-3.5" /> Excel / CSV
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-right">Sold</th>
                    <th className="px-3 py-2 text-right">Sales</th>
                    <th className="px-3 py-2 text-right">Cost</th>
                    <th className="px-3 py-2 text-right">Profit</th>
                    <th className="px-3 py-2 text-right">Margin</th>
                    <th className="px-4 py-2 text-left">Cost type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {!profitLoading && reportRows.length === 0 && (
                    <tr><td colSpan={7} className="p-8 text-center text-slate-400">No paid sales in this time.</td></tr>
                  )}
                  {reportRows.map((r) => (
                    <tr key={r.key} className="hover:bg-purple-50/40">
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-slate-900">{r.name}</p>
                        <p className="text-[11px] text-slate-500">{r.category}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">{r.qty}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{npr(r.revenue)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-orange-600">{r.cost === null ? '—' : npr(r.cost)}</td>
                      <td className={`px-3 py-2.5 text-right font-mono font-bold ${r.profit !== null && r.profit < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{r.profit === null ? '—' : npr(r.profit)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{r.margin === null ? '—' : `${r.margin}%`}</td>
                      <td className="px-4 py-2.5"><SourceChip source={r.source} /></td>
                    </tr>
                  ))}
                </tbody>
                {T0 && reportRows.length > 0 && (
                  <tfoot className="bg-purple-50/60 font-bold">
                    <tr>
                      <td className="px-4 py-3 text-purple-900">Total</td>
                      <td className="px-3 py-3 text-right font-mono">{T0.qty}</td>
                      <td className="px-3 py-3 text-right font-mono">{npr(T0.revenue)}</td>
                      <td className="px-3 py-3 text-right font-mono text-orange-600">{npr(T0.cost)}</td>
                      <td className={`px-3 py-3 text-right font-mono ${T0.profit < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{npr(T0.profit)}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs">{T0.margin === null ? '—' : `${T0.margin}%`}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ---------- SETTINGS + HOW IT WORKS ---------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 font-bold text-slate-900"><Settings2 className="h-4 w-4 text-purple-600" /> Items without a cost</h3>
          <p className="mt-1 text-xs text-slate-500">What should we do when an item has no preparation cost?</p>
          <div className="mt-4 space-y-2">
            {[
              { v: true, t: `Estimate it (recommended)`, d: `Cost = ${est}% of the selling price. Shown as "Estimated".` },
              { v: false, t: 'Leave it out', d: 'Item is not counted in profit until a cost is added.' },
            ].map((o) => (
              <label key={String(o.v)} className={`flex items-start gap-3 rounded-2xl border p-3 ${settings.useEstimate === o.v ? 'border-purple-400 bg-purple-50/60' : 'border-slate-200'} ${canEditSettings ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}>
                <input type="radio" className="mt-1 accent-purple-600" checked={settings.useEstimate === o.v} disabled={!canEditSettings} onChange={() => saveSettings({ useEstimate: o.v })} />
                <span>
                  <span className="block text-sm font-bold text-slate-800">{o.t}</span>
                  <span className="block text-xs text-slate-500">{o.d}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Percent className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">Estimate %</span>
            <input value={pctInput} disabled={!canEditSettings} onChange={(e) => setPctInput(e.target.value.replace(/[^0-9.]/g, ''))} className="w-20 rounded-xl border border-slate-200 px-2 py-1.5 text-right font-mono text-sm font-bold disabled:bg-slate-50" />
            {canEditSettings && Number(pctInput) !== est && (
              <button type="button" onClick={() => saveSettings({ estimatePercent: Number(pctInput) })} className="cursor-pointer rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-bold text-white">Save</button>
            )}
          </div>
          {!canEditSettings && <p className="mt-2 text-[11px] text-slate-400">Only the Manager can change this.</p>}
        </div>

        <div className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 font-bold text-slate-900"><Info className="h-4 w-4 text-purple-600" /> How it works</h3>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600">
            <li>🍳 <b>Cost of 1 plate</b> = ingredients + gas + packing for ONE plate.</li>
            <li>🧾 Profit uses only <b>paid bills</b> and <b>delivered</b> online orders. Pending, Due and cancelled bills are not counted.</li>
            <li>💸 Sales are after discount, <b>without VAT</b> and delivery charge.</li>
            <li>🥡 A <b>combo</b> with no cost uses the costs of the items inside it.</li>
            <li>📅 When you change a cost, old sales keep the old cost. Tick “Use for past sales too” if the old cost was wrong.</li>
            <li>🎯 Food cost % — green up to 35%, orange 35–50%, red above 50%.</li>
          </ul>
        </div>
      </div>

      {/* ---------- SAVE BAR ---------- */}
      {dirtyIds.length > 0 && (
        <div className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl bg-slate-900 p-3 text-white shadow-2xl sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <p className="text-sm font-bold">{dirtyIds.length} cost{dirtyIds.length === 1 ? '' : 's'} not saved</p>
            <label className="mt-1 flex cursor-pointer items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={applyToPast} onChange={(e) => setApplyToPast(e.target.checked)} className="accent-purple-500" />
              Use for past sales too (only if the old cost was wrong)
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setDraft({})} className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold hover:bg-white/20">
              <Undo2 className="h-4 w-4" /> Undo
            </button>
            <button type="button" onClick={saveAll} disabled={saving} className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 px-4 py-2 text-sm font-bold shadow-lg disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save all
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-white shadow-xl ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {toast.text}
        </div>
      )}
    </div>
  );
}