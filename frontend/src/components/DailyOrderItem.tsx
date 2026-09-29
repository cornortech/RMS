import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Printer,
  Receipt,
  Calendar,
  TrendingUp,
  DollarSign,
  ShoppingBag,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  FileSpreadsheet,
  Loader2,
  Download,
} from "lucide-react";
import { useLang } from "../i18n";
import { printHtml } from '../utils/printReceipt';

const API_BASE_URL = `${(import.meta.env.VITE_API_URL || "https://rms-elhj.onrender.com").trim().replace(/\/+$/, "")}/api`;

interface OrderItem {
  itemName: string;
  description?: string;
  itemPrice: number;
  quantity: number;
}

interface Order {
  id: string;
  _id: string;
  restaurantId: string;
  customerName: string;
  tableNumber: string | number;
  orderNote?: string;
  items: OrderItem[];
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  createdAt: string;
}

interface TotalOrderProps {
  restaurantId?: string;
}

interface AggregatedItem {
  name: string;
  qty: number;
  price: number;
  total: number;
}

// ------------------------------------------
// Helpers
// ------------------------------------------

const money = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Local date key YYYY-MM-DD (uses the computer's own timezone)
const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString("en-CA");

const formatDisplayDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

const formatTime = (dateStr: string) =>
  new Date(dateStr).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

// Combine the same item sold at the same price across many orders
const aggregateItems = (orders: Order[]): AggregatedItem[] => {
  const map = new Map<string, AggregatedItem>();
  orders.forEach((order) => {
    (order.items || []).forEach((item) => {
      const name = String(item.itemName || "Unknown Item").trim();
      const qty = Number(item.quantity) || 0;
      const price = Number(item.itemPrice) || 0;
      const key = `${name.toLowerCase()}__${price}`;
      const cur = map.get(key) || { name, qty: 0, price, total: 0 };
      cur.qty += qty;
      cur.total += qty * price;
      map.set(key, cur);
    });
  });
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
};

// Make a file name safe (no spaces or special characters)
const safeFileName = (s: string) => s.replace(/[^a-z0-9-_]+/gi, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

// Apply "#,##0.00" number format to given columns (0-based) from a start row
const formatMoneyColumns = (XLSX: any, ws: any, cols: number[], fromRow: number) => {
  const range = XLSX.utils.decode_range(ws["!ref"]);
  for (let r = fromRow; r <= range.e.r; r++) {
    cols.forEach((c) => {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === "number") cell.z = "#,##0.00";
    });
  }
};

// ------------------------------------------
// Component
// ------------------------------------------

const TotalOrder: React.FC<TotalOrderProps> = ({ restaurantId }) => {
  const { tr } = useLang();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showBill, setShowBill] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null); // date key, "all", or null
  const [exportError, setExportError] = useState<string | null>(null);

  // Read the logged-in restaurant once from localStorage
  const { currentRestaurantId, currentRestaurantIdAlt, restaurantName } = useMemo(() => {
    try {
      const raw = localStorage.getItem("RESTAURANTUser");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.id || parsed?._id) {
          return {
            currentRestaurantId: parsed?.id ?? null,
            currentRestaurantIdAlt: parsed?._id ?? null,
            restaurantName: (parsed?.RESTAURANTName || parsed?.restaurantName || null) as string | null,
          };
        }
      }
    } catch (e) {
      console.error("Failed to parse RESTAURANTUser from localStorage:", e);
    }
    if (restaurantId) return { currentRestaurantId: restaurantId, currentRestaurantIdAlt: null, restaurantName: null };
    return { currentRestaurantId: null, currentRestaurantIdAlt: null, restaurantName: null };
  }, [restaurantId]);

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/orders`);
      const data = await res.json();
      if (data.success) {
        setOrders(data.data || []);
      } else {
        setError(data.message || tr("Failed to fetch orders.", "अर्डर ल्याउन सकिएन।"));
      }
    } catch (err) {
      console.error("Fetch orders error:", err);
      setError(tr("Error fetching orders data.", "अर्डर डेटा ल्याउँदा त्रुटि भयो।"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRestaurantId, currentRestaurantIdAlt]);

  // Escape closes the receipt popup
  useEffect(() => {
    if (!showBill) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShowBill(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showBill]);

  // Only orders belonging to the logged-in restaurant
  const restaurantOrders = useMemo(() => {
    if (!currentRestaurantId && !currentRestaurantIdAlt) return [];
    return orders.filter((o) => {
      const orderRid = String(o.restaurantId ?? "");
      return (
        (currentRestaurantId && orderRid === String(currentRestaurantId)) ||
        (currentRestaurantIdAlt && orderRid === String(currentRestaurantIdAlt))
      );
    });
  }, [orders, currentRestaurantId, currentRestaurantIdAlt]);

  const completedOrders = useMemo(
    () =>
      restaurantOrders.filter((o) => {
        const paymentStatus = String(o.paymentStatus ?? "").toLowerCase().trim();
        return paymentStatus === "paid" || paymentStatus === "pending";
      }),
    [restaurantOrders]
  );

  // Group completed orders by date
  const dailySummaries = useMemo(() => {
    const map: Record<string, { date: string; orders: Order[]; totalAmount: number; orderCount: number }> = {};
    completedOrders.forEach((order) => {
      const dateKey = formatDate(order.createdAt);
      if (!map[dateKey]) map[dateKey] = { date: dateKey, orders: [], totalAmount: 0, orderCount: 0 };
      map[dateKey].orders.push(order);
      map[dateKey].totalAmount += Number(order.totalAmount) || 0;
      map[dateKey].orderCount += 1;
    });
    return Object.values(map).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [completedOrders]);

  const handleViewBill = (dateKey: string) => {
    setSelectedDate(dateKey);
    setShowBill(true);
  };

  const ordersForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    return completedOrders.filter((o) => formatDate(o.createdAt) === selectedDate);
  }, [completedOrders, selectedDate]);

  const aggregatedItems = useMemo(() => aggregateItems(ordersForSelectedDate), [ordersForSelectedDate]);

  const grandTotal = useMemo(() => aggregatedItems.reduce((sum, item) => sum + item.total, 0), [aggregatedItems]);

  const totalOrdersCount = ordersForSelectedDate.length;

  const totalRevenueAllTime = useMemo(() => dailySummaries.reduce((sum, day) => sum + day.totalAmount, 0), [dailySummaries]);

  const totalCompletedOrdersCount = useMemo(
    () => dailySummaries.reduce((sum, day) => sum + day.orderCount, 0),
    [dailySummaries]
  );

  // ==========================================
  // EXCEL: one day (items + orders sheets)
  // ==========================================
  const downloadDayExcel = async (dateKey: string) => {
    setExporting(dateKey);
    setExportError(null);
    try {
      const XLSX: any = await import("xlsx"); // loaded only when needed, keeps the page fast

      const dayOrders = completedOrders
        .filter((o) => formatDate(o.createdAt) === dateKey)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const items = aggregateItems(dayOrders);
      const itemsTotal = items.reduce((s, i) => s + i.total, 0);
      const itemsQty = items.reduce((s, i) => s + i.qty, 0);

      // ---- Sheet 1: Items sold ----
      const itemRows: (string | number)[][] = [
        [restaurantName ? restaurantName.toUpperCase() : "DAILY SALES REPORT"],
        ["Daily Sales Report"],
        ["Date", formatDisplayDate(dateKey)],
        ["Total Orders", dayOrders.length],
        ["Generated On", new Date().toLocaleString()],
        [],
        ["S.N.", "Item", "Qty", "Rate (Rs.)", "Amount (Rs.)"],
        ...items.map((it, i) => [i + 1, it.name, it.qty, it.price, it.total]),
        [],
        ["", "TOTAL", itemsQty, "", itemsTotal],
      ];
      const wsItems = XLSX.utils.aoa_to_sheet(itemRows);
      wsItems["!cols"] = [{ wch: 6 }, { wch: 34 }, { wch: 8 }, { wch: 14 }, { wch: 16 }];
      wsItems["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
      ];
      formatMoneyColumns(XLSX, wsItems, [3, 4], 7);

      // ---- Sheet 2: Every order that day ----
      const orderRows: (string | number)[][] = [
        ["S.N.", "Time", "Customer", "Table", "Items", "Order Status", "Payment", "Amount (Rs.)"],
        ...dayOrders.map((o, i) => [
          i + 1,
          formatTime(o.createdAt),
          o.customerName || "Walk-in",
          String(o.tableNumber ?? ""),
          (o.items || []).map((it) => `${it.quantity}x ${it.itemName}`).join(", "),
          o.orderStatus || "",
          o.paymentStatus || "",
          Number(o.totalAmount) || 0,
        ]),
        [],
        ["", "", "", "", "", "", "TOTAL", dayOrders.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0)],
      ];
      const wsOrders = XLSX.utils.aoa_to_sheet(orderRows);
      wsOrders["!cols"] = [
        { wch: 6 },
        { wch: 10 },
        { wch: 22 },
        { wch: 10 },
        { wch: 48 },
        { wch: 14 },
        { wch: 12 },
        { wch: 16 },
      ];
      formatMoneyColumns(XLSX, wsOrders, [7], 1);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsItems, "Items Sold");
      XLSX.utils.book_append_sheet(wb, wsOrders, "Orders");

      const namePart = restaurantName ? `${safeFileName(restaurantName)}_` : "";
      XLSX.writeFile(wb, `${namePart}Sales_${dateKey}.xlsx`);
    } catch (err) {
      console.error("Excel export failed:", err);
      setExportError(tr("Could not create the Excel file. Please try again.", "एक्सेल फाइल बनाउन सकिएन। फेरि प्रयास गर्नुहोस्।"));
    } finally {
      setExporting(null);
    }
  };

  // ==========================================
  // EXCEL: all days summary
  // ==========================================
  const downloadAllExcel = async () => {
    if (dailySummaries.length === 0) return;
    setExporting("all");
    setExportError(null);
    try {
      const XLSX: any = await import("xlsx");

      const days = [...dailySummaries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const rows: (string | number)[][] = [
        [restaurantName ? restaurantName.toUpperCase() : "SALES SUMMARY"],
        ["Daily Sales Summary (All Days)"],
        ["Generated On", new Date().toLocaleString()],
        [],
        ["S.N.", "Date", "Day", "Total Orders", "Total Sales (Rs.)"],
        ...days.map((d, i) => [
          i + 1,
          formatDisplayDate(d.date),
          new Date(d.date).toLocaleDateString("en-GB", { weekday: "long" }),
          d.orderCount,
          d.totalAmount,
        ]),
        [],
        ["", "TOTAL", "", totalCompletedOrdersCount, totalRevenueAllTime],
      ];

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 6 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 18 }];
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
      ];
      formatMoneyColumns(XLSX, ws, [4], 5);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Daily Summary");

      const namePart = restaurantName ? `${safeFileName(restaurantName)}_` : "";
      XLSX.writeFile(wb, `${namePart}Sales_Summary_${formatDate(new Date().toISOString())}.xlsx`);
    } catch (err) {
      console.error("Excel export failed:", err);
      setExportError(tr("Could not create the Excel file. Please try again.", "एक्सेल फाइल बनाउन सकिएन। फेरि प्रयास गर्नुहोस्।"));
    } finally {
      setExporting(null);
    }
  };

  // ==========================================
  // PRINT (unchanged behaviour)
  // ==========================================
    const handlePrint = () => {
    const printContent = document.getElementById("bill-print-area");
    if (!printContent) return;

    // Prints only the report, on paper exactly as long as the report (see utils/printReceipt.ts)
    printHtml(printContent.innerHTML, {
      extraCss: `
        * { box-sizing: border-box; }
        body {
          width: 72mm;
          margin: 0;
          font-family: 'Courier New', Courier, monospace;
          font-size: 11px;
          line-height: 1.2;
          font-weight: 900;
          color: #000000;
          background: #ffffff;
        }
        .center { text-align: center; }
        .bold { font-weight: 900; }
        .divider { border-top: 2px dashed #000; margin: 6px 0; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; font-weight: 900; }
        th, td { text-align: left; padding: 2px 0; }
        th:last-child, td:last-child { text-align: right; }
        .item-row td { padding: 3px 0; }
        .total-row { font-weight: 900; font-size: 12px; }
        .header-title { font-size: 14px; font-weight: 900; text-transform: uppercase; }
        .small { font-size: 10px; font-weight: 900; }
      `,
    });
  };

  // ==========================================
  // RENDER STATES
  // ==========================================
  if (loading) {
    return (
      <div className="flex min-h-[450px] flex-col items-center justify-center gap-4 rounded-3xl bg-gradient-to-br from-slate-50 to-purple-50/30">
        <div className="relative">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="h-4 w-4 animate-pulse text-purple-600" />
          </div>
        </div>
        <p className="animate-pulse text-sm font-semibold text-slate-500">
          {tr("Analyzing daily sales records...", "दैनिक बिक्री विवरण तयार गर्दै...")}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-orange-50 p-6 text-center font-medium text-red-700 shadow-sm">
        {error}
        <button
          onClick={fetchOrders}
          className="mx-auto mt-3 block cursor-pointer rounded-lg bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-700"
        >
          {tr("Try again", "फेरि प्रयास गर्नुहोस्")}
        </button>
      </div>
    );
  }

  if (!currentRestaurantId && !currentRestaurantIdAlt) {
    return (
      <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-center font-medium text-red-700 shadow-sm">
        {tr("Unable to identify restaurant. Please log in again.", "रेस्टुरेन्ट पहिचान गर्न सकिएन। कृपया फेरि लगइन गर्नुहोस्।")}
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-purple-50/20 to-indigo-50/30 p-4 font-sans text-slate-800 antialiased sm:p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl border border-purple-200/60 bg-gradient-to-r from-purple-100 via-purple-50 to-indigo-100 p-6 text-slate-900 shadow-xl shadow-purple-900/5 sm:p-8">
          <div className="pointer-events-none absolute right-0 top-0 -mr-10 -mt-10 h-64 w-64 rounded-full bg-purple-300/30 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-200 bg-white/80 text-purple-700 shadow-sm backdrop-blur-md">
                <Calendar className="h-7 w-7 text-purple-600" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-300/60 bg-purple-200/60 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-purple-800">
                  <Sparkles className="h-3 w-3 text-purple-700" /> {tr("Sales Analytics", "बिक्री विश्लेषण")}
                </span>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                  {tr("Daily Sales Overview", "दैनिक बिक्री सिंहावलोकन")}
                </h1>
                <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <ShieldCheck className="h-3.5 w-3.5 text-purple-600" />
                  {restaurantName || tr("Restaurant Portal", "रेस्टुरेन्ट पोर्टल")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div className="group relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
            <div className="absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 transition-transform group-hover:scale-110">
              <DollarSign className="h-6 w-6" />
            </div>
            <p className="mb-1 text-[11px] font-black uppercase tracking-wider text-emerald-800/80">
              {tr("Total Sales Revenue", "कुल बिक्री आम्दानी")}
            </p>
            <p className="text-3xl font-black tracking-tight text-slate-900">Rs. {money(totalRevenueAllTime)}</p>
            <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-emerald-700">
              <span>{tr("Lifetime generated sales", "सुरुदेखिको कुल बिक्री")}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-3xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
            <div className="absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-600 transition-transform group-hover:scale-110">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <p className="mb-1 text-[11px] font-black uppercase tracking-wider text-purple-800/80">
              {tr("Completed Orders", "सम्पन्न अर्डरहरू")}
            </p>
            <p className="text-3xl font-black tracking-tight text-slate-900">{totalCompletedOrdersCount}</p>
            <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-purple-700">
              <span>{tr("Successfully settled orders", "सफलतापूर्वक मिलान भएका अर्डर")}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
            <div className="absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 transition-transform group-hover:scale-110">
              <TrendingUp className="h-6 w-6" />
            </div>
            <p className="mb-1 text-[11px] font-black uppercase tracking-wider text-indigo-800/80">
              {tr("Active Summary Days", "कारोबार भएका दिन")}
            </p>
            <p className="text-3xl font-black tracking-tight text-slate-900">{dailySummaries.length}</p>
            <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-indigo-700">
              <span>{tr("Recorded business dates", "रेकर्ड भएका मितिहरू")}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </div>
        </div>

        {/* Export error */}
        {exportError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"
          >
            <span>{exportError}</span>
            <button
              onClick={() => setExportError(null)}
              aria-label={tr("Dismiss", "बन्द गर्नुहोस्")}
              className="cursor-pointer rounded-lg p-1 text-rose-400 hover:bg-rose-100 hover:text-rose-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white/80 shadow-xl shadow-slate-200/50 backdrop-blur-md">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{tr("Daily Records Breakdown", "दैनिक विवरण")}</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {tr(
                  'Print a day\u2019s receipt with "View Bill", or download it as an Excel file.',
                  '"बिल हेर्नुहोस्" बाट रसिद प्रिन्ट गर्नुहोस्, वा एक्सेल फाइल डाउनलोड गर्नुहोस्।'
                )}
              </p>
            </div>
            <button
              onClick={downloadAllExcel}
              disabled={dailySummaries.length === 0 || exporting !== null}
              className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-700 transition-all hover:bg-emerald-600 hover:text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {tr("Download all days (Excel)", "सबै दिन डाउनलोड (एक्सेल)")}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-slate-500">
                  <th className="px-6 py-4 text-[11px] font-extrabold uppercase tracking-wider">{tr("Business Date", "मिति")}</th>
                  <th className="px-6 py-4 text-[11px] font-extrabold uppercase tracking-wider">{tr("Total Orders", "कुल अर्डर")}</th>
                  <th className="px-6 py-4 text-[11px] font-extrabold uppercase tracking-wider">{tr("Total Daily Sales", "दैनिक कुल बिक्री")}</th>
                  <th className="px-6 py-4 text-center text-[11px] font-extrabold uppercase tracking-wider">{tr("Actions", "कार्यहरू")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailySummaries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="mb-1 flex h-16 w-16 items-center justify-center rounded-full bg-purple-50 text-purple-600 shadow-inner">
                          <Receipt className="h-8 w-8" />
                        </div>
                        <p className="text-base font-bold text-slate-800">{tr("No completed orders found", "कुनै सम्पन्न अर्डर भेटिएन")}</p>
                        <p className="max-w-xs text-xs text-slate-400">
                          {tr(
                            "Paid or pending order histories will automatically appear here once customers place orders.",
                            "ग्राहकले अर्डर गरेपछि भुक्तानी भएका वा बाँकी अर्डरहरू यहाँ देखिनेछन्।"
                          )}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  dailySummaries.map((day) => (
                    <tr key={day.date} className="group transition-colors hover:bg-purple-50/30">
                      <td className="px-6 py-4">
                        <span className="rounded-xl bg-slate-100/70 px-3 py-1.5 text-sm font-bold text-slate-900 transition-colors group-hover:bg-purple-100/60 group-hover:text-purple-900">
                          {formatDisplayDate(day.date)}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-sm font-semibold text-slate-600">
                        {day.orderCount} {tr("orders", "अर्डर")}
                      </td>
                      <td className="px-6 py-4 font-mono text-sm font-black text-purple-900">Rs. {money(day.totalAmount)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleViewBill(day.date)}
                            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-purple-600/20 transition-all hover:bg-purple-700 active:scale-[0.98]"
                            title={tr("View and print this day's bill", "यस दिनको बिल हेर्नुहोस् र प्रिन्ट गर्नुहोस्")}
                          >
                            <Receipt size={15} />
                            <span>{tr("View Bill", "बिल हेर्नुहोस्")}</span>
                          </button>
                          <button
                            onClick={() => downloadDayExcel(day.date)}
                            disabled={exporting !== null}
                            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-700 transition-all hover:bg-emerald-600 hover:text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                            title={tr("Download this day as Excel", "यस दिनको एक्सेल डाउनलोड गर्नुहोस्")}
                          >
                            {exporting === day.date ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
                            <span>Excel</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Thermal bill popup — rendered on <body> so it is centred on the screen */}
        {showBill &&
          selectedDate &&
          createPortal(
            <div
              className="animate-fade-in fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
              onClick={() => setShowBill(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="receipt-title"
                onClick={(e) => e.stopPropagation()}
                className="max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-3xl border border-slate-100 bg-white shadow-2xl"
              >
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white p-5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                      <Receipt className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 id="receipt-title" className="text-sm font-extrabold text-slate-900">
                        {tr("Receipt Preview", "रसिद पूर्वावलोकन")}
                      </h2>
                      <p className="text-[10px] font-bold text-slate-400">{tr("Thermal POS Format", "थर्मल प्रिन्ट ढाँचा")}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowBill(false)}
                    aria-label={tr("Close", "बन्द गर्नुहोस्")}
                    className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Receipt (this is what gets printed — kept in English for the printer) */}
                <div className="flex justify-center bg-slate-100/60 p-6">
                  <div
                    id="bill-print-area"
                    style={{
                      width: "80mm",
                      fontFamily: "'Courier New', monospace",
                      fontSize: "12px",
                      padding: "12px",
                      background: "#fff",
                      boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)",
                      borderRadius: "8px",
                    }}
                  >
                    <div className="center bold header-title" style={{ textAlign: "center", fontWeight: "bold", fontSize: "16px" }}>
                      {restaurantName ? restaurantName.toUpperCase() : "DAILY SALES BILL"}
                    </div>
                    <div className="center small" style={{ textAlign: "center", fontSize: "10px", marginTop: "4px" }}>
                      Date: {formatDisplayDate(selectedDate)}
                    </div>
                    <div className="center small" style={{ textAlign: "center", fontSize: "10px" }}>
                      Total Orders: {totalOrdersCount}
                    </div>

                    <div className="divider" style={{ borderTop: "1px dashed #000", margin: "10px 0" }} />

                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left", padding: "2px 0" }}>Item</th>
                          <th style={{ textAlign: "right", padding: "2px 0" }}>Qty</th>
                          <th style={{ textAlign: "right", padding: "2px 0" }}>Amt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aggregatedItems.length === 0 ? (
                          <tr>
                            <td colSpan={3} style={{ textAlign: "center", padding: "10px 0" }}>
                              No sales for this date.
                            </td>
                          </tr>
                        ) : (
                          aggregatedItems.map((item, idx) => (
                            <tr key={idx} className="item-row">
                              <td style={{ padding: "4px 0" }}>{item.name}</td>
                              <td style={{ textAlign: "right", padding: "4px 0" }}>{item.qty}</td>
                              <td style={{ textAlign: "right", padding: "4px 0" }}>
                                {item.total > 0 ? item.total.toFixed(2) : "-"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>

                    <div className="divider" style={{ borderTop: "1px dashed #000", margin: "10px 0" }} />

                    <div
                      className="total-row"
                      style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "13px" }}
                    >
                      <span>Grand Total</span>
                      <span>Rs. {grandTotal.toFixed(2)}</span>
                    </div>

                    <div className="divider" style={{ borderTop: "1px dashed #000", margin: "10px 0" }} />

                    <div className="center small" style={{ textAlign: "center", fontSize: "10px" }}>
                      Thank you for your business!
                    </div>
                  </div>
                </div>

                {/* Actions: Close · Excel · Print */}
                <div className="sticky bottom-0 grid grid-cols-3 gap-2 border-t border-slate-100 bg-white p-5">
                  <button
                    onClick={() => setShowBill(false)}
                    className="cursor-pointer rounded-2xl border border-slate-200 px-3 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    {tr("Close", "बन्द")}
                  </button>
                  <button
                    onClick={() => downloadDayExcel(selectedDate)}
                    disabled={exporting !== null}
                    className="flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-bold text-emerald-700 transition hover:bg-emerald-600 hover:text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {exporting === selectedDate ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                    Excel
                  </button>
                  <button
                    onClick={handlePrint}
                    className="flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl bg-purple-600 px-3 py-3 text-sm font-bold text-white shadow-lg shadow-purple-600/25 transition hover:bg-purple-700 active:scale-[0.98]"
                  >
                    <Printer size={16} />
                    {tr("Print", "प्रिन्ट")}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
             to { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
};

export default TotalOrder;