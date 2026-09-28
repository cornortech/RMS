import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import BillQR, { WalletId } from './BillQR';
import {
  Receipt, Hash, Wallet, Banknote, Smartphone, CreditCard,
  CheckCircle2, X, Printer, Loader2, AlertTriangle, RefreshCw,
  ClipboardList, ShoppingBag, PlusCircle, Percent, Clock, Search,
  Sparkles, TrendingUp, Layers, ArrowUpDown, PartyPopper, StickyNote,
  Timer, QrCode, ArrowLeft, ChevronRight, Info, Plus, Minus,
  Star, Gift, Crown, Award, UserPlus, Phone, Users, User, UserPen,
} from 'lucide-react';

// ==========================================
// CONFIG
// ==========================================

const API_BASE = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com')
  .trim()
  .replace(/\/+$/, '');
const ORDERS_URL = `${API_BASE}/api/orders`;
const BILLS_URL = `${API_BASE}/api/bills`;
const LOYALTY_URL = `${API_BASE}/api/loyalty`;

const DEFAULT_VAT_RATE = 0; // % — editable, defaults to 0

const DISCOUNT_PRESETS = [5, 10, 15, 20];
const VAT_PRESETS = [0, 13];

// Loyalty rule: 1 point for every NPR 100 of the grand total (keep the same in UnpaidBill)
const NPR_PER_POINT = 100;
const POINT_PRESETS = [5, 10, 25, 50];

// Must match CreateOrder: orders taken by name are saved with this table label
const NO_TABLE_LABEL = 'No Table';

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

interface OrderItem {
  itemName: string;
  description?: string;
  itemPrice: number;
  quantity: number;
}

interface Order {
  _id: string;
  restaurantId: string;
  customerName: string;
  tableNumber: string;
  orderNote?: string;
  items: OrderItem[];
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  createdAt?: string;
  updatedAt?: string;
}

interface BillItem {
  itemName: string;
  quantity: number;
  rate: number;
  total: number;
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
type SortMode = 'oldest' | 'newest' | 'highest';
type WaitFilter = 'all' | '30' | '60';

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

// Brand-inspired colours: eSewa green, Khalti purple, Fonepay red
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
const INPUT =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-mono text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-purple-500 focus:bg-white focus:ring-4 focus:ring-purple-500/15';
const TEXT_INPUT =
  'w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-400/20';

// ==========================================
// PORTAL — renders overlays on <body> so they are truly full screen,
// even inside App's animated page wrapper (which traps position: fixed).
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

function initials(name: string): string {
  // Ignore brackets / symbols so "Guest (T1)" → "GT"
  const clean = (name || '').replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const parts = clean.trim().split(/\s+/).filter(Boolean);
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

/** True when the order really has a table (not empty / not "No Table") */
function hasTable(table?: string): boolean {
  const v = String(table ?? '').trim();
  return !!v && v.toLowerCase() !== NO_TABLE_LABEL.toLowerCase();
}

/** True when the order has no real customer name ("", "Guest", "Guest (T1)") */
function isPlaceholderName(name?: string): boolean {
  const v = String(name ?? '').trim();
  return !v || /^guest(\s*\(.*\))?$/i.test(v);
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

function timeAgo(iso: string | undefined, lang: Lang): { text: string; hours: number; mins: number } {
  if (!iso) return { text: '—', hours: 0, mins: 0 };
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
  return { text, hours, mins };
}

function orderTotalFromItems(o: Order): number {
  const fromItems = (o.items || []).reduce((s, i) => s + (i.itemPrice || 0) * (i.quantity || 0), 0);
  return fromItems > 0 ? fromItems : o.totalAmount || 0;
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
// SERVED ORDER CARD
// ==========================================

function ServedOrderCard({
  order,
  onSelect,
  lang,
  index,
}: {
  order: Order;
  onSelect: (order: Order) => void;
  lang: Lang;
  index: number;
}) {
  const items = order.items || [];
  const itemCount = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const age = timeAgo(order.createdAt, lang);
  const isUrgent = age.mins >= 60;
  const isWaiting = age.mins >= 30 && !isUrgent;
  const preview = items.slice(0, 3).map((i) => i.itemName).join(', ');
  const extra = items.length - 3;
  const withTable = hasTable(order.tableNumber);
  const noName = isPlaceholderName(order.customerName);
  const displayName = (order.customerName || '').trim() || 'Guest';

  return (
    <button
      onClick={() => onSelect(order)}
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
      aria-label={`${lang === 'en' ? 'Create bill for' : 'बिल बनाउनुहोस्'} ${displayName}${
        withTable ? `, ${lang === 'en' ? 'table' : 'टेबल'} ${order.tableNumber}` : ''
      }`}
      className={`cb-rise group relative flex w-full cursor-pointer flex-col overflow-hidden text-left ${CARD} transition-all duration-200 hover:-translate-y-1 hover:border-purple-300 hover:shadow-xl hover:shadow-purple-500/10 active:scale-[0.99] ${FOCUS}`}
    >
      <span
        className={`h-1 w-full bg-gradient-to-r ${
          isUrgent ? 'from-rose-400 to-red-500' : isWaiting ? 'from-amber-400 to-orange-400' : 'from-purple-500 to-indigo-500'
        }`}
        aria-hidden="true"
      />

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${
              noName ? 'from-slate-400 to-slate-500' : gradientFor(displayName)
            } text-sm font-extrabold text-white shadow-sm`}
            aria-hidden="true"
          >
            {noName ? <User className="h-5 w-5" /> : initials(displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className={`truncate text-[15px] font-bold leading-tight ${noName ? 'text-slate-500' : 'text-slate-900'}`}>
              {displayName}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {withTable ? (
                <span className="inline-flex items-center gap-0.5 rounded-md bg-purple-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-purple-700 ring-1 ring-inset ring-purple-100">
                  <Hash className="h-2.5 w-2.5" />
                  {order.tableNumber}
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 ring-1 ring-inset ring-sky-100">
                  <User className="h-2.5 w-2.5" />
                  {tr(lang, 'By name', 'नामबाट')}
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ${
                  isUrgent
                    ? 'bg-rose-50 text-rose-600 ring-rose-100'
                    : isWaiting
                    ? 'bg-amber-50 text-amber-700 ring-amber-100'
                    : 'bg-slate-50 text-slate-500 ring-slate-100'
                }`}
              >
                <Clock className="h-2.5 w-2.5" />
                {age.text}
              </span>
              {order.orderNote && (
                <span
                  title={order.orderNote}
                  className="inline-flex items-center gap-0.5 rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 ring-1 ring-inset ring-sky-100"
                >
                  <StickyNote className="h-2.5 w-2.5" />
                  {lang === 'en' ? 'Note' : 'टिप्पणी'}
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
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
            {itemCount} {lang === 'en' ? `item${itemCount !== 1 ? 's' : ''}` : 'परिकार'}
          </span>
          <div className="text-right">
            <p className="text-[9px] font-bold uppercase leading-none tracking-widest text-slate-400">NPR</p>
            <p className="font-mono text-lg font-extrabold leading-tight tabular-nums text-purple-700">
              {moneyCompact(orderTotalFromItems(order))}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-xs font-bold text-purple-700 transition-colors group-hover:bg-gradient-to-r group-hover:from-purple-600 group-hover:to-violet-600 group-hover:text-white">
        <span className="flex items-center gap-1.5">
          <Receipt className="h-3.5 w-3.5" />
          {lang === 'en' ? 'Create bill' : 'बिल बनाउनुहोस्'}
        </span>
        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}

// ==========================================
// SPLIT BAR — shows how each method covers the total
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
          overpaid > 0
            ? 'bg-amber-50 text-amber-700'
            : isFullyPaid
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-purple-50 text-purple-700'
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
    <div className={`cb-fade relative overflow-hidden rounded-2xl bg-gradient-to-br ${ts.card} p-4 text-white shadow-lg ${ts.shadow}`}>
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
            aria-label={tr(lang, 'Remove loyalty from bill', 'लोयल्टी हटाउनुहोस्')}
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
  grandTotal,
  orderCustomerName,
  initialMember,
  initialPoints,
  onClose,
  onConfirm,
}: {
  restaurantId: string;
  lang: Lang;
  grandTotal: number;
  orderCustomerName: string;
  initialMember: LoyaltyMember | null;
  initialPoints: number;
  onClose: () => void;
  onConfirm: (member: LoyaltyMember, points: number) => void;
}) {
  const suggested = suggestedPoints(grandTotal);

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
      const order = (orderCustomerName || '').trim().toLowerCase();
      const name = (m.customerName || '').trim().toLowerCase();
      if (order.length < 2 || name.length < 2) return false;
      return name === order || name.includes(order) || order.includes(name);
    },
    [orderCustomerName]
  );

  // Filter by name / phone, likely matches first
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
      customerName: looksLikePhone ? orderCustomerName : q || orderCustomerName,
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
        className="cb-fade fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:p-4"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="loyalty-title"
          onClick={(e) => e.stopPropagation()}
          className="cb-pop flex h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
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
                <p id="loyalty-title" className="text-lg font-black tracking-tight sm:text-xl">
                  {tr(lang, 'Loyalty rewards', 'लोयल्टी पुरस्कार')}
                </p>
                <p className="text-xs font-medium text-white/85">
                  {tr(lang, 'Find the customer and add points for this bill', 'ग्राहक खोजी यो बिलको अंक थप्नुहोस्')}
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
                {tr(lang, 'Bill', 'बिल')} NPR {money(grandTotal)}
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
                  <div className="cb-fade space-y-2.5 rounded-2xl border border-amber-200 bg-white p-3.5 shadow-sm">
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

              <div className="cb-scroll min-h-0 flex-1 overflow-y-auto p-3">
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
                      {search
                        ? tr(lang, 'No customer found', 'ग्राहक भेटिएन')
                        : tr(lang, 'No loyalty members yet', 'अहिलेसम्म सदस्य छैनन्')}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {tr(lang, 'Enroll them now and add points to this bill.', 'अहिले दर्ता गरी यो बिलमा अंक थप्नुहोस्।')}
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
                        <li key={m._id} className="cb-rise" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
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
                  <div className="cb-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className={`mb-3 flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 md:hidden ${FOCUS}`}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      {tr(lang, 'Back to customers', 'ग्राहक सूचीमा फर्कनुहोस्')}
                    </button>

                    {/* Loyalty card */}
                    <div key={selected._id} className={`cb-pop relative overflow-hidden rounded-3xl bg-gradient-to-br ${ts.card} p-5 text-white shadow-xl ${ts.shadow}`}>
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
                            className="cb-no-spin h-14 w-full rounded-xl border-2 border-amber-200 bg-amber-50/40 text-center font-mono text-3xl font-black tabular-nums text-amber-600 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-400/20"
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
                        ? tr(lang, `Add +${points} pts to this bill`, `यो बिलमा +${points} अंक थप्नुहोस्`)
                        : tr(lang, 'Choose points to add', 'अंक छान्नुहोस्')}
                    </button>
                    <p className="mt-2 text-center text-[11px] text-slate-400">
                      {tr(lang, 'Points are saved to the customer when the bill is created.', 'बिल बनेपछि अंक ग्राहकमा सुरक्षित हुन्छ।')}
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
  lang,
  onClose,
}: {
  method: MethodConfig;
  amount: number;
  onAmountChange: (value: number) => void;
  remaining: number;
  otherPayments: { label: string; amount: number; dot: string }[];
  customerName: string;
  lang: Lang;
  onClose: () => void;
}) {
  const Icon = method.icon;
  return (
    <Portal>
      <div
        className="cb-fade fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-title"
          onClick={(e) => e.stopPropagation()}
          className="cb-pop flex max-h-[95dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
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
                <p id="qr-title" className="text-lg font-extrabold">
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

          <div className="cb-scroll space-y-4 overflow-y-auto p-6">
            <div className="flex justify-center rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <BillQR key={method.id} method={method.id as WalletId} amount={amount} />
            </div>

            <div>
              <label htmlFor="qr-amount" className="mb-1.5 block text-xs font-bold text-slate-600">
                {lang === 'en' ? `Change ${method.label} amount` : `${method.label} रकम बदल्नुहोस्`}
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                  NPR
                </span>
                <input
                  id="qr-amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={amount ? amount : ''}
                  onChange={(e) => onAmountChange(Number(e.target.value))}
                  onFocus={(e) => e.currentTarget.select()}
                  placeholder="0.00"
                  className="cb-no-spin w-full rounded-xl border border-slate-200 bg-white py-3 pl-12 pr-3 font-mono text-lg font-bold text-slate-900 outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-500/15"
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
// PRINTABLE BILL MODAL (80mm thermal)
// ==========================================

function BillModal({ bill, lang, onClose }: { bill: any; lang: Lang; onClose: () => void }) {
  const billItems: BillItem[] = bill?.items ?? [];
  const vatRate = bill?.vatRate ?? 0;
  const hasVat = vatRate > 0;
  const hasDiscount = (bill?.discount ?? 0) > 0;
  const loyalty: BillLoyalty | null = bill?.loyalty ?? null;

  const paidBreakdown: { label: string; amount: number }[] = [
    { label: 'Cash', amount: bill?.cashPaidMoney ?? 0 },
    { label: 'eSewa', amount: bill?.eSewaPaidMoney ?? 0 },
    { label: 'Khalti', amount: bill?.khaltiPaidMoney ?? 0 },
    { label: 'Fonepay', amount: bill?.fonepayPaidMoney ?? 0 },
  ].filter((p) => p.amount > 0);

  return (
    <Portal>
      <div className="cb-fade fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <style>{`
          @media print {
            @page { size: 80mm auto; margin: 0mm; }
            html, body { width: 80mm; }
            body * { visibility: hidden; }
            #printable-bill, #printable-bill * { visibility: visible; }
            #printable-bill {
              position: absolute; left: 0; top: 0;
              width: 72mm; max-width: 72mm; max-height: none !important;
              overflow: visible !important; border: none !important;
              box-shadow: none !important; background: #ffffff !important;
              padding: 4mm 2mm !important; margin: 0 !important;
              font-family: 'Courier New', Courier, monospace !important;
              font-size: 11px !important; line-height: 1.2 !important;
              font-weight: 900 !important; color: #000000 !important;
            }
          }
        `}</style>

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bill-created-title"
          className="cb-pop flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl"
        >
          <div className="flex shrink-0 items-center justify-between bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-4 text-white">
            <span id="bill-created-title" className="flex items-center gap-2 text-sm font-bold">
              <PartyPopper className="h-5 w-5" />
              {lang === 'en' ? 'Bill created' : 'बिल तयार भयो'}
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
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {lang === 'en'
                ? `Invoice ${bill.invoiceNo} • ${bill.paymentMethod}`
                : `बिजक ${bill.invoiceNo} • ${bill.paymentMethod}`}
            </div>

            {loyalty && (
              loyalty.success ? (
                <div className="cb-pop flex items-center gap-3 rounded-xl bg-gradient-to-r from-amber-400 via-orange-500 to-pink-500 px-3.5 py-3 text-white shadow-md shadow-orange-500/25">
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

            <div className="flex max-h-[420px] justify-center overflow-y-auto rounded-2xl border border-purple-100 bg-purple-50/60 p-4">
              <div
                id="printable-bill"
                style={{
                  fontFamily: "'Courier New', Courier, monospace",
                  width: '72mm',
                  margin: '0 auto',
                  padding: '4mm 2mm',
                  color: '#000000',
                  backgroundColor: '#ffffff',
                  fontWeight: 900,
                }}
                className="space-y-3 text-xs shadow-md"
              >
                <div className="space-y-0.5 border-b-2 border-dashed border-black pb-2 text-center">
                  <h3 className="text-sm font-black uppercase tracking-tight text-black">{bill.restaurantName}</h3>
                  <p className="text-[10px] font-bold text-black">{bill.location}</p>
                  <p className="text-[10px] font-black">PAN / VAT No: {bill.panOrVat}</p>
                  <h4 className="mt-1 border-y border-black py-1 text-xs font-black uppercase tracking-wider text-black">
                    {lang === 'en' ? 'INVOICE / BILL' : 'बिजक'}
                  </h4>
                </div>

                <div className="space-y-1 border-b-2 border-black pb-2 text-[11px] font-black leading-tight">
                  <div className="flex justify-between">
                    <span>Invoice No:</span>
                    <span className="font-mono">{bill.invoiceNo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Date:</span>
                    <span className="font-mono">{new Date(bill.date).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Bill To:</span>
                    <span>{bill.billTo}</span>
                  </div>
                  {hasTable(bill.tableNumber) && (
                    <div className="flex justify-between">
                      <span>Table:</span>
                      <span>{bill.tableNumber}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Payment:</span>
                    <span>{bill.paymentMethod}</span>
                  </div>
                </div>

                <table className="w-full text-[11px] font-black leading-tight">
                  <thead>
                    <tr className="border-b border-black text-left">
                      <th className="pb-1">Item</th>
                      <th className="pb-1 text-center">Qty</th>
                      <th className="pb-1 text-right">Rate</th>
                      <th className="pb-1 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dashed divide-black border-b-2 border-black">
                    {billItems.map((item: BillItem, idx: number) => (
                      <tr key={idx}>
                        <td className="py-1 font-black">{item.itemName}</td>
                        <td className="py-1 text-center font-mono">{item.quantity}</td>
                        <td className="py-1 text-right font-mono">{money(item.rate)}</td>
                        <td className="py-1 text-right font-mono">{money(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="space-y-1 text-[11px] font-black">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-mono">NPR {money(bill.subtotal)}</span>
                  </div>
                  {hasDiscount && (
                    <div className="flex justify-between">
                      <span>Discount{bill.discountPercent > 0 ? ` (${bill.discountPercent}%)` : ''}:</span>
                      <span className="font-mono">-NPR {money(bill.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Taxable Amount:</span>
                    <span className="font-mono">NPR {money(bill.taxableAmount)}</span>
                  </div>
                  {hasVat && (
                    <div className="flex justify-between">
                      <span>VAT ({vatRate}%):</span>
                      <span className="font-mono">NPR {money(bill.vatCollected)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t-2 border-black pt-1 text-xs font-black">
                    <span>GRAND TOTAL:</span>
                    <span className="font-mono">NPR {money(bill.grandTotal)}</span>
                  </div>
                  {paidBreakdown.length > 0 && (
                    <div className="space-y-0.5 border-t border-dashed border-black pt-1">
                      {paidBreakdown.map((p) => (
                        <div className="flex justify-between" key={p.label}>
                          <span>Paid via {p.label}:</span>
                          <span className="font-mono">NPR {money(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {loyalty && loyalty.success && loyalty.points > 0 && (
                    <div className="space-y-0.5 border-t border-dashed border-black pt-1">
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

                <div className="space-y-1.5 border-t border-dashed border-black pt-6 text-center text-[9px] font-black">
                  <div>Thank you, visit again!</div>
                  <div>Powered By: Atithi RMS by Cornor Tech Pvt. Ltd.</div>
                </div>
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
                onClick={() => window.print()}
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
// MAIN CREATE BILL PAGE
// ==========================================

export default function CreateBill({ lang = 'en' as Lang }: { lang?: Lang }) {
  const user = getLoggedInUser();
  const restaurantId = user?.id ? String(user.id) : '';
  const loyaltyRestaurantId = user?.id || user?.username ? String(user?.id || user?.username) : '';
  const restaurantName = user?.RESTAURANTName || user?.restaurantName || 'Restaurant';
  const restaurantLocation = user?.location || 'N/A';
  const restaurantPanOrVat = user?.PanOrVat || user?.panOrVat || 'N/A';

  const [servedOrders, setServedOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('oldest');
  const [waitFilter, setWaitFilter] = useState<WaitFilter>('all');

  const [selectedMethods, setSelectedMethods] = useState<Set<PaymentMethod>>(new Set());
  const [paymentSplit, setPaymentSplit] = useState<PaymentSplit>({});
  const [markAsPending, setMarkAsPending] = useState(false);

  // Discount can be entered as % OR flat Rs — the two inputs stay in sync.
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [discountAmountInput, setDiscountAmountInput] = useState<number>(0);
  const [discountMode, setDiscountMode] = useState<'percent' | 'flat'>('percent');

  const [vatRate, setVatRate] = useState<number>(DEFAULT_VAT_RATE);
  const [submitting, setSubmitting] = useState(false);
  const [createdBill, setCreatedBill] = useState<any | null>(null);

  const [qrMethod, setQrMethod] = useState<WalletId | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [, setTick] = useState(0);

  // Customer name typed on the bill (only used when the order has no real name)
  const [billToName, setBillToName] = useState('');

  // Loyalty
  const [loyaltyOpen, setLoyaltyOpen] = useState(false);
  const [loyaltyMember, setLoyaltyMember] = useState<LoyaltyMember | null>(null);
  const [loyaltyPoints, setLoyaltyPoints] = useState<number>(0);

  const amountRefs = useRef<Partial<Record<PaymentMethod, HTMLInputElement | null>>>({});
  const toastTimer = useRef<number | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  };

  // Refresh "x min ago" labels every minute
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60000);
    return () => {
      window.clearInterval(id);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const fetchServedOrders = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const url = restaurantId
        ? `${ORDERS_URL}?restaurantId=${encodeURIComponent(restaurantId)}`
        : ORDERS_URL;
      const res = await fetch(url);
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to load orders.');
      }
      const served: Order[] = (result.data || []).filter(
        (o: Order) => o.orderStatus === 'Served' && o.paymentStatus !== 'Paid' && o.paymentStatus !== 'Pending'
      );
      setServedOrders(served);
    } catch (err: any) {
      setError(err.message || 'Could not connect to the server.');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchServedOrders();
  }, [fetchServedOrders]);

  // Reset everything whenever the selected order changes
  useEffect(() => {
    setDiscountPercent(0);
    setDiscountAmountInput(0);
    setDiscountMode('percent');
    setSelectedMethods(new Set());
    setPaymentSplit({});
    setMarkAsPending(false);
    setVatRate(DEFAULT_VAT_RATE);
    setQrMethod(null);
    setBillToName('');
    setLoyaltyOpen(false);
    setLoyaltyMember(null);
    setLoyaltyPoints(0);
  }, [selectedOrder?._id]);

  // Lock page scroll while the billing window is open
  useEffect(() => {
    if (!selectedOrder) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [selectedOrder]);

  // ---------- List: filter + search + sort ----------
  const visibleOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = servedOrders.filter((o) => {
      if (q) {
        const hit =
          (o.customerName || '').toLowerCase().includes(q) ||
          String(o.tableNumber || '').toLowerCase().includes(q) ||
          (o.items || []).some((i) => (i.itemName || '').toLowerCase().includes(q));
        if (!hit) return false;
      }
      if (waitFilter !== 'all') {
        const mins = timeAgo(o.createdAt, 'en').mins;
        if (mins < Number(waitFilter)) return false;
      }
      return true;
    });

    list = [...list];
    const t = (o: Order) => new Date(o.createdAt || 0).getTime();
    if (sortMode === 'oldest') list.sort((a, b) => t(a) - t(b));
    if (sortMode === 'newest') list.sort((a, b) => t(b) - t(a));
    if (sortMode === 'highest') list.sort((a, b) => orderTotalFromItems(b) - orderTotalFromItems(a));
    return list;
  }, [servedOrders, search, sortMode, waitFilter]);

  // ---------- Overview stats ----------
  const stats = useMemo(() => {
    const total = servedOrders.reduce((s, o) => s + orderTotalFromItems(o), 0);
    const largest = servedOrders.reduce<Order | null>(
      (m, o) => (!m || orderTotalFromItems(o) > orderTotalFromItems(m) ? o : m),
      null
    );
    const longest = servedOrders.reduce<Order | null>((m, o) => {
      if (!o.createdAt) return m;
      if (!m || new Date(o.createdAt).getTime() < new Date(m.createdAt || 0).getTime()) return o;
      return m;
    }, null);
    return { total, count: servedOrders.length, largest, longest };
  }, [servedOrders]);

  // ---------- Customer name for the bill ----------
  const orderHasTable = !!selectedOrder && hasTable(selectedOrder.tableNumber);
  const needsName = !!selectedOrder && isPlaceholderName(selectedOrder.customerName);
  const typedName = billToName.trim();
  // A real person's name (empty if the order is a "Guest" and nothing was typed)
  const realCustomerName = needsName ? typedName : (selectedOrder?.customerName || '').trim();
  // What is printed on the bill — never empty
  const finalBillTo = selectedOrder
    ? realCustomerName ||
      (selectedOrder.customerName || '').trim() ||
      (orderHasTable ? `Guest (${selectedOrder.tableNumber})` : 'Guest')
    : '';

  // ---------- Bill maths ----------
  const billItems: BillItem[] = useMemo(() => {
    if (!selectedOrder) return [];
    return (selectedOrder.items || []).map((i) => ({
      itemName: i.itemName,
      quantity: i.quantity,
      rate: i.itemPrice,
      total: i.itemPrice * i.quantity,
    }));
  }, [selectedOrder]);

  const subtotal = useMemo(() => billItems.reduce((s, i) => s + i.total, 0), [billItems]);

  const safeVatRate = Math.min(Math.max(vatRate || 0, 0), 100);

  const safeDiscountPercent =
    discountMode === 'percent'
      ? Math.min(Math.max(discountPercent || 0, 0), 100)
      : subtotal > 0
      ? Math.min(Math.max((discountAmountInput / subtotal) * 100, 0), 100)
      : 0;

  const discountAmount =
    discountMode === 'flat'
      ? Math.min(Math.max(discountAmountInput || 0, 0), subtotal)
      : (subtotal * safeDiscountPercent) / 100;

  const taxableAmount = Math.max(subtotal - discountAmount, 0);
  const hasVat = safeVatRate > 0;
  const vatCollected = hasVat ? (taxableAmount * safeVatRate) / 100 : 0;
  const grandTotal = taxableAmount + vatCollected;

  const suggestedLoyaltyPoints = suggestedPoints(grandTotal);

  const totalPaid = useMemo(
    () => Object.values(paymentSplit).reduce((s, v) => s + (Number(v) || 0), 0),
    [paymentSplit]
  );
  const remainingBalance = Math.max(Number((grandTotal - totalPaid).toFixed(2)), 0);
  const overpaidBy = totalPaid > grandTotal ? Number((totalPaid - grandTotal).toFixed(2)) : 0;
  const isFullyPaid =
    !markAsPending && remainingBalance <= 0.01 && (totalPaid > 0 || grandTotal <= 0.01);

  // Name is NOT required — the bill can always be created
  const canCreateBill =
    !!selectedOrder &&
    !submitting &&
    (markAsPending || (selectedMethods.size > 0 && isFullyPaid));

  // ---------- Handlers ----------
  const handleSelectOrder = (o: Order) => {
    setError('');
    setSelectedOrder(o);
  };

  const handlePercentChange = (val: number) => {
    setDiscountMode('percent');
    setDiscountPercent(val);
    const pct = Math.min(Math.max(val || 0, 0), 100);
    setDiscountAmountInput(Number(((subtotal * pct) / 100).toFixed(2)));
  };

  const handleAmountChange = (val: number) => {
    setDiscountMode('flat');
    const amt = Math.min(Math.max(val || 0, 0), subtotal);
    setDiscountAmountInput(val);
    setDiscountPercent(subtotal > 0 ? Number(((amt / subtotal) * 100).toFixed(2)) : 0);
  };

  const toggleMethod = (id: PaymentMethod) => {
    setMarkAsPending(false);
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

    // A newly picked method starts with whatever is still unpaid.
    // The field is focused and selected, so typing a new number replaces it
    // (e.g. total 300 → type 100 for eSewa → pick Khalti → it starts at 200).
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

  // Loyalty points are only given when payment is collected, so "Pay later" clears loyalty
  const togglePending = () => {
    const next = !markAsPending;
    setMarkAsPending(next);
    if (next) {
      setSelectedMethods(new Set());
      setPaymentSplit({});
      setQrMethod(null);
      setLoyaltyOpen(false);
      setLoyaltyMember(null);
      setLoyaltyPoints(0);
    }
  };

  const handleLoyaltyConfirm = (member: LoyaltyMember, points: number) => {
    setLoyaltyMember(member);
    setLoyaltyPoints(Math.max(Math.floor(points), 0));
    setLoyaltyOpen(false);
    // If the order has no name yet, use the loyalty member's name
    const memberName = (member.customerName || '').trim();
    if (needsName && !billToName.trim() && memberName && memberName !== 'Valued Customer') {
      setBillToName(memberName);
    }
  };

  const removeLoyalty = () => {
    setLoyaltyMember(null);
    setLoyaltyPoints(0);
  };

  const resetBuilder = () => {
    setSelectedOrder(null);
    setSelectedMethods(new Set());
    setPaymentSplit({});
    setMarkAsPending(false);
    setDiscountPercent(0);
    setDiscountAmountInput(0);
    setDiscountMode('percent');
    setVatRate(DEFAULT_VAT_RATE);
    setQrMethod(null);
    setBillToName('');
    setLoyaltyOpen(false);
    setLoyaltyMember(null);
    setLoyaltyPoints(0);
  };

  // Escape: close loyalty first, then QR, then the billing window
  useEffect(() => {
    if (!selectedOrder) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (loyaltyOpen) setLoyaltyOpen(false);
      else if (qrMethod) setQrMethod(null);
      else if (!submitting) resetBuilder();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrder, qrMethod, submitting, loyaltyOpen]);

  const handleCreateBill = async () => {
    if (!selectedOrder || !canCreateBill) return;
    setSubmitting(true);
    setError('');

    const isPending = markAsPending;
    const billTo = finalBillTo;
    const nameWasTyped = needsName && !!typedName;
    const member = loyaltyMember;
    // Points only when money is actually collected
    const pointsToAdd = member && !isPending ? Math.max(Math.floor(loyaltyPoints), 0) : 0;

    const methodLabel = isPending
      ? 'Pending'
      : selectedMethods.size > 1
      ? 'Split'
      : Array.from(selectedMethods)[0] ?? 'Cash';

    const payload = {
      restaurantName,
      location: restaurantLocation,
      panOrVat: restaurantPanOrVat,
      invoiceNo: `INV-${Date.now()}`,
      billTo,
      tableNumber: selectedOrder.tableNumber || NO_TABLE_LABEL,
      paymentMethod: methodLabel,
      cashPaidMoney: paymentSplit.Cash ?? 0,
      eSewaPaidMoney: paymentSplit.eSewa ?? 0,
      khaltiPaidMoney: paymentSplit.Khalti ?? 0,
     fonepayPaidMoney: paymentSplit.Fonepay ?? 0,
      date: new Date().toISOString(),
      items: billItems,
      subtotal,
      discountPercent: Number(safeDiscountPercent.toFixed(2)),
      discount: discountAmount,
      vatRate: hasVat ? safeVatRate : 0,
      taxableAmount,
      vatCollected,
      grandTotal,
      restaurantId,
      orderId: selectedOrder._id,
      loyaltyMemberId: pointsToAdd > 0 ? member?._id ?? null : null,
      loyaltyCustomerPhone: pointsToAdd > 0 ? member?.customerPhone ?? null : null,
      loyaltyPointsEarned: pointsToAdd,
    };

    try {
      const res = await fetch(BILLS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data?.success) {
        throw new Error(data?.message || 'Failed to create bill.');
      }

      const orderUpdateRes = await fetch(`${ORDERS_URL}/${selectedOrder._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentStatus: isPending ? 'Pending' : 'Paid',
          orderStatus: 'Completed',
          // Save the typed name on the order too (ignored if your API does not allow it)
          ...(nameWasTyped ? { customerName: typedName } : {}),
        }),
      });

      if (!orderUpdateRes.ok) {
        const errText = await orderUpdateRes.text().catch(() => '');
        console.error('Order update failed:', orderUpdateRes.status, errText);
        throw new Error('Bill was created but order status failed to update. Please refresh and check.');
      }

      // Award loyalty points (never blocks the bill if it fails)
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

      setServedOrders((prev) => prev.filter((o) => o._id !== selectedOrder._id));

      if (!isPending) {
        setCreatedBill({ ...payload, ...(data.data || {}), billTo: (data.data && data.data.billTo) || billTo, loyalty: loyaltyResult });
        if (loyaltyResult && !loyaltyResult.success) {
          showToast(
            tr(lang, 'Bill saved, but loyalty points could not be added.', 'बिल सुरक्षित, तर अंक थप्न सकिएन।'),
            'error'
          );
        }
      } else {
        showToast(
          lang === 'en' ? `Pending bill saved for ${billTo}.` : `${billTo} को बाँकी बिल सुरक्षित भयो।`,
          'success'
        );
      }

      resetBuilder();
    } catch (err: any) {
      setError(err.message || 'Could not save the bill. Please try again.');
      window.setTimeout(() => setError(''), 6000);
    } finally {
      setSubmitting(false);
    }
  };

  const cycleSort = () =>
    setSortMode((m) => (m === 'oldest' ? 'newest' : m === 'newest' ? 'highest' : 'oldest'));

  const sortLabel =
    sortMode === 'oldest'
      ? lang === 'en' ? 'Longest wait' : 'पुराना पहिला'
      : sortMode === 'newest'
      ? lang === 'en' ? 'Newest' : 'नयाँ'
      : lang === 'en' ? 'Highest amount' : 'धेरै रकम';

  const filterChips: { id: WaitFilter; label: string }[] = [
    { id: 'all', label: lang === 'en' ? 'All' : 'सबै' },
    { id: '30', label: lang === 'en' ? 'Waiting 30m+' : '३०मि+' },
    { id: '60', label: lang === 'en' ? 'Waiting 1h+' : '१घ+' },
  ];

  const longestAge = stats.longest ? timeAgo(stats.longest.createdAt, lang) : null;
  const totalQty = billItems.reduce((s, i) => s + i.quantity, 0);

  // ---------- QR modal data ----------
  const qrConfig = qrMethod ? METHOD_BY_ID[qrMethod] : null;
  const qrAmount = qrMethod ? paymentSplit[qrMethod] ?? 0 : 0;
  const qrOthers = qrMethod
    ? PAYMENT_METHODS.filter((m) => m.id !== qrMethod && selectedMethods.has(m.id) && (paymentSplit[m.id] ?? 0) > 0).map(
        (m) => ({ label: m.label, amount: paymentSplit[m.id] ?? 0, dot: m.style.dot })
      )
    : [];

  // ---------- Footer (totals + action) ----------
  const renderFooter = (compact: boolean) => (
    <div className="space-y-3">
      {error && (
        <div role="alert" className="cb-fade flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-700">
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
            <span className="font-mono">NPR {money(subtotal)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-rose-600">
              <span>
                {lang === 'en' ? 'Discount' : 'छुट'} ({Number(safeDiscountPercent.toFixed(2))}%)
              </span>
              <span className="font-mono">-NPR {money(discountAmount)}</span>
            </div>
          )}
          {hasVat && (
            <div className="flex justify-between text-slate-500">
              <span>
                {lang === 'en' ? 'VAT' : 'भ्याट'} ({safeVatRate}%)
              </span>
              <span className="font-mono">NPR {money(vatCollected)}</span>
            </div>
          )}
        </div>
      )}

      {loyaltyMember && loyaltyPoints > 0 && !markAsPending && (
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
        <span className="text-sm font-extrabold text-slate-900">{lang === 'en' ? 'Grand total' : 'कुल जम्मा'}</span>
        <span className="font-mono text-2xl font-extrabold tabular-nums tracking-tight text-purple-700 lg:text-3xl">
          NPR {money(grandTotal)}
        </span>
      </div>

      {selectedMethods.size > 0 && !markAsPending && (
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

      {markAsPending && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          {lang === 'en'
            ? `NPR ${money(grandTotal)} will be added to Pending Bills for ${finalBillTo}.`
            : `NPR ${money(grandTotal)} ${finalBillTo} को बाँकी बिलमा थपिनेछ।`}
        </div>
      )}

      <button
        type="button"
        onClick={handleCreateBill}
        disabled={!canCreateBill}
        aria-busy={submitting}
        className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-white transition-all active:scale-[.99] disabled:cursor-not-allowed disabled:translate-y-0 disabled:bg-none disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none ${FOCUS} ${
          markAsPending
            ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-lg shadow-amber-500/30 hover:-translate-y-0.5'
            : 'bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 shadow-lg shadow-purple-500/30 hover:-translate-y-0.5 hover:shadow-purple-500/40'
        }`}
      >
        {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlusCircle className="h-5 w-5" />}
        {submitting
          ? lang === 'en' ? 'Creating bill…' : 'बिल बनाउँदै…'
          : markAsPending
          ? lang === 'en' ? 'Create pending bill' : 'बाँकी बिल बनाउनुहोस्'
          : lang === 'en' ? 'Create bill' : 'बिल बनाउनुहोस्'}
      </button>

      {!canCreateBill && !submitting && (
        <p className="-mt-1 text-center text-xs text-slate-400">
          {selectedMethods.size === 0 && !markAsPending
            ? lang === 'en' ? 'Choose how the customer is paying, or mark as pay later' : 'भुक्तानी विधि छान्नुहोस्'
            : lang === 'en' ? 'The amounts must add up to the grand total' : 'पूरा रकम पुग्ने गरी प्रविष्ट गर्नुहोस्'}
        </p>
      )}
    </div>
  );

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <div className="flex flex-col gap-6" id="create-bill-root">
      <style>{`
        @keyframes cb-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cb-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cb-pop { from { opacity: 0; transform: scale(.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes cb-sheet { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
        @keyframes cb-toast { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: none; } }
        .cb-rise { animation: cb-rise .35s ease-out both; }
        .cb-fade { animation: cb-fade .2s ease-out both; }
        .cb-pop { animation: cb-pop .25s cubic-bezier(.22,1,.36,1) both; }
        .cb-sheet { animation: cb-sheet .32s cubic-bezier(.22,1,.36,1) both; }
        .cb-toast { animation: cb-toast .25s cubic-bezier(.22,1,.36,1) both; }
        .cb-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .cb-scroll::-webkit-scrollbar-thumb { background: #e9d5ff; border-radius: 999px; }
        .cb-scroll { scrollbar-width: thin; scrollbar-color: #e9d5ff transparent; }
        .cb-no-spin::-webkit-outer-spin-button, .cb-no-spin::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .cb-no-spin { -moz-appearance: textfield; }
        @media (prefers-reduced-motion: reduce) { .cb-rise, .cb-fade, .cb-pop, .cb-sheet, .cb-toast { animation: none; } }
      `}</style>

      {/* Toast */}
      {toast && (
        <Portal>
          <div
            role="status"
            className={`cb-toast fixed right-5 top-5 z-[130] flex max-w-sm items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-2xl ${
              toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            {toast.message}
          </div>
        </Portal>
      )}

      {/* ================= HEADER ================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 via-violet-600 to-indigo-600 text-white shadow-lg shadow-purple-500/30">
            <Receipt className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-900">
              {lang === 'en' ? 'Create Bill' : 'बिल तयार गर्नुहोस्'}
            </h2>
            <p className="text-sm text-slate-500">
              {lang === 'en'
                ? 'Pick a served order to open the bill and collect payment.'
                : 'बिल खोल्न र भुक्तानी लिन सर्भ भएको अर्डर छान्नुहोस्।'}
            </p>
          </div>
        </div>
        <button
          onClick={fetchServedOrders}
          disabled={loading}
          aria-label={lang === 'en' ? 'Refresh orders' : 'रिफ्रेस'}
          className={`flex h-[42px] shrink-0 cursor-pointer items-center gap-2 self-start rounded-xl border border-purple-100 bg-white px-3.5 text-sm font-semibold text-purple-700 shadow-sm transition-all hover:bg-purple-50 active:scale-[0.97] disabled:opacity-60 sm:self-auto ${FOCUS}`}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {lang === 'en' ? 'Refresh' : 'रिफ्रेस'}
        </button>
      </div>

      {/* ================= STATS ================= */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile tone="violet" icon={TrendingUp} label={lang === 'en' ? 'Waiting to bill' : 'बिलिङ बाँकी'} value={`NPR ${moneyCompact(stats.total)}`} />
        <StatTile tone="sky" icon={Layers} label={lang === 'en' ? 'Served orders' : 'सर्भ भएका अर्डर'} value={String(stats.count)} />
        <StatTile
          tone="emerald"
          icon={Sparkles}
          label={lang === 'en' ? 'Largest order' : 'सबैभन्दा ठूलो'}
          value={stats.largest ? `NPR ${moneyCompact(orderTotalFromItems(stats.largest))}` : '—'}
          sub={stats.largest?.customerName}
        />
        <StatTile
          tone="amber"
          icon={Timer}
          label={lang === 'en' ? 'Longest wait' : 'सबैभन्दा लामो पर्खाइ'}
          value={longestAge ? longestAge.text : '—'}
          sub={stats.longest?.customerName}
        />
      </div>

      {error && !selectedOrder && (
        <div role="alert" className="cb-fade flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 shadow-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss" className="cursor-pointer text-rose-400 hover:text-rose-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ================= SERVED ORDERS ================= */}
      <section className={`${CARD} p-4 sm:p-5`} aria-labelledby="served-orders-title">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="mr-auto flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-purple-500" aria-hidden="true" />
            <h3 id="served-orders-title" className="text-sm font-bold text-slate-900">
              {lang === 'en' ? 'Served orders' : 'सर्भ भएका अर्डरहरू'}
            </h3>
            <span className="rounded-full bg-purple-50 px-2 py-0.5 font-mono text-[11px] font-bold text-purple-700 ring-1 ring-inset ring-purple-100">
              {visibleOrders.length}
            </span>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={lang === 'en' ? 'Search name, table or item' : 'नाम, टेबल वा परिकार'}
              aria-label={lang === 'en' ? 'Search orders' : 'अर्डर खोज्नुहोस्'}
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

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {filterChips.map((c) => (
            <button
              key={c.id}
              onClick={() => setWaitFilter(c.id)}
              aria-pressed={waitFilter === c.id}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition active:scale-[0.97] ${FOCUS} ${
                waitFilter === c.id
                  ? 'border-transparent bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-md shadow-purple-500/25'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-purple-300 hover:text-purple-700'
              }`}
            >
              {c.id !== 'all' && <Clock className="h-3 w-3" />}
              {c.label}
            </button>
          ))}
        </div>

        {loading && servedOrders.length === 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[190px] animate-pulse rounded-2xl border border-slate-100 bg-slate-50" />
            ))}
          </div>
        ) : servedOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 px-6 py-16 text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
              <ShoppingBag className="h-8 w-8" />
            </div>
            <p className="text-base font-bold text-emerald-800">{lang === 'en' ? 'All caught up' : 'बिल गर्न केही छैन!'}</p>
            <p className="mt-1 text-sm text-emerald-700/70">
              {lang === 'en' ? 'Orders appear here once they are marked as served.' : 'सर्भ भएका अर्डरहरू यहाँ देखिनेछन्।'}
            </p>
          </div>
        ) : visibleOrders.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 py-14 text-center">
            <Search className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">{lang === 'en' ? 'No orders match' : 'फिल्टरसँग मिल्ने अर्डर भेटिएन'}</p>
            <button
              onClick={() => {
                setSearch('');
                setWaitFilter('all');
              }}
              className={`mt-3 cursor-pointer rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-700 ${FOCUS}`}
            >
              {lang === 'en' ? 'Clear filters' : 'फिल्टर हटाउनुहोस्'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visibleOrders.map((order, i) => (
              <ServedOrderCard key={order._id} order={order} index={i} lang={lang} onSelect={handleSelectOrder} />
            ))}
          </div>
        )}
      </section>

      {/* ================= FULL-SCREEN BILLING WINDOW ================= */}
      {selectedOrder && (
        <Portal>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bill-window-title"
            className="cb-sheet fixed inset-0 z-[100] flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#fbfaff] font-sans text-slate-800 antialiased"
          >
            {/* Soft ambient glow */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -left-32 -top-40 h-96 w-96 rounded-full bg-purple-300/25 blur-3xl" />
              <div className="absolute -bottom-40 right-1/3 h-96 w-96 rounded-full bg-indigo-200/25 blur-3xl" />
            </div>

            {/* Header */}
            <header className="relative z-10 flex shrink-0 items-center gap-3 border-b border-purple-100 bg-white/85 px-4 py-3.5 backdrop-blur-xl sm:px-6 lg:px-8">
              <button
                onClick={resetBuilder}
                disabled={submitting}
                aria-label={lang === 'en' ? 'Back to served orders' : 'अर्डरमा फर्कनुहोस्'}
                className={`flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-purple-700 active:scale-[0.96] disabled:opacity-50 ${FOCUS}`}
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">{lang === 'en' ? 'Back' : 'फर्कनुहोस्'}</span>
              </button>
              <div
                className={`hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${
                  realCustomerName ? gradientFor(realCustomerName) : 'from-slate-400 to-slate-500'
                } text-base font-extrabold text-white shadow-md sm:flex`}
                aria-hidden="true"
              >
                {realCustomerName ? initials(realCustomerName) : <User className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-purple-500">
                  {lang === 'en' ? 'New bill' : 'नयाँ बिल'}
                </p>
                <h2
                  id="bill-window-title"
                  className={`truncate text-lg font-black tracking-tight sm:text-xl ${realCustomerName ? 'text-slate-900' : 'text-slate-400'}`}
                >
                  {finalBillTo}
                </h2>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {orderHasTable ? (
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-purple-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-purple-700">
                      <Hash className="h-2.5 w-2.5" />
                      {selectedOrder.tableNumber}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">
                      <User className="h-2.5 w-2.5" />
                      {tr(lang, 'By name', 'नामबाट')}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                    <Clock className="h-2.5 w-2.5" />
                    {timeAgo(selectedOrder.createdAt, lang).text}
                  </span>
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                    {billItems.length} {lang === 'en' ? 'items' : 'परिकार'}
                  </span>
                  {loyaltyMember && !markAsPending && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-inset ring-amber-200">
                      <Star className="h-2.5 w-2.5" fill="currentColor" />
                      +{loyaltyPoints} {tr(lang, 'pts', 'अंक')}
                    </span>
                  )}
                </div>
              </div>
              <div className="hidden rounded-2xl border border-purple-100 bg-purple-50/70 px-4 py-2 text-right md:block">
                <p className="text-[10px] font-bold uppercase tracking-widest text-purple-500">
                  {lang === 'en' ? 'Grand total' : 'कुल जम्मा'}
                </p>
                <p className="font-mono text-2xl font-extrabold tabular-nums text-purple-700">NPR {money(grandTotal)}</p>
              </div>
              <button
                onClick={resetBuilder}
                disabled={submitting}
                aria-label={lang === 'en' ? 'Close' : 'बन्द गर्नुहोस्'}
                className={`cursor-pointer rounded-xl p-2.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 ${FOCUS}`}
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            {/* Body — fills all remaining height */}
            <div className="cb-scroll relative z-10 min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(440px,520px)] lg:overflow-hidden">
              {/* LEFT: name + items + adjustments */}
              <div className="cb-scroll flex flex-col gap-5 p-4 sm:p-6 lg:min-h-0 lg:overflow-y-auto lg:p-8">
                {/* Customer name — only when the order has no real name */}
                {needsName && (
                  <section className={`${CARD} cb-fade shrink-0 overflow-hidden`} aria-labelledby="bill-name-title">
                    <div className="flex items-start gap-3 p-4 sm:p-5">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-md shadow-indigo-500/25">
                        <UserPen className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 id="bill-name-title" className="text-sm font-bold text-slate-900">
                            {tr(lang, 'Customer name', 'ग्राहकको नाम')}
                          </h3>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            {tr(lang, 'Optional', 'ऐच्छिक')}
                          </span>
                        </div>
                        <div className="relative">
                          <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={billToName}
                            onChange={(e) => setBillToName(e.target.value)}
                            placeholder={tr(lang, 'e.g. Ram Sharma', 'जस्तै: राम शर्मा')}
                            aria-label={tr(lang, 'Customer name for this bill', 'यो बिलको ग्राहकको नाम')}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-9 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-purple-500 focus:bg-white focus:ring-4 focus:ring-purple-500/15"
                          />
                          {billToName && (
                            <button
                              type="button"
                              onClick={() => setBillToName('')}
                              aria-label={tr(lang, 'Clear name', 'नाम हटाउनुहोस्')}
                              className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-slate-700"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        {markAsPending && !typedName ? (
                          <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {tr(
                              lang,
                              'Tip: add a name for "Pay later" so you can find this bill easily in Pending Bills.',
                              'सुझाव: बाँकी बिलमा सजिलै भेट्न नाम लेख्नुहोस्।'
                            )}
                          </p>
                        ) : (
                          <p className="flex items-center gap-1 text-[11px] text-slate-400">
                            <Info className="h-3 w-3 shrink-0" />
                            {typedName
                              ? tr(lang, `The bill will be made for "${typedName}".`, `बिल "${typedName}" को नाममा बन्नेछ।`)
                              : tr(lang, `Leave empty to bill as "${finalBillTo}".`, `खाली छोडे "${finalBillTo}" नाममा बिल बन्छ।`)}
                          </p>
                        )}
                      </div>
                    </div>
                  </section>
                )}

                {selectedOrder.orderNote && (
                  <div className="flex shrink-0 items-start gap-2.5 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                    <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                    <span className="font-medium">{selectedOrder.orderNote}</span>
                  </div>
                )}

                {/* Items — grows to fill height */}
                <section
                  className={`${CARD} flex min-h-[320px] flex-col overflow-hidden lg:flex-1`}
                  aria-labelledby="bill-items-title"
                >
                  <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
                    <h3 id="bill-items-title" className="flex items-center gap-2 text-base font-bold text-slate-900">
                      <Receipt className="h-5 w-5 text-purple-600" />
                      {lang === 'en' ? 'Items' : 'परिकारहरू'}
                    </h3>
                    <span className="rounded-full bg-purple-50 px-3 py-1 font-mono text-xs font-bold text-purple-700">
                      {totalQty} {lang === 'en' ? 'qty' : 'मात्रा'}
                    </span>
                  </div>
                  <div className="cb-scroll min-h-0 flex-1 overflow-auto">
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
                        {billItems.map((item, idx) => (
                          <tr key={idx} className="transition-colors hover:bg-purple-50/40">
                            <td className="px-5 py-3.5 font-semibold text-slate-800">{item.itemName}</td>
                            <td className="px-3 py-3.5 text-center">
                              <span className="rounded-lg bg-purple-50 px-2.5 py-1 font-mono text-xs font-bold text-purple-700">
                                {item.quantity}
                              </span>
                            </td>
                            <td className="px-3 py-3.5 text-right font-mono text-slate-500">{money(item.rate)}</td>
                            <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-900">{money(item.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex shrink-0 items-center justify-between border-t border-slate-100 bg-slate-50/70 px-5 py-3.5">
                    <span className="text-sm font-bold text-slate-500">{lang === 'en' ? 'Subtotal' : 'उप-जम्मा'}</span>
                    <span className="font-mono text-base font-bold text-slate-900">NPR {money(subtotal)}</span>
                  </div>
                </section>

                {/* Discount + VAT */}
                <section className={`${CARD} shrink-0 p-5`} aria-labelledby="adjust-title">
                  <h3 id="adjust-title" className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
                    <Percent className="h-5 w-5 text-purple-600" />
                    {lang === 'en' ? 'Discount and VAT' : 'छुट र भ्याट'}
                  </h3>

                  <div className="grid gap-5 xl:grid-cols-2">
                    <div className="space-y-2.5">
                      <p className="text-xs font-bold text-slate-600">{lang === 'en' ? 'Discount' : 'छुट'}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="relative">
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={100}
                            value={safeDiscountPercent === 0 ? '' : Number(safeDiscountPercent.toFixed(2))}
                            onChange={(e) => handlePercentChange(Number(e.target.value) || 0)}
                            placeholder="0"
                            aria-label={lang === 'en' ? 'Discount percent' : 'छुट प्रतिशत'}
                            className={`${INPUT} cb-no-spin pr-9`}
                          />
                          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                        </div>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">NPR</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={subtotal}
                            value={discountAmount === 0 ? '' : Number(discountAmount.toFixed(2))}
                            onChange={(e) => handleAmountChange(Number(e.target.value) || 0)}
                            placeholder="0.00"
                            aria-label={lang === 'en' ? 'Discount amount' : 'छुट रकम'}
                            className={`${INPUT} cb-no-spin pl-11`}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {DISCOUNT_PRESETS.map((p) => {
                          const active = discountMode === 'percent' && Number(safeDiscountPercent.toFixed(2)) === p;
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => handlePercentChange(active ? 0 : p)}
                              aria-pressed={active}
                              className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-bold transition active:scale-[0.96] ${FOCUS} ${
                                active
                                  ? 'border-rose-200 bg-rose-50 text-rose-600'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-purple-300 hover:text-purple-700'
                              }`}
                            >
                              -{p}%
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2.5 border-t border-slate-100 pt-5 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
                      <p className="text-xs font-bold text-slate-600">{lang === 'en' ? 'VAT' : 'भ्याट'}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {VAT_PRESETS.map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setVatRate(v)}
                            aria-pressed={vatRate === v}
                            className={`cursor-pointer rounded-xl border px-4 py-2.5 text-xs font-bold transition active:scale-[0.97] ${FOCUS} ${
                              vatRate === v
                                ? 'border-purple-400 bg-purple-50 text-purple-700 ring-2 ring-purple-500/15'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-purple-300'
                            }`}
                          >
                            {v === 0 ? (lang === 'en' ? 'No VAT' : 'भ्याट छैन') : `VAT ${v}%`}
                          </button>
                        ))}
                        <div className="relative w-28">
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={100}
                            value={vatRate === 0 ? '' : vatRate}
                            onChange={(e) => setVatRate(Number(e.target.value) || 0)}
                            placeholder={lang === 'en' ? 'Custom' : 'अन्य'}
                            aria-label={lang === 'en' ? 'Custom VAT percent' : 'भ्याट प्रतिशत'}
                            className={`${INPUT} cb-no-spin pr-8`}
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* RIGHT: payment */}
              <aside
                className="flex flex-col border-purple-100 bg-white/90 backdrop-blur-xl lg:min-h-0 lg:border-l"
                aria-labelledby="payment-title"
              >
                <div className="cb-scroll space-y-4 p-4 sm:p-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <h3 id="payment-title" className="flex items-center gap-2 text-base font-bold text-slate-900">
                      <Wallet className="h-5 w-5 text-purple-600" />
                      {lang === 'en' ? 'Collect payment' : 'भुक्तानी लिनुहोस्'}
                    </h3>
                    {selectedMethods.size > 1 && (
                      <span className="rounded-full bg-purple-50 px-2.5 py-1 text-[10px] font-bold text-purple-700 ring-1 ring-inset ring-purple-100">
                        {lang === 'en' ? `Split across ${selectedMethods.size}` : 'विभाजित भुक्तानी'}
                      </span>
                    )}
                  </div>

                  {selectedMethods.size === 0 && !markAsPending && (
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
                            <div className="cb-fade space-y-2 px-3.5 pb-3.5">
                              <label htmlFor={`amt-${pm.id}`} className="block text-[11px] font-bold text-slate-600">
                                {lang === 'en' ? `Amount paid with ${pm.label}` : `${pm.label} बाट तिरेको रकम`}
                              </label>
                              <div className="relative">
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                                  NPR
                                </span>
                                <input
                                  id={`amt-${pm.id}`}
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
                                  className="cb-no-spin w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-3 font-mono text-lg font-bold text-slate-900 outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-500/15"
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

                  {/* Pay later */}
                  <button
                    type="button"
                    onClick={togglePending}
                    aria-pressed={markAsPending}
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition-all ${FOCUS} ${
                      markAsPending
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-dashed border-slate-200 hover:border-amber-300 hover:bg-amber-50/40'
                    }`}
                  >
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                        markAsPending ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Clock className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-bold ${markAsPending ? 'text-amber-800' : 'text-slate-800'}`}>
                        {lang === 'en' ? 'Pay later (pending)' : 'पछि तिर्ने (बाँकी)'}
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        {lang === 'en' ? 'Save the bill and collect payment later' : 'बिल राख्नुहोस्, भुक्तानी पछि लिनुहोस्'}
                      </span>
                    </span>
                    {markAsPending && <CheckCircle2 className="h-5 w-5 shrink-0 text-amber-600" />}
                  </button>

                  {/* Loyalty — only when payment is collected now */}
                  {!markAsPending && (
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
                  )}
                </div>

                {/* Desktop footer — always visible */}
                <div className="hidden shrink-0 border-t border-slate-100 bg-gradient-to-b from-white to-slate-50 px-6 pb-6 pt-4 lg:block">
                  {renderFooter(false)}
                </div>
              </aside>
            </div>

            {/* Mobile / tablet footer — always visible */}
            <div className="relative z-10 shrink-0 border-t border-purple-100 bg-white px-4 pb-4 pt-3 shadow-[0_-8px_24px_rgba(109,40,217,0.08)] lg:hidden">
              {renderFooter(true)}
            </div>
          </div>
        </Portal>
      )}

      {/* QR for the one wallet that was tapped */}
      {qrConfig && selectedOrder && qrMethod && (
        <PaymentQRModal
          method={qrConfig}
          amount={qrAmount}
          onAmountChange={(v) => updateSplitAmount(qrMethod, v)}
          remaining={remainingBalance}
          otherPayments={qrOthers}
          customerName={finalBillTo}
          lang={lang}
          onClose={() => setQrMethod(null)}
        />
      )}

      {/* Loyalty picker */}
      {loyaltyOpen && selectedOrder && (
        <LoyaltyModal
          restaurantId={loyaltyRestaurantId}
          lang={lang}
          grandTotal={grandTotal}
          orderCustomerName={realCustomerName}
          initialMember={loyaltyMember}
          initialPoints={loyaltyPoints}
          onClose={() => setLoyaltyOpen(false)}
          onConfirm={handleLoyaltyConfirm}
        />
      )}

      {/* Printable bill modal, opened right after a bill is created */}
      {createdBill && <BillModal bill={createdBill} lang={lang} onClose={() => setCreatedBill(null)} />}
    </div>
  );
}