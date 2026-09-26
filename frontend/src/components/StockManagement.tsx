import React, { useState, useEffect, useMemo, useRef } from "react";
import axios from "axios";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Package,
  AlertTriangle,
  Loader2,
  Search,
  TrendingUp,
  Boxes,
  ShoppingBasket,
  DollarSign,
  ShieldCheck,
  Sparkles,
  Filter,
  PackageOpen,
  ArrowDownRight,
  CheckCircle,
  XCircle,
} from "lucide-react";

const API_BASE = `${(import.meta.env.VITE_API_URL || 'http://localhost:5000').trim().replace(/\/+$/, '')}/api/stocks`;

interface StockItem {
  _id: string;
  restaurantId: string;
  stockName: string;
  quantity: number;
  closingStock?: number;
  perPiecePrice: number;
  totalPrice: number;
  createdAt?: string;
  updatedAt?: string;
}

// ==========================================
// SMALL HELPERS
// ==========================================

// Numbers "count up" smoothly whenever the target value changes.
function useCountUp(target: number, duration = 800) {
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

// Colourful gradient + initials for a stock item avatar, derived from its name
// so the same item always gets the same colour.
const AVATAR_GRADIENTS = [
  "from-violet-500 to-fuchsia-500",
  "from-indigo-500 to-sky-500",
  "from-rose-500 to-orange-400",
  "from-emerald-500 to-teal-400",
  "from-amber-500 to-pink-500",
  "from-blue-500 to-violet-500",
];
const initials = (name: string) => {
  const parts = (name || "?").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};
const gradientFor = (name: string) => {
  let hash = 0;
  const s = name || "";
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
};

// Stock health: how much of the opening quantity is still left.
const getHealth = (closing: number, opening: number) => {
  const safeOpening = opening > 0 ? opening : 1;
  const pct = Math.max(0, Math.min(100, (closing / safeOpening) * 100));
  if (closing <= 0) {
    return { pct, bar: "bg-rose-500", text: "text-rose-700", chip: "bg-rose-50 text-rose-700 border-rose-100", label: "Out of stock" };
  }
  if (closing <= 5 || pct <= 20) {
    return { pct, bar: "bg-amber-500", text: "text-amber-700", chip: "bg-amber-50 text-amber-700 border-amber-100", label: "Low stock" };
  }
  return { pct, bar: "bg-emerald-500", text: "text-emerald-700", chip: "bg-emerald-50 text-emerald-700 border-emerald-100", label: "Healthy" };
};

type ToastKind = "success" | "error";

const StockManagement: React.FC = () => {
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // toast
  const [toast, setToast] = useState<{ kind: ToastKind; msg: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (kind: ToastKind, msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ kind, msg });
    toastTimer.current = setTimeout(() => setToast(null), kind === "error" ? 6000 : 3500);
  };

  // add-form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [stockName, setStockName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [perPiecePrice, setPerPiecePrice] = useState("");

  // edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStockName, setEditStockName] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editPerPiecePrice, setEditPerPiecePrice] = useState("");
  const [editSaleQuantity, setEditSaleQuantity] = useState("");
  const [savingEditId, setSavingEditId] = useState<string | null>(null);

  // delete confirm modal state
  const [deleteTarget, setDeleteTarget] = useState<StockItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const getAuthHeaders = () => {
    let token =
      localStorage.getItem("authToken") ||
      localStorage.getItem("token") ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("jwt") || "";

    if (!token) {
      try {
        const raw = localStorage.getItem("RESTAURANTUser");
        if (raw) {
          const parsed = JSON.parse(raw);
          token = parsed.token || parsed.accessToken || parsed.jwt || "";
        }
      } catch {}
    }

    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  };

  const getStoredRESTAURANTUser = (): { id: string; RESTAURANTName: string } | null => {
    try {
      const raw = localStorage.getItem("RESTAURANTUser");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.id) return null;
      return { id: parsed.id, RESTAURANTName: parsed.RESTAURANTName || "" };
    } catch {
      return null;
    }
  };

  const fetchStocks = async (rid: string) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}?restaurantId=${encodeURIComponent(rid)}`, getAuthHeaders());
      const allData: StockItem[] = res.data.data || [];
      const filtered = allData.filter((s) => s.restaurantId === rid);
      setStocks(filtered);
    } catch (err: any) {
      notify("error", err.response?.data?.message || "Failed to fetch stocks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const user = getStoredRESTAURANTUser();
    if (user) {
      setRestaurantId(user.id);
      setRestaurantName(user.RESTAURANTName);
      fetchStocks(user.id);
    } else {
      setLoading(false);
      notify("error", "No restaurant found in local storage. Please log in again.");
    }
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId) return;
    if (!stockName.trim() || quantity === "" || perPiecePrice === "") {
      notify("error", "Please fill all fields");
      return;
    }

    setSubmitting(true);
    try {
      const qty = Number(quantity);
      const price = Number(perPiecePrice);
      await axios.post(API_BASE, {
        restaurantId,
        stockName: stockName.trim(),
        quantity: qty,
        closingStock: qty,
        perPiecePrice: price,
        totalPrice: qty * price,
      }, getAuthHeaders());

      notify("success", `"${stockName.trim()}" added to inventory.`);
      setStockName("");
      setQuantity("");
      setPerPiecePrice("");
      setShowAddForm(false);
      await fetchStocks(restaurantId);
    } catch (err: any) {
      notify("error", err.response?.data?.message || "Failed to add stock");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: StockItem) => {
    if (!restaurantId) return;
    setDeletingId(item._id);
    try {
      await axios.delete(`${API_BASE}/${item._id}`, getAuthHeaders());
      notify("success", `"${item.stockName}" removed from inventory.`);
      setDeleteTarget(null);
      await fetchStocks(restaurantId);
    } catch (err: any) {
      notify("error", err.response?.data?.message || "Failed to delete stock");
    } finally {
      setDeletingId(null);
    }
  };

  const startEdit = (stock: StockItem) => {
    setEditingId(stock._id);
    setEditStockName(stock.stockName);
    setEditQuantity(String(stock.quantity));
    setEditPerPiecePrice(String(stock.perPiecePrice));
    setEditSaleQuantity("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditStockName("");
    setEditQuantity("");
    setEditPerPiecePrice("");
    setEditSaleQuantity("");
  };

  const handleUpdate = async (id: string) => {
    if (!restaurantId) return;
    if (!editStockName.trim() || editQuantity === "" || editPerPiecePrice === "") {
      notify("error", "Please fill all fields");
      return;
    }

    const openingQty = Number(editQuantity);
    const saleQty = editSaleQuantity !== "" ? Number(editSaleQuantity) : 0;
    const calculatedClosingStock = Math.max(0, openingQty - saleQty);
    const price = Number(editPerPiecePrice);
    const calculatedTotalPrice = calculatedClosingStock * price;

    setSavingEditId(id);
    try {
      await axios.put(`${API_BASE}/${id}`, {
        stockName: editStockName.trim(),
        quantity: openingQty,
        closingStock: calculatedClosingStock,
        perPiecePrice: price,
        totalPrice: calculatedTotalPrice,
      }, getAuthHeaders());

      notify("success", "Stock item updated.");
      cancelEdit();
      await fetchStocks(restaurantId);
    } catch (err: any) {
      notify("error", err.response?.data?.message || "Failed to update stock");
    } finally {
      setSavingEditId(null);
    }
  };

  const filteredStocks = useMemo(() => {
    let list = stocks;
    if (lowStockOnly) {
      list = list.filter((s) => (s.closingStock ?? s.quantity) <= 5);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((s) => s.stockName.toLowerCase().includes(q));
    }
    return list;
  }, [stocks, searchQuery, lowStockOnly]);

  const totalItems = stocks.length;
  const totalUnits = stocks.reduce((sum, s) => sum + (s.closingStock ?? s.quantity), 0);
  const lowStockCount = stocks.filter((s) => (s.closingStock ?? s.quantity) <= 5).length;
  const totalInventoryValue = stocks.reduce((sum, s) => {
    const closing = s.closingStock ?? s.quantity;
    return sum + (s.totalPrice ?? closing * s.perPiecePrice);
  }, 0);

  const animItems = useCountUp(totalItems);
  const animUnits = useCountUp(totalUnits);
  const animValue = useCountUp(totalInventoryValue);
  const animLow = useCountUp(lowStockCount);

  // Esc closes the delete-confirmation modal
  useEffect(() => {
    if (!deleteTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDeleteTarget(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteTarget]);

  return (
    <div className="min-h-full bg-slate-50/50 font-sans antialiased text-slate-800">
      <style>{`
        @keyframes sm-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sm-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sm-pop { from { opacity: 0; transform: scale(.96) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes sm-slide-in { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: translateX(0); } }
        .sm-rise { animation: sm-rise .4s cubic-bezier(.22,1,.36,1) both; }
        .sm-fade { animation: sm-fade .2s ease-out both; }
        .sm-pop { animation: sm-pop .22s ease-out both; }
        .sm-slide-in { animation: sm-slide-in .3s cubic-bezier(.22,1,.36,1) both; }
      `}</style>

      <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-6">

        {/* Header Section */}
        <div className="sm-rise relative overflow-hidden flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-purple-50 via-white to-white p-5 sm:p-6 rounded-3xl border border-purple-100/80 shadow-sm">
          <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-purple-200/25 blur-3xl" />
          <div className="relative flex items-center gap-3.5">
            <div className="h-12 w-12 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-md shadow-purple-500/20">
              <Boxes className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-purple-600">
                <Sparkles className="h-3 w-3" /> Inventory
              </div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Stock Management</h1>
              <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="h-3.5 w-3.5 text-purple-600" />
                {restaurantName ? restaurantName : "No restaurant selected"}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAddForm((v) => !v)}
            disabled={!restaurantId}
            className="relative inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-3 shadow-md shadow-purple-500/25 hover:shadow-lg hover:shadow-purple-500/30 transition-all cursor-pointer"
          >
            {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showAddForm ? "Cancel" : "Add New Stock"}
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            style={{ animationDelay: "0ms" }}
            className="sm-rise group relative overflow-hidden bg-gradient-to-br from-purple-50/80 via-white to-white rounded-2xl border border-purple-100/80 shadow-sm p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-500/10"
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-purple-200/25 blur-2xl transition-transform duration-500 group-hover:scale-125" />
            <div className="relative flex items-center gap-2 text-purple-600 mb-2">
              <ShoppingBasket className="h-4 w-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Items</span>
            </div>
            <p className="relative text-2xl font-black text-slate-900 tabular-nums">{Math.round(animItems)}</p>
          </div>

          <div
            style={{ animationDelay: "60ms" }}
            className="sm-rise group relative overflow-hidden bg-gradient-to-br from-sky-50/80 via-white to-white rounded-2xl border border-sky-100/80 shadow-sm p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sky-500/10"
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-sky-200/25 blur-2xl transition-transform duration-500 group-hover:scale-125" />
            <div className="relative flex items-center gap-2 text-sky-600 mb-2">
              <Package className="h-4 w-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider">Closing Units</span>
            </div>
            <p className="relative text-2xl font-black text-slate-900 tabular-nums">{Math.round(animUnits)}</p>
          </div>

          <div
            style={{ animationDelay: "120ms" }}
            className="sm-rise group relative overflow-hidden bg-gradient-to-br from-emerald-50/80 via-white to-white rounded-2xl border border-emerald-100/80 shadow-sm p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/10"
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-emerald-200/25 blur-2xl transition-transform duration-500 group-hover:scale-125" />
            <div className="relative flex items-center gap-2 text-emerald-600 mb-2">
              <DollarSign className="h-4 w-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider">Inventory Value</span>
            </div>
            <p className="relative text-2xl font-black text-emerald-700 tabular-nums">
              Rs. {Math.round(animValue).toLocaleString()}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setLowStockOnly((v) => !v)}
            style={{ animationDelay: "180ms" }}
            className={`sm-rise group relative overflow-hidden rounded-2xl border shadow-sm p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg cursor-pointer ${
              lowStockOnly
                ? "border-amber-300 bg-gradient-to-br from-amber-100 via-amber-50 to-white ring-2 ring-amber-400/30"
                : "border-amber-100/80 bg-gradient-to-br from-amber-50/80 via-white to-white hover:shadow-amber-500/10"
            }`}
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-amber-200/25 blur-2xl transition-transform duration-500 group-hover:scale-125" />
            <div className="relative flex items-center justify-between gap-2 text-amber-600 mb-2">
              <span className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Low Stock Alerts</span>
              </span>
              <Filter className={`h-3.5 w-3.5 transition-opacity ${lowStockOnly ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`} />
            </div>
            <p className={`relative text-2xl font-black tabular-nums ${lowStockCount > 0 ? "text-amber-600" : "text-slate-900"}`}>
              {Math.round(animLow)}
            </p>
            {lowStockCount > 0 && (
              <p className="relative mt-1 text-[10px] font-semibold text-amber-600/80">
                {lowStockOnly ? "Showing low stock only — click to clear" : "Click to filter the table"}
              </p>
            )}
          </button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="sm-pop bg-white rounded-2xl border border-purple-100 shadow-xl shadow-purple-500/5 p-6">
            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-purple-600 animate-pulse" />
              Add New Stock Item
            </h3>
            <form onSubmit={handleAddStock} className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Stock Name</label>
                <div className="relative">
                  <PackageOpen className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="e.g. Premium Coffee Beans"
                    value={stockName}
                    onChange={(e) => setStockName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-3 text-sm font-medium outline-none focus:border-purple-600 focus:bg-white focus:ring-2 focus:ring-purple-600/20 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Initial Quantity</label>
                <input
                  type="number"
                  placeholder="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min="0"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-mono font-medium outline-none focus:border-purple-600 focus:bg-white focus:ring-2 focus:ring-purple-600/20 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Per Piece Price</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={perPiecePrice}
                  onChange={(e) => setPerPiecePrice(e.target.value)}
                  min="0"
                  step="0.01"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-mono font-medium outline-none focus:border-purple-600 focus:bg-white focus:ring-2 focus:ring-purple-600/20 transition-all"
                />
              </div>

              <div className="sm:col-span-4 flex items-center justify-between gap-4 pt-2 border-t border-slate-100 mt-1">
                <p className="text-xs font-semibold text-slate-500">
                  {quantity !== "" && perPiecePrice !== "" ? (
                    <>
                      Opening value:{" "}
                      <span className="font-mono font-bold text-purple-700">
                        Rs. {(Number(quantity || 0) * Number(perPiecePrice || 0)).toLocaleString()}
                      </span>
                    </>
                  ) : (
                    "Fill quantity and price to preview the value"
                  )}
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-[0.98] disabled:opacity-60 text-white text-sm font-semibold px-6 py-3 shadow-md shadow-purple-500/20 transition-all cursor-pointer"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? "Saving Stock..." : "Save Stock Item"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Search + filter bar */}
        {stocks.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search inventory items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-3 text-sm font-medium outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20 shadow-sm transition-all"
              />
            </div>
            {lowStockOnly && (
              <button
                type="button"
                onClick={() => setLowStockOnly(false)}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700 text-xs font-bold px-3.5 py-2 hover:bg-amber-100 transition-colors cursor-pointer"
              >
                <Filter className="h-3.5 w-3.5" />
                Low stock only
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <span className="text-xs font-medium text-slate-400 sm:ml-auto">
              Showing {filteredStocks.length} of {stocks.length} item{stocks.length === 1 ? "" : "s"}
            </span>
          </div>
        )}

        {/* Table / states Container */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-14 w-full animate-pulse rounded-xl bg-slate-100" style={{ animationDelay: `${i * 80}ms` }} />
              ))}
            </div>
          ) : !restaurantId ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
              <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 mb-1">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <p className="text-base font-bold text-slate-800">No restaurant session found</p>
              <p className="text-xs text-slate-400 max-w-xs">Please log in again to securely manage your stock details.</p>
            </div>
          ) : filteredStocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
              <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 mb-1">
                <Package className="h-6 w-6" />
              </div>
              <p className="text-base font-bold text-slate-700">
                {stocks.length === 0 ? "No stock items added yet" : "No matching items found"}
              </p>
              <p className="text-xs text-slate-400 max-w-xs">
                {stocks.length === 0
                  ? "Get started by adding your first inventory item above."
                  : lowStockOnly
                  ? "Nothing is running low right now — nice work."
                  : "Try checking your spelling or searching for a different keyword."}
              </p>
              {stocks.length === 0 && (
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-4 py-2.5 shadow-sm transition-all cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Add your first item
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-500">
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider">Stock Name</th>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider">Opening Stock</th>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider">Sale Qty (Input)</th>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider">Stock Health</th>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider">Per Piece</th>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider">Total Price</th>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStocks.map((stock, rowIdx) => {
                    const isEditing = editingId === stock._id;
                    const isSaving = savingEditId === stock._id;

                    const liveOpening = isEditing ? Number(editQuantity || 0) : stock.quantity;
                    const liveSale = isEditing ? Number(editSaleQuantity || 0) : 0;
                    const liveClosing = isEditing ? Math.max(0, liveOpening - liveSale) : (stock.closingStock ?? stock.quantity);
                    const livePrice = isEditing ? Number(editPerPiecePrice || 0) : stock.perPiecePrice;
                    const liveTotalPrice = liveClosing * livePrice;

                    const health = getHealth(liveClosing, liveOpening || stock.quantity);

                    return (
                      <tr
                        key={stock._id}
                        style={{ animationDelay: `${Math.min(rowIdx, 8) * 40}ms` }}
                        className="sm-fade hover:bg-purple-50/30 transition-colors"
                      >
                        <td className="px-6 py-4">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editStockName}
                              onChange={(e) => setEditStockName(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                              autoFocus
                            />
                          ) : (
                            <div className="flex items-center gap-3">
                              <span
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-[10px] font-extrabold text-white shadow-sm ${gradientFor(
                                  stock.stockName
                                )}`}
                              >
                                {initials(stock.stockName)}
                              </span>
                              <span className="font-semibold text-slate-800">{stock.stockName}</span>
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editQuantity}
                              onChange={(e) => setEditQuantity(e.target.value)}
                              min="0"
                              className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                            />
                          ) : (
                            <span className="font-mono text-slate-600 font-medium">{stock.quantity}</span>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          {isEditing ? (
                            <input
                              type="number"
                              placeholder="0"
                              value={editSaleQuantity}
                              onChange={(e) => setEditSaleQuantity(e.target.value)}
                              min="0"
                              className="w-24 rounded-lg border border-purple-300 bg-purple-50/30 px-3 py-2 text-sm font-mono outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                            />
                          ) : (
                            <span className="font-mono text-slate-400">-</span>
                          )}
                        </td>

                        <td className="px-6 py-4 min-w-[150px]">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono font-bold text-slate-800">{liveClosing}</span>
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${health.chip}`}>
                              {health.label === "Healthy" ? (
                                <CheckCircle className="h-2.5 w-2.5" />
                              ) : health.label === "Out of stock" ? (
                                <XCircle className="h-2.5 w-2.5" />
                              ) : (
                                <ArrowDownRight className="h-2.5 w-2.5" />
                              )}
                              {health.label}
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${health.bar} transition-all duration-500`}
                              style={{ width: `${health.pct}%` }}
                            />
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editPerPiecePrice}
                              onChange={(e) => setEditPerPiecePrice(e.target.value)}
                              min="0"
                              step="0.01"
                              className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                            />
                          ) : (
                            <span className="font-mono text-slate-600">Rs. {stock.perPiecePrice}</span>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          <span className="font-mono font-semibold text-slate-900">
                            Rs. {liveTotalPrice.toLocaleString()}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => handleUpdate(stock._id)}
                                  disabled={isSaving}
                                  className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white text-xs font-semibold px-3.5 py-2 transition-all cursor-pointer shadow-sm"
                                >
                                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                  Save
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  disabled={isSaving}
                                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold px-3.5 py-2 transition-all cursor-pointer"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEdit(stock)}
                                  className="inline-flex items-center gap-1 rounded-xl bg-slate-50 hover:bg-purple-50 hover:text-purple-600 text-slate-600 text-xs font-semibold p-2.5 border border-slate-200 transition-all cursor-pointer shadow-sm"
                                  title="Edit Item"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeleteTarget(stock)}
                                  className="inline-flex items-center gap-1 rounded-xl bg-red-50/50 hover:bg-red-100 text-red-600 text-xs font-semibold p-2.5 border border-red-200/60 transition-all cursor-pointer shadow-sm"
                                  title="Delete Item"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ---------- DELETE CONFIRMATION MODAL ---------- */}
      {deleteTarget && (
        <div
          className="sm-fade fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[3px]"
          onClick={() => (deletingId ? null : setDeleteTarget(null))}
        >
          <div
            className="sm-pop w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 border-b border-rose-100 bg-gradient-to-r from-rose-50 to-white px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete this stock item?</h3>
                <p className="text-xs text-slate-500 mt-0.5">This action cannot be undone.</p>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">"{deleteTarget.stockName}"</span> will be permanently
                removed from your inventory, along with its stock and pricing history.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3.5">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={!!deletingId}
                className="rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-bold px-4 py-2.5 transition-all cursor-pointer disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteTarget)}
                disabled={!!deletingId}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white text-xs font-bold px-4 py-2.5 shadow-sm transition-all cursor-pointer"
              >
                {deletingId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Delete Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- TOAST ---------- */}
      {toast && (
        <div
          className={`sm-slide-in fixed bottom-5 right-5 z-[200] flex max-w-md items-center gap-3 rounded-2xl border p-4 text-sm font-semibold shadow-2xl ${
            toast.kind === "success"
              ? "bg-emerald-600 border-emerald-500 text-white"
              : "bg-rose-600 border-rose-500 text-white"
          }`}
        >
          {toast.kind === "success" ? (
            <CheckCircle className="h-5 w-5 shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0" />
          )}
          <p>{toast.msg}</p>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-1 shrink-0 rounded-lg p-1 hover:bg-white/15 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default StockManagement;