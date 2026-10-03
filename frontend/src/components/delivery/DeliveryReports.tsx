import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Truck, CheckCircle2, XCircle, Wallet, Bike, TrendingUp, Timer, Download } from 'lucide-react';
import { api, money } from '../../delivery/shared';

interface Report {
  totalDeliveries: number; completed: number; cancelled: number; inProgress: number;
  deliveryRevenue: number; deliveryChargesCollected: number; completionRate: number;
  riders: { riderId: string; name: string; phone: string; delivered: number; revenue: number; charges: number; avgMinutes: number | null }[];
  daily: { date: string; orders: number; delivered: number; cancelled: number; revenue: number }[];
}

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function DeliveryReports() {
  const [preset, setPreset] = useState<'today' | '7' | '30' | 'custom'>('7');
  const [from, setFrom] = useState(ymd(new Date(Date.now() - 6 * 86400000)));
  const [to, setTo] = useState(ymd(new Date()));
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const pick = (p: typeof preset) => {
    setPreset(p);
    const now = new Date();
    if (p === 'today') { setFrom(ymd(now)); setTo(ymd(now)); }
    if (p === '7') { setFrom(ymd(new Date(Date.now() - 6 * 86400000))); setTo(ymd(now)); }
    if (p === '30') { setFrom(ymd(new Date(Date.now() - 29 * 86400000))); setTo(ymd(now)); }
  };

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const f = startOfDay(new Date(from + 'T00:00:00')).toISOString();
      const t = endOfDay(new Date(to + 'T00:00:00')).toISOString();
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const j = await api<{ data: Report }>(`/api/delivery/reports?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}&tz=${encodeURIComponent(tz)}`);
      setData(j.data);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  const maxOrders = useMemo(() => Math.max(1, ...(data?.daily || []).map((d) => d.orders)), [data]);

  const exportCsv = () => {
    if (!data) return;
    const rows = [['Rider', 'Phone', 'Delivered', 'Revenue', 'Delivery charges', 'Avg minutes'], ...data.riders.map((r) => [r.name, r.phone, r.delivered, r.revenue, r.charges, r.avgMinutes ?? ''])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `rider-performance-${from}_to_${to}.csv`;
    a.click();
  };

  const cards = data ? [
    { label: 'Total deliveries', value: data.totalDeliveries, icon: Truck, g: 'from-purple-500 to-indigo-600' },
    { label: 'Completed', value: data.completed, sub: `${data.completionRate}% success`, icon: CheckCircle2, g: 'from-emerald-500 to-teal-500' },
    { label: 'Cancelled', value: data.cancelled, icon: XCircle, g: 'from-rose-500 to-red-500' },
    { label: 'Delivery revenue', value: money(data.deliveryRevenue), sub: `${money(data.deliveryChargesCollected)} from delivery charges`, icon: Wallet, g: 'from-amber-500 to-orange-500' },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl bg-purple-50 p-1 ring-1 ring-purple-100">
          {([['today', 'Today'], ['7', '7 days'], ['30', '30 days'], ['custom', 'Custom']] as const).map(([k, l]) => (
            <button key={k} onClick={() => pick(k)} className={`rounded-lg px-3.5 py-1.5 text-sm font-bold transition ${preset === k ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-purple-700'}`}>{l}</button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-purple-100 px-2.5 py-1.5" />
            <span className="text-slate-400">to</span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-purple-100 px-2.5 py-1.5" />
          </div>
        )}
      </div>

      {err && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200">{err}</div>}
      {loading && !data ? <div className="flex justify-center py-20 text-purple-400"><Loader2 className="h-7 w-7 animate-spin" /></div> : data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="relative overflow-hidden rounded-3xl bg-white p-5 ring-1 ring-purple-100">
                <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${c.g} opacity-15`} />
                <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${c.g} text-white shadow-lg`}><c.icon className="h-5 w-5" /></div>
                <p className="text-sm font-semibold text-slate-500">{c.label}</p>
                <p className="font-display text-3xl font-bold text-slate-900">{c.value}</p>
                {c.sub && <p className="mt-0.5 text-xs font-medium text-slate-500">{c.sub}</p>}
              </div>
            ))}
          </div>

          <section className="rounded-3xl bg-white p-5 ring-1 ring-purple-100">
            <div className="mb-4 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-purple-600" /><h3 className="font-display text-lg font-bold">Orders per day</h3></div>
            {data.daily.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No orders in this period.</p> : (
              <div className="flex h-48 items-end gap-2 overflow-x-auto pb-1 thin-scroll">
                {data.daily.map((d) => (
                  <div key={d.date} className="group flex min-w-[34px] flex-1 flex-col items-center justify-end gap-1" title={`${d.date}: ${d.orders} orders, ${d.delivered} delivered, ${d.cancelled} cancelled, ${money(d.revenue)}`}>
                    <span className="text-[10px] font-bold text-slate-500">{d.orders}</span>
                    <div className="flex w-full flex-col justify-end overflow-hidden rounded-t-lg bg-purple-50" style={{ height: `${Math.max(8, (d.orders / maxOrders) * 130)}px` }}>
                      <div className="bg-rose-400" style={{ height: `${(d.cancelled / d.orders) * 100}%` }} />
                      <div className="bg-gradient-to-t from-purple-600 to-violet-400" style={{ height: `${(d.delivered / d.orders) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-slate-400">{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex gap-4 text-xs font-semibold text-slate-500">
              <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded bg-purple-500" /> Delivered</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded bg-rose-400" /> Cancelled</span>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-5 ring-1 ring-purple-100">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2"><Bike className="h-5 w-5 text-purple-600" /><h3 className="font-display text-lg font-bold">Rider performance</h3></div>
              {data.riders.length > 0 && <button onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-100"><Download className="h-3.5 w-3.5" /> CSV</button>}
            </div>
            {data.riders.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No completed deliveries by riders in this period.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b border-purple-100 text-xs text-slate-500"><th className="py-2 pr-3">#</th><th className="pr-3">Rider</th><th className="pr-3">Delivered</th><th className="pr-3">Avg time</th><th className="pr-3">Order value</th><th>Delivery charges</th></tr></thead>
                  <tbody>
                    {data.riders.map((r, i) => (
                      <tr key={r.riderId} className="border-b border-slate-50 last:border-0">
                        <td className="py-3 pr-3 font-bold text-slate-400">{i === 0 ? '🏆' : i + 1}</td>
                        <td className="pr-3"><p className="font-bold text-slate-900">{r.name}</p><p className="text-xs text-slate-500">{r.phone}</p></td>
                        <td className="pr-3 font-display text-lg font-bold text-purple-700">{r.delivered}</td>
                        <td className="pr-3">{r.avgMinutes != null ? <span className="inline-flex items-center gap-1 font-semibold text-slate-700"><Timer className="h-3.5 w-3.5 text-slate-400" />{r.avgMinutes} min</span> : <span className="text-slate-400">—</span>}</td>
                        <td className="pr-3 font-semibold">{money(r.revenue)}</td>
                        <td className="font-semibold">{money(r.charges)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}