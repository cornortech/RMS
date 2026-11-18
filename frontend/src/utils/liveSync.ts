// =====================================================================
// 🔄 LIVE SYNC — pages update by themselves, no F5 needed
//
// 1. One live connection per browser tab (Socket.IO, same as Delivery).
// 2. The server says what changed: { area: "orders" | "bills" | "menu" | "tables" | … }
// 3. Every page that shows that data reloads it QUIETLY (no loading spinner).
// Also reloads when: you come back to the tab, the internet comes back,
// or the live connection reconnects (so nothing is missed while away).
//
// In a page:
//   useLiveRefresh(['orders', 'bills'], () => fetchOrders());
// In a loader that shows a spinner:
//   if (!quietReload()) setLoading(true);
// =====================================================================
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

const API_BASE = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');
const EVENT = 'rms:changed';

let socket: Socket | null = null;
let socketToken = '';
let listening = false;
let quiet = 0;

const fire = (area: string) => window.dispatchEvent(new CustomEvent(EVENT, { detail: { area } }));

/** Starts (or re-starts after a staff login) the live connection. Safe to call many times. */
export function startLiveSync() {
  let token = '';
  try {
    token = localStorage.getItem('authToken') || '';
  } catch {
    /* ignore */
  }
  if (!token) return;
  if (socket && socketToken === token) return;
  stopLiveSync();
  socketToken = token;
  socket = io(API_BASE, {
    auth: { kind: 'staff', token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelayMax: 10000,
  });
  let firstConnect = true;
  socket.on('connect', () => {
    if (!firstConnect) fire('*'); // reconnected → catch up on anything missed
    firstConnect = false;
  });
  socket.on('data:changed', (d: { area?: string }) => fire(String(d?.area || '*')));
  // Events the server already sends
  socket.on('kitchen:order', () => fire('orders'));
  socket.on('delivery:order', () => {
    fire('delivery');
    fire('orders');
    fire('bills');
  });
  socket.on('waiter:call', () => fire('notifications'));
  socket.on('waiter:update', () => fire('notifications'));
  socket.on('features:update', () => fire('features'));

  if (!listening) {
    listening = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') fire('*');
    });
    window.addEventListener('online', () => fire('*'));
  }
}

export function stopLiveSync() {
  if (socket) socket.disconnect();
  socket = null;
  socketToken = '';
}

/** true while a live (background) reload is starting → skip the big loading spinner. */
export const quietReload = () => quiet > 0;

/**
 * Reload this page's data when one of these areas changes.
 * Many changes close together → one reload. Hidden tab → reloads when opened again.
 */
export function useLiveRefresh(areas: string[], reload: () => void) {
  const ref = useRef(reload);
  ref.current = reload;
  const key = areas.join(',');

  useEffect(() => {
    startLiveSync(); // connects with the current login (also after staff login)
    const wanted = key.split(',');
    let timer: number | undefined;
    const onChange = (e: Event) => {
      const area = String((e as CustomEvent).detail?.area || '*');
      if (area !== '*' && !wanted.includes(area)) return;
      if (document.visibilityState === 'hidden') return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        quiet += 1;
        try {
          ref.current();
        } catch {
          /* page will try again next time */
        } finally {
          quiet -= 1;
        }
      }, 350);
    };
    window.addEventListener(EVENT, onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.clearTimeout(timer);
    };
  }, [key]);
}