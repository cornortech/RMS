import React, { useEffect, useState } from 'react';
import { QrCode, Loader2 } from 'lucide-react';
import { API_BASE } from './shared';

// Shows the restaurant's payment QR with the exact amount (uses the QR uploaded in RMS Settings).
export default function PayQr({ token, note }: { token: string; note?: string }) {
  const [img, setImg] = useState<string | null | undefined>(undefined);
  const [provider, setProvider] = useState('');
  useEffect(() => {
    fetch(`${API_BASE}/api/online/track/${token}/pay-qr`)
      .then((r) => r.json())
      .then((j) => { setImg(j.image || null); setProvider(j.providerName || ''); })
      .catch(() => setImg(null));
  }, [token]);

  return (
    <div className="rounded-2xl bg-gradient-to-br from-purple-50 to-white p-4 ring-1 ring-purple-100">
      <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><QrCode className="h-4 w-4 text-purple-600" /> Pay online</p>
      {img === undefined ? <div className="flex justify-center py-6 text-purple-400"><Loader2 className="h-5 w-5 animate-spin" /></div> : img ? (
        <div className="mt-3 flex flex-col items-center">
          <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-purple-100"><img src={img} alt="Payment QR" className="h-48 w-48" /></div>
          <p className="mt-2 text-xs text-slate-500">Scan with {provider || 'your payment app'}. The amount is already filled in.</p>
        </div>
      ) : <p className="mt-2 text-sm text-slate-600">Please follow the payment instructions below.</p>}
      {note && <p className="mt-3 rounded-xl bg-white p-3 text-sm text-slate-700 ring-1 ring-purple-100">{note}</p>}
      <p className="mt-3 text-[11px] text-slate-500">The restaurant confirms your payment manually. Keep your payment screenshot.</p>
    </div>
  );
}