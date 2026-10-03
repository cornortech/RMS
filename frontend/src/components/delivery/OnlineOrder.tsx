import React, { useEffect, useMemo, useState } from 'react';
import {
  ShoppingBag, Search, Plus, Minus, X, MapPin, Phone, User, Banknote, Smartphone, Loader2, Check, ChevronLeft,
  Crosshair, Clock3, Bike, Gift, AlertCircle, PartyPopper, Trash2, StickyNote,
} from 'lucide-react';
import { API_BASE, money } from '../../delivery/shared';
import MapView from '../../delivery/MapView';
import PayQr from '../../delivery/PayQr';

// =====================================================================
// CUSTOMER ORDERING WEBSITE       address:  /order/<restaurantKey>
// No login. The restaurantKey in the link decides which restaurant's menu is shown.
// Prices are always re-checked by the server — the browser can't change them.
// =====================================================================
interface MenuItem {
  _id: string; itemName: string; description: string; category: string; price: number; available: boolean;
  isCombo: boolean; comboItems: { itemName: string; quantity: number }[]; imageUrl: string; addons: { name: string; price: number }[];
}
interface PublicSettings {
  acceptingOrders: boolean; acceptCOD: boolean; acceptOnline: boolean; onlinePaymentNote: string; baseCharge: number; minOrderAmount: number;
  freeDeliveryAbove: number; radiusKm: number; restaurantLat: number | null; restaurantLng: number | null; estimatedPrepMinutes: number;
  areas: { _id: string; name: string; charge: number; minOrder: number }[];
}
interface PageData { restaurant: { name: string; location: string; phone: string }; settings: PublicSettings; menu: MenuItem[] }
interface CartLine { key: string; menuItemId: string; name: string; price: number; imageUrl: string; quantity: number; addons: { name: string; price: number }[]; note: string }
interface Quote { ok: boolean; errors: string[]; subTotal?: number; deliveryCharge?: number; totalAmount?: number; freeDelivery?: boolean; needsLocation?: boolean }

const CATEGORY_EMOJI: Record<string, string> = { Appetizer: '🥗', 'Main Course': '🍛', Dessert: '🍰', Beverage: '🥤', Side: '🍟', Combo: '🍱', Other: '🍽️' };
const FALLBACK_EMOJI = ['🍜', '🍕', '🌮', '🥘', '🍗', '🥟', '🍔', '🥪'];
const emojiFor = (cat: string, id: string) => CATEGORY_EMOJI[cat] || FALLBACK_EMOJI[(id.charCodeAt(id.length - 1) || 0) % FALLBACK_EMOJI.length];
const GRADS = ['from-purple-100 to-fuchsia-100', 'from-amber-100 to-orange-100', 'from-sky-100 to-indigo-100', 'from-emerald-100 to-teal-100', 'from-rose-100 to-pink-100'];
const gradFor = (id: string) => GRADS[(id.charCodeAt(id.length - 1) || 0) % GRADS.length];

const lineKey = (id: string, addons: { name: string }[], note: string) => `${id}|${addons.map((a) => a.name).sort().join(',')}|${note.trim().toLowerCase()}`;
const unit = (l: { price: number; addons: { price: number }[] }) => l.price + l.addons.reduce((s, a) => s + a.price, 0);

const readKey = () => window.location.pathname.split('/').filter(Boolean)[1] || '';

export default function OnlineOrder() {
  const key = readKey();
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sheet, setSheet] = useState<MenuItem | null>(null);

  // cart is saved per restaurant (so two restaurants never mix carts)
  const cartKey = `rms_cart_${key}`;
  const [cart, setCart] = useState<CartLine[]>(() => { try { return JSON.parse(localStorage.getItem(cartKey) || '[]'); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem(cartKey, JSON.stringify(cart)); } catch { /* ignore */ } }, [cart, cartKey]);

  const [drawer, setDrawer] = useState(false);
  const [step, setStep] = useState<'cart' | 'details'>('cart');
  const [placed, setPlaced] = useState<{ orderNo: string; trackingToken: string; totalAmount: number; paymentMethod: string } | null>(null);
  const [lastToken, setLastToken] = useState(() => { try { return localStorage.getItem(`rms_last_${key}`) || ''; } catch { return ''; } });

  const saved = (() => { try { return JSON.parse(localStorage.getItem('rms_customer') || '{}'); } catch { return {}; } })();
  const [form, setForm] = useState({ name: saved.name || '', phone: saved.phone || '', address: saved.address || '', landmark: saved.landmark || '', orderNote: '', areaId: '', paymentMethod: '' as '' | 'COD' | 'Online', lat: null as number | null, lng: null as number | null });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [formError, setFormError] = useState('');
  const [locMsg, setLocMsg] = useState('');

  /* ---------- load menu ---------- */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/online/${key}/menu`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || 'This link is not valid.');
        setData(json.data);
        document.title = `${json.data.restaurant.name} · Order online`;
        // drop cart items that are no longer available
        setCart((c) => c.filter((l) => json.data.menu.some((m: MenuItem) => m._id === l.menuItemId && m.available)));
      } catch (e: any) { setError(e.message || 'Could not load the menu.'); } finally { setLoading(false); }
    })();
  }, [key]);

  const s = data?.settings;
  const open = !!s?.acceptingOrders;
  const categories = useMemo(() => (data ? ['All', ...Array.from(new Set(data.menu.map((m) => m.category)))] : []), [data]);
  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.menu.filter((m) => (category === 'All' || m.category === category) && (!q || m.itemName.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)));
  }, [data, search, category]);
  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    filtered.forEach((m) => map.set(m.category, [...(map.get(m.category) || []), m]));
    return Array.from(map.entries());
  }, [filtered]);

  const count = cart.reduce((n, l) => n + l.quantity, 0);
  const localSub = cart.reduce((n, l) => n + unit(l) * l.quantity, 0);
  const qtyOf = (id: string) => cart.filter((l) => l.menuItemId === id).reduce((n, l) => n + l.quantity, 0);

  /* ---------- cart actions ---------- */
  const addLine = (m: MenuItem, quantity: number, addons: { name: string; price: number }[], note: string) => {
    const k = lineKey(m._id, addons, note);
    setCart((c) => {
      const found = c.find((l) => l.key === k);
      if (found) return c.map((l) => (l.key === k ? { ...l, quantity: Math.min(50, l.quantity + quantity) } : l));
      return [...c, { key: k, menuItemId: m._id, name: m.itemName, price: m.price, imageUrl: m.imageUrl, quantity, addons, note: note.trim() }];
    });
  };
  const changeQty = (k: string, d: number) => setCart((c) => c.map((l) => (l.key === k ? { ...l, quantity: l.quantity + d } : l)).filter((l) => l.quantity > 0));

  /* ---------- live price from the server ---------- */
  const needsArea = (s?.areas.length || 0) > 0;
  useEffect(() => {
    if (!drawer || cart.length === 0 || !data) { setQuote(null); return; }
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/online/${key}/quote`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, addons: l.addons.map((a) => a.name), note: l.note })), areaId: form.areaId, lat: form.lat, lng: form.lng }),
        });
        const json = await res.json();
        setQuote(json.success ? json.data : { ok: false, errors: [json.message || 'Could not calculate total.'] });
      } catch { setQuote({ ok: false, errors: ['No internet connection.'] }); } finally { setQuoting(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [cart, form.areaId, form.lat, form.lng, drawer, data, key]);

  /* ---------- location pin ---------- */
  const useMyLocation = () => {
    setLocMsg('Finding you…');
    if (!navigator.geolocation) return setLocMsg('Your browser cannot share location.');
    navigator.geolocation.getCurrentPosition(
      (p) => { setForm((f) => ({ ...f, lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) })); setLocMsg('Location pinned ✓'); },
      () => setLocMsg('Could not get your location. Please allow location access.'),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  /* ---------- place order ---------- */
  const place = async () => {
    setFormError('');
    if (form.name.trim().length < 2) return setFormError('Please enter your name.');
    if (form.phone.replace(/\D/g, '').length < 7) return setFormError('Please enter a valid phone number.');
    if (form.address.trim().length < 5) return setFormError('Please enter your delivery address.');
    if (needsArea && !form.areaId) return setFormError('Please choose your delivery area.');
    if (!form.paymentMethod) return setFormError('Please choose how you want to pay.');
    if (!quote?.ok) return setFormError(quote?.errors?.[0] || 'Please check your order.');

    setPlacing(true);
    try {
      const res = await fetch(`${API_BASE}/api/online/${key}/orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, items: cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, addons: l.addons.map((a) => a.name), note: l.note })) }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Could not place your order.');
      try {
        localStorage.setItem('rms_customer', JSON.stringify({ name: form.name, phone: form.phone, address: form.address, landmark: form.landmark }));
        localStorage.setItem(`rms_last_${key}`, json.data.trackingToken);
      } catch { /* ignore */ }
      setLastToken(json.data.trackingToken);
      setPlaced(json.data);
      setCart([]); setDrawer(false); setStep('cart');
    } catch (e: any) { setFormError(e.message); } finally { setPlacing(false); }
  };

  /* ---------------------------- screens ---------------------------- */
  if (loading) return <Centered><Loader2 className="h-9 w-9 animate-spin text-purple-500" /><p className="mt-3 text-sm font-medium text-slate-500">Warming up the kitchen…</p></Centered>;
  if (error || !data || !s) return (
    <Centered>
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-500"><AlertCircle className="h-8 w-8" /></div>
      <h1 className="mt-4 font-display text-xl font-bold text-slate-900">Link not working</h1>
      <p className="mt-1 max-w-xs text-center text-sm text-slate-500">{error || 'Please check the link you were given.'}</p>
    </Centered>
  );

  if (placed) return <Confirmation data={data} placed={placed} onMore={() => setPlaced(null)} />;

  return (
    <div className="min-h-screen bg-white font-sans text-slate-800 antialiased">
      <Styles />
      {/* ---------- hero ---------- */}
      <header className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-violet-600 to-indigo-700 px-5 pb-16 pt-8 text-white">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-fuchsia-400/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-amber-300/25 blur-3xl" />
        <div className="relative mx-auto max-w-5xl">
          <div className="flex items-center gap-2 text-xs font-bold">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${open ? 'bg-emerald-400/25 text-emerald-100' : 'bg-rose-400/30 text-rose-100'}`}>
              <span className={`h-2 w-2 rounded-full ${open ? 'bg-emerald-300 animate-pulse' : 'bg-rose-300'}`} /> {open ? 'Taking orders' : 'Orders paused'}
            </span>
          </div>
          <h1 className="mt-3 font-display text-4xl font-bold leading-tight sm:text-5xl">{data.restaurant.name}</h1>
          {data.restaurant.location && <p className="mt-1 flex items-center gap-1.5 text-sm text-purple-100"><MapPin className="h-4 w-4" /> {data.restaurant.location}</p>}
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
            <Chip icon={Clock3}>~{(s.estimatedPrepMinutes || 30) + 15} min</Chip>
            <Chip icon={Bike}>{s.areas.length ? `from ${money(Math.min(...s.areas.map((a) => a.charge)))}` : s.baseCharge ? money(s.baseCharge) : 'Free'} delivery</Chip>
            {s.freeDeliveryAbove > 0 && <Chip icon={Gift}>Free above {money(s.freeDeliveryAbove)}</Chip>}
            {s.minOrderAmount > 0 && <Chip icon={ShoppingBag}>Min {money(s.minOrderAmount)}</Chip>}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto -mt-9 max-w-5xl px-4 pb-32">
        {lastToken && (
          <a href={`/track/${lastToken}`} className="mb-4 flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-lg shadow-purple-500/10 ring-1 ring-purple-200 transition hover:-translate-y-0.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-600"><Bike className="h-5 w-5" /></span>
            <span className="flex-1 text-sm font-bold text-slate-800">Track your last order</span>
            <span className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white">Open</span>
          </a>
        )}

        {!open && <div className="mb-4 rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">We are not taking online orders right now. You can still look at the menu.</div>}

        {/* search + categories */}
        <div className="sticky top-0 z-20 -mx-4 bg-white/90 px-4 pb-3 pt-3 backdrop-blur-xl">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search momo, burger, tea…" className="w-full rounded-2xl border border-purple-100 bg-purple-50/50 py-3 pl-11 pr-4 text-sm outline-none focus:border-purple-400 focus:bg-white focus:ring-4 focus:ring-purple-500/15" />
          </div>
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
            {categories.map((c) => (
              <button key={c} onClick={() => setCategory(c)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition ${category === c ? 'bg-purple-600 text-white shadow-md shadow-purple-500/30' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-purple-300'}`}>
                <span>{c === 'All' ? '✨' : CATEGORY_EMOJI[c] || '🍽️'}</span> {c}
              </button>
            ))}
          </div>
        </div>

        {grouped.length === 0 ? (
          <p className="py-20 text-center text-slate-500">No dishes found.</p>
        ) : grouped.map(([cat, items]) => (
          <section key={cat} className="mt-6">
            <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-bold text-slate-900"><span>{CATEGORY_EMOJI[cat] || '🍽️'}</span> {cat} <span className="text-sm font-semibold text-slate-400">{items.length}</span></h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {items.map((m) => {
                const inCart = qtyOf(m._id);
                return (
                  <article key={m._id} className={`group flex overflow-hidden rounded-3xl bg-white ring-1 transition hover:shadow-xl hover:shadow-purple-500/10 ${m.available ? 'ring-purple-100' : 'opacity-60 ring-slate-200'}`}>
                    <button onClick={() => m.available && setSheet(m)} className="relative w-32 shrink-0 sm:w-36" aria-label={`Customise ${m.itemName}`}>
                      <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br text-5xl ${gradFor(m._id)}`}>{emojiFor(m.category, m._id)}</div>
                      {m.imageUrl && <img src={m.imageUrl} alt={m.itemName} loading="lazy" className="absolute inset-0 h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
                      {!m.available && <span className="absolute inset-x-0 bottom-0 bg-slate-900/80 py-1 text-center text-[11px] font-bold text-white">Sold out</span>}
                    </button>
                    <div className="flex min-w-0 flex-1 flex-col p-3.5">
                      <h3 className="font-display text-base font-bold leading-snug text-slate-900">{m.itemName}</h3>
                      {m.isCombo && m.comboItems.length > 0 && <p className="text-[11px] font-semibold text-amber-600">{m.comboItems.map((c) => `${c.quantity}× ${c.itemName}`).join(' + ')}</p>}
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{m.description !== 'No description provided' ? m.description : ''}</p>
                      <div className="mt-auto flex items-center justify-between pt-3">
                        <span className="font-display text-lg font-bold text-purple-700">{money(m.price)}</span>
                        {m.available && open ? (
                          inCart > 0 && m.addons.length === 0 ? (
                            <div className="inline-flex items-center gap-1 rounded-xl bg-purple-600 p-1 text-white">
                              <button onClick={() => { const l = cart.find((x) => x.menuItemId === m._id); if (l) changeQty(l.key, -1); }} className="rounded-lg p-1.5 hover:bg-white/20" aria-label="Less"><Minus className="h-4 w-4" /></button>
                              <span className="min-w-5 text-center text-sm font-bold">{inCart}</span>
                              <button onClick={() => addLine(m, 1, [], '')} className="rounded-lg p-1.5 hover:bg-white/20" aria-label="More"><Plus className="h-4 w-4" /></button>
                            </div>
                          ) : (
                            <button onClick={() => (m.addons.length > 0 ? setSheet(m) : addLine(m, 1, [], ''))} className="inline-flex items-center gap-1 rounded-xl bg-purple-50 px-3.5 py-2 text-sm font-bold text-purple-700 ring-1 ring-purple-200 transition hover:bg-purple-600 hover:text-white">
                              <Plus className="h-4 w-4" /> Add{inCart > 0 && <span className="ml-1 rounded-full bg-purple-600 px-1.5 text-[10px] text-white">{inCart}</span>}
                            </button>
                          )
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
        <p className="mt-12 text-center text-[11px] font-semibold text-slate-400">Powered by Atithi RMS</p>
      </main>

      {/* floating cart bar */}
      {count > 0 && !drawer && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-4 anim-pop">
          <button onClick={() => { setStep('cart'); setDrawer(true); }} className="mx-auto flex w-full max-w-xl items-center justify-between rounded-2xl bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 px-5 py-4 text-white shadow-2xl shadow-purple-500/40 transition active:scale-[0.98]">
            <span className="flex items-center gap-3"><span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/20"><ShoppingBag className="h-5 w-5" /><span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-black text-slate-900">{count}</span></span><span className="font-bold">View cart</span></span>
            <span className="font-display text-lg font-bold">{money(localSub)}</span>
          </button>
        </div>
      )}

      {sheet && <ItemSheet item={sheet} open={open} onClose={() => setSheet(null)} onAdd={(q, a, n) => { addLine(sheet, q, a, n); setSheet(null); }} />}

      {drawer && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/50 backdrop-blur-sm anim-fade-in" onClick={(e) => e.target === e.currentTarget && setDrawer(false)}>
          <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl anim-slide-right">
            <div className="flex items-center gap-3 border-b border-purple-100 px-5 py-4">
              {step === 'details' && <button onClick={() => setStep('cart')} className="rounded-lg p-1.5 text-slate-500 hover:bg-purple-50" aria-label="Back"><ChevronLeft className="h-5 w-5" /></button>}
              <div className="flex-1"><h2 className="font-display text-xl font-bold text-slate-900">{step === 'cart' ? 'Your cart' : 'Delivery details'}</h2><p className="text-xs text-slate-500">Step {step === 'cart' ? 1 : 2} of 2</p></div>
              <button onClick={() => setDrawer(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5 thin-scroll">
              {cart.length === 0 ? <p className="py-16 text-center text-slate-500">Your cart is empty.</p> : step === 'cart' ? (
                <>
                  {cart.map((l) => (
                    <div key={l.key} className="flex gap-3 rounded-2xl p-3 ring-1 ring-purple-100">
                      <div className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br text-3xl ${gradFor(l.menuItemId)}`}>{l.imageUrl ? <img src={l.imageUrl} alt="" className="h-full w-full object-cover" /> : '🍽️'}</div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900">{l.name}</p>
                        {l.addons.length > 0 && <p className="text-xs font-semibold text-purple-600">+ {l.addons.map((a) => a.name).join(', ')}</p>}
                        {l.note && <p className="flex items-center gap-1 text-xs text-amber-700"><StickyNote className="h-3 w-3" /> {l.note}</p>}
                        <div className="mt-2 flex items-center justify-between">
                          <div className="inline-flex items-center gap-1 rounded-lg bg-purple-50 p-0.5">
                            <button onClick={() => changeQty(l.key, -1)} className="rounded-md p-1.5 text-purple-700 hover:bg-white" aria-label="Less">{l.quantity === 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}</button>
                            <span className="min-w-6 text-center text-sm font-bold">{l.quantity}</span>
                            <button onClick={() => changeQty(l.key, 1)} className="rounded-md p-1.5 text-purple-700 hover:bg-white" aria-label="More"><Plus className="h-3.5 w-3.5" /></button>
                          </div>
                          <span className="font-bold text-slate-900">{money(unit(l) * l.quantity)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="space-y-4">
                  <Input icon={User} label="Your name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Full name" autoComplete="name" />
                  <Input icon={Phone} label="Phone number *" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="98XXXXXXXX" inputMode="tel" autoComplete="tel" />
                  {needsArea && (
                    <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">Delivery area *</span>
                      <select value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value })} className="field">
                        <option value="">Choose your area…</option>
                        {s.areas.map((a) => <option key={a._id} value={a._id}>{a.name} — {a.charge ? money(a.charge) : 'Free'} delivery</option>)}
                      </select></label>
                  )}
                  <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">Full delivery address *</span>
                    <textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="House no., street, ward…" className="field" autoComplete="street-address" /></label>
                  <Input icon={MapPin} label="Nearby landmark (optional)" value={form.landmark} onChange={(v) => setForm({ ...form, landmark: v })} placeholder="Near the blue temple" />

                  <div className="rounded-2xl bg-purple-50/70 p-3 ring-1 ring-purple-100">
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={useMyLocation} className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-bold text-purple-700 ring-1 ring-purple-200 hover:bg-purple-50"><Crosshair className="h-4 w-4" /> Pin my location</button>
                      <span className={`text-xs font-semibold ${form.lat ? 'text-emerald-600' : 'text-slate-500'}`}>{locMsg || (s.radiusKm > 0 ? 'Required: we deliver within ' + s.radiusKm + ' km' : 'Helps the rider find you')}</span>
                    </div>
                    {form.lat != null && <div className="mt-3"><MapView customer={{ lat: form.lat, lng: form.lng }} height={150} /></div>}
                  </div>

                  <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">Note for the restaurant (optional)</span>
                    <textarea rows={2} maxLength={300} value={form.orderNote} onChange={(e) => setForm({ ...form, orderNote: e.target.value })} placeholder="Ring the bell twice, less spicy…" className="field" /></label>

                  <div>
                    <p className="mb-2 text-xs font-bold text-slate-600">Payment method *</p>
                    <div className="grid grid-cols-2 gap-3">
                      {s.acceptCOD && <PayOption active={form.paymentMethod === 'COD'} onClick={() => setForm({ ...form, paymentMethod: 'COD' })} icon={Banknote} title="Cash on delivery" sub="Pay the rider" />}
                      {s.acceptOnline && <PayOption active={form.paymentMethod === 'Online'} onClick={() => setForm({ ...form, paymentMethod: 'Online' })} icon={Smartphone} title="Online payment" sub="QR / wallet" />}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="space-y-3 border-t border-purple-100 bg-white p-5">
                <div className="space-y-1 text-sm">
                  <Row label="Items" value={money(quote?.ok ? quote.subTotal : localSub)} />
                  {step === 'details' && <Row label="Delivery" value={quote?.ok ? (quote.deliveryCharge ? money(quote.deliveryCharge) : 'Free 🎉') : '—'} />}
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 font-display text-xl font-bold text-slate-900">
                    <span>Total</span><span className="text-purple-700">{quoting ? <Loader2 className="inline h-5 w-5 animate-spin" /> : money(step === 'cart' ? localSub : quote?.ok ? quote.totalAmount : localSub)}</span>
                  </div>
                </div>
                {s.freeDeliveryAbove > 0 && step === 'cart' && localSub < s.freeDeliveryAbove && <p className="rounded-xl bg-amber-50 p-2.5 text-center text-xs font-semibold text-amber-800">Add {money(s.freeDeliveryAbove - localSub)} more for free delivery 🎁</p>}
                {(quote && !quote.ok && (step === 'details' || quote.errors[0]?.startsWith('Minimum'))) && <p className="flex items-start gap-2 rounded-xl bg-rose-50 p-2.5 text-xs font-semibold text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {quote.errors[0]}</p>}
                {formError && <p className="flex items-start gap-2 rounded-xl bg-rose-50 p-2.5 text-xs font-semibold text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {formError}</p>}
                {step === 'cart' ? (
                  <button disabled={!open} onClick={() => setStep('details')} className="w-full rounded-2xl bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 py-4 text-base font-bold text-white shadow-lg shadow-purple-500/30 disabled:opacity-50">{open ? 'Continue to checkout' : 'Orders are paused'}</button>
                ) : (
                  <button disabled={placing || !open} onClick={place} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 py-4 text-base font-bold text-white shadow-lg shadow-emerald-500/30 disabled:opacity-60">
                    {placing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Place order{quote?.ok ? ` · ${money(quote.totalAmount)}` : ''}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------- item sheet ---------------------------- */
function ItemSheet({ item, open, onClose, onAdd }: { item: MenuItem; open: boolean; onClose: () => void; onAdd: (q: number, addons: { name: string; price: number }[], note: string) => void }) {
  const [qty, setQty] = useState(1);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const addons = item.addons.filter((a) => picked.includes(a.name));
  const total = (item.price + addons.reduce((s, a) => s + a.price, 0)) * qty;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm anim-fade-in sm:items-center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl anim-pop sm:rounded-3xl">
        <div className={`relative h-44 shrink-0 bg-gradient-to-br ${gradFor(item._id)} flex items-center justify-center text-7xl`}>
          {emojiFor(item.category, item._id)}
          {item.imageUrl && <img src={item.imageUrl} alt={item.itemName} className="absolute inset-0 h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
          <button onClick={onClose} className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-slate-700 shadow hover:bg-white" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5 thin-scroll">
          <div>
            <div className="flex items-start justify-between gap-3"><h2 className="font-display text-2xl font-bold text-slate-900">{item.itemName}</h2><span className="font-display text-xl font-bold text-purple-700">{money(item.price)}</span></div>
            {item.description !== 'No description provided' && <p className="mt-1 text-sm text-slate-500">{item.description}</p>}
          </div>
          {item.addons.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-bold text-slate-800">Make it yours <span className="font-medium text-slate-400">· optional</span></p>
              <div className="space-y-2">
                {item.addons.map((a) => {
                  const on = picked.includes(a.name);
                  return (
                    <button key={a.name} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== a.name) : [...p, a.name]))} className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left ring-1 transition ${on ? 'bg-purple-50 ring-purple-400' : 'bg-white ring-slate-200 hover:ring-purple-300'}`}>
                      <span className="flex items-center gap-3"><span className={`flex h-5 w-5 items-center justify-center rounded-md ${on ? 'bg-purple-600 text-white' : 'bg-slate-100'}`}>{on && <Check className="h-3.5 w-3.5" />}</span><span className="text-sm font-semibold text-slate-800">{a.name}</span></span>
                      <span className="text-sm font-bold text-slate-600">{a.price ? `+ ${money(a.price)}` : 'Free'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <label className="block"><span className="mb-1 block text-sm font-bold text-slate-800">Special instructions <span className="font-medium text-slate-400">· optional</span></span>
            <textarea rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. no onions, extra spicy" className="field" /></label>
        </div>
        <div className="flex items-center gap-3 border-t border-purple-100 p-4">
          <div className="inline-flex items-center gap-1 rounded-2xl bg-purple-50 p-1">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="rounded-xl p-2.5 text-purple-700 hover:bg-white" aria-label="Less"><Minus className="h-4 w-4" /></button>
            <span className="min-w-7 text-center font-bold">{qty}</span>
            <button onClick={() => setQty((q) => Math.min(50, q + 1))} className="rounded-xl p-2.5 text-purple-700 hover:bg-white" aria-label="More"><Plus className="h-4 w-4" /></button>
          </div>
          <button disabled={!open} onClick={() => onAdd(qty, addons, note)} className="flex flex-1 items-center justify-between rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-3.5 font-bold text-white shadow-lg shadow-purple-500/30 disabled:opacity-50">
            <span>Add to cart</span><span>{money(total)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- confirmation ---------------------------- */
function Confirmation({ data, placed, onMore }: { data: PageData; placed: { orderNo: string; trackingToken: string; totalAmount: number; paymentMethod: string }; onMore: () => void }) {
  const online = placed.paymentMethod === 'Online';
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 via-white to-white px-4 py-10 font-sans">
      <Styles />
      <div className="mx-auto max-w-md text-center">
        <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-emerald-400/30 anim-pulse-ring" />
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-xl shadow-emerald-500/40 anim-pop"><PartyPopper className="h-11 w-11" /></span>
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold text-slate-900">Order placed!</h1>
        <p className="mt-1 text-slate-500">{data.restaurant.name} has received your order.</p>

        <div className="mt-6 overflow-hidden rounded-3xl bg-white text-left shadow-xl shadow-purple-500/10 ring-1 ring-purple-100">
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-5 text-white">
            <p className="text-xs font-bold uppercase tracking-wider text-purple-200">Order number</p>
            <p className="font-display text-3xl font-bold">{placed.orderNo}</p>
          </div>
          <dl className="divide-y divide-slate-100 text-sm">
            <div className="flex justify-between p-4"><dt className="text-slate-500">Total</dt><dd className="font-bold text-slate-900">{money(placed.totalAmount)}</dd></div>
            <div className="flex justify-between p-4"><dt className="text-slate-500">Payment</dt><dd className="font-bold text-slate-900">{online ? 'Online payment' : 'Cash on delivery'}</dd></div>
            <div className="flex justify-between p-4"><dt className="text-slate-500">Estimated time</dt><dd className="font-bold text-slate-900">~{(data.settings.estimatedPrepMinutes || 30) + 15} min</dd></div>
          </dl>
        </div>

        {online && <div className="mt-4 text-left"><PayQr token={placed.trackingToken} note={data.settings.onlinePaymentNote} /></div>}

        <a href={`/track/${placed.trackingToken}`} className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 py-4 font-bold text-white shadow-lg shadow-purple-500/30"><Bike className="h-5 w-5" /> Track my order</a>
        <button onClick={onMore} className="mt-3 w-full rounded-2xl bg-white py-3.5 font-bold text-purple-700 ring-1 ring-purple-200 hover:bg-purple-50">Order something else</button>
        {data.restaurant.phone && <p className="mt-6 text-xs text-slate-500">Need help? Call <a className="font-bold text-purple-700" href={`tel:${data.restaurant.phone}`}>{data.restaurant.phone}</a></p>}
      </div>
    </div>
  );
}

/* ---------------------------- tiny parts ---------------------------- */
const Centered = ({ children }: { children: React.ReactNode }) => <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6 font-sans">{children}</div>;
const Chip = ({ icon: I, children }: { icon: React.ElementType; children: React.ReactNode }) => <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur"><I className="h-3.5 w-3.5" /> {children}</span>;
const Row = ({ label, value }: { label: string; value: React.ReactNode }) => <div className="flex justify-between"><span className="text-slate-500">{label}</span><span className="font-semibold text-slate-800">{value}</span></div>;

function Input({ icon: Icon, label, value, onChange, placeholder, inputMode, autoComplete }: { icon: React.ElementType; label: string; value: string; onChange: (v: string) => void; placeholder?: string; inputMode?: 'tel' | 'text'; autoComplete?: string }) {
  return (
    <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{label}</span>
      <div className="relative"><Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} autoComplete={autoComplete} className="field !pl-10" /></div></label>
  );
}

function PayOption({ active, onClick, icon: Icon, title, sub }: { active: boolean; onClick: () => void; icon: React.ElementType; title: string; sub: string }) {
  return (
    <button type="button" onClick={onClick} className={`relative rounded-2xl p-4 text-left ring-2 transition ${active ? 'bg-purple-50 ring-purple-500' : 'bg-white ring-slate-200 hover:ring-purple-300'}`}>
      {active && <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-white"><Check className="h-3 w-3" /></span>}
      <Icon className={`h-6 w-6 ${active ? 'text-purple-600' : 'text-slate-400'}`} />
      <p className="mt-2 text-sm font-bold text-slate-900">{title}</p><p className="text-xs text-slate-500">{sub}</p>
    </button>
  );
}

// Styles used only on the customer pages (the staff app injects its own in App.tsx)
export function Styles() {
  return (
    <style>{`
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      @keyframes popIn{from{opacity:0;transform:scale(.96) translateY(10px)}to{opacity:1;transform:none}}
      @keyframes slideRight{from{transform:translateX(100%)}to{transform:none}}
      @keyframes pulseRing{0%{transform:scale(.9);opacity:.55}100%{transform:scale(1.7);opacity:0}}
      @keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
      .anim-fade-in{animation:fadeIn .25s ease-out both}.anim-pop{animation:popIn .32s cubic-bezier(.22,1,.36,1) both}
      .anim-slide-right{animation:slideRight .3s cubic-bezier(.22,1,.36,1) both}.anim-pulse-ring{animation:pulseRing 1.8s ease-out infinite}.anim-floaty{animation:floaty 3s ease-in-out infinite}
      .thin-scroll::-webkit-scrollbar{width:6px;height:6px}.thin-scroll::-webkit-scrollbar-thumb{background:#e9d5ff;border-radius:999px}
      .no-scrollbar{scrollbar-width:none}.no-scrollbar::-webkit-scrollbar{display:none}
      .field{width:100%;border:1px solid #e9d5ff;border-radius:.9rem;padding:.7rem .9rem;font-size:.9rem;outline:none;background:#fff}.field:focus{border-color:#a855f7;box-shadow:0 0 0 4px rgba(168,85,247,.15)}
      @media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}
    `}</style>
  );
}