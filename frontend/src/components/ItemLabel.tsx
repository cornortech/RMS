import React, { useEffect, useState } from 'react';

// =====================================================================
// 📝 ITEM NAME + DESCRIPTION (same look everywhere)
//
//   <ItemLabel name="Chicken Momo" desc="10 pcs, steamed, with achar" variant="screen" />
//
//   variant: "screen"  → bill preview, pending bills  (name bold, description grey under it)
//            "print"   → printed bill / receipt       (description small + italic, max 90 letters)
//            "kitchen" → Kitchen Display card          (bigger, easy to read from far)
//            "compact" → order cards                   (one short grey line)
//
// useMenuDescriptions() → description of every menu item by name.
// Used when an old order / bill has no description saved, so old ones show it too.
// =====================================================================
const API_BASE = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');

let cache: Record<string, string> | null = null;
let loading: Promise<Record<string, string>> | null = null;

function loadDescriptions(): Promise<Record<string, string>> {
  if (cache) return Promise.resolve(cache);
  if (!loading) {
    loading = fetch(`${API_BASE}/api/menu`)
      .then((r) => r.json())
      .then((json) => {
        const map: Record<string, string> = {};
        (json?.data || []).forEach((m: any) => {
          const d = String(m.description || '').trim();
          if (m.itemName && d) map[String(m.itemName).trim().toLowerCase()] = d;
        });
        cache = map;
        // Menu can change → read it again after 5 minutes
        window.setTimeout(() => {
          cache = null;
          loading = null;
        }, 5 * 60 * 1000);
        return map;
      })
      .catch(() => {
        loading = null;
        return {};
      });
  }
  return loading;
}

export function useMenuDescriptions() {
  const [map, setMap] = useState<Record<string, string>>(cache || {});
  useEffect(() => {
    let alive = true;
    loadDescriptions().then((m) => alive && setMap(m));
    return () => {
      alive = false;
    };
  }, []);
  return map;
}

/** Saved description first; if empty, the menu's description for that name. */
export function pickDescription(map: Record<string, string>, name: string, own?: string | null) {
  const mine = String(own || '').trim();
  if (mine) return mine;
  return map[String(name || '').trim().toLowerCase()] || '';
}

const shorten = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

export default function ItemLabel({
  name,
  desc,
  variant = 'screen',
  className = '',
}: {
  name: string;
  desc?: string | null;
  variant?: 'screen' | 'print' | 'kitchen' | 'compact';
  className?: string;
}) {
  const d = String(desc || '').trim();

  if (variant === 'print') {
    return (
      <span className={`block ${className}`}>
        <span className="block font-black leading-tight">{name}</span>
        {d && <span className="mt-0.5 block text-[10px] font-normal italic leading-snug">{shorten(d, 90)}</span>}
      </span>
    );
  }

  if (variant === 'kitchen') {
    return (
      <span className={`block min-w-0 ${className}`}>
        <span className="block text-base font-medium leading-tight text-gray-800">{name}</span>
        {d && <span className="mt-0.5 block text-xs leading-snug text-gray-500">{shorten(d, 140)}</span>}
      </span>
    );
  }

  if (variant === 'compact') {
    return (
      <span className={`block min-w-0 ${className}`}>
        <span className="block truncate font-medium text-slate-800">{name}</span>
        {d && <span className="block truncate text-[11px] text-slate-400" title={d}>{d}</span>}
      </span>
    );
  }

  return (
    <span className={`block min-w-0 ${className}`}>
      <span className="block font-semibold text-slate-800">{name}</span>
      {d && <span className="mt-0.5 line-clamp-2 block text-xs font-normal leading-snug text-slate-500" title={d}>{d}</span>}
    </span>
  );
}