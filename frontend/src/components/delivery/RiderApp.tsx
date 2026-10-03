import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bike, Phone, MapPin, Navigation, Loader2, LogOut, KeyRound, Check, Radio, PackageCheck, Truck, AlertCircle, Wallet, StickyNote } from 'lucide-react';
import { API_BASE, money, mapsLink, playDing, useSocket, timeAgo, STATUS_META, type DStatus } from '../../delivery/shared';
import { Styles } from './OnlineOrder';

// =====================================================================
// RIDER APP (phone web page)      address:  /rider/<restaurantKey>
// Rider logs in with phone + PIN. The rider token only works on /api/rider-app,
// never on the manager APIs.
// =====================================================================
interface RiderOrder {
  _id: string; orderNo: string; status: DStatus;
  customer: { name: string; phone: string; address: string; landmark?: string; area?: string; lat: number | null; lng: number | null };
  items: { itemName: string; quantity: number; addons: { name: string }[]; note: string }[];
  orderNote?: string; totalAmount: number; paymentMethod: 'COD' | 'Online'; paymentStatus: string; cashToCollect: number; createdAt: string;
}
interface Me { _id: string; name: string; phone: string; vehicleType: string; vehicleNumber?: string; status: 'Available' | 'Busy' | 'Offline' }

const readKey = () => window.location.pathname.split('/').filter(Boolean)[1] || '';

export default function RiderApp() {
  const key = readKey();
  const tokenKey = `rms_rider_${key}`;
  const [token, setToken] = useState(() => localStorage.getItem(tokenKey) || '');
  const [me, setMe] = useState<Me | null>(null);
  const [restaurant, setRestaurant] = useState('');
  const [active, setActive] = useState<RiderOrder[]>([]);
  const [done, setDone] = useState<RiderOrder[]>([]);
  const [cash, setCash] = useState(0);
  const [tab, setTab] = useState<'active' | 'done'>('active');
  const [busyId, setBusyId] = useState('');
  const [toast, setToast] = useState('');
  const [gps, setGps] = useState<'off' | 'on' | 'denied'>('off');

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };
  const logout = useCallback(() => { localStorage.removeItem(tokenKey); setToken(''); setMe(null); }, [tokenKey]);

  const call = useCallback(async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${API_BASE}/api/rider-app${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) { logout(); throw new Error(json.message || 'Please log in again.'); }
    if (!res.ok || json.success === false) throw new Error(json.message || 'Something went wrong.');
    return json;
  }, [token, logout]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [m, o] = await Promise.all([call('/me'), call('/me/orders')]);
      setMe(m.rider); setRestaurant(m.restaurantName);
      setActive(o.active); setDone(o.deliveredToday); setCash(o.cashCollectedToday);
    } catch { /* shown by the login screen if the session ended */ }
  }, [token, call]);

  useEffect(() => { load(); }, [load]);
  const connected = useSocket(token ? { kind: 'rider', token } : null, { 'delivery:assigned': () => { playDing(); load(); } });
  useEffect(() => { if (!token) return; const id = setInterval(load, connected ? 40000 : 12000); return () => clearInterval(id); }, [token, connected, load]);

  /* ---------- share GPS while there are active orders ---------- */
  const lastSent = useRef(0);
  const hasActive = active.length > 0;
  useEffect(() => {
    if (!token || !hasActive || me?.status === 'Offline') { setGps('off'); return; }
    if (!navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        setGps('on');
        if (Date.now() - lastSent.current < 10000) return; // at most every 10 seconds
        lastSent.current = Date.now();
        call('/me/location', { method: 'POST', body: JSON.stringify({ lat: p.coords.latitude, lng: p.coords.longitude }) }).catch(() => {});
      },
      (e) => setGps(e.code === 1 ? 'denied' : 'off'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [token, hasActive, me?.status, call]);

  const setStatus = async (status: 'Available' | 'Offline') => {
    try { const j = await call('/me/status', { method: 'PATCH', body: JSON.stringify({ status }) }); setMe(j.rider); } catch (e: any) { flash(e.message); }
  };

  const move = async (o: RiderOrder, status: 'OutForDelivery' | 'Delivered') => {
    if (status === 'Delivered' && o.cashToCollect > 0 && !window.confirm(`Did you collect ${money(o.cashToCollect)} in cash?`)) return;
    setBusyId(o._id);
    try { await call(`/me/orders/${o._id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); flash(status === 'Delivered' ? 'Delivered — great job! 🎉' : 'Delivery started 🚀'); await load(); } catch (e: any) { flash(e.message); } finally { setBusyId(''); }
  };

  if (!token) return <Login restaurantKey={key} onDone={(t) => { localStorage.setItem(tokenKey, t); setToken(t); }} />;
  if (!me) return <div className="flex min-h-screen items-center justify-center bg-white"><Styles /><Loader2 className="h-9 w-9 animate-spin text-purple-500" /></div>;

  const list = tab === 'active' ? active : done;
  return (
    <div className="min-h-screen bg-white font-sans text-slate-800 antialiased">
      <Styles />
      <header className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-violet-600 to-indigo-700 px-5 pb-14 pt-6 text-white">
        <div className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-fuchsia-400/30 blur-2xl" />
        <div className="relative mx-auto flex max-w-xl items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-2xl">🛵</div>
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-purple-200">{restaurant}</p><h1 className="truncate font-display text-xl font-bold">Hi, {me.name.split(' ')[0]}</h1></div>
          <button onClick={logout} className="rounded-xl bg-white/15 p-2.5 hover:bg-white/25" aria-label="Log out"><LogOut className="h-5 w-5" /></button>
        </div>
        <div className="relative mx-auto mt-5 flex max-w-xl items-center gap-3">
          <div className="inline-flex flex-1 rounded-2xl bg-white/15 p-1">
            {(['Available', 'Offline'] as const).map((s) => {
              const on = me.status === s || (s === 'Available' && me.status === 'Busy');
              return <button key={s} onClick={() => setStatus(s)} className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition ${on ? 'bg-white text-purple-700 shadow' : 'text-white/80'}`}>{s === 'Available' ? (me.status === 'Busy' ? '🟠 Busy' : '🟢 Online') : '⚫ Offline'}</button>;
            })}
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold ${gps === 'on' ? 'bg-emerald-400/25 text-emerald-100' : 'bg-white/15 text-white/80'}`}><Radio className="h-3.5 w-3.5" /> GPS {gps === 'on' ? 'on' : gps === 'denied' ? 'blocked' : 'idle'}</span>
        </div>
      </header>

      <main className="relative z-10 mx-auto -mt-8 max-w-xl space-y-4 px-4 pb-16">
        <div className="grid grid-cols-3 gap-3">
          {[{ l: 'Active', v: active.length, c: 'text-purple-700' }, { l: 'Done today', v: done.length, c: 'text-emerald-600' }, { l: 'Cash today', v: money(cash), c: 'text-amber-600' }].map((s) => (
            <div key={s.l} className="rounded-2xl bg-white p-3 text-center shadow-lg shadow-purple-500/10 ring-1 ring-purple-100"><p className={`font-display text-xl font-bold ${s.c}`}>{s.v}</p><p className="text-[11px] font-semibold text-slate-500">{s.l}</p></div>
          ))}
        </div>

        {gps === 'denied' && <p className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs font-semibold text-amber-800 ring-1 ring-amber-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> Location is blocked. Allow location in your browser so customers can see you on the map.</p>}

        <div className="inline-flex w-full rounded-2xl bg-purple-50 p-1">
          {(['active', 'done'] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition ${tab === t ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500'}`}>{t === 'active' ? `My orders (${active.length})` : 'Done today'}</button>)}
        </div>

        {list.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-purple-200 bg-gradient-to-b from-purple-50/60 to-white py-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-100 text-purple-500 anim-floaty"><Bike className="h-8 w-8" /></div>
            <p className="mt-3 font-bold text-slate-800">{tab === 'active' ? 'No orders right now' : 'Nothing delivered yet today'}</p>
            <p className="text-sm text-slate-500">{tab === 'active' ? (me.status === 'Offline' ? 'You are offline. Go online to get orders.' : 'New orders will pop up here with a sound.') : ''}</p>
          </div>
        ) : list.map((o) => (
          <article key={o._id} className="overflow-hidden rounded-3xl bg-white shadow-lg shadow-purple-500/5 ring-1 ring-purple-100">
            <div className={`h-1.5 bg-gradient-to-r ${STATUS_META[o.status].bar}`} />
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <p className="font-display text-lg font-bold">{o.orderNo}</p>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${STATUS_META[o.status].chip}`}>{STATUS_META[o.status].label}</span>
              </div>
              <div className="rounded-2xl bg-purple-50/70 p-3">
                <p className="font-bold text-slate-900">{o.customer.name}</p>
                <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-700"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-purple-500" /> <span>{o.customer.address}{o.customer.landmark ? ` (near ${o.customer.landmark})` : ''}{o.customer.area ? ` · ${o.customer.area}` : ''}</span></p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <a href={`tel:${o.customer.phone}`} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-500/20"><Phone className="h-4 w-4" /> Call</a>
                  <a href={mapsLink(o.customer)} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-bold text-purple-700 ring-1 ring-purple-200"><Navigation className="h-4 w-4" /> Navigate</a>
                </div>
              </div>
              <ul className="space-y-1 text-sm">
                {o.items.map((i, idx) => <li key={idx}><b>{i.quantity}×</b> {i.itemName}{i.addons.length > 0 && <span className="text-xs text-purple-600"> + {i.addons.map((a) => a.name).join(', ')}</span>}{i.note && <span className="ml-1 text-xs text-amber-700">({i.note})</span>}</li>)}
              </ul>
              {o.orderNote && <p className="flex items-start gap-1.5 rounded-xl bg-amber-50 p-2.5 text-xs font-medium text-amber-800"><StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {o.orderNote}</p>}
              {o.cashToCollect > 0 ? (
                <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 p-3.5 text-white"><Wallet className="h-6 w-6" /><div><p className="text-xs font-bold opacity-90">Collect cash</p><p className="font-display text-2xl font-bold">{money(o.cashToCollect)}</p></div></div>
              ) : <p className="rounded-xl bg-emerald-50 p-2.5 text-center text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">{o.paymentStatus === 'Paid' ? 'Already paid — no cash to collect ✓' : 'Online payment'}</p>}

              {tab === 'active' && (
                <button disabled={busyId === o._id} onClick={() => move(o, o.status === 'Assigned' ? 'OutForDelivery' : 'Delivered')}
                  className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-white shadow-lg disabled:opacity-60 ${o.status === 'Assigned' ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 shadow-purple-500/30' : 'bg-gradient-to-r from-emerald-500 to-green-600 shadow-emerald-500/30'}`}>
                  {busyId === o._id ? <Loader2 className="h-5 w-5 animate-spin" /> : o.status === 'Assigned' ? <Truck className="h-5 w-5" /> : <PackageCheck className="h-5 w-5" />}
                  {o.status === 'Assigned' ? 'Picked up — start delivery' : 'Mark as delivered'}
                </button>
              )}
            </div>
          </article>
        ))}
      </main>
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 anim-pop rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-2xl">{toast}</div>}
    </div>
  );
}

function Login({ restaurantKey, onDone }: { restaurantKey: string; onDone: (token: string) => void }) {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`${API_BASE}/api/rider-app/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restaurantKey, phone, pin }) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Login failed.');
      onDone(json.token);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-purple-50 via-white to-indigo-50 p-5 font-sans">
      <Styles />
      <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-purple-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl" />
      <div className="relative w-full max-w-sm anim-pop">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-purple-600 to-indigo-600 text-4xl shadow-xl shadow-purple-500/40 anim-floaty">🛵</div>
        <h1 className="mt-5 text-center font-display text-3xl font-bold text-slate-900">Rider login</h1>
        <p className="mt-1 text-center text-sm text-slate-500">Use the phone number and PIN your manager gave you.</p>
        <div className="mt-6 space-y-4 rounded-3xl bg-white p-5 shadow-xl shadow-purple-500/10 ring-1 ring-purple-100">
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">Phone number</span>
            <div className="relative"><Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="98XXXXXXXX" className="field !pl-10" /></div></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">PIN</span>
            <div className="relative"><KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} type="password" inputMode="numeric" placeholder="••••" onKeyDown={(e) => e.key === 'Enter' && submit()} className="field !pl-10" /></div></label>
          {err && <p className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {err}</p>}
          <button disabled={busy || !phone || !pin} onClick={submit} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 py-3.5 font-bold text-white shadow-lg shadow-purple-500/30 disabled:opacity-50">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Log in
          </button>
        </div>
      </div>
    </div>
  );
}