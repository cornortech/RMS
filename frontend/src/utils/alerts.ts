import { useSyncExternalStore } from 'react';

// =====================================================================
// POP-UP NOTIFICATIONS (like Messenger) + COUNTS FOR THE SIDEBAR
// A pop-up is shown by Windows / Mac / Android when the RMS is open but
// staff can't see it (browser minimized, another tab or another app).
// =====================================================================

export type AlertView = 'notifications' | 'delivery' | 'kitchen';

/* ------------------------------ permission ------------------------------ */
export const popupsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export const popupPermission = (): NotificationPermission | 'unsupported' =>
  popupsSupported() ? Notification.permission : 'unsupported';

// Must be called from a button click (browsers ignore it otherwise)
export async function askPopupPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!popupsSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/* ------------------------------ show a pop-up ------------------------------ */
// True when staff can't see the page right now
export const pageIsHidden = () => document.visibilityState !== 'visible' || !document.hasFocus();

interface PopupOptions {
  title: string;
  body: string;
  tag: string; // same tag = the old pop-up is replaced, not shown twice
  view?: AlertView; // page to open when the pop-up is clicked
}

export async function showPopup({ title, body, tag, view }: PopupOptions) {
  if (popupPermission() !== 'granted') return;
  const options: NotificationOptions = {
    body,
    tag,
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    data: { url: window.location.href, view },
  };

  // Through the service worker: needed on Android, and lets a click open the RMS again
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg?.active) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    /* fall back below */
  }

  // No service worker (e.g. "npm run dev")
  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      if (view) window.dispatchEvent(new CustomEvent('rms-open-view', { detail: view }));
      n.close();
    };
  } catch {
    /* pop-ups not supported here */
  }
}

/* ------------------------------ sidebar counts ------------------------------ */
let counts: Record<AlertView, number> = { notifications: 0, delivery: 0, kitchen: 0 };
const listeners = new Set<() => void>();

export function setAlertCount(view: AlertView, n: number) {
  if (counts[view] === n) return;
  counts = { ...counts, [view]: n };
  listeners.forEach((l) => l());
  setAppIconBadge(counts.notifications + counts.delivery + counts.kitchen);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useAlertCounts = () => useSyncExternalStore(subscribe, () => counts);

// 1, 2, 3 … 9, then 9+
export const badgeText = (n: number) => (n > 9 ? '9+' : String(n));

// Number on the app icon when the RMS is installed (Windows, Mac, Android)
export function setAppIconBadge(n: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (n > 0) nav.setAppBadge?.(n)?.catch(() => {});
    else nav.clearAppBadge?.()?.catch(() => {});
  } catch {
    /* not supported */
  }
}