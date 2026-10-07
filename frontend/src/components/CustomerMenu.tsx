import React, { useEffect, useMemo, useState } from 'react';
import { UtensilsCrossed, BellRing, ArrowLeft, Search, Loader2, CheckCircle2, AlertCircle, MapPin } from 'lucide-react';
import MenuImage from './MenuImage';

// This page is opened by customers who scan a table QR code.
// URL looks like:  /scan/<restaurantKey>/<tableId>
// No login is needed. The backend checks that the table belongs to the restaurant.

const API_BASE = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');

interface MenuItem {
  _id: string;
  itemName: string;
  description: string;
  category: string;
  price: number;
  status: string;
  isCombo: boolean;
  comboItems: { itemName: string; quantity: number }[];
  imageUrl?: string;
}

interface PageData {
  restaurantName: string;
  location: string;
  tableName: string;
  menu: MenuItem[];
}

const CATEGORY_EMOJI: Record<string, string> = {
  Appetizer: '🥗',
  'Main Course': '🍛',
  Dessert: '🍰',
  Beverage: '🥤',
  Side: '🍟',
  Combo: '🍱',
  Other: '🍽️',
};

const COOLDOWN_SECONDS = 60;

// Read restaurantKey and tableId out of the address bar
function readIdsFromUrl() {
  const parts = window.location.pathname.split('/').filter(Boolean); // ["scan", key, table]
  return { restaurantKey: parts[1] || '', tableId: parts[2] || '' };
}

export default function CustomerMenu() {
  const { restaurantKey, tableId } = readIdsFromUrl();

  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'home' | 'menu'>('home');

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  const [calling, setCalling] = useState(false);
  const [callMsg, setCallMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // 1) Load restaurant + table + menu
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/public/menu/${restaurantKey}/${tableId}`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || 'This QR code is not valid.');
        setData(json.data);
        document.title = `${json.data.restaurantName} · Menu`;
      } catch (e: any) {
        setError(e.message || 'Could not load the menu.');
      } finally {
        setLoading(false);
      }
    })();
  }, [restaurantKey, tableId]);

  // 2) Count down the "call again" timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // 3) Call waiter
  const callWaiter = async () => {
    if (calling || cooldown > 0) return;
    setCalling(true);
    setCallMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/public/call-waiter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantKey, tableId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Could not call the waiter.');
      setCallMsg({ ok: true, text: json.message });
      setCooldown(COOLDOWN_SECONDS);
    } catch (e: any) {
      setCallMsg({ ok: false, text: e.message });
    } finally {
      setCalling(false);
    }
  };

  const categories = useMemo(() => {
    if (!data) return [];
    return ['All', ...Array.from(new Set(data.menu.map((m) => m.category)))];
  }, [data]);

  const filteredMenu = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.menu.filter(
      (m) =>
        (category === 'All' || m.category === category) &&
        (!q || m.itemName.toLowerCase().includes(q) || m.description.toLowerCase().includes(q))
    );
  }, [data, search, category]);

  // Group items under their category heading
  const grouped = useMemo(() => {
    const g: Record<string, MenuItem[]> = {};
    filteredMenu.forEach((m) => {
      (g[m.category] ||= []).push(m);
    });
    return g;
  }, [filteredMenu]);

  /* ---------------- Loading / error screens ---------------- */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-purple-50 text-purple-700">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center">
        <AlertCircle className="h-12 w-12 text-rose-500" />
        <h1 className="text-xl font-bold text-slate-900">Oops!</h1>
        <p className="text-slate-600">{error || 'This QR code is not valid.'}</p>
        <p className="text-sm text-slate-400">Please ask the staff for help.</p>
      </div>
    );
  }

  /* ---------------- Header (shared) ---------------- */
  const header = (
    <div className="bg-gradient-to-br from-purple-600 via-violet-600 to-indigo-600 px-5 pb-8 pt-8 text-white">
      <p className="text-xs font-semibold uppercase tracking-widest text-purple-200">Welcome to</p>
      <h1 className="text-2xl font-extrabold">{data.restaurantName}</h1>
      {data.location && (
        <p className="mt-1 flex items-center gap-1 text-sm text-purple-100">
          <MapPin className="h-3.5 w-3.5" /> {data.location}
        </p>
      )}
      <span className="mt-4 inline-block rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">
        🪑 {data.tableName}
      </span>
    </div>
  );

  /* ---------------- HOME: two cards ---------------- */
  if (view === 'home') {
    return (
      <div className="min-h-screen bg-slate-50">
        {header}
        <div className="-mt-4 space-y-4 px-5 pb-10">
          <button
            onClick={() => setView('menu')}
            className="flex w-full items-center gap-4 rounded-2xl bg-white p-5 text-left shadow-lg shadow-purple-900/5 ring-1 ring-purple-100 active:scale-[0.98] transition"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
              <UtensilsCrossed className="h-7 w-7" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900">View Menu</p>
              <p className="text-sm text-slate-500">{data.menu.length} items available</p>
            </div>
          </button>

          <button
            onClick={callWaiter}
            disabled={calling || cooldown > 0}
            className="flex w-full items-center gap-4 rounded-2xl bg-white p-5 text-left shadow-lg shadow-purple-900/5 ring-1 ring-purple-100 active:scale-[0.98] transition disabled:opacity-70"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
              {calling ? <Loader2 className="h-7 w-7 animate-spin" /> : <BellRing className="h-7 w-7" />}
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900">Call Waiter</p>
              <p className="text-sm text-slate-500">
                {cooldown > 0 ? `You can call again in ${cooldown}s` : 'Tap to ask a waiter to come to your table'}
              </p>
            </div>
          </button>

          {callMsg && (
            <div
              className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
                callMsg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
              }`}
            >
              {callMsg.ok ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
              {callMsg.text}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ---------------- MENU view ---------------- */
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white/95 px-4 pb-3 pt-4 shadow-sm backdrop-blur">
        <div className="mb-3 flex items-center gap-3">
          <button onClick={() => setView('home')} className="rounded-full bg-slate-100 p-2 text-slate-700">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="truncate font-bold text-slate-900">{data.restaurantName}</p>
            <p className="text-xs text-slate-500">{data.tableName}</p>
          </div>
          <button
            onClick={callWaiter}
            disabled={calling || cooldown > 0}
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-purple-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-purple-300"
          >
            <BellRing className="h-4 w-4" /> {cooldown > 0 ? `${cooldown}s` : 'Waiter'}
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search food or drinks…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-purple-400"
          />
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                category === c ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {c !== 'All' && (CATEGORY_EMOJI[c] || '🍽️')} {c}
            </button>
          ))}
        </div>
      </div>

      {callMsg && (
        <div className={`mx-4 mt-3 rounded-xl px-4 py-2 text-sm ${callMsg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {callMsg.text}
        </div>
      )}

      <div className="space-y-6 px-4 py-5">
        {Object.keys(grouped).length === 0 && <p className="py-10 text-center text-slate-500">No items found.</p>}

        {(Object.entries(grouped) as [string, MenuItem[]][]).map(([cat, items]) => (
          <section key={cat}>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">
              {CATEGORY_EMOJI[cat] || '🍽️'} {cat}
            </h2>
            <div className="space-y-2">
              {items.map((m) => {
                const soldOut = m.status === 'Sold Out';
                return (
                  <div key={m._id} className={`rounded-xl bg-white p-4 ring-1 ring-slate-100 ${soldOut ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 text-3xl ring-1 ring-slate-100">
                        <MenuImage src={m.imageUrl} alt={m.itemName} fallback={CATEGORY_EMOJI[m.isCombo ? 'Combo' : m.category] || '🍽️'} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">{m.itemName}</p>
                        {m.description && <p className="mt-0.5 text-sm text-slate-500">{m.description}</p>}
                        {m.isCombo && m.comboItems.length > 0 && (
                          <p className="mt-1 text-xs text-purple-600">
                            Includes: {m.comboItems.map((c) => `${c.quantity}× ${c.itemName}`).join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-bold text-purple-700">Rs. {m.price}</p>
                        {soldOut && <p className="text-xs font-semibold text-rose-600">Sold out</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}