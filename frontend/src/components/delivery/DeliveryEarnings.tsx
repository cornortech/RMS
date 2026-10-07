import { useCallback, useEffect, useMemo, useState } from 'react';
import { Wallet, CalendarDays, CalendarRange, Infinity as InfinityIcon, RefreshCw } from 'lucide-react';
import { api, money } from '../../delivery/shared';

// 🛵 Money earned from DELIVERED orders (shown on top of the Delivery page).
interface Earned { orderNo: string; at: string; total: number; charge: number; method: 'COD' | 'Online' }
interface EarningsData { orders: Earned[]; allTime: { count: number; revenue: number; charges: number } }

const startOfDay = (daysBack = 0) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysBack);
  return d.getTime();
};

export default function DeliveryEarnings() {
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await api<{ data: EarningsData }>('/api/delivery/earnings');
      setData(j.data);
    } catch {
      /* keep the old numbers if the internet blinks */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // refresh every 30 seconds
    return () => clearInterval(t);
  }, [load]);

  const sum = useMemo(() => {
    const since = (ms: number) => {
      const rows = (data?.orders || []).filter((o) => new Date(o.at).getTime() >= ms);
      return {
        count: rows.length,
        revenue: rows.reduce((s, o) => s + o.total, 0),
        charges: rows.reduce((s, o) => s + o.charge, 0),
        cod: rows.filter((o) => o.method === 'COD').reduce((s, o) => s + o.total, 0),
        online: rows.filter((o) => o.method === 'Online').reduce((s, o) => s + o.total, 0),
      };
    };
    return { today: since(startOfDay(0)), week: since(startOfDay(6)), month: since(startOfDay(29)) };
  }, [data]);

  if (!data) return null;

  const cards = [
    { label: "Today's earnings", value: sum.today.revenue, sub: `${sum.today.count} delivered · COD ${money(sum.today.cod)} · Online ${money(sum.today.online)}`, icon: Wallet, g: 'from-amber-500 to-orange-500' },
    { label: 'Last 7 days', value: sum.week.revenue, sub: `${sum.week.count} delivered · charges ${money(sum.week.charges)}`, icon: CalendarDays, g: 'from-purple-500 to-indigo-600' },
    { label: 'Last 30 days', value: sum.month.revenue, sub: `${sum.month.count} delivered · charges ${money(sum.month.charges)}`, icon: CalendarRange, g: 'from-emerald-500 to-teal-500' },
    { label: 'All time', value: data.allTime.revenue, sub: `${data.allTime.count} delivered · charges ${money(data.allTime.charges)}`, icon: InfinityIcon, g: 'from-sky-500 to-blue-600' },
  ];

  return (
    <section aria-label="Delivery earnings">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-slate-900">🛵 Delivery earnings</h2>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded-lg bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-100">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="relative overflow-hidden rounded-3xl bg-white p-5 ring-1 ring-purple-100">
            <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${c.g} opacity-15`} />
            <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${c.g} text-white shadow-lg`}><c.icon className="h-5 w-5" /></div>
            <p className="text-sm font-semibold text-slate-500">{c.label}</p>
            <p className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">{money(c.value)}</p>
            <p className="mt-0.5 text-xs font-medium text-slate-500">{c.sub}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-400">Only delivered orders are counted. Cancelled or refunded orders are not included.</p>
    </section>
  );
}