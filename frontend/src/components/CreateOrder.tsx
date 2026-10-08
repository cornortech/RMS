import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CheckCircle,
  CheckCircle2,
  X,
  AlertCircle,
  Loader2,
  PackageX,
  Utensils,
  UserCircle2,
  LayoutGrid,
  List,
  StickyNote,
  Users,
  ChevronRight,
  Armchair,
  ArrowLeftRight,
  Info,
  Check,
  History,
  Phone,
  MapPin,
} from 'lucide-react';
import MenuImage from './MenuImage';

// ==========================================
// CONFIG
// ==========================================

const API_BASE = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');
const MENU_URL = `${API_BASE}/api/menu`;
const ORDERS_URL = `${API_BASE}/api/orders`;
const TABLES_URL = `${API_BASE}/api/tables`;
const CUSTOMERS_URL = `${API_BASE}/api/customers`;

// Saved when an order is taken without a table / without a name
const NO_TABLE_LABEL = 'No Table';
const guestNameForTable = (tableName: string) => `Guest (${tableName})`;

// Retrieves the logged-in restaurant ID, the token, and WHICH STAFF MEMBER is logged in.
const getAuthDetails = () => {
  try {
    let token =
      localStorage.getItem('authToken') ||
      localStorage.getItem('token') ||
      localStorage.getItem('accessToken') ||
      localStorage.getItem('jwt') || '';

    const rawUser = localStorage.getItem('user');
    let restaurantId = '';

    if (rawUser) {
      const parsed = JSON.parse(rawUser);
      restaurantId = parsed?.id ? String(parsed.id) : '';
      if (!token && parsed.token) token = parsed.token;
    }

    const staffId = localStorage.getItem('staffId') || '';
    const staffRole = localStorage.getItem('staffRole') || '';

    return { restaurantId, token, staffId, staffRole };
  } catch {
    return { restaurantId: '', token: '', staffId: '', staffRole: '' };
  }
};

const getAuthHeaders = () => {
  const { token } = getAuthDetails();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// Same category look as MenuManager
const CATEGORY_META: Record<string, { emoji: string; tile: string; chip: string }> = {
  Appetizer: { emoji: '🥗', tile: 'bg-lime-50 ring-lime-100', chip: 'bg-lime-50 text-lime-700 ring-lime-200' },
  'Main Course': { emoji: '🍛', tile: 'bg-orange-50 ring-orange-100', chip: 'bg-orange-50 text-orange-700 ring-orange-200' },
  Dessert: { emoji: '🍰', tile: 'bg-pink-50 ring-pink-100', chip: 'bg-pink-50 text-pink-700 ring-pink-200' },
  Beverage: { emoji: '🥤', tile: 'bg-sky-50 ring-sky-100', chip: 'bg-sky-50 text-sky-700 ring-sky-200' },
  Side: { emoji: '🍟', tile: 'bg-amber-50 ring-amber-100', chip: 'bg-amber-50 text-amber-700 ring-amber-200' },
  Combo: { emoji: '🍱', tile: 'bg-fuchsia-50 ring-fuchsia-100', chip: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200' },
  Other: { emoji: '🍽️', tile: 'bg-slate-100 ring-slate-200', chip: 'bg-slate-100 text-slate-700 ring-slate-200' },
};
const getCat = (c: string) => CATEGORY_META[c] || CATEGORY_META.Other;

const TABLE_DOT: Record<string, string> = {
  Available: 'bg-emerald-500',
  Occupied: 'bg-rose-500',
  Reserved: 'bg-amber-500',
  'Out of Service': 'bg-slate-400',
};

const CARD =
  'rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]';

const inputBase =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-purple-500 focus:bg-white focus:ring-4 focus:ring-purple-500/10';

const formatNPR = (n: number) =>
  `NPR ${Number(n || 0).toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ==========================================
// TYPES + MAPPERS
// ==========================================

interface MenuItem {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  status: string;
  available: boolean;
  imageUrl: string;
}

interface TableItem {
  id: string;
  restaurantId: string;
  tableName: string;
  capacity: number;
  occupiedSeats: number;
  status: string;
}

interface CustomerItem {
  id: string;
  restaurantId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
}

interface CartLine {
  menuItemId: string;
  name: string;
  description: string;
  category: string;
  unitPrice: number;
  quantity: number;
}

type SortKey = 'name' | 'priceAsc' | 'priceDesc';
type OrderBy = 'table' | 'name';

const mapRawToMenuItem = (raw: any): MenuItem => {
  // Menu items use a "status" field (Available / Unavailable / Sold Out)
  const status = raw.status || (raw.available === false ? 'Unavailable' : 'Available');
  return {
    id: raw._id || raw.id,
    name: raw.itemName || raw.name || 'Unnamed Item',
    description: raw.description || '',
    category: raw.category || 'Other',
    price: Number(raw.price ?? raw.itemPrice) || 0,
    status,
    available: status === 'Available',
    imageUrl: raw.imageUrl || '',
  };
};

const mapRawToTable = (raw: any): TableItem => ({
  id: raw._id || raw.id,
  restaurantId: raw.restaurantId?._id || raw.restaurantId,
  tableName: raw.tableName || raw.name || 'Unnamed Table',
  capacity: Number(raw.capacity) || 0,
  occupiedSeats: Number(raw.occupiedSeats ?? 0),
  status: raw.status || 'Available',
});

const mapRawToCustomer = (raw: any): CustomerItem => ({
  id: raw._id || raw.id,
  restaurantId: String(raw.restaurantId?._id || raw.restaurantId || ''),
  customerName: String(raw.customerName || '').trim(),
  customerPhone: String(raw.customerPhone || '').trim(),
  customerAddress: String(raw.customerAddress || '').trim(),
});

const isTableFull = (t: TableItem) => t.capacity > 0 && t.occupiedSeats >= t.capacity;

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
        className={`${btn} flex cursor-pointer items-center justify-center rounded-lg bg-white text-purple-700 shadow-sm transition hover:bg-purple-600 hover:text-white active:scale-95`}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-[24px] text-center font-mono text-sm font-bold tabular-nums text-purple-900">{qty}</span>
      <button
        type="button"
        onClick={onPlus}
        aria-label="Increase quantity"
        className={`${btn} flex cursor-pointer items-center justify-center rounded-lg bg-purple-600 text-white shadow-sm transition hover:bg-purple-700 active:scale-95`}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ==========================================
// COMPONENT
// ==========================================

interface CreateOrderProps {
  onOrderCreated?: () => void;
}

export default function CreateOrder({ onOrderCreated }: CreateOrderProps) {
  const { restaurantId, staffId, staffRole } = getAuthDetails();

  // Menu
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [view, setView] = useState<'grid' | 'table'>('grid');

  // Tables
  const [tables, setTables] = useState<TableItem[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [tablesError, setTablesError] = useState('');

  // Saved customers (names saved for THIS restaurant)
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  // Order
  const [orderBy, setOrderBy] = useState<OrderBy>('table');
    const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderNote, setOrderNote] = useState('');

  // UI
  const [errorMessage, setErrorMessage] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const orderPanelRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const switchedByUser = useRef(false);
  const toastTimer = useRef<number | null>(null);
  const blurTimer = useRef<number | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  };
  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      if (blurTimer.current) window.clearTimeout(blurTimer.current);
    },
    []
  );

  // Focus the name box right after the user switches to "name"
  useEffect(() => {
    if (orderBy === 'name' && switchedByUser.current) {
      window.setTimeout(() => nameInputRef.current?.focus(), 30);
    }
  }, [orderBy]);

  // ==========================================
  // FETCH MENU + TABLES + CUSTOMERS
  // ==========================================
  const fetchMenu = async () => {
    setMenuLoading(true);
    setMenuError('');
    try {
      const url = restaurantId ? `${MENU_URL}?restaurantId=${encodeURIComponent(restaurantId)}` : MENU_URL;
      const res = await fetch(url, { headers: getAuthHeaders() });
      const result = await res.json();
      if (!res.ok || result.success === false) throw new Error(result.message || 'Failed to load menu.');
      const rawData = Array.isArray(result) ? result : result.data || result.items || [];
      setMenuItems(rawData.map(mapRawToMenuItem));
    } catch (err: any) {
      setMenuError(err.message || 'Could not connect to the server.');
    } finally {
      setMenuLoading(false);
    }
  };

  const fetchTables = async () => {
    setTablesLoading(true);
    setTablesError('');
    try {
      const url = restaurantId ? `${TABLES_URL}?restaurantId=${encodeURIComponent(restaurantId)}` : TABLES_URL;
      const res = await fetch(url, { headers: getAuthHeaders() });
      const result = await res.json();
      if (!res.ok || result.success === false) throw new Error(result.message || 'Failed to load tables.');
      const rawData = Array.isArray(result) ? result : result.data || result.tables || [];
      setTables(
        rawData
          .map(mapRawToTable)
          .filter((t: TableItem) => !restaurantId || !t.restaurantId || String(t.restaurantId) === String(restaurantId))
      );
    } catch (err: any) {
      setTablesError(err.message || 'Could not load tables.');
    } finally {
      setTablesLoading(false);
    }
  };

  // Loads the saved customer names of the logged-in restaurant.
  // Only customers whose restaurantId matches the one in localStorage are kept.
  const fetchCustomers = async (silent = false) => {
    if (!restaurantId) {
      setCustomers([]);
      setCustomersLoading(false);
      return;
    }
    if (!silent) setCustomersLoading(true);
    try {
      const res = await fetch(`${CUSTOMERS_URL}/${encodeURIComponent(restaurantId)}`, {
        headers: getAuthHeaders(),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || result.message || 'Failed to load customers.');
      const rawData = Array.isArray(result) ? result : result.data || [];
      const list: CustomerItem[] = rawData
        .map(mapRawToCustomer)
        .filter((c: CustomerItem) => c.customerName && String(c.restaurantId) === String(restaurantId));

      // Remove duplicate names (keeps the newest, the API already returns newest first)
      const seen = new Set<string>();
      const unique = list.filter((c) => {
        const key = c.customerName.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setCustomers(unique);
    } catch (err) {
      // Suggestions are optional, so a failure here should never block taking an order
      console.error('Could not load customers:', err);
    } finally {
      setCustomersLoading(false);
    }
  };

  // Saves the customer (name + phone + address). New name → new customer.
  // Same name with a new phone/address → the saved details are updated.
  const saveCustomer = async (name: string, phone: string, address: string) => {
    const clean = name.trim();
    if (!clean || !restaurantId) return;
    const saved = customers.find((c) => c.customerName.toLowerCase() === clean.toLowerCase());
    const changed = !saved || (phone.trim() && phone.trim() !== saved.customerPhone) || (address.trim() && address.trim() !== saved.customerAddress);
    if (!changed) return;
    try {
      const res = await fetch(CUSTOMERS_URL, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ customerName: clean, customerPhone: phone.trim(), customerAddress: address.trim() }),
      });
      if (res.ok) fetchCustomers(true);
    } catch (err) {
      console.error('Could not save customer:', err);
    }
  };

  useEffect(() => {
    fetchMenu();
    fetchTables();
    fetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape closes the confirm modal
  useEffect(() => {
    if (!showConfirmModal) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !isSubmitting && setShowConfirmModal(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showConfirmModal, isSubmitting]);

  // ==========================================
  // DERIVED DATA
  // ==========================================
  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    menuItems.forEach((m) => (counts[m.category] = (counts[m.category] || 0) + 1));
    return counts;
  }, [menuItems]);

  const filteredMenu = useMemo(() => {
    let result = menuItems;
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q)
      );
    }
    if (selectedCategory !== 'All') result = result.filter((m) => m.category === selectedCategory);

    const sorted = [...result];
    if (sortBy === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'priceAsc') sorted.sort((a, b) => a.price - b.price);
    else sorted.sort((a, b) => b.price - a.price);
    // Items you can order come first, sold-out ones go to the end
    return sorted.sort((a, b) => Number(b.available) - Number(a.available));
  }, [menuItems, searchQuery, selectedCategory, sortBy]);

  // Saved names that match what is typed (all recent names when the box is empty)
  const customerSuggestions = useMemo(() => {
    const q = customerName.toLowerCase().trim();
    const list = q
      ? customers.filter((c) => c.customerName.toLowerCase().includes(q) || c.customerPhone.includes(q))
      : customers;
    return list.slice(0, 8);
  }, [customers, customerName]);

  const typedName = customerName.trim();
  const isExistingCustomer = useMemo(
    () => !!typedName && customers.some((c) => c.customerName.toLowerCase() === typedName.toLowerCase()),
    [customers, typedName]
  );

  const selectedTable = useMemo(() => tables.find((t) => t.id === tableNumber) || null, [tables, tableNumber]);

  const cartQty = useMemo(() => {
    const map: Record<string, number> = {};
    cart.forEach((l) => (map[l.menuItemId] = l.quantity));
    return map;
  }, [cart]);

  const cartTotal = cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const totalItemsCount = cart.reduce((sum, l) => sum + l.quantity, 0);

  // Only ONE of table / name is needed, depending on the chosen mode
  const missing =
    cart.length === 0
      ? 'Add at least one item from the menu.'
      : orderBy === 'table' && !tableNumber
      ? 'Choose a table, or switch to customer name.'
      : '';
  const canOpenConfirm = !missing && !isSubmitting;

  // What will be saved on the order
  const finalTableNumber = orderBy === 'table' ? selectedTable?.tableName || tableNumber.trim() : NO_TABLE_LABEL;
  // Customer details are all optional: no name → "Guest"
  const finalCustomerName =
    orderBy === 'name' ? customerName.trim() || 'Guest' : guestNameForTable(selectedTable?.tableName || tableNumber.trim());

  // ==========================================
  // CUSTOMER NAME PICKER HELPERS
  // ==========================================
  const pickCustomer = (c: CustomerItem) => {
    setCustomerName(c.customerName);
    // Fill the saved phone / address (you can still change them)
    if (c.customerPhone) setCustomerPhone(c.customerPhone);
    if (c.customerAddress) setCustomerAddress(c.customerAddress);
    setShowSuggestions(false);
    setHighlight(-1);
    setErrorMessage('');
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setShowSuggestions(true);
      setHighlight((h) => (customerSuggestions.length ? (h + 1) % customerSuggestions.length : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) =>
        customerSuggestions.length ? (h <= 0 ? customerSuggestions.length - 1 : h - 1) : -1
      );
    } else if (e.key === 'Enter') {
      if (showSuggestions && highlight >= 0 && customerSuggestions[highlight]) {
        e.preventDefault();
pickCustomer(customerSuggestions[highlight]);
      } else {
        setShowSuggestions(false);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setHighlight(-1);
    }
  };

  const handleNameBlur = () => {
    // small delay so a click on a suggestion still registers
    if (blurTimer.current) window.clearTimeout(blurTimer.current);
    blurTimer.current = window.setTimeout(() => {
      setShowSuggestions(false);
      setHighlight(-1);
    }, 120);
  };

  // ==========================================
  // TABLE / NAME SWITCH
  // ==========================================
  const switchOrderBy = (next?: OrderBy) => {
    const target: OrderBy = next || (orderBy === 'table' ? 'name' : 'table');
    if (target === orderBy) return;
    switchedByUser.current = true;
    setErrorMessage('');
    setShowSuggestions(false);
    if (target === 'name') setTableNumber('');
    else {
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
    }
    setOrderBy(target);
  };

  // ==========================================
  // CART OPERATIONS (all immutable)
  // ==========================================
  const addToCart = (item: MenuItem) => {
    if (!item.available) return;
    setErrorMessage('');
    setCart((prev) => {
      const found = prev.find((l) => l.menuItemId === item.id);
      if (found) return prev.map((l) => (l.menuItemId === item.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [
        ...prev,
        {
          menuItemId: item.id,
          name: item.name,
          description: item.description,
          category: item.category,
          unitPrice: item.price,
          quantity: 1,
        },
      ];
    });
  };

  const updateQuantity = (menuItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.menuItemId === menuItemId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    );
  };

  const removeFromCart = (menuItemId: string) => setCart((prev) => prev.filter((l) => l.menuItemId !== menuItemId));

  const handleReviewOrder = () => {
    setErrorMessage('');
    if (missing) {
      setErrorMessage(missing);
      return;
    }
    setConfirmChecked(false);
    setShowConfirmModal(true);
  };

  // ==========================================
  // PLACE ORDER
  // ==========================================
  const placeOrder = async () => {
    setIsSubmitting(true);
    setErrorMessage('');

    const currentStaffId = (localStorage.getItem('staffId') || '').trim();
        const phoneToSave = orderBy === 'name' ? customerPhone.trim() : '';
    const addressToSave = orderBy === 'name' ? customerAddress.trim() : '';
    // Only a real typed/selected name is saved as a customer (not the "Guest (Table)" fallback)
    const nameToSave = orderBy === 'name' ? customerName.trim() : '';

    try {
      const res = await fetch(ORDERS_URL, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          restaurantId,
          staffId: currentStaffId,
          customerName: finalCustomerName,
          customerPhone: phoneToSave,
          customerAddress: addressToSave,
          tableNumber: finalTableNumber,
          orderNote: orderNote.trim(),
          items: cart.map((line) => ({
            itemName: line.name,
            description: line.description,
            itemPrice: line.unitPrice,
            quantity: line.quantity,
          })),
          totalAmount: cartTotal,
          orderStatus: 'Pending',
          paymentStatus: 'Unpaid',
        }),
      });

      const data = await res.json();

      if (res.ok && data?.success !== false) {
        showToast('Order placed successfully!', 'success');

        // Save the customer name (only if it is new). Does not block the order.
        if (nameToSave) saveCustomer(nameToSave, phoneToSave, addressToSave);

        setCart([]);
        setCustomerName('');
        setCustomerPhone('');
        setCustomerAddress('');
        setTableNumber('');
        setOrderNote('');
        switchedByUser.current = false;
        setOrderBy('table');
        setShowConfirmModal(false);
        setConfirmChecked(false);
        onOrderCreated?.();
      } else {
        showToast(data?.message || 'Failed to place order. Please retry.', 'error');
      }
    } catch (err) {
      console.error('🔴 Order submission failed:', err);
      showToast('Could not reach the server. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <div className="relative" id="create-order-root">
      <style>{`
        @keyframes co-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes co-pop { from { opacity: 0; transform: scale(.96) translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes co-toast { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: none; } }
        @keyframes co-card { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes co-bump { 0% { transform: scale(1); } 40% { transform: scale(1.12); } 100% { transform: scale(1); } }
        @keyframes co-swap { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: none; } }
        .co-fade { animation: co-fade .2s ease-out; }
        .co-pop { animation: co-pop .22s cubic-bezier(.22,1,.36,1); }
        .co-toast { animation: co-toast .25s cubic-bezier(.22,1,.36,1); }
        .co-card { animation: co-card .35s cubic-bezier(.22,1,.36,1) both; }
        .co-bump { animation: co-bump .25s ease-out; }
        .co-swap { animation: co-swap .25s cubic-bezier(.22,1,.36,1); }
        @media (prefers-reduced-motion: reduce) { .co-fade, .co-pop, .co-toast, .co-card, .co-bump, .co-swap { animation: none; } }
      `}</style>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={`co-toast fixed right-5 top-5 z-[70] flex max-w-sm items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-2xl ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {toast.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 pb-24 lg:grid-cols-12 lg:pb-0">
        {/* ============ LEFT: ORDER PANEL ============ */}
        <div ref={orderPanelRef} className="order-2 scroll-mt-4 lg:order-1 lg:col-span-5">
          <div className={`${CARD} flex flex-col gap-5 p-5 lg:sticky lg:top-4`}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-500/30">
                  <ShoppingCart className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold leading-tight tracking-tight text-slate-900">New Order</h2>
                  <p className="text-xs text-slate-500">Pick items from the menu, then confirm.</p>
                </div>
              </div>
              <span
                key={totalItemsCount}
                className="co-bump rounded-full bg-purple-50 px-3 py-1 font-mono text-xs font-bold text-purple-700 ring-1 ring-inset ring-purple-100"
              >
                {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'items'}
              </span>
            </div>

            {/* Staff */}
            {staffId && (
              <div className="flex items-center gap-2 rounded-xl border border-purple-100 bg-purple-50/60 px-3 py-2 text-xs">
                <UserCircle2 className="h-4 w-4 shrink-0 text-purple-600" />
                <span className="text-slate-500">Order by</span>
                <span className="font-mono font-bold text-purple-800">{staffId}</span>
                {staffRole && (
                  <span className="ml-auto rounded-full border border-purple-100 bg-white px-2 py-0.5 text-[10px] font-bold text-purple-700">
                    {staffRole}
                  </span>
                )}
              </div>
            )}

            {/* ===== TABLE  OR  CUSTOMER NAME ===== */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-slate-600">
                  {orderBy === 'table' ? (
                    <Armchair className="h-3.5 w-3.5 shrink-0 text-purple-500" />
                  ) : (
                    <UserCircle2 className="h-3.5 w-3.5 shrink-0 text-purple-500" />
                  )}
                  {orderBy === 'table' ? 'Table' : 'Customer details'}
                  {orderBy === 'table' ? (
                    <span className="text-rose-500">*</span>
                  ) : (
                    <span className="font-medium text-slate-400">(optional)</span>
                  )}
                  {orderBy === 'table' && selectedTable && (
                    <span className="truncate text-[11px] font-semibold text-purple-700">· {selectedTable.tableName}</span>
                  )}
                </span>

                <button
                  type="button"
                  onClick={() => switchOrderBy()}
                  title={orderBy === 'table' ? 'Take the order with customer details instead' : 'Take the order by table instead'}
                  className="group inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-purple-200 bg-white py-1 pl-1 pr-2.5 text-[11px] font-bold text-purple-700 shadow-sm transition-all hover:border-purple-600 hover:bg-purple-600 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-500/20"
                >
                  <span className="rounded-full bg-purple-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white transition-colors group-hover:bg-white group-hover:text-purple-700">
                    or
                  </span>
                  {orderBy === 'table' ? 'Customer details' : 'Pick a table'}
                  <ArrowLeftRight className="h-3 w-3 transition-transform group-hover:rotate-180" />
                </button>
              </div>

              <div key={orderBy} className="co-swap">
                {orderBy === 'table' ? (
                  /* ---------- TABLE PICKER ---------- */
                  tablesLoading ? (
                    <div className="flex gap-2">
                      {[0, 1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-12 w-20 rounded-xl" />
                      ))}
                    </div>
                  ) : tablesError ? (
                    <p className="text-xs font-medium text-rose-600">
                      {tablesError}{' '}
                      <button type="button" onClick={fetchTables} className="cursor-pointer font-bold underline">
                        Retry
                      </button>
                    </p>
                  ) : tables.length === 0 ? (
                    <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                      No tables yet. Add tables from the Tables page, or{' '}
                      <button
                        type="button"
                        onClick={() => switchOrderBy('name')}
                        className="cursor-pointer font-bold text-purple-700 underline"
                      >
                        take the order with customer details
                      </button>
                      .
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto pr-1">
                        {tables.map((t) => {
                          const active = tableNumber === t.id;
                          const off = t.status === 'Out of Service';
                          const full = isTableFull(t);
                          const free = Math.max(0, t.capacity - t.occupiedSeats);
                          return (
                            <button
                              key={t.id}
                              type="button"
                              disabled={off}
                              aria-pressed={active}
                              onClick={() => setTableNumber(t.id)}
                              className={`flex min-w-[76px] cursor-pointer flex-col items-start rounded-xl border-2 px-3 py-2 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                                active
                                  ? 'border-purple-500 bg-purple-50 shadow-sm'
                                  : 'border-slate-200 bg-white hover:border-purple-200'
                              }`}
                            >
                              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                                <span className={`h-2 w-2 rounded-full ${TABLE_DOT[t.status] || 'bg-slate-400'}`} />
                                {t.tableName}
                              </span>
                              <span
                                className={`mt-0.5 flex items-center gap-1 text-[10px] font-medium ${
                                  full && !off ? 'font-bold text-rose-600' : 'text-slate-500'
                                }`}
                              >
                                <Users className="h-3 w-3" />
                                {off
                                  ? 'Out of service'
                                  : t.capacity
                                  ? full
                                    ? 'Full'
                                    : `${free}/${t.capacity} free`
                                  : t.status}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {selectedTable && isTableFull(selectedTable) && (
                        <div className="co-fade flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                          <Info className="h-3.5 w-3.5 shrink-0" />
                          <span className="flex-1">{selectedTable.tableName} is full.</span>
                          <button
                            type="button"
                            onClick={() => switchOrderBy('name')}
                            className="cursor-pointer rounded-lg bg-amber-500 px-2.5 py-1 font-bold text-white transition hover:bg-amber-600"
                          >
                            Use customer details
                          </button>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  /* ---------- CUSTOMER NAME (type new OR pick a saved one) ---------- */
                  <div className="space-y-1.5">
                    <div className="relative">
                      <UserCircle2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        ref={nameInputRef}
                        id="co-customer"
                        type="text"
                        value={customerName}
                        onChange={(e) => {
                          setCustomerName(e.target.value);
                          setShowSuggestions(true);
                          setHighlight(-1);
                        }}
                        onFocus={() => {
                          if (blurTimer.current) window.clearTimeout(blurTimer.current);
                          setShowSuggestions(true);
                        }}
                        onBlur={handleNameBlur}
                        onKeyDown={handleNameKeyDown}
                        placeholder="Type a name or pick a saved one"
                        aria-label="Customer name"
                        aria-autocomplete="list"
                        aria-expanded={showSuggestions}
                        autoComplete="off"
                        className={`${inputBase} pl-10 ${customerName ? 'pr-9' : ''}`}
                      />
                      {customerName && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setCustomerName('');
                            nameInputRef.current?.focus();
                          }}
                          aria-label="Clear name"
                          className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-slate-700"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}

                      {/* Saved customers dropdown */}
                      {showSuggestions && (customersLoading || customerSuggestions.length > 0) && (
                        <div
                          role="listbox"
                          className="co-fade absolute left-0 right-0 top-full z-30 mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
                        >
                          {customersLoading ? (
                            <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-slate-400">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading saved customers...
                            </div>
                          ) : (
                            <>
                              <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                <History className="h-3 w-3" />
                                {customerName.trim() ? 'Matching customers' : 'Saved customers'}
                              </p>
                              {customerSuggestions.map((c, i) => {
                                const isSelected = c.customerName.toLowerCase() === typedName.toLowerCase();
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    role="option"
                                    aria-selected={isSelected}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => pickCustomer(c)}
                                    onMouseEnter={() => setHighlight(i)}
                                    className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                                      highlight === i ? 'bg-purple-50 text-purple-800' : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-100 text-[11px] font-bold uppercase text-purple-700">
                                      {c.customerName.charAt(0)}
                                    </span>
                                                                   <span className="min-w-0 flex-1">
                                      <span className="block truncate font-semibold">{c.customerName}</span>
                                      {(c.customerPhone || c.customerAddress) && (
                                        <span className="block truncate text-[11px] text-slate-400">
                                          {[c.customerPhone, c.customerAddress].filter(Boolean).join(' · ')}
                                        </span>
                                      )}
                                    </span>
                                    {isSelected && <Check className="h-4 w-4 shrink-0 text-purple-600" />}
                                  </button>
                                );
                              })}
                            </>
                          )}
                        </div>
                      )}
                    </div>

                                      {/* Phone + address (optional) */}
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      <div className="relative">
                        <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="tel"
                          inputMode="tel"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value.replace(/[^0-9+\-\s]/g, '').slice(0, 20))}
                          placeholder="Phone number"
                          aria-label="Customer phone number"
                          autoComplete="off"
                          className={`${inputBase} pl-10`}
                        />
                      </div>
                      <div className="relative">
                        <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={customerAddress}
                          onChange={(e) => setCustomerAddress(e.target.value.slice(0, 200))}
                          placeholder="Address"
                          aria-label="Customer address"
                          autoComplete="off"
                          className={`${inputBase} pl-10`}
                        />
                      </div>
                    </div>

                    {typedName ? (
                      isExistingCustomer ? (
                        <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" />
                          Saved customer. Their saved phone and address were filled in.
                        </p>
                      ) : (
                        <p className="flex items-center gap-1 text-[11px] font-medium text-purple-600">
                          <Info className="h-3 w-3" />
                          New customer. The details will be saved after the order is placed.
                        </p>
                      )
                    ) : (
                      <p className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Info className="h-3 w-3" />
                        All optional. Leave empty to order as "Guest".
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Note */}
            <div className="space-y-1.5">
              <label htmlFor="co-note" className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                <StickyNote className="h-3.5 w-3.5 text-slate-400" /> Order note
                <span className="font-medium text-slate-400">(optional)</span>
              </label>
              <textarea
                id="co-note"
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                placeholder="No onions, extra spicy, allergy notes..."
                rows={2}
                className={`${inputBase} resize-none`}
              />
            </div>

            {errorMessage && (
              <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs font-medium text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {errorMessage}
              </div>
            )}

            {/* Cart */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-600">Your order</h3>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCart([])}
                    className="cursor-pointer text-[11px] font-semibold text-slate-400 hover:text-rose-600"
                  >
                    Clear all
                  </button>
                )}
              </div>

              <div className="max-h-[300px] min-h-[120px] space-y-2 overflow-y-auto pr-1">
                {cart.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-slate-200 py-8 text-center">
                    <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-400">
                      <ShoppingCart className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700">Nothing here yet</p>
                    <p className="text-xs text-slate-400">Tap any menu item to add it.</p>
                  </div>
                ) : (
                  cart.map((line) => {
                    const cat = getCat(line.category);
                    return (
                      <div
                        key={line.menuItemId}
                        className="co-card flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-2.5"
                      >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg text-xl ring-1 ring-inset ${cat.tile}`}>
                          <MenuImage src={menuItems.find((m) => m.id === line.menuItemId)?.imageUrl} alt={line.name} fallback={cat.emoji} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-900">{line.name}</p>
                          <p className="font-mono text-[11px] font-semibold text-slate-400">
                            {formatNPR(line.unitPrice)} each
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <QtyStepper
                            small
                            qty={line.quantity}
                            onMinus={() => updateQuantity(line.menuItemId, -1)}
                            onPlus={() => updateQuantity(line.menuItemId, 1)}
                          />
                          <span className="font-mono text-xs font-bold tabular-nums text-slate-900">
                            {formatNPR(line.unitPrice * line.quantity)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFromCart(line.menuItemId)}
                          aria-label={`Remove ${line.name}`}
                          className="cursor-pointer rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Total + CTA */}
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <div className="flex items-end justify-between">
                <span className="text-sm font-semibold text-slate-500">Order total</span>
                <span className="font-mono text-2xl font-bold tabular-nums tracking-tight text-purple-700">
                  {formatNPR(cartTotal)}
                </span>
              </div>

              <button
                onClick={handleReviewOrder}
                disabled={!canOpenConfirm}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-purple-600 to-violet-600 py-3.5 text-sm font-bold text-white shadow-md shadow-purple-500/30 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-500/40 active:scale-[0.99] disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
              >
                <CheckCircle className="h-4 w-4" />
                Review order
                <ChevronRight className="h-4 w-4" />
              </button>
              {missing && <p className="text-center text-xs text-slate-400">{missing}</p>}
            </div>
          </div>
        </div>

        {/* ============ RIGHT: MENU ============ */}
        <div className="order-1 lg:order-2 lg:col-span-7">
          <div className={`${CARD} space-y-4 p-4 sm:p-5`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-900">Menu</h2>
                <p className="text-xs text-slate-500">Tap an item to add it to the order.</p>
              </div>
              {/* View toggle: cards or table */}
              <div className="inline-flex rounded-xl bg-slate-100 p-1">
                {([
                  ['grid', LayoutGrid, 'Card view'],
                  ['table', List, 'Table view'],
                ] as const).map(([key, Icon, label]) => (
                  <button
                    key={key}
                    onClick={() => setView(key)}
                    aria-label={label}
                    aria-pressed={view === key}
                    title={label}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      view === key ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-purple-700'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{key === 'grid' ? 'Cards' : 'Table'}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Search + sort */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, category or description"
                  aria-label="Search menu"
                  className={`${inputBase} pl-10 pr-9`}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                aria-label="Sort menu"
                className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10"
              >
                <option value="name">Sort: Name (A–Z)</option>
                <option value="priceAsc">Price: Low to High</option>
                <option value="priceDesc">Price: High to Low</option>
              </select>
            </div>

            {/* Category chips */}
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200">
              {['All', ...Object.keys(categories)].map((cat) => {
                const active = selectedCategory === cat;
                const count = cat === 'All' ? menuItems.length : categories[cat];
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    aria-pressed={active}
                    className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all ${
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

            {/* CONTENT */}
            <div className="max-h-[640px] overflow-y-auto pr-1">
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
                    className="mt-3 cursor-pointer rounded-lg bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-700"
                  >
                    Retry
                  </button>
                </div>
              ) : filteredMenu.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-14 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-50 text-purple-500">
                    {menuItems.length === 0 ? <Utensils className="h-7 w-7" /> : <Search className="h-7 w-7" />}
                  </div>
                  <h3 className="text-base font-bold text-slate-900">
                    {menuItems.length === 0 ? 'No menu items yet' : 'No items match'}
                  </h3>
                  <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">
                    {menuItems.length === 0
                      ? 'Add items in the Menu tab and they will show up here.'
                      : 'Try a different search or pick another category.'}
                  </p>
                  {menuItems.length > 0 && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedCategory('All');
                      }}
                      className="mt-4 cursor-pointer rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : view === 'grid' ? (
                /* ---- CARD VIEW ---- */
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {filteredMenu.map((item, i) => {
                    const cat = getCat(item.category);
                    const qty = cartQty[item.id] || 0;
                    return (
                      <div
                        key={item.id}
                        onClick={() => addToCart(item)}
                        role="button"
                        tabIndex={item.available ? 0 : -1}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), addToCart(item))}
                        aria-disabled={!item.available}
                        className={`co-card group flex flex-col justify-between rounded-2xl border p-4 outline-none transition-all focus-visible:ring-4 focus-visible:ring-purple-200 ${
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
                            className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl text-2xl ring-1 ring-inset ${cat.tile} ${
                              !item.available ? 'opacity-50 grayscale' : ''
                            }`}
                          >
                            <MenuImage src={item.imageUrl} alt={item.name} fallback={cat.emoji} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className={`truncate text-[15px] font-bold ${item.available ? 'text-slate-900' : 'text-slate-400'}`}>
                              {item.name}
                            </h3>
                            <p className="mt-0.5 line-clamp-2 min-h-[2rem] text-xs leading-relaxed text-slate-500">
                              {item.description || 'No description'}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                          <div>
                            <span className={`font-mono text-base font-bold tabular-nums ${item.available ? 'text-purple-700' : 'text-slate-400'}`}>
                              {formatNPR(item.price)}
                            </span>
                            <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${cat.chip} hidden xl:inline`}>
                              {item.category}
                            </span>
                          </div>
                          {!item.available ? (
                            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 ring-1 ring-inset ring-rose-600/15">
                              {item.status}
                            </span>
                          ) : qty > 0 ? (
                            <QtyStepper qty={qty} onMinus={() => updateQuantity(item.id, -1)} onPlus={() => addToCart(item)} />
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
                        <th className="sticky top-0 bg-slate-50 px-4 py-3">Item</th>
                        <th className="sticky top-0 hidden bg-slate-50 px-4 py-3 sm:table-cell">Category</th>
                        <th className="sticky top-0 bg-slate-50 px-4 py-3 text-right">Price</th>
                        <th className="sticky top-0 bg-slate-50 px-4 py-3 text-center">Order</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredMenu.map((item) => {
                        const cat = getCat(item.category);
                        const qty = cartQty[item.id] || 0;
                        return (
                          <tr
                            key={item.id}
                            onClick={() => addToCart(item)}
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
                                  className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg text-lg ring-1 ring-inset ${cat.tile} ${
                                    !item.available ? 'opacity-50 grayscale' : ''
                                  }`}
                                >
                                  <MenuImage src={item.imageUrl} alt={item.name} fallback={cat.emoji} />
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
                              ) : qty > 0 ? (
                                <QtyStepper small qty={qty} onMinus={() => updateQuantity(item.id, -1)} onPlus={() => addToCart(item)} />
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    addToCart(item);
                                  }}
                                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-purple-700"
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

      {/* Mobile floating cart bar */}
      {cart.length > 0 && !showConfirmModal && (
        <button
          onClick={() => orderPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="co-pop fixed inset-x-4 bottom-4 z-40 flex cursor-pointer items-center justify-between rounded-2xl bg-gradient-to-br from-purple-600 to-violet-600 px-5 py-3.5 text-white shadow-2xl shadow-purple-600/40 lg:hidden"
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            <ShoppingCart className="h-4 w-4" />
            View order · {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'items'}
          </span>
          <span className="font-mono text-sm font-bold">{formatNPR(cartTotal)}</span>
        </button>
      )}

      {/* ============ CONFIRMATION MODAL ============ */}
      {showConfirmModal && (
        <div
          className="co-fade fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[3px]"
          onClick={() => !isSubmitting && setShowConfirmModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirm order"
            className="co-pop flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-purple-100 bg-gradient-to-r from-purple-50 to-white px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-violet-600 text-white shadow-md shadow-purple-500/30">
                  <CheckCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Confirm order</h3>
                  <p className="text-xs text-slate-500">Check everything before sending it to the kitchen.</p>
                </div>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                aria-label="Close"
                className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-sm">
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
                  {orderBy === 'table' ? <Armchair className="h-5 w-5" /> : <UserCircle2 className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold text-slate-400">
                    {orderBy === 'table' ? 'Table' : 'Customer'}
                  </p>
                  <p className="truncate font-bold text-slate-900">
                    {orderBy === 'table' ? selectedTable?.tableName || tableNumber : finalCustomerName}
                  </p>
                  {orderBy === 'name' && (customerPhone.trim() || customerAddress.trim()) && (
                    <p className="truncate text-xs text-slate-500">
                      {[customerPhone.trim(), customerAddress.trim()].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-purple-700 ring-1 ring-inset ring-purple-100">
{orderBy === 'table' ? 'Dine-in by table' : !typedName ? 'Guest' : isExistingCustomer ? 'Saved customer' : 'New customer'}
                </span>
              </div>

              {staffId && (
                <p className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Order by</span>
                  <span className="font-mono font-bold text-slate-800">
                    {staffId}
                    {staffRole ? ` (${staffRole})` : ''}
                  </span>
                </p>
              )}

              {orderNote.trim() && (
                <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-xs text-amber-900">
                  <span className="font-bold">Note: </span>
                  {orderNote.trim()}
                </div>
              )}

              <div className="max-h-48 space-y-2 overflow-y-auto border-t border-slate-100 pt-3">
                {cart.map((line) => (
                  <div key={line.menuItemId} className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span>{getCat(line.category).emoji}</span>
                      <span className="truncate font-medium text-slate-800">
                        {line.quantity} × {line.name}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs font-bold text-slate-900">
                      {formatNPR(line.unitPrice * line.quantity)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                <span className="font-bold text-slate-900">Total</span>
                <span className="font-mono text-lg font-bold text-purple-700">{formatNPR(cartTotal)}</span>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer accent-purple-600"
                />
                <span className="text-xs font-medium text-amber-900">
                  The items and {orderBy === 'table' ? 'table' : 'customer name'} are correct. Place this order.
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 bg-white px-6 py-4">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="cursor-pointer rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={placeOrder}
                disabled={!confirmChecked || isSubmitting}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-br from-purple-600 to-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-purple-500/30 transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Placing order...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Place order
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}