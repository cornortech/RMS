import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ShoppingBag, Search, Plus, Minus, X, MapPin, Phone, User, Banknote, Smartphone, Loader2, Check, ChevronLeft, ChevronRight,
  Crosshair, Clock3, Bike, Gift, AlertCircle, PartyPopper, Trash2, StickyNote, Sparkles, Flame, Wallet,
} from 'lucide-react';
import { API_BASE, money } from '../../delivery/shared';
import MapView from '../../delivery/MapView';
import PayQr, { walletStyle } from '../../delivery/PayQr';
import { menuThumb } from '../MenuImage';

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
interface PageData { restaurant: { name: string; location: string; phone: string }; settings: PublicSettings; payProviders: string[]; menu: MenuItem[] }
interface CartLine { key: string; menuItemId: string; name: string; price: number; imageUrl: string; quantity: number; addons: { name: string; price: number }[]; note: string }
interface Quote { ok: boolean; errors: string[]; subTotal?: number; deliveryCharge?: number; totalAmount?: number; freeDelivery?: boolean; needsLocation?: boolean }

const CATEGORY_EMOJI: Record<string, string> = { Appetizer: '🥗', 'Main Course': '🍛', Dessert: '🍰', Beverage: '🥤', Side: '🍟', Combo: '🍱', Other: '🍽️' };
const FALLBACK_EMOJI = ['🍜', '🍕', '🌮', '🥘', '🍗', '🥟', '🍔', '🥪'];
const emojiFor = (cat: string, id: string) => CATEGORY_EMOJI[cat] || FALLBACK_EMOJI[(id.charCodeAt(id.length - 1) || 0) % FALLBACK_EMOJI.length];
const GRADS = ['from-orange-100 to-amber-50', 'from-rose-100 to-orange-50', 'from-amber-100 to-yellow-50', 'from-lime-100 to-emerald-50', 'from-fuchsia-100 to-rose-50'];
const gradFor = (id: string) => GRADS[(id.charCodeAt(id.length - 1) || 0) % GRADS.length];
const slug = (s: string) => 'cat-' + s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const cleanDesc = (d: string) => (d && d !== 'No description provided' ? d : '');
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '🍽️';

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
  const [placed, setPlaced] = useState<{ orderNo: string; trackingToken: string; totalAmount: number; paymentMethod: string; paymentProvider?: string } | null>(null);
  const [lastToken, setLastToken] = useState(() => { try { return localStorage.getItem(`rms_last_${key}`) || ''; } catch { return ''; } });

  const saved = (() => { try { return JSON.parse(localStorage.getItem('rms_customer') || '{}'); } catch { return {}; } })();
  const [form, setForm] = useState({ name: saved.name || '', phone: saved.phone || '', address: saved.address || '', landmark: saved.landmark || '', orderNote: '', areaId: '', paymentMethod: '' as '' | 'COD' | 'Online', paymentProvider: '', lat: null as number | null, lng: null as number | null });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [formError, setFormError] = useState('');
  const [locMsg, setLocMsg] = useState('');
  const [bump, setBump] = useState(0); // makes the cart bar "pop" when something is added

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
    return data.menu.filter((m) => !q || m.itemName.toLowerCase().includes(q) || m.description.toLowerCase().includes(q) || m.category.toLowerCase().includes(q));
  }, [data, search]);
  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    filtered.forEach((m) => map.set(m.category, [...(map.get(m.category) || []), m]));
    return Array.from(map.entries());
  }, [filtered]);
  // "Top picks" row: available dishes that have a photo
  const picks = useMemo(() => (data ? data.menu.filter((m) => m.available && m.imageUrl).slice(0, 10) : []), [data]);

  /* ---------- category bar: tap = scroll to that section, scrolling = highlight ---------- */
  const menuTop = useRef<HTMLDivElement>(null);
  const goTo = (c: string) => {
    setCategory(c);
    const el = c === 'All' ? menuTop.current : document.getElementById(slug(c));
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  useEffect(() => {
    if (!grouped.length) return;
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setCategory(e.target.getAttribute('data-cat') || 'All')),
      { rootMargin: '-40% 0px -55% 0px' }
    );
    grouped.forEach(([c]) => { const el = document.getElementById(slug(c)); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [grouped]);
  useEffect(() => { document.getElementById(`chip-${slug(category)}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); }, [category]);

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
    setBump((b) => b + 1);
  };
  const changeQty = (k: string, d: number) => setCart((c) => c.map((l) => (l.key === k ? { ...l, quantity: l.quantity + d } : l)).filter((l) => l.quantity > 0));
  const minusOne = (id: string) => { const l = [...cart].reverse().find((x) => x.menuItemId === id); if (l) changeQty(l.key, -1); };

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
    if (form.paymentMethod === 'Online' && (data?.payProviders.length || 0) > 0 && !form.paymentProvider) return setFormError(`Please choose ${data?.payProviders.join(', ')} to pay with.`);
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
  if (loading) return <LoadingSkeleton />;
  if (error || !data || !s) return (
    <Centered>
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-500"><AlertCircle className="h-8 w-8" /></div>
      <h1 className="oo-display mt-4 text-2xl font-extrabold text-stone-900">Link not working</h1>
      <p className="mt-1 max-w-xs text-center text-sm text-stone-500">{error || 'Please check the link you were given.'}</p>
    </Centered>
  );

  if (placed) return <Confirmation data={data} placed={placed} onMore={() => setPlaced(null)} />;

  const deliveryText = s.areas.length ? `from ${money(Math.min(...s.areas.map((a) => a.charge)))}` : s.baseCharge ? money(s.baseCharge) : 'Free';
  const freeLeft = s.freeDeliveryAbove > 0 ? Math.max(0, s.freeDeliveryAbove - localSub) : 0;
  const freePct = s.freeDeliveryAbove > 0 ? Math.min(100, (localSub / s.freeDeliveryAbove) * 100) : 0;

  return (
    <div className="oo min-h-screen bg-[#FFF8F1] text-stone-800 antialiased">
      <Styles />

      {/* ---------- hero ---------- */}
      <header className="relative overflow-hidden bg-[#1c0f1f] px-5 pb-20 pt-6 text-white">
        <div className="oo-dots pointer-events-none absolute inset-0 opacity-[0.07]" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-orange-500/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-fuchsia-600/30 blur-3xl" />

        <div className="relative mx-auto max-w-5xl">
          <div className="flex items-center justify-between">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ${open ? 'bg-emerald-400/15 text-emerald-200 ring-emerald-300/30' : 'bg-rose-400/15 text-rose-200 ring-rose-300/30'}`}>
              <span className={`h-2 w-2 rounded-full ${open ? 'bg-emerald-300 oo-blink' : 'bg-rose-300'}`} /> {open ? 'Open · taking orders' : 'Orders paused'}
            </span>
            {data.restaurant.phone && (
              <a href={`tel:${data.restaurant.phone}`} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-white/20">
                <Phone className="h-3.5 w-3.5" /> Call
              </a>
            )}
          </div>

          <div className="mt-6 flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 via-rose-500 to-fuchsia-600 text-2xl font-black shadow-xl shadow-orange-500/30 ring-4 ring-white/10 sm:h-20 sm:w-20 sm:text-3xl">
              {initials(data.restaurant.name)}
            </div>
            <div className="min-w-0">
              <h1 className="oo-display truncate text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">{data.restaurant.name}</h1>
              {data.restaurant.location && <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-white/70"><MapPin className="h-4 w-4 shrink-0 text-orange-300" /> {data.restaurant.location}</p>}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2 sm:max-w-xl">
            <Stat icon={Clock3} label="Delivery in" value={`${(s.estimatedPrepMinutes || 30) + 15} min`} />
            <Stat icon={Bike} label="Delivery" value={deliveryText} />
            {s.freeDeliveryAbove > 0
              ? <Stat icon={Gift} label="Free above" value={money(s.freeDeliveryAbove)} />
              : <Stat icon={ShoppingBag} label="Min. order" value={s.minOrderAmount > 0 ? money(s.minOrderAmount) : 'None'} />}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto -mt-10 max-w-5xl px-4 pb-36">
        {lastToken && (
          <a href={`/track/${lastToken}`} className="mb-3 flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-lg shadow-stone-900/5 ring-1 ring-stone-200/70 transition hover:-translate-y-0.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100 text-orange-600"><Bike className="h-5 w-5" /></span>
            <span className="flex-1"><span className="block text-sm font-bold text-stone-900">Track your last order</span><span className="block text-xs text-stone-500">See where your food is right now</span></span>
            <ChevronRight className="h-5 w-5 text-stone-400" />
          </a>
        )}

        {!open && (
          <div className="mb-3 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
            <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /> We are not taking online orders right now. You can still look at the menu.
          </div>
        )}

        {/* search */}
        <div className="relative rounded-2xl bg-white shadow-lg shadow-stone-900/5 ring-1 ring-stone-200/70">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search for momo, burger, tea…" className="w-full rounded-2xl bg-transparent py-4 pl-12 pr-10 text-[15px] outline-none placeholder:text-stone-400 focus:ring-4 focus:ring-orange-500/15" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-stone-400 hover:bg-stone-100" aria-label="Clear search"><X className="h-4 w-4" /></button>}
        </div>

        {/* top picks */}
        {!search && picks.length >= 2 && (
          <section className="mt-7">
            <h2 className="oo-display mb-3 flex items-center gap-2 text-xl font-extrabold text-stone-900"><Flame className="h-5 w-5 text-orange-500" /> Top picks for you</h2>
            <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
              {picks.map((m) => {
                const inCart = qtyOf(m._id);
                return (
                  <article key={m._id} className="w-44 shrink-0 snap-start overflow-hidden rounded-3xl bg-white shadow-md shadow-stone-900/5 ring-1 ring-stone-200/70 sm:w-52">
                    <button onClick={() => setSheet(m)} className="relative block h-32 w-full sm:h-36" aria-label={`See ${m.itemName}`}>
                      <Photo item={m} size={400} emojiClass="text-5xl" />
                      <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />
                      <span className="absolute bottom-2 left-3 rounded-full bg-white/95 px-2.5 py-0.5 text-xs font-extrabold text-stone-900 shadow">{money(m.price)}</span>
                    </button>
                    <div className="flex items-center gap-2 p-3">
                      <p className="line-clamp-2 flex-1 text-sm font-bold leading-snug text-stone-900">{m.itemName}</p>
                      {open && (
                        <button onClick={() => (m.addons.length > 0 ? setSheet(m) : addLine(m, 1, [], ''))} className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white shadow-md shadow-orange-500/30 transition active:scale-90" aria-label={`Add ${m.itemName}`}>
                          <Plus className="h-5 w-5" />
                          {inCart > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-stone-900 px-1 text-[10px] font-black">{inCart}</span>}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* sticky category bar */}
        <div ref={menuTop} className="oo-scroll-mt" />
        <div className="sticky top-0 z-20 -mx-4 mt-6 border-b border-stone-200/70 bg-[#FFF8F1]/90 px-4 py-3 backdrop-blur-xl">
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {categories.map((c) => (
              <button key={c} id={`chip-${slug(c)}`} onClick={() => goTo(c)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition ${category === c ? 'bg-stone-900 text-white shadow-md' : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:ring-stone-400'}`}>
                <span>{c === 'All' ? '✨' : CATEGORY_EMOJI[c] || '🍽️'}</span> {c}
              </button>
            ))}
          </div>
        </div>

        {/* menu */}
        {grouped.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-5xl">🔍</p>
            <p className="oo-display mt-3 text-lg font-bold text-stone-800">No dishes found</p>
            <p className="text-sm text-stone-500">Try another word, like “momo” or “tea”.</p>
          </div>
        ) : grouped.map(([cat, items]) => (
          <section key={cat} id={slug(cat)} data-cat={cat} className="oo-scroll-mt mt-8">
            <h2 className="oo-display mb-4 flex items-baseline gap-2 text-2xl font-extrabold text-stone-900">
              <span>{CATEGORY_EMOJI[cat] || '🍽️'}</span> {cat}
              <span className="text-sm font-semibold text-stone-400">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((m) => {
                const inCart = qtyOf(m._id);
                const canAdd = m.available && open;
                return (
                  <article key={m._id} className={`group flex gap-4 rounded-3xl bg-white p-4 shadow-sm shadow-stone-900/5 ring-1 transition ${m.available ? 'ring-stone-200/70 hover:shadow-lg hover:ring-orange-200' : 'ring-stone-200/70 opacity-60'}`}>
                    <div className="flex min-w-0 flex-1 flex-col">
                      {m.isCombo && <span className="mb-1 inline-flex w-fit items-center gap-1 rounded-full bg-fuchsia-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-fuchsia-700 ring-1 ring-fuchsia-200">🍱 Combo deal</span>}
                      <button onClick={() => m.available && setSheet(m)} className="text-left">
                        <h3 className="oo-display text-[17px] font-bold leading-snug text-stone-900">{m.itemName}</h3>
                      </button>
                      <p className="mt-0.5 font-extrabold text-stone-900">{money(m.price)}</p>
                      {m.isCombo && m.comboItems.length > 0 && <p className="mt-1 text-xs font-semibold text-fuchsia-700">{m.comboItems.map((c) => `${c.quantity}× ${c.itemName}`).join(' + ')}</p>}
                      {cleanDesc(m.description) && <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-stone-500">{cleanDesc(m.description)}</p>}
                      {m.addons.length > 0 && m.available && <p className="mt-auto pt-2 text-[11px] font-bold text-orange-600">✨ Customisable</p>}
                    </div>

                    <div className="relative w-28 shrink-0 sm:w-32">
                      <button onClick={() => m.available && setSheet(m)} className="relative block h-28 w-full overflow-hidden rounded-2xl sm:h-32" aria-label={`See ${m.itemName}`}>
                        <Photo item={m} size={300} emojiClass="text-5xl" />
                        {!m.available && <span className="absolute inset-0 flex items-center justify-center bg-stone-900/60 text-xs font-black uppercase tracking-wider text-white">Sold out</span>}
                      </button>
                      {canAdd && (
                        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2">
                          {inCart > 0 && m.addons.length === 0 ? (
                            <div className="inline-flex items-center rounded-xl bg-orange-500 text-white shadow-lg shadow-orange-500/30">
                              <button onClick={() => minusOne(m._id)} className="rounded-l-xl px-2.5 py-2 hover:bg-orange-600" aria-label="Less"><Minus className="h-4 w-4" /></button>
                              <span className="min-w-6 text-center text-sm font-black">{inCart}</span>
                              <button onClick={() => addLine(m, 1, [], '')} className="rounded-r-xl px-2.5 py-2 hover:bg-orange-600" aria-label="More"><Plus className="h-4 w-4" /></button>
                            </div>
                          ) : (
                            <button onClick={() => (m.addons.length > 0 ? setSheet(m) : addLine(m, 1, [], ''))}
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl bg-white px-5 py-2 text-sm font-black uppercase tracking-wide text-orange-600 shadow-lg shadow-stone-900/10 ring-1 ring-orange-200 transition hover:bg-orange-50 active:scale-95">
                              Add <Plus className="h-4 w-4" />
                              {inCart > 0 && <span className="ml-0.5 rounded-full bg-orange-500 px-1.5 text-[10px] text-white">{inCart}</span>}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}

        <footer className="mt-16 text-center">
          <p className="text-xs font-semibold text-stone-400">Prices include all taxes set by the restaurant.</p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-stone-300">Powered by Atithi RMS</p>
        </footer>
      </main>

      {/* floating cart bar */}
      {count > 0 && !drawer && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-4 anim-pop">
          <button key={bump} onClick={() => { setStep('cart'); setDrawer(true); }} className="oo-bump mx-auto flex w-full max-w-xl items-center justify-between rounded-2xl bg-stone-900 px-4 py-3.5 text-white shadow-2xl shadow-stone-900/40 transition active:scale-[0.98]">
            <span className="flex items-center gap-3">
              <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500"><ShoppingBag className="h-5 w-5" /></span>
              <span className="text-left"><span className="block text-xs font-semibold text-white/60">{count} {count === 1 ? 'item' : 'items'}</span><span className="block text-lg font-extrabold leading-tight">{money(localSub)}</span></span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-stone-900">View cart <ChevronRight className="h-4 w-4" /></span>
          </button>
        </div>
      )}

      {sheet && <ItemSheet item={sheet} open={open} onClose={() => setSheet(null)} onAdd={(q, a, n) => { addLine(sheet, q, a, n); setSheet(null); }} />}

      {drawer && (
        <div className="fixed inset-0 z-40 flex justify-end bg-stone-950/50 backdrop-blur-sm anim-fade-in" onClick={(e) => e.target === e.currentTarget && setDrawer(false)}>
          <div className="flex h-full w-full max-w-lg flex-col bg-[#FFF8F1] shadow-2xl anim-slide-right">
            <div className="flex items-center gap-3 border-b border-stone-200 bg-white px-5 py-4">
              {step === 'details' && <button onClick={() => setStep('cart')} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Back"><ChevronLeft className="h-5 w-5" /></button>}
              <div className="flex-1">
                <h2 className="oo-display text-xl font-extrabold text-stone-900">{step === 'cart' ? 'Your cart' : 'Delivery details'}</h2>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="h-1.5 w-10 rounded-full bg-orange-500" />
                  <span className={`h-1.5 w-10 rounded-full ${step === 'details' ? 'bg-orange-500' : 'bg-stone-200'}`} />
                  <span className="ml-1 text-[11px] font-semibold text-stone-400">Step {step === 'cart' ? 1 : 2} of 2</span>
                </div>
              </div>
              <button onClick={() => setDrawer(false)} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4 thin-scroll">
              {cart.length === 0 ? (
                <div className="py-16 text-center"><p className="text-5xl">🛒</p><p className="mt-3 font-bold text-stone-700">Your cart is empty</p></div>
              ) : step === 'cart' ? (
                <>
                  {s.freeDeliveryAbove > 0 && (
                    <div className="rounded-2xl bg-white p-3.5 ring-1 ring-stone-200/70">
                      <p className="flex items-center gap-2 text-xs font-bold text-stone-700"><Gift className="h-4 w-4 text-orange-500" />
                        {freeLeft > 0 ? <>Add <span className="text-orange-600">{money(freeLeft)}</span> more for FREE delivery</> : <span className="text-emerald-600">Yay! You get FREE delivery 🎉</span>}
                      </p>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-rose-500 transition-all duration-500" style={{ width: `${freePct}%` }} /></div>
                    </div>
                  )}
                  {cart.map((l) => (
                    <div key={l.key} className="flex gap-3 rounded-2xl bg-white p-3 ring-1 ring-stone-200/70">
                      <div className={`relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br text-3xl ${gradFor(l.menuItemId)}`}>
                        🍽️
                        {l.imageUrl && <img src={menuThumb(l.imageUrl, 160)} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-stone-900">{l.name}</p>
                        {l.addons.length > 0 && <p className="text-xs font-semibold text-orange-600">+ {l.addons.map((a) => a.name).join(', ')}</p>}
                        {l.note && <p className="flex items-center gap-1 text-xs text-amber-700"><StickyNote className="h-3 w-3" /> {l.note}</p>}
                        <div className="mt-2 flex items-center justify-between">
                          <div className="inline-flex items-center rounded-xl bg-orange-50 ring-1 ring-orange-200">
                            <button onClick={() => changeQty(l.key, -1)} className="rounded-l-xl p-2 text-orange-600 hover:bg-orange-100" aria-label="Less">{l.quantity === 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}</button>
                            <span className="min-w-7 text-center text-sm font-black text-stone-900">{l.quantity}</span>
                            <button onClick={() => changeQty(l.key, 1)} className="rounded-r-xl p-2 text-orange-600 hover:bg-orange-100" aria-label="More"><Plus className="h-3.5 w-3.5" /></button>
                          </div>
                          <span className="font-extrabold text-stone-900">{money(unit(l) * l.quantity)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setDrawer(false)} className="w-full rounded-2xl border-2 border-dashed border-stone-300 py-3 text-sm font-bold text-stone-600 hover:border-orange-300 hover:text-orange-600">+ Add more items</button>
                </>
              ) : (
                <div className="space-y-4">
                  <Card title="Who is ordering?">
                    <Input icon={User} label="Your name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Full name" autoComplete="name" />
                    <Input icon={Phone} label="Phone number *" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="98XXXXXXXX" inputMode="tel" autoComplete="tel" />
                  </Card>

                  <Card title="Where should we deliver?">
                    {needsArea && (
                      <label className="block"><span className="mb-1 block text-xs font-bold text-stone-600">Delivery area *</span>
                        <select value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value })} className="field">
                          <option value="">Choose your area…</option>
                          {s.areas.map((a) => <option key={a._id} value={a._id}>{a.name} — {a.charge ? money(a.charge) : 'Free'} delivery</option>)}
                        </select></label>
                    )}
                    <label className="block"><span className="mb-1 block text-xs font-bold text-stone-600">Full delivery address *</span>
                      <textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="House no., street, ward…" className="field" autoComplete="street-address" /></label>
                    <Input icon={MapPin} label="Nearby landmark (optional)" value={form.landmark} onChange={(v) => setForm({ ...form, landmark: v })} placeholder="Near the blue temple" />
                    <div className="rounded-2xl bg-orange-50/70 p-3 ring-1 ring-orange-100">
                      <div className="flex flex-wrap items-center gap-3">
                        <button type="button" onClick={useMyLocation} className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-bold text-orange-600 ring-1 ring-orange-200 hover:bg-orange-50"><Crosshair className="h-4 w-4" /> Pin my location</button>
                        <span className={`text-xs font-semibold ${form.lat ? 'text-emerald-600' : 'text-stone-500'}`}>{locMsg || (s.radiusKm > 0 ? 'Required: we deliver within ' + s.radiusKm + ' km' : 'Helps the rider find you')}</span>
                      </div>
                      {form.lat != null && <div className="mt-3 overflow-hidden rounded-xl"><MapView customer={{ lat: form.lat, lng: form.lng }} height={150} /></div>}
                    </div>
                    <label className="block"><span className="mb-1 block text-xs font-bold text-stone-600">Note for the restaurant (optional)</span>
                      <textarea rows={2} maxLength={300} value={form.orderNote} onChange={(e) => setForm({ ...form, orderNote: e.target.value })} placeholder="Ring the bell twice, less spicy…" className="field" /></label>
                  </Card>

                  <Card title="How will you pay?">
                    <div className="grid grid-cols-2 gap-3">
                      {s.acceptCOD && <PayOption active={form.paymentMethod === 'COD'} onClick={() => setForm({ ...form, paymentMethod: 'COD' })} icon={Banknote} title="Cash on delivery" sub="Pay the rider" />}
                      {s.acceptOnline && <PayOption active={form.paymentMethod === 'Online'} onClick={() => setForm({ ...form, paymentMethod: 'Online', paymentProvider: form.paymentProvider || data.payProviders[0] || '' })} icon={Smartphone} title="Online payment" sub="QR / wallet" />}
                    </div>

                    {form.paymentMethod === 'Online' && (
                      <div className="rounded-2xl bg-stone-50 p-3.5 ring-1 ring-stone-200 anim-pop">
                        {data.payProviders.length > 0 ? (
                          <>
                            <p className="mb-2 text-xs font-bold text-stone-600">Pay with *</p>
                            <div className="grid grid-cols-3 gap-2">
                              {data.payProviders.map((p) => {
                                const st = walletStyle(p);
                                const on = form.paymentProvider === p;
                                return (
                                  <button key={p} type="button" onClick={() => setForm({ ...form, paymentProvider: p })} aria-pressed={on}
                                    className="relative rounded-xl border-2 bg-white px-2 py-3 text-center text-sm font-extrabold transition active:scale-95"
                                    style={on ? { borderColor: st.color, backgroundColor: st.soft, color: st.color } : { borderColor: '#e7e5e4', color: '#57534e' }}>
                                    {on && <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-white" style={{ backgroundColor: st.color }}><Check className="h-3 w-3" /></span>}
                                    {p}
                                  </button>
                                );
                              })}
                            </div>
                            <p className="mt-2.5 text-xs text-stone-500">After you place the order, you will see the {form.paymentProvider || 'wallet'} QR with the exact amount to scan.</p>
                          </>
                        ) : (
                          <p className="text-sm text-stone-600">{s.onlinePaymentNote || 'The restaurant will show you how to pay after you place the order.'}</p>
                        )}
                      </div>
                    )}
                  </Card>
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="space-y-3 border-t border-stone-200 bg-white p-4">
                <div className="space-y-1 text-sm">
                  <Row label="Items total" value={money(quote?.ok ? quote.subTotal : localSub)} />
                  {step === 'details' && <Row label="Delivery fee" value={quote?.ok ? (quote.deliveryCharge ? money(quote.deliveryCharge) : <span className="text-emerald-600">FREE 🎉</span>) : '—'} />}
                  <div className="flex items-center justify-between border-t border-dashed border-stone-200 pt-2 text-lg font-extrabold text-stone-900">
                    <span>To pay</span><span>{quoting ? <Loader2 className="inline h-5 w-5 animate-spin text-orange-500" /> : money(step === 'cart' ? localSub : quote?.ok ? quote.totalAmount : localSub)}</span>
                  </div>
                </div>
                {(quote && !quote.ok && (step === 'details' || quote.errors[0]?.startsWith('Minimum'))) && <p className="flex items-start gap-2 rounded-xl bg-rose-50 p-2.5 text-xs font-semibold text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {quote.errors[0]}</p>}
                {formError && <p className="flex items-start gap-2 rounded-xl bg-rose-50 p-2.5 text-xs font-semibold text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {formError}</p>}
                {step === 'cart' ? (
                  <button disabled={!open} onClick={() => setStep('details')} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 text-base font-black text-white shadow-lg shadow-orange-500/30 transition hover:bg-orange-600 active:scale-[0.99] disabled:opacity-50">
                    {open ? <>Continue to checkout <ChevronRight className="h-5 w-5" /></> : 'Orders are paused'}
                  </button>
                ) : (
                  <button disabled={placing || !open} onClick={place} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 text-base font-black text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-60">
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

/* ---------------------------- dish photo (or emoji) ---------------------------- */
function Photo({ item, size, emojiClass }: { item: { _id: string; category: string; imageUrl: string; itemName: string }; size: number; emojiClass: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${gradFor(item._id)} ${emojiClass}`}>
      {emojiFor(item.category, item._id)}
      {item.imageUrl && !broken && (
        <img src={menuThumb(item.imageUrl, size)} alt={item.itemName} loading="lazy" decoding="async" onError={() => setBroken(true)}
          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
      )}
    </span>
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
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-stone-950/55 backdrop-blur-sm anim-fade-in sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl anim-sheet sm:rounded-[2rem]">
        <div className="relative h-60 shrink-0 sm:h-64">
          <Photo item={item} size={800} emojiClass="text-8xl" />
          <span className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 to-transparent" />
          <button onClick={onClose} className="absolute right-3 top-3 rounded-full bg-white/95 p-2 text-stone-700 shadow-lg hover:bg-white" aria-label="Close"><X className="h-5 w-5" /></button>
          {item.isCombo && <span className="absolute left-4 top-4 rounded-full bg-fuchsia-600 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white shadow">🍱 Combo deal</span>}
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5 thin-scroll">
          <div>
            <div className="flex items-start justify-between gap-3">
              <h2 className="oo-display text-2xl font-extrabold leading-tight text-stone-900">{item.itemName}</h2>
              <span className="shrink-0 rounded-xl bg-orange-50 px-3 py-1 text-lg font-extrabold text-orange-600">{money(item.price)}</span>
            </div>
            {item.isCombo && item.comboItems.length > 0 && <p className="mt-1 text-sm font-semibold text-fuchsia-700">{item.comboItems.map((c) => `${c.quantity}× ${c.itemName}`).join(' + ')}</p>}
            {cleanDesc(item.description) && <p className="mt-2 text-sm leading-relaxed text-stone-500">{cleanDesc(item.description)}</p>}
          </div>
          {item.addons.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-stone-900"><Sparkles className="h-4 w-4 text-orange-500" /> Make it yours <span className="font-medium text-stone-400">· optional</span></p>
              <div className="space-y-2">
                {item.addons.map((a) => {
                  const on = picked.includes(a.name);
                  return (
                    <button key={a.name} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== a.name) : [...p, a.name]))} className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left ring-1 transition ${on ? 'bg-orange-50 ring-orange-400' : 'bg-white ring-stone-200 hover:ring-orange-300'}`}>
                      <span className="flex items-center gap-3"><span className={`flex h-5 w-5 items-center justify-center rounded-md ${on ? 'bg-orange-500 text-white' : 'bg-stone-100 ring-1 ring-stone-200'}`}>{on && <Check className="h-3.5 w-3.5" />}</span><span className="text-sm font-semibold text-stone-800">{a.name}</span></span>
                      <span className="text-sm font-bold text-stone-600">{a.price ? `+ ${money(a.price)}` : 'Free'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <label className="block"><span className="mb-1 block text-sm font-extrabold text-stone-900">Special instructions <span className="font-medium text-stone-400">· optional</span></span>
            <textarea rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. no onions, extra spicy" className="field" /></label>
        </div>
        <div className="flex items-center gap-3 border-t border-stone-100 p-4">
          <div className="inline-flex items-center rounded-2xl bg-orange-50 ring-1 ring-orange-200">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="rounded-l-2xl p-3 text-orange-600 hover:bg-orange-100" aria-label="Less"><Minus className="h-4 w-4" /></button>
            <span className="min-w-7 text-center font-black text-stone-900">{qty}</span>
            <button onClick={() => setQty((q) => Math.min(50, q + 1))} className="rounded-r-2xl p-3 text-orange-600 hover:bg-orange-100" aria-label="More"><Plus className="h-4 w-4" /></button>
          </div>
          <button disabled={!open} onClick={() => onAdd(qty, addons, note)} className="flex flex-1 items-center justify-between rounded-2xl bg-orange-500 px-5 py-3.5 font-black text-white shadow-lg shadow-orange-500/30 transition hover:bg-orange-600 active:scale-[0.99] disabled:opacity-50">
            <span>{open ? 'Add to cart' : 'Orders paused'}</span><span>{money(total)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- confirmation ---------------------------- */
function Confirmation({ data, placed, onMore }: { data: PageData; placed: { orderNo: string; trackingToken: string; totalAmount: number; paymentMethod: string; paymentProvider?: string }; onMore: () => void }) {
  const online = placed.paymentMethod === 'Online';
  return (
    <div className="oo min-h-screen bg-[#FFF8F1] px-4 py-10">
      <Styles />
      <div className="mx-auto max-w-md text-center">
        <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-emerald-400/30 anim-pulse-ring" />
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-xl shadow-emerald-500/40 anim-pop"><PartyPopper className="h-11 w-11" /></span>
        </div>
        <h1 className="oo-display mt-6 text-3xl font-extrabold text-stone-900">Order placed!</h1>
        <p className="mt-1 text-stone-500">{data.restaurant.name} has received your order.</p>

        <div className="mt-6 overflow-hidden rounded-3xl bg-white text-left shadow-xl shadow-stone-900/5 ring-1 ring-stone-200/70">
          <div className="relative overflow-hidden bg-[#1c0f1f] p-5 text-white">
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-orange-500/40 blur-2xl" />
            <p className="relative text-xs font-bold uppercase tracking-wider text-white/60">Order number</p>
            <p className="oo-display relative text-3xl font-extrabold">{placed.orderNo}</p>
          </div>
          <dl className="divide-y divide-stone-100 text-sm">
            <div className="flex justify-between p-4"><dt className="flex items-center gap-2 text-stone-500"><Wallet className="h-4 w-4" /> Total</dt><dd className="font-extrabold text-stone-900">{money(placed.totalAmount)}</dd></div>
            <div className="flex justify-between p-4"><dt className="flex items-center gap-2 text-stone-500"><Banknote className="h-4 w-4" /> Payment</dt><dd className="font-bold text-stone-900">{online ? `Online${placed.paymentProvider && placed.paymentProvider !== 'manual' ? ` · ${placed.paymentProvider}` : ''}` : 'Cash on delivery'}</dd></div>
            <div className="flex justify-between p-4"><dt className="flex items-center gap-2 text-stone-500"><Clock3 className="h-4 w-4" /> Estimated time</dt><dd className="font-bold text-stone-900">~{(data.settings.estimatedPrepMinutes || 30) + 15} min</dd></div>
          </dl>
        </div>

        {online && <div className="mt-4 text-left"><PayQr token={placed.trackingToken} note={data.settings.onlinePaymentNote} defaultProvider={placed.paymentProvider} /></div>}

        <a href={`/track/${placed.trackingToken}`} className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 font-black text-white shadow-lg shadow-orange-500/30 transition hover:bg-orange-600"><Bike className="h-5 w-5" /> Track my order</a>
        <button onClick={onMore} className="mt-3 w-full rounded-2xl bg-white py-3.5 font-bold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50">Order something else</button>
        {data.restaurant.phone && <p className="mt-6 text-xs text-stone-500">Need help? Call <a className="font-bold text-orange-600" href={`tel:${data.restaurant.phone}`}>{data.restaurant.phone}</a></p>}
      </div>
    </div>
  );
}

/* ---------------------------- loading ---------------------------- */
function LoadingSkeleton() {
  return (
    <div className="oo min-h-screen bg-[#FFF8F1]">
      <Styles />
      <div className="bg-[#1c0f1f] px-5 pb-20 pt-6">
        <div className="mx-auto max-w-5xl">
          <div className="oo-shimmer h-6 w-32 rounded-full opacity-20" />
          <div className="mt-6 flex items-center gap-4"><div className="oo-shimmer h-16 w-16 rounded-2xl opacity-20" /><div className="oo-shimmer h-9 w-56 rounded-xl opacity-20" /></div>
          <div className="mt-6 grid max-w-xl grid-cols-3 gap-2">{[0, 1, 2].map((i) => <div key={i} className="oo-shimmer h-14 rounded-2xl opacity-20" />)}</div>
        </div>
      </div>
      <div className="mx-auto -mt-10 max-w-5xl space-y-3 px-4">
        <div className="oo-shimmer h-14 rounded-2xl" />
        {[0, 1, 2, 3].map((i) => <div key={i} className="oo-shimmer h-36 rounded-3xl" />)}
        <p className="pt-2 text-center text-sm font-semibold text-stone-400">Warming up the kitchen… 🍳</p>
      </div>
    </div>
  );
}

/* ---------------------------- tiny parts ---------------------------- */
const Centered = ({ children }: { children: React.ReactNode }) => <div className="oo flex min-h-screen flex-col items-center justify-center bg-[#FFF8F1] p-6"><Styles />{children}</div>;
const Stat = ({ icon: I, label, value }: { icon: React.ElementType; label: string; value: string }) => (
  <div className="rounded-2xl bg-white/[0.07] px-3 py-2.5 ring-1 ring-white/10 backdrop-blur">
    <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white/50"><I className="h-3 w-3 text-orange-300" /> {label}</p>
    <p className="mt-0.5 truncate text-sm font-extrabold">{value}</p>
  </div>
);
const Row = ({ label, value }: { label: string; value: React.ReactNode }) => <div className="flex justify-between"><span className="text-stone-500">{label}</span><span className="font-semibold text-stone-800">{value}</span></div>;
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200/70"><h3 className="oo-display text-base font-extrabold text-stone-900">{title}</h3>{children}</section>
);

function Input({ icon: Icon, label, value, onChange, placeholder, inputMode, autoComplete }: { icon: React.ElementType; label: string; value: string; onChange: (v: string) => void; placeholder?: string; inputMode?: 'tel' | 'text'; autoComplete?: string }) {
  return (
    <label className="block"><span className="mb-1 block text-xs font-bold text-stone-600">{label}</span>
      <div className="relative"><Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} autoComplete={autoComplete} className="field !pl-10" /></div></label>
  );
}

function PayOption({ active, onClick, icon: Icon, title, sub }: { active: boolean; onClick: () => void; icon: React.ElementType; title: string; sub: string }) {
  return (
    <button type="button" onClick={onClick} className={`relative rounded-2xl p-4 text-left ring-2 transition ${active ? 'bg-orange-50 ring-orange-500' : 'bg-white ring-stone-200 hover:ring-orange-300'}`}>
      {active && <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white"><Check className="h-3 w-3" /></span>}
      <Icon className={`h-6 w-6 ${active ? 'text-orange-600' : 'text-stone-400'}`} />
      <p className="mt-2 text-sm font-bold text-stone-900">{title}</p><p className="text-xs text-stone-500">{sub}</p>
    </button>
  );
}

// Styles used only on the customer pages (the staff app injects its own in App.tsx)
export function Styles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
      .oo{font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif}
      .oo-display{font-family:'Bricolage Grotesque','Plus Jakarta Sans',system-ui,sans-serif}
      .oo-dots{background-image:radial-gradient(#fff 1px,transparent 1px);background-size:18px 18px}
      .oo-scroll-mt{scroll-margin-top:72px}
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      @keyframes popIn{from{opacity:0;transform:scale(.96) translateY(10px)}to{opacity:1;transform:none}}
      @keyframes sheetUp{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}
      @keyframes slideRight{from{transform:translateX(100%)}to{transform:none}}
      @keyframes pulseRing{0%{transform:scale(.9);opacity:.55}100%{transform:scale(1.7);opacity:0}}
      @keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
      @keyframes bump{0%{transform:scale(1)}40%{transform:scale(1.03)}100%{transform:scale(1)}}
      @keyframes blink{0%,100%{opacity:1}50%{opacity:.35}}
      @keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}
      .anim-fade-in{animation:fadeIn .25s ease-out both}.anim-pop{animation:popIn .32s cubic-bezier(.22,1,.36,1) both}
      .anim-sheet{animation:sheetUp .35s cubic-bezier(.22,1,.36,1) both}
      .anim-slide-right{animation:slideRight .3s cubic-bezier(.22,1,.36,1) both}.anim-pulse-ring{animation:pulseRing 1.8s ease-out infinite}.anim-floaty{animation:floaty 3s ease-in-out infinite}
      .oo-bump{animation:bump .35s ease-out}.oo-blink{animation:blink 1.6s ease-in-out infinite}
      .oo-shimmer{background:linear-gradient(90deg,#f1ece6 0%,#fbf7f2 50%,#f1ece6 100%);background-size:800px 100%;animation:shimmer 1.3s linear infinite}
      .thin-scroll::-webkit-scrollbar{width:6px;height:6px}.thin-scroll::-webkit-scrollbar-thumb{background:#e7d8c9;border-radius:999px}
      .no-scrollbar{scrollbar-width:none}.no-scrollbar::-webkit-scrollbar{display:none}
      .field{width:100%;border:1px solid #e7e5e4;border-radius:.9rem;padding:.7rem .9rem;font-size:.9rem;outline:none;background:#fff}.field:focus{border-color:#f97316;box-shadow:0 0 0 4px rgba(249,115,22,.15)}
      @media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}
    `}</style>
  );
}