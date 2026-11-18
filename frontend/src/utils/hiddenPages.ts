// =====================================================================
// 🧭 SIDEBAR MENU — which pages this restaurant has switched OFF
// Saved in Settings → Features → Sidebar menu (server: /api/features → hiddenPages).
// Kept on this device too, so the sidebar is right at once (and when offline).
// Dashboard and Settings can never be hidden.
// =====================================================================
import { useCallback, useEffect, useState } from 'react';
import { useLiveRefresh } from './liveSync';

const API_BASE = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');
const KEY = 'rmsHiddenPages';
export const HIDDEN_PAGES_EVENT = 'rms:hidden-pages';
export const ALWAYS_SHOWN = ['dashboard', 'settings'];

const readLocal = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && !ALWAYS_SHOWN.includes(x)) : [];
  } catch {
    return [];
  }
};

/** Call after saving, so THIS screen's sidebar changes at once. */
export function setHiddenPagesLocal(list: string[]) {
  const clean = list.filter((x) => !ALWAYS_SHOWN.includes(x));
  try {
    localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(HIDDEN_PAGES_EVENT, { detail: clean }));
}

/** Hidden pages for the logged-in restaurant. `loginKey` changes → read again. */
export function useHiddenPages(loginKey: string) {
  const [hidden, setHidden] = useState<string[]>(readLocal);

  const load = useCallback(async () => {
    if (!loginKey) return;
    try {
      const res = await fetch(`${API_BASE}/api/features`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success && Array.isArray(json.data?.hiddenPages)) {
        setHiddenPagesLocal(json.data.hiddenPages);
      }
    } catch {
      /* offline → keep what this device has */
    }
  }, [loginKey]);

  useEffect(() => {
    load();
  }, [load]);

  // Changed on another device → update here too (live)
  useLiveRefresh(['features'], load);

  useEffect(() => {
    const h = (e: Event) => setHidden(((e as CustomEvent).detail as string[]) || []);
    window.addEventListener(HIDDEN_PAGES_EVENT, h);
    return () => window.removeEventListener(HIDDEN_PAGES_EVENT, h);
  }, []);

  return hidden;
}