import React, { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Phone, MapPin, Bike, ChefHat, PartyPopper, Ban, ReceiptText, AlertCircle, Store, ClipboardCheck, Wifi, X, HeartCrack, ShoppingBag } from 'lucide-react';
import { API_BASE, money, clockTime, useSocket, type DStatus, type DItem } from '../../delivery/shared';
import MapView from '../../delivery/MapView';
import PayQr from '../../delivery/PayQr';
import { Styles } from './OnlineOrder';

// =====================================================================
// CUSTOMER TRACKING PAGE        address:  /track/<trackingToken>
// The secret tracking code in the link is the "password" for this one order.
// =====================================================================
interface Tracked {
  orderNo: string; trackingToken: string; status: DStatus; history: { status: DStatus; at: string }[];
  restaurant?: { name: string; phone: string; location: string; key?: string };
  cancelWindow?: 'None' | 'Pending' | 'Confirmed' | 'Preparing';
  customer: { name: string; address: string; area: string; lat: number | null; lng: number | null };
  items: DItem[]; subTotal: number; deliveryCharge: number; totalAmount: number;
  paymentMethod: 'COD' | 'Online'; paymentStatus: string; cancelReason: string;
  rider: { name: string; phone: string } | null;
  riderLocation: { lat: number; lng: number; updatedAt: string } | null;
  etaMinutes: number; createdAt: string;
}

// The 6 steps the customer sees. `at` = which status time to show under each step.
const STEPS: { label: string; sub: string; icon: React.ElementType; at?: DStatus }[] = [
  { label: 'Order placed', sub: 'We got your order', icon: ReceiptText },
  { label: 'Order confirmed', sub: 'The restaurant accepted it', icon: ClipboardCheck, at: 'Confirmed' },
  { label: 'Preparing your food', sub: 'The kitchen is cooking', icon: ChefHat, at: 'Preparing' },
  { label: 'Rider assigned', sub: 'A rider will pick it up', icon: Bike, at: 'Assigned' },
  { label: 'Out for delivery', sub: 'On the way to you', icon: Store, at: 'OutForDelivery' },
  { label: 'Delivered', sub: 'Enjoy your meal!', icon: PartyPopper, at: 'Delivered' },
];
const REACHED: Record<DStatus, number> = { Pending: 0, Confirmed: 1, Preparing: 2, Ready: 2, Assigned: 3, OutForDelivery: 4, Delivered: 5, Cancelled: 0 };

const HERO: Record<DStatus, { title: string; text: string; bg: string; emoji: string }> = {
  Pending: { title: 'Waiting for the restaurant', text: 'Your order was sent. We’ll update this page as soon as it is accepted.', bg: 'from-amber-500 to-orange-500', emoji: '⏳' },
  Confirmed: { title: 'Order confirmed!', text: 'The restaurant accepted your order and will start cooking shortly.', bg: 'from-sky-500 to-indigo-600', emoji: '✅' },
  Preparing: { title: 'Cooking your food', text: 'Your meal is being freshly prepared.', bg: 'from-orange-500 to-rose-500', emoji: '👨‍🍳' },
  Ready: { title: 'Your food is ready', text: 'Packed and waiting for a rider to pick it up.', bg: 'from-emerald-500 to-teal-500', emoji: '🥡' },
  Assigned: { title: 'Rider assigned', text: 'Your rider is picking up your order.', bg: 'from-indigo-500 to-violet-600', emoji: '🛵' },
  OutForDelivery: { title: 'On the way!', text: 'Your rider is heading to your address.', bg: 'from-purple-600 to-fuchsia-600', emoji: '🚀' },
  Delivered: { title: 'Delivered', text: 'Thank you for ordering. Enjoy your meal!', bg: 'from-emerald-500 to-green-600', emoji: '🎉' },
  Cancelled: { title: 'Order cancelled', text: 'This order was cancelled.', bg: 'from-rose-500 to-red-600', emoji: '✖️' },
};

// Which statuses the customer may cancel from (the server enforces the same rule)
const CANCEL_WINDOWS: Record<string, DStatus[]> = {
  None: [],
  Pending: ['Pending'],
  Confirmed: ['Pending', 'Confirmed'],
  Preparing: ['Pending', 'Confirmed', 'Preparing'],
};
const CANCEL_REASONS = ['Ordered by mistake', 'Taking too long', 'Want to change my order', 'Found another option', 'Other'];

const readToken = () => window.location.pathname.split('/').filter(Boolean)[1] || '';

export default function TrackOrder() {
  const token = readToken();
  const [o, setO] = useState<Tracked | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [refundNote, setRefundNote] = useState(false);

  // Merge an update, keeping what the small live message doesn't contain
  const merge = (u: Tracked) => setO((prev) => (prev ? { ...prev, ...u, restaurant: u.restaurant || prev.restaurant, riderLocation: u.riderLocation || prev.riderLocation } : u));

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/online/track/${token}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Order not found.');
      merge(json.data); setError('');
    } catch (e: any) { setError((prev) => prev || e.message); setO((p) => p); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const connected = useSocket({ kind: 'customer', trackingToken: token }, {
    'delivery:update': (u: Tracked) => merge(u),
    'delivery:location': (loc: { lat: number; lng: number; updatedAt: string }) => setO((p) => (p ? { ...p, riderLocation: loc } : p)),
  });
  useEffect(() => {
    const done = o?.status === 'Delivered' || o?.status === 'Cancelled';
    if (done) return;
    const id = setInterval(load, connected ? 45000 : 10000);
    return () => clearInterval(id);
  }, [connected, load, o?.status]);

  useEffect(() => { if (o) document.title = `${HERO[o.status].emoji} ${o.orderNo} · ${HERO[o.status].title}`; }, [o?.status, o?.orderNo]);

  const cancel = async (reason: string) => {
    setCancelling(true); setCancelError('');
    try {
      const res = await fetch(`${API_BASE}/api/online/track/${token}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      merge(json.data);
      setRefundNote(!!json.needsRefund);
      setCancelOpen(false);
    } catch (e: any) { setCancelError(e.message || 'Could not cancel. Please try again.'); load(); } finally { setCancelling(false); }
  };

  if (loading) return <Wrap><Loader2 className="h-9 w-9 animate-spin text-purple-500" /></Wrap>;
  if (!o) return (
    <Wrap>
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-500"><AlertCircle className="h-8 w-8" /></div>
      <h1 className="mt-4 font-display text-xl font-bold">Order not found</h1>
      <p className="mt-1 max-w-xs text-center text-sm text-slate-500">{error || 'Please check your tracking link.'}</p>
    </Wrap>
  );

  const hero = HERO[o.status];
  const reached = REACHED[o.status];
  const cancelled = o.status === 'Cancelled';
  const timeFor = (s?: DStatus) => clockTime(o.history.find((h) => h.status === s)?.at);
  const showMap = o.status === 'Assigned' || o.status === 'OutForDelivery';
  const canCancel = (CANCEL_WINDOWS[o.cancelWindow || 'Confirmed'] || []).includes(o.status);
  const inProgress = o.status !== 'Delivered' && o.status !== 'Cancelled';

  return (
    <div className="min-h-screen bg-white font-sans text-slate-800 antialiased">
      <Styles />
      <div className={`relative overflow-hidden bg-gradient-to-br ${hero.bg} px-5 pb-20 pt-8 text-white`}>
        <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-white/15 blur-2xl" />
        <div className="relative mx-auto max-w-xl">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="rounded-full bg-white/20 px-3 py-1">{o.orderNo}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1"><Wifi className="h-3 w-3" /> {connected ? 'Live' : 'Auto-refresh'}</span>
          </div>
          <div className="mt-5 flex items-center gap-4">
            <span className="text-6xl anim-floaty">{hero.emoji}</span>
            <div>
              <h1 className="font-display text-3xl font-bold leading-tight">{hero.title}</h1>
              <p className="mt-1 text-sm text-white/90">{cancelled && o.cancelReason ? (o.cancelReason.startsWith('Customer:') ? 'You cancelled this order.' : `Reason: ${o.cancelReason}`) : hero.text}</p>
            </div>
          </div>
          {!cancelled && o.status !== 'Delivered' && <p className="mt-4 text-sm font-semibold text-white/90">Estimated arrival: about {o.etaMinutes} min from order time ({clockTime(new Date(new Date(o.createdAt).getTime() + o.etaMinutes * 60000).toISOString())})</p>}
        </div>
      </div>

      <main className="relative z-10 mx-auto -mt-12 max-w-xl space-y-4 px-4 pb-16">
        {/* progress */}
        {!cancelled && (
          <section className="rounded-3xl bg-white p-5 shadow-xl shadow-purple-500/10 ring-1 ring-purple-100">
            <ol>
              {STEPS.map((st, i) => {
                const done = i <= reached;
                const current = i === reached;
                const last = i === STEPS.length - 1;
                return (
                  <li key={st.label} className="relative flex gap-4 pb-6 last:pb-0">
                    {!last && <span className={`absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-0.5 ${i < reached ? 'bg-purple-500' : 'bg-slate-200'}`} />}
                    <span className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${done ? 'bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/30' : 'bg-slate-100 text-slate-400'}`}>
                      {current && o.status !== 'Delivered' && <span className="absolute inset-0 rounded-full bg-purple-400/40 anim-pulse-ring" />}
                      {done && !current ? <Check className="h-5 w-5" /> : <st.icon className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0 flex-1 pt-1">
                      <p className={`font-bold ${done ? 'text-slate-900' : 'text-slate-400'}`}>
                        {st.label}{i === 2 && o.status === 'Ready' ? ' · food ready' : ''}
                      </p>
                      <p className="text-xs text-slate-500">{current && o.status === 'Ready' && i === 2 ? 'Packed — waiting for a rider' : st.sub}</p>
                    </div>
                    <span className="pt-1 text-xs font-semibold text-slate-400">{i === 0 ? clockTime(o.createdAt) : timeFor(st.at)}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {/* rider */}
        {o.rider && !cancelled && (
          <section className="flex items-center gap-4 rounded-3xl bg-gradient-to-r from-indigo-50 to-purple-50 p-4 ring-1 ring-indigo-100">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-2xl text-white shadow-lg">🛵</div>
            <div className="min-w-0 flex-1"><p className="text-xs font-bold text-indigo-500">Your rider</p><p className="truncate font-display text-lg font-bold text-slate-900">{o.rider.name}</p></div>
            <a href={`tel:${o.rider.phone}`} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/30" aria-label="Call rider"><Phone className="h-5 w-5" /></a>
          </section>
        )}

        {showMap && (
          <section className="rounded-3xl bg-white p-3 ring-1 ring-purple-100">
            <p className="mb-2 flex items-center gap-2 px-2 pt-1 text-sm font-bold text-slate-800"><MapPin className="h-4 w-4 text-purple-600" /> {o.status === 'OutForDelivery' ? 'Live location' : 'Delivery location'}</p>
            <MapView customer={o.customer} rider={o.status === 'OutForDelivery' ? o.riderLocation : null} height={260} />
            {o.status === 'OutForDelivery' && !o.riderLocation && <p className="px-2 pb-1 pt-2 text-xs text-slate-500">Waiting for the rider’s GPS signal…</p>}
          </section>
        )}

        {/* payment */}
        {o.paymentMethod === 'Online' && o.paymentStatus !== 'Paid' && !cancelled && <PayQr token={o.trackingToken} />}

        {/* summary */}
        <section className="rounded-3xl bg-white p-5 ring-1 ring-purple-100">
          <h2 className="font-display text-lg font-bold">Order summary</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {o.items.map((i, idx) => (
              <li key={idx} className="flex justify-between gap-3 py-2.5 text-sm">
                <span><b>{i.quantity}×</b> {i.itemName}{i.addons?.length > 0 && <span className="block text-xs text-purple-600">+ {i.addons.map((a) => a.name).join(', ')}</span>}{i.note && <span className="block text-xs text-amber-700">“{i.note}”</span>}</span>
                <span className="font-semibold">{money(i.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 space-y-1 border-t border-slate-100 pt-3 text-sm">
            <div className="flex justify-between text-slate-500"><span>Items</span><span>{money(o.subTotal)}</span></div>
            <div className="flex justify-between text-slate-500"><span>Delivery</span><span>{o.deliveryCharge ? money(o.deliveryCharge) : 'Free'}</span></div>
            <div className="flex justify-between pt-1 font-display text-xl font-bold"><span>Total</span><span className="text-purple-700">{money(o.totalAmount)}</span></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-purple-50 px-3 py-1.5 text-purple-700 ring-1 ring-purple-200">{o.paymentMethod === 'COD' ? 'Cash on delivery' : 'Online payment'}</span>
            <span className={`rounded-full px-3 py-1.5 ring-1 ${o.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>{o.paymentStatus === 'Paid' ? 'Paid ✓' : o.paymentStatus === 'Refunded' ? 'Refunded' : 'Payment pending'}</span>
          </div>
          <p className="mt-4 flex items-start gap-2 text-xs text-slate-500"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-500" /> {o.customer.address}{o.customer.area ? ` · ${o.customer.area}` : ''}</p>
        </section>

        {/* ---- cancelled: friendly end screen ---- */}
        {cancelled && (
          <section className="rounded-3xl bg-gradient-to-br from-rose-50 to-white p-6 text-center ring-1 ring-rose-100 anim-pop">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-500"><HeartCrack className="h-7 w-7" /></div>
            <h2 className="mt-3 font-display text-xl font-bold text-slate-900">Your order was cancelled</h2>
            <p className="mt-1 text-sm text-slate-500">
              {o.paymentMethod === 'Online' && (refundNote || o.paymentStatus === 'Refunded')
                ? 'You paid online, so the restaurant will contact you about your refund.'
                : 'You have not been charged anything.'}
            </p>
            {o.restaurant?.key && (
              <a href={`/order/${o.restaurant.key}`} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-purple-500/30">
                <ShoppingBag className="h-4 w-4" /> Order again
              </a>
            )}
          </section>
        )}

        {/* ---- cancel button (only while the restaurant allows it) ---- */}
        {inProgress && canCancel && (
          <section className="flex items-center gap-3 rounded-3xl bg-white p-4 ring-1 ring-slate-200">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900">Changed your mind?</p>
              <p className="text-xs text-slate-500">{o.status === 'Pending' ? 'You can cancel for free until the restaurant accepts.' : 'You can still cancel before cooking is finished.'}</p>
            </div>
            <button onClick={() => { setCancelError(''); setCancelOpen(true); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50">
              <Ban className="h-4 w-4" /> Cancel order
            </button>
          </section>
        )}
        {inProgress && !canCancel && (
          <section className="flex items-center gap-3 rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <p className="min-w-0 flex-1 text-xs text-slate-500">This order can no longer be cancelled online. {o.restaurant?.phone ? 'Need help? Call the restaurant.' : ''}</p>
            {o.restaurant?.phone && <a href={`tel:${o.restaurant.phone}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-sm font-bold text-purple-700 ring-1 ring-purple-200"><Phone className="h-4 w-4" /> Call</a>}
          </section>
        )}
        {o.restaurant && (
          <p className="pt-2 text-center text-xs text-slate-500">
            {o.restaurant.name}{o.restaurant.phone && <> · <a className="font-bold text-purple-700" href={`tel:${o.restaurant.phone}`}>Call restaurant</a></>}
          </p>
        )}
      </main>

      {cancelOpen && <CancelSheet status={o.status} busy={cancelling} error={cancelError} onClose={() => !cancelling && setCancelOpen(false)} onConfirm={cancel} />}
    </div>
  );
}

/* ---------------------------- cancel sheet ---------------------------- */
function CancelSheet({ status, busy, error, onClose, onConfirm }: { status: DStatus; busy: boolean; error: string; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [pick, setPick] = useState('');
  const [other, setOther] = useState('');
  const reason = pick === 'Other' ? (other.trim() || 'Other') : pick;
  const accepted = status !== 'Pending';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm anim-fade-in sm:items-center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl anim-pop sm:rounded-3xl" role="dialog" aria-label="Cancel order">
        <div className="flex items-start justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600"><Ban className="h-6 w-6" /></div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <h3 className="mt-3 font-display text-2xl font-bold text-slate-900">Cancel your order?</h3>
        <p className="mt-1 text-sm text-slate-500">
          {accepted ? 'The restaurant has already accepted your order and may have started preparing it. Cancel only if you really have to.' : 'The restaurant has not accepted your order yet, so you can cancel for free.'}
        </p>

        <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-slate-400">Why are you cancelling?</p>
        <div className="flex flex-wrap gap-2">
          {CANCEL_REASONS.map((r) => (
            <button key={r} onClick={() => setPick(r)} className={`rounded-full px-3.5 py-2 text-sm font-semibold ring-1 transition ${pick === r ? 'bg-rose-600 text-white ring-rose-600' : 'bg-white text-slate-600 ring-slate-200 hover:ring-rose-300'}`}>{r}</button>
          ))}
        </div>
        {pick === 'Other' && (
          <textarea value={other} onChange={(e) => setOther(e.target.value)} maxLength={150} rows={2} placeholder="Tell us a little more (optional)" className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-500/10" />
        )}

        {error && <p className="mt-3 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button onClick={onClose} disabled={busy} className="rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-purple-500/25 disabled:opacity-60">Keep my order</button>
          <button disabled={!pick || busy} onClick={() => onConfirm(reason)} className="flex items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-sm font-bold text-rose-600 ring-1 ring-rose-300 hover:bg-rose-50 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Yes, cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const Wrap = ({ children }: { children: React.ReactNode }) => <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6 font-sans"><Styles />{children}</div>;