import React, { useEffect, useRef, useState } from 'react';
import { Loader2, QrCode, AlertTriangle, RefreshCw } from 'lucide-react';
import { API_BASE } from './shared';

// Same brand colours as your Create Bill QR (BillQR.tsx)
export const WALLET_STYLE: Record<string, { color: string; soft: string }> = {
  eSewa: { color: '#60BB46', soft: '#EEF8EB' },
  Khalti: { color: '#5C2D91', soft: '#F1EAF8' },
  Fonepay: { color: '#E11D48', soft: '#FDECF0' },
};
export const walletStyle = (name: string) => WALLET_STYLE[name] || { color: '#7c3aed', soft: '#F5F3FF' };

// Dynamic payment QR (exact amount filled in) for an online order.
// The wallet tabs only show wallets the restaurant uploaded a QR for in Settings.
export default function PayQr({ token, note, defaultProvider }: { token: string; note?: string; defaultProvider?: string }) {
  const [providers, setProviders] = useState<string[]>([]);
  const [picked, setPicked] = useState(defaultProvider && defaultProvider !== 'manual' ? defaultProvider : '');
  const [shown, setShown] = useState('');
  const [img, setImg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [reload, setReload] = useState(0);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true); setErr('');
    fetch(`${API_BASE}/api/online/track/${token}/pay-qr${picked ? `?provider=${encodeURIComponent(picked)}` : ''}`)
      .then((r) => r.json())
      .then((j) => {
        if (id !== reqId.current) return; // an older request finished late — ignore it
        setProviders(j.providers || []);
        setImg(j.image || null);
        setShown(j.providerName || '');
      })
      .catch(() => { if (id === reqId.current) setErr('Could not load the QR. Check your internet and try again.'); })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }, [token, picked, reload]);

  const active = picked || shown;
  const st = walletStyle(active);

  return (
    <div className="rounded-2xl bg-gradient-to-br from-purple-50 to-white p-4 ring-1 ring-purple-100">
      <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><QrCode className="h-4 w-4 text-purple-600" /> Pay online</p>

      {/* wallet tabs (same look as the Create Bill page) */}
      {providers.length > 1 && (
        <div role="tablist" aria-label="Payment wallet" className="mt-3 flex gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold">
          {providers.map((p) => {
            const on = active === p;
            return (
              <button key={p} type="button" role="tab" aria-selected={on} onClick={() => setPicked(p)}
                className={`flex-1 rounded-lg py-2 transition-all ${on ? 'bg-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                style={on ? { color: walletStyle(p).color } : undefined}>{p}</button>
            );
          })}
        </div>
      )}

      {providers.length > 0 && (
        <div className="mt-3 text-center">
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest" style={{ color: st.color, backgroundColor: st.soft }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: st.color }} /> Scan with {active}
          </p>
          <div className="relative mx-auto flex aspect-square w-full max-w-[16rem] items-center justify-center rounded-2xl bg-white p-3"
            style={{ boxShadow: `0 0 0 3px ${st.color}26, 0 10px 30px -12px ${st.color}55` }} aria-live="polite" aria-busy={loading}>
            {loading ? (
              <div className="flex flex-col items-center gap-2"><Loader2 className="h-8 w-8 animate-spin" style={{ color: st.color }} /><span className="text-xs font-semibold text-slate-500">Creating {active} QR…</span></div>
            ) : img ? (
              <img key={`${active}-${img.slice(-24)}`} src={img} alt={`${active} payment QR`} className="h-full w-full rounded-xl object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-2 px-4">
                <AlertTriangle className="h-8 w-8 text-amber-500" />
                <p className="text-xs font-semibold text-amber-800">{err || `${active || 'This wallet'} QR is not available right now.`}</p>
                <button type="button" onClick={() => setReload((k) => k + 1)} className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-800 ring-1 ring-inset ring-amber-200 hover:bg-amber-100"><RefreshCw className="h-3 w-3" /> Try again</button>
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">The amount is already filled in. Just scan and pay.</p>
        </div>
      )}

      {!loading && providers.length === 0 && !err && <p className="mt-2 text-sm text-slate-600">The restaurant has not added a payment QR yet. Please follow the instructions below.</p>}
      {note && <p className="mt-3 rounded-xl bg-white p-3 text-sm text-slate-700 ring-1 ring-purple-100">{note}</p>}
      <p className="mt-3 text-[11px] text-slate-500">The restaurant confirms your payment manually. Keep your payment screenshot.</p>
    </div>
  );
}