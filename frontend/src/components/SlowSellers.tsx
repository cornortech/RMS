import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TrendingDown, RefreshCw, Loader2, Search, Tag, Layers, Lightbulb, Sparkles, CheckCircle2, AlertTriangle, StopCircle, ArrowRight } from 'lucide-react';
import { OfferModal, ComboModal, OFFERS_URL, npr, type OfferTarget } from './OfferTools';

// =====================================================================
// 📉 DASHBOARD → SLOW-SELLING ITEMS (last 3 days: day before yesterday, yesterday, today)
// Every menu item is checked against ALL bills of those 3 days (paid, pending, due…;
// cancelled bills are left out). The 3 days move forward by themselves every morning (5 AM).
// =====================================================================
type Level = 'not-sold' | 'very-low' | 'low' | 'ok';

interface SlowItem {
  id: string;
  itemName: string;
  category: string;
  price: number;
  imageUrl: string;
  isCombo: boolean;
  isNew: boolean;
  costPrice: number | null;
  safeDiscount: number | null;
  suggestedPercent: number;
  offer: { price: number; percentOff: number; label: string; endsAt: string | null } | null;
  perDay: [number, number, number];
  qty: number;
  revenue: number;
  level: Level;
  tips: string[];
  action: 'discount' | 'combo' | null;
  partner: { id: string; itemName: string; price: number } | null;
  comboPrice: number | null;
}
interface SlowData {
  days: [string, string, string];
  bills: number;
  itemsSold: number;
  notCounted: number;
  counts: { notSold: number; veryLow: number; low: number; withOffer: number };
  items: SlowItem[];
  bestSellers: { id: string; itemName: string; price: number; qty: number }[];
}

const LEVEL: Record<Level, { label: string; chip: string; bar: string; ring: string }> = {
  'not-sold': { label: 'Not sold', chip: 'bg-rose-100 text-rose-700', bar: 'bg-rose-400', ring: 'border-l-rose-500' },
  'very-low': { label: 'Very low', chip: 'bg-orange-100 text-orange-700', bar: 'bg-orange-400', ring: 'border-l-orange-500' },
  low: { label: 'Low', chip: 'bg-amber-100 text-amber-700', bar: 'bg-amber-400', ring: 'border-l-amber-400' },
  ok: { label: 'Selling OK', chip: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-400', ring: 'border-l-emerald-400' },
};

const dayLabel = (key: string, i: number) => {
  const d = new Date(`${key}T12:00:00`);
  const name = i === 2 ? 'Today' : i === 1 ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'short' });
  return { name, date: d.toLocaleDateString([], { month: 'short', day: 'numeric' }) };
};

export default function SlowSellers({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const [data, setData] = useState<SlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState(false);
  const [filter, setFilter] = useState<'slow' | 'not-sold' | 'offer' | 'all'>('slow');
  const [query, setQuery] = useState('');
  const [discountFor, setDiscountFor] = useState<OfferTarget | null>(null);
  const [comboFor, setComboFor] = useState<SlowItem | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [atBottom, setAtBottom] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kathmandu';
      const res = await fetch(`${OFFERS_URL}/slow-items?tz=${encodeURIComponent(tz)}`);
      if (res.status === 403) {
        setHidden(true);
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'Could not check the bills.');
      setData(json.data);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Could not check the bills.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000); // fresh every 5 minutes (and moves to the next day by itself)
    return () => clearInterval(t);
  }, [load]);

  const flash = (ok: boolean, text: string) => {
    setToast({ ok, text });
    window.setTimeout(() => setToast(null), 4000);
  };
  const saved = (msg: string) => {
    setDiscountFor(null);
    setComboFor(null);
    flash(true, msg);
    load();
  };
  const stopOffer = async (id: string) => {
    const res = await fetch(`${OFFERS_URL}/${id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    flash(res.ok && json.success, json.message || 'Could not stop the offer.');
    load();
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.items || []).filter((r) => {
      if (q && !r.itemName.toLowerCase().includes(q) && !r.category.toLowerCase().includes(q)) return false;
      if (filter === 'slow') return r.level !== 'ok';
      if (filter === 'not-sold') return r.level === 'not-sold';
      if (filter === 'offer') return !!r.offer;
      return true;
    });
  }, [data, filter, query]);

  if (hidden) return null;
  const maxDay = Math.max(1, ...(data?.items || []).flatMap((r) => r.perDay));
  const slowCount = data ? data.counts.notSold + data.counts.veryLow + data.counts.low : 0;

  return (
    <div className="db-rise overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]" id="slow-sellers-card">
      {/* HEADER */}
      <div className="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-r from-rose-50/70 via-white to-fuchsia-50/50 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white shadow-lg shadow-rose-500/25">
            <TrendingDown className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Slow-selling items</h3>
            <p className="text-xs text-slate-500">
              Last 3 days of bills · {data ? `${data.bills} bills, ${data.itemsSold} items sold` : 'checking…'} · cancelled bills not counted
            </p>
          </div>
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            {data.days.map((k, i) => {
              const l = dayLabel(k, i);
              return (
                <span key={k} className={`rounded-xl px-3 py-1.5 text-center leading-tight ${i === 2 ? 'bg-purple-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>
                  <span className="block text-[10px] font-bold uppercase tracking-wider opacity-80">{l.name}</span>
                  <span className="block text-xs font-extrabold">{l.date}</span>
                </span>
              );
            })}
            <button type="button" onClick={load} title="Check again" className="cursor-pointer rounded-xl border border-purple-100 bg-white p-2.5 text-purple-600 hover:bg-purple-600 hover:text-white">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}
      </div>

      {/* SUMMARY */}
      {data && (
        <div className="grid grid-cols-2 gap-3 border-b border-slate-100 p-4 sm:grid-cols-4">
          {[
            { n: data.counts.notSold, l: 'Not sold at all', c: 'text-rose-600', b: 'bg-rose-50' },
            { n: data.counts.veryLow, l: 'Very low', c: 'text-orange-600', b: 'bg-orange-50' },
            { n: data.counts.low, l: 'Low', c: 'text-amber-600', b: 'bg-amber-50' },
            { n: data.counts.withOffer, l: 'Offers running', c: 'text-fuchsia-600', b: 'bg-fuchsia-50' },
          ].map((s) => (
            <div key={s.l} className={`rounded-2xl ${s.b} px-4 py-3`}>
              <p className={`font-mono text-2xl font-extrabold ${s.c}`}>{s.n}</p>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{s.l}</p>
            </div>
          ))}
        </div>
      )}

      {/* FILTERS */}
      <div className="flex flex-col gap-3 p-4 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {([
            ['slow', `Slow (${slowCount})`],
            ['not-sold', `Not sold (${data?.counts.notSold ?? 0})`],
            ['offer', `With offer (${data?.counts.withOffer ?? 0})`],
            ['all', `All items (${data?.items.length ?? 0})`],
          ] as [typeof filter, string][]).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${filter === k ? 'bg-slate-900 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="relative sm:w-56">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search item…" className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-500/10" />
        </div>
      </div>

      {/* LIST (scrolls like Transaction History) */}
      <div className="relative">
        <div
          className="max-h-[520px] space-y-2.5 overflow-y-auto px-4 pb-4"
          onScroll={(e) => {
            const el = e.currentTarget;
            setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
          }}
        >
          {loading && !data ? (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-purple-600" /> Checking the last 3 days of bills…</div>
          ) : error ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">
              <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {error}</span>
              <button type="button" onClick={load} className="cursor-pointer rounded-lg bg-white px-3 py-1.5 font-bold ring-1 ring-rose-200">Try again</button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="font-bold text-slate-800">{filter === 'slow' ? 'Great! Every item is selling well.' : 'Nothing here.'}</p>
            </div>
          ) : (
            rows.map((r) => {
              const lv = LEVEL[r.level];
              return (
                <div key={r.id} className={`rounded-2xl border border-l-4 border-slate-200 ${lv.ring} bg-white p-3.5 transition-all hover:shadow-md sm:p-4`}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    {/* item */}
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {r.imageUrl ? (
                        <img src={r.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" loading="lazy" />
                      ) : (
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg font-extrabold text-slate-400">{r.itemName.slice(0, 1).toUpperCase()}</span>
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate font-bold text-slate-900">{r.itemName}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${lv.chip}`}>{lv.label}</span>
                          {r.isNew && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-extrabold text-sky-700">NEW</span>}
                          {r.isCombo && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-extrabold text-indigo-700">COMBO</span>}
                        </div>
                        <p className="text-xs text-slate-500">
                          {r.category} ·{' '}
                          {r.offer ? (
                            <>
                              <span className="line-through">{npr(r.price)}</span> <b className="text-fuchsia-700">{npr(r.offer.price)}</b>{' '}
                              <span className="rounded bg-fuchsia-100 px-1 text-[10px] font-extrabold text-fuchsia-700">{r.offer.percentOff}% OFF</span>
                            </>
                          ) : (
                            npr(r.price)
                          )}
                        </p>
                      </div>
                    </div>

                    {/* 3 days */}
                    <div className="flex items-end gap-2">
                      {r.perDay.map((q, i) => (
                        <div key={i} className="flex w-12 flex-col items-center" title={`${data ? dayLabel(data.days[i], i).name : ''}: ${q} sold`}>
                          <span className="font-mono text-xs font-bold text-slate-700">{q}</span>
                          <div className="mt-1 flex h-10 w-full items-end rounded-md bg-slate-100">
                            <div className={`w-full rounded-md ${q ? lv.bar : ''}`} style={{ height: `${q ? Math.max(12, (q / maxDay) * 100) : 0}%` }} />
                          </div>
                          <span className="mt-1 text-[9px] font-bold uppercase text-slate-400">{data ? dayLabel(data.days[i], i).name.slice(0, 3) : ''}</span>
                        </div>
                      ))}
                      <div className="ml-1 w-16 text-right">
                        <p className="font-mono text-lg font-extrabold text-slate-900">{r.qty}</p>
                        <p className="text-[10px] font-semibold text-slate-400">sold · 3 days</p>
                      </div>
                    </div>

                    {/* actions */}
                    <div className="flex flex-wrap gap-2 md:w-[230px] md:justify-end">
                      {r.offer ? (
                        <button type="button" onClick={() => stopOffer(r.id)} className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100">
                          <StopCircle className="h-4 w-4" /> Stop offer
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDiscountFor({ id: r.id, itemName: r.itemName, price: r.price, category: r.category, costPrice: r.costPrice, safeDiscount: r.safeDiscount, suggestedPercent: r.suggestedPercent })}
                          className={`flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${r.action === 'discount' ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}
                        >
                          <Tag className="h-4 w-4" /> Discount
                        </button>
                      )}
                      {!r.isCombo && (
                        <button
                          type="button"
                          onClick={() => setComboFor(r)}
                          className={`flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${r.action === 'combo' ? 'bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white shadow' : 'bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100'}`}
                        >
                          <Layers className="h-4 w-4" /> Make combo
                        </button>
                      )}
                    </div>
                  </div>

                  {r.tips.length > 0 && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
                      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <div className="space-y-0.5">{r.tips.map((t, i) => <p key={i}>{t}</p>)}</div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        {rows.length > 4 && !atBottom && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent" />}
      </div>

      {/* FOOTER */}
      <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-purple-500" />
          Ideas: a combo with a best seller, a few days’ discount, a better photo or name, or ask staff to suggest it.
          {data && data.notCounted > 0 && ` (${data.notCounted} switched-off items not checked)`}
        </span>
        {onOpenMenu && (
          <button type="button" onClick={onOpenMenu} className="flex shrink-0 cursor-pointer items-center gap-1 font-bold text-purple-700 hover:underline">
            Open Menu page <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {discountFor && <OfferModal item={discountFor} onClose={() => setDiscountFor(null)} onSaved={saved} />}
      {comboFor && (
        <ComboModal
          item={{ id: comboFor.id, itemName: comboFor.itemName, price: comboFor.price }}
          partners={data?.bestSellers}
          suggestedPartnerId={comboFor.partner?.id}
          onClose={() => setComboFor(null)}
          onSaved={saved}
        />
      )}
      {toast && (
        <div role="status" className={`fixed right-4 top-4 z-[110] flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-white shadow-xl ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {toast.text}
        </div>
      )}
    </div>
  );
}