import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText,
  Search,
  Activity,
  Loader2,
  PackageX,
  Database,
  Receipt,
  X,
  Printer,
  RefreshCcw,
  TrendingUp,
  ShieldCheck,
  Wallet,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { Sale, Customer } from '../types';
import { TRANSLATIONS } from '../translations';

const API_BASE = (import.meta.env.VITE_API_URL || (import.meta.env.VITE_API_URL || 'http://localhost:5000').trim().replace(/\/+$/, '')).trim().replace(/\/+$/, '');
const BILLS_URL = `${API_BASE}/api/bills`;

const getLoggedInRESTAURANTId = (): string => {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return (parsed?.id || parsed?._id) ? String(parsed.id || parsed._id) : '';
  } catch {
    return '';
  }
};

interface BillingManagerProps {
  Customers: Customer[];
  lang: 'en' | 'ne';
  currentUserRole: 'Viewer' | 'restoacist' | 'Owner';
  onBillingUpdated: () => void;
  onViewInvoice: (sale: Sale) => void;
}

interface RawBillItem {
  itemName: string;
  quantity: number;
  rate: number;
  total: number;
}

interface RawBill {
  id: string;
  _id: string;
  restaurantName: string;
  location: string;
  panOrVat: string;
  invoiceNo: string;
  billTo: string;
  tableNumber: string;
  paymentMethod: string;
  cashPaidMoney?: number;
  eSewaPaidMoney?: number;
  khaltiPaidMoney?: number;
  imePayPaidMoney?: number;
  date: string;
  items: RawBillItem[];
  subtotal: number;
  discount: number;
  discountPercent?: number;
  taxableAmount: number;
  vatCollected: number;
  vatRate?: number;
  grandTotal: number;
  restaurantId: string;
  createdAt?: string;
}

function money(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

function getPaidBreakdown(bill: RawBill): { label: string; amount: number }[] {
  return [
    { label: 'Cash', amount: bill.cashPaidMoney ?? 0 },
    { label: 'eSewa', amount: bill.eSewaPaidMoney ?? 0 },
    { label: 'Khalti', amount: bill.khaltiPaidMoney ?? 0 },
    { label: 'IMEPay', amount: bill.imePayPaidMoney ?? 0 },
  ].filter((p) => p.amount > 0);
}

// ==========================================
// PORTAL — renders children straight into document.body so a
// position:fixed modal always centers on the real viewport and
// can never be trapped by an ancestor's transform/overflow/filter.
// ==========================================
const ModalPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
};

// ==========================================
// PRINT STYLES — only #printable-bill is visible when printing,
// forced to 80mm thermal-paper width with bold black text.
// ==========================================
const PRINT_STYLES = `
  @media print {
    body * {
      visibility: hidden !important;
    }
    #printable-bill,
    #printable-bill * {
      visibility: visible !important;
    }
    #printable-bill {
      position: fixed !important;
      left: 0 !important;
      top: 0 !important;
      width: 80mm !important;
      max-width: 80mm !important;
      margin: 0 !important;
      padding: 3mm 2mm !important;
      box-shadow: none !important;
      border: none !important;
      background: #ffffff !important;
    }
    #printable-bill * {
      color: #000000 !important;
      font-weight: 900 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    @page {
      size: 80mm auto;
      margin: 0;
    }
  }
`;

// ==========================================
// LIGHT CLEAN THERMAL INVOICE MODAL
// ==========================================

function InvoiceModal({
  bill,
  lang,
  onClose,
}: {
  bill: RawBill;
  lang: 'en' | 'ne';
  onClose: () => void;
}) {
  const billItems: RawBillItem[] = bill?.items ?? [];
  const vatRate = bill?.vatRate ?? (bill?.taxableAmount > 0 ? (bill.vatCollected / bill.taxableAmount) * 100 : 0);
  const hasVat = (bill?.vatCollected ?? 0) > 0;
  const discountPercent = bill?.discountPercent ?? (bill?.subtotal > 0 ? (bill.discount / bill.subtotal) * 100 : 0);
  const hasDiscount = (bill?.discount ?? 0) > 0;
  const paidBreakdown = getPaidBreakdown(bill);

  // Escape closes the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lock page scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <ModalPortal>
      <style>{PRINT_STYLES}</style>
      <div
        className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-in fade-in duration-200 overflow-y-auto"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl max-w-lg w-full my-auto p-5 space-y-4 shadow-2xl border border-slate-100 relative overflow-hidden max-h-[min(680px,calc(100vh-48px))] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >

          {/* Decorative background shapes */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-violet-100 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-sky-100 rounded-full blur-2xl pointer-events-none" />

          <div className="flex justify-between items-center border-b border-slate-100 pb-3 relative z-10 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-violet-500/30">
                <Receipt className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 text-sm">
                  {lang === 'en' ? 'Thermal Invoice Preview' : 'बिजक प्रिभ्यु'}
                </h3>
                <p className="text-[11px] text-slate-400 font-semibold">Invoice No: {bill.invoiceNo}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer border border-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 80mm Thermal Receipt Preview Container */}
          <div className="flex justify-center bg-slate-50 p-4 rounded-xl overflow-y-auto flex-1 min-h-0 border border-slate-200/60 shadow-inner relative z-10">
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
              className="space-y-2.5 shadow-md rounded-sm text-xs border border-slate-200"
            >
              <div className="text-center space-y-0.5 pb-2 border-b-2 border-black border-dashed">
                <h3 className="text-xs font-black uppercase tracking-tight text-black">
                  {bill.restaurantName}
                </h3>
                <p className="text-[9px] font-bold text-black">{bill.location}</p>
                <p className="font-black text-[9px]">PAN / VAT No: {bill.panOrVat}</p>
                <h4 className="text-[10px] font-black uppercase border-y border-black py-0.5 tracking-wider mt-1 text-black">
                  {lang === 'en' ? 'INVOICE / BILL' : 'बिजक'}
                </h4>
              </div>

              <div className="space-y-0.5 border-b-2 border-black pb-2 text-[10px] leading-tight font-black">
                <div className="flex justify-between">
                  <span>Invoice No:</span>
                  <span className="font-mono">{bill.invoiceNo}</span>
                </div>
                <div className="flex justify-between">
                  <span>Date:</span>
                  <span className="font-mono">{new Date(bill.date || bill.createdAt || '').toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Bill To:</span>
                  <span>{bill.billTo}</span>
                </div>
                {bill.tableNumber && (
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

              <table className="w-full text-[10px] leading-tight font-black">
                <thead>
                  <tr className="border-b border-black text-left">
                    <th className="pb-1">Item</th>
                    <th className="pb-1 text-center">Qty</th>
                    <th className="pb-1 text-right">Rate</th>
                    <th className="pb-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dashed divide-black border-b-2 border-black">
                  {billItems.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-0.5 font-black">{item.itemName}</td>
                      <td className="py-0.5 text-center font-mono">{item.quantity}</td>
                      <td className="py-0.5 text-right font-mono">{money(item.rate)}</td>
                      <td className="py-0.5 text-right font-mono">{money(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="space-y-0.5 text-[10px] font-black">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-mono">NPR {money(bill.subtotal)}</span>
                </div>
                {hasDiscount && (
                  <div className="flex justify-between">
                    <span>Discount ({discountPercent.toFixed(1)}%):</span>
                    <span className="font-mono">-NPR {money(bill.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Taxable Amount:</span>
                  <span className="font-mono">NPR {money(bill.taxableAmount)}</span>
                </div>
                {hasVat && (
                  <div className="flex justify-between">
                    <span>VAT ({vatRate.toFixed(1)}%):</span>
                    <span className="font-mono">NPR {money(bill.vatCollected)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t-2 border-black pt-1 text-[11px] font-black">
                  <span>GRAND TOTAL:</span>
                  <span className="font-mono">NPR {money(bill.grandTotal)}</span>
                </div>

                {paidBreakdown.length > 0 && (
                  <div className="pt-1 mt-1 border-t border-dashed border-black space-y-0.5">
                    {paidBreakdown.map((p) => (
                      <div className="flex justify-between" key={p.label}>
                        <span>Paid via {p.label}:</span>
                        <span className="font-mono">NPR {money(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-dashed border-black text-[8px] font-black space-y-1 text-center">
                <div>Thank you, visit again!</div>
                <div>Powered By: Atithi RMS by Cornor Tech Pvt. Ltd.</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1 relative z-10 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-md shadow-violet-500/20 flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Receipt
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

// ==========================================
// MAIN VIBRANT LIGHT BILLING MANAGER
// ==========================================

export default function BillingManager({
  Customers,
  lang,
}: BillingManagerProps) {
  const t = TRANSLATIONS[lang];
  const [, setRESTAURANTId] = useState<string>(getLoggedInRESTAURANTId());
  const [bills, setBills] = useState<RawBill[]>([]);
  const [billsLoading, setBillsLoading] = useState(true);
  const [billsError, setBillsError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingBill, setViewingBill] = useState<RawBill | null>(null);

  const fetchBills = async () => {
    setBillsLoading(true);
    setBillsError('');

    const currentRESTAURANTId = getLoggedInRESTAURANTId();
    setRESTAURANTId(currentRESTAURANTId);

    if (!currentRESTAURANTId) {
      setBillsError(
        lang === 'en'
          ? 'No RESTAURANT ID found. Please log in again.'
          : 'रेस्टुरेन्ट आईडी फेला परेन। कृपया फेरि लगइन गर्नुहोस्।'
      );
      setBills([]);
      setBillsLoading(false);
      return;
    }

    try {
      const url = `${BILLS_URL}?restaurantId=${encodeURIComponent(currentRESTAURANTId)}`;
      const res = await fetch(url);
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to load billing ledger.');
      }

      setBills(result.data || []);
    } catch (err: any) {
      setBillsError(err.message || 'Could not connect to the server.');
    } finally {
      setBillsLoading(false);
    }
  };

  useEffect(() => {
    fetchBills();
  }, []);

  const filteredInvoices = useMemo(() => {
    if (!searchQuery.trim()) return bills;
    const q = searchQuery.toLowerCase().trim();
    return bills.filter((inv) => {
      const Customer = Customers.find((p) => p.fullName === inv.billTo);
      return (
        inv.invoiceNo.toLowerCase().includes(q) ||
        (inv.billTo || '').toLowerCase().includes(q) ||
        (Customer && Customer.id.toLowerCase().includes(q))
      );
    });
  }, [searchQuery, bills, Customers]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysInvoices = bills.filter((inv) => (inv.date || inv.createdAt || '').startsWith(todayStr));

  const cashToday = todaysInvoices.reduce((sum, s) => sum + (s.cashPaidMoney || 0), 0);
  const esewaToday = todaysInvoices.reduce((sum, s) => sum + (s.eSewaPaidMoney || 0), 0);
  const khaltiToday = todaysInvoices.reduce((sum, s) => sum + (s.khaltiPaidMoney || 0), 0);
  const imeToday = todaysInvoices.reduce((sum, s) => sum + (s.imePayPaidMoney || 0), 0);

  const totalTaxableToday = todaysInvoices.reduce((sum, s) => sum + (s.taxableAmount || 0), 0);
  const totalVatToday = todaysInvoices.reduce((sum, s) => sum + (s.vatCollected || 0), 0);

  return (
    <div className="space-y-6 pb-8 font-sans" id="billing-root">

      {/* SECTION 1: Colorful Light Mode Summary Cards */}
      <div className="space-y-3" id="daily-summary-ledger">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <div className="p-2 bg-gradient-to-tr from-violet-600 to-indigo-600 text-white rounded-xl shadow-sm shadow-violet-500/20">
                <Activity className="h-4 w-4" />
              </div>
              {t.dailySummary}
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">Live collection overview & revenue streams for today</p>
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-bold text-slate-700">
              {new Date().toLocaleDateString(lang === 'en' ? 'en-US' : 'ne-NP', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5" id="daily-summary-grid">

          {/* Cash Card */}
          <div className="bg-gradient-to-br from-emerald-500/5 via-white to-white p-4.5 rounded-2xl border border-emerald-100 shadow-2xs hover:shadow-sm hover:border-emerald-300 transition-all duration-200 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-400/10 rounded-full blur-xl pointer-events-none group-hover:scale-115 transition-transform" />
            <div className="flex items-center justify-between mb-2 relative z-10">
              <span className="text-[11px] uppercase font-extrabold text-emerald-700 tracking-wider flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5" /> Cash Drawer
              </span>
              <span className="px-1.5 py-0.5 bg-emerald-100/80 text-emerald-800 rounded-md text-[9px] font-extrabold">Active</span>
            </div>
            <p className="font-mono font-black text-slate-900 text-xl tracking-tight relative z-10">NPR {money(cashToday)}</p>
            <div className="mt-1.5 text-[10px] text-emerald-700/80 font-semibold relative z-10 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Reconciled
            </div>
          </div>

          {/* eSewa Card */}
          <div className="bg-gradient-to-br from-[#60bb46]/10 via-white to-white p-4.5 rounded-2xl border border-[#60bb46]/30 shadow-2xs hover:shadow-sm hover:border-[#60bb46] transition-all duration-200 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-[#60bb46]/15 rounded-full blur-xl pointer-events-none group-hover:scale-115 transition-transform" />
            <div className="flex items-center justify-between mb-2 relative z-10">
              <span className="text-[11px] uppercase font-extrabold text-[#3a7c28] tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#60bb46]"></span> eSewa Total
              </span>
              <span className="px-1.5 py-0.5 bg-[#60bb46]/20 text-[#3a7c28] rounded-md text-[9px] font-extrabold">Gateway</span>
            </div>
            <p className="font-mono font-black text-slate-900 text-xl tracking-tight relative z-10">NPR {money(esewaToday)}</p>
            <div className="mt-1.5 text-[10px] text-[#3a7c28] font-semibold relative z-10 flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Instant digital transfers
            </div>
          </div>

          {/* Khalti Card */}
          <div className="bg-gradient-to-br from-purple-500/5 via-white to-white p-4.5 rounded-2xl border border-purple-100 shadow-2xs hover:shadow-sm hover:border-purple-300 transition-all duration-200 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-purple-400/10 rounded-full blur-xl pointer-events-none group-hover:scale-115 transition-transform" />
            <div className="flex items-center justify-between mb-2 relative z-10">
              <span className="text-[11px] uppercase font-extrabold text-purple-700 tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-600"></span> Khalti Total
              </span>
              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-md text-[9px] font-extrabold">Gateway</span>
            </div>
            <p className="font-mono font-black text-slate-900 text-xl tracking-tight relative z-10">NPR {money(khaltiToday)}</p>
            <div className="mt-1.5 text-[10px] text-purple-700/80 font-semibold relative z-10 flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Verified mobile payments
            </div>
          </div>

          {/* IME Pay Card */}
          <div className="bg-gradient-to-br from-rose-500/5 via-white to-white p-4.5 rounded-2xl border border-rose-100 shadow-2xs hover:shadow-sm hover:border-rose-300 transition-all duration-200 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-rose-400/10 rounded-full blur-xl pointer-events-none group-hover:scale-115 transition-transform" />
            <div className="flex items-center justify-between mb-2 relative z-10">
              <span className="text-[11px] uppercase font-extrabold text-rose-700 tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span> IME Pay Total
              </span>
              <span className="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded-md text-[9px] font-extrabold">Gateway</span>
            </div>
            <p className="font-mono font-black text-slate-900 text-xl tracking-tight relative z-10">NPR {money(imeToday)}</p>
            <div className="mt-1.5 text-[10px] text-rose-700/80 font-semibold relative z-10 flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Secure transactions
            </div>
          </div>

        </div>

        {/* Taxable & VAT Summary Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-0.5" id="daily-vat-summary">

          {/* Taxable Revenue Card */}
          <div className="p-5 bg-gradient-to-br from-violet-50/80 via-violet-50/30 to-white border border-violet-200 hover:border-violet-300 rounded-2xl shadow-sm flex items-center justify-between relative overflow-hidden transition-all duration-200 group">
            <div className="absolute -right-8 -top-8 w-36 h-36 bg-violet-200/30 rounded-full blur-2xl pointer-events-none group-hover:scale-115 transition-transform" />
            <div className="space-y-1.5 relative z-10">
              <span className="text-[11px] uppercase font-bold tracking-wider text-violet-700 bg-white px-2.5 py-1 rounded-lg inline-block border border-violet-200/60 shadow-2xs">
                {lang === 'en' ? 'Taxable Revenue (Today)' : 'कर योग्य कुल संकलन'}
              </span>
              <p className="font-mono font-black text-2xl tracking-tight text-slate-900">
                NPR {money(totalTaxableToday)}
              </p>
            </div>
            <div className="p-3 bg-white text-violet-700 rounded-xl relative z-10 shadow-2xs border border-violet-100 group-hover:scale-105 transition-transform">
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>

          {/* VAT Collected Card */}
          <div className="p-5 bg-gradient-to-br from-sky-50/80 via-sky-50/30 to-white border border-sky-200 hover:border-sky-300 rounded-2xl shadow-sm flex items-center justify-between relative overflow-hidden transition-all duration-200 group">
            <div className="absolute -right-8 -top-8 w-36 h-36 bg-sky-200/30 rounded-full blur-2xl pointer-events-none group-hover:scale-115 transition-transform" />
            <div className="space-y-1.5 relative z-10">
              <span className="text-[11px] uppercase font-bold tracking-wider text-sky-700 bg-white px-2.5 py-1 rounded-lg inline-block border border-sky-200/60 shadow-2xs">
                {t.vatCollected} Collected (VAT)
              </span>
              <p className="font-mono font-black text-2xl tracking-tight text-slate-900">
                NPR {money(totalVatToday)}
              </p>
            </div>
            <div className="p-3 bg-white text-sky-700 rounded-xl relative z-10 shadow-2xs border border-sky-100 group-hover:scale-105 transition-transform">
              <ShieldCheck className="h-6 w-6" />
            </div>
          </div>

        </div>
      </div>

      {/* SECTION 2: Invoice Ledger Table & Filtering */}
      <div className="bg-white rounded-2xl border border-slate-200/85 shadow-sm p-5 sm:p-6 space-y-4" id="invoices-ledger-panel">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center pb-4 border-b border-slate-100 gap-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2 uppercase">
              <div className="p-2 bg-violet-50 text-violet-600 rounded-xl">
                <FileText className="h-4 w-4" />
              </div>
              {t.invoiceList}
            </h2>
            <p className="text-[11px] text-slate-400 font-semibold mt-0.5">Explore full invoice logs, payment breakdowns, and receipt prints</p>
          </div>
          {billsLoading ? null : (
            <button
              onClick={fetchBills}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-600 hover:text-violet-700 bg-violet-50 hover:bg-violet-100/70 px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-2xs active:scale-95"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              {lang === 'en' ? 'Refresh Ledger' : 'ताजा गर्नुहोस्'}
            </button>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative text-xs" id="invoice-search-group">
          <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={lang === 'en' ? 'Search by Invoice No, Customer ID, or Customer Name...' : 'बिल नम्बर वा ग्राहकको नाम हाल्नुहोस्...'}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-600 transition-all font-semibold text-slate-800 placeholder-slate-400 shadow-2xs"
          />
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto border border-slate-200/80 rounded-xl shadow-2xs" id="invoice-ledger-table-wrapper">
          <table className="min-w-full divide-y divide-slate-100 text-xs">
            <thead>
              <tr className="text-left text-slate-400 uppercase font-black tracking-wider bg-slate-50/90 text-[11px]">
                <th className="px-4 py-3">Invoice ID</th>
                <th className="px-4 py-3">{lang === 'en' ? 'Customer Client' : 'ग्राहक'}</th>
                <th className="px-4 py-3">{lang === 'en' ? 'Method' : 'भुक्तानी'}</th>
                <th className="px-4 py-3 text-right">{t.taxableAmount}</th>
                <th className="px-4 py-3 text-right">VAT</th>
                <th className="px-4 py-3 text-right">Total Invoice</th>
                <th className="px-4 py-3 text-center">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white" id="invoice-ledger-table-body">
              {billsLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-slate-400">
                    <Loader2 className="h-6 w-6 mx-auto animate-spin mb-2 text-violet-600" />
                    <p className="font-bold text-xs">{lang === 'en' ? 'Loading billing ledger...' : 'लोड हुँदैछ...'}</p>
                  </td>
                </tr>
              ) : billsError ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-rose-500">
                    <PackageX className="h-6 w-6 mx-auto mb-2" />
                    <p className="font-bold text-xs mb-1.5">{billsError}</p>
                    <button onClick={fetchBills} className="text-violet-600 font-bold text-xs underline hover:text-violet-700">
                      {lang === 'en' ? 'Retry Connection' : 'फेरि प्रयास गर्नुहोस्'}
                    </button>
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-slate-400">
                    <div className="p-3 bg-slate-50 rounded-full w-fit mx-auto mb-2 text-slate-300">
                      <Database className="h-6 w-6 stroke-1" />
                    </div>
                    <p className="font-bold text-xs">No invoices match criteria.</p>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => {
                  const pat = Customers.find((p) => p.fullName === invoice.billTo);
                  const paidBreakdown = getPaidBreakdown(invoice);
                  const isSplit = invoice.paymentMethod === 'Split' || paidBreakdown.length > 1;

                  return (
                    <tr key={invoice.invoiceNo} className="hover:bg-violet-50/30 transition-colors group">
                      <td className="px-4 py-3 font-mono text-slate-800 font-extrabold">{invoice.invoiceNo}</td>
                      <td className="px-4 py-3">
                        {pat ? (
                          <div className="space-y-0.5">
                            <span className="font-bold text-slate-900">{pat.fullName}</span>
                            <span className="text-[10px] text-slate-400 block font-mono">({pat.id})</span>
                          </div>
                        ) : (
                          <span className="text-slate-600 font-semibold italic">{invoice.billTo || t.walkIn}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <span className={`inline-flex px-2 py-0.5 rounded-lg font-extrabold text-[10px] uppercase border tracking-wide shadow-2xs ${
                            invoice.paymentMethod === 'Cash' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            invoice.paymentMethod === 'eSewa' ? 'bg-[#60bb46]/10 text-[#3a7c28] border-[#60bb46]/30' :
                            invoice.paymentMethod === 'Khalti' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                            invoice.paymentMethod === 'IMEPay' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                            invoice.paymentMethod === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-indigo-50 text-indigo-700 border-indigo-200'
                          }`}>
                            {invoice.paymentMethod}
                          </span>
                          {isSplit && paidBreakdown.length > 0 && (
                            <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-[9px] font-mono text-slate-500 font-semibold">
                              {paidBreakdown.map((p) => (
                                <span key={p.label} className="bg-slate-100 px-1 py-0.5 rounded border border-slate-200/60">
                                  {p.label}: {money(p.amount)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600 font-semibold">
                        NPR {(invoice.taxableAmount || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600 font-semibold">
                        NPR {(invoice.vatCollected || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-black text-violet-700 text-xs">
                        NPR {invoice.grandTotal.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setViewingBill(invoice)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-violet-600 rounded-lg text-slate-600 hover:text-white transition-all cursor-pointer shadow-2xs inline-flex items-center gap-1 active:scale-95 font-bold text-[11px]"
                          title="View/Print Thermal Invoice"
                        >
                          <FileText className="h-3 w-3" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewingBill && (
        <InvoiceModal
          bill={viewingBill}
          lang={lang}
          onClose={() => setViewingBill(null)}
        />
      )}
    </div>
  );
}