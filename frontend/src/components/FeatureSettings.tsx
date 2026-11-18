import React, { useEffect, useState } from 'react';
import {
  Loader2, GlassWater, CheckCircle2, AlertCircle, Percent, ChefHat, Bell,
  PanelLeft, RotateCcw, ShoppingBag, ClipboardList, Bike, LayoutGrid, Flame, Utensils, Boxes,
  FilePlus, Clock, TrendingUp, ShieldCheck, Users, Fingerprint, Palette, Check,
} from 'lucide-react';
import { setHiddenPagesLocal } from '../utils/hiddenPages'; // 🧭 sidebar menu
import { THEME_PRESETS, isHex, applyTheme, setThemeLocal, currentSavedTheme, whiteTextContrast } from '../utils/theme'; // 🎨 color theme
import { popupPermission, askPopupPermission, showPopup } from '../utils/alerts';

// =====================================================================
// SETTINGS → FEATURES   (on / off switches for this restaurant)
// =====================================================================
const API_BASE = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');
const FEATURES_URL = `${API_BASE}/api/features`;

interface Features {
  skipBeverageKot: boolean;
  vatEnabled: boolean;
  vatRate: number;
  kitchenAlerts: boolean;
}

const FALLBACK: Features = { skipBeverageKot: false, vatEnabled: false, vatRate: 13, kitchenAlerts: false };

export default function FeatureSettings() {
  const [features, setFeatures] = useState<Features | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [vatInput, setVatInput] = useState('13');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(FEATURES_URL);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || 'Could not load features.');
        setFeatures({ ...FALLBACK, ...json.data });
        setVatInput(String(json.data?.vatRate ?? 13));
      } catch (e: any) {
        setMessage({ type: 'err', text: e.message || 'Could not load features.' });
        setFeatures(FALLBACK);
      }
    })();
  }, []);

  // Saves only the fields that changed
  const save = async (patch: Partial<Features>) => {
    if (!features || saving) return;
    const next = { ...features, ...patch };
    setFeatures(next); // show the change straight away
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(FEATURES_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'Could not save.');
      setFeatures({ ...FALLBACK, ...json.data });
      setVatInput(String(json.data?.vatRate ?? 13));
      // Create Bill reads this (also works offline)
      try {
        localStorage.setItem('rmsDefaultVat', String(json.data?.vatEnabled ? json.data.vatRate : 0));
      } catch {}
      setMessage({ type: 'ok', text: 'Saved.' });
    } catch (e: any) {
      setFeatures(features); // undo
      setMessage({ type: 'err', text: e.message || 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: 'skipBeverageKot' | 'vatEnabled' | 'kitchenAlerts') => save({ [key]: !features?.[key] });

  const saveVatRate = () => {
    const rate = Number(vatInput);
    if (vatInput.trim() === '' || !Number.isFinite(rate) || rate < 0 || rate > 100) {
      setMessage({ type: 'err', text: 'VAT must be between 0 and 100 %.' });
      return;
    }
    save({ vatRate: rate });
  };

  if (!features) {
    return (
      <div className="flex justify-center py-12 text-purple-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FeatureRow
        icon={GlassWater}
        title="Don't send beverages to the kitchen (KOT)"
        description="When ON: beverage items (menu category “Beverage”) are left out of the KOT and the Kitchen Display. An order with only beverages is not sent to the kitchen at all — it goes straight to Create Bill. Beverages are always on the bill."
        on={features.skipBeverageKot}
        disabled={saving}
        onToggle={() => toggle('skipBeverageKot')}
      />

      <FeatureRow
        icon={Percent}
        title="Add VAT to every bill"
        description="When ON: Create Bill adds this VAT % automatically to every new bill. The cashier can still change it on one bill if needed. VAT is shown on the printed bill, Pending Bills, Delivery Bills and the Dashboard."
        on={features.vatEnabled}
        disabled={saving}
        onToggle={() => toggle('vatEnabled')}
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="vat-rate" className="text-xs font-bold text-slate-600">VAT %</label>
          <div className="relative w-24">
            <input
              id="vat-rate"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              value={vatInput}
              onChange={(e) => setVatInput(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-7 text-sm font-mono outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
          </div>
          <button
            type="button"
            onClick={saveVatRate}
            disabled={saving || Number(vatInput) === features.vatRate}
            className="cursor-pointer rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save VAT %
          </button>
        </div>
      </FeatureRow>

            <FeatureRow
        icon={ChefHat}
        title="Kitchen order notifications"
        description="When ON: Kitchen Staff and Managers get a sound, a message and a pop-up for every new kitchen order, on any page — even when the browser is minimized. Orders with only beverages (when they skip the kitchen) don't notify."
        on={features.kitchenAlerts}
        disabled={saving}
        onToggle={() => toggle('kitchenAlerts')}
      />

      <DevicePopups />

      <SidebarMenuSettings />

      <ColorThemeSettings />

      {message && (
        <p
          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
            message.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          }`}
        >
          {message.type === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </p>
      )}
    </div>
  );
}

// Pop-ups are allowed per browser, so this row is about THIS computer / phone only
function DevicePopups() {
  const [permission, setPermission] = useState(popupPermission());
  const turnOn = async () => setPermission(await askPopupPermission());
  const test = () =>
    showPopup({ title: 'Atithi RMS', body: 'Pop-up notifications are working on this device.', tag: 'rms-test' });

  return (
    <div className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${permission === 'granted' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
        <Bell className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900">Pop-up notifications on this device</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
          New orders and waiter calls show as a pop-up from Windows, Mac or Android when the RMS is minimized. Each computer and phone has to allow it once.
        </p>
        {permission === 'granted' && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">Allowed</span>
            <button type="button" onClick={test} className="cursor-pointer rounded-lg border border-purple-200 px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-50">
              Send a test pop-up
            </button>
          </div>
        )}
        {permission === 'default' && (
          <button type="button" onClick={turnOn} className="mt-2 cursor-pointer rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white hover:bg-purple-500">
            Allow pop-ups on this device
          </button>
        )}
        {permission === 'denied' && (
          <p className="mt-2 text-xs font-semibold text-rose-700">
            Blocked in this browser. Click the lock icon left of the website address → Notifications → Allow, then reload the page.
          </p>
        )}
        {permission === 'unsupported' && (
          <p className="mt-2 text-xs font-semibold text-amber-700">
            This browser can't show pop-ups. On iPhone, first add the RMS to the Home Screen (Share → Add to Home Screen) and open it from there.
          </p>
        )}
      </div>
    </div>
  );
}

function FeatureRow({
  icon: Icon,
  title,
  description,
  on,
  disabled,
  onToggle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>
        <p className={`mt-2 text-[11px] font-bold uppercase tracking-wider ${on ? 'text-purple-700' : 'text-slate-400'}`}>
          {on ? 'ON' : 'OFF'}
        </p>
        {children}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        disabled={disabled}
        onClick={onToggle}
        className={`relative mt-1 inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-60 ${
          on ? 'bg-purple-600' : 'bg-slate-300'
        }`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
    
  );
}



// =====================================================================
// 🧭 SIDEBAR MENU — show / hide pages for this restaurant
//   OFF = the page is hidden from the sidebar for EVERY staff member and can't be opened.
//   Dashboard and Settings are always shown. Default: everything ON.
// =====================================================================
const ROLE_PAGES: Record<string, string[]> = {
  Manager: ['dashboard', 'pos', 'inventory', 'billing', 'staff', 'settings', 'orders', 'tables', 'kitchen', 'createbill', 'totalorder', 'unpaidbill', 'deliverybill', 'stock', 'notifications', 'delivery', 'attendance', 'foodcost'],
  Waiter: ['inventory', 'orders', 'pos', 'notifications', 'delivery'],
  'Kitchen Staff': ['kitchen', 'stock', 'delivery', 'foodcost'],
  Cashier: ['createbill', 'tables', 'billing', 'totalorder', 'unpaidbill', 'deliverybill', 'stock', 'delivery', 'foodcost'],
};

const MENU_GROUPS: { title: string; pages: { key: string; name: string; info: string; icon: React.ElementType }[] }[] = [
  {
    title: 'Operations',
    pages: [
      { key: 'pos', name: 'Create Order', info: 'Waiters take orders', icon: ShoppingBag },
      { key: 'orders', name: 'Orders', info: 'All running orders', icon: ClipboardList },
      { key: 'notifications', name: 'Notifications', info: 'Waiter calls from the table QR', icon: Bell },
      { key: 'delivery', name: 'Delivery', info: 'Online orders and riders', icon: Bike },
      { key: 'tables', name: 'Tables', info: 'Table list and status', icon: LayoutGrid },
      { key: 'kitchen', name: 'Kitchen', info: 'Kitchen Display (KOT)', icon: Flame },
      { key: 'inventory', name: 'Menu', info: 'Menu items, combos, offers', icon: Utensils },
      { key: 'stock', name: 'Stock', info: 'Stock / inventory', icon: Boxes },
    ],
  },
  {
    title: 'Billing',
    pages: [
      { key: 'createbill', name: 'Create Bill', info: 'Make bills for served orders', icon: FilePlus },
      { key: 'unpaidbill', name: 'Pending Bills', info: 'Pay-later bills', icon: Clock },
      { key: 'deliverybill', name: 'Delivery Bills', info: 'Collect from riders', icon: Bike },
      { key: 'totalorder', name: 'Total Sales', info: 'Daily sales list', icon: TrendingUp },
      { key: 'foodcost', name: 'Food Preparation Cost', info: 'Cost and profit', icon: ChefHat },
      { key: 'billing', name: 'Billing & VAT Audit', info: 'All bills, VAT report', icon: ShieldCheck },
    ],
  },
  {
    title: 'Administration',
    pages: [
      { key: 'staff', name: 'Manage Staff', info: 'Add / edit staff', icon: Users },
      { key: 'attendance', name: 'Attendance', info: 'Staff check-in / out', icon: Fingerprint },
    ],
  },
];
const ALL_KEYS = MENU_GROUPS.flatMap((g) => g.pages.map((p) => p.key));

function SidebarMenuSettings() {
  const [hidden, setHidden] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(FEATURES_URL);
        const json = await res.json();
        setHidden(Array.isArray(json?.data?.hiddenPages) ? json.data.hiddenPages : []);
      } catch {
        setHidden([]);
      }
    })();
  }, []);

  // A role must keep at least one page, or that staff would see an empty screen
  const emptyRoles = (list: string[]) =>
    Object.entries(ROLE_PAGES)
      .filter(([, pages]) => !pages.some((p) => p === 'dashboard' || p === 'settings') && pages.every((p) => list.includes(p)))
      .map(([role]) => role);

  const save = async (next: string[]) => {
    if (saving || !hidden) return;
    const lost = emptyRoles(next);
    if (lost.length) {
      setMsg({ ok: false, text: `${lost.join(', ')} would have no pages left. Keep at least one of their pages ON.` });
      return;
    }
    const before = hidden;
    setHidden(next);
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(FEATURES_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hiddenPages: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'Could not save.');
      const saved: string[] = json.data?.hiddenPages || [];
      setHidden(saved);
      setHiddenPagesLocal(saved); // this screen's sidebar changes at once
      setMsg({ ok: true, text: 'Saved. The sidebar is updated for all staff.' });
    } catch (e: any) {
      setHidden(before);
      setMsg({ ok: false, text: e.message || 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  if (!hidden) {
    return (
      <div className="flex justify-center py-8 text-purple-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const shown = ALL_KEYS.filter((k) => !hidden.includes(k)).length;
  const toggle = (key: string) => save(hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]);
  const usedBy = (key: string) => Object.entries(ROLE_PAGES).filter(([, p]) => p.includes(key)).map(([r]) => r);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" id="sidebar-menu-settings">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white">
            <PanelLeft className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-900">Sidebar menu</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              Turn OFF the pages your restaurant doesn't use. They are hidden from the sidebar for all staff. Turn ON to show them again. Dashboard and Settings are always shown.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-purple-600 transition-all" style={{ width: `${(shown / ALL_KEYS.length) * 100}%` }} />
              </div>
              <span className="text-[11px] font-bold text-slate-500">{shown} of {ALL_KEYS.length} pages shown</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => save([])}
          disabled={saving || hidden.length === 0}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-purple-200 px-3 py-2 text-xs font-bold text-purple-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Show all
        </button>
      </div>

      <div className="mt-5 space-y-5">
        {MENU_GROUPS.map((g) => (
          <div key={g.title}>
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400">{g.title}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {g.pages.map((p) => {
                const on = !hidden.includes(p.key);
                const Icon = p.icon;
                return (
                  <button
                    key={p.key}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${p.name}: ${on ? 'shown' : 'hidden'}`}
                    disabled={saving}
                    onClick={() => toggle(p.key)}
                    className={`group flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-all disabled:cursor-wait ${
                      on ? 'border-purple-200 bg-purple-50/50 hover:border-purple-300' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${on ? 'bg-white text-purple-600 ring-1 ring-purple-100' : 'bg-slate-200/70 text-slate-400'}`}>
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm font-bold ${on ? 'text-slate-900' : 'text-slate-400 line-through decoration-slate-300'}`}>{p.name}</span>
                      <span className="block truncate text-[11px] text-slate-500">{p.info} · {usedBy(p.key).join(', ')}</span>
                    </span>
                    <span className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-purple-600' : 'bg-slate-300'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-1'}`} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {msg && (
        <p className={`mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {msg.text}
        </p>
      )}
    </div>
  );
}


// =====================================================================
// 🎨 COLOR THEME — this restaurant's main color (buttons, links, highlights…)
//   Pick a color → the whole app shows it at once (preview). Save → kept for this
//   restaurant on every device. Other restaurants keep their own colors.
// =====================================================================
function ColorThemeSettings() {
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [hexInput, setHexInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const savedRef = React.useRef('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(FEATURES_URL);
        const json = await res.json();
        const c = isHex(json?.data?.themeColor) ? json.data.themeColor : '';
        setSaved(c);
        savedRef.current = c;
        setDraft(c);
        setHexInput(c);
      } catch {
        setSaved('');
      }
    })();
    // Leaving Settings without saving → go back to the saved color
    return () => applyTheme(currentSavedTheme() || savedRef.current);
  }, []);

  const preview = (c: string) => {
    setDraft(c);
    setHexInput(c);
    setMsg(null);
    applyTheme(c); // whole app changes at once so you can see it
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(FEATURES_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themeColor: draft }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'Could not save.');
      const c = json.data?.themeColor || '';
      setSaved(c);
      savedRef.current = c;
      setThemeLocal(c); // remember for this restaurant on this device
      setMsg({ ok: true, text: 'Theme saved. All devices of your restaurant use it now.' });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => preview(saved || '');

  if (saved === null) {
    return (
      <div className="flex justify-center py-8 text-purple-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const changed = draft !== saved;
  const lowContrast = isHex(draft) && whiteTextContrast(draft) < 3;
  const presetMatch = THEME_PRESETS.find((p) => p.color === draft);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" id="color-theme-settings">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white">
          <Palette className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-bold text-slate-900">Color theme</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            Choose your restaurant's main color. Buttons, links, highlights and the sidebar change to it. Tap a color to see it on the whole app, then press Save. Only your restaurant changes.
          </p>
        </div>
      </div>

      {/* Ready-made colors */}
      <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {THEME_PRESETS.map((p) => {
          const on = draft === p.color;
          const swatch = p.color || '#9810fa';
          return (
            <button
              key={p.name}
              type="button"
              onClick={() => preview(p.color)}
              aria-pressed={on}
              className={`group flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-all ${
                on ? 'border-slate-900 bg-slate-50 shadow-sm' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span className="relative flex h-9 w-9 items-center justify-center rounded-full shadow-inner ring-2 ring-white" style={{ background: `linear-gradient(135deg, ${swatch}, ${swatch}cc)` }}>
                {on && <Check className="h-4 w-4 text-white drop-shadow" />}
              </span>
              <span className="w-full truncate text-center text-[11px] font-bold text-slate-700">{p.name}</span>
              {!p.color && <span className="-mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">Default</span>}
            </button>
          );
        })}
      </div>

      {/* Own color */}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3">
        <span className="text-xs font-bold text-slate-600">Your own color</span>
        <input
          type="color"
          aria-label="Pick your own color"
          value={isHex(draft) ? draft : '#9810fa'}
          onChange={(e) => preview(e.target.value.toLowerCase())}
          className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5"
        />
        <input
          value={hexInput}
          onChange={(e) => {
            const v = e.target.value.trim();
            setHexInput(v);
            if (isHex(v)) preview(v.toLowerCase());
          }}
          placeholder="#2563eb"
          maxLength={7}
          aria-label="Color code"
          className="w-28 rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
        />
        <span className="text-[11px] text-slate-400">{presetMatch ? presetMatch.name : isHex(draft) ? 'Custom color' : 'Royal Purple (default)'}</span>
      </div>

      {lowContrast && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0" /> This color is light — white text on buttons may be hard to read. A darker shade is better.
        </p>
      )}

      {/* Preview (uses the real app colors, so it shows exactly what staff will see) */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
        <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400">Preview</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-slate-100">
            <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 px-3 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-purple-500/25">
              <ShoppingBag className="h-[18px] w-[18px]" /> Create Order
            </div>
            <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-600 hover:bg-purple-50/80">
              <ClipboardList className="h-[18px] w-[18px] text-slate-400" /> Orders
            </div>
          </div>
          <div className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-slate-100">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white">Save</span>
              <span className="rounded-lg border border-purple-200 px-3 py-1.5 text-xs font-bold text-purple-700">Cancel</span>
              <span className="rounded-full bg-purple-100 px-2.5 py-1 text-[10px] font-extrabold text-purple-700">NEW</span>
            </div>
            <p className="text-xs text-slate-500">
              Total <b className="font-mono text-purple-700">NPR 1,250</b> · <span className="font-bold text-purple-600 underline">View bill</span>
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-purple-100">
              <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {changed && (
          <button type="button" onClick={cancel} className="cursor-pointer rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!changed || saving}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save theme
        </button>
      </div>

      {msg && (
        <p className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {msg.text}
        </p>
      )}
    </div>
  );
}