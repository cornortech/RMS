import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellRing, ChefHat, X } from 'lucide-react';
import { api, useSocket, staffSocketAuth, onlyMine, playDing, money, type DOrder } from '../delivery/shared';
import {
  showPopup, pageIsHidden, setAlertCount, popupsSupported, popupPermission, askPopupPermission, type AlertView,
} from '../utils/alerts';

// =====================================================================
// STAFF ALERTS — works on every page of the RMS
//   Waiter call        → sound + message + pop-up, count on "Notifications"
//   New delivery order → pop-up, count on "Delivery" (sound + message: DeliveryAlerts)
//   New kitchen order  → sound + message + pop-up, count on "Kitchen"
//                        (only when Settings → Features → "Kitchen order notifications" is ON)
// Each staff member only gets the alerts for the pages their role can open.
// =====================================================================

type Lang = 'en' | 'ne';
interface Toast { key: string; title: string; body: string; view: AlertView }

const ASK_LATER_KEY = 'rmsPopupAskLater';

export default function StaffAlerts({
  lang, currentView, canAccess, onOpen,
}: {
  lang: Lang;
  currentView: string;
  canAccess: (view: AlertView) => boolean;
  onOpen: (view: AlertView) => void;
}) {
  const en = lang === 'en';
  const seeWaiter = canAccess('notifications');
  const seeDelivery = canAccess('delivery');
  const seeKitchen = canAccess('kitchen');

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [kitchenOn, setKitchenOn] = useState(false);
  const [permission, setPermission] = useState(popupPermission());
  const [askLater, setAskLater] = useState(() => {
    try { return localStorage.getItem(ASK_LATER_KEY) === '1'; } catch { return false; }
  });

  const viewRef = useRef(currentView);
  viewRef.current = currentView;
  const kitchenOnRef = useRef(kitchenOn);
  kitchenOnRef.current = kitchenOn;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const kitchenUnseen = useRef(0);

  /* ---------- counts ---------- */
  const loadWaiterCount = useCallback(async () => {
    if (!seeWaiter) return;
    try {
      const j = await api<{ pendingCount: number }>('/api/notifications?status=Pending');
      setAlertCount('notifications', j.pendingCount || 0);
    } catch { /* try again next time */ }
  }, [seeWaiter]);

  const loadDeliveryCount = useCallback(async () => {
    if (!seeDelivery) return;
    try {
      const j = await api<{ counts: Record<string, number> }>('/api/delivery/orders?view=active&limit=1');
      setAlertCount('delivery', j.counts?.Pending || 0); // new orders waiting to be accepted
    } catch { /* try again next time */ }
  }, [seeDelivery]);

  const loadFeatures = useCallback(async () => {
    if (!seeKitchen) return;
    try {
      const j = await api<{ data: { kitchenAlerts?: boolean } }>('/api/features');
      setKitchenOn(Boolean(j.data?.kitchenAlerts));
    } catch { /* keep the last value */ }
  }, [seeKitchen]);

  const refreshCounts = useCallback(() => {
    loadWaiterCount();
    loadDeliveryCount();
  }, [loadWaiterCount, loadDeliveryCount]);

  /* ---------- show one alert ---------- */
  const notify = (t: Toast) => {
    // The page itself already plays a sound and shows the list, so only alert on other pages
    if (viewRef.current !== t.view) {
      playDing();
      setToasts((list) => [t, ...list.filter((x) => x.key !== t.key)].slice(0, 3));
      window.setTimeout(() => setToasts((list) => list.filter((x) => x.key !== t.key)), 15000);
    }
    // Browser minimized / another tab or app → pop-up from Windows, Mac or Android
    if (pageIsHidden()) showPopup({ title: t.title, body: t.body, tag: t.key, view: t.view });
  };

  /* ---------- live events from the server ---------- */
  const connected = useSocket(staffSocketAuth(), {
    'waiter:call': (d: { id: string; tableName: string }) => {
      if (!seeWaiter) return;
      loadWaiterCount();
      notify({
        key: `waiter-${d.id}`,
        title: en ? 'Waiter called' : 'वेटर बोलाइयो',
        body: en ? `${d.tableName} is calling a waiter` : `${d.tableName} ले वेटर बोलाउँदै छ`,
        view: 'notifications',
      });
    },
    'waiter:update': () => loadWaiterCount(),
    'kitchen:order': (d: { id: string; tableNumber: string; itemCount: number }) => {
      if (!seeKitchen || !kitchenOnRef.current) return;
      if (viewRef.current !== 'kitchen') {
        kitchenUnseen.current += 1;
        setAlertCount('kitchen', kitchenUnseen.current);
      }
      notify({
        key: `kitchen-${d.id}`,
        title: en ? 'New kitchen order' : 'नयाँ भान्सा अर्डर',
        body: en ? `${d.tableNumber} · ${d.itemCount} item${d.itemCount === 1 ? '' : 's'}` : `${d.tableNumber} · ${d.itemCount} वटा`,
        view: 'kitchen',
      });
    },
    'delivery:order': ({ type, order }: { type: string; order: DOrder }) => {
      if (!seeDelivery) return;
      loadDeliveryCount();
      if (type !== 'created' || !onlyMine([order]).length) return;
      // Sound + message on the page are done by DeliveryAlerts; here only the pop-up
      if (pageIsHidden()) {
        showPopup({
          title: en ? 'New delivery order' : 'नयाँ डेलिभरी अर्डर',
          body: `${order.orderNo} · ${order.customer?.name || ''} · ${money(order.totalAmount)}`,
          tag: `delivery-${order._id}`,
          view: 'delivery',
        });
      }
    },
    'features:update': (f: { kitchenAlerts?: boolean }) => setKitchenOn(Boolean(f?.kitchenAlerts)),
  });

  // Load now, after reconnecting, and every minute as a backup
  useEffect(() => { loadFeatures(); }, [loadFeatures]);
  useEffect(() => {
    refreshCounts();
    const id = window.setInterval(refreshCounts, connected ? 60000 : 20000);
    return () => window.clearInterval(id);
  }, [connected, refreshCounts]);

  // Opening a page clears its "new" count / refreshes the numbers
  useEffect(() => {
    if (currentView === 'kitchen' || !kitchenOn) {
      kitchenUnseen.current = 0;
      setAlertCount('kitchen', 0);
    }
    refreshCounts();
  }, [currentView, kitchenOn, refreshCounts]);

  // Clicking a pop-up opens the right page
  useEffect(() => {
    const open = (v: unknown) => {
      if (v === 'notifications' || v === 'delivery' || v === 'kitchen') onOpenRef.current(v);
    };
    const onMessage = (e: MessageEvent) => { if (e.data?.type === 'rms-open') open(e.data.view); };
    const onWindow = (e: Event) => open((e as CustomEvent).detail);
    navigator.serviceWorker?.addEventListener('message', onMessage);
    window.addEventListener('rms-open-view', onWindow);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onMessage);
      window.removeEventListener('rms-open-view', onWindow);
    };
  }, []);

  // Clear all counts when staff log out
  useEffect(() => () => {
    setAlertCount('notifications', 0);
    setAlertCount('delivery', 0);
    setAlertCount('kitchen', 0);
  }, []);

  const turnOn = async () => setPermission(await askPopupPermission());
  const later = () => {
    setAskLater(true);
    try { localStorage.setItem(ASK_LATER_KEY, '1'); } catch { /* ignore */ }
  };
  const showAsk = popupsSupported() && permission === 'default' && !askLater;

  return (
    <>
      {toasts.length > 0 && (
        <div className="fixed left-1/2 top-4 z-[85] w-[min(92vw,380px)] -translate-x-1/2 space-y-2" aria-live="polite">
          {toasts.map((t) => {
            const Icon = t.view === 'kitchen' ? ChefHat : BellRing;
            return (
              <div key={t.key} className="anim-pop overflow-hidden rounded-2xl bg-white shadow-2xl shadow-purple-500/25 ring-1 ring-purple-200">
                <div className={`h-1.5 bg-gradient-to-r ${t.view === 'kitchen' ? 'from-orange-400 to-rose-500' : 'from-amber-400 to-purple-500'}`} />
                <div className="flex items-start gap-3 p-4">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white ${t.view === 'kitchen' ? 'bg-gradient-to-br from-orange-500 to-rose-500' : 'bg-gradient-to-br from-amber-500 to-purple-600'}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900">{t.title}</p>
                    <p className="truncate text-sm text-slate-600">{t.body}</p>
                    <button
                      onClick={() => { setToasts((list) => list.filter((x) => x.key !== t.key)); onOpen(t.view); }}
                      className="mt-2 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-700"
                    >
                      {en ? 'Open' : 'खोल्नुहोस्'}
                    </button>
                  </div>
                  <button
                    onClick={() => setToasts((list) => list.filter((x) => x.key !== t.key))}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                    aria-label={en ? 'Dismiss' : 'बन्द गर्नुहोस्'}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAsk && (
        <div className="anim-pop fixed bottom-4 left-1/2 z-[55] w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl bg-white p-4 shadow-2xl shadow-purple-500/20 ring-1 ring-purple-200">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
              <Bell className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900">{en ? 'Turn on pop-up notifications' : 'पप-अप सूचना खोल्नुहोस्'}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                {en
                  ? 'Get a pop-up for new orders and waiter calls, even when this window is minimized.'
                  : 'यो विन्डो सानो (minimize) गर्दा पनि नयाँ अर्डर र वेटर कलको पप-अप पाउनुहोस्।'}
              </p>
              <div className="mt-3 flex gap-2">
                <button onClick={turnOn} className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-700">
                  {en ? 'Turn on' : 'खोल्नुहोस्'}
                </button>
                <button onClick={later} className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100">
                  {en ? 'Not now' : 'अहिले होइन'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}