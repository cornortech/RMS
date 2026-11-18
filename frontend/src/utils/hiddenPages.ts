// =====================================================================
// 🧭 SIDEBAR MENU — which pages this restaurant has switched OFF
// Saved in Settings → Features → Sidebar menu (server: /api/features → hiddenPages).
// Kept on this device too (separately for EACH restaurant), so the sidebar is right
// at once and when offline. Another restaurant logging in on the same device never
// sees this restaurant's list. Dashboard and Settings can never be hidden.
// =====================================================================
import { useCallback, useEffect, useState } from 'react';
import { useLiveRefresh } from './liveSync';

const API_BASE = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');
const KEY = 'rmsHiddenPages';
export const HIDDEN_PAGES_EVENT = 'rms:hidden-pages';
export const ALWAYS_SHOWN = ['dashboard', 'settings'];

let currentOwner = ''; // the restaurant that is logged in on this tab

const readLocal = (owner: string): string[] => {
  if (!owner) return [];
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    const list = saved && saved.owner === owner ? saved.list : [];
    return Array.isArray(list) ? list.filter((x: unknown) => typeof x === 'string' && !ALWAYS_SHOWN.includes(x as string)) : [];
  } catch {
    return [];
  }
};

/** Call after saving, so THIS screen's sidebar changes at once. */
export function setHiddenPagesLocal(list: string[]) {
  const clean = list.filter((x) => !ALWAYS_SHOWN.includes(x));
  try {
    if (currentOwner) localStorage.setItem(KEY, JSON.stringify({ owner: currentOwner, list: clean }));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(HIDDEN_PAGES_EVENT, { detail: clean }));
}

/** Hidden pages for the logged-in restaurant. `restaurantKey` = that restaurant's name / id. */
export function useHiddenPages(restaurantKey: string) {
  const owner = String(restaurantKey || '').trim().toLowerCase();
  const [hidden, setHidden] = useState<string[]>(() => readLocal(owner));

  const load = useCallback(async () => {
    if (!owner) return;
    try {
      const res = await fetch(`${API_BASE}/api/features`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success && Array.isArray(json.data?.hiddenPages) && currentOwner === owner) {
        setHiddenPagesLocal(json.data.hiddenPages);
      }
    } catch {
      /* offline → keep what this device has for this restaurant */
    }
  }, [owner]);

  // New login / other restaurant → start from THAT restaurant's own list, then ask the server
  useEffect(() => {
    currentOwner = owner;
    setHidden(readLocal(owner));
    load();
  }, [owner, load]);

  // Changed on another device of the same restaurant → update here too (live)
  useLiveRefresh(['features'], load);

  useEffect(() => {
    const h = (e: Event) => setHidden(((e as CustomEvent).detail as string[]) || []);
    window.addEventListener(HIDDEN_PAGES_EVENT, h);
    return () => window.removeEventListener(HIDDEN_PAGES_EVENT, h);
  }, []);

  return hidden;
}