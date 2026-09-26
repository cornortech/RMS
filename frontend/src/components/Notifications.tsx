import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, CheckCheck, Check, Trash2, Volume2, VolumeX, Loader2, Inbox } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');
const REFRESH_EVERY_MS = 5000; // check for new calls every 5 seconds

interface WaiterCall {
  _id: string;
  tableName: string;
  message: string;
  status: 'Pending' | 'Attended';
  attendedBy?: string;
  attendedAt?: string;
  createdAt: string;
}

type Filter = 'Pending' | 'Attended' | 'All';

// "2 min ago" style text
function timeAgo(dateStr: string) {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(dateStr).toLocaleString();
}

// Short "ding" sound made in the browser (no audio file needed)
function playDing() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    [0, 0.18].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = i === 0 ? 880 : 1175;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.4);
    });
  } catch {
    /* sound not supported — ignore */
  }
}

export default function Notifications() {
  const [calls, setCalls] = useState<WaiterCall[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [filter, setFilter] = useState<Filter>('Pending');
  const [loading, setLoading] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [, setTick] = useState(0); // re-render every refresh so "x min ago" stays fresh

  const lastPending = useRef<number | null>(null);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/notifications?status=${filter}`);
      const json = await res.json();
      if (!json.success) return;

      // New call arrived since last check? → ding
      if (lastPending.current !== null && json.pendingCount > lastPending.current && soundRef.current) {
        playDing();
      }
      lastPending.current = json.pendingCount;

      setCalls(json.data);
      setPendingCount(json.pendingCount);
      setTick((t) => t + 1);
    } catch {
      /* network hiccup — try again next round */
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // Load now, then keep refreshing
  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_EVERY_MS);
    return () => clearInterval(id);
  }, [load]);

  // Show the count in the browser tab title, e.g. "(3) Notifications"
  useEffect(() => {
    const original = document.title;
    document.title = pendingCount > 0 ? `(${pendingCount}) 🔔 Waiter calls` : original;
    return () => {
      document.title = original;
    };
  }, [pendingCount]);

  const attend = async (id: string) => {
    await fetch(`${API_BASE}/api/notifications/${id}/attend`, { method: 'PATCH' });
    load();
  };

  const attendAll = async () => {
    await fetch(`${API_BASE}/api/notifications/attend-all`, { method: 'PATCH' });
    load();
  };

  const clearHistory = async () => {
    if (!window.confirm('Delete all attended notifications?')) return;
    await fetch(`${API_BASE}/api/notifications/attended`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Title row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
            <BellRing className="h-6 w-6" />
            {pendingCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Notifications</h1>
            <p className="text-sm text-slate-500">Customer waiter calls from table QR codes</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              setSoundOn((s) => !s);
              if (!soundOn) playDing(); // test sound when turning on (also unlocks audio in the browser)
            }}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
            title={soundOn ? 'Sound on' : 'Sound off'}
          >
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          {pendingCount > 0 && (
            <button
              onClick={attendAll}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <CheckCheck className="h-4 w-4" /> Attend all
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        {(['Pending', 'Attended', 'All'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => {
              setLoading(true);
              setFilter(f);
            }}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              filter === f ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
            }`}
          >
            {f}
            {f === 'Pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
        ))}
        {filter === 'Attended' && calls.length > 0 && (
          <button onClick={clearHistory} className="ml-auto inline-flex items-center gap-1 text-sm text-rose-600 hover:underline">
            <Trash2 className="h-4 w-4" /> Clear history
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : calls.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 py-16 text-slate-500">
          <Inbox className="h-10 w-10 text-slate-300" />
          {filter === 'Pending' ? 'No customers are waiting right now.' : 'Nothing here yet.'}
        </div>
      ) : (
        <div className="space-y-3">
          {calls.map((c) => {
            const pending = c.status === 'Pending';
            return (
              <div
                key={c._id}
                className={`flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ${
                  pending ? 'ring-amber-200 shadow-md shadow-amber-500/10' : 'ring-slate-100'
                }`}
              >
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg ${
                    pending ? 'bg-amber-100 animate-pulse' : 'bg-slate-100'
                  }`}
                >
                  🪑
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900">{c.tableName}</p>
                  <p className="text-sm text-slate-600">{c.message}</p>
                  <p className="text-xs text-slate-400">
                    {timeAgo(c.createdAt)}
                    {!pending && c.attendedBy ? ` · attended by ${c.attendedBy}` : ''}
                  </p>
                </div>
                {pending ? (
                  <button
                    onClick={() => attend(c._id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    <Check className="h-4 w-4" /> Attended
                  </button>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">Done</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}