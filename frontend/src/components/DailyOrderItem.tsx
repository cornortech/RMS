import React, { useState, useEffect, useMemo } from "react";
import { X, Printer, Receipt, Calendar, TrendingUp, DollarSign, ShoppingBag, ShieldCheck, Sparkles, ArrowRight } from "lucide-react";

const API_BASE_URL = `${(import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '')}/api`;

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

const TotalOrder: React.FC<TotalOrderProps> = ({ restaurantId }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showBill, setShowBill] = useState(false);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);

  // Resolve current restaurant's id and _id from localStorage (RESTAURANTUser)
  const { currentRestaurantId, currentRestaurantIdAlt } = useMemo(() => {
    try {
      const raw = localStorage.getItem("RESTAURANTUser");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.id || parsed?._id) {
          if (parsed?.RESTAURANTName) {
            setRestaurantName(parsed.RESTAURANTName);
          }
          return {
            currentRestaurantId: parsed?.id ?? null,
            currentRestaurantIdAlt: parsed?._id ?? null,
          };
        }
      }
    } catch (e) {
      console.error("Failed to parse RESTAURANTUser from localStorage:", e);
    }
    if (restaurantId) return { currentRestaurantId: restaurantId, currentRestaurantIdAlt: null };
    return { currentRestaurantId: null, currentRestaurantIdAlt: null };
  }, [restaurantId]);

  useEffect(() => {
    fetchOrders();
  }, [currentRestaurantId, currentRestaurantIdAlt]);

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `${API_BASE_URL}/orders`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setOrders(data.data);
      } else {
        setError(data.message || "Failed to fetch orders.");
      }
    } catch (err) {
      console.error("Fetch orders error:", err);
      setError("Error fetching orders data.");
    } finally {
      setLoading(false);
    }
  };

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

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-CA"); // YYYY-MM-DD
  };

  const formatDisplayDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Group completed orders by date
  const dailySummaries = useMemo(() => {
    const map: Record<string, { date: string; orders: Order[]; totalAmount: number; orderCount: number }> = {};
    completedOrders.forEach((order) => {
      const dateKey = formatDate(order.createdAt);
      if (!map[dateKey]) {
        map[dateKey] = { date: dateKey, orders: [], totalAmount: 0, orderCount: 0 };
      }
      map[dateKey].orders.push(order);
      map[dateKey].totalAmount += Number(order.totalAmount) || 0;
      map[dateKey].orderCount += 1;
    });
    return Object.values(map).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [completedOrders]);

  const handleViewBill = (dateKey: string) => {
    setSelectedDate(dateKey);
    setShowBill(true);
  };

  const ordersForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    return completedOrders.filter((o) => formatDate(o.createdAt) === selectedDate);
  }, [completedOrders, selectedDate]);

  const aggregatedItems = useMemo(() => {
    const map: Record<string, { qty: number; price: number; total: number }> = {};
    ordersForSelectedDate.forEach((order) => {
      order.items?.forEach((item) => {
        const name = item.itemName;
        const qty = Number(item.quantity) || 0;
        const price = Number(item.itemPrice) || 0;
        if (!map[name]) {
          map[name] = { qty: 0, price, total: 0 };
        }
        map[name].qty += qty;
        map[name].total += qty * price;
      });
    });
    return Object.entries(map).map(([name, val]) => ({
      name,
      qty: val.qty,
      price: val.price,
      total: val.total,
    }));
  }, [ordersForSelectedDate]);

  const grandTotal = useMemo(
    () => aggregatedItems.reduce((sum, item) => sum + item.total, 0),
    [aggregatedItems]
  );

  const totalOrdersCount = ordersForSelectedDate.length;

  const totalRevenueAllTime = useMemo(
    () => dailySummaries.reduce((sum, day) => sum + day.totalAmount, 0),
    [dailySummaries]
  );

  const totalCompletedOrdersCount = useMemo(
    () => dailySummaries.reduce((sum, day) => sum + day.orderCount, 0),
    [dailySummaries]
  );

  const handlePrint = () => {
    const printContent = document.getElementById("bill-print-area");
    if (!printContent) return;

    const printWindow = window.open("", "_blank", "width=400,height=600");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Sales Bill</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            * { box-sizing: border-box; }
            body {
              width: 72mm;
              margin: 0 auto;
              padding: 4mm 2mm;
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
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] gap-4 bg-gradient-to-br from-slate-50 to-purple-50/30 rounded-3xl">
        <div className="relative">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-purple-600 animate-pulse" />
          </div>
        </div>
        <p className="text-sm font-semibold text-slate-500 animate-pulse">Analyzing daily sales records...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto mt-10 p-6 rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-orange-50 text-red-700 text-center font-medium shadow-sm">
        {error}
      </div>
    );
  }

  if (!currentRestaurantId && !currentRestaurantIdAlt) {
    return (
      <div className="max-w-xl mx-auto mt-10 p-6 rounded-2xl border border-red-200 bg-red-50 text-red-700 text-center font-medium shadow-sm">
        Unable to identify restaurant. Please log in again.
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-purple-50/20 to-indigo-50/30 font-sans antialiased text-slate-800 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Light Header Hero Section matching your requested layout style */}
        <div className="relative overflow-hidden bg-gradient-to-r from-purple-100 via-purple-50 to-indigo-100 p-6 sm:p-8 rounded-3xl text-slate-900 shadow-xl shadow-purple-900/5 border border-purple-200/60">
          <div className="absolute right-0 top-0 -mt-10 -mr-10 h-64 w-64 rounded-full bg-purple-300/30 blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 bg-white/80 backdrop-blur-md border border-purple-200 rounded-2xl flex items-center justify-center text-purple-700 shadow-sm">
                <Calendar className="h-7 w-7 text-purple-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-200/60 border border-purple-300/60 text-[11px] font-extrabold text-purple-800 uppercase tracking-wider">
                    <Sparkles className="h-3 w-3 text-purple-700" /> Sales Analytics
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1">Daily Sales Overview</h1>
                <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 mt-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-purple-600" />
                  {restaurantName ? restaurantName : "Restaurant Portal"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Vibrant Metric KPI Cards with Colored Light Backgrounds */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          
          {/* Card 1: Revenue */}
          <div className="group relative overflow-hidden bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-white p-6 rounded-3xl border border-emerald-500/20 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <div className="absolute right-4 top-4 h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
              <DollarSign className="h-6 w-6" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-wider text-emerald-800/80 mb-1">Total Sales Revenue</p>
            <p className="text-3xl font-black text-slate-900 tracking-tight">
              Rs. {totalRevenueAllTime.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-emerald-700">
              <span>Lifetime generated sales</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </div>

          {/* Card 2: Orders Count */}
          <div className="group relative overflow-hidden bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-white p-6 rounded-3xl border border-purple-500/20 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <div className="absolute right-4 top-4 h-12 w-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-wider text-purple-800/80 mb-1">Completed Orders</p>
            <p className="text-3xl font-black text-slate-900 tracking-tight">{totalCompletedOrdersCount}</p>
            <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-purple-700">
              <span>Successfully settled orders</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </div>

          {/* Card 3: Active Days */}
          <div className="group relative overflow-hidden bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-white p-6 rounded-3xl border border-indigo-500/20 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <div className="absolute right-4 top-4 h-12 w-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
              <TrendingUp className="h-6 w-6" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-wider text-indigo-800/80 mb-1">Active Summary Days</p>
            <p className="text-3xl font-black text-slate-900 tracking-tight">{dailySummaries.length}</p>
            <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-indigo-700">
              <span>Recorded business dates</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </div>

        </div>

        {/* Modern Table Card */}
        <div className="bg-white/80 backdrop-blur-md rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Daily Records Breakdown</h2>
              <p className="text-xs text-slate-500 mt-0.5">Click "View Bill" to check complete item-wise billing summaries per day.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500">
                  <th className="px-6 py-4 text-[11px] font-extrabold uppercase tracking-wider">Business Date</th>
                  <th className="px-6 py-4 text-[11px] font-extrabold uppercase tracking-wider">Total Orders</th>
                  <th className="px-6 py-4 text-[11px] font-extrabold uppercase tracking-wider">Total Daily Sales</th>
                  <th className="px-6 py-4 text-[11px] font-extrabold uppercase tracking-wider text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailySummaries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="h-16 w-16 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 mb-1 shadow-inner">
                          <Receipt className="h-8 w-8" />
                        </div>
                        <p className="text-base font-bold text-slate-800">No completed orders found</p>
                        <p className="text-xs text-slate-400 max-w-xs">Paid or pending order histories will automatically appear here once customers place orders.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  dailySummaries.map((day) => (
                    <tr key={day.date} className="hover:bg-purple-50/30 transition-colors group">
                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-900 text-sm bg-slate-100/70 group-hover:bg-purple-100/60 group-hover:text-purple-900 px-3 py-1.5 rounded-xl transition-colors">
                          {formatDisplayDate(day.date)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-mono font-semibold text-slate-600">
                        {day.orderCount} orders
                      </td>
                      <td className="px-6 py-4 text-sm font-mono font-black text-purple-900">
                        Rs. {day.totalAmount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleViewBill(day.date)}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-[0.98] text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-purple-600/20"
                          title="View day's sales bill"
                        >
                          <Receipt size={15} />
                          <span>View Bill</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Thermal Bill Modal */}
        {showBill && selectedDate && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full max-h-[92vh] overflow-y-auto border border-slate-100 transform transition-all">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                    <Receipt className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="font-extrabold text-slate-900 text-sm">Receipt Preview</h2>
                    <p className="text-[10px] font-bold text-slate-400">Thermal POS Format</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowBill(false)}
                  className="h-9 w-9 rounded-full bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-500 flex items-center justify-center transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Thermal Bill Content Container */}
              <div className="p-6 flex justify-center bg-slate-100/60">
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
                            <td style={{ textAlign: "right", padding: "4px 0" }}>
                              {item.qty}
                            </td>
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
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontWeight: "bold",
                      fontSize: "13px",
                    }}
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

              {/* Modal Actions */}
              <div className="p-5 border-t border-slate-100 flex gap-3 sticky bottom-0 bg-white">
                <button
                  onClick={() => setShowBill(false)}
                  className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-bold transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={handlePrint}
                  className="flex-1 px-4 py-3 rounded-2xl bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.98] flex items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-purple-600/25 transition cursor-pointer"
                >
                  <Printer size={16} />
                  Print Receipt
                </button>
              </div>

            </div>
          </div>
        )}

      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
          animation: fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
};

export default TotalOrder;