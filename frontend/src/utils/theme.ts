// =====================================================================
// 🎨 COLOR THEME — each restaurant picks its own main color
//
// How it works (simple):
//   The whole app is styled with Tailwind's purple / violet / indigo / fuchsia colors.
//   Tailwind keeps those colors in CSS variables (--color-purple-600 …).
//   We replace those variables with shades made from the restaurant's color,
//   so EVERY button, link, highlight and badge changes at once — no page code changes.
//
// Saved on the server per restaurant (Settings → Features → Color theme),
// and on this device per restaurant (so it shows at once after login).
// "" = the normal purple theme.
// =====================================================================
import { useCallback, useEffect } from 'react';
import { useLiveRefresh } from './liveSync';

const API_BASE = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');
const KEY = 'rmsTheme';
export const THEME_EVENT = 'rms:theme';
export const DEFAULT_THEME = '';

export const THEME_PRESETS: { name: string; color: string }[] = [
  { name: 'Royal Purple', color: '' },
  { name: 'Ocean Blue', color: '#2563eb' },
  { name: 'Indigo Night', color: '#4f46e5' },
  { name: 'Sky', color: '#0284c7' },
  { name: 'Teal', color: '#0d9488' },
  { name: 'Emerald', color: '#059669' },
  { name: 'Forest', color: '#15803d' },
  { name: 'Sunset Orange', color: '#ea580c' },
  { name: 'Chili Red', color: '#dc2626' },
  { name: 'Rose', color: '#e11d48' },
  { name: 'Pink', color: '#db2777' },
  { name: 'Coffee', color: '#92400e' },
  { name: 'Slate', color: '#475569' },
];

export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/* ---------------- color math (hex → OKLCH, the color space Tailwind uses) ---------------- */
function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
}
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

export function hexToOklch(hex: string) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

/** Contrast of white text on this color (4.5+ = very easy to read, below 3 = hard). */
export function whiteTextContrast(hex: string) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (lum + 0.05);
}

// Tailwind's own shades — used as the "shape" of the new palette
type Shade = [number, number, number]; // L (0-1), C, H
const STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const FAMILIES: Record<string, Shade[]> = {
  purple: [[.977, .014, 308.3], [.946, .033, 307.2], [.902, .063, 306.7], [.827, .119, 306.4], [.714, .203, 305.5], [.627, .265, 303.9], [.558, .288, 302.3], [.496, .265, 301.9], [.438, .218, 303.7], [.381, .176, 305], [.291, .149, 302.7]],
  violet: [[.969, .016, 293.8], [.943, .029, 294.6], [.894, .057, 293.3], [.811, .111, 293.6], [.702, .183, 293.5], [.606, .25, 292.7], [.541, .281, 293], [.491, .27, 292.6], [.432, .232, 292.8], [.38, .189, 293.7], [.283, .141, 291.1]],
  indigo: [[.962, .018, 272.3], [.93, .034, 272.8], [.87, .065, 274], [.785, .115, 274.7], [.673, .182, 276.9], [.585, .233, 277.1], [.511, .262, 277], [.457, .24, 277], [.398, .195, 277.4], [.359, .144, 278.7], [.257, .09, 281.3]],
  fuchsia: [[.977, .017, 320.1], [.952, .037, 318.9], [.903, .076, 319.6], [.833, .145, 321.4], [.74, .238, 322.2], [.667, .295, 322.2], [.591, .293, 322.9], [.518, .253, 323.9], [.452, .211, 324.6], [.401, .17, 325.6], [.293, .136, 325.7]],
};
// How much of the lightness change goes into each shade (light shades stay light)
const L_WEIGHT = [0, 0.1, 0.2, 0.4, 0.7, 0.9, 1, 1, 1, 1, 1];
const BASE_600 = FAMILIES.purple[6];

/** All CSS variables for a theme color (shade 600 = exactly the chosen color). */
export function buildPalette(hex: string): Record<string, string> {
  const t = hexToOklch(hex);
  const dL = t.L - BASE_600[0];
  const k = Math.min(t.C / BASE_600[1], 1.4);
  const dH = t.H - BASE_600[2];
  const vars: Record<string, string> = {};
  for (const [fam, shades] of Object.entries(FAMILIES)) {
    shades.forEach(([L, C, H], i) => {
      const l = Math.min(0.99, Math.max(0.1, L + dL * L_WEIGHT[i]));
      const c = Math.max(0, Math.min(0.37, C * k));
      const h = (((H + dH) % 360) + 360) % 360;
      vars[`--color-${fam}-${STEPS[i]}`] =
        fam === 'purple' && i === 6 ? hex : `oklch(${(l * 100).toFixed(1)}% ${c.toFixed(3)} ${h.toFixed(1)})`;
    });
  }
  return vars;
}

let appliedVars: string[] = [];

/** Paint the whole app with this color ("" = normal purple). */
export function applyTheme(color: string) {
  const root = document.documentElement;
  appliedVars.forEach((v) => root.style.removeProperty(v));
  appliedVars = [];
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!isHex(color)) {
    if (meta) meta.setAttribute('content', '#7c3aed');
    return;
  }
  const vars = buildPalette(color);
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  appliedVars = Object.keys(vars);
  if (meta) meta.setAttribute('content', color);
}

/* ---------------- saved per restaurant ---------------- */
let currentOwner = '';

const readLocal = (owner: string) => {
  if (!owner) return DEFAULT_THEME;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return saved && saved.owner === owner && isHex(saved.color) ? saved.color : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

/** After saving in Settings: remember on this device + repaint now. */
export function setThemeLocal(color: string) {
  const c = isHex(color) ? color : DEFAULT_THEME;
  try {
    if (currentOwner) localStorage.setItem(KEY, JSON.stringify({ owner: currentOwner, color: c }));
  } catch {
    /* ignore */
  }
  applyTheme(c);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: c }));
}

/** The saved theme of the restaurant that is logged in on this tab ('' before login). */
export const currentSavedTheme = () => readLocal(currentOwner);

/** Loads and applies the logged-in restaurant's theme. Logged out → normal purple. */
export function useRestaurantTheme(restaurantKey: string) {
  const owner = String(restaurantKey || '').trim().toLowerCase();

  const load = useCallback(async () => {
    if (!owner) return;
    try {
      const res = await fetch(`${API_BASE}/api/features`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success && currentOwner === owner) setThemeLocal(json.data?.themeColor || '');
    } catch {
      /* offline → keep this device's copy for this restaurant */
    }
  }, [owner]);

  useEffect(() => {
    currentOwner = owner;
    applyTheme(readLocal(owner)); // at once, from this device (only THIS restaurant's copy)
    load();
  }, [owner, load]);

  // Changed on another device of the same restaurant → repaint here too
  useLiveRefresh(['features'], load);
}