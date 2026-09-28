import React, { useEffect, useMemo, useState } from 'react';
import {
  Award, CalendarClock, Edit3, Gift, Loader2, Plus, Search, Star, Trash2, Users, X, CheckCircle2, AlertCircle,
} from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');
const LOYALTY_URL = `${API_BASE}/api/loyalty`;

interface Program {
  _id: string;
  name: string;
  reward: string;
  pointsRequired: number;
  completeWithinDays: number;
  description: string;
  memberCount?: number;
  totalActivePoints?: number;
  rewardReadyCount?: number;
}

interface Member {
  _id: string;
  customerName: string;
  customerPhone: string;
  description?: string;
  points: number;
  totalPointsEarned: number;
  joinedAt?: string;
  daysLeft?: number;
  isExpired?: boolean;
  rewardReady?: boolean;
}

const EMPTY_FORM = { name: '', reward: '', pointsRequired: '100', completeWithinDays: '30', description: '' };

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`${LOYALTY_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(res.status === 403 ? 'Only a Manager can do this.' : data.message || 'Something went wrong.');
  }
  return data;
}

const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100';

/* Program form (used for "create" and "edit") */
function ProgramForm({
  value,
  onChange,
}: {
  value: typeof EMPTY_FORM;
  onChange: (v: typeof EMPTY_FORM) => void;
}) {
  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [key]: e.target.value });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-700">🏷️ Program Name *</span>
        <input className={INPUT} value={value.name} onChange={set('name')} placeholder="e.g. Momo Lovers" maxLength={80} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-700">🎁 Reward *</span>
        <input className={INPUT} value={value.reward} onChange={set('reward')} placeholder="e.g. 1 free plate of momo" maxLength={120} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-700">⭐ Points Needed for Reward *</span>
        <input className={INPUT} type="number" min={1} value={value.pointsRequired} onChange={set('pointsRequired')} />
        <span className="mt-1 block text-xs text-slate-500">1 point is given for every Rs. 100 on a bill.</span>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-700">⏳ Complete Within (Days) *</span>
        <input className={INPUT} type="number" min={1} value={value.completeWithinDays} onChange={set('completeWithinDays')} />
        <span className="mt-1 block text-xs text-slate-500">Days a customer has, from joining, to collect the points.</span>
      </label>
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-sm font-semibold text-slate-700">📝 Description</span>
        <textarea className={`${INPUT} min-h-[70px]`} value={value.description} onChange={set('description')} placeholder="Short note about the program (optional)" maxLength={300} />
      </label>
    </div>
  );
}

function formFromProgram(p: Program) {
  return {
    name: p.name,
    reward: p.reward,
    pointsRequired: String(p.pointsRequired),
    completeWithinDays: String(p.completeWithinDays),
    description: p.description || '',
  };
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-3 sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/* Members of one program */
function MembersModal({
  program,
  onClose,
  onChanged,
  notify,
}: {
  program: Program;
  onClose: () => void;
  onChanged: () => void;
  notify: (type: 'success' | 'error', text: string) => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await api(`/programs/${program._id}/members`);
      setMembers(data.data || []);
    } catch (e: any) {
      notify('error', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program._id]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.customerName.toLowerCase().includes(q) || m.customerPhone.includes(q));
  }, [members, search]);

  const giveReward = async (m: Member) => {
    if (!window.confirm(`Give "${program.reward}" to ${m.customerName}?\n${program.pointsRequired} points will be used.`)) return;
    setBusyId(m._id);
    try {
      await api(`/${m._id}/points`, { method: 'PATCH', body: JSON.stringify({ action: 'REDEEM', points: program.pointsRequired }) });
      notify('success', `Reward given to ${m.customerName}.`);
      await load();
      onChanged();
    } catch (e: any) {
      notify('error', e.message);
    } finally {
      setBusyId('');
    }
  };

  const remove = async (m: Member) => {
    if (!window.confirm(`Remove ${m.customerName} from "${program.name}"? Their points will be lost.`)) return;
    setBusyId(m._id);
    try {
      await api(`/${m._id}`, { method: 'DELETE' });
      notify('success', `${m.customerName} removed.`);
      await load();
      onChanged();
    } catch (e: any) {
      notify('error', e.message);
    } finally {
      setBusyId('');
    }
  };

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-purple-50 px-5 py-4">
        <div className="min-w-0">
          <p className="text-lg font-bold text-slate-900">{program.name}</p>
          <p className="mt-0.5 text-sm text-slate-600">
            🎁 {program.reward} · ⭐ {program.pointsRequired} points · ⏳ within {program.completeWithinDays} days
          </p>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-white">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className={`${INPUT} pl-9`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or phone"
          />
        </div>
        <span className="text-sm text-slate-500">
          {members.length} member{members.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex justify-center py-16 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            {members.length === 0
              ? 'No customers have joined yet. Add them from Create Bill or Pending Bill.'
              : 'No customer matches your search.'}
          </div>
        ) : (
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Customer Name</th>
                <th className="px-3 py-3 font-semibold">Phone Number</th>
                <th className="px-3 py-3 font-semibold">Description</th>
                <th className="px-3 py-3 font-semibold">Current Points</th>
                <th className="px-3 py-3 font-semibold">Lifetime Earned</th>
                <th className="px-3 py-3 font-semibold">Time Left</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((m) => {
                const pct = Math.min(100, Math.round(((m.points || 0) / (program.pointsRequired || 1)) * 100));
                return (
                  <tr key={m._id} className="align-top">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900">{m.customerName}</p>
                      {m.joinedAt && (
                        <p className="text-xs text-slate-400">Joined {new Date(m.joinedAt).toLocaleDateString()}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-slate-700">{m.customerPhone}</td>
                    <td className="max-w-[220px] px-3 py-3 text-slate-600">{m.description || '—'}</td>
                    <td className="px-3 py-3">
                      <p className="font-mono font-bold text-slate-900">
                        {m.points} <span className="font-normal text-slate-400">/ {program.pointsRequired}</span>
                      </p>
                      <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full ${m.rewardReady ? 'bg-emerald-500' : 'bg-purple-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                      {m.rewardReady && (
                        <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Reward ready
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-slate-700">{m.totalPointsEarned}</td>
                    <td className="px-3 py-3">
                      {m.isExpired ? (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">Expired</span>
                      ) : (
                        <span className="text-slate-700">{m.daysLeft} days</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        {m.rewardReady && (
                          <button
                            disabled={busyId === m._id}
                            onClick={() => giveReward(m)}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <Gift className="h-3.5 w-3.5" /> Give reward
                          </button>
                        )}
                        <button
                          disabled={busyId === m._id}
                          onClick={() => remove(m)}
                          title="Remove from program"
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Overlay>
  );
}

/* Main screen: Settings → Manage Loyalty */
export default function LoyaltyManager() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [editing, setEditing] = useState<Program | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [opened, setOpened] = useState<Program | null>(null);

  const notify = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 4000);
  };

  const load = async () => {
    try {
      const data = await api('/programs');
      setPrograms(data.data || []);
    } catch (e: any) {
      notify('error', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toBody = (f: typeof EMPTY_FORM) =>
    JSON.stringify({
      name: f.name.trim(),
      reward: f.reward.trim(),
      pointsRequired: Number(f.pointsRequired),
      completeWithinDays: Number(f.completeWithinDays),
      description: f.description.trim(),
    });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await api('/programs', { method: 'POST', body: toBody(form) });
      notify('success', data.message);
      setForm(EMPTY_FORM);
      await load();
    } catch (err: any) {
      notify('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const data = await api(`/programs/${editing._id}`, { method: 'PUT', body: toBody(editForm) });
      notify('success', data.message);
      setEditing(null);
      await load();
    } catch (err: any) {
      notify('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: Program) => {
    const members = p.memberCount || 0;
    const warning = members
      ? `Delete "${p.name}"?\n\n${members} customer(s) and all their points will also be deleted. This can't be undone.`
      : `Delete "${p.name}"?`;
    if (!window.confirm(warning)) return;
    try {
      const data = await api(`/programs/${p._id}`, { method: 'DELETE' });
      notify('success', data.message);
      await load();
    } catch (err: any) {
      notify('error', err.message);
    }
  };

  return (
    <div className="space-y-6">
      {message && (
        <div
          role="status"
          className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {/* Create */}
      <form onSubmit={create} className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
          <Plus className="h-5 w-5 text-purple-600" /> Add new loyalty program
        </h3>
        <ProgramForm value={form} onChange={setForm} />
        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create program
          </button>
        </div>
      </form>

      {/* List */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-900">
          <Award className="h-5 w-5 text-purple-600" /> Your programs
          <span className="text-sm font-normal text-slate-500">({programs.length})</span>
        </h3>

        {loading ? (
          <div className="flex justify-center py-10 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : programs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
            No loyalty programs yet. Create your first one above.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {programs.map((p) => (
              <div
                key={p._id}
                role="button"
                tabIndex={0}
                onClick={() => setOpened(p)}
                onKeyDown={(e) => e.key === 'Enter' && setOpened(p)}
                className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-purple-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-slate-900">{p.name}</p>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => {
                        setEditing(p);
                        setEditForm(formFromProgram(p));
                      }}
                      title="Edit"
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-purple-50 hover:text-purple-700"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(p)}
                      title="Delete"
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-700">
                  <Gift className="h-4 w-4 text-purple-500" /> {p.reward}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
                    <Star className="h-3 w-3" /> {p.pointsRequired} points
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-800">
                    <CalendarClock className="h-3 w-3" /> {p.completeWithinDays} days
                  </span>
                </div>
                {p.description && <p className="mt-2 line-clamp-2 text-xs text-slate-500">{p.description}</p>}

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {p.memberCount || 0} members
                  </span>
                  {(p.rewardReadyCount || 0) > 0 ? (
                    <span className="font-semibold text-emerald-700">{p.rewardReadyCount} reward ready</span>
                  ) : (
                    <span className="text-purple-700">View members →</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit */}
      {editing && (
        <Overlay onClose={() => setEditing(null)}>
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <p className="text-lg font-bold text-slate-900">Edit program</p>
            <button onClick={() => setEditing(null)} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="overflow-auto p-5">
            <ProgramForm value={editForm} onChange={setEditForm} />
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
            <button onClick={() => setEditing(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
              Cancel
            </button>
            <button
              onClick={saveEdit}
              disabled={saving}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-60"
            >
              Save changes
            </button>
          </div>
        </Overlay>
      )}

      {/* Members */}
      {opened && <MembersModal program={opened} onClose={() => setOpened(null)} onChanged={load} notify={notify} />}
    </div>
  );
}