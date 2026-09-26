import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  RefreshCw,
  CheckCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  PackageX,
  AlertCircle,
  Search,
  Pencil,
  Plus,
  Minus,
  Trash2,
  X,
  ShoppingCart,
  Utensils,
  ChefHat,
  BellRing,
  Ban,
  Receipt,
  LayoutGrid,
  List,
  StickyNote,
  ChevronRight,
  Flame,
  Wallet,
  Timer,
  ClipboardList,
  ArrowRight,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useLang } from '../i18n';

// ==========================================
// CONFIG
// ==========================================

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').trim().replace(/\/+$/, '');
const ORDERS_URL = `${API_BASE}/api/orders`;
const MENU_URL = `${API_BASE}/api/menu`;

const getLoggedInRestaurantId = () => {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return parsed?.id ? String(parsed.id) : '';
  } catch {
    return '';
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
  restaurantId?: string;
  staffId?: string;
  customerName: string;
  tableNumber: string;
  orderNote?: string;
  items: OrderItem[];
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  createdAt?: string;
}

interface MenuItem {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  status: string;
  available: boolean;
}

interface EditLine {
  lineKey: string;
  menuItemId: string | null;
  name: string;
  description: string;
  category: string;
  unitPrice: number;
  quantity: number;
  origQty: number; // 0 for lines added during this edit
}

type SortKey = 'name' | 'priceAsc' | 'priceDesc';

// ==========================================
// DESIGN TOKENS
// ==========================================
const STATUS_META: Record<
  string,
  { icon: React.ElementType; pill: string; dot: string; bar: string; tab: string }
> = {
  Pending: {
    icon: Clock,
    pill: 'bg-amber-50 text-amber-700 ring-amber-200',
    dot: 'bg-amber-500',
    bar: 'from-amber-400 to-orange-400',
    tab: 'bg-amber-500',
  },
  Preparing: {
    icon: ChefHat,
    pill: 'bg-sky-50 text-sky-700 ring-sky-200',
    dot: 'bg-sky-500',
    bar: 'from-sky-400 to-blue-500',
    tab: 'bg-sky-500',
  },
  Ready: {
    icon: BellRing,
    pill: 'bg-violet-50 text-violet-700 ring-violet-200',
    dot: 'bg-violet-500',
    bar: 'from-purple-500 to-violet-500',
    tab: 'bg-violet-500',
  },
  Served: {
    icon: CheckCircle,
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dot: 'bg-emerald-500',
    bar: 'from-emerald-400 to-teal-500',
    tab: 'bg-emerald-500',
  },
  Completed: {
    icon: CheckCircle2,
    pill: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    dot: 'bg-indigo-500',
    bar: 'from-indigo-400 to-indigo-500',
    tab: 'bg-indigo-500',
  },
  Cancelled: {
    icon: Ban,
    pill: 'bg-rose-50 text-rose-700 ring-rose-200',
    dot: 'bg-rose-500',
    bar: 'from-rose-400 to-rose-500',
    tab: 'bg-rose-500',
  },
};
const getStatus = (s: string) => STATUS_META[s] || STATUS_META.Pending;

const PAYMENT_STYLES: Record<string, string> = {
  Unpaid: 'bg-slate-100 text-slate-600 ring-slate-200',
  Paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Refunded: 'bg-amber-50 text-amber-700 ring-amber-200',
};

const FINISHED_STATUSES = ['Served', 'Completed', 'Cancelled'];
const FINISHED_LABELS: Record<string, string> = {
  Served: 'Served to the table',
  Completed: 'Completed and closed',
  Cancelled: 'Order voided',
};
const PROGRESS_STEPS = ['Pending', 'Preparing', 'Ready', 'Served'];

// Same category look as CreateOrder / MenuManager
const CATEGORY_META: Record<string, { emoji: string; tile: string; chip: string }> = {
  Appetizer: { emoji: '🥗', tile: 'bg-lime-50 ring-lime-100', chip: 'bg-lime-50 text-lime-700 ring-lime-200' },
  'Main Course': { emoji: '🍛', tile: 'bg-orange-50 ring-orange-100', chip: 'bg-orange-50 text-orange-700 ring-orange-200' },
  Dessert: { emoji: '🍰', tile: 'bg-pink-50 ring-pink-100', chip: 'bg-pink-50 text-pink-700 ring-pink-200' },
  Beverage: { emoji: '🥤', tile: 'bg-sky-50 ring-sky-100', chip: 'bg-sky-50 text-sky-700 ring-sky-200' },
  Side: { emoji: '🍟', tile: 'bg-amber-50 ring-amber-100', chip: 'bg-amber-50 text-amber-700 ring-amber-200' },
  Other: { emoji: '🍽️', tile: 'bg-slate-100 ring-slate-200', chip: 'bg-slate-100 text-slate-700 ring-slate-200' },
};
const getCat = (c: string) => CATEGORY_META[c] || CATEGORY_META.Other;

const CARD =
  'rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]';

const inputBase =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-purple-500 focus:bg-white focus:ring-4 focus:ring-purple-500/15';

const FOCUS = 'outline-none focus-visible:ring-4 focus-visible:ring-purple-500/25';

const formatNPR = (n: number) =>
  `NPR ${Number(n || 0).toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ==========================================
// HELPERS
// ==========================================

const mapRawToMenuItem = (raw: any): MenuItem => {
  const status = raw.status || (raw.available === false ? 'Unavailable' : 'Available');
  return {
    id: raw._id || raw.id,
    name: raw.itemName || raw.name || 'Unnamed Item',
    description: raw.description || '',
    category: raw.category || 'Other',
    price: Number(raw.price ?? raw.itemPrice) || 0,
    status,
    available: status === 'Available',
  };
};

// Ticket number pulled from the order's own id — no schema change needed
const ticketNumber = (order: Order | null) => (order?._id ? order._id.slice(-4).toUpperCase() : '----');

const minutesSince = (iso: string | undefined, now: number) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 60000));
};

const formatWait = (mins: number | null, iso?: string) => {
  if (mins === null) return '';
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  return iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '';
};

// ==========================================
// SMALL REUSABLE PIECES
// ==========================================

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />;
}

function QtyStepper({
  qty,
  onMinus,
  onPlus,
  small = false,
}: {
  qty: number;
  onMinus: () => void;
  onPlus: () => void;
  small?: boolean;
}) {
  const btn = small ? 'h-7 w-7' : 'h-8 w-8';
  return (
    <div
      className="inline-flex items-center gap-1 rounded-xl bg-purple-50 p-1 ring-1 ring-inset ring-purple-100"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onMinus}
        aria-label="Decrease quantity"
        className={`${btn} flex cursor-pointer items-center justify-center rounded-lg bg-white text-purple-700 shadow-sm transition hover:bg-purple-600 hover:text-white active:scale-95 ${FOCUS}`}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-[24px] text-center font-mono text-sm font-bold tabular-nums text-purple-900">{qty}</span>
      <button
        type="button"
        onClick={onPlus}
        aria-label="Increase quantity"
        className={`${btn} flex cursor-pointer items-center justify-center rounded-lg bg-purple-600 text-white shadow-sm transition hover:bg-purple-700 active:scale-95 ${FOCUS}`}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const meta = getStatus(status);
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${meta.pill}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {status}
    </span>
  );
}

function ProgressTrack({ status }: { status: string }) {
  if (status === 'Cancelled') {
    return <div className="h-1.5 w-full rounded-full bg-rose-100" aria-hidden="true" />;
  }
  const idx = status === 'Completed' ? PROGRESS_STEPS.length - 1 : PROGRESS_STEPS.indexOf(status);
  const bar = getStatus(status).bar;
  return (
    <div className="flex gap-1" role="img" aria-label={`Progress: ${status}`}>
      {PROGRESS_STEPS.map((step, i) => (
        <div key={step} className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${bar} transition-all duration-500 ${i <= idx ? 'w-full' : 'w-0'}`}
          />
        </div>
      ))}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  tone: string;
  hint?: string;
}) {
  return (
    <div className={`${CARD} group flex items-center gap-4 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-500/5`}>
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone} transition-transform duration-200 group-hover:scale-105`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
        <p className="mt-0.5 truncate font-mono text-xl font-bold tabular-nums text-slate-900">{value}</p>
        {hint && <p className="truncate text-[11px] text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}

function SkeletonOrderCard() {
  return (
    <div className={`${CARD} space-y-4 p-5`}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-10 flex-1 rounded-xl" />
        <Skeleton className="h-10 w-10 rounded-xl" />
        <Skeleton className="h-10 w-20 rounded-xl" />
      </div>
    </div>
  );
}

// ==========================================
// COMPONENT
// ==========================================

export default function OrdersPage() {
  const restaurantId = getLoggedInRestaurantId();
  const { tr } = useLang();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [voidArmedId, setVoidArmedId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // Edit modal
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editCart, setEditCart] = useState<EditLine[]>([]);
  const [editNote, setEditNote] = useState('');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState('');
  const [menuSearch, setMenuSearch] = useState('');
  const [menuCategory, setMenuCategory] = useState('All');
  const [menuSort, setMenuSort] = useState<SortKey>('name');
  const [menuView, setMenuView] = useState<'grid' | 'table'>('grid');
  const [editTab, setEditTab] = useState<'order' | 'menu'>('menu');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const [editConfirmChecked, setEditConfirmChecked] = useState(false);
  const [mounted, setMounted] = useState(false);

  const toastTimer = useRef<number | null>(null);
  const voidTimer = useRef<number | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  // Tick every minute so "x min ago" stays fresh
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60000);
    return () => {
      window.clearInterval(id);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      if (voidTimer.current) window.clearTimeout(voidTimer.current);
    };
  }, []);

  // Lock body scroll while any modal is open
  useEffect(() => {
    if (editingOrder) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [editingOrder]);

  // ==========================================
  // FETCH ORDERS
  // ==========================================
  const fetchOrders = async (silent = false) => {
    if (silent) setIsRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const url = restaurantId
        ? `${ORDERS_URL}?restaurantId=${encodeURIComponent(restaurantId)}`
        : ORDERS_URL;
      const res = await fetch(url);
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to load orders.');
      }
      setOrders(result.data || []);
      setNow(Date.now());
    } catch (err: any) {
      setError(err.message || 'Could not connect to the server.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==========================================
  // UPDATE STATUS (Served / Completed / Cancelled)
  // ==========================================
  const updateOrderStatus = async (order: Order, newStatus: string) => {
    setUpdatingId(order._id);
    setVoidArmedId(null);
    try {
      const res = await fetch(`${ORDERS_URL}/${order._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: order.restaurantId,
          customerName: order.customerName,
          tableNumber: order.tableNumber,
          orderNote: order.orderNote,
          items: order.items,
          totalAmount: order.totalAmount,
          orderStatus: newStatus,
          paymentStatus: order.paymentStatus,
        }),
      });
      const data = await res.json();

      if (res.ok && data?.success) {
        setOrders((prev) => prev.map((o) => (o._id === order._id ? { ...o, orderStatus: newStatus } : o)));
        showToast(
          newStatus === 'Served'
            ? 'Order marked as served.'
            : newStatus === 'Completed'
            ? 'Order marked as completed.'
            : 'Order voided.',
          'success'
        );
      } else {
        showToast(data?.message || 'Failed to update order.', 'error');
      }
    } catch (err) {
      console.error('🔴 Order update failed:', err);
      showToast('Could not reach the server. Please try again.', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  // Void needs a second tap within 4 seconds, so orders aren't voided by accident
  const handleVoidClick = (order: Order) => {
    if (voidArmedId === order._id) {
      updateOrderStatus(order, 'Cancelled');
      return;
    }
    setVoidArmedId(order._id);
    if (voidTimer.current) window.clearTimeout(voidTimer.current);
    voidTimer.current = window.setTimeout(() => setVoidArmedId(null), 4000);
  };

  // ==========================================
  // FETCH MENU (only when edit modal opens)
  // ==========================================
  const fetchMenu = async () => {
    setMenuLoading(true);
    setMenuError('');
    try {
      const url = restaurantId ? `${MENU_URL}?restaurantId=${encodeURIComponent(restaurantId)}` : MENU_URL;
      const res = await fetch(url);
      const result = await res.json();
      if (!res.ok || result.success === false) {
        throw new Error(result.message || 'Failed to load menu.');
      }
      const rawData = Array.isArray(result) ? result : result.data || result.items || [];
      setMenuItems(rawData.map(mapRawToMenuItem));
    } catch (err: any) {
      setMenuError(err.message || 'Could not connect to the server.');
    } finally {
      setMenuLoading(false);
    }
  };

  // ==========================================
  // OPEN / CLOSE EDIT MODAL
  // ==========================================
  const openEditModal = (order: Order) => {
    setEditingOrder(order);
    setEditCart(
      (order.items || []).map((item, idx) => ({
        lineKey: `existing-${idx}-${item.itemName}`,
        menuItemId: null,
        name: item.itemName,
        description: item.description || '',
        category: '',
        unitPrice: Number(item.itemPrice) || 0,
        quantity: Number(item.quantity) || 1,
        origQty: Number(item.quantity) || 1,
      }))
    );
    setEditNote(order.orderNote || '');
    setMenuSearch('');
    setMenuCategory('All');
    setEditTab('menu');
    setEditConfirmChecked(false);
    setShowEditConfirm(false);
    fetchMenu();
  };

  const closeEditModal = () => {
    if (isSavingEdit) return;
    setEditingOrder(null);
    setEditCart([]);
    setEditNote('');
    setShowEditConfirm(false);
    setEditConfirmChecked(false);
  };

  // Escape closes the top-most modal
  useEffect(() => {
    if (!editingOrder) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isSavingEdit) return;
      if (showEditConfirm) setShowEditConfirm(false);
      else closeEditModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingOrder, showEditConfirm, isSavingEdit]);

  // ==========================================
  // EDIT: DERIVED MENU DATA
  // ==========================================
  const menuByName = useMemo(() => {
    const map: Record<string, MenuItem> = {};
    menuItems.forEach((m) => (map[m.name.toLowerCase()] = m));
    return map;
  }, [menuItems]);

  const menuCategories = useMemo(() => {
    const counts: Record<string, number> = {};
    menuItems.forEach((m) => (counts[m.category] = (counts[m.category] || 0) + 1));
    return counts;
  }, [menuItems]);

  const filteredEditMenu = useMemo(() => {
    let result = menuItems;
    const q = menuSearch.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q)
      );
    }
    if (menuCategory !== 'All') result = result.filter((m) => m.category === menuCategory);

    const sorted = [...result];
    if (menuSort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (menuSort === 'priceAsc') sorted.sort((a, b) => a.price - b.price);
    else sorted.sort((a, b) => b.price - a.price);
    return sorted.sort((a, b) => Number(b.available) - Number(a.available));
  }, [menuItems, menuSearch, menuCategory, menuSort]);

  // A menu item matches a cart line by id, or by name for lines already on the order
  const findLineFor = (item: MenuItem, lines: EditLine[]) =>
    lines.findIndex(
      (l) => l.menuItemId === item.id || (!l.menuItemId && l.name.toLowerCase() === item.name.toLowerCase())
    );

  const lineCategory = (line: EditLine) => line.category || menuByName[line.name.toLowerCase()]?.category || 'Other';

  // ==========================================
  // EDIT: CART OPERATIONS
  // ==========================================
  const addMenuItemToEditCart = (item: MenuItem) => {
    if (!item.available) return;
    setEditCart((prev) => {
      const idx = findLineFor(item, prev);
      if (idx > -1) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], menuItemId: item.id, quantity: updated[idx].quantity + 1 };
        return updated;
      }
      return [
        ...prev,
        {
          lineKey: `new-${item.id}`,
          menuItemId: item.id,
          name: item.name,
          description: item.description,
          category: item.category,
          unitPrice: item.price,
          quantity: 1,
          origQty: 0,
        },
      ];
    });
  };

  const updateEditQuantity = (lineKey: string, delta: number) => {
    setEditCart((prev) =>
      prev
        .map((line) => (line.lineKey === lineKey ? { ...line, quantity: line.quantity + delta } : line))
        .filter((line) => line.quantity > 0)
    );
  };

  const removeEditLine = (lineKey: string) => {
    setEditCart((prev) => prev.filter((line) => line.lineKey !== lineKey));
  };

  const editCartTotal = editCart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const editItemsCount = editCart.reduce((sum, line) => sum + line.quantity, 0);
  const originalTotal = Number(editingOrder?.totalAmount) || 0;
  const totalDiff = editCartTotal - originalTotal;

  const removedLines = useMemo(() => {
    if (!editingOrder) return [];
    const kept = new Set(editCart.map((l) => l.lineKey));
    return (editingOrder.items || [])
      .map((item, idx) => ({ key: `existing-${idx}-${item.itemName}`, item }))
      .filter(({ key }) => !kept.has(key));
  }, [editCart, editingOrder]);

  const handleReviewEdit = () => {
    if (editCart.length === 0) {
      showToast('Order must have at least one item.', 'error');
      return;
    }
    setEditConfirmChecked(false);
    setShowEditConfirm(true);
  };

  // ==========================================
  // SAVE EDIT
  // ==========================================
  const saveEditedOrder = async () => {
    if (!editingOrder) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch(`${ORDERS_URL}/${editingOrder._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: editingOrder.restaurantId,
          customerName: editingOrder.customerName,
          tableNumber: editingOrder.tableNumber,
          orderNote: editNote.trim(),
          items: editCart.map((line) => ({
            itemName: line.name,
            description: line.description,
            itemPrice: line.unitPrice,
            quantity: line.quantity,
          })),
          totalAmount: editCartTotal,
          orderStatus: editingOrder.orderStatus,
          paymentStatus: editingOrder.paymentStatus,
        }),
      });
      const data = await res.json();

      if (res.ok && data?.success) {
        setOrders((prev) => prev.map((o) => (o._id === editingOrder._id ? data.data : o)));
        showToast('Order updated successfully.', 'success');
        setEditingOrder(null);
        setEditCart([]);
        setEditNote('');
        setShowEditConfirm(false);
        setEditConfirmChecked(false);
      } else {
        showToast(data?.message || 'Failed to update order.', 'error');
      }
    } catch (err) {
      console.error('🔴 Order edit failed:', err);
      showToast('Could not reach the server. Please try again.', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // ==========================================
  // FILTER + SEARCH + STATS
  // ==========================================
  const filteredOrders = useMemo(() => {
    let list = [...orders];
    if (filterStatus !== 'All') list = list.filter((o) => o.orderStatus === filterStatus);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (o) =>
          o.customerName?.toLowerCase().includes(q) ||
          String(o.tableNumber ?? '').toLowerCase().includes(q) ||
          ticketNumber(o).toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, filterStatus, searchQuery]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { All: orders.length };
    orders.forEach((o) => {
      counts[o.orderStatus] = (counts[o.orderStatus] || 0) + 1;
    });
    return counts;
  }, [orders]);

  const stats = useMemo(() => {
    const active = orders.filter((o) => !FINISHED_STATUSES.includes(o.orderStatus));
    const unpaidValue = orders
      .filter((o) => o.paymentStatus === 'Unpaid' && o.orderStatus !== 'Cancelled')
      .reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
    return { active: active.length, unpaidValue };
  }, [orders]);

  const filterTabs = ['All', 'Pending', 'Preparing', 'Ready', 'Served', 'Completed', 'Cancelled'];

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <div className="relative space-y-6" id="orders-page-root">
      <style>{`
        @keyframes op-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes op-pop { from { opacity: 0; transform: scale(.97) translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes op-toast { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: none; } }
        @keyframes op-card { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes op-bump { 0% { transform: scale(1); } 40% { transform: scale(1.12); } 100% { transform: scale(1); } }
        .op-fade { animation: op-fade .2s ease-out; }
        .op-pop { animation: op-pop .25s cubic-bezier(.22,1,.36,1); }
        .op-toast { animation: op-toast .25s cubic-bezier(.22,1,.36,1); }
        .op-card { animation: op-card .4s cubic-bezier(.22,1,.36,1) both; }
        .op-bump { animation: op-bump .25s ease-out; }
        .op-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .op-scroll::-webkit-scrollbar-thumb { background: #e9d5ff; border-radius: 999px; }
        @media (prefers-reduced-motion: reduce) { .op-fade, .op-pop, .op-toast, .op-card, .op-bump { animation: none; } }
      `}</style>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={`op-toast fixed right-5 top-5 z-[70] flex max-w-sm items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-2xl ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {toast.message}
        </div>
      )}

      {/* ============ HEADER ============ */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 via-violet-600 to-indigo-600 text-white shadow-lg shadow-purple-500/30">
            <ClipboardList className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
           <h2 className="text-2xl font-black tracking-tight text-slate-900">{tr('Orders', 'अर्डरहरू')}</h2>
            <p className="text-sm text-slate-500">
              {stats.active > 0
                ? `${stats.active} order${stats.active === 1 ? '' : 's'} in progress right now`
                : 'No orders in progress right now'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tr('Search customer, table or ticket #', 'ग्राहक, टेबल वा टिकट नम्बर खोज्नुहोस्')}
              aria-label="Search orders"
              className={`${inputBase} bg-white pl-10 pr-9`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className={`absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer rounded text-slate-400 hover:text-slate-700 ${FOCUS}`}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => fetchOrders(true)}
            disabled={isRefreshing}
            aria-label="Refresh orders"
            title="Refresh"
            className={`flex h-[42px] shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-purple-100 bg-white px-3.5 text-sm font-semibold text-purple-700 shadow-sm transition-all hover:bg-purple-50 active:scale-[0.97] disabled:opacity-60 ${FOCUS}`}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* ============ STATS ============ */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Flame}
          label="In progress"
          value={loading ? '–' : stats.active}
          tone="bg-purple-50 text-purple-600"
          hint="Pending, preparing or ready"
        />
        <StatCard
          icon={Clock}
          label="Pending"
          value={loading ? '–' : statusCounts.Pending || 0}
          tone="bg-amber-50 text-amber-600"
          hint="Waiting for the kitchen"
        />
        <StatCard
          icon={BellRing}
          label="Ready to serve"
          value={loading ? '–' : statusCounts.Ready || 0}
          tone="bg-violet-50 text-violet-600"
          hint="Take these to the table"
        />
        <StatCard
          icon={Wallet}
          label="Unpaid value"
          value={loading ? '–' : formatNPR(stats.unpaidValue)}
          tone="bg-emerald-50 text-emerald-600"
          hint="Excludes voided orders"
        />
      </div>

      {/* ============ STATUS TABS ============ */}
      <div
        role="tablist"
        aria-label="Filter by status"
        className="op-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {filterTabs.map((tab) => {
          const active = filterStatus === tab;
          const count = statusCounts[tab] || 0;
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={active}
              onClick={() => setFilterStatus(tab)}
              className={`inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition-all active:scale-[0.97] ${FOCUS} ${
                active
                  ? 'border-transparent bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-md shadow-purple-500/25'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-purple-300 hover:text-purple-700'
              }`}
            >
              {tab !== 'All' && (
                <span className={`h-2 w-2 rounded-full ${active ? 'bg-white' : getStatus(tab).tab}`} aria-hidden="true" />
              )}
              {tab === 'All' ? 'All orders' : tab}
              <span
                className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                  active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ============ ORDER LIST ============ */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonOrderCard key={i} />
          ))}
        </div>
      ) : error ? (
        <div className={`${CARD} flex flex-col items-center px-6 py-16 text-center`}>
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
            <PackageX className="h-7 w-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Orders couldn't be loaded</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-500">{error}</p>
          <button
            onClick={() => fetchOrders()}
            className={`mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-purple-500/25 transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] ${FOCUS}`}
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-purple-200/70 bg-white/60 px-6 py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-50 text-purple-500">
            {orders.length === 0 ? <Receipt className="h-8 w-8" /> : <Search className="h-8 w-8" />}
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            {orders.length === 0 ? 'No orders yet' : 'No orders match'}
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            {orders.length === 0
              ? 'New orders appear here as soon as they are placed.'
              : 'Try another name, table or status.'}
          </p>
          {orders.length > 0 && (
            <button
              onClick={() => {
                setSearchQuery('');
                setFilterStatus('All');
              }}
              className={`mt-5 cursor-pointer rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-700 active:scale-[0.98] ${FOCUS}`}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {filteredOrders.map((order, i) => {
            const isActive = !FINISHED_STATUSES.includes(order.orderStatus);
            const isUpdating = updatingId === order._id;
            const meta = getStatus(order.orderStatus);
            const StatusIcon = meta.icon;
            const mins = minutesSince(order.createdAt, now);
            const waitingLong = isActive && mins !== null && mins >= 20;
            const itemCount = (order.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
            const armed = voidArmedId === order._id;

            return (
              <article
                key={order._id}
                className={`op-card group relative flex flex-col overflow-hidden ${CARD} transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-purple-500/10 ${
                  !isActive ? 'opacity-90' : ''
                }`}
                style={{ animationDelay: `${Math.min(i, 9) * 35}ms` }}
                aria-label={`Order for ${order.customerName}, table ${order.tableNumber}, ${order.orderStatus}`}
              >
                {/* Top colour accent */}
                <div className={`h-1 w-full bg-gradient-to-r ${meta.bar}`} aria-hidden="true" />

                <div className="flex flex-1 flex-col p-5">
                  {/* Header */}
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 min-w-[48px] shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 px-2 ring-1 ring-inset ring-purple-100">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-purple-400">Table</span>
                      <span className="max-w-[64px] truncate text-sm font-black leading-tight text-purple-700">
                        {order.tableNumber}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-bold text-slate-900">{order.customerName}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                        <span className="font-mono font-semibold">#{ticketNumber(order)}</span>
                        {mins !== null && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className={`inline-flex items-center gap-1 ${waitingLong ? 'font-bold text-amber-600' : ''}`}>
                              <Timer className="h-3 w-3" aria-hidden="true" />
                              {formatWait(mins, order.createdAt)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <StatusPill status={order.orderStatus} />
                  </div>

                  {/* Progress */}
                  <div className="mt-4">
                    <ProgressTrack status={order.orderStatus} />
                    <div className="mt-1.5 flex justify-between text-[10px] font-semibold text-slate-400">
                      {PROGRESS_STEPS.map((s) => (
                        <span key={s} className={s === order.orderStatus ? 'text-slate-700' : ''}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  {waitingLong && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      Waiting over 20 minutes. Check on this table.
                    </div>
                  )}

                  {/* Items */}
                  <div className="mt-4 rounded-xl bg-slate-50/80 p-3 ring-1 ring-inset ring-slate-100">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Items</span>
                      <span className="font-mono text-[10px] font-bold text-slate-500">{itemCount} total</span>
                    </div>
                    <ul className="op-scroll max-h-36 space-y-1.5 overflow-y-auto pr-1">
                      {(order.items || []).map((item, idx) => (
                        <li key={idx} className="flex items-center justify-between gap-2 text-[13px]">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="flex h-5 min-w-[22px] items-center justify-center rounded-md bg-white px-1 font-mono text-[10px] font-bold text-purple-700 ring-1 ring-inset ring-purple-100">
                              {item.quantity}×
                            </span>
                            <span className="truncate font-medium text-slate-800">{item.itemName}</span>
                          </span>
                          <span className="shrink-0 font-mono text-xs text-slate-500">
                            {(Number(item.itemPrice) * Number(item.quantity)).toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {order.orderNote && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50/70 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-100">
                      <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                      <span>{order.orderNote}</span>
                    </div>
                  )}

                  {/* Total + payment */}
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${
                        PAYMENT_STYLES[order.paymentStatus] || PAYMENT_STYLES.Unpaid
                      }`}
                    >
                      {order.paymentStatus}
                    </span>
                    <span className="font-mono text-lg font-bold tabular-nums text-purple-700">
                      {formatNPR(order.totalAmount)}
                    </span>
                  </div>

                  {/* Actions */}
                  {isActive ? (
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => updateOrderStatus(order, 'Served')}
                        disabled={isUpdating}
                        className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 py-2.5 text-xs font-bold text-white shadow-md shadow-purple-500/20 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-500/30 active:scale-[0.98] disabled:translate-y-0 disabled:cursor-wait disabled:opacity-60 ${FOCUS}`}
                      >
                        {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                       {tr('Mark served', 'सर्भ भयो')}
                      </button>
                      <button
                        onClick={() => openEditModal(order)}
                        disabled={isUpdating}
                        aria-label={`Edit order for ${order.customerName}`}
                        title="Add items or edit order"
                        className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-purple-100 bg-purple-50 px-3.5 text-xs font-bold text-purple-700 transition-all hover:bg-purple-100 active:scale-[0.97] disabled:opacity-50 ${FOCUS}`}
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="hidden sm:inline">Edit</span>
                      </button>
                      <button
                        onClick={() => handleVoidClick(order)}
                        disabled={isUpdating}
                        aria-label={armed ? 'Tap again to confirm void' : `Void order for ${order.customerName}`}
                        className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition-all active:scale-[0.97] disabled:opacity-50 outline-none focus-visible:ring-4 focus-visible:ring-rose-500/20 ${
                          armed
                            ? 'bg-rose-600 text-white shadow-md shadow-rose-500/30'
                            : 'border border-rose-100 bg-white text-rose-600 hover:bg-rose-50'
                        }`}
                      >
                        <XCircle className="h-4 w-4" />
                        {armed ? 'Confirm?' : <span className="hidden sm:inline">Void</span>}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5">
                      <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <StatusIcon className="h-4 w-4" aria-hidden="true" />
                        {FINISHED_LABELS[order.orderStatus] || 'Order finished'}
                      </span>
                      {order.orderStatus !== 'Cancelled' && (
                        <button
                          onClick={() => openEditModal(order)}
                          aria-label={`Edit order for ${order.customerName}`}
                          className={`inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-purple-700 transition hover:bg-purple-100 ${FOCUS}`}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ==========================================
          EDIT ORDER MODAL (same layout as Create Order)
      ========================================== */}
      {editingOrder && mounted && createPortal(
        <div
          className="op-fade fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2 backdrop-blur-[3px] sm:p-4"
          onClick={closeEditModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-order-title"
            onClick={(e) => e.stopPropagation()}
            className="op-pop flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-purple-100 bg-[#fbfaff] shadow-2xl shadow-purple-900/20"
          >
            {/* Modal header */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-purple-100 bg-gradient-to-r from-purple-50 via-white to-white px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-500/30">
                  <Pencil className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 id="edit-order-title" className="truncate text-lg font-bold tracking-tight text-slate-900">
                    Edit order · {editingOrder.customerName}
                  </h2>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    <span className="font-mono font-semibold">#{ticketNumber(editingOrder)}</span>
                    <span aria-hidden="true">·</span>
                    <span>Table {editingOrder.tableNumber}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-flex">
                  <StatusPill status={editingOrder.orderStatus} />
                </span>
                <button
                  onClick={closeEditModal}
                  disabled={isSavingEdit}
                  aria-label="Close edit window"
                  className={`cursor-pointer rounded-xl p-2 text-slate-400 transition-colors hover:bg-white hover:text-slate-900 ${FOCUS}`}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Mobile tab switch */}
            <div className="flex shrink-0 gap-1 border-b border-purple-100 bg-white p-2 lg:hidden" role="tablist">
              {([
                ['menu', 'Menu', Utensils],
                ['order', `Order (${editItemsCount})`, ShoppingCart],
              ] as const).map(([key, label, Icon]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={editTab === key}
                  onClick={() => setEditTab(key)}
                  className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl py-2 text-sm font-bold transition-all ${FOCUS} ${
                    editTab === key ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 hover:bg-purple-50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-3 sm:p-5 lg:grid-cols-12">
              {/* ============ LEFT: ORDER PANEL ============ */}
              <div className={`min-h-0 lg:col-span-5 ${editTab === 'order' ? 'flex' : 'hidden'} lg:flex`}>
                <div className={`${CARD} flex min-h-0 w-full flex-col`}>
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <ShoppingCart className="h-5 w-5 text-purple-600" aria-hidden="true" />
                      <h3 className="text-base font-bold text-slate-900">Order items</h3>
                    </div>
                    <span
                      key={editItemsCount}
                      className="op-bump rounded-full bg-purple-50 px-3 py-1 font-mono text-xs font-bold text-purple-700 ring-1 ring-inset ring-purple-100"
                    >
                      {editItemsCount} {editItemsCount === 1 ? 'item' : 'items'}
                    </span>
                  </div>

                  <div className="op-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                    {/* Read-only customer/table */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-100">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Customer</p>
                        <p className="mt-0.5 truncate text-sm font-bold text-slate-900">{editingOrder.customerName}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-100">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Table</p>
                        <p className="mt-0.5 truncate text-sm font-bold text-slate-900">{editingOrder.tableNumber}</p>
                      </div>
                    </div>

                    {/* Note */}
                    <div className="space-y-1.5">
                      <label htmlFor="edit-note" className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                        <StickyNote className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" /> Order note
                        <span className="font-medium text-slate-400">(optional)</span>
                      </label>
                      <textarea
                        id="edit-note"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        placeholder="No onions, extra spicy, allergy notes..."
                        rows={2}
                        className={`${inputBase} resize-none`}
                      />
                    </div>

                    {/* Cart */}
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-600">Items on this order</h4>
                        {editCart.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setEditCart([])}
                            className={`cursor-pointer rounded text-[11px] font-semibold text-slate-400 hover:text-rose-600 ${FOCUS}`}
                          >
                            Remove all
                          </button>
                        )}
                      </div>

                      <div className="space-y-2">
                        {editCart.length === 0 ? (
                          <div className="rounded-2xl border-2 border-dashed border-slate-200 py-8 text-center">
                            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-400">
                              <ShoppingCart className="h-6 w-6" />
                            </div>
                            <p className="text-sm font-semibold text-slate-700">No items on this order</p>
                            <p className="text-xs text-slate-400">Add at least one item from the menu to save.</p>
                          </div>
                        ) : (
                          editCart.map((line) => {
                            const cat = getCat(lineCategory(line));
                            const isNew = line.origQty === 0;
                            const changed = !isNew && line.quantity !== line.origQty;
                            return (
                              <div
                                key={line.lineKey}
                                className={`op-card flex items-center gap-3 rounded-xl border bg-white p-2.5 ${
                                  isNew ? 'border-emerald-200 ring-1 ring-emerald-100' : 'border-slate-200/80'
                                }`}
                              >
                                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl ring-1 ring-inset ${cat.tile}`}>
                                  {cat.emoji}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="flex items-center gap-1.5 truncate text-sm font-bold text-slate-900">
                                    <span className="truncate">{line.name}</span>
                                    {isNew && (
                                      <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700 ring-1 ring-inset ring-emerald-200">
                                        New
                                      </span>
                                    )}
                                  </p>
                                  <p className="font-mono text-[11px] font-semibold text-slate-400">
                                    {formatNPR(line.unitPrice)} each
                                    {changed && <span className="ml-1.5 text-amber-600">(was {line.origQty})</span>}
                                  </p>
                                </div>
                                <div className="flex flex-col items-end gap-1.5">
                                  <QtyStepper
                                    small
                                    qty={line.quantity}
                                    onMinus={() => updateEditQuantity(line.lineKey, -1)}
                                    onPlus={() => updateEditQuantity(line.lineKey, 1)}
                                  />
                                  <span className="font-mono text-xs font-bold tabular-nums text-slate-900">
                                    {formatNPR(line.unitPrice * line.quantity)}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeEditLine(line.lineKey)}
                                  aria-label={`Remove ${line.name}`}
                                  className={`cursor-pointer rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500 ${FOCUS}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Total + CTA */}
                  <div className="space-y-3 border-t border-slate-100 bg-white px-5 py-4">
                    <div className="flex items-end justify-between">
                      <div>
                        <span className="text-sm font-semibold text-slate-500">New total</span>
                        {totalDiff !== 0 && (
                          <p className={`font-mono text-[11px] font-bold ${totalDiff > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {totalDiff > 0 ? '+' : '−'}
                            {formatNPR(Math.abs(totalDiff))} vs original
                          </p>
                        )}
                      </div>
                      <span className="font-mono text-2xl font-bold tabular-nums tracking-tight text-purple-700">
                        {formatNPR(editCartTotal)}
                      </span>
                    </div>
                    <button
                      onClick={handleReviewEdit}
                      disabled={editCart.length === 0 || isSavingEdit}
                      className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 py-3.5 text-sm font-bold text-white shadow-md shadow-purple-500/30 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-500/40 active:scale-[0.99] disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none ${FOCUS}`}
                    >
                      <CheckCircle className="h-4 w-4" />
                      Review changes
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* ============ RIGHT: MENU ============ */}
              <div className={`min-h-0 lg:col-span-7 ${editTab === 'menu' ? 'flex' : 'hidden'} lg:flex`}>
                <div className={`${CARD} flex min-h-0 w-full flex-col`}>
                  <div className="space-y-4 border-b border-slate-100 p-4 sm:p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold tracking-tight text-slate-900">Menu</h3>
                        <p className="text-xs text-slate-500">Tap an item to add it to this order.</p>
                      </div>
                      <div className="inline-flex rounded-xl bg-slate-100 p-1">
                        {([
                          ['grid', LayoutGrid, 'Card view'],
                          ['table', List, 'Table view'],
                        ] as const).map(([key, Icon, label]) => (
                          <button
                            key={key}
                            onClick={() => setMenuView(key)}
                            aria-label={label}
                            aria-pressed={menuView === key}
                            title={label}
                            className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${FOCUS} ${
                              menuView === key ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-purple-700'
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                            <span className="hidden sm:inline">{key === 'grid' ? 'Cards' : 'Table'}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <div className="relative flex-1">
                        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <input
                          type="text"
                          value={menuSearch}
                          onChange={(e) => setMenuSearch(e.target.value)}
                          placeholder="Search by name, category or description"
                          aria-label="Search menu"
                          className={`${inputBase} pl-10 pr-9`}
                        />
                        {menuSearch && (
                          <button
                            onClick={() => setMenuSearch('')}
                            aria-label="Clear search"
                            className={`absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer rounded text-slate-400 hover:text-slate-700 ${FOCUS}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <select
                        value={menuSort}
                        onChange={(e) => setMenuSort(e.target.value as SortKey)}
                        aria-label="Sort menu"
                        className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/15"
                      >
                        <option value="name">Sort: Name (A–Z)</option>
                        <option value="priceAsc">Price: Low to High</option>
                        <option value="priceDesc">Price: High to Low</option>
                      </select>
                    </div>

                    <div className="op-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                      {['All', ...Object.keys(menuCategories)].map((cat) => {
                        const active = menuCategory === cat;
                        const count = cat === 'All' ? menuItems.length : menuCategories[cat];
                        return (
                          <button
                            key={cat}
                            onClick={() => setMenuCategory(cat)}
                            aria-pressed={active}
                            className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all ${FOCUS} ${
                              active
                                ? 'border-purple-600 bg-purple-600 text-white shadow-md shadow-purple-500/25'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-purple-300 hover:text-purple-700'
                            }`}
                          >
                            {cat !== 'All' && <span>{getCat(cat).emoji}</span>}
                            {cat === 'All' ? 'All items' : cat}
                            <span className={`rounded-full px-1.5 text-[10px] ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="op-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                    {menuLoading ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={i} className="space-y-3 rounded-2xl border border-slate-100 p-4">
                            <div className="flex gap-3">
                              <Skeleton className="h-12 w-12 rounded-xl" />
                              <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-2/3" />
                                <Skeleton className="h-3 w-full" />
                              </div>
                            </div>
                            <Skeleton className="h-8 w-full rounded-lg" />
                          </div>
                        ))}
                      </div>
                    ) : menuError ? (
                      <div className="flex flex-col items-center py-14 text-center text-rose-500">
                        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50">
                          <PackageX className="h-7 w-7" />
                        </div>
                        <p className="max-w-sm text-sm font-medium">{menuError}</p>
                        <button
                          onClick={fetchMenu}
                          className={`mt-3 cursor-pointer rounded-lg bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-700 ${FOCUS}`}
                        >
                          Retry
                        </button>
                      </div>
                    ) : filteredEditMenu.length === 0 ? (
                      <div className="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-14 text-center">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-50 text-purple-500">
                          {menuItems.length === 0 ? <Utensils className="h-7 w-7" /> : <Search className="h-7 w-7" />}
                        </div>
                        <h4 className="text-base font-bold text-slate-900">
                          {menuItems.length === 0 ? 'No menu items yet' : 'No items match'}
                        </h4>
                        <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">
                          {menuItems.length === 0
                            ? 'Add items in the Menu tab and they will show up here.'
                            : 'Try a different search or pick another category.'}
                        </p>
                        {menuItems.length > 0 && (
                          <button
                            onClick={() => {
                              setMenuSearch('');
                              setMenuCategory('All');
                            }}
                            className={`mt-4 cursor-pointer rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 ${FOCUS}`}
                          >
                            Clear filters
                          </button>
                        )}
                      </div>
                    ) : menuView === 'grid' ? (
                      /* ---- CARD VIEW ---- */
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {filteredEditMenu.map((item, i) => {
                          const cat = getCat(item.category);
                          const lineIdx = findLineFor(item, editCart);
                          const line = lineIdx > -1 ? editCart[lineIdx] : null;
                          const qty = line?.quantity || 0;
                          return (
                            <div
                              key={item.id}
                              onClick={() => addMenuItemToEditCart(item)}
                              role="button"
                              tabIndex={item.available ? 0 : -1}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  addMenuItemToEditCart(item);
                                }
                              }}
                              aria-disabled={!item.available}
                              aria-label={`Add ${item.name}`}
                              className={`op-card group flex flex-col justify-between rounded-2xl border p-4 outline-none transition-all focus-visible:ring-4 focus-visible:ring-purple-200 ${
                                !item.available
                                  ? 'cursor-not-allowed border-slate-200 bg-slate-50'
                                  : qty > 0
                                  ? 'cursor-pointer border-purple-400 bg-purple-50/40 ring-2 ring-purple-200'
                                  : 'cursor-pointer border-slate-200/80 bg-white hover:-translate-y-0.5 hover:border-purple-200 hover:shadow-[0_8px_24px_rgba(109,40,217,0.10)]'
                              }`}
                              style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl ring-1 ring-inset ${cat.tile} ${
                                    !item.available ? 'opacity-50 grayscale' : ''
                                  }`}
                                >
                                  {cat.emoji}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h4 className={`truncate text-[15px] font-bold ${item.available ? 'text-slate-900' : 'text-slate-400'}`}>
                                    {item.name}
                                  </h4>
                                  <p className="mt-0.5 line-clamp-2 min-h-[2rem] text-xs leading-relaxed text-slate-500">
                                    {item.description || 'No description'}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                                <span className={`font-mono text-base font-bold tabular-nums ${item.available ? 'text-purple-700' : 'text-slate-400'}`}>
                                  {formatNPR(item.price)}
                                </span>
                                {!item.available ? (
                                  <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 ring-1 ring-inset ring-rose-600/15">
                                    {item.status}
                                  </span>
                                ) : line ? (
                                  <QtyStepper
                                    qty={qty}
                                    onMinus={() => updateEditQuantity(line.lineKey, -1)}
                                    onPlus={() => addMenuItemToEditCart(item)}
                                  />
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition group-hover:bg-purple-700">
                                    <Plus className="h-3.5 w-3.5" /> Add
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* ---- TABLE VIEW ---- */
                      <div className="overflow-x-auto rounded-xl border border-slate-100">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                              <th scope="col" className="sticky top-0 bg-slate-50 px-4 py-3">Item</th>
                              <th scope="col" className="sticky top-0 hidden bg-slate-50 px-4 py-3 sm:table-cell">Category</th>
                              <th scope="col" className="sticky top-0 bg-slate-50 px-4 py-3 text-right">Price</th>
                              <th scope="col" className="sticky top-0 bg-slate-50 px-4 py-3 text-center">Order</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {filteredEditMenu.map((item) => {
                              const cat = getCat(item.category);
                              const lineIdx = findLineFor(item, editCart);
                              const line = lineIdx > -1 ? editCart[lineIdx] : null;
                              const qty = line?.quantity || 0;
                              return (
                                <tr
                                  key={item.id}
                                  onClick={() => addMenuItemToEditCart(item)}
                                  className={`transition-colors ${
                                    !item.available
                                      ? 'cursor-not-allowed bg-slate-50/70'
                                      : qty > 0
                                      ? 'cursor-pointer bg-purple-50/50'
                                      : 'cursor-pointer hover:bg-purple-50/40'
                                  }`}
                                >
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                      <span
                                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg ring-1 ring-inset ${cat.tile} ${
                                          !item.available ? 'opacity-50 grayscale' : ''
                                        }`}
                                      >
                                        {cat.emoji}
                                      </span>
                                      <div className="min-w-0">
                                        <p className={`font-semibold ${item.available ? 'text-slate-900' : 'text-slate-400'}`}>{item.name}</p>
                                        <p className="max-w-[220px] truncate text-[11px] text-slate-400">{item.description}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="hidden px-4 py-3 sm:table-cell">
                                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${cat.chip}`}>
                                      {item.category}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-slate-900">
                                    {formatNPR(item.price)}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    {!item.available ? (
                                      <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 ring-1 ring-inset ring-rose-600/15">
                                        {item.status}
                                      </span>
                                    ) : line ? (
                                      <QtyStepper
                                        small
                                        qty={qty}
                                        onMinus={() => updateEditQuantity(line.lineKey, -1)}
                                        onPlus={() => addMenuItemToEditCart(item)}
                                      />
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          addMenuItemToEditCart(item);
                                        }}
                                        className={`inline-flex cursor-pointer items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-purple-700 ${FOCUS}`}
                                      >
                                        <Plus className="h-3.5 w-3.5" /> Add
                                      </button>
                                    )}
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
              </div>
            </div>

            {/* Mobile bottom bar (menu tab) */}
            {editTab === 'menu' && editCart.length > 0 && (
              <button
                onClick={() => setEditTab('order')}
                className="op-pop mx-3 mb-3 flex shrink-0 cursor-pointer items-center justify-between rounded-2xl bg-gradient-to-r from-purple-600 to-violet-600 px-5 py-3.5 text-white shadow-xl shadow-purple-600/30 lg:hidden"
              >
                <span className="flex items-center gap-2 text-sm font-bold">
                  <ShoppingCart className="h-4 w-4" />
                  View order · {editItemsCount} {editItemsCount === 1 ? 'item' : 'items'}
                </span>
                <span className="font-mono text-sm font-bold">{formatNPR(editCartTotal)}</span>
              </button>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ==========================================
          EDIT CONFIRMATION SUB-MODAL
      ========================================== */}
      {showEditConfirm && editingOrder && mounted && createPortal(
        <div
          className="op-fade fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[3px]"
          onClick={() => !isSavingEdit && setShowEditConfirm(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-edit-title"
            onClick={(e) => e.stopPropagation()}
            className="op-pop flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-purple-100 bg-gradient-to-r from-purple-50 to-white px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-violet-600 text-white shadow-md shadow-purple-500/30">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <h3 id="confirm-edit-title" className="text-base font-bold text-slate-900">Confirm order update</h3>
                  <p className="text-xs text-slate-500">Check the changes before saving.</p>
                </div>
              </div>
              <button
                onClick={() => setShowEditConfirm(false)}
                disabled={isSavingEdit}
                aria-label="Close"
                className={`cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-900 ${FOCUS}`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="op-scroll flex-1 space-y-4 overflow-y-auto px-6 py-5 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] font-semibold text-slate-400">Customer</p>
                  <p className="mt-0.5 truncate font-bold text-slate-900">{editingOrder.customerName}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] font-semibold text-slate-400">Table</p>
                  <p className="mt-0.5 truncate font-bold text-slate-900">{editingOrder.tableNumber}</p>
                </div>
              </div>

              {editNote.trim() && (
                <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-xs text-amber-900">
                  <span className="font-bold">Note: </span>
                  {editNote.trim()}
                </div>
              )}

              <div className="max-h-52 space-y-2 overflow-y-auto border-t border-slate-100 pt-3">
                {editCart.map((line) => {
                  const isNew = line.origQty === 0;
                  const changed = !isNew && line.quantity !== line.origQty;
                  return (
                    <div key={line.lineKey} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span>{getCat(lineCategory(line)).emoji}</span>
                        <span className="truncate font-medium text-slate-800">
                          {line.quantity} × {line.name}
                        </span>
                        {isNew && (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700">
                            New
                          </span>
                        )}
                        {changed && (
                          <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                            was {line.origQty}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-mono text-xs font-bold text-slate-900">
                        {formatNPR(line.unitPrice * line.quantity)}
                      </span>
                    </div>
                  );
                })}
                {removedLines.map(({ key, item }) => (
                  <div key={key} className="flex items-center justify-between gap-3 text-slate-400">
                    <span className="flex min-w-0 items-center gap-2">
                      <Trash2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate line-through">
                        {item.quantity} × {item.itemName}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] font-bold uppercase">Removed</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5 border-t border-slate-200 pt-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Original total</span>
                  <span className="font-mono">{formatNPR(originalTotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-bold text-slate-900">
                    New total
                    {totalDiff !== 0 && (
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                          totalDiff > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {totalDiff > 0 ? '+' : '−'}
                        {Math.abs(totalDiff).toFixed(2)}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 font-mono text-lg font-bold text-purple-700">
                    <ArrowRight className="h-4 w-4 text-slate-300" aria-hidden="true" />
                    {formatNPR(editCartTotal)}
                  </span>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <input
                  type="checkbox"
                  checked={editConfirmChecked}
                  onChange={(e) => setEditConfirmChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer accent-purple-600"
                />
                <span className="text-xs font-medium text-amber-900">
                  The updated items, customer name and table are correct. Save this order.
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 bg-white px-6 py-4">
              <button
                type="button"
                onClick={() => setShowEditConfirm(false)}
                disabled={isSavingEdit}
                className={`cursor-pointer rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50 ${FOCUS}`}
              >
                Go back
              </button>
              <button
                type="button"
                onClick={saveEditedOrder}
                disabled={!editConfirmChecked || isSavingEdit}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-purple-500/30 transition-all hover:shadow-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none ${FOCUS}`}
              >
                {isSavingEdit ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Save changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}