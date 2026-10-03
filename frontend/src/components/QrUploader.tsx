import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  QrCode, 
  Upload, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  ShieldCheck, 
  Eye, 
  X 
} from 'lucide-react';

const API = `${(import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '')}/api`;
const PROVIDERS = [ 'eSewa', 'Khalti', 'Fonepay'];

interface QrConfig {
  _id: string;
  providerName: string;
  restaurantName: string;
  restaurantId?: string;
  createdAt?: string;
}

interface PreviewData {
  _id: string;
  providerName: string;
  restaurantName: string;
  image: string;
}

// Renders its children into document.body so position:fixed always
// centers on the real browser viewport — it can no longer be trapped
// by any ancestor's transform/overflow/filter elsewhere on the page.
const ModalPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
};

// Safely extract restaurant details prioritizing RESTAURANTUser and parsed.id ("9898")
const getRestaurantInfo = () => {
  try {
    let id = localStorage.getItem('restaurantId') || localStorage.getItem('restaurant_id');
    let name = localStorage.getItem('restaurantName') || localStorage.getItem('restaurant_name');

    if (!id || !name) {
      const storedUser = 
        localStorage.getItem('RESTAURANTUser') || 
        localStorage.getItem('user') || 
        localStorage.getItem('restaurant');

      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        // Prioritize parsed.id ("9898") over parsed._id
        id = id || parsed.restaurantId || parsed.id || parsed.restaurant?.id;
        name = name || parsed.restaurantName || parsed.restaurant?.name || parsed.name;
      }
    }

    return { 
      id: id || '', 
      name: name || 'My Restaurant' 
    };
  } catch {
    return { id: '', name: 'My Restaurant' };
  }
};

function QrPreviewModal({
  previewData,
  onClose,
}: {
  previewData: PreviewData;
  onClose: () => void;
}) {
  // Escape closes the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lock page scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-sm my-auto rounded-2xl bg-white p-6 text-center shadow-2xl max-h-[min(560px,calc(100vh-48px))] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="mb-4">
            <span className="inline-block rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-600 mb-1">
              Static QR Preview
            </span>
            <h3 className="text-xl font-extrabold text-slate-900">{previewData.providerName}</h3>
            <p className="text-xs text-slate-500">{previewData.restaurantName}</p>
          </div>

          <div className="my-4 flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50 p-4 shadow-inner">
            <img
              src={previewData.image}
              alt={`${previewData.providerName} QR Code`}
              className="h-60 w-60 object-contain rounded-lg bg-white p-2 shadow-sm"
            />
          </div>

          <button
            onClick={onClose}
            className="mt-2 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}

export default function QrManager() {
  const [configs, setConfigs] = useState<QrConfig[]>([]);
  const [providerName, setProviderName] = useState(PROVIDERS[0]);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);

  const getHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('authToken') || localStorage.getItem('token') || ''}`,
  });

  const loadConfigs = useCallback(async () => {
    const { id: currentRestaurantId } = getRestaurantInfo();

    try {
      const url = currentRestaurantId 
        ? `${API}/qr?restaurantId=${encodeURIComponent(currentRestaurantId)}`
        : `${API}/qr`;

      const res = await fetch(url, { headers: getHeaders() });
      const data = await res.json();

      if (data.success) {
        const allConfigs: QrConfig[] = data.data || [];
        
        const filtered = currentRestaurantId
          ? allConfigs.filter((cfg) => !cfg.restaurantId || cfg.restaurantId === currentRestaurantId)
          : allConfigs;

        setConfigs(filtered);
      }
    } catch {
      console.error('Failed to load QR configurations');
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const { id: restaurantId, name: restaurantName } = getRestaurantInfo();

    if (!restaurantId) {
      setMsg({ ok: false, text: 'Restaurant ID not found in LocalStorage. Please log in again.' });
      return;
    }

    setBusy(true);
    setMsg(null);

    try {
      const fd = new FormData();
      fd.append('qr', file);
      fd.append('providerName', providerName || PROVIDERS[0]);
      fd.append('restaurantId', restaurantId); // Sends "9898"
      fd.append('restaurantName', restaurantName); // Sends "local"

      const res = await fetch(`${API}/qr/upload`, {
        method: 'POST',
        headers: getHeaders(),
        body: fd,
      });

      const data = await res.json();
      setMsg({ ok: !!data.success, text: data.message });

      if (data.success) {
        await loadConfigs();
      }
    } catch {
      setMsg({ ok: false, text: 'Could not reach the server.' });
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const onPreview = async (id: string) => {
    try {
      setPreviewLoadingId(id);
      const res = await fetch(`${API}/qr/${id}`, { headers: getHeaders() });
      const data = await res.json();

      if (data.success) {
        setPreviewData(data.data);
      } else {
        setMsg({ ok: false, text: data.message || 'Failed to load QR image preview.' });
      }
    } catch {
      setMsg({ ok: false, text: 'Could not load QR image from server.' });
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const onDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete ${name} QR?`)) return;

    try {
      const res = await fetch(`${API}/qr/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      const data = await res.json();

      if (data.success) {
        setMsg({ ok: true, text: `${name} QR deleted successfully.` });
        await loadConfigs();
      } else {
        setMsg({ ok: false, text: data.message });
      }
    } catch {
      setMsg({ ok: false, text: 'Failed to delete QR configuration.' });
    }
  };

  const currentRest = getRestaurantInfo();

  return (
    <div className="w-full max-w-xl space-y-6">
      <div className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-purple-600" />
            <h3 className="font-extrabold text-slate-900">Configure Payment QRs</h3>
          </div>
          {currentRest.name && (
            <span className="text-[11px] font-medium bg-purple-50 text-purple-700 px-2.5 py-0.5 rounded-full">
              {currentRest.name} (ID: {currentRest.id})
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Upload static QR images for each payment provider. Dynamic bills will use these static templates to embed the order amount.
        </p>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Select Provider
          </label>
          <select
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
            disabled={busy}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-purple-200 bg-purple-50/50 py-6 text-sm font-bold text-purple-700 hover:bg-purple-50 cursor-pointer">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? 'Decoding QR...' : `Upload ${providerName} QR Image`}
          <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={busy} />
        </label>

        {msg && (
          <div
            className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${
              msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
            }`}
          >
            {msg.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{msg.text}</span>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h4 className="font-bold text-slate-900 text-sm mb-3">Active Provider QRs</h4>

        {fetching ? (
          <div className="flex items-center gap-2 text-xs text-slate-400 py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading configurations...
          </div>
        ) : configs.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">No QR codes configured for this restaurant yet.</p>
        ) : (
          <div className="space-y-2">
            {configs.map((cfg) => (
              <div
                key={cfg._id}
                onClick={() => onPreview(cfg._id)}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-3 hover:border-purple-200 hover:bg-purple-50/30 cursor-pointer transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <div>
                    <span className="font-semibold text-slate-800 text-sm">{cfg.providerName}</span>
                    <span className="block text-[10px] text-slate-400">Click to preview QR code</span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreview(cfg._id);
                    }}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-purple-100 hover:text-purple-600 transition-colors"
                    title="View QR Code"
                  >
                    {previewLoadingId === cfg._id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => onDelete(e, cfg._id, cfg.providerName)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="Delete QR"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {previewData && (
        <QrPreviewModal
          previewData={previewData}
          onClose={() => setPreviewData(null)}
        />
      )}
    </div>
  );
}