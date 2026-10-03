import React, { useEffect, useRef, useState } from 'react';
import { Bike, X } from 'lucide-react';
import { useSocket, staffSocketAuth, onlyMine, playDing, money, cancelledByCustomer, type DOrder } from '../../delivery/shared';

// Small pop-up + sound that shows on ANY page of the RMS when a website order arrives.
export default function DeliveryAlerts({ onOpen, currentView }: { onOpen: () => void; currentView: string }) {
  const [toast, setToast] = useState<DOrder | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const viewRef = useRef(currentView);
  viewRef.current = currentView;

  useSocket(staffSocketAuth(), {
    'delivery:order': ({ type, order }: { type: string; order: DOrder }) => {
      const cancelled = type === 'updated' && cancelledByCustomer(order);
      if ((type !== 'created' && !cancelled) || !onlyMine([order]).length) return; // only NEW orders or customer cancellations of MY restaurant
      if (viewRef.current === 'delivery') return; // the Delivery page already shows its own alert
      playDing();
      setToast(order);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setToast(null), 12000);
    },
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!toast) return null;
  return (
    <div className="fixed right-4 top-20 z-[80] w-[min(92vw,360px)] anim-pop">
      <div className="overflow-hidden rounded-2xl bg-white shadow-2xl shadow-purple-500/25 ring-1 ring-purple-200">
        <div className="h-1.5 bg-gradient-to-r from-amber-400 via-purple-500 to-indigo-500" />
        <div className="flex items-start gap-3 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white"><Bike className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className={`font-display font-bold ${toast.status === 'Cancelled' ? 'text-rose-600' : 'text-slate-900'}`}>{toast.status === 'Cancelled' ? '❌ Customer cancelled an order' : 'New delivery order'}</p>
            <p className="truncate text-sm text-slate-600">{toast.orderNo} · {toast.customer.name} · {money(toast.totalAmount)}</p>
            {toast.status === 'Cancelled' && <p className="truncate text-xs text-slate-500">{toast.cancelReason}</p>}
            <button onClick={() => { setToast(null); onOpen(); }} className="mt-2 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-700">View order</button>
          </div>
          <button onClick={() => setToast(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}