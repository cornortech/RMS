import React, { useEffect, useState } from 'react';
import { Loader2, GlassWater, CheckCircle2, AlertCircle, Percent } from 'lucide-react';

// =====================================================================
// SETTINGS → FEATURES   (on / off switches for this restaurant)
// =====================================================================
const API_BASE = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');
const FEATURES_URL = `${API_BASE}/api/features`;

interface Features {
  skipBeverageKot: boolean;
  vatEnabled: boolean;
  vatRate: number;
}

const FALLBACK: Features = { skipBeverageKot: false, vatEnabled: false, vatRate: 13 };

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

  const toggle = (key: 'skipBeverageKot' | 'vatEnabled') => save({ [key]: !features?.[key] });

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