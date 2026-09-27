import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { WifiOff, Wifi, RefreshCw, CloudUpload, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { subscribeSync, getSyncState, syncNow, retryFailed, discardFailed, getFailedItems } from './offlineFetch';
import type { OutboxItem } from './db';

// Small status pill in the bottom-right corner:
//  🔴 Offline · 3 changes saved on this device
//  🟡 Syncing 3 changes…
//  🟢 All changes synced
export default function OfflineBanner() {
  const s = useSyncExternalStore(subscribeSync, getSyncState);
  const [justSynced, setJustSynced] = useState(false);
  const [showFailed, setShowFailed] = useState(false);
  const [failedItems, setFailedItems] = useState<OutboxItem[]>([]);

  // Show "All synced ✓" for a few seconds after a sync
  useEffect(() => {
    const onSynced = () => {
      setJustSynced(true);
      setTimeout(() => setJustSynced(false), 4000);
    };
    window.addEventListener('rms:synced', onSynced);
    return () => window.removeEventListener('rms:synced', onSynced);
  }, []);

  const openFailed = async () => {
    setFailedItems(await getFailedItems());
    setShowFailed(true);
  };

  // Nothing to show when online and everything is synced
  if (s.online && s.pending === 0 && s.failed === 0 && !justSynced && !s.needsLogin) return null;

  let tone = 'bg-emerald-600';
  let icon = <CheckCircle2 className="h-4 w-4" />;
  let text = 'All changes synced';

  if (!s.online) {
    tone = 'bg-slate-800';
    icon = <WifiOff className="h-4 w-4" />;
    text = s.pending > 0 ? `Offline · ${s.pending} change${s.pending > 1 ? 's' : ''} saved on this device` : 'Offline · working from saved data';
  } else if (s.needsLogin) {
    tone = 'bg-amber-600';
    icon = <AlertTriangle className="h-4 w-4" />;
    text = `Log in again to sync ${s.pending} change${s.pending > 1 ? 's' : ''}`;
  } else if (s.syncing || s.pending > 0) {
    tone = 'bg-amber-500';
    icon = <RefreshCw className="h-4 w-4 animate-spin" />;
    text = `Syncing ${s.pending} change${s.pending > 1 ? 's' : ''}…`;
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2">
        {s.failed > 0 && (
          <button
            onClick={openFailed}
            className="flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-lg"
          >
            <AlertTriangle className="h-4 w-4" /> {s.failed} change{s.failed > 1 ? 's' : ''} could not sync
          </button>
        )}
        {(s.pending > 0 || !s.online || justSynced || s.needsLogin) && (
          <div className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg ${tone}`}>
            {icon}
            <span>{text}</span>
            {s.online && s.pending > 0 && !s.syncing && (
              <button onClick={syncNow} title="Sync now" className="ml-1 rounded-full bg-white/20 p-1 hover:bg-white/30">
                <CloudUpload className="h-3.5 w-3.5" />
              </button>
            )}
            {!s.online && (
              <button onClick={syncNow} title="Check connection" className="ml-1 rounded-full bg-white/20 p-1 hover:bg-white/30">
                <Wifi className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Failed changes window */}
      {showFailed && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setShowFailed(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Changes that could not sync</h3>
              <button onClick={() => setShowFailed(false)} className="rounded-full p-1 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-sm text-slate-500">
              The server refused these changes. Check them, then retry or discard.
            </p>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {failedItems.map((i) => (
                <div key={i.seq} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <p className="font-semibold text-slate-800">
                    {i.method} {new URL(i.url).pathname}
                  </p>
                  <p className="text-xs text-slate-400">{new Date(i.createdAt).toLocaleString()}</p>
                  <p className="mt-1 text-rose-600">{i.lastError}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={async () => {
                  if (!window.confirm('Delete these changes forever?')) return;
                  await discardFailed();
                  setShowFailed(false);
                }}
                className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
              >
                Discard
              </button>
              <button
                onClick={async () => {
                  await retryFailed();
                  setShowFailed(false);
                }}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}