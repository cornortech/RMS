import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp, ChefHat, AlertTriangle, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';

// =====================================================================
// 💰 DASHBOARD → PROFIT & FOOD COST card
//   Profit = food sales (paid bills + delivered online orders, after discount, no VAT)
//            − preparation cost.  Data comes from /api/food-cost.
// Also exports useItemCosts() → cost of 1 plate for every menu item (for "Top Selling Dishes").
// =====================================================================
const API_BASE = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');
const FC_URL = `${API_BASE}/api/food-cost`;
const DAY_START_HOUR = 5;
const DAY = 86400000;

const npr = (n: number) => `NPR ${Math.round(n).toLocaleString('en-IN')}`;
const keyOf = (d: Date) => {
  const x = new Date(d.getTime() - DAY_START_HOUR * 3600000);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const startOfToday = () => {
  const x = new Date(Date.now() - DAY_START_HOUR * 3600000);
  x.setHours(DAY_START_HOUR, 0, 0, 0);
  return x;
};

export interface ItemCost {
  cost: number | null;
  estimated: boolean;
}
interface CostStats {
  total: number;
  withCost: number;
  missing: number;
}

/** Cost of 1 plate per menu item name (lower-case). Empty when the role can't see costs. */
export function useItemCosts() {
  const [map, setMap] = useState<Record<string, ItemCost>>({});
  const [stats, setStats] = useState<CostStats | null>(null);
  const [estimatePercent, setEstimatePercent] = useState(33);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${FC_URL}/items`);
        const json = await res.json().catch(() => ({}));
        if (!alive || !res.ok || !json.success) return;
        const m: Record<string, ItemCost> = {};
        (json.data.items || []).forEach((i: any) => {
          m[String(i.itemName).trim().toLowerCase()] = { cost: i.cost, estimated: i.source === 'estimate' };
        });
        setMap(m);
        setStats(json.data.stats);
        setEstimatePercent(json.data.settings?.estimatePercent ?? 33);
      } catch {
        /* no costs → the dashboard just shows sales */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return { costs: map, stats, estimatePercent };
}

interface Day {
  day: string;
  revenue: number;
  cost: number;
  profit: number;
}

export default function ProfitSummary({ onOpen }: { onOpen?: () => void }) {
  const { stats, estimatePercent } = useItemCosts();
  const [days, setDays] = useState<Day[] | null>(null);
  const [estimated, setEstimated] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const today = startOfToday();
        const month = new Date(today);
        month.setDate(1);
        const from = new Date(Math.min(month.getTime(), today.getTime() - 6 * DAY));
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kathmandu';
        const res = await fetch(
          `${FC_URL}/profit?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(new Date().toISOString())}&tz=${encodeURIComponent(tz)}`
        );
        if (res.status === 403) {
          setHidden(true);
          return;
        }
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) throw new Error();
        setDays(json.data.days || []);
        setEstimated((json.data.totals?.estimatedRevenue || 0) > 0);
      } catch {
        setDays([]);
      }
    })();
  }, []);

  const sums = useMemo(() => {
    const today = startOfToday();
    const month = new Date(today);
    month.setDate(1);
    const keyToday = keyOf(new Date());
    const key7 = keyOf(new Date(today.getTime() - 6 * DAY + DAY_START_HOUR * 3600000));
    const keyMonth = keyOf(new Date(month.getTime() + DAY_START_HOUR * 3600000));
    const add = (pick: (d: Day) => boolean) =>
      (days || []).filter(pick).reduce((s, d) => ({ revenue: s.revenue + d.revenue, cost: s.cost + d.cost, profit: s.profit + d.profit }), { revenue: 0, cost: 0, profit: 0 });
    return {
      today: add((d) => d.day === keyToday),
      week: add((d) => d.day >= key7),
      month: add((d) => d.day >= keyMonth),
    };
  }, [days]);

  if (hidden) return null;
  const pct = (p: number, r: number) => (r > 0 ? `${Math.round((p / r) * 100)}% margin` : 'no sales yet');

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12" id="profit-summary">
      {/* Today */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-6 text-white shadow-xl shadow-emerald-500/20 lg:col-span-5">
        <TrendingUp className="absolute -right-6 -top-6 h-32 w-32 text-white/10" />
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-100">Net profit</p>
        {days === null ? (
          <Loader2 className="mt-4 h-6 w-6 animate-spin" />
        ) : (
          <>
            <p className="mt-2 font-mono text-3xl font-extrabold tabular-nums sm:text-4xl">{npr(sums.today.profit)}</p>
            <p className="mt-1 text-sm text-emerald-50">{pct(sums.today.profit, sums.today.revenue)}{estimated ? ' · partly estimated' : ''}</p>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-white/15 p-3 backdrop-blur">
                <p className="text-[11px] font-semibold text-emerald-100">Food sales</p>
                <p className="font-mono font-bold">{npr(sums.today.revenue)}</p>
              </div>
              <div className="rounded-2xl bg-white/15 p-3 backdrop-blur">
                <p className="text-[11px] font-semibold text-emerald-100">Preparation cost</p>
                <p className="font-mono font-bold">{npr(sums.today.cost)}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 7 days + month */}
      <div className="grid grid-cols-2 gap-4 lg:col-span-4">
        {[
          { l: 'Last 7 days', v: sums.week },
          { l: 'This month', v: sums.month },
        ].map(({ l, v }) => (
          <div key={l} className="flex flex-col justify-between rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white p-5 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">{l}</p>
            <div>
              <p className={`mt-2 font-mono text-xl font-extrabold tabular-nums ${v.profit < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{npr(v.profit)}</p>
              <p className="text-xs text-slate-500">profit · {pct(v.profit, v.revenue)}</p>
              <p className="mt-2 text-[11px] text-slate-500">Sales {npr(v.revenue)}</p>
              <p className="text-[11px] text-orange-600">Cost {npr(v.cost)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Costs status */}
      <div className="flex flex-col justify-between rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm lg:col-span-3">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <ChefHat className="h-4 w-4 text-orange-500" /> Food cost status
          </p>
          {stats ? (
            <>
              <p className="mt-2 text-2xl font-extrabold text-slate-900">
                {stats.withCost}<span className="text-base text-slate-400"> / {stats.total}</span>
              </p>
              <p className="text-xs text-slate-500">menu items have a cost</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-emerald-500" style={{ width: `${stats.total ? (stats.withCost / stats.total) * 100 : 0}%` }} />
              </div>
              {stats.missing > 0 ? (
                <p className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {stats.missing} without cost use an estimate ({estimatePercent}% of price).
                </p>
              ) : (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> All costs added — profit is exact.
                </p>
              )}
            </>
          ) : (
            <p className="mt-3 text-xs text-slate-400">Loading…</p>
          )}
        </div>
        {onOpen && (
          <button type="button" onClick={onOpen} className="mt-4 flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-3 py-2 text-sm font-bold text-white shadow hover:shadow-lg">
            {stats && stats.missing > 0 ? 'Add costs' : 'Open food cost'} <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}