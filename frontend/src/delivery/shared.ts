// =====================================================================
// DELIVERY — shared helpers used by every delivery page
// (admin pages, customer website, tracking page, rider page)
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export const API_BASE = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');
export const GOOGLE_MAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_KEY || '').trim();

/* ------------------------------ types ------------------------------ */
export type DStatus = 'Pending' | 'Confirmed' | 'Preparing' | 'Ready' | 'Assigned' | 'OutForDelivery' | 'Delivered' | 'Cancelled';

export interface DAddon { name: string; price: number }
export interface DItem { menuItemId: string; itemName: string; itemPrice: number; quantity: number; addons: DAddon[]; note: string; lineTotal: number }
export interface DHistory { status: DStatus; at: string; by?: string; note?: string }

export interface DOrder {
  _id: string;
  restaurantId: string;
  orderNo: string;
  trackingToken: string;
  customer: { name: string; phone: string; address: string; landmark?: string; area?: string; lat: number | null; lng: number | null };
  items: DItem[];
  orderNote?: string;
  subTotal: number;
  deliveryCharge: number;
  totalAmount: number;
  paymentMethod: 'COD' | 'Online';
  paymentStatus: 'Unpaid' | 'Pending' | 'Paid' | 'Refunded';
  paymentRef?: string;
    paymentProvider?: string;
  status: DStatus;
  statusHistory: DHistory[];
  cancelReason?: string;
  riderId?: string;
  riderName?: string;
  riderPhone?: string;
  createdAt: string;
}

export interface DRider {
  _id: string;
  restaurantId?: string;
  name: string;
  phone: string;
  address?: string;
  vehicleType: string;
  vehicleNumber?: string;
  vehicleModel?: string;
  status: 'Available' | 'Busy' | 'Offline';
  isActive: boolean;
  activeOrders?: number;
  lastLocation?: { lat: number | null; lng: number | null; updatedAt: string | null };
}

export interface DArea { _id?: string; name: string; charge: number; minOrder: number; active: boolean }
export interface DSettings {
  acceptingOrders: boolean; acceptCOD: boolean; acceptOnline: boolean; sendToKitchen: boolean;
  onlinePaymentNote: string; baseCharge: number; minOrderAmount: number; freeDeliveryAbove: number;
  radiusKm: number; restaurantLat: number | null; restaurantLng: number | null;
  estimatedPrepMinutes: number; areas: DArea[];
  customerCancelWindow: 'None' | 'Pending' | 'Confirmed' | 'Preparing';
}

// Was this order cancelled by the customer (on the tracking page)?
export const cancelledByCustomer = (o: { status: string; cancelReason?: string }) =>
  o.status === 'Cancelled' && (o.cancelReason || '').startsWith('Customer:');

/* ------------------------- status look & feel ------------------------- */
// (class names are written out in full so Tailwind can find them)
export const STATUS_META: Record<DStatus, { label: string; emoji: string; chip: string; dot: string; bar: string }> = {
  Pending: { label: 'New order', emoji: '🆕', chip: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500', bar: 'from-amber-400 to-orange-500' },
  Confirmed: { label: 'Confirmed', emoji: '✅', chip: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500', bar: 'from-sky-400 to-blue-500' },
  Preparing: { label: 'Preparing', emoji: '👨‍🍳', chip: 'bg-orange-50 text-orange-700 ring-orange-200', dot: 'bg-orange-500', bar: 'from-orange-400 to-rose-500' },
  Ready: { label: 'Ready', emoji: '🥡', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500', bar: 'from-emerald-400 to-teal-500' },
  Assigned: { label: 'Rider assigned', emoji: '🛵', chip: 'bg-indigo-50 text-indigo-700 ring-indigo-200', dot: 'bg-indigo-500', bar: 'from-indigo-400 to-violet-500' },
  OutForDelivery: { label: 'Out for delivery', emoji: '🚀', chip: 'bg-purple-50 text-purple-700 ring-purple-200', dot: 'bg-purple-500', bar: 'from-purple-500 to-fuchsia-500' },
  Delivered: { label: 'Delivered', emoji: '🎉', chip: 'bg-green-50 text-green-700 ring-green-200', dot: 'bg-green-500', bar: 'from-green-400 to-emerald-500' },
  Cancelled: { label: 'Cancelled', emoji: '✖️', chip: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500', bar: 'from-rose-400 to-red-500' },
};
export const ACTIVE_STATUSES: DStatus[] = ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Assigned', 'OutForDelivery'];

export const PAY_META: Record<string, string> = {
  Paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Unpaid: 'bg-slate-100 text-slate-600 ring-slate-200',
  Pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  Refunded: 'bg-rose-50 text-rose-700 ring-rose-200',
};

/* ------------------------------ helpers ------------------------------ */
export const money = (n: number | undefined | null) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function timeAgo(dateStr?: string | null) {
  if (!dateStr) return '';
  const s = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(dateStr).toLocaleString();
}

export const clockTime = (d?: string | null) => (d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

export function mapsLink(c: { address?: string; lat?: number | null; lng?: number | null }) {
  if (c.lat != null && c.lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address || '')}`;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Short "ding" made in the browser (no audio file needed) — same trick as your Notifications page
export function playDing() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    [0, 0.18, 0.36].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = [880, 1175, 1480][i];
      gain.gain.setValueAtTime(0.22, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.4);
    });
  } catch { /* sound not supported */ }
}

/* ------------------- 🔑 WHICH RESTAURANT AM I? ------------------- */
// Same idea your Kitchen Display and Dashboard already use:
// the logged-in restaurant's id is saved in localStorage under "user".
export function getMyRestaurantId(): string {
  for (const key of ['user', 'offlineSessionUser']) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const id = JSON.parse(raw)?.id;
      if (id) return String(id);
    } catch { /* ignore */ }
  }
  return '';
}

// SECOND safety layer on the screen: only keep records whose restaurantId matches the
// logged-in restaurant. (The server ALREADY filters by the login token — this is a backup.)
export function onlyMine<T extends { restaurantId?: string }>(rows: T[]): T[] {
  const mine = getMyRestaurantId();
  if (!mine) return rows;
  return rows.filter((r) => !r.restaurantId || r.restaurantId === mine);
}

/* ------------------------------ API calls ------------------------------ */
// Staff pages: the login token is added automatically by your offlineFetch wrapper.
export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  let json: any = {};
  try { json = await res.json(); } catch { /* not json */ }
  if (!res.ok || json.success === false) throw new Error(json.message || 'Something went wrong. Please try again.');
  return json as T;
}

/* ------------------------------ real-time ------------------------------ */
// Connects to Socket.IO and calls your functions when events arrive.
//   useSocket({ kind:'staff', token }, { 'delivery:order': (d) => ... })
// Returns whether we are connected (pages poll more often when not).
export function useSocket(auth: Record<string, string> | null, handlers: Record<string, (data: any) => void>) {
  const ref = useRef(handlers);
  ref.current = handlers;
  const [connected, setConnected] = useState(false);
  const authKey = auth ? JSON.stringify(auth) : '';
  const events = Object.keys(handlers).join(',');

  useEffect(() => {
    if (!auth) return;
    const socket = io(API_BASE, { auth, transports: ['websocket', 'polling'], reconnection: true, reconnectionDelayMax: 10000 });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    events.split(',').filter(Boolean).forEach((ev) => socket.on(ev, (d: any) => ref.current[ev]?.(d)));
    return () => { socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authKey, events]);

  return connected;
}

export const staffSocketAuth = () => {
  const token = localStorage.getItem('authToken');
  return token ? { kind: 'staff', token } : null;
};