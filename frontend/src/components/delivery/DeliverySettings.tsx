import React, { useCallback, useEffect, useState } from 'react';
import {
  Loader2, Save, Plus, Trash2, MapPin, Crosshair, Power, Banknote, Smartphone, Gift, Ruler, Link2, Copy, Check, Image as ImageIcon,
  Store, ChefHat, ExternalLink, Download, CircleDollarSign, X,
} from 'lucide-react';
import { api, copyText, money, type DSettings, type DArea } from '../../delivery/shared';

const BLANK: DSettings = {
  acceptingOrders: true, acceptCOD: true, acceptOnline: true, sendToKitchen: true, onlinePaymentNote: '',
  baseCharge: 50, minOrderAmount: 0, freeDeliveryAbove: 0, radiusKm: 0, restaurantLat: null, restaurantLng: null,
  estimatedPrepMinutes: 30, areas: [], customerCancelWindow: 'Confirmed',
};

type Tab = 'rules' | 'areas' | 'menu' | 'share';
const TABS: { k: Tab; label: string; icon: React.ElementType }[] = [
  { k: 'rules', label: 'Rules & charges', icon: Banknote },
  { k: 'areas', label: 'Delivery areas', icon: MapPin },
  { k: 'menu', label: 'Online menu', icon: ImageIcon },
  { k: 'share', label: 'Share & QR', icon: Link2 },
];

export default function DeliverySettings({ canEdit }: { canEdit: boolean }) {
  const [tab, setTab] = useState<Tab>('rules');
  const [s, setS] = useState<DSettings>(BLANK);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<{ data: DSettings }>('/api/delivery/settings').then((j) => setS({ ...BLANK, ...j.data })).catch((e) => setMsg({ ok: false, text: e.message })).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const j = await api<{ data: DSettings }>('/api/delivery/settings', { method: 'PUT', body: JSON.stringify(s) });
      setS({ ...BLANK, ...j.data });
      setMsg({ ok: true, text: 'Settings saved.' });
      setTimeout(() => setMsg(null), 3000);
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setSaving(false); }
  };

  const set = <K extends keyof DSettings>(k: K, v: DSettings[K]) => setS((p) => ({ ...p, [k]: v }));

  if (loading) return <div className="flex justify-center py-20 text-purple-400"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  const dis = !canEdit;

  return (
    <div className="space-y-5">
      <div className="flex gap-2 overflow-x-auto pb-1 thin-scroll">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ring-1 transition ${tab === t.k ? 'bg-purple-600 text-white ring-purple-600 shadow-md shadow-purple-500/20' : 'bg-white text-slate-600 ring-slate-200 hover:ring-purple-300'}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {!canEdit && <p className="rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-800 ring-1 ring-amber-200">Only a Manager can change delivery settings. You can view them.</p>}

      {tab === 'rules' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Online ordering" icon={Power} tone="from-emerald-500 to-teal-500">
            <Toggle disabled={dis} label="Accepting online orders" hint="Turn off when you are closed or too busy. The website shows “paused”." value={s.acceptingOrders} onChange={(v) => set('acceptingOrders', v)} />
            <Toggle disabled={dis} label="Cash on Delivery" value={s.acceptCOD} onChange={(v) => set('acceptCOD', v)} />
            <Toggle disabled={dis} label="Online payment" hint="Customer pays by QR / transfer, you press “Mark as paid”." value={s.acceptOnline} onChange={(v) => set('acceptOnline', v)} />
            <Toggle disabled={dis} label="Show accepted orders on Kitchen Display" value={s.sendToKitchen} onChange={(v) => set('sendToKitchen', v)} />
            <Num disabled={dis} label="Food preparation time (minutes)" value={s.estimatedPrepMinutes} onChange={(v) => set('estimatedPrepMinutes', v)} />
            <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">Customer can cancel online</span>
              <select disabled={dis} className="inp" value={s.customerCancelWindow} onChange={(e) => set('customerCancelWindow', e.target.value as DSettings['customerCancelWindow'])}>
                <option value="Pending">Only before you accept the order</option>
                <option value="Confirmed">Until cooking starts (recommended)</option>
                <option value="Preparing">Until the food is ready</option>
                <option value="None">Never — they must call you</option>
              </select>
              <span className="mt-1 block text-[11px] text-slate-400">Once a rider has the order, customers can never cancel online.</span></label>
            <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">Message for online payment (optional)</span>
              <textarea disabled={dis} rows={2} maxLength={300} value={s.onlinePaymentNote} onChange={(e) => set('onlinePaymentNote', e.target.value)} placeholder="e.g. Pay to eSewa 98XXXXXXXX and keep the screenshot" className="inp" /></label>
          </Card>

          <Card title="Charges & rules" icon={CircleDollarSign} tone="from-purple-500 to-indigo-600">
            <Num disabled={dis} label="Standard delivery charge (Rs.)" hint="Used when you have no delivery areas." value={s.baseCharge} onChange={(v) => set('baseCharge', v)} />
            <Num disabled={dis} label="Minimum order amount (Rs.)" hint="0 = no minimum." value={s.minOrderAmount} onChange={(v) => set('minOrderAmount', v)} />
            <Num disabled={dis} label="Free delivery above (Rs.)" hint="Order total from which delivery is free. 0 = off." value={s.freeDeliveryAbove} onChange={(v) => set('freeDeliveryAbove', v)} icon={Gift} />
            <div className="rounded-2xl bg-purple-50/70 p-4 ring-1 ring-purple-100">
              <p className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800"><Ruler className="h-4 w-4 text-purple-600" /> Delivery radius</p>
              <Num disabled={dis} label="Maximum distance (km)" hint="0 = no limit. Customers must share their map pin when this is on." value={s.radiusKm} onChange={(v) => set('radiusKm', v)} />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">Restaurant latitude</span><input disabled={dis} className="inp" value={s.restaurantLat ?? ''} onChange={(e) => set('restaurantLat', e.target.value === '' ? null : Number(e.target.value))} placeholder="27.7006" inputMode="decimal" /></label>
                <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">Restaurant longitude</span><input disabled={dis} className="inp" value={s.restaurantLng ?? ''} onChange={(e) => set('restaurantLng', e.target.value === '' ? null : Number(e.target.value))} placeholder="83.4483" inputMode="decimal" /></label>
              </div>
              <button disabled={dis} type="button" onClick={() => navigator.geolocation?.getCurrentPosition((p) => { set('restaurantLat', +p.coords.latitude.toFixed(6)); set('restaurantLng', +p.coords.longitude.toFixed(6)); }, () => setMsg({ ok: false, text: 'Could not read your location. Allow location access and try again.' }))}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-purple-700 ring-1 ring-purple-200 hover:bg-purple-50 disabled:opacity-50">
                <Crosshair className="h-3.5 w-3.5" /> Use my current location (stand in the restaurant)
              </button>
            </div>
          </Card>
        </div>
      )}

      {tab === 'areas' && <AreasEditor areas={s.areas} disabled={dis} onChange={(a) => set('areas', a)} baseCharge={s.baseCharge} />}
      {tab === 'menu' && <MenuExtras canEdit={canEdit} />}
      {tab === 'share' && <ShareLinks />}

      {(tab === 'rules' || tab === 'areas') && canEdit && (
        <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3">
          {msg && <span className={`rounded-xl px-4 py-2 text-sm font-semibold shadow-lg ${msg.ok ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>{msg.text}</span>}
          <button disabled={saving} onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-xl shadow-purple-500/30 hover:-translate-y-0.5 transition disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
          </button>
        </div>
      )}
      <style>{`.inp{width:100%;border:1px solid #e9d5ff;border-radius:.75rem;padding:.65rem .8rem;font-size:.875rem;outline:none;background:#fff}.inp:focus{border-color:#a855f7;box-shadow:0 0 0 4px rgba(168,85,247,.15)}.inp:disabled{background:#f8fafc;color:#94a3b8}`}</style>
    </div>
  );
}

/* ------------------------------ small parts ------------------------------ */
function Card({ title, icon: Icon, tone, children }: { title: string; icon: React.ElementType; tone: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-purple-100">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${tone} text-white shadow-md`}><Icon className="h-5 w-5" /></div>
        <h3 className="font-display text-lg font-bold text-slate-900">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Toggle({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!value)} className="flex w-full items-center justify-between gap-4 rounded-2xl p-3 text-left ring-1 ring-slate-100 hover:bg-purple-50/40 disabled:opacity-60">
      <span><span className="block text-sm font-bold text-slate-800">{label}</span>{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${value ? 'bg-purple-600' : 'bg-slate-300'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} /></span>
    </button>
  );
}

function Num({ label, hint, value, onChange, disabled, icon: Icon }: { label: string; hint?: string; value: number; onChange: (v: number) => void; disabled?: boolean; icon?: React.ElementType }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-xs font-bold text-slate-600">{Icon && <Icon className="h-3.5 w-3.5 text-purple-500" />}{label}</span>
      <input disabled={disabled} type="number" min={0} className="inp" value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Math.max(0, Number(e.target.value)))} />
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

/* ------------------------------ delivery areas ------------------------------ */
function AreasEditor({ areas, onChange, disabled, baseCharge }: { areas: DArea[]; onChange: (a: DArea[]) => void; disabled: boolean; baseCharge: number }) {
  const upd = (i: number, patch: Partial<DArea>) => onChange(areas.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  return (
    <section className="rounded-3xl bg-white p-5 ring-1 ring-purple-100">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="font-display text-lg font-bold text-slate-900">Delivery areas</h3>
        {!disabled && <button onClick={() => onChange([...areas, { name: '', charge: baseCharge, minOrder: 0, active: true }])} className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-purple-700"><Plus className="h-4 w-4" /> Add area</button>}
      </div>
      <p className="mb-4 text-sm text-slate-500">Customers pick their area at checkout and pay that area’s charge. With no areas, the standard charge ({money(baseCharge)}) is used for everyone.</p>
      {areas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-purple-200 bg-purple-50/40 py-10 text-center text-sm text-slate-500">No areas yet. Add areas like “Butwal Chowk”, “Traffic Chowk”, “Devinagar”.</div>
      ) : (
        <div className="space-y-3">
          {areas.map((a, i) => (
            <div key={a._id || i} className={`grid items-end gap-3 rounded-2xl p-3 ring-1 sm:grid-cols-[1fr_130px_150px_auto_auto] ${a.active ? 'ring-purple-100' : 'bg-slate-50 opacity-70 ring-slate-200'}`}>
              <label className="block"><span className="mb-1 block text-[11px] font-bold text-slate-500">Area name</span><input disabled={disabled} className="inp" value={a.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder="Area name" /></label>
              <label className="block"><span className="mb-1 block text-[11px] font-bold text-slate-500">Charge (Rs.)</span><input disabled={disabled} type="number" min={0} className="inp" value={a.charge} onChange={(e) => upd(i, { charge: Math.max(0, Number(e.target.value)) })} /></label>
              <label className="block"><span className="mb-1 block text-[11px] font-bold text-slate-500">Min. order (0 = default)</span><input disabled={disabled} type="number" min={0} className="inp" value={a.minOrder} onChange={(e) => upd(i, { minOrder: Math.max(0, Number(e.target.value)) })} /></label>
              <label className="flex items-center gap-2 pb-2.5 text-xs font-bold text-slate-600"><input disabled={disabled} type="checkbox" className="h-4 w-4 accent-purple-600" checked={a.active} onChange={(e) => upd(i, { active: e.target.checked })} /> Active</label>
              {!disabled && <button onClick={() => onChange(areas.filter((_, idx) => idx !== i))} className="mb-1 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Remove"><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------ photos & add-ons ------------------------------ */
interface Extra { _id: string; itemName: string; category: string; price: number; status: string; imageUrl: string; addons: { name: string; price: number; isAvailable?: boolean }[]; deliveryEnabled: boolean }

function MenuExtras({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<Extra[] | null>(null);
  const [edit, setEdit] = useState<Extra | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => api<{ data: Extra[] }>('/api/delivery/menu-extras').then((j) => setItems(j.data)).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!edit) return;
    setSaving(true); setErr('');
    try {
      await api(`/api/delivery/menu-extras/${edit._id}`, { method: 'PUT', body: JSON.stringify({ imageUrl: edit.imageUrl, addons: edit.addons, deliveryEnabled: edit.deliveryEnabled }) });
      setEdit(null); load();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  if (!items) return <div className="flex justify-center py-16 text-purple-400"><Loader2 className="h-7 w-7 animate-spin" /></div>;

  return (
    <section className="rounded-3xl bg-white p-5 ring-1 ring-purple-100">
      <h3 className="font-display text-lg font-bold text-slate-900">Online menu</h3>
      <p className="mb-4 text-sm text-slate-500">Your items come from the Menu page. Here you add a <b>photo link</b>, <b>add-ons</b> (extra cheese, spicy…) and choose what shows on the website.</p>
      {err && !edit && <p className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{err}</p>}
      {items.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">Your menu is empty. Add dishes in the Menu page first.</p> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((m) => (
            <button key={m._id} onClick={() => canEdit && setEdit({ ...m, addons: m.addons.map((a) => ({ ...a })) })} className="flex items-center gap-3 rounded-2xl p-3 text-left ring-1 ring-slate-100 transition hover:ring-purple-300 hover:bg-purple-50/40">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-purple-100 to-amber-100">
                {m.imageUrl ? <img src={m.imageUrl} alt="" className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} /> : <div className="flex h-full items-center justify-center text-2xl">🍽️</div>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-slate-900">{m.itemName}</p>
                <p className="text-xs text-slate-500">{m.category} · {money(m.price)}</p>
                <p className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-bold">
                  {!m.deliveryEnabled && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-600 ring-1 ring-rose-200">Hidden online</span>}
                  {m.addons.length > 0 && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-purple-700 ring-1 ring-purple-200">{m.addons.length} add-on{m.addons.length > 1 ? 's' : ''}</span>}
                  {m.status !== 'Available' && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 ring-1 ring-amber-200">{m.status}</span>}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm anim-fade-in" onClick={(e) => e.target === e.currentTarget && setEdit(null)}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl anim-pop thin-scroll">
            <div className="flex items-start justify-between">
              <div><h3 className="font-display text-xl font-bold">{edit.itemName}</h3><p className="text-sm text-slate-500">{edit.category} · {money(edit.price)}</p></div>
              <button onClick={() => setEdit(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <label className="mt-4 block"><span className="mb-1 block text-xs font-bold text-slate-600">Photo link (https://…)</span>
              <input className="inp" value={edit.imageUrl} onChange={(e) => setEdit({ ...edit, imageUrl: e.target.value })} placeholder="https://example.com/momo.jpg" /></label>
            {edit.imageUrl && <img src={edit.imageUrl} alt="" className="mt-2 h-32 w-full rounded-xl object-cover" onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.2')} />}

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold text-slate-600">Add-ons</span>
                <button onClick={() => setEdit({ ...edit, addons: [...edit.addons, { name: '', price: 0, isAvailable: true }] })} className="inline-flex items-center gap-1 rounded-lg bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700 hover:bg-purple-100"><Plus className="h-3 w-3" /> Add</button></div>
              <div className="space-y-2">
                {edit.addons.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input className="inp" placeholder="Extra cheese" value={a.name} onChange={(e) => setEdit({ ...edit, addons: edit.addons.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)) })} />
                    <input className="inp !w-24" type="number" min={0} placeholder="Rs." value={a.price} onChange={(e) => setEdit({ ...edit, addons: edit.addons.map((x, idx) => (idx === i ? { ...x, price: Math.max(0, Number(e.target.value)) } : x)) })} />
                    <button onClick={() => setEdit({ ...edit, addons: edit.addons.filter((_, idx) => idx !== i) })} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                {edit.addons.length === 0 && <p className="text-xs text-slate-400">No add-ons for this item.</p>}
              </div>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" className="h-4 w-4 accent-purple-600" checked={edit.deliveryEnabled} onChange={(e) => setEdit({ ...edit, deliveryEnabled: e.target.checked })} /> Show this item on the website</label>
            {err && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700">{err}</p>}
            <div className="mt-5 flex gap-2">
              <button onClick={() => setEdit(null)} className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-700">Cancel</button>
              <button disabled={saving} onClick={save} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 py-3 text-sm font-bold text-white disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------ share links ------------------------------ */
function ShareLinks() {
  const [d, setD] = useState<{ orderUrl: string; riderUrl: string; qrImage: string; restaurantName: string } | null>(null);
  const [copied, setCopied] = useState('');
  useEffect(() => { api<{ data: any }>('/api/delivery/links').then((j) => setD(j.data)).catch(() => {}); }, []);
  if (!d) return <div className="flex justify-center py-16 text-purple-400"><Loader2 className="h-7 w-7 animate-spin" /></div>;

  const copy = async (k: string, v: string) => { await copyText(v); setCopied(k); setTimeout(() => setCopied(''), 2000); };
  const Row = ({ k, label, url, sub }: { k: string; label: string; url: string; sub: string }) => (
    <div className="rounded-2xl bg-purple-50/60 p-4 ring-1 ring-purple-100">
      <p className="text-sm font-bold text-slate-900">{label}</p><p className="text-xs text-slate-500">{sub}</p>
      <div className="mt-2 flex items-center gap-2">
        <input readOnly value={url} className="inp !bg-white text-xs" onFocus={(e) => e.target.select()} />
        <button onClick={() => copy(k, url)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-purple-700">{copied === k ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied === k ? 'Copied' : 'Copy'}</button>
        <a href={url} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg bg-white p-2.5 text-purple-700 ring-1 ring-purple-200"><ExternalLink className="h-4 w-4" /></a>
      </div>
    </div>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <section className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-purple-100">
        <h3 className="font-display text-lg font-bold text-slate-900">Your links</h3>
        <Row k="order" label="Customer ordering website" url={d.orderUrl} sub="Put this on Facebook, Instagram, WhatsApp, Google Maps and your menu cards." />
        <Row k="rider" label="Rider app" url={d.riderUrl} sub="Riders open this on their phone and log in with phone number + PIN." />
        <p className="rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-800 ring-1 ring-amber-200">These links contain your restaurant’s private key. They only ever show <b>your</b> menu and orders. Print the QR below for flyers and packaging.</p>
      </section>
      <section className="rounded-3xl bg-gradient-to-b from-purple-600 to-indigo-700 p-5 text-center text-white shadow-xl shadow-purple-500/20">
        <p className="font-display text-lg font-bold">{d.restaurantName}</p>
        <p className="text-xs opacity-80">Scan to order online</p>
        <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-3"><img src={d.qrImage} alt="Order QR code" className="h-52 w-52" /></div>
        <a href={d.qrImage} download={`${d.restaurantName}-order-qr.png`} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-bold hover:bg-white/25"><Download className="h-4 w-4" /> Download QR</a>
      </section>
    </div>
  );
}