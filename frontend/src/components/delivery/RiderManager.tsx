import React, { useCallback, useEffect, useState } from 'react';
import { Bike, Plus, Phone, Pencil, Trash2, X, Loader2, MapPin, KeyRound, Copy, Check, Smartphone, Radio } from 'lucide-react';
import { api, onlyMine, copyText, timeAgo, useSocket, staffSocketAuth, type DRider } from '../../delivery/shared';

const VEHICLES = ['Bike', 'Scooter', 'Bicycle', 'Car', 'Other'];
const EMOJI: Record<string, string> = { Bike: '🏍️', Scooter: '🛵', Bicycle: '🚲', Car: '🚗', Other: '🚚' };
const TONE: Record<string, { chip: string; dot: string }> = {
  Available: { chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  Busy: { chip: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  Offline: { chip: 'bg-slate-100 text-slate-500 ring-slate-200', dot: 'bg-slate-400' },
};

type Form = { _id?: string; name: string; phone: string; address: string; vehicleType: string; vehicleNumber: string; vehicleModel: string; pin: string; isActive: boolean };
const EMPTY: Form = { name: '', phone: '', address: '', vehicleType: 'Bike', vehicleNumber: '', vehicleModel: '', pin: '', isActive: true };

export default function RiderManager({ canEdit }: { canEdit: boolean }) {
  const [riders, setRiders] = useState<DRider[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [riderUrl, setRiderUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const j = await api<{ data: DRider[] }>('/api/delivery/riders');
      setRiders(onlyMine(j.data)); // 🔑 only this restaurant's riders
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    api<{ data: { riderUrl: string } }>('/api/delivery/links').then((j) => setRiderUrl(j.data.riderUrl)).catch(() => {});
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  useSocket(staffSocketAuth(), { 'delivery:rider-location': () => load(), 'delivery:order': () => load() });

  const save = async () => {
    if (!form) return;
    setSaving(true); setErr('');
    try {
      const body = JSON.stringify(form);
      if (form._id) await api(`/api/delivery/riders/${form._id}`, { method: 'PUT', body });
      else await api('/api/delivery/riders', { method: 'POST', body });
      setForm(null);
      load();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  const setStatus = async (r: DRider, status: string) => {
    setRiders((p) => p.map((x) => (x._id === r._id ? { ...x, status: status as DRider['status'] } : x)));
    try { await api(`/api/delivery/riders/${r._id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); load(); } catch (e: any) { setErr(e.message); load(); }
  };

  const remove = async (r: DRider) => {
    if (!window.confirm(`Delete rider ${r.name}?`)) return;
    try { await api(`/api/delivery/riders/${r._id}`, { method: 'DELETE' }); load(); } catch (e: any) { setErr(e.message); }
  };

  const counts = { Available: 0, Busy: 0, Offline: 0 } as Record<string, number>;
  riders.forEach((r) => { if (r.isActive) counts[r.status]++; });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {(['Available', 'Busy', 'Offline'] as const).map((s) => (
          <div key={s} className={`flex items-center gap-2 rounded-2xl px-4 py-2 ring-1 ring-inset ${TONE[s].chip}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${TONE[s].dot}`} />
            <span className="font-display text-lg font-bold">{counts[s]}</span>
            <span className="text-sm font-semibold">{s}</span>
          </div>
        ))}
        {canEdit && (
          <button onClick={() => { setErr(''); setForm({ ...EMPTY }); }} className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-purple-500/20 hover:-translate-y-0.5 transition">
            <Plus className="h-4 w-4" /> Add rider
          </button>
        )}
      </div>

      {riderUrl && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-gradient-to-r from-purple-50 to-indigo-50 p-4 ring-1 ring-purple-100">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-purple-600 shadow-sm"><Smartphone className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">Rider app link</p>
            <p className="truncate text-xs text-slate-500">Riders open this on their phone and log in with their phone number + PIN.</p>
          </div>
          <button onClick={async () => { await copyText(riderUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-purple-700 ring-1 ring-purple-200 hover:bg-purple-50">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      )}

      {err && !form && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200">{err}</div>}

      {loading ? (
        <div className="flex justify-center py-16 text-purple-400"><Loader2 className="h-7 w-7 animate-spin" /></div>
      ) : riders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-purple-200 bg-gradient-to-b from-purple-50/60 to-white py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-100 text-purple-500 anim-floaty"><Bike className="h-8 w-8" /></div>
          <p className="font-bold text-slate-800">No riders yet</p>
          <p className="text-sm text-slate-500">Add your first rider so you can assign delivery orders.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {riders.map((r) => (
            <div key={r._id} className={`rounded-3xl bg-white p-5 ring-1 transition hover:shadow-xl hover:shadow-purple-500/10 ${r.isActive ? 'ring-purple-100' : 'opacity-60 ring-slate-200'}`}>
              <div className="flex items-start gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 via-violet-600 to-indigo-600 text-2xl shadow-lg shadow-purple-500/25">{EMOJI[r.vehicleType] || '🛵'}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-lg font-bold text-slate-900">{r.name}</p>
                  <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 text-sm font-semibold text-purple-700"><Phone className="h-3.5 w-3.5" /> {r.phone}</a>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${TONE[r.status].chip}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${TONE[r.status].dot}`} /> {r.status}
                </span>
              </div>
              <div className="mt-3 space-y-1 text-sm text-slate-600">
                <p>{r.vehicleType}{r.vehicleModel ? ` · ${r.vehicleModel}` : ''}{r.vehicleNumber ? ` · ${r.vehicleNumber}` : ''}</p>
                {r.address && <p className="flex items-center gap-1.5 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" /> {r.address}</p>}
                <p className="flex items-center gap-3 pt-1 text-xs font-semibold">
                  <span className="text-purple-700">{r.activeOrders || 0} active order{(r.activeOrders || 0) === 1 ? '' : 's'}</span>
                  {r.lastLocation?.updatedAt && <span className="inline-flex items-center gap-1 text-emerald-600"><Radio className="h-3 w-3" /> GPS {timeAgo(r.lastLocation.updatedAt)}</span>}
                </p>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <div className="inline-flex flex-1 rounded-xl bg-slate-100 p-1">
                  {(['Available', 'Busy', 'Offline'] as const).map((s) => (
                    <button key={s} onClick={() => setStatus(r, s)} className={`flex-1 rounded-lg py-1.5 text-[11px] font-bold transition ${r.status === s ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{s}</button>
                  ))}
                </div>
                {canEdit && (
                  <>
                    <button onClick={() => { setErr(''); setForm({ _id: r._id, name: r.name, phone: r.phone, address: r.address || '', vehicleType: r.vehicleType, vehicleNumber: r.vehicleNumber || '', vehicleModel: r.vehicleModel || '', pin: '', isActive: r.isActive }); }} className="rounded-lg p-2 text-slate-500 hover:bg-purple-50 hover:text-purple-700" title="Edit"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => remove(r)} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600" title="Delete"><Trash2 className="h-4 w-4" /></button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm anim-fade-in" onClick={(e) => e.target === e.currentTarget && setForm(null)}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl anim-pop thin-scroll">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-xl font-bold text-slate-900">{form._id ? 'Edit rider' : 'Add rider'}</h3>
                <p className="text-sm text-slate-500">Rider profile and login details</p>
              </div>
              <button onClick={() => setForm(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Full name *"><input className="inp" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ram Bahadur" /></Field>
              <Field label="Phone *"><input className="inp" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98XXXXXXXX" inputMode="tel" /></Field>
              <div className="sm:col-span-2"><Field label="Address"><input className="inp" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Where the rider lives" /></Field></div>
              <Field label="Vehicle">
                <select className="inp" value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>{VEHICLES.map((v) => <option key={v}>{v}</option>)}</select>
              </Field>
              <Field label="Number plate"><input className="inp" value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })} placeholder="Lu 1 Pa 1234" /></Field>
              <div className="sm:col-span-2"><Field label="Vehicle model / colour"><input className="inp" value={form.vehicleModel} onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })} placeholder="Honda Shine, black" /></Field></div>
              <div className="sm:col-span-2">
                <Field label={form._id ? 'New PIN (leave empty to keep the old one)' : 'Login PIN * (4–8 digits)'}>
                  <div className="relative"><KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input className="inp pl-9" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 8) })} inputMode="numeric" placeholder="e.g. 4827" /></div>
                </Field>
              </div>
              {form._id && (
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 sm:col-span-2">
                  <input type="checkbox" className="h-4 w-4 accent-purple-600" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Rider account is active
                </label>
              )}
            </div>
            {err && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200">{err}</p>}
            <div className="mt-5 flex gap-2">
              <button onClick={() => setForm(null)} className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-700 hover:bg-slate-200">Cancel</button>
              <button disabled={saving} onClick={save} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 py-3 text-sm font-bold text-white shadow-md disabled:opacity-60">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save rider
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`.inp{width:100%;border:1px solid #e9d5ff;border-radius:.75rem;padding:.65rem .8rem;font-size:.875rem;outline:none;background:#fff}.inp:focus{border-color:#a855f7;box-shadow:0 0 0 4px rgba(168,85,247,.15)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{label}</span>{children}</label>;
}