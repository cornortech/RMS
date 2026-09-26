import React, { useEffect, useState } from 'react';
import { QrCode, Download, Printer, RefreshCw, ExternalLink, Copy, Check, Loader2, AlertCircle } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');

interface TableQr {
  tableId: string;
  tableName: string;
  capacity: number;
  scanUrl: string;
  qrImage: string; // base64 PNG from the backend
}

// Draws a printable card (restaurant name + QR + table name) and returns it as a PNG data URL.
function buildCardImage(restaurantName: string, t: TableQr): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const W = 600;
      const H = 780;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not supported'));

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#7c3aed';
      ctx.lineWidth = 8;
      ctx.strokeRect(12, 12, W - 24, H - 24);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#4c1d95';
      ctx.font = 'bold 34px Arial, sans-serif';
      ctx.fillText(restaurantName, W / 2, 80, W - 60);

      ctx.fillStyle = '#64748b';
      ctx.font = '22px Arial, sans-serif';
      ctx.fillText('Scan for Menu & Call Waiter', W / 2, 118);

      ctx.drawImage(img, 100, 145, 400, 400);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 56px Arial, sans-serif';
      ctx.fillText(t.tableName, W / 2, 630, W - 60);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '18px Arial, sans-serif';
      ctx.fillText('Point your phone camera at the code', W / 2, 700);

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Could not load QR image'));
    img.src = t.qrImage;
  });
}

export default function TableQrManager() {
  const [tables, setTables] = useState<TableQr[]>([]);
  const [restaurantName, setRestaurantName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/table-qr`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load QR codes');
      setTables(json.data);
      setRestaurantName(json.restaurantName || '');
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const downloadOne = async (t: TableQr) => {
    try {
      const url = await buildCardImage(restaurantName, t);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${t.tableName.replace(/[^a-z0-9]+/gi, '_')}_QR.png`;
      a.click();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const printAll = async () => {
    const cards = await Promise.all(tables.map((t) => buildCardImage(restaurantName, t)));
    const win = window.open('', '_blank');
    if (!win) {
      setError('Please allow pop-ups to print.');
      return;
    }
    win.document.write(`
      <html><head><title>Table QR Codes</title>
      <style>
        body { margin: 0; font-family: Arial, sans-serif; }
        .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; padding: 16px; }
        img { width: 100%; page-break-inside: avoid; }
      </style></head>
      <body><div class="grid">${cards.map((c) => `<img src="${c}" />`).join('')}</div>
      <script>window.onload = () => { window.print(); }</script>
      </body></html>`);
    win.document.close();
  };

  const copyLink = async (t: TableQr) => {
    try {
      await navigator.clipboard.writeText(t.scanUrl);
      setCopiedId(t.tableId);
      setTimeout(() => setCopiedId(''), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Generating QR codes…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <QrCode className="h-5 w-5 text-purple-600" />
          <span>
            <b className="text-slate-900">{tables.length}</b> table{tables.length === 1 ? '' : 's'} ·{' '}
            {tables.length} QR code{tables.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          {tables.length > 0 && (
            <button
              onClick={printAll}
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-700"
            >
              <Printer className="h-4 w-4" /> Print all
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {tables.length === 0 && !error && (
        <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-slate-500">
          No tables yet. Add tables on the <b>Tables</b> page and their QR codes will appear here automatically.
        </div>
      )}

      {/* QR cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tables.map((t) => (
          <div key={t.tableId} className="flex flex-col items-center rounded-2xl border border-purple-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-purple-600">{restaurantName}</p>
            <img src={t.qrImage} alt={`QR for ${t.tableName}`} className="my-2 h-44 w-44" />
            <p className="text-lg font-bold text-slate-900">{t.tableName}</p>
            <p className="mb-3 text-xs text-slate-500">{t.capacity} seats</p>

            <div className="flex w-full gap-2">
              <button
                onClick={() => downloadOne(t)}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-purple-50 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-100"
              >
                <Download className="h-3.5 w-3.5" /> Download
              </button>
              <button
                onClick={() => copyLink(t)}
                title="Copy link"
                className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600 hover:bg-slate-100"
              >
                {copiedId === t.tableId ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <a
                href={t.scanUrl}
                target="_blank"
                rel="noreferrer"
                title="Test: open what the customer sees"
                className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600 hover:bg-slate-100"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}