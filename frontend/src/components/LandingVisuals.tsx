import React, { useState } from 'react';

// =====================================================================
// LANDING PAGE — small UI drawings for each feature card.
// (Copied from the website products page. You normally don't need to edit this file.)
// If a real screenshot exists in /public (the "image" you pass), it is shown instead.
// =====================================================================

export type VisualKind =
  | 'dashboard' | 'sales' | 'pending' | 'bill' | 'kitchen' | 'tables' | 'order' | 'tracking'
  | 'menu' | 'stock' | 'audit' | 'staff' | 'settings';

function Frame({ title, children, wide = false }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      className={`w-full ${wide ? 'max-w-[440px]' : 'max-w-[320px]'} overflow-hidden rounded-2xl bg-white shadow-[0_24px_48px_-16px_rgba(76,29,149,0.30)] ring-1 ring-slate-900/5`}
    >
      <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-rose-300" />
        <span className="h-2 w-2 rounded-full bg-amber-300" />
        <span className="h-2 w-2 rounded-full bg-emerald-300" />
        <span className="ml-2 truncate text-[9px] font-bold text-slate-400">{title}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

const Pill = ({ children, tone }: { children: React.ReactNode; tone: string }) => (
  <span className={`rounded-md px-1.5 py-0.5 text-[8px] font-black ${tone}`}>{children}</span>
);


function FeatureVisual({ kind, title, wide }: { kind: VisualKind; title: string; wide?: boolean }) {
  switch (kind) {
    case 'dashboard': {
      const stats: [string, string][] = [['Revenue', 'NPR 48.2k'], ['Orders', '126'], ['Tables', '18/24']];
      return (
        <Frame title={title} wide={wide}>
          <div className="mb-2.5 grid grid-cols-3 gap-1.5">
            {stats.map(([l, v]) => (
              <div key={l} className="rounded-lg bg-purple-50/80 p-1.5 ring-1 ring-purple-100">
                <p className="truncate text-[7px] font-bold uppercase text-slate-400">{l}</p>
                <p className="text-[11px] font-black text-slate-800">{v}</p>
              </div>
            ))}
          </div>
          <div className="flex h-16 items-end gap-1 px-1">
            {[40, 65, 50, 80, 58, 92, 74].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-md bg-linear-to-t from-purple-600 to-violet-400"
                style={{ height: `${h}%`, opacity: i === 5 ? 1 : 0.5 }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between px-1 text-[7px] font-bold text-slate-400">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
        </Frame>
      );
    }

    case 'sales':
      return (
        <Frame title={title} wide={wide}>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-[7px] font-bold uppercase text-slate-400">This week</p>
              <p className="text-sm font-black text-slate-800">NPR 3.2L</p>
            </div>
            <Pill tone="bg-emerald-50 text-emerald-600">+12.4%</Pill>
          </div>
          <svg viewBox="0 0 200 60" className="h-14 w-full" aria-hidden="true">
            <defs>
              <linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity=".35" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0 45 L30 38 L60 42 L90 25 L120 30 L150 14 L200 8 L200 60 L0 60Z" fill="url(#salesFill)" />
            <path d="M0 45 L30 38 L60 42 L90 25 L120 30 L150 14 L200 8" fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="mt-2 space-y-1">
            {[['Sun', '46,200'], ['Sat', '52,850']].map(([d, v]) => (
              <div key={d} className="flex justify-between text-[8px] font-bold text-slate-500">
                <span>{d}</span>
                <span className="text-slate-800">NPR {v}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5">
            <span className="text-[8px] font-bold text-slate-500">Daily sales report</span>
            <span className="rounded-md bg-purple-600 px-2 py-0.5 text-[8px] font-black text-white">Print</span>
          </div>
        </Frame>
      );

    case 'pending':
      return (
        <Frame title={title} wide={wide}>
          <div className="space-y-1.5">
            {[['RS', 'Ram Sharma', '1,240'], ['T4', 'Table 4 group', '860'], ['SK', 'Sita K.', '2,150']].map(([i, n, a]) => (
              <div key={n} className="flex items-center gap-2 rounded-lg bg-white p-1.5 ring-1 ring-slate-100">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-linear-to-br from-purple-500 to-indigo-500 text-[8px] font-black text-white">{i}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[9px] font-bold text-slate-800">{n}</p>
                  <Pill tone="bg-amber-50 text-amber-600">Pending</Pill>
                </div>
                <span className="text-[9px] font-black text-purple-700">NPR {a}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 rounded-lg bg-purple-600 py-1.5 text-center text-[8px] font-black text-white">Settle bill</div>
        </Frame>
      );

    case 'bill':
      return (
        <Frame title={title} wide={wide}>
          <div className="space-y-1 rounded-lg border border-dashed border-slate-200 p-2 font-mono">
            <p className="text-center text-[8px] font-black tracking-widest text-slate-700">TAX INVOICE</p>
            <div className="border-t border-dashed border-slate-200 pt-1" />
            {[['Chicken Momo x2', '480'], ['Masala Tea x3', '180'], ['Veg Chowmein', '220']].map(([n, p]) => (
              <div key={n} className="flex justify-between text-[8px] text-slate-600">
                <span>{n}</span>
                <span>{p}</span>
              </div>
            ))}
            <div className="border-t border-dashed border-slate-200 pt-1" />
            <div className="flex justify-between text-[8px] text-slate-500">
              <span>VAT 13%</span>
              <span>114</span>
            </div>
            <div className="flex justify-between text-[10px] font-black text-purple-700">
              <span>TOTAL</span>
              <span>NPR 994</span>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1">
            <span className="rounded-md bg-emerald-50 py-1 text-center text-[8px] font-black text-emerald-700">Cash</span>
            <span className="rounded-md bg-[#60BB46]/15 py-1 text-center text-[8px] font-black text-[#3d8a2b]">eSewa</span>
            <span className="rounded-md bg-[#5C2D91]/10 py-1 text-center text-[8px] font-black text-[#5C2D91]">Khalti</span>
          </div>
        </Frame>
      );

    case 'kitchen':
      return (
        <Frame title={title} wide={wide}>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { t: 'T2', s: 'New', tone: 'bg-amber-50 text-amber-600', bar: 'bg-amber-400', items: ['2 Momo', '1 Thukpa'] },
              { t: 'T5', s: 'Cooking', tone: 'bg-sky-50 text-sky-600', bar: 'bg-sky-400', items: ['3 Chowmein', '2 Lassi'] },
              { t: 'T7', s: 'Ready', tone: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-400', items: ['1 Dal Bhat', '1 Tea'] },
            ].map((k) => (
              <div key={k.t} className="overflow-hidden rounded-lg bg-white ring-1 ring-slate-100">
                <div className={`h-1 ${k.bar}`} />
                <div className="space-y-1 p-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-slate-800">{k.t}</span>
                    <Pill tone={k.tone}>{k.s}</Pill>
                  </div>
                  {k.items.map((i) => (
                    <p key={i} className="text-[8px] font-semibold text-slate-500">{i}</p>
                  ))}
                  <div className={`mt-1 rounded py-0.5 text-center text-[7px] font-black ${k.s === 'Ready' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {k.s === 'Ready' ? 'Done' : 'Mark ready'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Frame>
      );

    case 'tables': {
      const t = ['a', 'o', 'a', 'r', 'o', 'a', 'x', 'o', 'a'];
      const tone: Record<string, string> = {
        a: 'bg-emerald-50 ring-emerald-200 text-emerald-700',
        o: 'bg-rose-50 ring-rose-200 text-rose-700',
        r: 'bg-amber-50 ring-amber-200 text-amber-700',
        x: 'bg-slate-100 ring-slate-200 text-slate-400',
      };
      return (
        <Frame title={title} wide={wide}>
          <div className="grid grid-cols-3 gap-1.5">
            {t.map((s, i) => (
              <div key={i} className={`flex flex-col items-center justify-center rounded-lg py-2 ring-1 ${tone[s]}`}>
                <span className="text-[10px] font-black">T{i + 1}</span>
                <span className="text-[7px] font-bold">{s === 'a' ? 'Free' : s === 'o' ? '4 seated' : s === 'r' ? 'Reserved' : 'Off'}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[7px] font-bold text-slate-500">
            {[['bg-emerald-500', 'Available'], ['bg-rose-500', 'Occupied'], ['bg-amber-500', 'Reserved']].map(([c, l]) => (
              <span key={l} className="flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${c}`} />
                {l}
              </span>
            ))}
          </div>
        </Frame>
      );
    }

    case 'order':
      return (
        <Frame title={title} wide={wide}>
          <div className="space-y-1.5">
            {[['🥟', 'Chicken Momo', '240', 2], ['🍜', 'Thukpa', '280', 0], ['🥤', 'Mango Lassi', '150', 1]].map(([e, n, p, q]) => (
              <div key={n as string} className="flex items-center gap-2 rounded-lg p-1.5 ring-1 ring-slate-100">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-50 text-sm">{e}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[9px] font-bold text-slate-800">{n}</p>
                  <p className="text-[8px] font-bold text-purple-600">NPR {p}</p>
                </div>
                {(q as number) > 0 ? (
                  <span className="rounded-md bg-purple-50 px-1.5 py-0.5 text-[8px] font-black text-purple-700 ring-1 ring-purple-100">- {q} +</span>
                ) : (
                  <span className="rounded-md bg-purple-600 px-1.5 py-0.5 text-[8px] font-black text-white">+ Add</span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between rounded-lg bg-linear-to-r from-purple-600 to-indigo-600 px-2 py-1.5 text-white">
            <span className="text-[8px] font-bold">3 items</span>
            <span className="text-[9px] font-black">NPR 630</span>
          </div>
        </Frame>
      );

    case 'tracking':
      return (
        <Frame title={title} wide={wide}>
          <div className="space-y-2">
            {[
              ['Table 2', 'Preparing', 'bg-sky-50 text-sky-600', 'bg-sky-400', 50],
              ['Table 5', 'Ready', 'bg-violet-50 text-violet-600', 'bg-violet-500', 75],
              ['Table 7', 'Served', 'bg-emerald-50 text-emerald-600', 'bg-emerald-500', 100],
            ].map(([t, s, tone, bar, w]) => (
              <div key={t as string} className="rounded-lg p-1.5 ring-1 ring-slate-100">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[9px] font-black text-slate-800">{t}</span>
                  <Pill tone={tone as string}>{s}</Pill>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${bar}`} style={{ width: `${w}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Frame>
      );

    case 'menu':
      return (
        <Frame title={title} wide={wide}>
          <div className="space-y-1.5">
            {[['🥗', 'Garden Salad', 'Appetizer', '320', true], ['🍛', 'Dal Bhat Set', 'Main', '450', true], ['🍰', 'Choco Cake', 'Dessert', '260', false]].map(([e, n, c, p, on]) => (
              <div key={n as string} className="flex items-center gap-2 rounded-lg p-1.5 ring-1 ring-slate-100">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-lime-50 text-sm">{e}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[9px] font-bold text-slate-800">{n}</p>
                  <p className="text-[7px] font-bold text-slate-400">{c} · NPR {p}</p>
                </div>
                <span className={`flex h-3.5 w-6 items-center rounded-full p-0.5 ${on ? 'justify-end bg-purple-600' : 'justify-start bg-slate-200'}`}>
                  <span className="h-2.5 w-2.5 rounded-full bg-white shadow" />
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 rounded-lg border border-dashed border-purple-200 py-1 text-center text-[8px] font-black text-purple-600">+ Add menu item</div>
        </Frame>
      );

    case 'stock':
      return (
        <Frame title={title} wide={wide}>
          <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-rose-50 px-2 py-1 text-[8px] font-bold text-rose-600 ring-1 ring-rose-100">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />2 items running low
          </div>
          <div className="space-y-1.5">
            {[['Rice', 80, false], ['Chicken', 18, true], ['Cooking oil', 55, false], ['Paneer', 12, true]].map(([n, v, low]) => (
              <div key={n as string}>
                <div className="mb-0.5 flex justify-between text-[8px] font-bold">
                  <span className="text-slate-700">{n}</span>
                  <span className={low ? 'text-rose-600' : 'text-slate-400'}>{v}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${low ? 'bg-rose-400' : 'bg-linear-to-r from-purple-500 to-indigo-500'}`} style={{ width: `${v}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Frame>
      );

    case 'audit':
      return (
        <Frame title={title} wide={wide}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[9px] font-black text-slate-800">Invoices</span>
            <Pill tone="bg-emerald-50 text-emerald-600">VAT ready</Pill>
          </div>
          <div className="overflow-hidden rounded-lg ring-1 ring-slate-100">
            <div className="grid grid-cols-3 bg-slate-50 px-2 py-1 text-[7px] font-black uppercase text-slate-400">
              <span>Invoice</span>
              <span className="text-right">Total</span>
              <span className="text-right">VAT</span>
            </div>
            {[['INV-1042', '1,130', '130'], ['INV-1043', '2,260', '260'], ['INV-1044', '565', '65']].map(([i, t, v]) => (
              <div key={i} className="grid grid-cols-3 border-t border-slate-100 px-2 py-1 font-mono text-[8px] text-slate-600">
                <span className="font-bold text-slate-800">{i}</span>
                <span className="text-right">{t}</span>
                <span className="text-right text-purple-600">{v}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between rounded-lg bg-purple-50 px-2 py-1 text-[8px] font-black text-purple-700">
            <span>VAT collected</span>
            <span>NPR 455</span>
          </div>
        </Frame>
      );

    case 'staff':
      return (
        <Frame title={title} wide={wide}>
          <div className="space-y-1.5">
            {[
              ['Anil', 'Manager', 'bg-purple-50 text-purple-700', 'from-purple-500 to-indigo-500'],
              ['Priya', 'Waiter', 'bg-amber-50 text-amber-700', 'from-amber-400 to-orange-500'],
              ['Bikash', 'Kitchen', 'bg-orange-50 text-orange-700', 'from-orange-500 to-rose-500'],
              ['Sunita', 'Cashier', 'bg-emerald-50 text-emerald-700', 'from-emerald-500 to-teal-500'],
            ].map(([n, r, tone, g]) => (
              <div key={n} className="flex items-center gap-2 rounded-lg p-1.5 ring-1 ring-slate-100">
                <span className={`flex h-6 w-6 items-center justify-center rounded-md bg-linear-to-br ${g} text-[8px] font-black text-white`}>{n[0]}</span>
                <span className="flex-1 text-[9px] font-bold text-slate-800">{n}</span>
                <Pill tone={tone}>{r}</Pill>
              </div>
            ))}
          </div>
        </Frame>
      );

    case 'settings':
      return (
        <Frame title={title} wide={wide}>
          <div className="space-y-1.5">
            {[['Business name', 'Himalayan Cafe'], ['PAN / VAT', '601234567']].map(([l, v]) => (
              <div key={l}>
                <p className="text-[7px] font-bold uppercase text-slate-400">{l}</p>
                <div className="rounded-md bg-slate-50 px-2 py-1 text-[9px] font-bold text-slate-700 ring-1 ring-slate-100">{v}</div>
              </div>
            ))}
            {[['Auto print receipt', true], ['Nepali language', false]].map(([l, on]) => (
              <div key={l as string} className="flex items-center justify-between pt-0.5">
                <span className="text-[9px] font-bold text-slate-600">{l}</span>
                <span className={`flex h-3.5 w-6 items-center rounded-full p-0.5 ${on ? 'justify-end bg-purple-600' : 'justify-start bg-slate-200'}`}>
                  <span className="h-2.5 w-2.5 rounded-full bg-white shadow" />
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 rounded-lg bg-purple-600 py-1 text-center text-[8px] font-black text-white">Save changes</div>
        </Frame>
      );


    default:
      return null;
  }
}

/** Shows the drawing; if a real screenshot exists at "image", it fades in instead. */
export function FeatureMedia({ kind, title, image, wide }: { kind: VisualKind; title: string; image?: string; wide?: boolean }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="relative flex w-full justify-center">
      {!imgLoaded && <FeatureVisual kind={kind} title={title} wide={wide} />}
      {image && !imgFailed && (
        <img
          src={image}
          alt={`${title} screen`}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgFailed(true)}
          className={
            imgLoaded
              ? `w-full ${wide ? 'max-w-[440px]' : 'max-w-[320px]'} rounded-2xl object-contain shadow-[0_24px_48px_-16px_rgba(76,29,149,0.30)] ring-1 ring-slate-900/5`
              : 'pointer-events-none absolute h-px w-px opacity-0'
          }
        />
      )}
    </div>
  );
}