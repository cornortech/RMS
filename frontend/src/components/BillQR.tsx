import React, { useEffect, useRef, useState } from 'react';
import { Loader2, QrCode, RefreshCw, AlertTriangle } from 'lucide-react';

const API = `${(import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '')}/api`;

/** Wallet ids used by CreateBill's payment methods */
export type WalletId = 'eSewa' | 'Khalti' | 'Fonepay';

/** Provider names the /qr/dynamic endpoint expects */
type ProviderName =  'eSewa' | 'Khalti' | 'Fonepay';

const PROVIDERS: ProviderName[] = [ 'eSewa', 'Khalti', 'Fonepay'];

const WALLET_TO_PROVIDER: Record<WalletId, ProviderName> = {
  eSewa: 'eSewa',
  Khalti: 'Khalti',
  Fonepay: 'Fonepay',
};

// Brand colours for the frame, label and loader
const PROVIDER_STYLE: Record<ProviderName, { color: string; soft: string; label: string }> = {
 
  eSewa: { color: '#60BB46', soft: '#EEF8EB', label: 'eSewa' },
  Khalti: { color: '#5C2D91', soft: '#F1EAF8', label: 'Khalti' },
  'Fonepay': { color: '#E11D48', soft: '#FDECF0', label: 'Fonepay' },
};

interface BillQRProps {
  amount: number;
  billNo?: string;
  /** Lock the QR to one wallet and hide the provider tabs (used by CreateBill) */
  method?: WalletId;
  /** Starting tab when `method` is not given */
  defaultProvider?: string;
  /** Optional — if the parent already knows the restaurant id */
  restaurantId?: string;
}

// Resolve the active restaurantId from localStorage
const getStoredRestaurantId = (): string => {
  try {
    let id = localStorage.getItem('restaurantId') || localStorage.getItem('restaurant_id');
    if (!id) {
      const storedUser =
        localStorage.getItem('RESTAURANTUser') ||
        localStorage.getItem('user') ||
        localStorage.getItem('restaurant');

      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        id = parsed.restaurantId || parsed.id || parsed.restaurant?.id || parsed._id;
      }
    }
    return id || '';
  } catch {
    return '';
  }
};

const toProvider = (value?: string): ProviderName =>
  (PROVIDERS as string[]).includes(value || '') ? (value as ProviderName) : '';

export default function BillQR({
  amount,
  billNo,
  method,
  defaultProvider = '',
  restaurantId: propRestaurantId,
}: BillQRProps) {
  const locked = !!method;
  const [pickedProvider, setPickedProvider] = useState<ProviderName>(toProvider(defaultProvider));
  const providerName: ProviderName = method ? WALLET_TO_PROVIDER[method] : pickedProvider;
  const style = PROVIDER_STYLE[providerName];

  const [img, setImg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0);

  const activeRestaurantId = propRestaurantId || getStoredRestaurantId();
  const safeAmount = Number.isFinite(amount) ? Number(amount) : 0;

  useEffect(() => {
    // Clear the old image right away so another wallet's QR is never shown
    setImg('');
    setErr('');

    if (!safeAmount || safeAmount <= 0) {
      setLoading(false);
      return;
    }

    const myRequest = ++requestId.current;
    const controller = new AbortController();
    setLoading(true);

    // Small debounce so typing an amount doesn't fire a request per keystroke
    const t = window.setTimeout(async () => {
      try {
        const token = localStorage.getItem('authToken') || localStorage.getItem('token') || '';

        const res = await fetch(`${API}/qr/dynamic`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            amount: Number(safeAmount.toFixed(2)),
            billNo,
            providerName,
            restaurantId: activeRestaurantId,
          }),
        });

        const data = await res.json();

        // Ignore late answers from an older amount / wallet
        if (myRequest !== requestId.current) return;

        if (data.success) {
          let qrImage = data.image || data.qrDataUrl || data.data || '';
          if (qrImage && !qrImage.startsWith('data:') && !qrImage.startsWith('http')) {
            qrImage = `data:image/png;base64,${qrImage}`;
          }
          setImg(qrImage);
          if (!qrImage) setErr(`No QR returned for ${providerName}.`);
        } else {
          setImg('');
          setErr(data.code === 'NO_QR' ? `Upload your ${providerName} QR in Settings.` : data.message || 'Could not create the QR.');
        }
      } catch (e: any) {
        if (e?.name === 'AbortError' || myRequest !== requestId.current) return;
        setImg('');
        setErr('Could not reach the server.');
      } finally {
        if (myRequest === requestId.current) setLoading(false);
      }
    }, 400);

    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [safeAmount, billNo, providerName, activeRestaurantId, reloadKey]);

  return (
    <div className="mx-auto w-full max-w-xs text-center">
      {/* Provider tabs — only when not locked to one wallet */}
      {!locked && (
        <div
          role="tablist"
          aria-label="Payment provider"
          className="mb-3 flex gap-1 rounded-xl bg-slate-100 p-1 text-[11px] font-semibold"
        >
          {PROVIDERS.map((p) => {
            const active = providerName === p;
            return (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPickedProvider(p)}
                className={`flex-1 cursor-pointer rounded-lg py-1.5 transition-all outline-none focus-visible:ring-4 focus-visible:ring-purple-500/25 ${
                  active ? 'bg-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
                style={active ? { color: PROVIDER_STYLE[p].color } : undefined}
              >
                {p}
              </button>
            );
          })}
        </div>
      )}

      {/* Wallet label */}
      <p
        className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest"
        style={{ color: style.color, backgroundColor: style.soft }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: style.color }} aria-hidden="true" />
        Scan with {style.label}
      </p>

      {/* QR frame */}
      <div
        className="relative mx-auto flex aspect-square w-full max-w-[16rem] items-center justify-center rounded-2xl bg-white p-3"
        style={{ boxShadow: `0 0 0 3px ${style.color}26, 0 10px 30px -12px ${style.color}55` }}
        aria-live="polite"
        aria-busy={loading}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: style.color }} aria-hidden="true" />
            <span className="text-xs font-semibold text-slate-500">Creating {style.label} QR…</span>
          </div>
        ) : img ? (
          <img
            key={`${providerName}-${img.slice(-24)}`}
            src={img}
            alt={`${style.label} payment QR for Rs ${safeAmount.toFixed(2)}`}
            className="h-full w-full rounded-xl object-contain"
          />
        ) : err ? (
          <div className="flex flex-col items-center gap-2 px-4">
            <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden="true" />
            <p className="text-xs font-semibold text-amber-800">{err}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="mt-1 inline-flex cursor-pointer items-center gap-1 rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-800 ring-1 ring-inset ring-amber-200 transition hover:bg-amber-100 outline-none focus-visible:ring-4 focus-visible:ring-amber-500/25"
            >
              <RefreshCw className="h-3 w-3" />
              Try again
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <QrCode className="h-12 w-12 text-slate-200" aria-hidden="true" />
            <span className="text-xs font-semibold text-slate-400">Enter an amount to show the QR</span>
          </div>
        )}

        {/* Corner accents */}
        <span aria-hidden="true" className="pointer-events-none absolute left-1.5 top-1.5 h-5 w-5 rounded-tl-xl border-l-4 border-t-4" style={{ borderColor: style.color }} />
        <span aria-hidden="true" className="pointer-events-none absolute right-1.5 top-1.5 h-5 w-5 rounded-tr-xl border-r-4 border-t-4" style={{ borderColor: style.color }} />
        <span aria-hidden="true" className="pointer-events-none absolute bottom-1.5 left-1.5 h-5 w-5 rounded-bl-xl border-b-4 border-l-4" style={{ borderColor: style.color }} />
        <span aria-hidden="true" className="pointer-events-none absolute bottom-1.5 right-1.5 h-5 w-5 rounded-br-xl border-b-4 border-r-4" style={{ borderColor: style.color }} />
      </div>

      {/* Amount */}
      {safeAmount > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Amount</p>
          <p className="font-mono text-2xl font-black tabular-nums text-slate-900">Rs {safeAmount.toFixed(2)}</p>
        </div>
      )}
    </div>
  );
}