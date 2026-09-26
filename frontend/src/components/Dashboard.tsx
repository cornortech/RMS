import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ShoppingBag,
  Calendar,
  Loader2,
  PackageX,
  UtensilsCrossed,
  Receipt,
  LayoutGrid,
  ClipboardList,
  ListOrdered,
  Search,
  Eye,
  RefreshCw,
  Trophy,
  Wallet,
  ChevronDown,
  ChevronRight,
  Users,
  Flame,
  X,
  Sparkles,
  ArrowUpRight,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { Customer, Sale } from '../types';

// ==========================================
// CONFIG
// ==========================================

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').trim().replace(/\/+$/, '');
const BILLS_URL = `${API_BASE}/api/bills`;
const ORDERS_URL = `${API_BASE}/api/orders`;
const TIME_URL = `${API_BASE}/api/restaurant/time`;

const RESTAURANT_USER_STORAGE_KEY = 'user';

interface DashboardProps {
  customers?: Customer[];
  lang: 'en' | 'ne';
  setView: (view: 'dashboard' | 'pos' | 'inventory' | 'billing' | 'staff' | 'settings' | 'orders' | 'tables' | 'kitchen' | 'createbill') => void;
  setSelectedCustomer?: (customer: Customer | null) => void;
  onViewInvoice?: (sale: Sale) => void;
}

// ==========================================
// TEXT (English + Nepali)
// ==========================================

const TEXT = {
  en: {
    title: 'Stats Overview',
    live: 'Live System Feed',
    goodMorning: 'Good morning',
    goodAfternoon: 'Good afternoon',
    goodEvening: 'Good evening',
    dailyRevenue: 'Daily Revenue',
    dailySales: 'Daily Sales',
    billsToday: 'Bills today',
    avgBill: 'Avg. bill',
    totalRevenue: 'Total Revenue',
    allTime: 'All-time total',
    totalOrders: 'Total Orders',
    allTimeOrders: 'All-time orders',
    completed: 'completed',
    vsYesterday: 'vs yesterday',
    salesOverview: 'Sales Overview',
    salesSub: 'Daily sales compared with the previous day',
    days7: '7 Days',
    days14: '14 Days',
    days30: '30 Days',
    total: 'Total Sales',
    avg: 'Average / Day',
    best: 'Best Day',
    vsPrevPeriod: 'vs previous period',
    higher: 'Higher than previous day',
    lower: 'Lower than previous day',
    noPrev: 'No sales the day before',
    bills: 'bills',
    bill: 'bill',
    today: 'Today',
    noSales: 'No sales',
    prevDay: 'Previous day',
    payMix: 'Payment Methods',
    quick: 'Quick Operations',
    menu: 'Menu',
    createBill: 'Create Bill',
    table: 'Table',
    order: 'Order',
    history: 'Transaction History',
    searchPh: 'Search bill no, customer, table…',
    all: 'All',
    billNo: 'Bill',
    dateTime: 'Date & Time',
    customerTable: 'Customer / Table',
    payment: 'Payment',
    amount: 'Amount',
    view: 'View',
    loading: 'Loading transactions...',
    retry: 'Retry',
    none: 'No transactions found',
    scrollMore: 'Scroll for more',
    showing: 'Showing',
    of: 'of',
    walkIn: 'Walk-in',
    noSession: 'No restaurant session found. Please log in again.',
    refresh: 'Refresh',
    salesByStaff: 'Sales By Staff',
    topDishes: 'Top Selling Dishes',
    viewAll: 'View all',
    staffSub: 'Completed orders by each staff member',
    dishSub: 'Most sold dishes from completed orders',
    idLabel: 'ID',
    ordersCompleted: 'orders completed',
    orderCompleted: 'order completed',
    totalSold: 'Total sold',
    totalSale: 'Total sale',
    noStaffSales: 'No completed orders with a staff member yet.',
    noDishSales: 'No dishes sold yet.',
    unknownStaff: 'Unknown staff',
    close: 'Close',
    staffWithSales: 'staff with sales',
    dishesSold: 'dishes sold',
    allTimeData: 'All time',
    grandTotal: 'Grand total',
    subscription: 'Subscription Plan',
    daysRemaining: 'Days remaining',
    daysUnit: 'days',
    planHealthy: 'Active',
    planExpiringSoon: 'Expiring soon',
    planExpired: 'Expired',
  },
  ne: {
    title: 'तथ्याङ्क सिंहावलोकन',
    live: 'लाइभ फिड',
    goodMorning: 'शुभ प्रभात',
    goodAfternoon: 'शुभ दिवा',
    goodEvening: 'शुभ सन्ध्या',
    dailyRevenue: 'दैनिक आम्दानी',
    dailySales: 'दैनिक बिक्री',
    billsToday: 'आजका बिलहरू',
    avgBill: 'औसत बिल',
    totalRevenue: 'कुल आम्दानी',
    allTime: 'सबै समयको जम्मा',
    totalOrders: 'कुल अर्डर',
    allTimeOrders: 'सबै समयका अर्डरहरू',
    completed: 'सम्पन्न',
    vsYesterday: 'हिजोको तुलनामा',
    salesOverview: 'बिक्री सिंहावलोकन',
    salesSub: 'अघिल्लो दिनसँग दैनिक बिक्रीको तुलना',
    days7: '७ दिन',
    days14: '१४ दिन',
    days30: '३० दिन',
    total: 'कुल बिक्री',
    avg: 'दैनिक औसत',
    best: 'उत्कृष्ट दिन',
    vsPrevPeriod: 'अघिल्लो अवधिको तुलनामा',
    higher: 'अघिल्लो दिनभन्दा बढी',
    lower: 'अघिल्लो दिनभन्दा कम',
    noPrev: 'अघिल्लो दिन बिक्री थिएन',
    bills: 'बिल',
    bill: 'बिल',
    today: 'आज',
    noSales: 'बिक्री छैन',
    prevDay: 'अघिल्लो दिन',
    payMix: 'भुक्तानी माध्यम',
    quick: 'द्रुत कार्यहरू',
    menu: 'मेनु',
    createBill: 'बिल बनाउनुहोस्',
    table: 'टेबल',
    order: 'अर्डर',
    history: 'कारोबार इतिहास',
    searchPh: 'बिल नम्बर, ग्राहक, टेबल खोज्नुहोस्…',
    all: 'सबै',
    billNo: 'बिल',
    dateTime: 'मिति र समय',
    customerTable: 'ग्राहक / टेबल',
    payment: 'भुक्तानी',
    amount: 'रकम',
    view: 'हेर्नुहोस्',
    loading: 'कारोबार लोड हुँदैछ...',
    retry: 'फेरि प्रयास गर्नुहोस्',
    none: 'कुनै कारोबार भेटिएन',
    scrollMore: 'थप हेर्न स्क्रोल गर्नुहोस्',
    showing: 'देखाइएको',
    of: 'मध्ये',
    walkIn: 'वाक-इन',
    noSession: 'रेस्टुरेन्ट सत्र फेला परेन। कृपया फेरि लगइन गर्नुहोस्।',
    refresh: 'रिफ्रेस',
    salesByStaff: 'कर्मचारीअनुसार बिक्री',
    topDishes: 'सबैभन्दा धेरै बिक्री हुने परिकार',
    viewAll: 'सबै हेर्नुहोस्',
    staffSub: 'प्रत्येक कर्मचारीका सम्पन्न अर्डरहरू',
    dishSub: 'सम्पन्न अर्डरबाट सबैभन्दा धेरै बिक्री भएका परिकार',
    idLabel: 'आईडी',
    ordersCompleted: 'अर्डर सम्पन्न',
    orderCompleted: 'अर्डर सम्पन्न',
    totalSold: 'कुल बिक्री भएको',
    totalSale: 'कुल बिक्री रकम',
    noStaffSales: 'कर्मचारी सहित कुनै सम्पन्न अर्डर छैन।',
    noDishSales: 'अहिलेसम्म कुनै परिकार बिक्री भएको छैन।',
    unknownStaff: 'अज्ञात कर्मचारी',
    close: 'बन्द गर्नुहोस्',
    staffWithSales: 'बिक्री गर्ने कर्मचारी',
    dishesSold: 'बिक्री भएका परिकार',
    allTimeData: 'सबै समय',
    grandTotal: 'कुल जम्मा',
    subscription: 'सदस्यता योजना',
    daysRemaining: 'बाँकी दिनहरू',
    daysUnit: 'दिन',
    planHealthy: 'सक्रिय',
    planExpiringSoon: 'चाँडै सकिँदैछ',
    planExpired: 'सकिएको',
  },
};

// ==========================================
// TYPES — raw shapes returned by the backend
// ==========================================

interface RawBillLine {
  _id: string;
  invoiceNo: string;
  billTo: string;
  tableNumber?: string | number;
  paymentMethod: string;
  date: string;
  items: {
    itemName?: string;
    name?: string;
    quantity: number;
    rate?: number;
    unitPrice?: number;
    total?: number;
    totalPrice?: number;
  }[];
  subtotal: number;
  discount: number;
  taxableAmount: number;
  vatCollected: number;
  grandTotal: number;
  createdAt?: string;
  restaurantId?: string;
  restaurantName?: string;
  location?: string;
  panOrVat?: string;
}

interface InvoiceLineItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface InvoiceRecord {
  id: string;
  invoiceNo: string;
  billTo: string;
  tableNumber: string;
  paymentMethod: string;
  date: string;
  items: InvoiceLineItem[];
  subtotal: number;
  taxableAmount: number;
  vatAmount: number;
  grandTotal: number;
  restaurantId: string;
  restaurantName: string;
  location: string;
  panOrVat: string;
}

const mapBillToInvoice = (bill: RawBillLine): InvoiceRecord => ({
  id: bill._id,
  invoiceNo: bill.invoiceNo,
  billTo: bill.billTo,
  tableNumber: String(bill.tableNumber ?? ''),
  paymentMethod: bill.paymentMethod,
  date: bill.date || bill.createdAt || new Date().toISOString(),
  items: (bill.items || []).map((item) => ({
    name: item.itemName ?? item.name ?? '',
    quantity: Number(item.quantity) || 0,
    unitPrice: Number(item.rate ?? item.unitPrice) || 0,
    totalPrice: Number(item.total ?? item.totalPrice) || 0,
  })),
  subtotal: Number(bill.subtotal) || 0,
  taxableAmount: Number(bill.taxableAmount) || 0,
  vatAmount: Number(bill.vatCollected) || 0,
  grandTotal: Number(bill.grandTotal) || 0,
  restaurantId: bill.restaurantId || '',
  restaurantName: bill.restaurantName || '',
  location: bill.location || '',
  panOrVat: bill.panOrVat || '',
});

// Convert an invoice into the Sale shape the invoice popup in App.tsx expects
const invoiceToSale = (inv: InvoiceRecord): Sale => ({
  id: inv.invoiceNo,
  customerId: null,
  restaurantName: inv.restaurantName,
  location: inv.location,
  panOrVat: inv.panOrVat,
  items: inv.items,
  subTotal: inv.subtotal,
  discount: Math.max(0, inv.subtotal - inv.taxableAmount),
  vatRate: inv.taxableAmount > 0 ? (inv.vatAmount / inv.taxableAmount) * 100 : 0,
  vatAmount: inv.vatAmount,
  grandTotal: inv.grandTotal,
  paymentMethod: inv.paymentMethod as Sale['paymentMethod'],
  createdAt: inv.date,
});

interface RawOrderItem {
  itemName?: string;
  itemPrice?: number;
  quantity?: number;
}

interface RawOrder {
  id: string;
  _id: string;
  restaurantId: string;
  staffId?: string | null; // the staff LOGIN id (e.g. "111") who created the order
  staffName?: string | null;
  staffRole?: string | null;
  customerName: string;
  tableNumber?: string | number;
  orderNote?: string;
  items: RawOrderItem[];
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  createdAt: string;
}

interface StaffInfo {
  id: string;
  mongoId: string;
  name: string;
  role: string;
}

// ==========================================
// WHICH ORDERS COUNT AS "COMPLETED"?
// An order counts when it is marked Completed OR already Paid,
// and it is not Cancelled or Refunded.
// Change this one function if your restaurant counts sales differently.
// ==========================================
const isCompletedOrder = (o: RawOrder) =>
  o.orderStatus !== 'Cancelled' &&
  o.paymentStatus !== 'Refunded' &&
  (o.orderStatus === 'Completed' || o.paymentStatus === 'Paid');

// Money value of one order (uses totalAmount, falls back to items)
const orderValue = (o: RawOrder) => {
  const t = Number(o.totalAmount);
  if (Number.isFinite(t) && t > 0) return t;
  return (o.items || []).reduce((s, i) => s + (Number(i.itemPrice) || 0) * (Number(i.quantity) || 0), 0);
};

// ==========================================
// HELPERS
// ==========================================

// Local-date key (YYYY-MM-DD). Uses the computer's own timezone, so a bill made
// at 2 AM in Nepal counts for that day (toISOString would use UTC and be off).
const localKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const formatNPR = (n: number) =>
  `NPR ${n.toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const compact = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
    : n >= 1000
    ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`
    : String(Math.round(n));

// Rounds the biggest value up to a "nice" chart maximum (e.g. 3200 -> 5000)
const niceCeil = (v: number) => {
  if (v <= 0) return 100;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
};

// Avatar helpers (initials + colourful gradient from the name)
const AVATAR_GRADIENTS = [
  'from-violet-500 to-fuchsia-500',
  'from-indigo-500 to-sky-500',
  'from-rose-500 to-orange-400',
  'from-emerald-500 to-teal-400',
  'from-amber-500 to-pink-500',
  'from-blue-500 to-violet-500',
];
const initials = (name: string) => {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};
const gradientFor = (name: string) => {
  let hash = 0;
  const s = name || '';
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
};

// Numbers "count up" smoothly whenever the target value changes
function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (target - from) * eased);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prev.current = target;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

// ------------------------------------------
// PAYMENT COLOURS  (change any colour here)
// ------------------------------------------
const PAY_META: Record<string, string> = {
  Cash: '#059669', // green
  eSewa: '#60bb46', // eSewa light green
  Khalti: '#5c2d91', // Khalti purple
  IMEPay: '#ec1c24', // IME Pay red
  Card: '#2563eb', // blue
  Due: '#f59e0b', // amber
  Pending: '#94a3b8', // grey
  Split: '#6366f1', // indigo
};
const PAY_FALLBACK = ['#0ea5e9', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#84cc16'];

const payColor = (method: string, index = 0) => {
  const key = Object.keys(PAY_META).find((k) => k.toLowerCase() === String(method).toLowerCase());
  return key ? PAY_META[key] : PAY_FALLBACK[index % PAY_FALLBACK.length];
};

type Range = 7 | 14 | 30;

// Card styles. CARD_BASE has NO background so coloured cards can set their own.
const CARD_BASE =
  'rounded-2xl border shadow-[0_1px_3px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]';
const CARD = `${CARD_BASE} border-slate-200/70 bg-white`;

// ------------------------------------------
// COLOUR THEMES FOR THE SUMMARY CARDS (light backgrounds)
// ------------------------------------------
type Tone = 'purple' | 'emerald' | 'sky' | 'amber';

const TONES: Record<
  Tone,
  { bg: string; border: string; tile: string; hover: string; line: string; glow: string; card: string; label: string }
> = {
  purple: {
    bg: 'bg-gradient-to-br from-purple-100 via-purple-50 to-white',
    border: 'border-purple-200/80',
    tile: 'bg-white text-purple-600 ring-purple-200',
    hover: 'group-hover:bg-purple-600 group-hover:text-white',
    line: 'from-purple-500 to-violet-500',
    glow: 'bg-purple-300/40',
    card: 'hover:border-purple-300 hover:shadow-[0_10px_28px_rgba(109,40,217,0.16)]',
    label: 'text-purple-800/80',
  },
  emerald: {
    bg: 'bg-gradient-to-br from-emerald-100 via-emerald-50 to-white',
    border: 'border-emerald-200/80',
    tile: 'bg-white text-emerald-600 ring-emerald-200',
    hover: 'group-hover:bg-emerald-600 group-hover:text-white',
    line: 'from-emerald-500 to-teal-500',
    glow: 'bg-emerald-300/40',
    card: 'hover:border-emerald-300 hover:shadow-[0_10px_28px_rgba(5,150,105,0.16)]',
    label: 'text-emerald-800/80',
  },
  sky: {
    bg: 'bg-gradient-to-br from-sky-100 via-sky-50 to-white',
    border: 'border-sky-200/80',
    tile: 'bg-white text-sky-600 ring-sky-200',
    hover: 'group-hover:bg-sky-600 group-hover:text-white',
    line: 'from-sky-500 to-blue-500',
    glow: 'bg-sky-300/40',
    card: 'hover:border-sky-300 hover:shadow-[0_10px_28px_rgba(14,165,233,0.18)]',
    label: 'text-sky-800/80',
  },
  amber: {
    bg: 'bg-gradient-to-br from-amber-100 via-amber-50 to-white',
    border: 'border-amber-200/80',
    tile: 'bg-white text-amber-600 ring-amber-200',
    hover: 'group-hover:bg-amber-500 group-hover:text-white',
    line: 'from-amber-400 to-orange-500',
    glow: 'bg-amber-300/40',
    card: 'hover:border-amber-300 hover:shadow-[0_10px_28px_rgba(245,158,11,0.2)]',
    label: 'text-amber-800/80',
  },
};

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />;
}

// Small pill: green ▲ for growth, red ▼ for decline
function GrowthPill({
  pct,
  size = 'md',
  onDark = false,
}: {
  pct: number | null;
  size?: 'sm' | 'md';
  onDark?: boolean;
}) {
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';
  if (pct === null) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset ${textSize} ${
          onDark ? 'bg-white/15 text-white ring-white/25' : 'bg-purple-50 text-purple-700 ring-purple-200'
        }`}
      >
        <TrendingUp className="h-3 w-3" /> New
      </span>
    );
  }
  const up = pct > 0.05;
  const down = pct < -0.05;
  const cls = onDark
    ? up
      ? 'bg-emerald-400/25 text-emerald-100 ring-emerald-300/40'
      : down
      ? 'bg-rose-400/25 text-rose-100 ring-rose-300/40'
      : 'bg-white/15 text-white ring-white/25'
    : up
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/15'
    : down
    ? 'bg-rose-50 text-rose-700 ring-rose-600/15'
    : 'bg-slate-100 text-slate-500 ring-slate-300/60';
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold tabular-nums ring-1 ring-inset ${textSize} ${cls}`}>
      <Icon className="h-3 w-3" />
      {up ? '+' : ''}
      {pct.toFixed(1)}%
    </span>
  );
}

// ==========================================
// SMALL REUSABLE PIECES
// ==========================================

// Full-width subscription / time-remaining banner. Light background, normal
// height — colour shifts from purple (healthy) to amber (low) to rose (out).
function SubscriptionCard({
  loading,
  total,
  remaining,
  T,
  restaurantId = "9898",
}: {
  loading: boolean;
  total: number | null;
  remaining: number | null;
  T: typeof TEXT.en;
  restaurantId?: string;
}) {
  const [showModal, setShowModal] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const safeTotal = total && total > 0 ? total : 0;
  const safeRemaining = remaining !== null && remaining !== undefined ? Math.max(0, remaining) : 0;
  const pct = safeTotal > 0 ? Math.min(100, (safeRemaining / safeTotal) * 100) : 0;

  const status =
    safeTotal === 0
      ? {
          bg: 'from-slate-100 via-white to-white',
          border: 'border-slate-200/70',
          bar: 'bg-slate-300',
          text: 'text-slate-500',
          chip: 'bg-slate-100 text-slate-600',
          iconBg: 'text-slate-500',
          label: '',
          isCritical: false,
          isWarning: false,
          isActive: false,
        }
      : safeRemaining <= 0
      ? {
          bg: 'from-rose-50 via-rose-50/20 to-white',
          border: 'border-rose-300 shadow-rose-100 animate-pulse',
          bar: 'bg-rose-600',
          text: 'text-rose-700',
          chip: 'bg-rose-100 text-rose-800 font-extrabold border border-rose-200',
          iconBg: 'text-rose-600 bg-rose-50 ring-rose-200',
          label: T.planExpired || "Subscription Expired",
          isCritical: true,
          isWarning: false,
          isActive: false,
        }
      : pct <= 15
      ? {
          bg: 'from-amber-50 via-amber-50/20 to-white',
          border: 'border-amber-300 shadow-amber-100',
          bar: 'bg-amber-500',
          text: 'text-amber-700',
          chip: 'bg-amber-100 text-amber-800 font-extrabold border border-amber-200',
          iconBg: 'text-amber-600 bg-amber-50 ring-amber-200',
          label: T.planExpiringSoon || "Expiring Soon",
          isCritical: false,
          isWarning: true,
          isActive: false,
        }
      : {
          bg: 'from-emerald-50 via-emerald-50/10 to-white',
          border: 'border-emerald-200/80 shadow-emerald-50',
          bar: 'bg-emerald-600',
          text: 'text-emerald-700',
          chip: 'bg-emerald-100 text-emerald-800 font-extrabold border border-emerald-200',
          iconBg: 'text-emerald-600 bg-emerald-50 ring-emerald-200',
          label: T.planHealthy || "Fully Active",
          isCritical: false,
          isWarning: false,
          isActive: true,
        };

  const handleCopyDetails = () => {
    navigator.clipboard.writeText(`Restaurant ID: ${restaurantId} - Plan Status: Active (${safeRemaining} days left)`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div
        id="subscription-time-card"
        className={`db-rise relative w-full overflow-hidden rounded-3xl border ${status.border} bg-gradient-to-r ${status.bg} p-5 shadow-lg sm:p-6 transition-all`}
      >
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-emerald-200/20 blur-3xl" />

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm ring-1 ring-inset ${status.iconBg}`}>
              {status.isCritical || status.isWarning ? <AlertTriangle className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{T.subscription}</p>
                {!loading && status.label && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${status.chip}`}>
                    {status.isActive ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" /> : <AlertTriangle className="h-2.5 w-2.5" />}
                    {status.label}
                  </span>
                )}
              </div>
              {loading ? (
                <div className="mt-1.5 h-8 w-44 animate-pulse rounded-md bg-slate-200/70" />
              ) : (
                <div className="flex items-baseline gap-2 mt-0.5">
                  <p className={`text-2xl font-extrabold tabular-nums sm:text-[28px] ${status.isCritical ? 'text-rose-700' : status.isWarning ? 'text-amber-700' : 'text-slate-900'}`}>
                    {safeRemaining}
                  </p>
                  <span className="text-base font-semibold text-slate-400">/ {safeTotal} {T.daysUnit}</span>
                </div>
              )}
            </div>
          </div>

          <div className="w-full sm:max-w-xs flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
              <span>{T.daysRemaining}</span>
              <span className={`tabular-nums ${status.text}`}>{loading ? '—' : `${Math.round(pct)}%`}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/70 ring-1 ring-inset ring-black/5">
              <div
                className={`h-full rounded-full ${status.bar} transition-all duration-700`}
                style={{ width: loading ? '0%' : `${pct}%` }}
              />
            </div>

            {/* Expired Warning & CTA */}
            {status.isCritical && !loading && (
              <div className="mt-2 space-y-2 rounded-2xl bg-rose-100/80 p-3 border border-rose-200 text-left">
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-rose-900 leading-tight">
                  ⚠️ System will be deactivated any time. Please contact administrator to renew your plan.
                </p>
                <button
                  onClick={() => setShowModal(true)}
                  className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm transition-all cursor-pointer active:scale-95"
                >
                  Renew Subscription
                </button>
              </div>
            )}

            {/* Expiring Soon Warning & CTA */}
            {status.isWarning && !loading && (
              <div className="mt-2 space-y-2 rounded-2xl bg-amber-100/80 p-3 border border-amber-200 text-left">
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-amber-900 leading-tight">
                  ⚡ Your plan is expiring soon. Renew now to ensure uninterrupted service.
                </p>
                <button
                  onClick={() => setShowModal(true)}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm transition-all cursor-pointer active:scale-95"
                >
                  Renew Plan Early
                </button>
              </div>
            )}

            {/* Active / Healthy Plan Info Box & CTA */}
            {status.isActive && !loading && (
              <div className="mt-2 space-y-2 rounded-2xl bg-emerald-100/60 p-3 border border-emerald-200/80 text-left">
                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900 leading-tight">
                  ✓ Your subscription is active and running smoothly. All systems operational.
                </p>
                <button
                  onClick={() => setShowModal(true)}
                  className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm transition-all cursor-pointer active:scale-95"
                >
                  View Plan Details
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Custom Gorgeous Popup Modal (Positioned Higher up) */}
     {showModal &&
        createPortal(
          <div
            className="db-fade fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
              className="db-pop w-full max-w-md space-y-5 rounded-3xl border border-slate-100 bg-white p-6 text-center shadow-2xl"
            >
            
            <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl shadow-inner ${safeRemaining <= 0 ? 'bg-rose-100 text-rose-600' : pct <= 15 ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
              {safeRemaining <= 0 || pct <= 15 ? <AlertTriangle className="h-8 w-8 animate-bounce" /> : <Clock className="h-8 w-8" />}
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                {safeRemaining <= 0 ? "Plan Renewal Required" : pct <= 15 ? "Extend Your Subscription" : "Subscription Status Overview"}
              </h3>
              <p className="text-xs font-medium text-slate-500 leading-relaxed px-2">
                {safeRemaining <= 0 
                  ? "Your restaurant's operational access has expired. To resume unhindered access and prevent system shutdown, please reach out to your system administrator."
                  : pct <= 15
                  ? "Your plan is running low on time. Renew early with your administrator to avoid any disruption in restaurant operations."
                  : "Your restaurant subscription is fully verified and running smoothly. You have complete access to all backend and operational modules."}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4 text-left space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-700">
                <span>Restaurant ID:</span>
                <span className="text-slate-900 font-mono bg-white px-2 py-0.5 rounded border border-slate-200">{restaurantId}</span>
              </div>
              <div className="flex justify-between text-xs font-bold text-slate-700">
                <span>Time Status:</span>
                <span className={safeRemaining <= 0 ? "text-rose-600 uppercase" : pct <= 15 ? "text-amber-600 uppercase" : "text-emerald-700 uppercase"}>
                  {safeRemaining <= 0 ? "Expired (0 Days)" : `${safeRemaining} of ${safeTotal} Days Remaining`}
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={handleCopyDetails}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer"
              >
                {copied ? "✓ Details Copied to Clipboard!" : "Copy Account Details"}
              </button>
              
              <button
                onClick={() => setShowModal(false)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// Summary card with its own light background colour
function StatCard({
  id,
  label,
  icon,
  loading,
  value,
  footer,
  tone = 'purple',
  className = '',
  delay = 0,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  value: React.ReactNode;
  footer: React.ReactNode;
  tone?: Tone;
  className?: string;
  delay?: number;
}) {
  const t = TONES[tone];
  return (
    <div
      id={id}
      style={{ animationDelay: `${delay}ms` }}
      className={`${CARD_BASE} ${t.bg} ${t.border} db-rise group relative flex flex-col justify-between overflow-hidden p-5 transition-all duration-200 hover:-translate-y-1 ${t.card} ${className}`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${t.line}`} />
      <div className={`pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full blur-2xl ${t.glow}`} />

      <div className="relative flex items-center justify-between gap-3">
        <p className={`text-xs font-bold uppercase tracking-wider ${t.label}`}>{label}</p>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-sm ring-1 ring-inset transition-all duration-200 group-hover:scale-110 ${t.tile} ${t.hover}`}>
          {icon}
        </div>
      </div>
      <div className="relative mt-4">
        {loading ? (
          <Skeleton className="h-8 w-32" />
        ) : (
          <p className="text-2xl font-extrabold tracking-tight tabular-nums text-slate-900 sm:text-[28px]">{value}</p>
        )}
        <div className="mt-1.5 min-h-[18px] text-xs font-medium text-slate-500">
          {loading ? <Skeleton className="h-3.5 w-20" /> : footer}
        </div>
      </div>
    </div>
  );
}

// Medal colours: gold, silver, bronze
function RankBadge({ rank }: { rank: number }) {
  const cls =
    rank === 1
      ? 'bg-gradient-to-br from-amber-400 to-yellow-500 text-white shadow-sm shadow-amber-500/40'
      : rank === 2
      ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-sm shadow-slate-400/40'
      : rank === 3
      ? 'bg-gradient-to-br from-orange-300 to-orange-500 text-white shadow-sm shadow-orange-500/30'
      : 'bg-slate-100 text-slate-500';
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${cls}`}>
      {rank}
    </span>
  );
}

// One row: rank, name, small line under it, and the money on the right
function StatRow({
  rank,
  title,
  sub,
  amount,
  note,
  amountClass = 'text-purple-700',
}: {
  rank: number;
  title: string;
  sub: React.ReactNode;
  amount: string;
  note: string;
  amountClass?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3 transition-all hover:-translate-y-0.5 hover:border-slate-200 hover:bg-white hover:shadow-sm">
      <RankBadge rank={rank} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-tight text-slate-900">{title}</p>
        <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>
      </div>
      <div className="shrink-0 text-right">
        <p className={`font-mono text-sm font-bold tabular-nums ${amountClass}`}>{amount}</p>
        <p className="text-[10px] font-medium text-slate-400">{note}</p>
      </div>
    </div>
  );
}

// Colour themes for the two ranking cards
const STAFF_THEME = {
  icon: 'from-sky-500 to-blue-600 shadow-blue-500/30',
  pill: 'bg-sky-50 text-sky-700 group-hover:bg-sky-600 group-hover:text-white',
  border: 'hover:border-sky-300 hover:shadow-[0_8px_24px_rgba(14,165,233,0.14)]',
  modalHeader: 'from-sky-50 to-white border-sky-100',
  amount: 'text-sky-700',
};
const DISH_THEME = {
  icon: 'from-orange-500 to-rose-500 shadow-orange-500/30',
  pill: 'bg-orange-50 text-orange-700 group-hover:bg-orange-500 group-hover:text-white',
  border: 'hover:border-orange-300 hover:shadow-[0_8px_24px_rgba(249,115,22,0.14)]',
  modalHeader: 'from-orange-50 to-white border-orange-100',
  amount: 'text-orange-600',
};

// Card that shows the top 3 and opens a popup with everything when clicked
function RankingCard({
  icon,
  title,
  subtitle,
  viewAllLabel,
  totalCount,
  loading,
  emptyText,
  onOpen,
  theme,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  viewAllLabel: string;
  totalCount: number;
  loading: boolean;
  emptyText: string;
  onOpen: () => void;
  theme: typeof STAFF_THEME;
  children: React.ReactNode;
}) {
  const empty = !loading && totalCount === 0;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !empty && onOpen()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !empty) {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`group db-rise ${CARD} p-5 transition-all ${empty ? '' : `cursor-pointer ${theme.border}`}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ${theme.icon}`}>
            {icon}
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>
        {!empty && !loading && (
          <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${theme.pill}`}>
            {viewAllLabel} ({totalCount})
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[60px] w-full rounded-xl" />
          ))}
        </div>
      ) : empty ? (
        <div className="flex h-40 items-center justify-center px-6 text-center text-xs text-slate-400">{emptyText}</div>
      ) : (
        <div className="space-y-2.5">{children}</div>
      )}
    </div>
  );
}

// Popup window (click outside, press Esc, or use the X button to close)
// Rendered on <body> so it is always centred on the SCREEN, not the page.
function Modal({
  title,
  subtitle,
  closeLabel,
  onClose,
  footer,
  headerClass = 'from-purple-50 to-white border-purple-100',
  children,
}: {
  title: string;
  subtitle?: string;
  closeLabel: string;
  onClose: () => void;
  footer?: React.ReactNode;
  headerClass?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="db-fade fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="db-pop flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-start justify-between gap-3 border-b bg-gradient-to-r px-5 py-4 ${headerClass}`}>
          <div>
            <h3 className="text-lg font-bold tracking-tight text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            title={closeLabel}
            className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-2.5 overflow-y-auto px-5 py-4 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200 hover:[&::-webkit-scrollbar-thumb]:bg-slate-300">
          {children}
        </div>
        {footer && <div className="border-t border-slate-100 bg-slate-50 px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

// ------------------------------------------
// PAYMENT METHODS: donut chart + coloured legend
// ------------------------------------------
function PaymentMixCard({
  list,
  sum,
  rangeLabel,
  title,
  totalLabel,
  emptyText,
  animate,
}: {
  list: [string, number][];
  sum: number;
  rangeLabel: string;
  title: string;
  totalLabel: string;
  emptyText: string;
  animate: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const R = 42;
  const C = 2 * Math.PI * R;
  const GAP = list.length > 1 ? 3 : 0;

  let acc = 0;
  const segments = list.map(([method, value], i) => {
    const frac = sum > 0 ? value / sum : 0;
    const seg = {
      method,
      value,
      frac,
      pct: frac * 100,
      len: Math.max(frac * C - GAP, 0),
      offset: acc,
      color: payColor(method, i),
    };
    acc += frac * C;
    return seg;
  });

  const active = hover !== null ? segments[hover] : null;

  return (
    <div className={`${CARD} db-rise p-5`} id="payment-mix-card">
      <div className="mb-5 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100">
          <Wallet className="h-4 w-4" />
        </div>
        <h2 className="text-sm font-bold tracking-tight text-slate-900">{title}</h2>
        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
          {rangeLabel}
        </span>
      </div>

      {segments.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-400">{emptyText}</p>
      ) : (
        <>
          <div className="relative mx-auto h-44 w-44">
            <svg viewBox="0 0 120 120" className="h-full w-full">
              <circle cx="60" cy="60" r={R} fill="none" stroke="#f1f5f9" strokeWidth="14" />
              <g transform="rotate(-90 60 60)">
                {segments.map((s, i) => (
                  <circle
                    key={s.method}
                    cx="60"
                    cy="60"
                    r={R}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={hover === i ? 17 : 14}
                    strokeDasharray={`${animate ? s.len : 0} ${C}`}
                    strokeDashoffset={-s.offset}
                    opacity={hover === null || hover === i ? 1 : 0.35}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    style={{
                      transition:
                        'stroke-dasharray 800ms cubic-bezier(.22,1,.36,1), stroke-width 150ms, opacity 150ms',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </g>
            </svg>

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              {active ? (
                <>
                  <span className="text-2xl font-bold tabular-nums" style={{ color: active.color }}>
                    {active.pct.toFixed(0)}%
                  </span>
                  <span className="mt-0.5 max-w-[90px] truncate text-[11px] font-semibold text-slate-700">
                    {active.method}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {totalLabel}
                  </span>
                  <span className="text-xl font-bold tabular-nums text-slate-900">{compact(sum)}</span>
                  <span className="text-[10px] font-medium text-slate-400">NPR</span>
                </>
              )}
            </div>
          </div>

          <div className="mt-5 space-y-1">
            {segments.map((s, i) => (
              <div
                key={s.method}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                className="rounded-xl px-3 py-2.5 transition-colors"
                style={{ backgroundColor: hover === i ? `${s.color}14` : undefined }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color, boxShadow: `0 0 0 4px ${s.color}22` }}
                  />
                  <span className="flex-1 truncate text-sm font-semibold text-slate-800">{s.method}</span>
                  <span className="font-mono text-xs tabular-nums text-slate-500">{formatNPR(s.value)}</span>
                  <span
                    className="w-12 rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums"
                    style={{ backgroundColor: `${s.color}1f`, color: s.color }}
                  >
                    {s.pct.toFixed(0)}%
                  </span>
                </div>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: animate ? `${s.pct}%` : '0%', backgroundColor: s.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ==========================================
// COMPONENT
// ==========================================

export default function Dashboard({ lang, setView, onViewInvoice }: DashboardProps) {
  const T = TEXT[lang] || TEXT.en;

  const [time, setTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDateTime = (date: Date) =>
    date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

  const hour = time.getHours();
  const greeting = hour < 12 ? T.goodMorning : hour < 17 ? T.goodAfternoon : T.goodEvening;

  // ---- who is logged in ----
  const [restaurantId, setRestaurantId] = useState<string>('');
  const [restaurantName, setRestaurantName] = useState<string>('');
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RESTAURANT_USER_STORAGE_KEY);
      if (raw) {
        const storedUser = JSON.parse(raw);
        const id =
          storedUser?.id ||
          storedUser?._id ||
          storedUser?.restaurant?.id ||
          storedUser?.restaurant?._id ||
          '';
        setRestaurantId(String(id));

        let name = String(storedUser?.restaurantName || '');
        if (!name) {
          const full = localStorage.getItem('restaurantUser');
          if (full) name = String(JSON.parse(full)?.restaurantName || '');
        }
        setRestaurantName(name);
      }
    } catch (err) {
      console.error('Failed to parse restaurant user from localStorage:', err);
    }
  }, []);

  // ---- bills ----
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [billsLoading, setBillsLoading] = useState(true);
  const [billsError, setBillsError] = useState('');

  const fetchBills = async (rid: string) => {
    setBillsLoading(true);
    setBillsError('');
    try {
      const res = await fetch(`${BILLS_URL}?restaurantId=${encodeURIComponent(rid)}`);
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to load billing ledger.');
      }
      const mapped = (result.data || [])
        .map(mapBillToInvoice)
        .sort((a: InvoiceRecord, b: InvoiceRecord) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setInvoices(mapped);
    } catch (err: any) {
      setBillsError(err.message || 'Could not connect to the server.');
    } finally {
      setBillsLoading(false);
    }
  };

  useEffect(() => {
    if (!restaurantId) return;
    fetchBills(restaurantId);
  }, [restaurantId]);

  // ---- orders ----
  const [orders, setOrders] = useState<RawOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  const fetchOrders = async (rid: string) => {
    setOrdersLoading(true);
    try {
      const res = await fetch(`${ORDERS_URL}?restaurantId=${encodeURIComponent(rid)}`);
      const result = await res.json();
      if (res.ok && result.success) setOrders(result.data || []);
    } catch (err) {
      console.error('Failed to load orders', err);
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    if (!restaurantId) return;
    fetchOrders(restaurantId);
  }, [restaurantId]);

  // ---- staff list (to turn a staffId into a name) ----
  const [staffList, setStaffList] = useState<StaffInfo[]>([]);

  const fetchStaff = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/staff/names`);
      const result = await res.json();
      if (res.ok && result.success) {
        const list = (result.data || []).map((s: any) => ({
          id: String(s.id).trim(),
          mongoId: String(s._id || '').trim(),
          name: String(s.staffName || '').trim(),
          role: String(s.role || '').trim(),
        }));
        setStaffList(list);
      } else {
        console.warn('Staff list request failed:', res.status, result);
      }
    } catch (err) {
      console.error('Failed to load staff list', err);
    }
  };

  useEffect(() => {
    if (!restaurantId) return;
    fetchStaff();
  }, [restaurantId]);

  // ---- Subscription Plan plan time (total / remaining days) ----
  const [planTotal, setPlanTotal] = useState<number | null>(null);
  const [planRemaining, setPlanRemaining] = useState<number | null>(null);
  const [planLoading, setPlanLoading] = useState(true);

  const getAuthHeader = (): Record<string, string> => {
  let token = '';
  try {
    token =
      localStorage.getItem('token') ||
      localStorage.getItem('authToken') ||
      localStorage.getItem('accessToken') ||
      sessionStorage.getItem('token') ||
      '';
  } catch (err) {
    token = '';
  }
  return token ? { Authorization: `Bearer ${token}` } : {};
};

 const fetchPlanTime = async (rid: string) => {
  setPlanLoading(true);
  try {
    const res = await fetch(`${TIME_URL}?restaurantId=${encodeURIComponent(rid)}`, {
      headers: { ...getAuthHeader() },
    });
    const result = await res.json();
    if (res.ok && result.success && result.data) {
      setPlanTotal(Number(result.data.totalTime) || 0);
      setPlanRemaining(Number(result.data.remainingTime) || 0);
    } else {
      console.warn('Subscription time request failed:', res.status, result);
    }
  } catch (err) {
    console.error('Failed to load subscription time', err);
  } finally {
    setPlanLoading(false);
  }
};


  useEffect(() => {
    if (!restaurantId) return;
    fetchPlanTime(restaurantId);
    // Re-sync once a minute so the countdown rolls over to the next day on
    // its own — without this, the number would only ever update on a manual
    // page refresh or a full re-login.
    const interval = setInterval(() => fetchPlanTime(restaurantId), 60000);
    return () => clearInterval(interval);
  }, [restaurantId]);

  const refreshAll = () => {
    if (!restaurantId) return;
    fetchBills(restaurantId);
    fetchOrders(restaurantId);
    fetchStaff();
    fetchPlanTime(restaurantId);
  };

  // ---- daily totals ----
  const dayTotals = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    invoices.forEach((inv) => {
      const key = localKey(new Date(inv.date));
      const cur = map.get(key) || { total: 0, count: 0 };
      cur.total += inv.grandTotal;
      cur.count += 1;
      map.set(key, cur);
    });
    return map;
  }, [invoices]);

  const startOfToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const daysAgo = (n: number) => {
    const d = startOfToday();
    d.setDate(d.getDate() - n);
    return d;
  };

  const todayData = dayTotals.get(localKey(daysAgo(0))) || { total: 0, count: 0 };
  const yesterdayData = dayTotals.get(localKey(daysAgo(1))) || { total: 0, count: 0 };
  const todayVsYesterday =
    yesterdayData.total > 0
      ? ((todayData.total - yesterdayData.total) / yesterdayData.total) * 100
      : todayData.total > 0
      ? null
      : 0;

  const dailyRevenue = todayData.total;
  const dailySalesCount = todayData.count;
  const avgBillToday = dailySalesCount > 0 ? dailyRevenue / dailySalesCount : 0;
  const totalRevenue = useMemo(() => invoices.reduce((sum, inv) => sum + inv.grandTotal, 0), [invoices]);
  const totalOrdersCount = orders.length;
  const completedOrdersCount = useMemo(() => orders.filter(isCompletedOrder).length, [orders]);

  // Animated (count-up) numbers — these hooks must stay above the early return below
  const animRevenueToday = useCountUp(dailyRevenue);
  const animSalesCount = useCountUp(dailySalesCount);
  const animOrders = useCountUp(totalOrdersCount);
  const animTotalRevenue = useCountUp(totalRevenue);

  // ---- last 7 days (mini bars inside the Daily Revenue card) ----
  const last7 = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = daysAgo(6 - i);
      return {
        key: localKey(d),
        date: d,
        total: dayTotals.get(localKey(d))?.total || 0,
        isToday: i === 6,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayTotals]);
  const last7Max = Math.max(...last7.map((d) => d.total), 1);

  // ---- sales overview chart ----
  const [rangeDays, setRangeDays] = useState<Range>(7);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [animate, setAnimate] = useState(false);

  const series = useMemo(() => {
    return Array.from({ length: rangeDays }, (_, idx) => {
      const offset = rangeDays - 1 - idx;
      const d = daysAgo(offset);
      const cur = dayTotals.get(localKey(d)) || { total: 0, count: 0 };
      const prev = dayTotals.get(localKey(daysAgo(offset + 1))) || { total: 0, count: 0 };
      const diff = cur.total - prev.total;
      const pct = prev.total > 0 ? (diff / prev.total) * 100 : cur.total > 0 ? null : 0;
      return {
        key: localKey(d),
        date: d,
        total: cur.total,
        count: cur.count,
        prevTotal: prev.total,
        diff,
        pct,
        isToday: offset === 0,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayTotals, rangeDays]);

  // Re-play the "bars grow" animation when data or range changes
  useEffect(() => {
    setAnimate(false);
    const t = setTimeout(() => setAnimate(true), 60);
    return () => clearTimeout(t);
  }, [rangeDays, invoices.length]);

  const rangeTotal = series.reduce((s, p) => s + p.total, 0);
  const avgPerDay = rangeTotal / rangeDays;
  const bestDay = series.reduce((best, p) => (p.total > best.total ? p : best), series[0]);
  const prevPeriodTotal = useMemo(() => {
    let sum = 0;
    for (let i = rangeDays; i < rangeDays * 2; i++) {
      sum += dayTotals.get(localKey(daysAgo(i)))?.total || 0;
    }
    return sum;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayTotals, rangeDays]);
  const periodPct =
    prevPeriodTotal > 0 ? ((rangeTotal - prevPeriodTotal) / prevPeriodTotal) * 100 : rangeTotal > 0 ? null : 0;

  const maxValue = Math.max(...series.map((s) => s.total), 0);
  const niceMax = niceCeil(maxValue);
  const ticks = [0, 1, 2, 3, 4].map((i) => (niceMax * i) / 4);
  const showLabels = rangeDays <= 14;
  const shownIdx = activeIdx ?? series.length - 1;
  const shown = series[Math.min(shownIdx, series.length - 1)];

  // Bars: light purple, the selected day is a deep purple gradient
  const barColor = (s: (typeof series)[number], active: boolean) =>
    s.total === 0
      ? 'bg-slate-100'
      : active
      ? 'bg-gradient-to-t from-purple-700 to-fuchsia-500 shadow-md shadow-purple-500/30'
      : 'bg-purple-200 hover:bg-purple-400';

  // ---- payment mix (inside the selected range) ----
  const paymentMix = useMemo(() => {
    const firstKey = series[0]?.key || '';
    const map = new Map<string, number>();
    invoices.forEach((inv) => {
      if (localKey(new Date(inv.date)) >= firstKey) {
        map.set(inv.paymentMethod, (map.get(inv.paymentMethod) || 0) + inv.grandTotal);
      }
    });
    const list = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const sum = list.reduce((s, [, v]) => s + v, 0);
    return { list, sum };
  }, [invoices, series]);

  // ---- SALES BY STAFF ----
  const staffStats = useMemo(() => {
    const byLoginId = new Map(staffList.map((s) => [s.id, s]));
    const byMongoId = new Map(staffList.filter((s) => s.mongoId).map((s) => [s.mongoId, s]));
    const map = new Map<string, { staffId: string; name: string; role: string; orders: number; total: number }>();

    orders.forEach((o) => {
      if (!o.staffId || !isCompletedOrder(o)) return;

      const raw = String(o.staffId).trim();
      const info = byLoginId.get(raw) || byMongoId.get(raw);
      const key = info ? info.id : raw;

      const cur = map.get(key) || {
        staffId: key,
        name: info?.name || T.unknownStaff,
        role: info?.role || '',
        orders: 0,
        total: 0,
      };
      cur.orders += 1;
      cur.total += orderValue(o);
      map.set(key, cur);
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total || b.orders - a.orders);
  }, [orders, staffList, T.unknownStaff]);

  // ---- TOP SELLING DISHES ----
  const dishStats = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; total: number }>();

    orders.forEach((o) => {
      if (!isCompletedOrder(o)) return;
      (o.items || []).forEach((item) => {
        const name = (item.itemName || 'Unknown Item').trim();
        const key = name.toLowerCase();
        const qty = Number(item.quantity) || 0;
        const cur = map.get(key) || { name, qty: 0, total: 0 };
        cur.qty += qty;
        cur.total += qty * (Number(item.itemPrice) || 0);
        map.set(key, cur);
      });
    });

    return Array.from(map.values()).sort((a, b) => b.qty - a.qty || b.total - a.total);
  }, [orders]);

  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showDishModal, setShowDishModal] = useState(false);

  const staffGrandTotal = staffStats.reduce((s, x) => s + x.total, 0);
  const dishGrandTotal = dishStats.reduce((s, x) => s + x.total, 0);

  const staffRowProps = (s: (typeof staffStats)[number], i: number) => ({
    rank: i + 1,
    title: s.name,
    sub: (
      <span className="font-mono">
        {T.idLabel}: {s.staffId}
        {s.role ? <span className="font-sans"> · {s.role}</span> : null}
      </span>
    ),
    amount: formatNPR(s.total),
    note: `${s.orders} ${s.orders === 1 ? T.orderCompleted : T.ordersCompleted}`,
    amountClass: STAFF_THEME.amount,
  });

  const dishRowProps = (d: (typeof dishStats)[number], i: number) => ({
    rank: i + 1,
    title: d.name,
    sub: (
      <span>
        {T.totalSold}: <span className="font-bold text-slate-800">{d.qty}</span>
      </span>
    ),
    amount: formatNPR(d.total),
    note: T.totalSale,
    amountClass: DISH_THEME.amount,
  });

  // ---- transaction history (search + payment filter + scroll) ----
  const [query, setQuery] = useState('');
  const [payFilter, setPayFilter] = useState<string>('all');

  const payMethods = useMemo(() => Array.from(new Set(invoices.map((i) => i.paymentMethod))).filter(Boolean), [invoices]);

  const filteredInvoices = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (payFilter !== 'all' && inv.paymentMethod !== payFilter) return false;
      if (!q) return true;
      return (
        inv.invoiceNo.toLowerCase().includes(q) ||
        (inv.billTo || '').toLowerCase().includes(q) ||
        inv.tableNumber.toLowerCase().includes(q) ||
        inv.paymentMethod.toLowerCase().includes(q)
      );
    });
  }, [invoices, query, payFilter]);

  const listRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(false);
  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
  };
  useEffect(() => {
    handleScroll();
  }, [filteredInvoices.length, billsLoading]);
  const hasMore = filteredInvoices.length > 5 && !atBottom;

  // ==========================================
  // RENDER
  // ==========================================

  if (!restaurantId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center" id="dashboard-no-restaurant">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
          <UtensilsCrossed className="h-7 w-7" />
        </div>
        <p className="text-sm font-medium text-slate-700">{T.noSession}</p>
      </div>
    );
  }

  const rangeLabel = rangeDays === 7 ? T.days7 : rangeDays === 14 ? T.days14 : T.days30;

  // Quick actions, each with its own colour
  const quickActions = [
    {
      key: 'createbill',
      label: T.createBill,
      icon: Receipt,
      view: 'createbill' as const,
      tile: 'border-transparent bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white shadow-md shadow-purple-500/30 hover:shadow-lg hover:shadow-purple-500/40',
      iconBox: 'bg-white/20 text-white',
      arrow: 'text-white/70',
    },
    {
      key: 'inventory',
      label: T.menu,
      icon: UtensilsCrossed,
      view: 'inventory' as const,
      tile: 'border-amber-200 bg-gradient-to-br from-amber-100 to-amber-50 text-slate-800 hover:border-amber-300 hover:shadow-md hover:shadow-amber-200/60',
      iconBox: 'bg-white text-amber-600 shadow-sm',
      arrow: 'text-amber-500',
    },
    {
      key: 'tables',
      label: T.table,
      icon: LayoutGrid,
      view: 'tables' as const,
      tile: 'border-sky-200 bg-gradient-to-br from-sky-100 to-sky-50 text-slate-800 hover:border-sky-300 hover:shadow-md hover:shadow-sky-200/60',
      iconBox: 'bg-white text-sky-600 shadow-sm',
      arrow: 'text-sky-500',
    },
    {
      key: 'orders',
      label: T.order,
      icon: ClipboardList,
      view: 'orders' as const,
      tile: 'border-emerald-200 bg-gradient-to-br from-emerald-100 to-emerald-50 text-slate-800 hover:border-emerald-300 hover:shadow-md hover:shadow-emerald-200/60',
      iconBox: 'bg-white text-emerald-600 shadow-sm',
      arrow: 'text-emerald-500',
    },
  ];

  return (
    <div className="space-y-6" id="dashboard-container">
      <style>{`
        @keyframes db-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes db-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes db-pop { from { opacity: 0; transform: scale(.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes db-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        .db-rise { animation: db-rise .45s cubic-bezier(.22,1,.36,1) both; }
        .db-fade { animation: db-fade .2s ease-out both; }
        .db-pop { animation: db-pop .25s ease-out both; }
        .db-float { animation: db-float 5s ease-in-out infinite; }
      `}</style>

      {/* ---------- HEADER ---------- */}
      <div className="db-rise flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" id="dashboard-header">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 via-violet-600 to-fuchsia-600 text-white shadow-lg shadow-purple-500/30">
            <LayoutGrid className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-purple-600">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {T.live}
            </div>
            <h1 className="mt-0.5 flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              {greeting}
              <Sparkles className="h-6 w-6 text-amber-400" />
            </h1>
            <p className="text-sm font-medium text-slate-500">
              {restaurantName ? `${restaurantName} · ` : ''}
              {T.title}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2" id="dashboard-date">
          <div className="flex items-center gap-2 rounded-xl border border-purple-100 bg-gradient-to-r from-white to-purple-50 px-3.5 py-2.5 text-xs font-medium text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
            <Calendar className="h-3.5 w-3.5 shrink-0 text-purple-500" />
            <span className="font-mono tabular-nums">{formatDateTime(time)}</span>
          </div>
          <button
            type="button"
            onClick={refreshAll}
            title={T.refresh}
            aria-label={T.refresh}
            className="cursor-pointer rounded-xl border border-purple-100 bg-white p-2.5 text-purple-600 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-all hover:bg-purple-600 hover:text-white active:scale-95"
          >
            <RefreshCw className={`h-4 w-4 ${billsLoading || ordersLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>



      {/* ---------- SUMMARY CARDS ---------- */}
   <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" id="stats-grid">
  {/* 1. Hero: Daily revenue + last 7 days mini bars (Light Theme) */}
  <div
    id="stat-daily-revenue"
    className="db-rise relative flex flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-violet-50/90 via-purple-50/40 to-white border border-violet-200/80 p-6 text-gray-950 shadow-xl shadow-purple-500/5 sm:col-span-2 lg:row-span-2"
  >
    <div className="pointer-events-none absolute -right-14 -top-14 h-56 w-56 rounded-full bg-violet-200/40 blur-2xl" />
    <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-fuchsia-200/30 blur-3xl" />

    <div className="relative">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-100/80 px-2.5 py-0.5 text-xs font-semibold text-violet-800">
            <Sparkles className="h-3 w-3" /> Analytics
          </span>
          <p className="text-xs font-bold uppercase tracking-wider text-violet-900/80">{T.dailyRevenue}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-200 bg-white/90 text-violet-700 shadow-sm backdrop-blur-sm">
          <TrendingUp className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-5">
        {billsLoading ? (
          <div className="h-10 w-56 animate-pulse rounded-md bg-gray-200" />
        ) : (
          <p className="text-3xl font-black tracking-tight tabular-nums sm:text-4xl text-gray-950">
            {formatNPR(animRevenueToday)}
          </p>
        )}
        {!billsLoading && (
          <div className="mt-3 flex items-center gap-2">
            <GrowthPill pct={todayVsYesterday} />
            <span className="text-xs font-medium text-gray-600">{T.vsYesterday}</span>
          </div>
        )}
      </div>
    </div>

    <div className="relative mt-8">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">{T.days7}</p>
      <div className="flex h-24 items-end gap-2">
        {last7.map((d) => {
          const h = d.total > 0 ? Math.max((d.total / last7Max) * 100, 8) : 4;
          return (
            <div
              key={d.key}
              className="group/bar relative flex h-full flex-1 flex-col justify-end"
            >
              <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] font-bold text-white opacity-0 shadow-md transition-opacity group-hover/bar:opacity-100">
                {compact(d.total)}
              </span>
              <div
                className={`w-full rounded-t-lg transition-all duration-700 ease-out ${
                  d.isToday
                    ? 'bg-violet-600 shadow-md shadow-violet-500/30'
                    : d.total > 0
                    ? 'bg-violet-200 group-hover/bar:bg-violet-400'
                    : 'bg-gray-100'
                }`}
                style={{ height: animate ? `${h}%` : '0%' }}
                title={`${d.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${formatNPR(d.total)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        {last7.map((d) => (
          <span
            key={d.key}
            className={`flex-1 text-center text-[10px] font-medium ${d.isToday ? 'font-bold text-violet-700' : 'text-gray-400'}`}
          >
            {d.date.toLocaleDateString('en-GB', { weekday: 'short' })}
          </span>
        ))}
      </div>
    </div>
  </div>
  

  {/* 2. Smaller cards with very light pastel tones (Sky) */}
  {(() => {
    const t = {
      bg: 'bg-gradient-to-br from-sky-50/70 via-white to-white',
      border: 'border-sky-200/60',
      tile: 'bg-white text-sky-600 ring-1 ring-sky-100 shadow-sm',
      card: 'hover:border-sky-300 hover:shadow-xl',
      label: 'text-sky-900/80',
      glow: 'bg-sky-200/30'
    };
    return (
      <div
        id="stat-daily-sales"
        style={{ animationDelay: '80ms' }}
        className={`ub-rise group relative overflow-hidden rounded-3xl border ${t.border} ${t.bg} p-6 shadow-lg transition-all duration-300 ${t.card} flex flex-col justify-between`}
      >
        <div className={`pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full ${t.glow} blur-2xl transition-all duration-500 group-hover:scale-125`} />
        <div className="relative">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${t.label}`}>
              {T.dailySales}
            </span>
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110 ${t.tile}`}>
              <ShoppingBag className="h-[18px] w-[18px]" />
            </div>
          </div>
          <div className="mt-4">
            {billsLoading ? (
              <div className="h-9 w-36 animate-pulse rounded-lg bg-gray-200/60" />
            ) : (
              <p className="text-2xl sm:text-3xl font-black tracking-tight text-gray-950 tabular-nums">
                {Math.round(animSalesCount)}
              </p>
            )}
          </div>
        </div>
        <div className="relative mt-5 pt-3 border-t border-gray-100 text-xs font-semibold text-gray-600">
          <span className="flex flex-wrap items-center gap-x-2">
            <span>{T.billsToday}</span>
            {dailySalesCount > 0 && (
              <span className="rounded-full bg-sky-50 border border-sky-100 px-2 py-0.5 font-mono text-[10px] font-bold text-sky-700">
                {T.avgBill} {compact(avgBillToday)}
              </span>
            )}
          </span>
        </div>
      </div>
    );
  })()}

  {/* Total Orders Card (Amber - Light Pastel) */}
  {(() => {
    const t = {
      bg: 'bg-gradient-to-br from-amber-50/70 via-white to-white',
      border: 'border-amber-200/60',
      tile: 'bg-white text-amber-600 ring-1 ring-amber-100 shadow-sm',
      card: 'hover:border-amber-300 hover:shadow-xl',
      label: 'text-amber-900/80',
      glow: 'bg-amber-200/30'
    };
    return (
      <div
        id="stat-total-orders"
        style={{ animationDelay: '140ms' }}
        className={`ub-rise group relative overflow-hidden rounded-3xl border ${t.border} ${t.bg} p-6 shadow-lg transition-all duration-300 ${t.card} flex flex-col justify-between`}
      >
        <div className={`pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full ${t.glow} blur-2xl transition-all duration-500 group-hover:scale-125`} />
        <div className="relative">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${t.label}`}>
              {T.totalOrders}
            </span>
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110 ${t.tile}`}>
              <ListOrdered className="h-[18px] w-[18px]" />
            </div>
          </div>
          <div className="mt-4">
            {ordersLoading ? (
              <div className="h-9 w-36 animate-pulse rounded-lg bg-gray-200/60" />
            ) : (
              <p className="text-2xl sm:text-3xl font-black tracking-tight text-gray-950 tabular-nums">
                {Math.round(animOrders)}
              </p>
            )}
          </div>
        </div>
        <div className="relative mt-5 pt-3 border-t border-gray-100 text-xs font-semibold text-gray-600">
          <span className="flex flex-wrap items-center gap-x-2">
            <span>{T.allTimeOrders}</span>
            {completedOrdersCount > 0 && (
              <span className="rounded-full bg-amber-50 border border-amber-100 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-700">
                {completedOrdersCount} {T.completed}
              </span>
            )}
          </span>
        </div>
      </div>
    );
  })()}

  {/* Total Revenue Card (Emerald - Light Pastel) */}
  {(() => {
    const t = {
      bg: 'bg-gradient-to-br from-emerald-50/70 via-white to-white',
      border: 'border-emerald-200/60',
      tile: 'bg-white text-emerald-600 ring-1 ring-emerald-100 shadow-sm',
      card: 'hover:border-emerald-300 hover:shadow-xl',
      label: 'text-emerald-900/80',
      glow: 'bg-emerald-200/30'
    };
    return (
      <div
        id="stat-total-revenue"
        style={{ animationDelay: '200ms' }}
        className={`ub-rise group relative overflow-hidden rounded-3xl border ${t.border} ${t.bg} p-6 shadow-lg transition-all duration-300 ${t.card} flex flex-col justify-between sm:col-span-2`}
      >
        <div className={`pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full ${t.glow} blur-2xl transition-all duration-500 group-hover:scale-125`} />
        <div className="relative">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${t.label}`}>
              {T.totalRevenue}
            </span>
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110 ${t.tile}`}>
              <Receipt className="h-[18px] w-[18px]" />
            </div>
          </div>
          <div className="mt-4">
            {billsLoading ? (
              <div className="h-9 w-36 animate-pulse rounded-lg bg-gray-200/60" />
            ) : (
              <p className="text-2xl sm:text-3xl font-black tracking-tight text-gray-950 tabular-nums">
                {formatNPR(animTotalRevenue)}
              </p>
            )}
          </div>
        </div>
        <div className="relative mt-5 pt-3 border-t border-gray-100 text-xs font-semibold text-gray-600">
          {T.allTime}
        </div>
      </div>
    );
  })()}
</div>

      {/* ---------- SUBSCRIPTION / TIME REMAINING ---------- */}
      <SubscriptionCard loading={planLoading} total={planTotal} remaining={planRemaining} T={T} />


      {/* ---------- SALES OVERVIEW + SIDE COLUMN ---------- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12" id="dashboard-detail-grid">
        {/* SALES OVERVIEW CHART */}
        <div className={`lg:col-span-8 db-rise ${CARD} p-5 sm:p-6`} id="sales-overview-card">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-900">{T.salesOverview}</h2>
              <p className="mt-0.5 text-xs text-slate-500">{T.salesSub}</p>
            </div>
            <div className="inline-flex self-start rounded-xl bg-slate-100 p-1">
              {([7, 14, 30] as Range[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setRangeDays(d);
                    setActiveIdx(null);
                  }}
                  className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    rangeDays === d
                      ? 'bg-white text-purple-700 shadow-sm'
                      : 'text-slate-500 hover:text-purple-700'
                  }`}
                >
                  {d === 7 ? T.days7 : d === 14 ? T.days14 : T.days30}
                </button>
              ))}
            </div>
          </div>

          {/* Mini summary: four coloured boxes */}
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-100/70 to-purple-50/40 p-3.5 transition-transform hover:-translate-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-600">{T.total}</p>
              <p className="mt-1 text-base font-bold tabular-nums text-slate-900">{formatNPR(rangeTotal)}</p>
            </div>
            <div className="rounded-xl border border-sky-100 bg-gradient-to-br from-sky-100/70 to-sky-50/40 p-3.5 transition-transform hover:-translate-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-600">{T.avg}</p>
              <p className="mt-1 text-base font-bold tabular-nums text-slate-900">{formatNPR(avgPerDay)}</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-100/70 to-amber-50/40 p-3.5 transition-transform hover:-translate-y-0.5">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                <Trophy className="h-3 w-3" /> {T.best}
              </p>
              <p className="mt-1 text-base font-bold tabular-nums text-slate-900">
                {bestDay && bestDay.total > 0 ? formatNPR(bestDay.total) : '—'}
              </p>
              {bestDay && bestDay.total > 0 && (
                <p className="text-[10px] text-slate-500">
                  {bestDay.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                </p>
              )}
            </div>
            <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-100/70 to-emerald-50/40 p-3.5 transition-transform hover:-translate-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">{T.vsPrevPeriod}</p>
              <div className="mt-1.5">
                <GrowthPill pct={periodPct} />
              </div>
            </div>
          </div>

          {billsLoading ? (
            <div className="flex h-72 items-center justify-center text-purple-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : billsError ? (
            <div className="flex h-72 flex-col items-center justify-center text-center text-sm text-rose-500">
              <PackageX className="mb-1 h-6 w-6" />
              {billsError}
              <button onClick={refreshAll} className="mt-1 cursor-pointer text-xs font-bold text-purple-700 underline">
                {T.retry}
              </button>
            </div>
          ) : (
            <>
              {/* Detail strip for the hovered / selected day */}
              <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl bg-gradient-to-r from-purple-50 via-white to-sky-50 px-4 py-3.5 ring-1 ring-inset ring-purple-100">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-600">
                    {shown.isToday ? `${T.today} · ` : ''}
                    {shown.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                  <p className="text-xl font-bold tabular-nums text-slate-900">
                    {shown.total > 0 ? formatNPR(shown.total) : T.noSales}
                  </p>
                </div>
                <div className="text-xs text-slate-500">
                  <span className="text-base font-bold tabular-nums text-slate-900">{shown.count}</span>{' '}
                  {shown.count === 1 ? T.bill : T.bills}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <GrowthPill pct={shown.pct} />
                  <span className="text-slate-500">
                    {T.prevDay}: <span className="font-semibold tabular-nums text-slate-700">{formatNPR(shown.prevTotal)}</span>
                    {shown.prevTotal > 0 || shown.total > 0 ? (
                      <span className={`tabular-nums ${shown.diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {' '}({shown.diff >= 0 ? '+' : '-'}
                        {formatNPR(Math.abs(shown.diff))})
                      </span>
                    ) : null}
                  </span>
                </div>
              </div>

              {/* Chart */}
              <div className="flex">
                {/* Y axis */}
                <div className="relative w-11 shrink-0 pt-6">
                  <div className="relative h-[240px]">
                    {ticks.map((tick, i) => (
                      <span
                        key={i}
                        className="absolute right-2 translate-y-1/2 text-[10px] font-medium text-slate-400"
                        style={{ bottom: `${(i / 4) * 100}%` }}
                      >
                        {compact(tick)}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Plot area */}
                <div className="flex-1 overflow-x-auto pt-6">
                  <div style={{ minWidth: series.length * 34 }}>
                    <div className="relative h-[240px]">
                      {ticks.map((_, i) => (
                        <div
                          key={i}
                          className={`absolute left-0 right-0 border-t ${i === 0 ? 'border-slate-300' : 'border-dashed border-slate-200'}`}
                          style={{ bottom: `${(i / 4) * 100}%` }}
                        />
                      ))}

                      <div
                        className="absolute inset-0 flex items-end gap-1.5 px-1"
                        onMouseLeave={() => setActiveIdx(null)}
                      >
                        {series.map((s, i) => {
                          const heightPct = niceMax > 0 ? (s.total / niceMax) * 100 : 0;
                          const isActive = i === shownIdx;
                          return (
                            <div
                              key={s.key}
                              className="relative flex h-full flex-1 cursor-pointer flex-col justify-end"
                              onMouseEnter={() => setActiveIdx(i)}
                              onClick={() => setActiveIdx(i)}
                            >
                              <div
                                className={`relative w-full rounded-t-md transition-all duration-700 ease-out ${barColor(s, isActive)}`}
                                style={{
                                  height: animate ? `${heightPct}%` : '0%',
                                  minHeight: animate ? 3 : 0,
                                }}
                              >
                                {showLabels && s.total > 0 && (
                                  <span
                                    className={`absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold ${
                                      isActive ? 'text-purple-700' : 'text-slate-500'
                                    }`}
                                  >
                                    {compact(s.total)}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* X axis labels */}
                    <div className="mt-2 flex gap-1.5 px-1">
                      {series.map((s, i) => (
                        <div key={s.key} className="flex-1 text-center leading-tight">
                          <div
                            className={`text-[10px] font-bold ${
                              s.isToday || i === shownIdx ? 'text-purple-700' : 'text-slate-500'
                            }`}
                          >
                            {s.isToday && rangeDays <= 14
                              ? T.today
                              : rangeDays <= 14
                              ? s.date.toLocaleDateString('en-GB', { weekday: 'short' })
                              : s.date.getDate()}
                          </div>
                          {rangeDays <= 14 && (
                            <div className="text-[10px] text-slate-400">
                              {rangeDays <= 7
                                ? s.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                                : s.date.getDate()}
                            </div>
                          )}
                          {rangeDays <= 14 && (s.total > 0 || s.prevTotal > 0) && (
                            <div
                              className={`text-[10px] font-bold ${
                                s.pct === null
                                  ? 'text-sky-500'
                                  : s.pct > 0.05
                                  ? 'text-emerald-600'
                                  : s.pct < -0.05
                                  ? 'text-rose-600'
                                  : 'text-slate-400'
                              }`}
                            >
                              {s.pct === null
                                ? 'New'
                                : `${s.pct > 0.05 ? '▲' : s.pct < -0.05 ? '▼' : '•'}${Math.abs(s.pct).toFixed(0)}%`}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="font-bold text-emerald-600">▲</span> {T.higher}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="font-bold text-rose-600">▼</span> {T.lower}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="font-bold text-sky-500">New</span> {T.noPrev}
                </span>
              </div>
            </>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6 lg:col-span-4" id="dashboard-sidebar">
          {/* Quick operations: 2x2 coloured tiles */}
          <div className={`${CARD} db-rise space-y-3.5 p-5`} id="quick-links-card">
            <h2 className="text-sm font-bold tracking-tight text-slate-900">{T.quick}</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {quickActions.map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => setView(a.view)}
                    className={`group relative flex cursor-pointer flex-col items-start gap-5 rounded-xl border p-3.5 text-left transition-all hover:-translate-y-1 active:scale-[.98] ${a.tile}`}
                  >
                    <ArrowUpRight
                      className={`absolute right-3 top-3 h-4 w-4 opacity-0 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100 ${a.arrow}`}
                    />
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg transition-transform group-hover:scale-110 ${a.iconBox}`}>
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="text-sm font-bold leading-tight">{a.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Payment methods: donut chart with real colours */}
          <PaymentMixCard
            list={paymentMix.list}
            sum={paymentMix.sum}
            rangeLabel={rangeLabel}
            title={T.payMix}
            totalLabel={T.total}
            emptyText={T.noSales}
            animate={animate}
          />
        </div>
      </div>

      {/* ---------- SALES BY STAFF + TOP SELLING DISHES ---------- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" id="rankings-grid">
        <RankingCard
          icon={<Users className="h-5 w-5" />}
          title={T.salesByStaff}
          subtitle={T.staffSub}
          viewAllLabel={T.viewAll}
          totalCount={staffStats.length}
          loading={ordersLoading}
          emptyText={T.noStaffSales}
          onOpen={() => setShowStaffModal(true)}
          theme={STAFF_THEME}
        >
          {staffStats.slice(0, 3).map((s, i) => (
            <StatRow key={s.staffId} {...staffRowProps(s, i)} />
          ))}
        </RankingCard>

        <RankingCard
          icon={<Flame className="h-5 w-5" />}
          title={T.topDishes}
          subtitle={T.dishSub}
          viewAllLabel={T.viewAll}
          totalCount={dishStats.length}
          loading={ordersLoading}
          emptyText={T.noDishSales}
          onOpen={() => setShowDishModal(true)}
          theme={DISH_THEME}
        >
          {dishStats.slice(0, 3).map((d, i) => (
            <StatRow key={d.name.toLowerCase()} {...dishRowProps(d, i)} />
          ))}
        </RankingCard>
      </div>

      {/* ---------- TRANSACTION HISTORY ---------- */}
      <div className={`${CARD} db-rise overflow-hidden`} id="transaction-history-card">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50/60 via-white to-purple-50/40 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/25">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-900">{T.history}</h2>
              <p className="text-xs text-slate-500">
                {T.showing} {filteredInvoices.length} {T.of} {invoices.length}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={T.searchPh}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 md:w-72"
              />
            </div>
            <button
              type="button"
              onClick={refreshAll}
              title={T.refresh}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white p-2.5 text-purple-600 transition-all hover:bg-purple-600 hover:text-white active:scale-95"
            >
              <RefreshCw className={`h-4 w-4 ${billsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Payment filter chips */}
        {payMethods.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 bg-white px-5 py-3">
            {['all', ...payMethods].map((m) => {
              const active = payFilter === m;
              const color = m === 'all' ? '#7c3aed' : payColor(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayFilter(m)}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition-all ${
                    active ? 'text-white shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                  style={active ? { backgroundColor: color, borderColor: color } : undefined}
                >
                  {m !== 'all' && (
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: active ? '#fff' : color }}
                    />
                  )}
                  {m === 'all' ? T.all : m}
                </button>
              );
            })}
          </div>
        )}

        <div className="relative">
          <div
            ref={listRef}
            onScroll={handleScroll}
            className="max-h-[360px] overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200 hover:[&::-webkit-scrollbar-thumb]:bg-slate-300"
          >
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="bg-slate-50 px-5 py-3">{T.billNo}</th>
                  <th className="bg-slate-50 px-4 py-3">{T.dateTime}</th>
                  <th className="bg-slate-50 px-4 py-3">{T.customerTable}</th>
                  <th className="bg-slate-50 px-4 py-3">{T.payment}</th>
                  <th className="bg-slate-50 px-4 py-3 text-right">{T.amount}</th>
                  {onViewInvoice && <th className="bg-slate-50 px-5 py-3 text-right"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {billsLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                      <Loader2 className="mx-auto mb-1 h-5 w-5 animate-spin text-purple-500" />
                      {T.loading}
                    </td>
                  </tr>
                ) : billsError ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-rose-500">
                      <PackageX className="mx-auto mb-1 h-5 w-5" />
                      {billsError}
                      <button onClick={refreshAll} className="mx-auto mt-1 block cursor-pointer text-xs font-bold text-purple-700 underline">
                        {T.retry}
                      </button>
                    </td>
                  </tr>
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                      <Receipt className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                      {T.none}
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((invoice) => {
                    const d = new Date(invoice.date);
                    const pc = payColor(invoice.paymentMethod);
                    const displayName = invoice.billTo || T.walkIn;
                    return (
                      <tr key={invoice.id || invoice.invoiceNo} className="transition-colors hover:bg-purple-50/50">
                        <td className="px-5 py-3.5 font-mono text-xs font-semibold text-purple-700">{invoice.invoiceNo}</td>
                        <td className="px-4 py-3.5">
                          <div className="text-xs font-medium text-slate-800">
                            {d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-[11px] font-extrabold text-white shadow-sm ${gradientFor(
                                displayName
                              )}`}
                            >
                              {initials(displayName)}
                            </div>
                            <div className="space-y-0.5">
                              <span className="font-medium text-slate-900">{displayName}</span>
                              {invoice.tableNumber && invoice.tableNumber !== 'N/A' && (
                                <div>
                                  <span className="rounded bg-sky-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-sky-700">
                                    {T.table} {invoice.tableNumber}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-slate-800"
                            style={{ backgroundColor: `${pc}1f` }}
                          >
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: pc }} />
                            {invoice.paymentMethod}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right font-mono font-bold tabular-nums text-slate-900">
                          NPR {invoice.grandTotal.toFixed(2)}
                        </td>
                        {onViewInvoice && (
                          <td className="px-5 py-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => onViewInvoice(invoiceToSale(invoice))}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-purple-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-purple-700 transition-colors hover:border-purple-600 hover:bg-purple-600 hover:text-white"
                            >
                              <Eye className="h-3.5 w-3.5" /> {T.view}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-16 items-end justify-center bg-gradient-to-t from-white via-white/80 to-transparent pb-2">
              <span className="flex items-center gap-1 rounded-full border border-purple-100 bg-white px-3 py-1 text-[11px] font-semibold text-purple-700 shadow-sm">
                <ChevronDown className="h-3.5 w-3.5 animate-bounce" /> {T.scrollMore}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ---------- POPUP: ALL STAFF ---------- */}
      {showStaffModal && (
        <Modal
          title={T.salesByStaff}
          subtitle={`${staffStats.length} ${T.staffWithSales} · ${T.allTimeData}`}
          closeLabel={T.close}
          headerClass={STAFF_THEME.modalHeader}
          onClose={() => setShowStaffModal(false)}
          footer={
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-500">{T.grandTotal}</span>
              <span className={`font-mono font-bold tabular-nums ${STAFF_THEME.amount}`}>{formatNPR(staffGrandTotal)}</span>
            </div>
          }
        >
          {staffStats.map((s, i) => (
            <StatRow key={s.staffId} {...staffRowProps(s, i)} />
          ))}
        </Modal>
      )}

      {/* ---------- POPUP: ALL DISHES ---------- */}
      {showDishModal && (
        <Modal
          title={T.topDishes}
          subtitle={`${dishStats.length} ${T.dishesSold} · ${T.allTimeData}`}
          closeLabel={T.close}
          headerClass={DISH_THEME.modalHeader}
          onClose={() => setShowDishModal(false)}
          footer={
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-500">{T.grandTotal}</span>
              <span className={`font-mono font-bold tabular-nums ${DISH_THEME.amount}`}>{formatNPR(dishGrandTotal)}</span>
            </div>
          }
        >
          {dishStats.map((d, i) => (
            <StatRow key={d.name.toLowerCase()} {...dishRowProps(d, i)} />
          ))}
        </Modal>
      )}
    </div>
  );
}