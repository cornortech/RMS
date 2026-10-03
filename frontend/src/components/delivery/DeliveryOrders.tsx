import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Loader2, Phone, MapPin, X, Check, ChefHat, PackageCheck, Bike, Truck, PartyPopper, Ban,
  CreditCard, Clock3, Inbox, ExternalLink, StickyNote, History, Wifi, WifiOff, UserCheck,
} from 'lucide-react';
import {
  api, onlyMine, useSocket, staffSocketAuth, playDing, money, timeAgo, clockTime, mapsLink,
  STATUS_META, PAY_META, ACTIVE_STATUSES,
  type DOrder, type DRider, type DStatus,
} from '../../delivery/shared';
import MapView from '../../delivery/MapView';

// The ONE next step for each status (what the big button on the card does)
const NEXT: Partial<Record<DStatus, { to: DStatus | 'assign'; label: string; icon: React.ElementType; kitchen?: boolean; cls: string }>> = {
  Pending: { to: 'Confirmed', label: 'Accept order', icon: Check, cls: 'from-emerald-500 to-teal-500' },
  Confirmed: { to: 'Preparing', label: 'Start preparing', icon: ChefHat, kitchen: true, cls: 'from-orange-500 to-rose-500' },
  Preparing: { to: 'Ready', label: 'Mark ready', icon: PackageCheck, kitchen: true, cls: 'from-emerald-500 to-green-500' },
  Ready: { to: 'assign', label: 'Assign rider', icon: Bike, cls: 'from-indigo-500 to-violet-600' },
  Assigned: { to: 'OutForDelivery', label: 'Out for delivery', icon: Truck, cls: 'from-purple-600 to-fuchsia-600' },
  OutForDelivery: { to: 'Delivered', label: 'Complete delivery', icon: PartyPopper, cls: 'from-green-500 to-emerald-600' },
};

const REJECT_REASONS = ['Too busy right now', 'Item out of stock', 'Outside delivery area', 'Restaurant is closing', 'Customer asked to cancel'];

function Pill({ status }: { status: DStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${m.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} /> {m.label}
    </span>
  );
}

export default function DeliveryOrders({ role }: { role: string }) {
  const isKitchen = role === 'Kitchen Staff';
  const [orders, setOrders] = useState<DOrder[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [view, setView] = useState<'active' | 'history'>('active');
  const [filter, setFilter] = useState<DStatus | 'All'>('All');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [openId, setOpenId] = useState('');
  const [reject, setReject] = useState<DOrder | null>(null);
  const [assign, setAssign] = useState<DOrder | null>(null);
  const [toast, setToast] = useState('');
  const seen = useRef<Set<string>>(new Set());

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  const load = useCallback(async () => {
    try {
      const json = await api<{ data: DOrder[]; counts: Record<string, number> }>(`/api/delivery/orders?view=${view}&q=${encodeURIComponent(q.trim())}`);
      const mine = onlyMine(json.data); // 🔑 second safety layer: only this restaurant's orders
      mine.forEach((o) => seen.current.add(o._id));
      setOrders(mine);
      setCounts(json.counts || {});
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [view, q]);

  useEffect(() => { setLoading(true); const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load]);

  // 🔴 LIVE: new orders & changes arrive instantly through Socket.IO
  const connected = useSocket(staffSocketAuth(), {
    'delivery:order': ({ type, order }: { type: string; order: DOrder }) => {
      if (!onlyMine([order]).length) return; // not my restaurant → ignore
      setOrders((prev) => {
        const isActive = ACTIVE_STATUSES.includes(order.status);
        const inView = view === 'active' ? isActive : !isActive;
        const without = prev.filter((o) => o._id !== order._id);
        return inView ? [order, ...without].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)) : without;
      });
      if (type === 'created' && !seen.current.has(order._id)) {
        seen.current.add(order._id);
        playDing();
        flash(`New order ${order.orderNo} from ${order.customer.name}`);
      }
      load(); // refresh the counters
    },
  });

  // If live connection is down, fall back to refreshing every 10 seconds.
  useEffect(() => {
    const id = setInterval(load, connected ? 60000 : 10000);
    return () => clearInterval(id);
  }, [connected, load]);

  const patchStatus = async (o: DOrder, status: DStatus, reason?: string) => {
    setBusyId(o._id);
    try {
      const json = await api<{ data: DOrder }>(`/api/delivery/orders/${o._id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) });
      setOrders((prev) => prev.map((x) => (x._id === o._id ? json.data : x)));
      flash(`${o.orderNo} → ${STATUS_META[status].label}`);
      load();
    } catch (e: any) {
      flash(e.message);
    } finally {
      setBusyId('');
    }
  };

  const markPaid = async (o: DOrder) => {
    try {
      const json = await api<{ data: DOrder }>(`/api/delivery/orders/${o._id}/payment`, { method: 'PATCH', body: JSON.stringify({ paymentStatus: 'Paid' }) });
      setOrders((prev) => prev.map((x) => (x._id === o._id ? json.data : x)));
      flash('Marked as paid');
    } catch (e: any) { flash(e.message); }
  };

  const act = (o: DOrder) => {
    const n = NEXT[o.status];
    if (!n) return;
    if (n.to === 'assign') setAssign(o);
    else patchStatus(o, n.to);
  };

  const shown = useMemo(() => (filter === 'All' ? orders : orders.filter((o) => o.status === filter)), [orders, filter]);
  const open = orders.find((o) => o._id === openId) || null;
  const activeTotal = ACTIVE_STATUSES.reduce((s, k) => s + (counts[k] || 0), 0);

  return (
    <div className="space-y-5">
      {/* top row: view switch + search + live pill */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl bg-purple-50 p-1 ring-1 ring-purple-100">
          {(['active', 'history'] as const).map((v) => (
            <button key={v} onClick={() => { setView(v); setFilter('All'); }}
              className={`rounded-lg px-4 py-1.5 text-sm font-bold transition ${view === v ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-purple-700'}`}>
              {v === 'active' ? `Live orders${activeTotal ? ` (${activeTotal})` : ''}` : 'History'}
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order no, name or phone"
            className="w-full rounded-xl border border-purple-100 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-500/15" />
        </div>
        <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${connected ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
          {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {connected ? 'Live' : 'Refreshing every 10s'}
        </span>
      </div>

      {/* status filter chips with counters */}
      {view === 'active' && (
        <div className="flex gap-2 overflow-x-auto pb-1 thin-scroll">
          <button onClick={() => setFilter('All')} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ring-1 transition ${filter === 'All' ? 'bg-purple-600 text-white ring-purple-600' : 'bg-white text-slate-600 ring-slate-200 hover:ring-purple-300'}`}>
            All <span className="ml-1 opacity-80">{activeTotal}</span>
          </button>
          {ACTIVE_STATUSES.map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`shrink-0 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ring-1 transition ${filter === s ? 'bg-purple-600 text-white ring-purple-600' : 'bg-white text-slate-600 ring-slate-200 hover:ring-purple-300'}`}>
              <span className={`h-2 w-2 rounded-full ${STATUS_META[s].dot}`} /> {STATUS_META[s].label}
              <span className={`min-w-5 rounded-full px-1.5 text-center text-xs ${filter === s ? 'bg-white/25' : 'bg-slate-100'}`}>{counts[s] || 0}</span>
            </button>
          ))}
        </div>
      )}

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-20 text-purple-400"><Loader2 className="h-7 w-7 animate-spin" /></div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-purple-200 bg-gradient-to-b from-purple-50/60 to-white py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-100 text-purple-500 anim-floaty"><Inbox className="h-8 w-8" /></div>
          <p className="font-bold text-slate-800">{view === 'active' ? 'No live delivery orders' : 'No past orders yet'}</p>
          <p className="max-w-sm text-sm text-slate-500">{view === 'active' ? 'New website orders appear here instantly, with a sound. Share your order link from Settings → Share.' : 'Delivered and cancelled orders will be listed here.'}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((o) => {
            const n = NEXT[o.status];
            const canAct = n && (!isKitchen || n.kitchen);
            const meta = STATUS_META[o.status];
            return (
              <div key={o._id} className={`group relative overflow-hidden rounded-3xl bg-white ring-1 transition hover:shadow-xl hover:shadow-purple-500/10 ${o.status === 'Pending' ? 'ring-amber-300 shadow-lg shadow-amber-500/10' : 'ring-purple-100'}`}>
                <div className={`h-1.5 bg-gradient-to-r ${meta.bar}`} />
                <button onClick={() => setOpenId(o._id)} className="block w-full p-4 text-left">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-lg font-bold text-slate-900">{o.orderNo}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3 w-3" /> {timeAgo(o.createdAt)} · {clockTime(o.createdAt)}</p>
                    </div>
                    <Pill status={o.status} />
                  </div>
                  <div className="mt-3 rounded-2xl bg-purple-50/60 p-3">
                    <p className="font-semibold text-slate-900">{o.customer.name}</p>
                    <p className="mt-0.5 flex items-start gap-1 text-xs text-slate-600"><MapPin className="mt-0.5 h-3 w-3 shrink-0 text-purple-500" /> <span className="line-clamp-2">{o.customer.address}{o.customer.area ? ` · ${o.customer.area}` : ''}</span></p>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-slate-600">
                    {o.items.map((i) => `${i.quantity}× ${i.itemName}`).join(', ')}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-display text-xl font-bold text-purple-700">{money(o.totalAmount)}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${PAY_META[o.paymentStatus]}`}>
                      {o.paymentMethod === 'COD' ? 'Cash' : 'Online'} · {o.paymentStatus}
                    </span>
                  </div>
                  {o.riderName && <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-indigo-600"><Bike className="h-3.5 w-3.5" /> {o.riderName}</p>}
                </button>

                <div className="flex gap-2 px-4 pb-4">
                  {canAct && n && (
                    <button disabled={busyId === o._id} onClick={() => act(o)}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r ${n.cls} px-3 py-2.5 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-60`}>
                      {busyId === o._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <n.icon className="h-4 w-4" />} {n.label}
                    </button>
                  )}
                  {o.status === 'Pending' && !isKitchen && (
                    <button onClick={() => setReject(o)} className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-100">Reject</button>
                  )}
                  {!canAct && o.status !== 'Pending' && ACTIVE_STATUSES.includes(o.status) && (
                    <button onClick={() => setOpenId(o._id)} className="flex-1 rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-600 ring-1 ring-slate-200">View details</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <OrderDrawer order={open} isKitchen={isKitchen} onClose={() => setOpenId('')}
          onAct={() => act(open)} onCancel={() => setReject(open)} onReassign={() => setAssign(open)} onPaid={() => markPaid(open)} busy={busyId === open._id} />
      )}
      {reject && <ReasonModal order={reject} onClose={() => setReject(null)} onConfirm={(r) => { patchStatus(reject, 'Cancelled', r); setReject(null); }} />}
      {assign && <RiderPicker order={assign} onClose={() => setAssign(null)} onDone={(o) => { setOrders((p) => p.map((x) => (x._id === o._id ? o : x))); setAssign(null); flash(`Assigned to ${o.riderName}`); load(); }} onError={flash} />}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 anim-pop rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-2xl">{toast}</div>
      )}
    </div>
  );
}

/* ---------------------------- order details ---------------------------- */
function OrderDrawer({ order: o, isKitchen, onClose, onAct, onCancel, onReassign, onPaid, busy }: {
  order: DOrder; isKitchen: boolean; busy: boolean; onClose: () => void; onAct: () => void; onCancel: () => void; onReassign: () => void; onPaid: () => void;
}) {
  const n = NEXT[o.status];
  const canAct = n && (!isKitchen || n.kitchen);
  const final = o.status === 'Delivered' || o.status === 'Cancelled';
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm anim-fade-in" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl anim-slide-right" role="dialog" aria-label={`Order ${o.orderNo}`}>
        <div className={`bg-gradient-to-r ${STATUS_META[o.status].bar} px-6 py-5 text-white`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider opacity-80">Delivery order</p>
              <h2 className="font-display text-2xl font-bold">{o.orderNo}</h2>
              <p className="mt-1 text-sm opacity-90">{STATUS_META[o.status].emoji} {STATUS_META[o.status].label} · {timeAgo(o.createdAt)}</p>
            </div>
            <button onClick={onClose} className="rounded-xl bg-white/20 p-2 hover:bg-white/30" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6 thin-scroll">
          <section className="rounded-2xl bg-purple-50/70 p-4 ring-1 ring-purple-100">
            <p className="text-xs font-bold uppercase tracking-wider text-purple-500">Customer</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{o.customer.name}</p>
            <a href={`tel:${o.customer.phone}`} className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-purple-700 hover:underline"><Phone className="h-4 w-4" /> {o.customer.phone}</a>
            <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-700"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-purple-500" /> <span>{o.customer.address}{o.customer.landmark ? ` (near ${o.customer.landmark})` : ''}{o.customer.area ? ` · ${o.customer.area}` : ''}</span></p>
            <a href={mapsLink(o.customer)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:underline"><ExternalLink className="h-3.5 w-3.5" /> Open in Google Maps</a>
            {o.customer.lat != null && <div className="mt-3"><MapView customer={o.customer} height={190} /></div>}
          </section>

          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Ordered items</p>
            <ul className="divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-100">
              {o.items.map((i, idx) => (
                <li key={idx} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{i.quantity}× {i.itemName}</p>
                    {i.addons?.length > 0 && <p className="text-xs text-purple-600">+ {i.addons.map((a) => a.name).join(', ')}</p>}
                    {i.note && <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-700"><StickyNote className="h-3 w-3" /> {i.note}</p>}
                  </div>
                  <span className="shrink-0 text-sm font-bold text-slate-800">{money(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            {o.orderNote && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200"><b>Order note:</b> {o.orderNote}</p>}
          </section>

          <section className="rounded-2xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between py-1"><span className="text-slate-500">Items</span><span className="font-semibold">{money(o.subTotal)}</span></div>
            <div className="flex justify-between py-1"><span className="text-slate-500">Delivery charge</span><span className="font-semibold">{o.deliveryCharge ? money(o.deliveryCharge) : 'Free'}</span></div>
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 font-display text-lg font-bold text-purple-700"><span>Total</span><span>{money(o.totalAmount)}</span></div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600"><CreditCard className="h-3.5 w-3.5" /> {o.paymentMethod === 'COD' ? 'Cash on Delivery' : 'Online payment'}</span>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${PAY_META[o.paymentStatus]}`}>{o.paymentStatus}</span>
              {!isKitchen && o.paymentStatus !== 'Paid' && o.paymentStatus !== 'Refunded' && o.status !== 'Cancelled' && (
                <button onClick={onPaid} className="ml-auto rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">Mark as paid</button>
              )}
            </div>
          </section>

          {o.riderName && (
            <section className="flex items-center gap-3 rounded-2xl bg-indigo-50 p-4 ring-1 ring-indigo-100">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white"><Bike className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-900">{o.riderName}</p>
                <a href={`tel:${o.riderPhone}`} className="text-sm font-semibold text-indigo-700">{o.riderPhone}</a>
              </div>
              {o.status === 'Assigned' && !isKitchen && <button onClick={onReassign} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 ring-1 ring-indigo-200">Change</button>}
            </section>
          )}

          {o.status === 'Cancelled' && o.cancelReason && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200"><b>Cancelled:</b> {o.cancelReason}</p>}

          <section>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400"><History className="h-3.5 w-3.5" /> Timeline</p>
            <ol className="relative space-y-3 border-l-2 border-purple-100 pl-5">
              {o.statusHistory.map((h, i) => (
                <li key={i} className="relative">
                  <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${STATUS_META[h.status]?.dot || 'bg-slate-400'}`} />
                  <p className="text-sm font-semibold text-slate-800">{STATUS_META[h.status]?.label || h.status}</p>
                  <p className="text-xs text-slate-500">{clockTime(h.at)}{h.by ? ` · ${h.by}` : ''}{h.note ? ` · ${h.note}` : ''}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {!final && (
          <div className="flex gap-2 border-t border-purple-100 bg-white p-4">
            {canAct && n && (
              <button disabled={busy} onClick={onAct} className={`flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r ${n.cls} px-4 py-3 text-sm font-bold text-white shadow-md disabled:opacity-60`}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <n.icon className="h-4 w-4" />} {n.label}
              </button>
            )}
            {!isKitchen && (
              <button onClick={onCancel} className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-100">
                <Ban className="h-4 w-4" /> {o.status === 'Pending' ? 'Reject' : 'Cancel'}
              </button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

/* ---------------------------- reject / cancel ---------------------------- */
function ReasonModal({ order, onClose, onConfirm }: { order: DOrder; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm anim-fade-in" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl anim-pop">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600"><Ban className="h-6 w-6" /></div>
        <h3 className="mt-3 font-display text-xl font-bold text-slate-900">{order.status === 'Pending' ? 'Reject' : 'Cancel'} {order.orderNo}?</h3>
        <p className="mt-1 text-sm text-slate-500">The customer will see this reason on their tracking page.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {REJECT_REASONS.map((r) => (
            <button key={r} onClick={() => setReason(r)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${reason === r ? 'bg-rose-600 text-white ring-rose-600' : 'bg-white text-slate-600 ring-slate-200 hover:ring-rose-300'}`}>{r}</button>
          ))}
        </div>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={200} placeholder="Reason (required)"
          className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-500/10" />
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-200">Keep order</button>
          <button disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())} className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">Confirm</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- assign a rider ---------------------------- */
function RiderPicker({ order, onClose, onDone, onError }: { order: DOrder; onClose: () => void; onDone: (o: DOrder) => void; onError: (m: string) => void }) {
  const [riders, setRiders] = useState<DRider[] | null>(null);
  const [saving, setSaving] = useState('');

  useEffect(() => {
    api<{ data: DRider[] }>('/api/delivery/riders').then((j) => setRiders(onlyMine(j.data).filter((r) => r.isActive))).catch((e) => onError(e.message));
  }, []);

  const pick = async (r: DRider) => {
    setSaving(r._id);
    try {
      const j = await api<{ data: DOrder }>(`/api/delivery/orders/${order._id}/assign`, { method: 'POST', body: JSON.stringify({ riderId: r._id }) });
      onDone(j.data);
    } catch (e: any) { onError(e.message); setSaving(''); }
  };

  const tone: Record<string, string> = { Available: 'bg-emerald-50 text-emerald-700 ring-emerald-200', Busy: 'bg-amber-50 text-amber-700 ring-amber-200', Offline: 'bg-slate-100 text-slate-500 ring-slate-200' };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm anim-fade-in" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl anim-pop">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-xl font-bold text-slate-900">Assign a rider</h3>
            <p className="text-sm text-slate-500">{order.orderNo} · {order.customer.area || order.customer.address.slice(0, 30)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-4 max-h-80 space-y-2 overflow-y-auto thin-scroll">
          {!riders ? (
            <div className="flex justify-center py-10 text-purple-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : riders.length === 0 ? (
            <p className="rounded-xl bg-purple-50 p-4 text-center text-sm text-slate-600">No riders yet. Add riders in the <b>Riders</b> tab first.</p>
          ) : (
            riders.map((r) => (
              <button key={r._id} disabled={r.status === 'Offline' || !!saving} onClick={() => pick(r)}
                className="flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 ring-slate-200 transition hover:ring-purple-400 hover:bg-purple-50/50 disabled:cursor-not-allowed disabled:opacity-50">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
                  {saving === r._id ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserCheck className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900">{r.name}</p>
                  <p className="text-xs text-slate-500">{r.vehicleType}{r.vehicleNumber ? ` · ${r.vehicleNumber}` : ''} · {r.activeOrders || 0} active</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${tone[r.status]}`}>{r.status}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}