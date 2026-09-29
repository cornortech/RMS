import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Receipt, Users, Hash, CheckCircle2, X, Printer, Loader2,
  AlertTriangle, RefreshCw, ClipboardList, Clock,
  Banknote, Smartphone, Wallet, CreditCard, Search, Sparkles,
  TrendingUp, Layers, ArrowUpDown, PartyPopper, QrCode, ArrowLeft,
  ChevronRight, Info, Plus, Minus, FileText,
  Star, Gift, Crown, Award, UserPlus, Phone,
} from 'lucide-react';
import BillQR, { WalletId } from './BillQR';
import { printReceipt } from '../utils/printReceipt';

// ==========================================
// CONFIG
// ==========================================

const API_BASE = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com')
  .trim()
  .replace(/\/+$/, '');
const BILLS_URL = `${API_BASE}/api/bills`;
const ORDERS_URL = `${API_BASE}/api/orders`;
const LOYALTY_URL = `${API_BASE}/api/loyalty`;

// Loyalty rule: 1 point for every NPR 100 (keep the same as CreateBill)
const NPR_PER_POINT = 100;
const POINT_PRESETS = [5, 10, 25, 50];

const getLoggedInUser = () => {
  try {
    const raw = localStorage.getItem('RESTAURANTUser');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

// ==========================================
// TYPES
// ==========================================

interface BillItem {
  itemName: string;
  quantity: number;
  rate: number;
  total: number;
}

interface Bill {
  _id: string;
  id?: string;
  orderId?: string;
  restaurantName: string;
  location?: string;
  panOrVat?: string;
  invoiceNo: string;
  billTo: string;
  tableNumber?: string;
  paymentMethod: string;
  date: string;
  items: BillItem[];
  subtotal: number;
  discount?: number;
  discountPercent?: number;
  taxableAmount?: number;
  vatCollected?: number;
  vatRate?: number;
  grandTotal: number;
  restaurantId: string;
  createdAt?: string;
}

interface LoyaltyMember {
  _id: string;
  restaurantId?: string;
  customerName: string;
  customerPhone: string;
  tier: string;
    points: number;
  totalPointsEarned: number;
  programId?: string;
  programName?: string;
}

interface LoyaltyProgramOption {
  _id: string;
  name: string;
  reward: string;
  pointsRequired: number;
}

const LAST_PROGRAM_KEY = 'rms_last_loyalty_program';

interface BillLoyalty {
  memberId: string;
  customerName: string;
  customerPhone: string;
  points: number;
  balance: number;
  success: boolean;
  error?: string;
}

type Lang = 'en' | 'ne';
type PaymentMethod = 'Cash' | WalletId;
type PaymentSplit = Partial<Record<PaymentMethod, number>>;
type SortMode = 'newest' | 'oldest' | 'highest';

interface MethodStyle {
  activeCard: string;
  iconActive: string;
  text: string;
  bar: string;
  header: string;
  dot: string;
}

interface MethodConfig {
  id: PaymentMethod;
  label: string;
  icon: React.ElementType;
  digital: boolean;
  hint: { en: string; ne: string };
  style: MethodStyle;
}

// Brand-inspired colours: eSewa green, Khalti purple, IME Pay red
const PAYMENT_METHODS: MethodConfig[] = [
  {
    id: 'Cash',
    label: 'Cash',
    icon: Banknote,
    digital: false,
    hint: { en: 'Paid at the counter', ne: 'काउन्टरमा भुक्तानी' },
    style: {
      activeCard: 'border-emerald-400 bg-emerald-50/70',
      iconActive: 'bg-emerald-500 text-white',
      text: 'text-emerald-700',
      bar: 'bg-emerald-500',
      header: 'from-emerald-500 to-teal-500',
      dot: 'bg-emerald-500',
    },
  },
  {
    id: 'eSewa',
    label: 'eSewa',
    icon: Smartphone,
    digital: true,
    hint: { en: 'Customer scans the eSewa QR', ne: 'eSewa QR स्क्यान' },
    style: {
      activeCard: 'border-[#60BB46] bg-[#60BB46]/10',
      iconActive: 'bg-[#60BB46] text-white',
      text: 'text-[#3d8a2b]',
      bar: 'bg-[#60BB46]',
      header: 'from-[#60BB46] to-[#3f9a30]',
      dot: 'bg-[#60BB46]',
    },
  },
  {
    id: 'Khalti',
    label: 'Khalti',
    icon: Wallet,
    digital: true,
    hint: { en: 'Customer scans the Khalti QR', ne: 'Khalti QR स्क्यान' },
    style: {
      activeCard: 'border-[#5C2D91] bg-[#5C2D91]/10',
      iconActive: 'bg-[#5C2D91] text-white',
      text: 'text-[#5C2D91]',
      bar: 'bg-[#5C2D91]',
      header: 'from-[#5C2D91] to-[#7c3fc2]',
      dot: 'bg-[#5C2D91]',
    },
  },
  {
    id: 'Fonepay',
    label: 'Fonepay',
    icon: CreditCard,
    digital: true,
    hint: { en: 'Customer scans the Fonepay QR', ne: 'Fonepay QR स्क्यान' },
    style: {
      activeCard: 'border-rose-400 bg-rose-50/80',
      iconActive: 'bg-rose-600 text-white',
      text: 'text-rose-700',
      bar: 'bg-rose-500',
      header: 'from-rose-500 to-red-600',
      dot: 'bg-rose-500',
    },
  },
];
const METHOD_BY_ID = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.id, m])) as Record<PaymentMethod, MethodConfig>;

const AVATAR_GRADIENTS = [
  'from-purple-500 to-violet-600',
  'from-indigo-500 to-sky-500',
  'from-rose-500 to-orange-400',
  'from-emerald-500 to-teal-400',
  'from-amber-500 to-pink-500',
  'from-blue-500 to-violet-500',
];

interface TierStyle {
  badge: string;
  card: string;
  shadow: string;
}

const TIER_STYLES: Record<string, TierStyle> = {
  Bronze: {
    badge: 'bg-orange-50 text-orange-700 ring-orange-200',
    card: 'from-orange-400 via-amber-600 to-orange-800',
    shadow: 'shadow-orange-500/30',
  },
  Silver: {
    badge: 'bg-slate-100 text-slate-600 ring-slate-200',
    card: 'from-slate-400 via-slate-500 to-slate-700',
    shadow: 'shadow-slate-500/30',
  },
  Gold: {
    badge: 'bg-amber-50 text-amber-700 ring-amber-200',
    card: 'from-amber-300 via-yellow-500 to-amber-600',
    shadow: 'shadow-amber-500/30',
  },
  Platinum: {
    badge: 'bg-purple-50 text-purple-700 ring-purple-200',
    card: 'from-slate-800 via-purple-800 to-indigo-900',
    shadow: 'shadow-purple-500/30',
  },
};

const CARD =
  'rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]';
const FOCUS = 'outline-none focus-visible:ring-4 focus-visible:ring-purple-500/25';
const TEXT_INPUT =
  'w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-400/20';

// ==========================================
// PORTAL — overlays render on <body> so they are truly full screen
// ==========================================

function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

// ==========================================
// HELPERS
// ==========================================

function tr(lang: Lang, en: string, ne: string): string {
  return lang === 'en' ? en : ne;
}

function money(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

function moneyCompact(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeName(name: string): string {
  return (name || '').trim().toLowerCase();
}

function initials(name: string): string {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function gradientFor(name: string): string {
  let hash = 0;
  const s = name || '';
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

function tierStyle(tier?: string): TierStyle {
  return TIER_STYLES[tier || 'Bronze'] || TIER_STYLES.Bronze;
}

function suggestedPoints(total: number): number {
  return Math.max(Math.floor((Number.isFinite(total) ? total : 0) / NPR_PER_POINT), 0);
}

function memberDisplayName(m: LoyaltyMember): string {
  return (m.customerName || '').trim() || String(m.customerPhone || '') || 'Unnamed';
}

function timeAgo(iso: string, lang: Lang): { text: string; hours: number } {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(Math.floor(diff / 60000), 0);
  const hours = mins / 60;
  let text: string;
  if (mins < 1) text = lang === 'en' ? 'Just now' : 'भर्खरै';
  else if (mins < 60) text = lang === 'en' ? `${mins}m ago` : `${mins} मिनेट अघि`;
  else if (hours < 24) text = lang === 'en' ? `${Math.floor(hours)}h ago` : `${Math.floor(hours)} घण्टा अघि`;
  else {
    const d = Math.floor(hours / 24);
    text = lang === 'en' ? `${d}d ago` : `${d} दिन अघि`;
  }
  return { text, hours };
}

// ==========================================
// GROUPED PENDING "CUSTOMER"
// ==========================================

interface BillSummary {
  billIds: string[];
  orderIds: string[];
  bills: Bill[];
  mergedItems: BillItem[];
  subtotal: number;
  discount: number;
  taxableAmount: number;
  vatCollected: number;
  grandTotal: number;
}

interface GroupedPending extends BillSummary {
  key: string;
  billTo: string;
  tableNumbers: string[];
  earliestDate: string;
  restaurantId: string;
  restaurantName: string;
  location?: string;
  panOrVat?: string;
}

// Aggregates any set of bills (a whole customer, or just one picked bill) into totals + merged items.
function summarizeBills(bills: Bill[]): BillSummary {
  const itemMap = new Map<string, BillItem>();
  for (const bill of bills) {
    for (const item of bill.items || []) {
      const itemKey = `${item.itemName}__${item.rate}`;
      if (itemMap.has(itemKey)) {
        const existing = itemMap.get(itemKey)!;
        existing.quantity += item.quantity;
        existing.total += item.total;
      } else {
        itemMap.set(itemKey, { ...item });
      }
    }
  }
  return {
    billIds: bills.map((b) => b._id),
    orderIds: Array.from(new Set(bills.map((b) => b.orderId).filter(Boolean) as string[])),
    bills,
    mergedItems: Array.from(itemMap.values()),
    subtotal: bills.reduce((s, b) => s + (b.subtotal || 0), 0),
    discount: bills.reduce((s, b) => s + (b.discount || 0), 0),
    taxableAmount: bills.reduce((s, b) => s + (b.taxableAmount ?? b.subtotal ?? 0), 0),
    vatCollected: bills.reduce((s, b) => s + (b.vatCollected || 0), 0),
    grandTotal: bills.reduce((s, b) => s + (b.grandTotal || 0), 0),
  };
}

function groupPendingBills(bills: Bill[]): GroupedPending[] {
  const groups = new Map<string, Bill[]>();
  for (const bill of bills) {
    const key = normalizeName(bill.billTo);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(bill);
  }

  const result: GroupedPending[] = [];
  groups.forEach((groupBills) => {
    const sortedByDate = [...groupBills].sort(
      (a, b) => new Date(a.date || a.createdAt || 0).getTime() - new Date(b.date || b.createdAt || 0).getTime()
    );
    const summary = summarizeBills(sortedByDate);
    result.push({
      key: normalizeName(groupBills[0].billTo),
      billTo: groupBills[0].billTo,
      ...summary,
      tableNumbers: Array.from(new Set(groupBills.map((b) => b.tableNumber).filter(Boolean) as string[])),
      earliestDate: sortedByDate[0]?.date || sortedByDate[0]?.createdAt || new Date().toISOString(),
      restaurantId: groupBills[0].restaurantId,
      restaurantName: groupBills[0].restaurantName,
      location: groupBills[0].location,
      panOrVat: groupBills[0].panOrVat,
    });
  });
  return result;
}

// ==========================================
// STAT TILE
// ==========================================

type StatTone = 'violet' | 'emerald' | 'sky' | 'amber';

const STAT_TONES: Record<StatTone, string> = {
  violet: 'bg-purple-50 text-purple-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  sky: 'bg-sky-50 text-sky-600',
  amber: 'bg-amber-50 text-amber-600',
};

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'violet',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  tone?: StatTone;
}) {
  return (
    <div className={`${CARD} group flex items-center gap-4 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-500/5`}>
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${STAT_TONES[tone]} transition-transform group-hover:scale-105`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
        <p className="mt-0.5 truncate font-mono text-lg font-bold tabular-nums text-slate-900">{value}</p>
        {sub && <p className="truncate text-[11px] text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

// ==========================================
// PENDING CUSTOMER CARD
// ==========================================

function PendingCustomersTable({
  groups,
  onSelect,
  lang,
}: {
  groups: GroupedPending[];
  onSelect: (group: GroupedPending) => void;
  lang: Lang;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-5 py-3 text-left font-semibold">{lang === 'en' ? 'Customer' : 'ग्राहक'}</th>
            <th className="px-3 py-3 text-left font-semibold">{lang === 'en' ? 'Table(s)' : 'टेबल'}</th>
            <th className="px-3 py-3 text-center font-semibold">{lang === 'en' ? 'Bills' : 'बिल'}</th>
            <th className="px-3 py-3 text-left font-semibold">{lang === 'en' ? 'Waiting since' : 'देखि बाँकी'}</th>
            <th className="px-5 py-3 text-right font-semibold">{lang === 'en' ? 'Amount due' : 'तिर्नुपर्ने'}</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {groups.map((group) => {
            const age = timeAgo(group.earliestDate, lang);
            const isOld = age.hours >= 24;
            const isStale = age.hours >= 6 && !isOld;
            return (
              <tr
                key={group.key}
                onClick={() => onSelect(group)}
                className="cursor-pointer transition-colors hover:bg-purple-50/50"
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradientFor(
                        group.billTo
                      )} text-xs font-extrabold text-white`}
                    >
                      {initials(group.billTo)}
                    </span>
                    <span className="font-semibold text-slate-900">{group.billTo}</span>
                  </div>
                </td>
                <td className="px-3 py-3.5 font-mono text-xs text-slate-500">
                  {group.tableNumbers.length ? group.tableNumbers.join(', ') : '—'}
                </td>
                <td className="px-3 py-3.5 text-center">
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                    {group.billIds.length}
                  </span>
                </td>
                <td className="px-3 py-3.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                      isOld ? 'bg-rose-50 text-rose-600' : isStale ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-500'
                    }`}
                  >
                    <Clock className="h-2.5 w-2.5" />
                    {age.text}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right font-mono font-bold text-purple-700">
                  NPR {moneyCompact(group.grandTotal)}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <ChevronRight className="ml-auto h-4 w-4 text-slate-300" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PendingGroupCard({
  group,
  onSelect,
  lang,
  index,
}: {
  group: GroupedPending;
  onSelect: (group: GroupedPending) => void;
  lang: Lang;
  index: number;
}) {
  const itemCount = group.mergedItems.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const age = timeAgo(group.earliestDate, lang);
  const isOld = age.hours >= 24;
  const isStale = age.hours >= 6 && !isOld;
  const preview = group.mergedItems.slice(0, 3).map((i) => i.itemName).join(', ');
  const extra = group.mergedItems.length - 3;

  return (
    <button
      onClick={() => onSelect(group)}
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
      aria-label={`${lang === 'en' ? 'Settle bills for' : 'भुक्तानी लिनुहोस्'} ${group.billTo}`}
      className={`ub-rise group relative flex w-full cursor-pointer flex-col overflow-hidden text-left ${CARD} transition-all duration-200 hover:-translate-y-1 hover:border-purple-300 hover:shadow-xl hover:shadow-purple-500/10 active:scale-[0.99] ${FOCUS}`}
    >
      <span
        className={`h-1 w-full bg-gradient-to-r ${
          isOld ? 'from-rose-400 to-red-500' : isStale ? 'from-amber-400 to-orange-400' : 'from-purple-500 to-indigo-500'
        }`}
        aria-hidden="true"
      />

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradientFor(
              group.billTo
            )} text-sm font-extrabold text-white shadow-sm`}
            aria-hidden="true"
          >
            {initials(group.billTo)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold leading-tight text-slate-900">{group.billTo}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ${
                  isOld
                    ? 'bg-rose-50 text-rose-600 ring-rose-100'
                    : isStale
                    ? 'bg-amber-50 text-amber-700 ring-amber-100'
                    : 'bg-slate-50 text-slate-500 ring-slate-100'
                }`}
              >
                <Clock className="h-2.5 w-2.5" />
                {age.text}
              </span>
              {group.tableNumbers.length > 0 && (
                <span className="inline-flex items-center gap-0.5 rounded-md bg-purple-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-purple-700 ring-1 ring-inset ring-purple-100">
                  <Hash className="h-2.5 w-2.5" />
                  {group.tableNumbers.join(', ')}
                </span>
              )}
            </div>
          </div>
        </div>

        {preview && (
          <p className="mt-3 line-clamp-1 text-xs text-slate-500">
            {preview}
            {extra > 0 && <span className="font-bold text-slate-600"> +{extra}</span>}
          </p>
        )}

        <div className="mt-auto flex items-end justify-between pt-4">
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 ring-1 ring-inset ring-amber-200">
              {group.billIds.length} {lang === 'en' ? `bill${group.billIds.length !== 1 ? 's' : ''}` : 'बिल'}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
              {itemCount} {lang === 'en' ? `item${itemCount !== 1 ? 's' : ''}` : 'परिकार'}
            </span>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-bold uppercase leading-none tracking-widest text-slate-400">
              {lang === 'en' ? 'Owes' : 'बाँकी'}
            </p>
            <p className="font-mono text-lg font-extrabold leading-tight tabular-nums text-purple-700">
              {moneyCompact(group.grandTotal)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-xs font-bold text-purple-700 transition-colors group-hover:bg-gradient-to-r group-hover:from-purple-600 group-hover:to-violet-600 group-hover:text-white">
        <span className="flex items-center gap-1.5">
          <Wallet className="h-3.5 w-3.5" />
          {lang === 'en' ? 'Collect payment' : 'भुक्तानी लिनुहोस्'}
        </span>
        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}

// ==========================================
// SPLIT BAR
// ==========================================

function SplitBar({
  split,
  selected,
  grandTotal,
  totalPaid,
  remaining,
  overpaid,
  isFullyPaid,
  lang,
}: {
  split: PaymentSplit;
  selected: Set<PaymentMethod>;
  grandTotal: number;
  totalPaid: number;
  remaining: number;
  overpaid: number;
  isFullyPaid: boolean;
  lang: Lang;
}) {
  const base = Math.max(grandTotal, totalPaid, 0.01);
  const segments = PAYMENT_METHODS.filter((m) => selected.has(m.id) && (split[m.id] ?? 0) > 0);

  return (
    <div className="space-y-2">
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={`${lang === 'en' ? 'Paid' : 'भुक्तानी'} ${money(totalPaid)} / ${money(grandTotal)}`}
      >
        {segments.map((m) => (
          <div
            key={m.id}
            className={`h-full ${m.style.bar} transition-all duration-300`}
            style={{ width: `${((split[m.id] ?? 0) / base) * 100}%` }}
          />
        ))}
      </div>

      {segments.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {segments.map((m) => (
            <span key={m.id} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
              <span className={`h-2 w-2 rounded-full ${m.style.dot}`} aria-hidden="true" />
              {m.label}
              <span className="font-mono text-slate-900">{money(split[m.id] ?? 0)}</span>
            </span>
          ))}
        </div>
      )}

      <div
        className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold ${
          overpaid > 0 ? 'bg-amber-50 text-amber-700' : isFullyPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-purple-50 text-purple-700'
        }`}
        aria-live="polite"
      >
        <span className="flex items-center gap-1.5">
          {isFullyPaid ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {overpaid > 0
            ? `${lang === 'en' ? 'Give back change' : 'फिर्ता दिनुहोस्'}: NPR ${money(overpaid)}`
            : isFullyPaid
            ? lang === 'en' ? 'Fully paid' : 'पूर्ण भुक्तानी'
            : `${lang === 'en' ? 'Still to collect' : 'लिन बाँकी'}: NPR ${money(remaining)}`}
        </span>
        <span className="font-mono">
          {money(totalPaid)} / {money(grandTotal)}
        </span>
      </div>
    </div>
  );
}

// ==========================================
// LOYALTY ATTACH CARD — lives in the payment panel
// ==========================================

function LoyaltyAttachCard({
  member,
  points,
  suggested,
  lang,
  onOpen,
  onRemove,
}: {
  member: LoyaltyMember | null;
  points: number;
  suggested: number;
  lang: Lang;
  onOpen: () => void;
  onRemove: () => void;
}) {
  if (!member) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={`group relative block w-full cursor-pointer overflow-hidden rounded-2xl bg-gradient-to-r from-amber-400 via-orange-400 to-pink-500 p-[2px] text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-orange-500/20 active:scale-[0.99] ${FOCUS}`}
      >
        <span className="flex items-center gap-3 rounded-[14px] bg-white p-3.5">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-pink-500 text-white shadow-md shadow-orange-500/30">
            <Gift className="h-5 w-5 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
            <span className="absolute -right-1 -top-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-400 ring-2 ring-white" />
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-900">{tr(lang, 'Loyalty rewards', 'लोयल्टी पुरस्कार')}</span>
            <span className="block truncate text-[11px] text-slate-500">
              {tr(lang, 'Find the customer by name or phone and add points', 'नाम वा फोनबाट ग्राहक खोजी अंक थप्नुहोस्')}
            </span>
          </span>
          {suggested > 0 && (
            <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 font-mono text-[11px] font-extrabold text-amber-600 ring-1 ring-inset ring-amber-200">
              +{suggested}
            </span>
          )}
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
        </span>
      </button>
    );
  }

  const ts = tierStyle(member.tier);
  const current = member.points || 0;

  return (
    <div className={`ub-fade relative overflow-hidden rounded-2xl bg-gradient-to-br ${ts.card} p-4 text-white shadow-lg ${ts.shadow}`}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/15 blur-xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-12 left-6 h-24 w-24 rounded-full bg-white/10 blur-xl" />

      <div className="relative flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 text-sm font-extrabold ring-1 ring-white/30">
          {initials(memberDisplayName(member))}
        </span>
        <div className="min-w-0 flex-1">
          
          <p className="truncate text-sm font-extrabold">{memberDisplayName(member)}</p>
          <p className="truncate font-mono text-[11px] text-white/80">{member.customerPhone}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-black leading-none">+{points}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/75">{tr(lang, 'pts', 'अंक')}</p>
        </div>
      </div>

      <div className="relative mt-3 flex items-center justify-between gap-2 rounded-xl bg-black/15 px-3 py-2 text-[11px] font-semibold">
        <span className="flex items-center gap-1">
          {tr(lang, 'Balance', 'ब्यालेन्स')} <span className="font-mono">{current}</span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-mono font-black">{current + points}</span>
        </span>
        <span className="flex gap-1.5">
          <button
            type="button"
            onClick={onOpen}
            className="cursor-pointer rounded-lg bg-white/20 px-2.5 py-1 font-bold outline-none transition hover:bg-white/30 focus-visible:ring-2 focus-visible:ring-white/60"
          >
            {tr(lang, 'Change', 'बदल्नुहोस्')}
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={tr(lang, 'Remove loyalty', 'लोयल्टी हटाउनुहोस्')}
            className="cursor-pointer rounded-lg bg-white/20 p-1 outline-none transition hover:bg-white/30 focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
    </div>
  );
}

// ==========================================
// LOYALTY MODAL — search members, pick one, choose points
// ==========================================

function LoyaltyModal({
  restaurantId,
  lang,
  amount,
  customerName,
  initialMember,
  initialPoints,
  onClose,
  onConfirm,
}: {
  restaurantId: string;
  lang: Lang;
  amount: number;
  customerName: string;
  initialMember: LoyaltyMember | null;
  initialPoints: number;
  onClose: () => void;
  onConfirm: (member: LoyaltyMember, points: number) => void;
}) {
  const suggested = suggestedPoints(amount);

  const [search, setSearch] = useState('');
  const [members, setMembers] = useState<LoyaltyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [selected, setSelected] = useState<LoyaltyMember | null>(initialMember);
  const [points, setPoints] = useState<number>(initialMember ? initialPoints : suggested);

   // Loyalty programs: choose one first, then pick or add a customer in it
  const [programs, setPrograms] = useState<LoyaltyProgramOption[]>([]);
  const [programId, setProgramId] = useState<string>(initialMember?.programId || '');
  const [programsLoaded, setProgramsLoaded] = useState(false);

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollForm, setEnrollForm] = useState({ customerPhone: '', customerName: '' });
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState('');

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!initialMember) searchRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load all members once — searching is done locally (instant, no request per keystroke)
  useEffect(() => {
    if (!restaurantId) {
      setLoading(false);
      setError(tr(lang, 'Restaurant session not found. Please log in again.', 'सत्र भेटिएन। फेरि लग इन गर्नुहोस्।'));
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`${LOYALTY_URL}?restaurantId=${encodeURIComponent(restaurantId)}`, {
          signal: ctrl.signal,
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          throw new Error(data?.message || `Server error (${res.status}) while loading loyalty customers.`);
        }
        setMembers(data.data || []);
        setError('');
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        setError(err?.message || 'Network error while loading loyalty data.');
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [restaurantId, reloadKey, lang]);

    useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${LOYALTY_URL}/programs`, { signal: ctrl.signal });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) throw new Error(data?.message || 'Could not load loyalty programs.');
        const list: LoyaltyProgramOption[] = data.data || [];
        setPrograms(list);
        setProgramId((current) => {
          if (current && list.some((p) => p._id === current)) return current;
          const last = localStorage.getItem(LAST_PROGRAM_KEY) || '';
          return list.some((p) => p._id === last) ? last : list[0]?._id || '';
        });
      } catch (err: any) {
        if (err?.name !== 'AbortError') setError(err?.message || 'Could not load loyalty programs.');
      } finally {
        if (!ctrl.signal.aborted) setProgramsLoaded(true);
      }
    })();
    return () => ctrl.abort();
  }, [reloadKey]);

  const activeProgram = programs.find((p) => p._id === programId) || null;
  const programMembers = useMemo(
    () => (programId ? members.filter((m) => String(m.programId || '') === programId) : []),
    [members, programId]
  );

  const changeProgram = (id: string) => {
    setProgramId(id);
    localStorage.setItem(LAST_PROGRAM_KEY, id);
    if (selected && String(selected.programId || '') !== id) setSelected(null);
  };

  const isLikelyMatch = useCallback(
    (m: LoyaltyMember) => {
      const target = (customerName || '').trim().toLowerCase();
      const name = (m.customerName || '').trim().toLowerCase();
      if (target.length < 2 || name.length < 2) return false;
      return name === target || name.includes(target) || target.includes(name);
    },
    [customerName]
  );

  const visibleMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = programMembers.filter((m) => {
      if (!q) return true;
      return (
        (m.customerName || '').toLowerCase().includes(q) ||
        String(m.customerPhone || '').toLowerCase().includes(q)
      );
    });
    return [...list].sort((a, b) => {
      const la = isLikelyMatch(a) ? 1 : 0;
      const lb = isLikelyMatch(b) ? 1 : 0;
      if (la !== lb) return lb - la;
      return (b.points || 0) - (a.points || 0);
    });
  }, [programMembers, search, isLikelyMatch]);

  const totalActivePoints = useMemo(() => programMembers.reduce((s, m) => s + (m.points || 0), 0), [programMembers]);

  const pickMember = (m: LoyaltyMember) => {
    setSelected(m);
    setPoints(initialMember && m._id === initialMember._id ? initialPoints : suggested);
  };

  const openEnroll = () => {
    const q = search.trim();
    const looksLikePhone = q.length > 0 && /^[\d+\-\s]+$/.test(q);
    setEnrollForm({
      customerPhone: looksLikePhone ? q : '',
      customerName: looksLikePhone ? customerName : q || customerName,
    });
    setEnrollError('');
    setEnrollOpen(true);
  };

  const handleEnroll = async () => {
        const phone = enrollForm.customerPhone.trim();
    if (!programId) {
      setEnrollError(tr(lang, 'Choose a loyalty program first.', 'पहिले लोयल्टी कार्यक्रम छान्नुहोस्।'));
      return;
    }
    if (!phone) {
      setEnrollError(tr(lang, 'Phone number is required.', 'फोन नम्बर आवश्यक छ।'));
      return;
    }
    setEnrolling(true);
    setEnrollError('');
    try {
      const res = await fetch(LOYALTY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId,
          programId,
          customerPhone: phone,
          customerName: enrollForm.customerName.trim(),
          points: 0,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.message || 'Failed to enroll customer.');

      const created: LoyaltyMember | undefined = data.data;
      setEnrollOpen(false);
      setEnrollForm({ customerPhone: '', customerName: '' });

      if (created?._id) {
        const normalized: LoyaltyMember = {
          ...created,
          tier: created.tier || 'Bronze',
          points: created.points || 0,
          totalPointsEarned: created.totalPointsEarned || 0,
        };
        setMembers((prev) => [normalized, ...prev.filter((m) => m._id !== normalized._id)]);
        pickMember(normalized);
      }
      setSearch('');
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      setEnrollError(err?.message || 'Network error while enrolling customer.');
    } finally {
      setEnrolling(false);
    }
  };

  const ts = selected ? tierStyle(selected.tier) : null;
  const currentBalance = selected?.points || 0;

  return (
    <Portal>
      <div
        className="ub-fade fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:p-4"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ub-loyalty-title"
          onClick={(e) => e.stopPropagation()}
          className="ub-pop flex h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        >
          {/* Header */}
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-amber-400 via-orange-500 to-pink-500 px-5 pb-5 pt-4 text-white sm:px-6">
            <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/20 blur-2xl" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 left-10 h-40 w-40 rounded-full bg-yellow-200/25 blur-2xl" />
            <Star aria-hidden="true" className="pointer-events-none absolute right-24 top-5 h-5 w-5 rotate-12 text-white/30" fill="currentColor" />
            <Star aria-hidden="true" className="pointer-events-none absolute bottom-5 right-10 h-3.5 w-3.5 -rotate-12 text-white/30" fill="currentColor" />

            <div className="relative flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30">
                <Gift className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p id="ub-loyalty-title" className="text-lg font-black tracking-tight sm:text-xl">
                  {tr(lang, 'Loyalty rewards', 'लोयल्टी पुरस्कार')}
                </p>
                <p className="text-xs font-medium text-white/85">
                  {tr(lang, 'Find the customer and add points for this payment', 'ग्राहक खोजी यो भुक्तानीको अंक थप्नुहोस्')}
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label={tr(lang, 'Close loyalty', 'बन्द गर्नुहोस्')}
                className="cursor-pointer rounded-lg bg-white/15 p-1.5 outline-none transition hover:bg-white/25 focus-visible:ring-4 focus-visible:ring-white/40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold ring-1 ring-white/25">
                <Users className="h-3.5 w-3.5" />
                             {programMembers.length} {tr(lang, 'members', 'सदस्य')}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold ring-1 ring-white/25">
                <Star className="h-3.5 w-3.5" fill="currentColor" />
                {totalActivePoints} {tr(lang, 'active pts', 'सक्रिय अंक')}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold ring-1 ring-white/25">
                <Receipt className="h-3.5 w-3.5" />
                {tr(lang, 'Amount due', 'तिर्नुपर्ने')} NPR {money(amount)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-extrabold text-orange-600 shadow-sm">
                <Sparkles className="h-3.5 w-3.5" />
                {tr(lang, 'Suggested', 'सुझाव')} +{suggested} {tr(lang, 'pts', 'अंक')}
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="flex min-h-0 flex-1">
            {/* LEFT: search + list */}
            <div className={`${selected ? 'hidden md:flex' : 'flex'} min-h-0 w-full flex-col border-slate-100 md:w-[46%] md:border-r`}>
                            <div className="shrink-0 space-y-3 border-b border-slate-100 p-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">
                    {tr(lang, 'Loyalty program', 'लोयल्टी कार्यक्रम')}
                  </label>
                  {programsLoaded && programs.length === 0 ? (
                    <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-800">
                      {tr(
                        lang,
                        'No loyalty program yet. A Manager can create one in Settings → Manage Loyalty.',
                        'लोयल्टी कार्यक्रम छैन। सेटिङ → Manage Loyalty मा बनाउनुहोस्।'
                      )}
                    </p>
                  ) : (
                    <select
                      value={programId}
                      onChange={(e) => changeProgram(e.target.value)}
                      aria-label={tr(lang, 'Loyalty program', 'लोयल्टी कार्यक्रम')}
                      className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                    >
                      {programs.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.name} — {p.reward} ({p.pointsRequired} pts)
                        </option>
                      ))}
                    </select>
                  )}
                  {activeProgram && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      🎁 {activeProgram.reward} · ⭐ {activeProgram.pointsRequired} {tr(lang, 'points needed', 'अंक चाहिन्छ')}
                    </p>
                  )}
                </div>
                <div className="relative">
                  {loading ? (
                    <Loader2 className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-amber-500" aria-hidden="true" />
                  ) : (
                    <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  )}
                  <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={tr(lang, 'Search by name or phone number', 'नाम वा फोन नम्बरबाट खोज्नुहोस्')}
                    aria-label={tr(lang, 'Search loyalty customers', 'लोयल्टी ग्राहक खोज्नुहोस्')}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-9 text-sm outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-400/20"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      aria-label={tr(lang, 'Clear search', 'खोज हटाउनुहोस्')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-slate-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {!enrollOpen ? (
                  <button
                    type="button"
                    onClick={openEnroll}
                    className={`flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/60 py-2.5 text-xs font-bold text-amber-700 transition hover:border-amber-400 hover:bg-amber-50 active:scale-[0.99] ${FOCUS}`}
                  >
                    <UserPlus className="h-4 w-4" />
                    {tr(lang, 'Enroll new customer', 'नयाँ ग्राहक दर्ता')}
                  </button>
                ) : (
                  <div className="ub-fade space-y-2.5 rounded-2xl border border-amber-200 bg-white p-3.5 shadow-sm">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                      <UserPlus className="h-4 w-4 text-amber-500" />
                      {tr(lang, 'Enroll in loyalty', 'लोयल्टीमा दर्ता')}
                    </p>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="tel"
                        inputMode="tel"
                        value={enrollForm.customerPhone}
                        onChange={(e) => setEnrollForm((f) => ({ ...f, customerPhone: e.target.value }))}
                        placeholder={tr(lang, 'Phone number *', 'फोन नम्बर *')}
                        className={`${TEXT_INPUT} pl-10 font-mono`}
                        autoFocus
                      />
                    </div>
                    <div className="relative">
                      <Users className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={enrollForm.customerName}
                        onChange={(e) => setEnrollForm((f) => ({ ...f, customerName: e.target.value }))}
                        placeholder={tr(lang, 'Customer name', 'ग्राहकको नाम')}
                        className={`${TEXT_INPUT} pl-10`}
                      />
                    </div>
                    {enrollError && (
                      <p className="flex items-center gap-1 text-[11px] font-semibold text-rose-600">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {enrollError}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEnrollOpen(false)}
                        disabled={enrolling}
                        className={`flex-1 cursor-pointer rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 ${FOCUS}`}
                      >
                        {tr(lang, 'Cancel', 'रद्द')}
                      </button>
                      <button
                        type="button"
                        onClick={handleEnroll}
                        disabled={enrolling}
                        className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-xs font-bold text-white shadow-md shadow-orange-500/25 transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-70 ${FOCUS}`}
                      >
                        {enrolling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        {enrolling ? tr(lang, 'Enrolling…', 'दर्ता हुँदै…') : tr(lang, 'Enroll', 'दर्ता')}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="ub-scroll min-h-0 flex-1 overflow-y-auto p-3">
                {loading && members.length === 0 ? (
                  <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-[68px] animate-pulse rounded-2xl bg-slate-100" />
                    ))}
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-8 text-center">
                    <AlertTriangle className="h-7 w-7 text-rose-500" />
                    <p className="text-xs font-semibold text-rose-700">{error}</p>
                    <button
                      onClick={() => setReloadKey((k) => k + 1)}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 ${FOCUS}`}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {tr(lang, 'Try again', 'फेरि प्रयास')}
                    </button>
                  </div>
                ) : visibleMembers.length === 0 ? (
                  <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50/40 px-4 py-10 text-center">
                    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                      <Users className="h-7 w-7" />
                    </div>
                    <p className="text-sm font-bold text-slate-800">
                      {search ? tr(lang, 'No customer found', 'ग्राहक भेटिएन') : tr(lang, 'No loyalty members yet', 'अहिलेसम्म सदस्य छैनन्')}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {tr(lang, 'Enroll them now and add points to this payment.', 'अहिले दर्ता गरी अंक थप्नुहोस्।')}
                    </p>
                    {!enrollOpen && (
                      <button
                        onClick={openEnroll}
                        className={`mt-4 flex cursor-pointer items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-orange-500/25 transition hover:-translate-y-0.5 ${FOCUS}`}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        {search ? `${tr(lang, 'Enroll', 'दर्ता')} "${search.trim()}"` : tr(lang, 'Enroll customer', 'ग्राहक दर्ता')}
                      </button>
                    )}
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {visibleMembers.map((m, i) => {
                      const active = selected?._id === m._id;
                      const likely = isLikelyMatch(m);
                      const mts = tierStyle(m.tier);
                      return (
                        <li key={m._id} className="ub-rise" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                          <button
                            type="button"
                            onClick={() => pickMember(m)}
                            aria-pressed={active}
                            className={`group flex w-full cursor-pointer items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all ${
                              active
                                ? 'border-amber-400 bg-amber-50/70 shadow-sm'
                                : 'border-transparent bg-white hover:border-amber-200 hover:bg-amber-50/30'
                            } ${FOCUS}`}
                          >
                            <span
                              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradientFor(
                                memberDisplayName(m)
                              )} text-xs font-extrabold text-white shadow-sm`}
                              aria-hidden="true"
                            >
                              {initials(memberDisplayName(m))}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate text-sm font-bold text-slate-900">{memberDisplayName(m)}</span>
                                {likely && (
                                  <span className="shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-200">
                                    {tr(lang, 'Likely match', 'मिल्दो')}
                                  </span>
                                )}
                              </span>
                              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                                <span className="inline-flex items-center gap-1 font-mono">
                                  <Phone className="h-3 w-3" />
                                  {m.customerPhone}
                                </span>
                               
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="block font-mono text-base font-extrabold tabular-nums text-amber-600">{m.points || 0}</span>
                              <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">{tr(lang, 'pts', 'अंक')}</span>
                            </span>
                            <ChevronRight
                              className={`h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 ${active ? 'text-amber-500' : 'text-slate-300'}`}
                            />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* RIGHT: selected member + points */}
            <div className={`${selected ? 'flex' : 'hidden md:flex'} min-h-0 flex-1 flex-col bg-gradient-to-b from-slate-50/80 to-amber-50/30`}>
              {selected && ts ? (
                <>
                  <div className="ub-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className={`mb-3 flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 md:hidden ${FOCUS}`}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      {tr(lang, 'Back to customers', 'ग्राहक सूचीमा फर्कनुहोस्')}
                    </button>

                    {/* Loyalty card */}
                    <div key={selected._id} className={`ub-pop relative overflow-hidden rounded-3xl bg-gradient-to-br ${ts.card} p-5 text-white shadow-xl ${ts.shadow}`}>
                      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-14 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
                      <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_120%,rgba(255,255,255,0.18),transparent_55%)]" />

                      <div className="relative flex items-start justify-between">
                        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/80">
                          <Star className="h-3.5 w-3.5" fill="currentColor" />
                          {tr(lang, 'Loyalty card', 'लोयल्टी कार्ड')}
                        </p>
                        
                      </div>

                      <p className="relative mt-6 truncate text-2xl font-black tracking-tight">{memberDisplayName(selected)}</p>
                      <p className="relative mt-0.5 flex items-center gap-1.5 font-mono text-xs text-white/85">
                        <Phone className="h-3.5 w-3.5" />
                        {selected.customerPhone}
                      </p>

                      <div className="relative mt-5 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-white/15 px-3.5 py-2.5 ring-1 ring-white/20 backdrop-blur-sm">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-white/75">{tr(lang, 'Balance', 'ब्यालेन्स')}</p>
                          <p className="font-mono text-2xl font-black tabular-nums">{currentBalance}</p>
                        </div>
                        <div className="rounded-2xl bg-white/15 px-3.5 py-2.5 ring-1 ring-white/20 backdrop-blur-sm">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-white/75">{tr(lang, 'Lifetime earned', 'कुल कमाइ')}</p>
                          <p className="font-mono text-2xl font-black tabular-nums">{selected.totalPointsEarned || 0}</p>
                        </div>
                      </div>
                    </div>

                    {/* Points picker */}
                    <div className="mt-5 space-y-3.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                          <Award className="h-5 w-5 text-amber-500" />
                          {tr(lang, 'Points to add', 'थप्ने अंक')}
                        </p>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          1 {tr(lang, 'pt', 'अंक')} / NPR {NPR_PER_POINT}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPoints((p) => Math.max(p - 1, 0))}
                          aria-label={tr(lang, 'Decrease points', 'अंक घटाउनुहोस्')}
                          className={`flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 active:scale-95 ${FOCUS}`}
                        >
                          <Minus className="h-5 w-5" />
                        </button>
                        <div className="relative flex-1">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            value={points ? points : ''}
                            onChange={(e) => setPoints(Math.max(Math.floor(Number(e.target.value) || 0), 0))}
                            onFocus={(e) => e.currentTarget.select()}
                            placeholder="0"
                            aria-label={tr(lang, 'Points to add', 'थप्ने अंक')}
                            className="ub-no-spin h-14 w-full rounded-xl border-2 border-amber-200 bg-amber-50/40 text-center font-mono text-3xl font-black tabular-nums text-amber-600 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-400/20"
                          />
                          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold uppercase text-amber-400">
                            {tr(lang, 'pts', 'अंक')}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPoints((p) => p + 1)}
                          aria-label={tr(lang, 'Increase points', 'अंक बढाउनुहोस्')}
                          className={`flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 active:scale-95 ${FOCUS}`}
                        >
                          <Plus className="h-5 w-5" />
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {suggested > 0 && (
                          <button
                            type="button"
                            onClick={() => setPoints(suggested)}
                            aria-pressed={points === suggested}
                            className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold transition active:scale-95 ${FOCUS} ${
                              points === suggested
                                ? 'border-transparent bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-orange-500/25'
                                : 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300'
                            }`}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            {tr(lang, 'From bill', 'बिलबाट')} {suggested}
                          </button>
                        )}
                        {POINT_PRESETS.map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setPoints((p) => p + n)}
                            className={`cursor-pointer rounded-full border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs font-bold text-slate-600 transition hover:border-amber-300 hover:text-amber-700 active:scale-95 ${FOCUS}`}
                          >
                            +{n}
                          </button>
                        ))}
                        {points > 0 && (
                          <button
                            type="button"
                            onClick={() => setPoints(0)}
                            className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-bold text-slate-400 transition hover:text-rose-600 ${FOCUS}`}
                          >
                            {tr(lang, 'Clear', 'हटाउनुहोस्')}
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 ring-1 ring-inset ring-amber-100">
                        <span className="text-xs font-bold text-amber-800">{tr(lang, 'New balance', 'नयाँ ब्यालेन्स')}</span>
                        <span className="flex items-center gap-2 font-mono font-bold tabular-nums">
                          <span className="text-sm text-slate-400">{currentBalance}</span>
                          <ChevronRight className="h-4 w-4 text-amber-400" />
                          <span className="text-xl font-black text-amber-600">{currentBalance + points}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 border-t border-slate-100 bg-white p-4">
                    <button
                      type="button"
                      onClick={() => onConfirm(selected, points)}
                      disabled={points <= 0}
                      className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-pink-500 py-4 text-base font-bold text-white shadow-lg shadow-orange-500/30 transition-all hover:-translate-y-0.5 hover:shadow-orange-500/40 active:scale-[.99] disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none ${FOCUS}`}
                    >
                      <Gift className="h-5 w-5" />
                      {points > 0
                        ? tr(lang, `Add +${points} pts to this payment`, `यो भुक्तानीमा +${points} अंक थप्नुहोस्`)
                        : tr(lang, 'Choose points to add', 'अंक छान्नुहोस्')}
                    </button>
                    <p className="mt-2 text-center text-[11px] text-slate-400">
                      {tr(lang, 'Points are saved when the bills are marked as paid.', 'बिल भुक्तानी भएपछि अंक सुरक्षित हुन्छ।')}
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                  <div className="relative mb-4">
                    <div className="absolute inset-0 animate-pulse rounded-full bg-amber-300/40 blur-xl" />
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400 via-orange-500 to-pink-500 text-white shadow-xl shadow-orange-500/30">
                      <Star className="h-10 w-10" fill="currentColor" />
                    </div>
                  </div>
                  <p className="text-base font-bold text-slate-800">{tr(lang, 'Pick a customer', 'ग्राहक छान्नुहोस्')}</p>
                  <p className="mt-1 max-w-xs text-sm text-slate-500">
                    {tr(
                      lang,
                      'Select a loyalty member from the list to see their card and add points.',
                      'कार्ड हेर्न र अंक थप्न सूचीबाट सदस्य छान्नुहोस्।'
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ==========================================
// QR MODAL — only the wallet that was tapped, for only its own amount
// ==========================================

function PaymentQRModal({
  method,
  amount,
  onAmountChange,
  remaining,
  otherPayments,
  customerName,
  billNo,
  lang,
  onClose,
}: {
  method: MethodConfig;
  amount: number;
  onAmountChange: (value: number) => void;
  remaining: number;
  otherPayments: { label: string; amount: number; dot: string }[];
  customerName: string;
  billNo?: string;
  lang: Lang;
  onClose: () => void;
}) {
  const Icon = method.icon;
  return (
    <Portal>
      <div
        className="ub-fade fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ub-qr-title"
          onClick={(e) => e.stopPropagation()}
          className="ub-pop flex max-h-[95dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        >
          <div className={`relative shrink-0 bg-gradient-to-br ${method.style.header} px-6 pb-6 pt-5 text-white`}>
            <button
              onClick={onClose}
              aria-label={lang === 'en' ? 'Close QR' : 'QR बन्द गर्नुहोस्'}
              className="absolute right-4 top-4 cursor-pointer rounded-lg bg-white/15 p-1.5 outline-none transition hover:bg-white/25 focus-visible:ring-4 focus-visible:ring-white/40"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2.5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p id="ub-qr-title" className="text-lg font-extrabold">
                  {lang === 'en' ? `Pay with ${method.label}` : `${method.label} बाट भुक्तानी`}
                </p>
                <p className="text-xs font-medium text-white/80">{customerName}</p>
              </div>
            </div>
            <p className="mt-5 text-[11px] font-bold uppercase tracking-widest text-white/75">
              {lang === 'en' ? `Amount to pay with ${method.label}` : `${method.label} बाट तिर्ने रकम`}
            </p>
            <p className="font-mono text-4xl font-black tabular-nums tracking-tight">NPR {money(amount)}</p>
          </div>

          <div className="ub-scroll space-y-4 overflow-y-auto p-6">
            <div className="flex justify-center rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <BillQR key={method.id} method={method.id as WalletId} amount={amount} billNo={billNo} />
            </div>

            <div>
              <label htmlFor="ub-qr-amount" className="mb-1.5 block text-xs font-bold text-slate-600">
                {lang === 'en' ? `Change ${method.label} amount` : `${method.label} रकम बदल्नुहोस्`}
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">NPR</span>
                <input
                  id="ub-qr-amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={amount ? amount : ''}
                  onChange={(e) => onAmountChange(Number(e.target.value))}
                  onFocus={(e) => e.currentTarget.select()}
                  placeholder="0.00"
                  className="ub-no-spin w-full rounded-xl border border-slate-200 bg-white py-3 pl-12 pr-3 font-mono text-lg font-bold text-slate-900 outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-500/15"
                />
              </div>
            </div>

            {otherPayments.length > 0 && (
              <div className="space-y-1.5 rounded-2xl bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {lang === 'en' ? 'Paid with other methods' : 'अन्य विधिबाट'}
                </p>
                {otherPayments.map((p) => (
                  <div key={p.label} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-semibold text-slate-600">
                      <span className={`h-2 w-2 rounded-full ${p.dot}`} aria-hidden="true" />
                      {p.label}
                    </span>
                    <span className="font-mono font-bold text-slate-900">NPR {money(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {remaining > 0.01 && (
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {lang === 'en'
                  ? `NPR ${money(remaining)} still needs to be collected with another method.`
                  : `NPR ${money(remaining)} अर्को विधिबाट लिन बाँकी छ।`}
              </div>
            )}

            <button
              onClick={onClose}
              className={`w-full cursor-pointer rounded-2xl bg-gradient-to-r ${method.style.header} py-3.5 text-sm font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] ${FOCUS}`}
            >
              {lang === 'en' ? 'Done' : 'भयो'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ==========================================
// PRINTABLE MERGED BILL MODAL (80mm thermal)
// ==========================================

function MergedBillModal({
  group,
  lang,
  onClose,
  paidPaymentMethod,
  paidBreakdown,
  loyalty,
}: {
  group: GroupedPending;
  lang: Lang;
  onClose: () => void;
  paidPaymentMethod?: string | null;
  paidBreakdown?: { label: string; amount: number }[];
  loyalty?: BillLoyalty | null;
}) {
  const invoiceLabel = `PEND-${group.billIds.map((id) => id.slice(-4)).join('-')}`;
  const isPaidReceipt = !!paidPaymentMethod;

  const loggedInUser = getLoggedInUser();
  const displayRestaurantName = group.restaurantName || loggedInUser?.RESTAURANTName || 'Restaurant';
  const displayLocation = group.location || loggedInUser?.location || 'N/A';
  const displayPanOrVat = group.panOrVat || loggedInUser?.PanOrVat || loggedInUser?.panOrVat || 'N/A';

  return (
    <Portal>
      <div className="ub-fade fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <style>{`
          @media print {
            @page { size: 80mm auto; margin: 2mm; }
            html, body { width: 80mm; }
            body * { visibility: hidden; }
            #printable-merged-bill, #printable-merged-bill * { visibility: visible; }
            #printable-merged-bill {
              position: absolute; left: 0; top: 0;
              width: 76mm; max-width: 76mm; max-height: none !important;
              overflow: visible !important; border: none !important;
              box-shadow: none !important; background: #fff !important;
              padding: 0 !important; margin: 0 !important;
              font-size: 9px; line-height: 1.35;
            }
            #printable-merged-bill * {
              font-weight: 600 !important; color: #000 !important;
              -webkit-font-smoothing: antialiased;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #printable-merged-bill h3 { font-size: 12px; font-weight: 800 !important; }
            #printable-merged-bill h4 { font-size: 10px; font-weight: 700 !important; }
            #printable-merged-bill table { font-size: 8.5px; }
            #printable-merged-bill .pt-6 { padding-top: 10px; }
          }
        `}</style>

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="merged-bill-title"
          className="ub-pop flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl"
        >
          <div
            className={`flex shrink-0 items-center justify-between px-6 py-4 text-white ${
              isPaidReceipt ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600'
            }`}
          >
            <span id="merged-bill-title" className="flex items-center gap-2 text-sm font-bold">
              {isPaidReceipt ? <PartyPopper className="h-5 w-5" /> : <Receipt className="h-5 w-5" />}
              {isPaidReceipt
                ? lang === 'en' ? 'Payment successful' : 'भुक्तानी सफल'
                : lang === 'en' ? 'Combined pending bill' : 'संयुक्त बाँकी बिल'}
            </span>
            <button
              onClick={onClose}
              aria-label={lang === 'en' ? 'Close' : 'बन्द गर्नुहोस्'}
              className="cursor-pointer rounded-lg bg-white/15 p-1.5 transition-colors hover:bg-white/25"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 overflow-y-auto p-6">
            {isPaidReceipt && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {lang === 'en'
                  ? `Paid via ${paidPaymentMethod} • ${group.billIds.length} bill(s) settled`
                  : `${paidPaymentMethod} मार्फत भुक्तानी भयो • ${group.billIds.length} बिल मिलान भयो`}
              </div>
            )}

            {isPaidReceipt && loyalty && (
              loyalty.success ? (
                <div className="ub-pop flex items-center gap-3 rounded-xl bg-gradient-to-r from-amber-400 via-orange-500 to-pink-500 px-3.5 py-3 text-white shadow-md shadow-orange-500/25">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20">
                    <Star className="h-5 w-5" fill="currentColor" />
                  </span>
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="font-extrabold">
                      +{loyalty.points} {tr(lang, 'points added to', 'अंक थपियो —')} {loyalty.customerName}
                    </p>
                    <p className="text-white/85">
                      {tr(lang, 'New balance', 'नयाँ ब्यालेन्स')}: <span className="font-mono font-bold">{loyalty.balance}</span> {tr(lang, 'pts', 'अंक')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {tr(
                    lang,
                    `Loyalty points could not be added to ${loyalty.customerName}. Please add them from Settings → Manage Loyalty.`,
                    `${loyalty.customerName} मा अंक थप्न सकिएन। सेटिङबाट थप्नुहोस्।`
                  )}
                </div>
              )
            )}

            <div
              id="printable-merged-bill"
              className="max-h-[420px] space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-[#fcfbff] p-5 font-sans text-xs text-slate-800 shadow-inner"
            >
              <div className="space-y-0.5 border-b border-dashed border-slate-300 pb-2 text-center">
                <h3 className="text-sm font-extrabold uppercase tracking-tight text-slate-950">{displayRestaurantName}</h3>
                <p className="text-[10px] text-slate-500">{displayLocation}</p>
                <p className="text-[10px] font-semibold">PAN / VAT No: {displayPanOrVat}</p>
                <h4 className="mt-1.5 border-y border-slate-200 py-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-950">
                  {isPaidReceipt
                    ? lang === 'en' ? 'PAYMENT RECEIPT' : 'भुक्तानी रसिद'
                    : lang === 'en' ? 'COMBINED INVOICE' : 'संयुक्त बिजक'}
                </h4>
              </div>

              <div className="space-y-0.5 border-b border-slate-200 pb-2 text-[10px] leading-tight">
                <div className="flex justify-between gap-2">
                  <span>Invoice No: <span className="font-mono font-bold text-slate-950">{invoiceLabel}</span></span>
                  <span>Date: <span className="font-mono">{new Date().toLocaleString()}</span></span>
                </div>
                <div>
                  Bill To: <span className="font-bold text-slate-900">{group.billTo}</span>
                  {group.tableNumbers.length > 0 && (
                    <span className="ml-1 font-mono text-[10px] text-slate-500">(Tables {group.tableNumbers.join(', ')})</span>
                  )}
                </div>
                <div>
                  {lang === 'en' ? 'Merged from' : 'बाट मर्ज गरिएको'}:{' '}
                  <span className="font-semibold text-slate-950">
                    {group.billIds.length} {lang === 'en' ? 'bill(s)' : 'बिल(हरू)'}
                  </span>
                </div>
                {isPaidReceipt && (
                  <div>
                    {lang === 'en' ? 'Payment Method' : 'भुक्तानी विधि'}:{' '}
                    <span className="font-semibold text-slate-950">{paidPaymentMethod}</span>
                  </div>
                )}
              </div>

              <table className="w-full text-[10px] leading-tight">
                <thead>
                  <tr className="border-b border-slate-300 text-left font-bold text-slate-950">
                    <th className="pb-1">Item</th>
                    <th className="pb-1 text-center">Qty</th>
                    <th className="pb-1 text-right">Rate</th>
                    <th className="pb-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 border-b border-slate-300">
                  {group.mergedItems.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-1 font-bold text-slate-950">{item.itemName}</td>
                      <td className="py-1 text-center font-mono">{item.quantity}</td>
                      <td className="py-1 text-right font-mono">NPR {money(item.rate)}</td>
                      <td className="py-1 text-right font-mono">NPR {money(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="ml-auto max-w-[210px] space-y-0.5 text-[10px] leading-tight text-slate-700">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-mono">NPR {money(group.subtotal)}</span>
                </div>
                {group.discount > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>Discount:</span>
                    <span className="font-mono">-NPR {money(group.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium">
                  <span>Taxable Amount:</span>
                  <span className="font-mono">NPR {money(group.taxableAmount)}</span>
                </div>
                {group.vatCollected > 0 && (
                  <div className="flex justify-between">
                    <span>VAT:</span>
                    <span className="font-mono">NPR {money(group.vatCollected)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-400 pt-1 text-[11px] font-bold text-slate-950">
                  <span>GRAND TOTAL:</span>
                  <span className="font-mono text-purple-700">NPR {money(group.grandTotal)}</span>
                </div>
                {isPaidReceipt && paidBreakdown && paidBreakdown.length > 0 && (
                  <div className="space-y-0.5 border-t border-slate-200 pt-1">
                    {paidBreakdown.map((p) => (
                      <div className="flex justify-between" key={p.label}>
                        <span>Paid via {p.label}:</span>
                        <span className="font-mono">NPR {money(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {isPaidReceipt && (
                  <div className="flex justify-between pt-0.5 text-[10px] font-bold text-emerald-700">
                    <span>STATUS:</span>
                    <span>PAID ({paidPaymentMethod})</span>
                  </div>
                )}
                {isPaidReceipt && loyalty && loyalty.success && loyalty.points > 0 && (
                  <div className="space-y-0.5 border-t border-dashed border-slate-300 pt-1">
                    <div className="flex justify-between">
                      <span>Loyalty Member:</span>
                      <span>{loyalty.customerName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Points Earned:</span>
                      <span className="font-mono">+{loyalty.points}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Points Balance:</span>
                      <span className="font-mono">{loyalty.balance}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2 border-t border-dashed border-slate-300 pt-6 text-[9px]">
                <div className="text-center italic text-slate-500">Thank you, visit again!</div>
                <div className="pt-1 text-center font-semibold text-slate-500">Powered By: Atithi RMS by Cornor Tech Pvt. Ltd.</div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className={`cursor-pointer rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-700 transition-colors hover:bg-slate-50 ${FOCUS}`}
              >
                {lang === 'en' ? 'Close' : 'बन्द गर्नुहोस्'}
              </button>
              <button
                type="button"
                onClick={() => printReceipt('printable-merged-bill')}
                className={`flex cursor-pointer items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-purple-500/25 transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] ${FOCUS}`}
              >
                <Printer className="h-4 w-4" />
                {lang === 'en' ? 'Print invoice' : 'बिजक प्रिन्ट'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ==========================================
// MAIN UNPAID BILL PAGE
// ==========================================

export default function UnpaidBill({ lang = 'en' as Lang }: { lang?: Lang }) {
  const user = getLoggedInUser();
  const restaurantId = user?.id ? String(user.id) : '';
  const loyaltyRestaurantId = user?.id || user?.username ? String(user?.id || user?.username) : '';

  const [allBills, setAllBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  const [selectedMethods, setSelectedMethods] = useState<Set<PaymentMethod>>(new Set());
  const [paymentSplit, setPaymentSplit] = useState<PaymentSplit>({});
  const [qrMethod, setQrMethod] = useState<WalletId | null>(null);
  const [payTargetIds, setPayTargetIds] = useState<string[]>([]); // NEW: which bills are being paid right now

  const [printGroup, setPrintGroup] = useState<GroupedPending | null>(null);
  const [receiptPaymentMethod, setReceiptPaymentMethod] = useState<string | null>(null);
  const [receiptBreakdown, setReceiptBreakdown] = useState<{ label: string; amount: number }[]>([]);
  const [receiptLoyalty, setReceiptLoyalty] = useState<BillLoyalty | null>(null);
  const [, setTick] = useState(0);

  // Loyalty
  const [loyaltyOpen, setLoyaltyOpen] = useState(false);
  const [loyaltyMember, setLoyaltyMember] = useState<LoyaltyMember | null>(null);
  const [loyaltyPoints, setLoyaltyPoints] = useState<number>(0);

  const amountRefs = useRef<Partial<Record<PaymentMethod, HTMLInputElement | null>>>({});

  // Refresh "x ago" labels every minute
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60000);
    return () => window.clearInterval(id);
  }, []);

  const fetchBills = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const url = restaurantId ? `${BILLS_URL}?restaurantId=${encodeURIComponent(restaurantId)}` : BILLS_URL;
      const res = await fetch(url);
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to load bills.');
      }
      setAllBills(result.data || []);
    } catch (err: any) {
      setError(err.message || 'Could not connect to the server.');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  const pendingBills = useMemo(() => allBills.filter((b) => b.paymentMethod === 'Pending'), [allBills]);
  const groupedPending = useMemo(() => groupPendingBills(pendingBills), [pendingBills]);

  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? groupedPending.filter(
          (g) =>
            g.billTo.toLowerCase().includes(q) ||
            g.tableNumbers.some((t) => String(t).toLowerCase().includes(q))
        )
      : groupedPending;

    const sorted = [...filtered];
    if (sortMode === 'newest')
      sorted.sort((a, b) => new Date(b.earliestDate).getTime() - new Date(a.earliestDate).getTime());
    if (sortMode === 'oldest')
      sorted.sort((a, b) => new Date(a.earliestDate).getTime() - new Date(b.earliestDate).getTime());
    if (sortMode === 'highest') sorted.sort((a, b) => b.grandTotal - a.grandTotal);
    return sorted;
  }, [groupedPending, search, sortMode]);

  const selectedGroup = useMemo(
    () => groupedPending.find((g) => g.key === selectedKey) || null,
    [groupedPending, selectedKey]
  );



  // The bills actually being paid in this action (all of them, or a hand-picked subset)
  const payTarget = useMemo(() => {
    if (!selectedGroup) return null;
    const bills = selectedGroup.bills.filter((b) => payTargetIds.includes(b._id));
    return summarizeBills(bills);
  }, [selectedGroup, payTargetIds]);

  // Overview stats
  const stats = useMemo(() => {
    const total = groupedPending.reduce((s, g) => s + g.grandTotal, 0);
    const bills = groupedPending.reduce((s, g) => s + g.billIds.length, 0);
    const largest = groupedPending.reduce<GroupedPending | null>(
      (m, g) => (!m || g.grandTotal > m.grandTotal ? g : m),
      null
    );
    return { total, bills, customers: groupedPending.length, largest };
  }, [groupedPending]);

  // Reset payment + loyalty whenever another customer is opened
  useEffect(() => {
    setSelectedMethods(new Set());
    setPaymentSplit({});
    setQrMethod(null);
    setLoyaltyOpen(false);
    setLoyaltyMember(null);
    setLoyaltyPoints(0);
    setPayTargetIds(selectedGroup ? selectedGroup.billIds : []); // default: pay the whole tab
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  // Lock page scroll while the settle window is open
  useEffect(() => {
    if (!selectedGroup) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [selectedGroup]);

  const grandTotal = payTarget?.grandTotal ?? 0;
  const suggestedLoyaltyPoints = suggestedPoints(grandTotal);

  const totalPaid = useMemo(
    () => Object.values(paymentSplit).reduce((s, v) => s + (Number(v) || 0), 0),
    [paymentSplit]
  );
  const remainingBalance = Math.max(Number((grandTotal - totalPaid).toFixed(2)), 0);
  const overpaidBy = totalPaid > grandTotal ? Number((totalPaid - grandTotal).toFixed(2)) : 0;
  const isFullyPaid = remainingBalance <= 0.01 && totalPaid > 0;

  // A bill can only be marked paid when the full amount is covered
  const canMarkPaid = !!selectedGroup && !submitting && payTargetIds.length > 0 && selectedMethods.size > 0 && isFullyPaid;

  const handleSelectGroup = (g: GroupedPending) => {
    setError('');
    setSelectedKey(g.key);
  };

  const closeSettle = () => {
    if (submitting) return;
    setSelectedKey(null);
  };

  const toggleMethod = (id: PaymentMethod) => {
    const next = new Set(selectedMethods);

    if (selectedMethods.has(id)) {
      next.delete(id);
      setPaymentSplit((split) => {
        const { [id]: _drop, ...rest } = split;
        return rest;
      });
      if (qrMethod === id) setQrMethod(null);
      setSelectedMethods(next);
      return;
    }

    // New method starts with whatever is still unpaid; the field is focused + selected
    next.add(id);
    setSelectedMethods(next);
    setPaymentSplit((split) => ({
      ...split,
      [id]: Number(Math.max(remainingBalance, 0).toFixed(2)),
    }));
    window.setTimeout(() => {
      const el = amountRefs.current[id];
      el?.focus();
      el?.select();
    }, 60);
  };

  const updateSplitAmount = (id: PaymentMethod, value: number) => {
    const safeValue = Math.max(Number.isFinite(value) ? value : 0, 0);
    setPaymentSplit((split) => ({ ...split, [id]: safeValue }));
  };

  const fillRemaining = (id: PaymentMethod) => {
    const current = paymentSplit[id] ?? 0;
    setPaymentSplit((split) => ({
      ...split,
      [id]: Number((current + remainingBalance).toFixed(2)),
    }));
  };

  const handleLoyaltyConfirm = (member: LoyaltyMember, points: number) => {
    setLoyaltyMember(member);
    setLoyaltyPoints(Math.max(Math.floor(points), 0));
    setLoyaltyOpen(false);
  };

  const removeLoyalty = () => {
    setLoyaltyMember(null);
    setLoyaltyPoints(0);
  };

  const openPrintPreview = () => {
    if (!selectedGroup) return;
    setReceiptPaymentMethod(null);
    setReceiptBreakdown([]);
    setReceiptLoyalty(null);
    setPrintGroup(selectedGroup);
  };

  const closeModal = () => {
    setPrintGroup(null);
    setReceiptPaymentMethod(null);
    setReceiptBreakdown([]);
    setReceiptLoyalty(null);
  };

  // Escape: close the top-most layer first
  useEffect(() => {
    if (!selectedGroup && !printGroup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (loyaltyOpen) setLoyaltyOpen(false);
      else if (qrMethod) setQrMethod(null);
      else if (printGroup) closeModal();
      else if (!submitting) setSelectedKey(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedGroup, printGroup, qrMethod, submitting, loyaltyOpen]);

   const handleMarkPaid = async () => {
    if (!selectedGroup || !payTarget || !canMarkPaid) return;
    setSubmitting(true);
    setError('');

    const target = payTarget;
    const methodLabel = selectedMethods.size > 1 ? 'Split' : Array.from(selectedMethods)[0] ?? 'Cash';
    const member = loyaltyMember;
    const pointsToAdd = member ? Math.max(Math.floor(loyaltyPoints), 0) : 0;

    const cashTotal = paymentSplit.Cash ?? 0;
    const eSewaTotal = paymentSplit.eSewa ?? 0;
    const khaltiTotal = paymentSplit.Khalti ?? 0;
    const fonepayTotal = paymentSplit.Fonepay ?? 0;

    try {
      const results = await Promise.allSettled(
        target.billIds.map((id) => {
          const bill = target.bills.find((b) => b._id === id);
          const billShare = target.grandTotal > 0 ? (bill?.grandTotal ?? 0) / target.grandTotal : 0;

          return fetch(`${BILLS_URL}/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paymentMethod: methodLabel,
              cashPaidMoney: Number((cashTotal * billShare).toFixed(2)),
              eSewaPaidMoney: Number((eSewaTotal * billShare).toFixed(2)),
              khaltiPaidMoney: Number((khaltiTotal * billShare).toFixed(2)),
              fonepayPaidMoney: Number((fonepayTotal * billShare).toFixed(2)),
            }),
          }).then(async (res) => {
            const data = await res.json();
            if (!res.ok || !data?.success) {
              throw new Error(data?.message || `Failed to update bill ${id}`);
            }
            return data;
          });
        })
      );

      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        throw new Error(
          `${failures.length} of ${target.billIds.length} bill(s) failed to update. This is usually a server CORS/connection issue — refresh and retry.`
        );
      }

      const orderResults = await Promise.allSettled(
        target.orderIds.map((orderId) =>
          fetch(`${ORDERS_URL}/${orderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentStatus: 'Paid' }),
          }).then(async (res) => {
            const data = await res.json();
            if (!res.ok || !data?.success) {
              throw new Error(data?.message || `Failed to update order ${orderId}`);
            }
            return data;
          })
        )
      );

      const orderFailures = orderResults.filter((r) => r.status === 'rejected');
      if (orderFailures.length > 0) {
        console.error('Some linked orders failed to update:', orderFailures);
      }

      // Award loyalty points (never blocks the payment if it fails)
      let loyaltyResult: BillLoyalty | null = null;
      if (member && pointsToAdd > 0) {
        const base = {
          memberId: member._id,
          customerName: memberDisplayName(member),
          customerPhone: String(member.customerPhone || ''),
          points: pointsToAdd,
        };
        try {
          const lr = await fetch(`${LOYALTY_URL}/${member._id}/points`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ADD', points: pointsToAdd }),
          });
          const ld = await lr.json().catch(() => null);
          if (!lr.ok || !ld?.success) throw new Error(ld?.message || 'Failed to add loyalty points.');
          const newBalance =
            typeof ld?.data?.points === 'number' ? ld.data.points : (member.points || 0) + pointsToAdd;
          loyaltyResult = { ...base, balance: newBalance, success: true };
        } catch (lerr: any) {
          console.error('Loyalty update failed:', lerr);
          loyaltyResult = { ...base, balance: member.points || 0, success: false, error: lerr?.message };
        }
      }

      const breakdown = [
        { label: 'Cash', amount: cashTotal },
        { label: 'eSewa', amount: eSewaTotal },
        { label: 'Khalti', amount: khaltiTotal },
        { label: 'Fonepay', amount: fonepayTotal },
      ].filter((p) => p.amount > 0);

      setAllBills((prev) => prev.filter((b) => !target.billIds.includes(b._id)));

      const remainingInGroup = selectedGroup.billIds.filter((id) => !target.billIds.includes(id));

      setSelectedMethods(new Set());
      setPaymentSplit({});
      setQrMethod(null);
      setLoyaltyOpen(false);
      setLoyaltyMember(null);
      setLoyaltyPoints(0);

      if (remainingInGroup.length === 0) {
        setSelectedKey(null); // whole tab settled — close the modal
      } else {
        setPayTargetIds(remainingInGroup); // some bills left — keep modal open, re-select what's left
      }

      setPrintGroup({ ...selectedGroup, ...target }); // receipt shows only what was just paid
      setReceiptPaymentMethod(methodLabel);
      setReceiptBreakdown(breakdown);
      setReceiptLoyalty(loyaltyResult);
    } catch (err: any) {
      setError(err.message || 'Could not update payment status. Please try again.');
      window.setTimeout(() => setError(''), 8000);
    } finally {
      setSubmitting(false);
    }
  };

  const cycleSort = () =>
    setSortMode((m) => (m === 'newest' ? 'oldest' : m === 'oldest' ? 'highest' : 'newest'));

  const sortLabel =
    sortMode === 'newest'
      ? lang === 'en' ? 'Newest' : 'नयाँ'
      : sortMode === 'oldest'
      ? lang === 'en' ? 'Oldest' : 'पुराना'
      : lang === 'en' ? 'Highest amount' : 'धेरै रकम';

  // ---------- QR data ----------
  const qrConfig = qrMethod ? METHOD_BY_ID[qrMethod] : null;
  const qrAmount = qrMethod ? paymentSplit[qrMethod] ?? 0 : 0;
  const qrOthers = qrMethod
    ? PAYMENT_METHODS.filter((m) => m.id !== qrMethod && selectedMethods.has(m.id) && (paymentSplit[m.id] ?? 0) > 0).map(
        (m) => ({ label: m.label, amount: paymentSplit[m.id] ?? 0, dot: m.style.dot })
      )
    : [];
  const qrBillNo = selectedGroup ? `PEND-${selectedGroup.billIds.map((id) => id.slice(-4)).join('-')}` : undefined;

  const totalQty = selectedGroup ? selectedGroup.mergedItems.reduce((s, i) => s + i.quantity, 0) : 0;

  // ---------- Footer ----------
  const renderFooter = (compact: boolean) =>
    selectedGroup && (
      <div className="space-y-3">
        {error && (
          <div role="alert" className="ub-fade flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} aria-label="Dismiss" className="cursor-pointer text-rose-400 hover:text-rose-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

              {!compact && (
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>{lang === 'en' ? 'Subtotal' : 'उप-जम्मा'}</span>
              <span className="font-mono">NPR {money(payTarget?.subtotal ?? 0)}</span>
            </div>
            {(payTarget?.discount ?? 0) > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>{lang === 'en' ? 'Discount' : 'छुट'}</span>
                <span className="font-mono">-NPR {money(payTarget?.discount ?? 0)}</span>
              </div>
            )}
            {(payTarget?.vatCollected ?? 0) > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>{lang === 'en' ? 'VAT' : 'भ्याट'}</span>
                <span className="font-mono">NPR {money(payTarget?.vatCollected ?? 0)}</span>
              </div>
            )}
          </div>
        )}

        {loyaltyMember && loyaltyPoints > 0 && (
          <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-2 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-100">
            <span className="flex min-w-0 items-center gap-1.5">
              <Star className="h-3.5 w-3.5 shrink-0" fill="currentColor" />
              <span className="truncate">
                {tr(lang, 'Loyalty', 'लोयल्टी')} · {memberDisplayName(loyaltyMember)}
              </span>
            </span>
            <span className="shrink-0 font-mono">+{loyaltyPoints} {tr(lang, 'pts', 'अंक')}</span>
          </div>
        )}

        <div className={`flex items-baseline justify-between ${compact ? '' : 'border-t border-dashed border-slate-200 pt-2.5'}`}>
          <span className="text-sm font-extrabold text-slate-900">{lang === 'en' ? 'Amount due' : 'तिर्नुपर्ने रकम'}</span>
          <span className="font-mono text-2xl font-extrabold tabular-nums tracking-tight text-purple-700 lg:text-3xl">
            NPR {money(selectedGroup.grandTotal)}
          </span>
        </div>

        {selectedMethods.size > 0 && (
          <SplitBar
            split={paymentSplit}
            selected={selectedMethods}
            grandTotal={grandTotal}
            totalPaid={totalPaid}
            remaining={remainingBalance}
            overpaid={overpaidBy}
            isFullyPaid={isFullyPaid}
            lang={lang}
          />
        )}

        <button
          type="button"
          onClick={handleMarkPaid}
          disabled={!canMarkPaid}
          aria-busy={submitting}
          className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 py-4 text-base font-bold text-white shadow-lg shadow-purple-500/30 transition-all hover:-translate-y-0.5 hover:shadow-purple-500/40 active:scale-[.99] disabled:cursor-not-allowed disabled:translate-y-0 disabled:bg-none disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none ${FOCUS}`}
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                    {submitting
            ? lang === 'en' ? 'Marking as paid…' : 'भुक्तानी हुँदै…'
            : lang === 'en'
            ? `Mark ${payTargetIds.length} bill${payTargetIds.length !== 1 ? 's' : ''} as paid`
            : `${payTargetIds.length} बिल भुक्तानी भएको चिन्ह लगाउनुहोस्`}
        </button>

        {!canMarkPaid && !submitting && (
          <p className="-mt-1 text-center text-xs text-slate-400">
            {selectedMethods.size === 0
              ? lang === 'en' ? 'Choose how the customer is paying' : 'भुक्तानी विधि छान्नुहोस्'
              : lang === 'en' ? 'The amounts must add up to the amount due' : 'पूरा रकम पुग्ने गरी प्रविष्ट गर्नुहोस्'}
          </p>
        )}
      </div>
    );

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <div className="flex flex-col gap-6" id="unpaid-bill-root">
      <style>{`
        @keyframes ub-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ub-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ub-pop { from { opacity: 0; transform: scale(.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes ub-sheet { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
        .ub-rise { animation: ub-rise .35s ease-out both; }
        .ub-fade { animation: ub-fade .2s ease-out both; }
        .ub-pop { animation: ub-pop .25s cubic-bezier(.22,1,.36,1) both; }
        .ub-sheet { animation: ub-sheet .32s cubic-bezier(.22,1,.36,1) both; }
        .ub-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .ub-scroll::-webkit-scrollbar-thumb { background: #e9d5ff; border-radius: 999px; }
        .ub-scroll { scrollbar-width: thin; scrollbar-color: #e9d5ff transparent; }
        .ub-no-spin::-webkit-outer-spin-button, .ub-no-spin::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .ub-no-spin { -moz-appearance: textfield; }
        @media (prefers-reduced-motion: reduce) { .ub-rise, .ub-fade, .ub-pop, .ub-sheet { animation: none; } }
      `}</style>

      {/* ================= HEADER ================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/30">
            <Clock className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-900">
              {lang === 'en' ? 'Pending Bills' : 'बाँकी बिलहरू'}
            </h2>
            <p className="text-sm text-slate-500">
              {lang === 'en'
                ? 'Bills under the same name are combined, so each customer pays once.'
                : 'उही नामका बिलहरू एउटै बिजकमा मिसिन्छन्।'}
            </p>
          </div>
        </div>
        <button
          onClick={fetchBills}
          disabled={loading}
          aria-label={lang === 'en' ? 'Refresh bills' : 'रिफ्रेस'}
          className={`flex h-[42px] shrink-0 cursor-pointer items-center gap-2 self-start rounded-xl border border-purple-100 bg-white px-3.5 text-sm font-semibold text-purple-700 shadow-sm transition-all hover:bg-purple-50 active:scale-[0.97] disabled:opacity-60 sm:self-auto ${FOCUS}`}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {lang === 'en' ? 'Refresh' : 'रिफ्रेस'}
        </button>
      </div>

      {/* ================= STATS ================= */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile tone="violet" icon={TrendingUp} label={lang === 'en' ? 'Total outstanding' : 'कुल बाँकी'} value={`NPR ${moneyCompact(stats.total)}`} />
        <StatTile tone="sky" icon={Users} label={lang === 'en' ? 'Customers' : 'ग्राहक'} value={String(stats.customers)} />
        <StatTile tone="emerald" icon={Layers} label={lang === 'en' ? 'Open bills' : 'खुला बिल'} value={String(stats.bills)} />
        <StatTile
          tone="amber"
          icon={Sparkles}
          label={lang === 'en' ? 'Largest tab' : 'सबैभन्दा ठूलो'}
          value={stats.largest ? `NPR ${moneyCompact(stats.largest.grandTotal)}` : '—'}
          sub={stats.largest?.billTo}
        />
      </div>

      {error && !selectedGroup && (
        <div role="alert" className="ub-fade flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 shadow-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss" className="cursor-pointer text-rose-400 hover:text-rose-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ================= PENDING CUSTOMERS ================= */}
      <section className={`${CARD} p-4 sm:p-5`} aria-labelledby="pending-customers-title">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="mr-auto flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-purple-500" aria-hidden="true" />
            <h3 id="pending-customers-title" className="text-sm font-bold text-slate-900">
              {lang === 'en' ? 'Customers with pending bills' : 'बाँकी ग्राहकहरू'}
            </h3>
            <span className="rounded-full bg-purple-50 px-2 py-0.5 font-mono text-[11px] font-bold text-purple-700 ring-1 ring-inset ring-purple-100">
              {visibleGroups.length}
            </span>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={lang === 'en' ? 'Search name or table' : 'नाम वा टेबल खोज्नुहोस्'}
              aria-label={lang === 'en' ? 'Search customers' : 'ग्राहक खोज्नुहोस्'}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-9 text-sm outline-none transition placeholder:text-slate-400 focus:border-purple-500 focus:bg-white focus:ring-4 focus:ring-purple-500/15"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <button
            onClick={cycleSort}
            className={`flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-600 transition hover:border-purple-300 hover:text-purple-700 active:scale-[0.97] ${FOCUS}`}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortLabel}
          </button>
        </div>

        {loading && allBills.length === 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[190px] animate-pulse rounded-2xl border border-slate-100 bg-slate-50" />
            ))}
          </div>
        ) : groupedPending.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 px-6 py-16 text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
              <PartyPopper className="h-8 w-8" />
            </div>
            <p className="text-base font-bold text-emerald-800">{lang === 'en' ? 'All caught up' : 'सबै भुक्तानी भइसक्यो!'}</p>
            <p className="mt-1 text-sm text-emerald-700/70">
              {lang === 'en' ? 'Bills saved as "Pay later" will appear here.' : 'अहिले कुनै बाँकी बिल छैन'}
            </p>
          </div>
        ) : visibleGroups.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 py-14 text-center">
            <Search className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">
              {lang === 'en' ? 'No customers match' : 'खोजसँग मिल्ने ग्राहक भेटिएन'}
            </p>
            <button
              onClick={() => setSearch('')}
              className={`mt-3 cursor-pointer rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-700 ${FOCUS}`}
            >
              {lang === 'en' ? 'Clear search' : 'खोज हटाउनुहोस्'}
            </button>
          </div>
        ) : (
                   <PendingCustomersTable groups={visibleGroups} onSelect={handleSelectGroup} lang={lang} />
        )}
      </section>

      {/* ================= FULL-SCREEN SETTLE WINDOW ================= */}
            {selectedGroup && (
        <Portal>
          <div
            className="ub-fade fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
            onClick={closeSettle}
          >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settle-window-title"
            onClick={(e) => e.stopPropagation()}
            className="ub-pop flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-[#fbfaff] font-sans text-slate-800 shadow-2xl antialiased"
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -left-32 -top-40 h-96 w-96 rounded-full bg-purple-300/25 blur-3xl" />
              <div className="absolute -bottom-40 right-1/3 h-96 w-96 rounded-full bg-amber-200/25 blur-3xl" />
            </div>

            {/* Header */}
            <header className="relative z-10 flex shrink-0 items-center gap-3 border-b border-purple-100 bg-white/85 px-4 py-3.5 backdrop-blur-xl sm:px-6 lg:px-8">
              <button
                onClick={closeSettle}
                disabled={submitting}
                aria-label={lang === 'en' ? 'Back to pending customers' : 'फर्कनुहोस्'}
                className={`flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-purple-700 active:scale-[0.96] disabled:opacity-50 ${FOCUS}`}
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">{lang === 'en' ? 'Back' : 'फर्कनुहोस्'}</span>
              </button>
              <div
                className={`hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradientFor(
                  selectedGroup.billTo
                )} text-base font-extrabold text-white shadow-md sm:flex`}
                aria-hidden="true"
              >
                {initials(selectedGroup.billTo)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-600">
                  {lang === 'en' ? 'Settle pending bills' : 'बाँकी बिल मिलान'}
                </p>
                <h2 id="settle-window-title" className="truncate text-lg font-black tracking-tight text-slate-900 sm:text-xl">
                  {selectedGroup.billTo}
                </h2>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {selectedGroup.tableNumbers.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-purple-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-purple-700">
                      <Hash className="h-2.5 w-2.5" />
                      {selectedGroup.tableNumbers.join(', ')}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                    <Clock className="h-2.5 w-2.5" />
                    {lang === 'en' ? 'Since' : 'देखि'} {timeAgo(selectedGroup.earliestDate, lang).text}
                  </span>
                  <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                    {selectedGroup.billIds.length} {lang === 'en' ? 'bills merged' : 'बिल मर्ज'}
                  </span>
                  {loyaltyMember && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-inset ring-amber-200">
                      <Star className="h-2.5 w-2.5" fill="currentColor" />
                      +{loyaltyPoints} {tr(lang, 'pts', 'अंक')}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={openPrintPreview}
                className={`hidden cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-purple-300 hover:text-purple-700 active:scale-[0.97] sm:flex ${FOCUS}`}
              >
                <Printer className="h-4 w-4" />
                {lang === 'en' ? 'Print' : 'प्रिन्ट'}
              </button>
              <div className="hidden rounded-2xl border border-purple-100 bg-purple-50/70 px-4 py-2 text-right md:block">
                <p className="text-[10px] font-bold uppercase tracking-widest text-purple-500">
                  {lang === 'en' ? 'Amount due' : 'तिर्नुपर्ने रकम'}
                </p>
                <p className="font-mono text-2xl font-extrabold tabular-nums text-purple-700">NPR {money(selectedGroup.grandTotal)}</p>
              </div>
              <button
                onClick={closeSettle}
                disabled={submitting}
                aria-label={lang === 'en' ? 'Close' : 'बन्द गर्नुहोस्'}
                className={`cursor-pointer rounded-xl p-2.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 ${FOCUS}`}
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            {/* Body */}
            <div className="ub-scroll relative z-10 min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(440px,520px)] lg:overflow-hidden">
              {/* LEFT: merged items + bills list */}
              <div className="ub-scroll flex flex-col gap-5 p-4 sm:p-6 lg:min-h-0 lg:overflow-y-auto lg:p-8">
                {/* Merged items — fills height */}
                <section className={`${CARD} flex min-h-[320px] flex-col overflow-hidden lg:flex-1`} aria-labelledby="merged-items-title">
                  <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
                    <h3 id="merged-items-title" className="flex items-center gap-2 text-base font-bold text-slate-900">
                      <Receipt className="h-5 w-5 text-purple-600" />
                      {lang === 'en' ? 'Items (all bills combined)' : 'परिकारहरू (मर्ज गरिएको)'}
                    </h3>
                    <span className="rounded-full bg-purple-50 px-3 py-1 font-mono text-xs font-bold text-purple-700">
                      {totalQty} {lang === 'en' ? 'qty' : 'मात्रा'}
                    </span>
                  </div>
                  <div className="ub-scroll min-h-0 flex-1 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th scope="col" className="px-5 py-3 text-left font-semibold">{lang === 'en' ? 'Item' : 'परिकार'}</th>
                          <th scope="col" className="px-3 py-3 text-center font-semibold">{lang === 'en' ? 'Qty' : 'मात्रा'}</th>
                          <th scope="col" className="px-3 py-3 text-right font-semibold">{lang === 'en' ? 'Rate' : 'दर'}</th>
                          <th scope="col" className="px-5 py-3 text-right font-semibold">{lang === 'en' ? 'Total' : 'जम्मा'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedGroup.mergedItems.map((item, idx) => (
                          <tr key={idx} className="transition-colors hover:bg-purple-50/40">
                            <td className="px-5 py-3.5 font-semibold text-slate-800">{item.itemName}</td>
                            <td className="px-3 py-3.5 text-center">
                              <span className="rounded-lg bg-purple-50 px-2.5 py-1 font-mono text-xs font-bold text-purple-700">{item.quantity}</span>
                            </td>
                            <td className="px-3 py-3.5 text-right font-mono text-slate-500">{money(item.rate)}</td>
                            <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-900">{money(item.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="shrink-0 space-y-1 border-t border-slate-100 bg-slate-50/70 px-5 py-3.5 text-sm">
                    <div className="flex justify-between">
                      <span className="font-bold text-slate-500">{lang === 'en' ? 'Subtotal' : 'उप-जम्मा'}</span>
                      <span className="font-mono font-bold text-slate-900">NPR {money(selectedGroup.subtotal)}</span>
                    </div>
                    {selectedGroup.discount > 0 && (
                      <div className="flex justify-between text-rose-600">
                        <span className="font-semibold">{lang === 'en' ? 'Discount already applied' : 'छुट'}</span>
                        <span className="font-mono">-NPR {money(selectedGroup.discount)}</span>
                      </div>
                    )}
                    {selectedGroup.vatCollected > 0 && (
                      <div className="flex justify-between text-slate-500">
                        <span className="font-semibold">{lang === 'en' ? 'VAT' : 'भ्याट'}</span>
                        <span className="font-mono">NPR {money(selectedGroup.vatCollected)}</span>
                      </div>
                    )}
                  </div>
                </section>
                {/* Bills in this tab */}
                <section className={`${CARD} shrink-0 overflow-hidden`} aria-labelledby="merged-bills-title">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <h3 id="merged-bills-title" className="flex items-center gap-2 text-base font-bold text-slate-900">
                      <FileText className="h-5 w-5 text-amber-500" />
                      {lang === 'en' ? 'Bills in this tab' : 'यस खातामा बिलहरू'}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPayTargetIds(selectedGroup.billIds)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                      >
                        {lang === 'en' ? 'Select all' : 'सबै छान्नुहोस्'}
                      </button>
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                        {payTargetIds.length}/{selectedGroup.bills.length} {lang === 'en' ? 'selected' : 'छानिएको'}
                      </span>
                    </div>
                  </div>
                  <ul className="ub-scroll max-h-64 divide-y divide-slate-100 overflow-y-auto">
                    {selectedGroup.bills.map((b) => {
                      const when = b.date || b.createdAt || '';
                      const qty = (b.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
                      const checked = payTargetIds.includes(b._id);
                      return (
                        <li key={b._id} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-amber-50/40">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setPayTargetIds((prev) =>
                                e.target.checked ? [...prev, b._id] : prev.filter((id) => id !== b._id)
                              )
                            }
                            className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-purple-600 focus:ring-purple-400"
                            aria-label={`${lang === 'en' ? 'Include bill' : 'बिल समावेश गर्नुहोस्'} ${b.invoiceNo}`}
                          />
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100">
                            <Receipt className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-mono text-xs font-bold text-slate-800">{b.invoiceNo}</p>
                            <p className="truncate text-[11px] text-slate-500">
                              {when ? new Date(when).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                              {b.tableNumber ? ` · ${lang === 'en' ? 'Table' : 'टेबल'} ${b.tableNumber}` : ''}
                              {` · ${qty} ${lang === 'en' ? 'items' : 'परिकार'}`}
                            </p>
                          </div>
                          <span className="shrink-0 font-mono text-sm font-bold text-slate-900">NPR {money(b.grandTotal)}</span>
                          <button
                            type="button"
                            onClick={() => setPayTargetIds([b._id])}
                            className="shrink-0 rounded-lg border border-purple-200 px-2.5 py-1.5 text-[11px] font-bold text-purple-700 transition hover:bg-purple-50"
                          >
                            {lang === 'en' ? 'Pay only this' : 'यही तिर्नुहोस्'}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </div>

              {/* RIGHT: payment */}
              <aside className="flex flex-col border-purple-100 bg-white/90 backdrop-blur-xl lg:min-h-0 lg:border-l" aria-labelledby="ub-payment-title">
                <div className="ub-scroll space-y-4 p-4 sm:p-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <h3 id="ub-payment-title" className="flex items-center gap-2 text-base font-bold text-slate-900">
                      <Wallet className="h-5 w-5 text-purple-600" />
                      {lang === 'en' ? 'Collect payment' : 'भुक्तानी लिनुहोस्'}
                    </h3>
                    {selectedMethods.size > 1 && (
                      <span className="rounded-full bg-purple-50 px-2.5 py-1 text-[10px] font-bold text-purple-700 ring-1 ring-inset ring-purple-100">
                        {lang === 'en' ? `Split across ${selectedMethods.size}` : 'विभाजित भुक्तानी'}
                      </span>
                    )}
                  </div>

                  {selectedMethods.size === 0 && (
                    <div className="flex items-start gap-2.5 rounded-2xl bg-purple-50/70 px-4 py-3 text-xs text-purple-900 ring-1 ring-inset ring-purple-100">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-purple-600" />
                      <span>
                        {lang === 'en'
                          ? 'Paying with more than one method? Select each one and enter how much the customer pays with it.'
                          : 'एकभन्दा बढी विधिबाट तिर्दै हुनुहुन्छ? प्रत्येक विधि छान्नुहोस् र रकम लेख्नुहोस्।'}
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {PAYMENT_METHODS.map((pm) => {
                      const Icon = pm.icon;
                      const isActive = selectedMethods.has(pm.id);
                      const amount = paymentSplit[pm.id] ?? 0;
                      return (
                        <div
                          key={pm.id}
                          className={`rounded-2xl border-2 transition-all duration-200 ${
                            isActive ? pm.style.activeCard : 'border-slate-200 bg-white hover:border-purple-200 hover:shadow-sm'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleMethod(pm.id)}
                            aria-pressed={isActive}
                            className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl p-3.5 text-left ${FOCUS}`}
                          >
                            <span
                              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
                                isActive ? pm.style.iconActive : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              <Icon className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={`block text-sm font-bold ${isActive ? pm.style.text : 'text-slate-800'}`}>{pm.label}</span>
                              <span className="block truncate text-[11px] text-slate-500">
                                {isActive && amount > 0 ? `NPR ${money(amount)}` : pm.hint[lang]}
                              </span>
                            </span>
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                                isActive ? `border-transparent ${pm.style.iconActive}` : 'border-slate-300'
                              }`}
                              aria-hidden="true"
                            >
                              {isActive && <CheckCircle2 className="h-3.5 w-3.5" />}
                            </span>
                          </button>

                          {isActive && (
                            <div className="ub-fade space-y-2 px-3.5 pb-3.5">
                              <label htmlFor={`ub-amt-${pm.id}`} className="block text-[11px] font-bold text-slate-600">
                                {lang === 'en' ? `Amount paid with ${pm.label}` : `${pm.label} बाट तिरेको रकम`}
                              </label>
                              <div className="relative">
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">NPR</span>
                                <input
                                  id={`ub-amt-${pm.id}`}
                                  ref={(el) => {
                                    amountRefs.current[pm.id] = el;
                                  }}
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step="0.01"
                                  value={amount ? amount : ''}
                                  onChange={(e) => updateSplitAmount(pm.id, Number(e.target.value))}
                                  onFocus={(e) => e.currentTarget.select()}
                                  placeholder="0.00"
                                  className="ub-no-spin w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-3 font-mono text-lg font-bold text-slate-900 outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-500/15"
                                />
                              </div>
                              <div className="flex gap-2">
                                {remainingBalance > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => fillRemaining(pm.id)}
                                    className={`flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg bg-white px-2 py-2 text-[11px] font-bold text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 active:scale-[0.97] ${FOCUS}`}
                                  >
                                    <Plus className="h-3 w-3" />
                                    {lang === 'en' ? 'Add rest' : 'बाँकी थप्नुहोस्'} ({money(remainingBalance)})
                                  </button>
                                )}
                                {pm.digital && (
                                  <button
                                    type="button"
                                    onClick={() => setQrMethod(pm.id as WalletId)}
                                    disabled={!(amount > 0)}
                                    title={amount > 0 ? undefined : lang === 'en' ? 'Enter an amount first' : 'पहिले रकम लेख्नुहोस्'}
                                    className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-bold text-white shadow-sm transition active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none ${pm.style.iconActive} ${FOCUS}`}
                                  >
                                    <QrCode className="h-3.5 w-3.5" />
                                    {pm.label} QR
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Loyalty */}
                  <div className="space-y-2.5 border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between">
                      <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        <Star className="h-4 w-4 text-amber-500" fill="currentColor" />
                        {tr(lang, 'Loyalty', 'लोयल्टी')}
                      </p>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {tr(lang, 'Optional', 'ऐच्छिक')}
                      </span>
                    </div>
                    <LoyaltyAttachCard
                      member={loyaltyMember}
                      points={loyaltyPoints}
                      suggested={suggestedLoyaltyPoints}
                      lang={lang}
                      onOpen={() => setLoyaltyOpen(true)}
                      onRemove={removeLoyalty}
                    />
                  </div>

                  {/* Mobile print button */}
                  <button
                    type="button"
                    onClick={openPrintPreview}
                    className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 p-3 text-sm font-semibold text-slate-600 transition hover:border-purple-300 hover:text-purple-700 sm:hidden ${FOCUS}`}
                  >
                    <Printer className="h-4 w-4" />
                    {lang === 'en' ? 'Print combined bill' : 'संयुक्त बिल प्रिन्ट'}
                  </button>
                </div>

                {/* Desktop footer */}
                <div className="hidden shrink-0 border-t border-slate-100 bg-gradient-to-b from-white to-slate-50 px-6 pb-6 pt-4 lg:block">
                  {renderFooter(false)}
                </div>
              </aside>
            </div>

                       {/* Mobile / tablet footer */}
            <div className="relative z-10 shrink-0 border-t border-purple-100 bg-white px-4 pb-4 pt-3 shadow-[0_-8px_24px_rgba(109,40,217,0.08)] lg:hidden">
              {renderFooter(true)}
            </div>
          </div>
          </div>
        </Portal>
      )}

      {/* QR for the one wallet that was tapped */}
      {qrConfig && selectedGroup && qrMethod && (
        <PaymentQRModal
          method={qrConfig}
          amount={qrAmount}
          onAmountChange={(v) => updateSplitAmount(qrMethod, v)}
          remaining={remainingBalance}
          otherPayments={qrOthers}
          customerName={selectedGroup.billTo}
          billNo={qrBillNo}
          lang={lang}
          onClose={() => setQrMethod(null)}
        />
      )}

      {/* Loyalty picker */}
      {loyaltyOpen && selectedGroup && (
        <LoyaltyModal
          restaurantId={loyaltyRestaurantId}
          lang={lang}
          amount={selectedGroup.grandTotal}
          customerName={selectedGroup.billTo}
          initialMember={loyaltyMember}
          initialPoints={loyaltyPoints}
          onClose={() => setLoyaltyOpen(false)}
          onConfirm={handleLoyaltyConfirm}
        />
      )}

      {printGroup && (
        <MergedBillModal
          group={printGroup}
          lang={lang}
          onClose={closeModal}
          paidPaymentMethod={receiptPaymentMethod}
          paidBreakdown={receiptBreakdown}
          loyalty={receiptLoyalty}
        />
      )}
    </div>
  );
}