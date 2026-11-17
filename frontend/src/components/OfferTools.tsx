import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Tag, Layers, CheckCircle2, AlertTriangle, Percent, Plus, StopCircle, Clock } from 'lucide-react';

// =====================================================================
// 🏷️ OFFER TOOLS (used by Dashboard → Slow-selling items AND the Menu page)
//   <OfferModal>       give a discount on ONE item for 1–60 days
//   <ComboModal>       make a combo of a slow item + a best seller
//   <MenuOffersPanel>  list of running offers on the Menu page (+ new offer / stop)
// Only the Manager can save (the server checks it too).
// =====================================================================
const API_BASE = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');
export const OFFERS_URL = `${API_BASE}/api/menu-offers`;
const MENU_URL = `${API_BASE}/api/menu`;

export const npr = (n: number) => `NPR ${Math.round(n).toLocaleString('en-IN')}`;

export interface OfferTarget {
  id: string;
  itemName: string;
  price: number; // normal price
  category?: string;
  costPrice?: number | null;
  safeDiscount?: number | null;
  suggestedPercent?: number;
}

export interface SimpleMenuItem {
  id: string;
  itemName: string;
  price: number; // normal price
  category: string;
  status: string;
  isCombo: boolean;
}

/** Normal (non-offer) menu prices — for the combo picker and the Menu page panel. */
export async function loadMenuBasic(): Promise<SimpleMenuItem[]> {
  const res = await fetch(MENU_URL);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.message || 'Could not load the menu.');
  return (json.data || []).map((m: any) => ({
    id: String(m._id || m.id),
    itemName: String(m.itemName || ''),
    price: Number(m.basePrice ?? m.price) || 0,
    category: String(m.category || ''),
    status: String(m.status || 'Available'),
    isCombo: Boolean(m.isCombo) || m.category === 'Combo',
  }));
}

function Shell({ title, sub, icon, onClose, children, footer }: { title: string; sub?: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-purple-50 via-white to-fuchsia-50 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white shadow-md">{icon}</span>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">{title}</h3>
              {sub && <p className="text-xs text-slate-500">{sub}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="cursor-pointer rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">{children}</div>
        <div className="border-t border-slate-100 bg-slate-50/60 p-4">{footer}</div>
      </div>
    </div>,
    document.body
  );
}

const chip = (on: boolean) =>
  `cursor-pointer rounded-xl px-3 py-2 text-sm font-bold transition-all ${on ? 'bg-purple-600 text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-purple-50 hover:text-purple-700'}`;

// ---------------------------------------------------------------------
// DISCOUNT ON ONE ITEM
// ---------------------------------------------------------------------
export function OfferModal({ item, onClose, onSaved }: { item: OfferTarget; onClose: () => void; onSaved: (msg: string) => void }) {
  const [kind, setKind] = useState<'percent' | 'flat'>('percent');
  const [value, setValue] = useState(String(item.suggestedPercent || 10));
  const [days, setDays] = useState(3);
  const [label, setLabel] = useState('Special offer');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const v = Number(value) || 0;
  const newPrice = Math.max(0, Math.round(kind === 'percent' ? item.price * (1 - Math.min(v, 90) / 100) : item.price - v));
  const pctOff = item.price > 0 ? Math.round(((item.price - newPrice) / item.price) * 100) : 0;
  const bad = kind === 'percent' ? v < 1 || v > 90 : v < 1 || v >= item.price;
  const profitLeft = item.costPrice != null ? newPrice - item.costPrice : null;
  const endDate = new Date(Date.now() + days * 86400000);

  const save = async () => {
    if (bad || saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${OFFERS_URL}/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, value: v, days, label: label.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'Could not start the offer.');
      onSaved(json.message || 'Offer started.');
    } catch (e: any) {
      setError(e.message || 'Could not start the offer.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell
      title="Give a discount"
      sub={`${item.itemName} · normal price ${npr(item.price)}`}
      icon={<Tag className="h-5 w-5" />}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={onClose} className="cursor-pointer rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="button" onClick={save} disabled={bad || saving} className="flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Start offer
          </button>
        </div>
      }
    >
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Discount</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={chip(kind === 'percent')} onClick={() => { setKind('percent'); setValue('10'); }}>% off</button>
          <button type="button" className={chip(kind === 'flat')} onClick={() => { setKind('flat'); setValue(String(Math.round(item.price * 0.1))); }}>NPR off</button>
          {kind === 'percent' && [10, 15, 20, 25].map((p) => (
            <button key={p} type="button" className={chip(v === p)} onClick={() => setValue(String(p))}>{p}%</button>
          ))}
        </div>
        <div className="relative mt-3">
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))}
            aria-label="Discount amount"
            className={`w-full rounded-2xl border px-4 py-3 pr-16 text-right font-mono text-2xl font-extrabold outline-none focus:ring-4 ${bad ? 'border-rose-300 focus:ring-rose-500/10' : 'border-slate-200 focus:border-purple-400 focus:ring-purple-500/10'}`}
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">{kind === 'percent' ? '%' : 'NPR'}</span>
        </div>
        {item.safeDiscount != null && (
          <p className={`mt-2 text-xs font-semibold ${kind === 'percent' && v > item.safeDiscount ? 'text-rose-600' : 'text-emerald-700'}`}>
            {item.safeDiscount > 0 ? `Safe discount: up to ${item.safeDiscount}% (keeps about 30% profit).` : 'This item has very little profit. A combo is safer than a discount.'}
          </p>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">How long</p>
        <div className="flex flex-wrap gap-2">
          {[1, 3, 7, 14, 30].map((d) => (
            <button key={d} type="button" className={chip(days === d)} onClick={() => setDays(d)}>{d === 1 ? 'Today only' : `${d} days`}</button>
          ))}
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><Clock className="h-3.5 w-3.5" /> Ends {endDate.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}, then the normal price comes back by itself.</p>
      </div>

      <div>
        <label htmlFor="offer-label" className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Name shown to customers</label>
        <input id="offer-label" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Happy Hour" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-500/10" />
      </div>

      {/* preview */}
      <div className="rounded-2xl bg-gradient-to-br from-[#2e1065] via-purple-800 to-fuchsia-800 p-4 text-white">
        <p className="text-[11px] font-bold uppercase tracking-wider text-purple-200">Customer will see</p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <p className="font-bold">{item.itemName}</p>
            {label.trim() && <span className="mt-1 inline-block rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold uppercase text-amber-950">{label.trim()}</span>}
          </div>
          <div className="text-right">
            <p className="font-mono text-sm text-purple-200 line-through">{npr(item.price)}</p>
            <p className="font-mono text-2xl font-extrabold">{bad ? '—' : npr(newPrice)}</p>
            {!bad && <p className="text-xs font-bold text-emerald-300">{pctOff}% OFF</p>}
          </div>
        </div>
        {profitLeft !== null && !bad && (
          <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${profitLeft <= 0 ? 'bg-rose-500/30 text-rose-100' : 'bg-white/10 text-purple-100'}`}>
            Profit per plate after discount: {npr(profitLeft)} {profitLeft <= 0 && '— you will lose money!'}
          </p>
        )}
      </div>

      {error && <p className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700"><AlertTriangle className="h-4 w-4" /> {error}</p>}
    </Shell>
  );
}

// ---------------------------------------------------------------------
// COMBO (slow item + best seller)
// ---------------------------------------------------------------------
export function ComboModal({
  item,
  partners,
  suggestedPartnerId,
  onClose,
  onSaved,
}: {
  item: OfferTarget;
  partners?: { id: string; itemName: string; price: number; qty?: number }[];
  suggestedPartnerId?: string | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [menu, setMenu] = useState<SimpleMenuItem[] | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>(suggestedPartnerId ? { [suggestedPartnerId]: 1 } : {});
  const [mainQty, setMainQty] = useState(1);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [price, setPrice] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadMenuBasic()
      .then((m) => setMenu(m.filter((x) => !x.isCombo && x.id !== item.id && x.status === 'Available')))
      .catch((e) => setError(e.message));
  }, [item.id]);

  const byId = useMemo(() => new Map((menu || []).map((m) => [m.id, m])), [menu]);
  const lines = (Object.entries(picked) as [string, number][]).filter(([id, q]) => q > 0 && byId.has(id));
  const worth = item.price * mainQty + lines.reduce((s, [id, q]) => s + (byId.get(id)!.price || 0) * q, 0);
  const suggested = Math.max(10, Math.round((worth * 0.9) / 10) * 10);

  // Auto name + price until the manager types their own
  useEffect(() => {
    if (!nameTouched) setName([item.itemName, ...lines.map(([id]) => byId.get(id)!.itemName)].join(' + ') + (lines.length ? ' Combo' : ''));
    if (!priceTouched) setPrice(lines.length ? String(suggested) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(lines), mainQty, menu]);

  const p = Number(price) || 0;
  const save$ = worth - p;
  const bad = !lines.length || !name.trim() || p <= 0 || p >= worth;

  const quick = useMemo(() => {
    const ids = new Set((partners || []).map((x) => x.id));
    return (menu || []).filter((m) => ids.has(m.id));
  }, [menu, partners]);
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (menu || []).filter((m) => !q || m.itemName.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)).slice(0, 60);
  }, [menu, search]);

  const toggle = (id: string) => setPicked((s) => ({ ...s, [id]: s[id] ? 0 : 1 }));

  const save = async () => {
    if (bad || saving) return;
    setSaving(true);
    setError('');
    try {
      const comboItems = [
        { menuItemId: item.id, itemName: item.itemName, quantity: mainQty, price: item.price },
        ...lines.map(([id, q]) => ({ menuItemId: id, itemName: byId.get(id)!.itemName, quantity: q, price: byId.get(id)!.price })),
      ];
      const res = await fetch(MENU_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName: name.trim(),
          description: `Combo: ${comboItems.map((c) => `${c.quantity}× ${c.itemName}`).join(' + ')}. Save ${npr(save$)}!`,
          category: 'Combo',
          price: p,
          status: 'Available',
          isCombo: true,
          comboItems,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'Could not create the combo.');
      onSaved(`Combo "${name.trim()}" added to the menu.`);
    } catch (e: any) {
      setError(e.message || 'Could not create the combo.');
    } finally {
      setSaving(false);
    }
  };

  const row = (m: SimpleMenuItem) => {
    const on = (picked[m.id] || 0) > 0;
    return (
      <div key={m.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${on ? 'border-purple-400 bg-purple-50' : 'border-slate-200'}`}>
        <button type="button" onClick={() => toggle(m.id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${on ? 'border-purple-600 bg-purple-600 text-white' : 'border-slate-300'}`}>{on && <CheckCircle2 className="h-3.5 w-3.5" />}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-800">{m.itemName}</span>
            <span className="block text-[11px] text-slate-500">{m.category} · {npr(m.price)}</span>
          </span>
        </button>
        {on && (
          <span className="flex items-center gap-1">
            <button type="button" onClick={() => setPicked((s) => ({ ...s, [m.id]: Math.max(1, (s[m.id] || 1) - 1) }))} className="h-7 w-7 cursor-pointer rounded-lg bg-white font-bold ring-1 ring-slate-200">−</button>
            <span className="w-5 text-center font-mono text-sm font-bold">{picked[m.id]}</span>
            <button type="button" onClick={() => setPicked((s) => ({ ...s, [m.id]: Math.min(10, (s[m.id] || 1) + 1) }))} className="h-7 w-7 cursor-pointer rounded-lg bg-white font-bold ring-1 ring-slate-200">+</button>
          </span>
        )}
      </div>
    );
  };

  return (
    <Shell
      title="Make a combo"
      sub={`Sell ${item.itemName} together with a popular item`}
      icon={<Layers className="h-5 w-5" />}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={onClose} className="cursor-pointer rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="button" onClick={save} disabled={bad || saving} className="flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add combo to menu
          </button>
        </div>
      }
    >
      <div className="flex items-center justify-between rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-fuchsia-700">Slow item</p>
          <p className="font-bold text-slate-900">{item.itemName}</p>
          <p className="text-xs text-slate-500">{npr(item.price)}</p>
        </div>
        <span className="flex items-center gap-1">
          <button type="button" onClick={() => setMainQty((q) => Math.max(1, q - 1))} className="h-8 w-8 cursor-pointer rounded-lg bg-white font-bold ring-1 ring-slate-200">−</button>
          <span className="w-6 text-center font-mono font-bold">{mainQty}</span>
          <button type="button" onClick={() => setMainQty((q) => Math.min(10, q + 1))} className="h-8 w-8 cursor-pointer rounded-lg bg-white font-bold ring-1 ring-slate-200">+</button>
        </span>
      </div>

      {menu === null ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-purple-600" /></div>
      ) : (
        <>
          {quick.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">⭐ Best sellers (last 3 days) — add one</p>
              <div className="grid gap-2 sm:grid-cols-2">{quick.map(row)}</div>
            </div>
          )}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Or any menu item</p>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menu…" className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-400" />
            <div className="max-h-48 space-y-2 overflow-y-auto pr-1">{list.map(row)}</div>
          </div>
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="combo-name" className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Combo name</label>
          <input id="combo-name" value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-purple-400" />
        </div>
        <div>
          <label htmlFor="combo-price" className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Combo price (NPR)</label>
          <input id="combo-price" inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value.replace(/[^0-9.]/g, '')); setPriceTouched(true); }} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-right font-mono text-sm font-bold outline-none focus:border-purple-400" />
        </div>
      </div>

      {lines.length > 0 && (
        <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3 text-sm">
          <span className="text-slate-600">Bought one by one: <b className="font-mono">{npr(worth)}</b></span>
          <span className={`font-bold ${save$ > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{save$ > 0 ? `Customer saves ${npr(save$)}` : 'Price must be lower'}</span>
        </div>
      )}
      {error && <p className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700"><AlertTriangle className="h-4 w-4" /> {error}</p>}
    </Shell>
  );
}

// ---------------------------------------------------------------------
// MENU PAGE: running offers + "New offer"
// ---------------------------------------------------------------------
interface OfferRow {
  id: string;
  itemName: string;
  category: string;
  price: number;
  offer: { kind: 'percent' | 'flat'; value: number; label: string; endsAt: string | null };
  running: boolean;
  offerPrice: number | null;
}

export function MenuOffersPanel({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<OfferRow[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState<SimpleMenuItem[]>([]);
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<OfferTarget | null>(null);
  const [comboFor, setComboFor] = useState<OfferTarget | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    try {
      const res = await fetch(OFFERS_URL);
      if (res.status === 403) return setHidden(true);
      const json = await res.json().catch(() => ({}));
      setRows(res.ok && json.success ? json.data : []);
    } catch {
      setRows([]);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const flash = (ok: boolean, text: string) => {
    setToast({ ok, text });
    window.setTimeout(() => setToast(null), 3500);
  };
  const done = (msg: string) => {
    setTarget(null);
    setComboFor(null);
    setPicking(false);
    flash(true, msg);
    load();
    onChanged?.();
  };
  const stop = async (id: string) => {
    const res = await fetch(`${OFFERS_URL}/${id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    flash(res.ok && json.success, json.message || 'Could not stop.');
    load();
    onChanged?.();
  };
  const openPicker = async () => {
    setPicking(true);
    try {
      setMenu((await loadMenuBasic()).filter((m) => m.status === 'Available'));
    } catch (e: any) {
      flash(false, e.message);
    }
  };

  if (hidden) return null;
  const shown = menu.filter((m) => !search.trim() || m.itemName.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="rounded-3xl border border-fuchsia-200/70 bg-gradient-to-br from-fuchsia-50/70 via-white to-purple-50/60 p-4 shadow-sm sm:p-5" id="menu-offers-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white shadow-md"><Percent className="h-5 w-5" /></span>
          <div>
            <h3 className="font-extrabold text-slate-900">Offers & discounts</h3>
            <p className="text-xs text-slate-500">Discount one item for a few days. The normal price comes back by itself.</p>
          </div>
        </div>
        <button type="button" onClick={openPicker} className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-4 py-2 text-sm font-bold text-white shadow hover:shadow-lg">
          <Plus className="h-4 w-4" /> New offer
        </button>
      </div>

      <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
        {rows === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-400">No offer is running. Tip: check “Slow-selling items” on the Dashboard.</p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="min-w-[220px] rounded-2xl border border-fuchsia-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-900">{r.itemName}</p>
                  {r.offer.label && <span className="mt-0.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold uppercase text-amber-800">{r.offer.label}</span>}
                </div>
                <span className="shrink-0 rounded-full bg-fuchsia-600 px-2 py-0.5 text-[10px] font-extrabold text-white">
                  {r.offer.kind === 'percent' ? `${r.offer.value}% OFF` : `NPR ${r.offer.value} OFF`}
                </span>
              </div>
              <p className="mt-2 font-mono text-sm">
                <span className="text-slate-400 line-through">{npr(r.price)}</span>{' '}
                <span className="font-extrabold text-fuchsia-700">{r.offerPrice != null ? npr(r.offerPrice) : '—'}</span>
              </p>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                <Clock className="h-3 w-3" /> {r.running ? 'Ends' : 'Starts'} {r.offer.endsAt ? new Date(r.offer.endsAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
              </p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => setTarget({ id: r.id, itemName: r.itemName, price: r.price })} className="cursor-pointer rounded-lg bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700 hover:bg-purple-100">Change</button>
                <button type="button" onClick={() => stop(r.id)} className="flex cursor-pointer items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100"><StopCircle className="h-3.5 w-3.5" /> Stop</button>
              </div>
            </div>
          ))
        )}
      </div>

      {picking && !target && !comboFor && (
        <Shell title="Choose an item" sub="Which item should get an offer?" icon={<Tag className="h-5 w-5" />} onClose={() => setPicking(false)} footer={<p className="text-center text-xs text-slate-500">Tap “Discount” or “Combo” on an item.</p>}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menu…" autoFocus className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-purple-400" />
          <div className="space-y-2">
            {shown.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{m.itemName}</p>
                  <p className="text-[11px] text-slate-500">{m.category} · {npr(m.price)}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button type="button" onClick={() => setTarget({ id: m.id, itemName: m.itemName, price: m.price })} className="cursor-pointer rounded-lg bg-purple-600 px-2.5 py-1.5 text-xs font-bold text-white">Discount</button>
                  {!m.isCombo && (
                    <button type="button" onClick={() => setComboFor({ id: m.id, itemName: m.itemName, price: m.price })} className="cursor-pointer rounded-lg bg-fuchsia-100 px-2.5 py-1.5 text-xs font-bold text-fuchsia-700">Combo</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Shell>
      )}
      {target && <OfferModal item={target} onClose={() => setTarget(null)} onSaved={done} />}
      {comboFor && <ComboModal item={comboFor} onClose={() => setComboFor(null)} onSaved={done} />}

      {toast && (
        <div role="status" className={`fixed right-4 top-4 z-[110] flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-white shadow-xl ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {toast.text}
        </div>
      )}
    </div>
  );
}