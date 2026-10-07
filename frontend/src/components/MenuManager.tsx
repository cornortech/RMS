import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Database,
  Search,
  Plus,
  Minus,
  AlertTriangle,
  X,
  Pencil,
  Trash2,
  Loader2,
  PackageX,
  CheckCircle2,
  XCircle,
  LayoutGrid,
  List,
  UtensilsCrossed,
  Lock,
  Barcode,
  Tags,
  Layers,
  Sparkles,
  Wand2,
  BadgePercent,
  ImagePlus,
} from 'lucide-react';
import MenuImage from './MenuImage';
import { createPortal } from 'react-dom';
import { TRANSLATIONS } from '../translations';

// ==========================================
// CONFIG
// ==========================================

const API_BASE = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');
const MENU_URL = `${API_BASE}/api/menu`;

const COMBO = 'Combo';
const REGULAR_CATEGORIES = ['Appetizer', 'Main Course', 'Dessert', 'Beverage', 'Side', 'Other'];
const CATEGORY_OPTIONS = ['Appetizer', 'Main Course', 'Dessert', 'Beverage', 'Side', COMBO, 'Other'];
const STATUS_OPTIONS = ['Available', 'Unavailable', 'Sold Out'];
const COMBO_DISCOUNTS = [5, 10, 15];

// Each category gets its own emoji + colour (full class names so Tailwind can see them)
const CATEGORY_META: Record<string, { emoji: string; tile: string; chip: string; text: string }> = {
  Appetizer: { emoji: '🥗', tile: 'bg-lime-50 ring-lime-100', chip: 'bg-lime-50 text-lime-700 ring-lime-200', text: 'text-lime-700' },
  'Main Course': { emoji: '🍛', tile: 'bg-orange-50 ring-orange-100', chip: 'bg-orange-50 text-orange-700 ring-orange-200', text: 'text-orange-700' },
  Dessert: { emoji: '🍰', tile: 'bg-pink-50 ring-pink-100', chip: 'bg-pink-50 text-pink-700 ring-pink-200', text: 'text-pink-700' },
  Beverage: { emoji: '🥤', tile: 'bg-sky-50 ring-sky-100', chip: 'bg-sky-50 text-sky-700 ring-sky-200', text: 'text-sky-700' },
  Side: { emoji: '🍟', tile: 'bg-amber-50 ring-amber-100', chip: 'bg-amber-50 text-amber-700 ring-amber-200', text: 'text-amber-700' },
  Combo: { emoji: '🍱', tile: 'bg-fuchsia-50 ring-fuchsia-100', chip: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200', text: 'text-fuchsia-700' },
  Other: { emoji: '🍽️', tile: 'bg-slate-100 ring-slate-200', chip: 'bg-slate-100 text-slate-700 ring-slate-200', text: 'text-slate-700' },
};
const getCat = (c: string) => CATEGORY_META[c] || CATEGORY_META.Other;

const STATUS_META: Record<string, { badge: string; dot: string }> = {
  Available: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15', dot: 'bg-emerald-500' },
  Unavailable: { badge: 'bg-slate-100 text-slate-600 ring-slate-500/15', dot: 'bg-slate-400' },
  'Sold Out': { badge: 'bg-rose-50 text-rose-700 ring-rose-600/15', dot: 'bg-rose-500' },
};
const getStatus = (s: string) => STATUS_META[s] || STATUS_META.Unavailable;

const CARD =
  'rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]';

const formatNPR = (n: number) =>
  `NPR ${Number(n || 0).toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Login stores the whole user object as JSON under "user". The restaurant's ID is the "id" field.
const getLoggedInRestaurantId = (): string => {
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

interface ComboItem {
  menuItemId: string;
  itemName: string;
  quantity: number;
  price: number; // unit price when the combo was saved (fallback if the item is deleted)
}

interface MenuItemType {
  _id: string;
  id: string;
  restaurantId: string;
  itemName: string;
  description: string;
  category: string;
  price: number;
  status: string;
  skuBarcodeReference: string;
  createdAt: string;
  isCombo?: boolean;
  comboItems?: ComboItem[];
  imageUrl?: string;
}

interface MenuFormState {
  restaurantId: string;
  itemName: string;
  description: string;
  category: string;
  price: string;
  status: string;
  skuBarcodeReference: string;
  comboItems: ComboItem[];
}

const EMPTY_FORM: MenuFormState = {
  restaurantId: '',
  itemName: '',
  description: '',
  category: 'Appetizer',
  price: '',
  status: 'Available',
  skuBarcodeReference: '',
  comboItems: [],
};

interface MenuManagerProps {
  lang: 'en' | 'ne';
  currentUserRole: 'Viewer' | 'restoacist' | 'Owner';
}

type ToastState = { message: string; type: 'success' | 'error' } | null;
type SortKey = 'name' | 'priceAsc' | 'priceDesc';
type FormTab = 'details' | 'combo';

const isComboItem = (m: Pick<MenuItemType, 'isCombo' | 'category'>) => !!m.isCombo || m.category === COMBO;

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />;
}

// ==========================================
// COMPONENT
// ==========================================

export default function MenuManager({ lang, currentUserRole }: MenuManagerProps) {
  const t = TRANSLATIONS[lang];
  const en = lang === 'en';
  const canEditOrDelete = currentUserRole === 'restoacist' || currentUserRole === 'Owner';

  // Data
  const [menuItems, setMenuItems] = useState<MenuItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Available' | 'Unavailable'>('All');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  // Selected item
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItemType | null>(null);

  // Add / Edit modal
  const [showFormModal, setShowFormModal] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [formData, setFormData] = useState<MenuFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [comboSearch, setComboSearch] = useState('');
  const [formTab, setFormTab] = useState<FormTab>('details');
  const [mounted, setMounted] = useState(false);


  
  // 📷 Photo in the Add / Edit form
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [removeImage, setRemoveImage] = useState(false);

  const resetPhoto = (url = '') => {
    setImageFile(null);
    setImagePreview(url);
    setRemoveImage(false);
  };

  const handlePickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets you pick the same file again
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError(en ? 'Please choose a JPG, PNG or WebP photo.' : 'कृपया JPG, PNG वा WebP फोटो छान्नुहोस्।');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError(en ? 'Photo is too big. Please use a photo under 5 MB.' : 'फोटो धेरै ठूलो छ। ५ MB भन्दा सानो प्रयोग गर्नुहोस्।');
      return;
    }
    setFormError('');
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview('');
    setRemoveImage(true);
  };

  // Delete + quick status
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<number | null>(null);
  const showToast = (message: string, type: 'success' | 'error') => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  };
  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ==========================================
  // DATA FETCHING
  // ==========================================

  const fetchMenuItems = async () => {
    setLoading(true);
    setLoadError('');

    const restaurantId = getLoggedInRestaurantId();
    if (!restaurantId) {
      setLoadError(en ? 'No restaurant ID found. Please log in again.' : 'रेस्टुरेन्ट आईडी फेला परेन। कृपया फेरि लगइन गर्नुहोस्।');
      setMenuItems([]);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${MENU_URL}?restaurantId=${encodeURIComponent(restaurantId)}`);
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'Failed to load menu.');

      // Also filter client-side in case the backend ignores ?restaurantId=
      const scoped = (result.data || []).filter(
        (m: MenuItemType) => String(m.restaurantId || '').trim() === String(restaurantId).trim()
      );
      setMenuItems(scoped);
    } catch (err: any) {
      setLoadError(err.message || 'Could not connect to the server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenuItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lock body scroll while the form modal is open
  useEffect(() => {
    if (showFormModal) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [showFormModal]);

  // Escape closes modals
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirmDeleteId && !deletingId) setConfirmDeleteId(null);
      else if (showFormModal && !submitting) closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmDeleteId, deletingId, showFormModal, submitting]);

  // ==========================================
  // DERIVED DATA
  // ==========================================

  const menuById = useMemo(() => {
    const map: Record<string, MenuItemType> = {};
    menuItems.forEach((m) => {
      map[m._id] = m;
    });
    return map;
  }, [menuItems]);

  // What the combo's contents cost if bought one by one (uses today's prices when available)
  const comboWorth = (lines: ComboItem[] = []) =>
    lines.reduce((s, l) => s + (Number(menuById[l.menuItemId]?.price ?? l.price) || 0) * (Number(l.quantity) || 0), 0);

  const comboSavings = (item: MenuItemType) => {
    const worth = comboWorth(item.comboItems);
    const save = worth - (Number(item.price) || 0);
    const pct = worth > 0 ? Math.round((save / worth) * 100) : 0;
    return { worth, save, pct };
  };

  const comboHasUnavailable = (item: MenuItemType) =>
    (item.comboItems || []).some((l) => {
      const m = menuById[l.menuItemId];
      return !m || m.status !== 'Available';
    });

  const stats = useMemo(() => {
    const available = menuItems.filter((m) => m.status === 'Available').length;
    const avg = menuItems.length
      ? menuItems.reduce((s, m) => s + (Number(m.price) || 0), 0) / menuItems.length
      : 0;
    return {
      total: menuItems.length,
      available,
      unavailable: menuItems.length - available,
      combos: menuItems.filter(isComboItem).length,
      avg,
    };
  }, [menuItems]);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    menuItems.forEach((m) => {
      const c = isComboItem(m) ? COMBO : m.category;
      map[c] = (map[c] || 0) + 1;
    });
    return map;
  }, [menuItems]);

  const filteredMenuItems = useMemo(() => {
    let result = menuItems;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (m) =>
          m.itemName?.toLowerCase().includes(q) ||
          m.description?.toLowerCase().includes(q) ||
          m.skuBarcodeReference?.toLowerCase().includes(q) ||
          (m.comboItems || []).some((c) => c.itemName?.toLowerCase().includes(q))
      );
    }
    if (selectedCategory === COMBO) result = result.filter(isComboItem);
    else if (selectedCategory !== 'All') result = result.filter((m) => m.category === selectedCategory && !isComboItem(m));
    if (statusFilter === 'Available') result = result.filter((m) => m.status === 'Available');
    else if (statusFilter === 'Unavailable') result = result.filter((m) => m.status !== 'Available');

    const sorted = [...result];
    if (sortBy === 'name') sorted.sort((a, b) => (a.itemName || '').localeCompare(b.itemName || ''));
    else if (sortBy === 'priceAsc') sorted.sort((a, b) => Number(a.price) - Number(b.price));
    else sorted.sort((a, b) => Number(b.price) - Number(a.price));
    return sorted;
  }, [searchQuery, selectedCategory, statusFilter, sortBy, menuItems]);

  const hasFilters = searchQuery.trim() !== '' || selectedCategory !== 'All' || statusFilter !== 'All';
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('All');
    setStatusFilter('All');
  };

  const unavailableItems = menuItems.filter((m) => m.status !== 'Available');
  const itemToDelete = menuItems.find((m) => m._id === confirmDeleteId) || null;
  const combosUsingItem = confirmDeleteId
    ? menuItems.filter((m) => isComboItem(m) && (m.comboItems || []).some((c) => c.menuItemId === confirmDeleteId))
    : [];

  // ==========================================
  // FORM HELPERS
  // ==========================================

  const formIsCombo = formData.category === COMBO;
  const formComboQty = formData.comboItems.reduce((s, l) => s + l.quantity, 0);
  const formComboWorth = comboWorth(formData.comboItems);
  const formPrice = Number(formData.price) || 0;
  const formSave = formComboWorth - formPrice;
  const formSavePct = formComboWorth > 0 ? Math.round((formSave / formComboWorth) * 100) : 0;

  const comboPickable = useMemo(() => {
    const q = comboSearch.toLowerCase().trim();
    return menuItems
      .filter((m) => !isComboItem(m) && m._id !== editingId)
      .filter((m) => !q || m.itemName?.toLowerCase().includes(q) || m.category?.toLowerCase().includes(q))
      .sort((a, b) => (a.itemName || '').localeCompare(b.itemName || ''));
  }, [menuItems, comboSearch, editingId]);

  const handleFormChange = (field: keyof Omit<MenuFormState, 'comboItems'>, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const addComboLine = (item: MenuItemType) =>
    setFormData((prev) => {
      const exists = prev.comboItems.find((l) => l.menuItemId === item._id);
      const comboItems = exists
        ? prev.comboItems.map((l) => (l.menuItemId === item._id ? { ...l, quantity: l.quantity + 1 } : l))
        : [...prev.comboItems, { menuItemId: item._id, itemName: item.itemName, quantity: 1, price: Number(item.price) || 0 }];
      return { ...prev, comboItems };
    });

  const changeComboQty = (menuItemId: string, delta: number) =>
    setFormData((prev) => ({
      ...prev,
      comboItems: prev.comboItems
        .map((l) => (l.menuItemId === menuItemId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    }));

  const removeComboLine = (menuItemId: string) =>
    setFormData((prev) => ({ ...prev, comboItems: prev.comboItems.filter((l) => l.menuItemId !== menuItemId) }));

  const applyComboDiscount = (pct: number) => {
    if (formComboWorth <= 0) return;
    handleFormChange('price', String(Math.round(formComboWorth * (1 - pct / 100))));
  };

  const writeComboDescription = () => {
    if (formData.comboItems.length === 0) return;
    const text = `Includes ${formData.comboItems.map((l) => `${l.quantity}× ${l.itemName}`).join(', ')}`;
    handleFormChange('description', text.slice(0, 200));
  };

  const openAddModal = (presetCategory?: string) => {
    setFormMode('add');
    setEditingId(null);
    setFormData({ ...EMPTY_FORM, category: presetCategory || EMPTY_FORM.category, restaurantId: getLoggedInRestaurantId() });
        resetPhoto();
    setFormError('');
    setComboSearch('');
    setFormTab('details');
    setShowFormModal(true);
  };

  const openEditModal = (item: MenuItemType) => {
    setFormMode('edit');
    setEditingId(item._id);
    setFormData({
      restaurantId: getLoggedInRestaurantId(),
      itemName: item.itemName || '',
      description: item.description || '',
      category: isComboItem(item) ? COMBO : item.category || 'Appetizer',
      price: item.price != null ? String(item.price) : '',
      status: item.status || 'Available',
      skuBarcodeReference: item.skuBarcodeReference || '',
      comboItems: (item.comboItems || []).map((l) => ({
        menuItemId: String(l.menuItemId),
        itemName: l.itemName,
        quantity: Number(l.quantity) || 1,
        price: Number(l.price) || 0,
      })),
    });
        resetPhoto(item.imageUrl || '');
    setFormError('');
    setComboSearch('');
    setFormTab('details');
    setShowFormModal(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setShowFormModal(false);
    setFormData(EMPTY_FORM);
    setEditingId(null);
        resetPhoto();
    setFormError('');
    setComboSearch('');
    setFormTab('details');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.itemName.trim() || !formData.description.trim() || !formData.category.trim() || !formData.price) {
      setFormError('Item name, description, category, and price are required.');
      return;
    }
    if (formIsCombo && formComboQty < 2) {
      setFormError(en ? 'Add at least 2 items to make a combo.' : 'कम्बो बनाउन कम्तीमा २ वस्तु थप्नुहोस्।');
      return;
    }

    const currentRestaurantId = getLoggedInRestaurantId();
    if (!currentRestaurantId) {
      setFormError(
        en
          ? 'No restaurant ID found in your session. Please log in again.'
          : 'तपाईंको सत्रमा रेस्टुरेन्ट आईडी फेला परेन। कृपया फेरि लगइन गर्नुहोस्।'
      );
      return;
    }

    setSubmitting(true);
    setFormError('');

    const payload = {
      restaurantId: currentRestaurantId,
      itemName: formData.itemName.trim(),
      description: formData.description.trim(),
      category: formData.category,
      price: Number(formData.price) || 0,
      status: formData.status,
      skuBarcodeReference: formData.skuBarcodeReference.trim(),
      isCombo: formIsCombo,
      comboItems: formIsCombo
        ? formData.comboItems.map((l) => ({
            menuItemId: l.menuItemId,
            itemName: l.itemName,
            quantity: l.quantity,
            price: Number(menuById[l.menuItemId]?.price ?? l.price) || 0,
          }))
        : [],
    };

    try {
      const url = formMode === 'edit' && editingId ? `${MENU_URL}/${editingId}` : MENU_URL;
      const method = formMode === 'edit' ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'Request failed.');

      // 📷 Save / remove the photo (the item itself is already saved)
      const savedId = formMode === 'edit' && editingId ? editingId : String(result.data?._id || result.data?.id || '');
      let newImageUrl: string | undefined;
      let photoError = '';
      if (savedId && imageFile) {
        try {
          const fd = new FormData();
          fd.append('image', imageFile);
          const up = await fetch(`${MENU_URL}/${savedId}/image`, { method: 'POST', body: fd });
          const upResult = await up.json().catch(() => ({}));
          if (!up.ok || !upResult.success) throw new Error(upResult.message || 'Photo upload failed.');
          newImageUrl = upResult.data?.imageUrl || '';
        } catch (err: any) {
          photoError = err.message || 'Photo upload failed.';
        }
      } else if (savedId && removeImage && formMode === 'edit') {
        const del = await fetch(`${MENU_URL}/${savedId}/image`, { method: 'DELETE' }).catch(() => null);
        if (del && del.ok) newImageUrl = '';
      }

      await fetchMenuItems();
      if (formMode === 'edit' && selectedMenuItem?._id === editingId) {
        setSelectedMenuItem((prev) =>
          prev ? { ...prev, ...payload, ...(newImageUrl !== undefined ? { imageUrl: newImageUrl } : {}) } : prev
        );
      }
      if (photoError) {
        showToast(`${en ? 'Item saved, but photo failed:' : 'वस्तु सेभ भयो, तर फोटो भएन:'} ${photoError}`, 'error');
        closeModal();
        return;
      }
      showToast(
        formMode === 'edit'
          ? en ? 'Menu item updated.' : 'मेनु वस्तु अद्यावधिक भयो।'
          : formIsCombo
          ? en ? 'Combo created.' : 'कम्बो बनाइयो।'
          : en ? 'Menu item added.' : 'मेनु वस्तु थपियो।',
        'success'
      );
      closeModal();
    } catch (err: any) {
      setFormError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ==========================================
  // QUICK STATUS TOGGLE
  // ==========================================

  const handleQuickStatus = async (item: MenuItemType, newStatus: string) => {
    setTogglingId(item._id);
    try {
      const res = await fetch(`${MENU_URL}/${item._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: getLoggedInRestaurantId(),
          itemName: item.itemName,
          description: item.description,
          category: item.category,
          price: Number(item.price) || 0,
          status: newStatus,
          skuBarcodeReference: item.skuBarcodeReference || '',
          // Always send combo data so a status change never wipes a combo's contents
          isCombo: isComboItem(item),
          comboItems: item.comboItems || [],
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'Update failed.');

      setMenuItems((prev) => prev.map((m) => (m._id === item._id ? { ...m, status: newStatus } : m)));
      setSelectedMenuItem((prev) => (prev && prev._id === item._id ? { ...prev, status: newStatus } : prev));
      showToast(`${item.itemName} → ${newStatus}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update status.', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  // ==========================================
  // DELETE
  // ==========================================

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`${MENU_URL}/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'Delete failed.');
      setMenuItems((prev) => prev.filter((m) => m._id !== id));
      if (selectedMenuItem?._id === id) setSelectedMenuItem(null);
      showToast(en ? 'Menu item deleted.' : 'मेनु वस्तु मेटाइयो।', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete menu item.', 'error');
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  // ==========================================
  // SMALL RENDER HELPERS
  // ==========================================

  const StatusBadge = ({ status }: { status: string }) => {
    const s = getStatus(status);
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${s.badge}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
        {status}
      </span>
    );
  };

  const ActionButtons = ({ item }: { item: MenuItemType }) =>
    canEditOrDelete ? (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => openEditModal(item)}
          title={en ? 'Edit' : 'सम्पादन गर्नुहोस्'}
          aria-label={`${en ? 'Edit' : 'सम्पादन'} ${item.itemName}`}
          className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-purple-50 hover:text-purple-600"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => setConfirmDeleteId(item._id)}
          title={en ? 'Delete' : 'मेटाउनुहोस्'}
          aria-label={`${en ? 'Delete' : 'मेटाउनुहोस्'} ${item.itemName}`}
          className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    ) : null;

  // Overlapping emoji "stack" for a combo's contents
  const ComboStack = ({ lines, size = 'md' }: { lines: ComboItem[]; size?: 'sm' | 'md' }) => {
    const shown = lines.slice(0, 4);
    const extra = lines.length - shown.length;
    const dim = size === 'sm' ? 'h-7 w-7 text-sm' : 'h-9 w-9 text-lg';
    return (
      <div className="flex items-center">
        {shown.map((l, i) => {
          const cat = getCat(menuById[l.menuItemId]?.category || 'Other');
          return (
            <span
              key={l.menuItemId}
              className={`flex ${dim} items-center justify-center rounded-full bg-white ring-2 ring-white shadow-sm ${i > 0 ? '-ml-2' : ''}`}
              style={{ zIndex: 10 - i }}
              title={`${l.quantity}× ${l.itemName}`}
            >
              <span className={`flex h-full w-full items-center justify-center rounded-full ring-1 ring-inset ${cat.tile}`}>{cat.emoji}</span>
            </span>
          );
        })}
        {extra > 0 && (
          <span className={`-ml-2 flex ${dim} items-center justify-center rounded-full bg-fuchsia-600 text-[10px] font-black text-white ring-2 ring-white`}>
            +{extra}
          </span>
        )}
      </div>
    );
  };

  const statCards = [
    { label: en ? 'Total Items' : 'कुल वस्तु', value: stats.total, icon: UtensilsCrossed, line: 'from-purple-500 to-violet-500', tile: 'bg-purple-50 text-purple-600 ring-purple-100' },
    { label: en ? 'Available' : 'उपलब्ध', value: stats.available, icon: CheckCircle2, line: 'from-emerald-500 to-teal-500', tile: 'bg-emerald-50 text-emerald-600 ring-emerald-100' },
    { label: en ? 'Unavailable' : 'अनुपलब्ध', value: stats.unavailable, icon: XCircle, line: 'from-rose-500 to-orange-500', tile: 'bg-rose-50 text-rose-600 ring-rose-100' },
    { label: en ? 'Combos' : 'कम्बो', value: stats.combos, icon: Layers, line: 'from-fuchsia-500 to-purple-500', tile: 'bg-fuchsia-50 text-fuchsia-600 ring-fuchsia-100' },
    { label: en ? 'Average Price' : 'औसत मूल्य', value: formatNPR(stats.avg), icon: Tags, line: 'from-amber-400 to-orange-500', tile: 'bg-amber-50 text-amber-600 ring-amber-100' },
  ];

  const inputBase =
    'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-purple-500 focus:bg-white focus:ring-4 focus:ring-purple-500/10';

  const submitDisabled =
    submitting ||
    !formData.itemName ||
    !formData.description ||
    !formData.price ||
    (formIsCombo && formComboQty < 2);

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className="space-y-6" id="menu-root">
      <style>{`
        @keyframes mm-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes mm-pop { from { opacity: 0; transform: scale(.96) translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes mm-toast { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: none; } }
        @keyframes mm-card { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes mm-shine { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .mm-fade { animation: mm-fade .2s ease-out; }
        .mm-pop { animation: mm-pop .22s cubic-bezier(.22,1,.36,1); }
        .mm-toast { animation: mm-toast .25s cubic-bezier(.22,1,.36,1); }
        .mm-card { animation: mm-card .35s cubic-bezier(.22,1,.36,1) both; }
        .mm-shine {
          background-image: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.55) 50%, transparent 70%);
          background-size: 200% 100%;
          animation: mm-shine 3.2s ease-in-out infinite;
        }
        .mm-scroll::-webkit-scrollbar { width: 6px; }
        .mm-scroll::-webkit-scrollbar-thumb { background: #e9d5ff; border-radius: 999px; }
        @media (prefers-reduced-motion: reduce) { .mm-fade, .mm-pop, .mm-toast, .mm-card, .mm-shine { animation: none; } }
      `}</style>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={`mm-toast fixed right-5 top-5 z-[70] flex max-w-sm items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-2xl ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          {toast.message}
        </div>
      )}

      {/* ---------- HEADER ---------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-500/30">
            <Database className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {en ? 'Menu Management' : 'मेनु व्यवस्थापन'}
            </h1>
            <p className="text-sm text-slate-500">
              {en ? 'Add, edit and organise everything you serve.' : 'तपाईंले सेवा गर्ने सबै वस्तुहरू व्यवस्थापन गर्नुहोस्।'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => openAddModal(COMBO)}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-purple-50 px-4 py-3 text-sm font-semibold text-fuchsia-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-fuchsia-300 hover:shadow-md active:scale-[0.98]"
          >
            <span className="text-base leading-none">🍱</span>
            {en ? 'Create Combo' : 'कम्बो बनाउनुहोस्'}
          </button>
          <button
            onClick={() => openAddModal()}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-purple-600 to-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-purple-500/30 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-500/40 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            {en ? 'Add Menu Item' : 'मेनु वस्तु थप्नुहोस्'}
          </button>
        </div>
      </div>

      {/* ---------- STATS ---------- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {statCards.map((c, i) => (
          <div key={c.label} className={`${CARD} relative overflow-hidden p-4 sm:p-5 ${i === statCards.length - 1 ? 'col-span-2 lg:col-span-1' : ''}`}>
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.line}`} />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-500">{c.label}</p>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset ${c.tile}`}>
                <c.icon className="h-4 w-4" />
              </div>
            </div>
            {loading ? (
              <Skeleton className="mt-3 h-7 w-20" />
            ) : (
              <p className="mt-3 truncate text-xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-2xl">{c.value}</p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12" id="menu-layout">
        {/* ---------- LEFT: LIST ---------- */}
        <div className={`${CARD} space-y-4 p-4 sm:p-5 lg:col-span-8`} id="menu-list-card">
          {/* Search + sort + view */}
          <div className="flex flex-col gap-3 sm:flex-row" id="menu-filters">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={en ? 'Search by name, description, SKU or combo item...' : 'नाम, विवरण वा SKU द्वारा खोज्नुहोस्...'}
                aria-label={en ? 'Search menu' : 'मेनु खोज्नुहोस्'}
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
              aria-label="Sort"
              className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10"
            >
              <option value="name">{en ? 'Sort: Name (A–Z)' : 'क्रम: नाम'}</option>
              <option value="priceAsc">{en ? 'Price: Low to High' : 'मूल्य: कम देखि बढी'}</option>
              <option value="priceDesc">{en ? 'Price: High to Low' : 'मूल्य: बढी देखि कम'}</option>
            </select>

            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              {([
                ['grid', LayoutGrid, en ? 'Card view' : 'कार्ड'],
                ['list', List, en ? 'Table view' : 'तालिका'],
              ] as const).map(([key, Icon, label]) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  aria-label={label}
                  aria-pressed={view === key}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 transition-all ${
                    view === key ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-purple-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          {/* Category chips + status tabs */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200">
              {['All', ...CATEGORY_OPTIONS].map((cat) => {
                const active = selectedCategory === cat;
                const count = cat === 'All' ? menuItems.length : categoryCounts[cat] || 0;
                const isCombo = cat === COMBO;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    aria-pressed={active}
                    className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all ${
                      active
                        ? isCombo
                          ? 'border-transparent bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-md shadow-fuchsia-500/25'
                          : 'border-purple-600 bg-purple-600 text-white shadow-md shadow-purple-500/25'
                        : isCombo
                        ? 'border-fuchsia-200 bg-fuchsia-50/60 text-fuchsia-700 hover:border-fuchsia-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-purple-300 hover:text-purple-700'
                    }`}
                  >
                    {cat !== 'All' && <span>{getCat(cat).emoji}</span>}
                    {cat === 'All' ? (en ? 'All Categories' : 'सबै वर्गहरू') : cat}
                    <span className={`rounded-full px-1.5 text-[10px] ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="inline-flex shrink-0 self-start rounded-xl bg-slate-100 p-1 text-xs font-semibold" id="status-tabs">
              {([
                ['All', en ? 'All' : 'सबै', null],
                ['Available', en ? 'Available' : 'उपलब्ध', CheckCircle2],
                ['Unavailable', en ? 'Unavailable' : 'अनुपलब्ध', XCircle],
              ] as const).map(([key, label, Icon]) => {
                const active = statusFilter === key;
                const activeCls =
                  key === 'Available'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : key === 'Unavailable'
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'bg-white text-purple-700 shadow-sm';
                return (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(key)}
                    aria-pressed={active}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all ${
                      active ? activeCls : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {Icon && <Icon className="h-3.5 w-3.5" />}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Combo promo strip when no combos exist yet */}
          {!loading && !loadError && menuItems.length >= 2 && stats.combos === 0 && canEditOrDelete && (
            <button
              onClick={() => openAddModal(COMBO)}
              className="group relative flex w-full cursor-pointer items-center gap-4 overflow-hidden rounded-2xl border border-fuchsia-200 bg-gradient-to-r from-fuchsia-50 via-purple-50 to-white p-4 text-left transition-all hover:shadow-md"
            >
              <span className="mm-shine pointer-events-none absolute inset-0" />
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm ring-1 ring-fuchsia-100">🍱</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate-900">
                  {en ? 'Bundle items into a combo meal' : 'वस्तुहरू मिलाएर कम्बो बनाउनुहोस्'}
                </span>
                <span className="block text-xs text-slate-500">
                  {en ? 'Pick items from your menu, set a combo price, and show customers how much they save.' : 'मेनुबाट वस्तु छान्नुहोस्, मूल्य राख्नुहोस्।'}
                </span>
              </span>
              <span className="hidden shrink-0 items-center gap-1 rounded-xl bg-fuchsia-600 px-3 py-2 text-xs font-bold text-white shadow-sm sm:inline-flex">
                <Plus className="h-3.5 w-3.5" />
                {en ? 'Create combo' : 'कम्बो बनाउनुहोस्'}
              </span>
            </button>
          )}

          {/* Result count */}
          {!loading && !loadError && menuItems.length > 0 && (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                {en ? 'Showing' : 'देखाइएको'} <b className="text-slate-800">{filteredMenuItems.length}</b> {en ? 'of' : 'मध्ये'}{' '}
                <b className="text-slate-800">{menuItems.length}</b>
              </span>
              {hasFilters && (
                <button onClick={clearFilters} className="cursor-pointer font-semibold text-purple-600 hover:text-purple-800">
                  {en ? 'Clear filters' : 'फिल्टर हटाउनुहोस्'}
                </button>
              )}
            </div>
          )}

          {/* CONTENT */}
          {loading ? (
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
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center py-14 text-center text-rose-500">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50">
                <PackageX className="h-7 w-7" />
              </div>
              <p className="max-w-sm text-sm font-medium">{loadError}</p>
              <button
                onClick={fetchMenuItems}
                className="mt-3 cursor-pointer rounded-lg bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-700"
              >
                {en ? 'Retry' : 'फेरि प्रयास गर्नुहोस्'}
              </button>
            </div>
          ) : filteredMenuItems.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-14 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-50 text-2xl text-purple-500">
                {selectedCategory === COMBO ? '🍱' : menuItems.length === 0 ? <UtensilsCrossed className="h-7 w-7" /> : <Search className="h-7 w-7" />}
              </div>
              <h3 className="text-base font-bold text-slate-900">
                {selectedCategory === COMBO && !searchQuery
                  ? en ? 'No combos yet' : 'अहिलेसम्म कम्बो छैन'
                  : menuItems.length === 0
                  ? en ? 'Your menu is empty' : 'मेनु खाली छ'
                  : en ? 'No items match your filters' : 'कुनै वस्तु फेला परेन।'}
              </h3>
              <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">
                {selectedCategory === COMBO && !searchQuery
                  ? en ? 'Bundle a few items together and offer them at a special price.' : 'केही वस्तु मिलाएर विशेष मूल्यमा दिनुहोस्।'
                  : menuItems.length === 0
                  ? en ? 'No menu items yet. Add your first item to get started.' : 'अहिले सम्म कुनै मेनु वस्तु थपिएको छैन।'
                  : en ? 'Try a different search or clear the filters.' : 'फरक खोज प्रयास गर्नुहोस्।'}
              </p>
              <button
                onClick={
                  selectedCategory === COMBO && !searchQuery
                    ? () => openAddModal(COMBO)
                    : menuItems.length === 0
                    ? () => openAddModal()
                    : clearFilters
                }
                className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-700"
              >
                {selectedCategory === COMBO && !searchQuery ? (
                  <>
                    <Plus className="h-4 w-4" /> {en ? 'Create Combo' : 'कम्बो बनाउनुहोस्'}
                  </>
                ) : menuItems.length === 0 ? (
                  <>
                    <Plus className="h-4 w-4" /> {en ? 'Add Menu Item' : 'मेनु वस्तु थप्नुहोस्'}
                  </>
                ) : en ? (
                  'Clear filters'
                ) : (
                  'फिल्टर हटाउनुहोस्'
                )}
              </button>
            </div>
          ) : view === 'grid' ? (
            /* ---- GRID VIEW ---- */
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" id="menu-table-body">
              {filteredMenuItems.map((item, i) => {
                const combo = isComboItem(item);
                const cat = getCat(combo ? COMBO : item.category);
                const selected = selectedMenuItem?._id === item._id;
                const off = item.status !== 'Available';

                if (combo) {
                  const { save, pct } = comboSavings(item);
                  const lines = item.comboItems || [];
                  const warn = comboHasUnavailable(item);
                  return (
                    <div
                      key={item._id}
                      onClick={() => setSelectedMenuItem(item)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelectedMenuItem(item))}
                      className={`mm-card group relative cursor-pointer overflow-hidden rounded-2xl border p-4 outline-none transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(192,38,211,0.14)] focus-visible:ring-4 focus-visible:ring-fuchsia-200 ${
                        selected
                          ? 'border-fuchsia-400 bg-gradient-to-br from-fuchsia-50 via-white to-purple-50 ring-2 ring-fuchsia-200'
                          : 'border-fuchsia-200/80 bg-gradient-to-br from-fuchsia-50/70 via-white to-purple-50/60 hover:border-fuchsia-300'
                      }`}
                      style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                    >
                      {/* Ribbon */}
                      <div className="absolute right-0 top-0 flex items-center gap-1 rounded-bl-2xl bg-gradient-to-r from-fuchsia-600 to-purple-600 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-sm">
                        <Layers className="h-3 w-3" />
                        Combo{save > 0 && pct > 0 ? ` · Save ${pct}%` : ''}
                      </div>

                      <div className="flex items-start gap-3 pr-16">
                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white text-2xl shadow-sm ring-1 ring-fuchsia-100 ${off ? 'opacity-60 grayscale' : ''}`}>
                          <MenuImage src={item.imageUrl} alt={item.itemName} fallback={cat.emoji} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className={`truncate text-[15px] font-bold ${off ? 'text-slate-500' : 'text-slate-900'}`}>{item.itemName}</h3>
                          <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{item.description}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-3 rounded-xl bg-white/80 p-2.5 ring-1 ring-fuchsia-100">
                        <ComboStack lines={lines} size="sm" />
                        <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-600">
                          {lines.map((l) => `${l.quantity}× ${l.itemName}`).join(' · ') || (en ? 'No items' : 'वस्तु छैन')}
                        </p>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="rounded-full bg-fuchsia-100 px-2.5 py-1 text-[11px] font-bold text-fuchsia-700">
                          {lines.reduce((s, l) => s + l.quantity, 0)} {en ? 'items inside' : 'वस्तु'}
                        </span>
                        {warn ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
                            <AlertTriangle className="h-3 w-3" />
                            {en ? 'Item unavailable' : 'वस्तु अनुपलब्ध'}
                          </span>
                        ) : (
                          <StatusBadge status={item.status} />
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-fuchsia-100 pt-3">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-base font-bold tabular-nums text-fuchsia-700">{formatNPR(item.price)}</span>
                          {save > 0 && (
                            <span className="font-mono text-[11px] tabular-nums text-slate-400 line-through">{formatNPR(item.price + save)}</span>
                          )}
                        </div>
                        <ActionButtons item={item} />
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={item._id}
                    onClick={() => setSelectedMenuItem(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelectedMenuItem(item))}
                    className={`mm-card group cursor-pointer rounded-2xl border p-4 outline-none transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(109,40,217,0.10)] focus-visible:ring-4 focus-visible:ring-purple-200 ${
                      selected ? 'border-purple-400 bg-purple-50/40 ring-2 ring-purple-200' : 'border-slate-200/80 bg-white hover:border-purple-200'
                    }`}
                    style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl text-2xl ring-1 ring-inset ${cat.tile} ${off ? 'opacity-60 grayscale' : ''}`}>
                        <MenuImage src={item.imageUrl} alt={item.itemName} fallback={cat.emoji} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className={`truncate text-[15px] font-bold ${off ? 'text-slate-500' : 'text-slate-900'}`}>{item.itemName}</h3>
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">{item.description}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${cat.chip}`}>{item.category}</span>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                      <span className="font-mono text-base font-bold tabular-nums text-purple-700">{formatNPR(item.price)}</span>
                      <ActionButtons item={item} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ---- LIST VIEW ---- */
            <div className="overflow-x-auto rounded-xl border border-slate-100" id="menu-table-wrapper">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="bg-slate-50 px-4 py-3">{en ? 'Item Name' : 'वस्तुको नाम'}</th>
                    <th className="bg-slate-50 px-4 py-3">Category</th>
                    <th className="bg-slate-50 px-4 py-3 text-right">Price (NPR)</th>
                    <th className="bg-slate-50 px-4 py-3 text-center">Status</th>
                    <th className="bg-slate-50 px-4 py-3">SKU</th>
                    <th className="bg-slate-50 px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMenuItems.map((item) => {
                    const combo = isComboItem(item);
                    const cat = getCat(combo ? COMBO : item.category);
                    const lines = item.comboItems || [];
                    return (
                      <tr
                        key={item._id}
                        onClick={() => setSelectedMenuItem(item)}
                        className={`cursor-pointer transition-colors hover:bg-purple-50/40 ${selectedMenuItem?._id === item._id ? 'bg-purple-50/60' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg text-lg ring-1 ring-inset ${cat.tile}`}>
                              <MenuImage src={item.imageUrl} alt={item.itemName} fallback={cat.emoji} />
                            </span>
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 font-semibold text-slate-900">
                                {item.itemName}
                                {combo && (
                                  <span className="rounded bg-fuchsia-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-fuchsia-700">Combo</span>
                                )}
                              </p>
                              <p className="max-w-[240px] truncate text-[11px] text-slate-400">
                                {combo ? lines.map((l) => `${l.quantity}× ${l.itemName}`).join(', ') : item.description}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${cat.chip}`}>{combo ? COMBO : item.category}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-slate-900">{formatNPR(item.price)}</td>
                        <td className="px-4 py-3 text-center"><StatusBadge status={item.status} /></td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{item.skuBarcodeReference || '—'}</td>
                        <td className="px-4 py-3 text-center">
                          {canEditOrDelete ? <div className="flex justify-center"><ActionButtons item={item} /></div> : <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ---------- RIGHT: DETAIL + UNAVAILABLE ---------- */}
        <div className="space-y-6 lg:col-span-4" id="menu-sidebar">
          <div className="space-y-6 lg:sticky lg:top-4">
            {selectedMenuItem ? (
              (() => {
                const combo = isComboItem(selectedMenuItem);
                const cat = getCat(combo ? COMBO : selectedMenuItem.category);
                const { worth, save, pct } = combo ? comboSavings(selectedMenuItem) : { worth: 0, save: 0, pct: 0 };
                return (
                  <div className={`${CARD} mm-pop overflow-hidden`}>
                    {/* Hero */}
                    <div
                      className={`relative px-5 pb-5 pt-5 ${
                        combo ? 'bg-gradient-to-br from-fuchsia-100 via-purple-50 to-white' : cat.tile.split(' ')[0]
                      }`}
                    >
                      <button
                        onClick={() => setSelectedMenuItem(null)}
                        aria-label="Close details"
                        className="absolute right-3 top-3 cursor-pointer rounded-lg bg-white/70 p-1.5 text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <div className="flex items-end gap-3">
                        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white text-4xl shadow-sm">
                          <MenuImage src={selectedMenuItem.imageUrl} alt={selectedMenuItem.itemName} fallback={cat.emoji} size={300} />
                        </div>
                        {combo && <ComboStack lines={selectedMenuItem.comboItems || []} />}
                      </div>
                      <h3 className="mt-3 text-lg font-bold leading-tight text-slate-900">{selectedMenuItem.itemName}</h3>
                      <p className={`flex items-center gap-1.5 text-xs font-semibold ${cat.text}`}>
                        {combo && <Layers className="h-3.5 w-3.5" />}
                        {combo ? (en ? 'Combo meal' : 'कम्बो') : selectedMenuItem.category}
                      </p>
                    </div>

                    <div className="space-y-4 p-5">
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Price</p>
                          <p className={`font-mono text-2xl font-bold tabular-nums ${combo ? 'text-fuchsia-700' : 'text-purple-700'}`}>
                            {formatNPR(selectedMenuItem.price)}
                          </p>
                        </div>
                        <StatusBadge status={selectedMenuItem.status} />
                      </div>

                      {combo && (
                        <>
                          {/* Value */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-xl bg-slate-50 p-3">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{en ? 'Bought separately' : 'छुट्टाछुट्टै'}</p>
                              <p className="mt-0.5 font-mono text-sm font-bold text-slate-700">{formatNPR(worth)}</p>
                            </div>
                            <div className={`rounded-xl p-3 ${save > 0 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                {save >= 0 ? (en ? 'Customer saves' : 'बचत') : en ? 'Costs more by' : 'बढी'}
                              </p>
                              <p className={`mt-0.5 font-mono text-sm font-bold ${save > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                                {formatNPR(Math.abs(save))}
                                {save > 0 && pct > 0 && <span className="ml-1 text-[10px]">({pct}%)</span>}
                              </p>
                            </div>
                          </div>

                          {/* Contents */}
                          <div className="overflow-hidden rounded-xl ring-1 ring-fuchsia-100">
                            <p className="flex items-center gap-1.5 bg-fuchsia-50/70 px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider text-fuchsia-700">
                              <Sparkles className="h-3 w-3" />
                              {en ? 'What is inside' : 'भित्र के छ'}
                            </p>
                            <ul className="divide-y divide-slate-100">
                              {(selectedMenuItem.comboItems || []).map((l) => {
                                const m = menuById[l.menuItemId];
                                const lc = getCat(m?.category || 'Other');
                                const issue = !m ? (en ? 'Removed from menu' : 'मेनुबाट हटाइयो') : m.status !== 'Available' ? m.status : '';
                                return (
                                  <li key={l.menuItemId} className="flex items-center gap-2.5 px-3.5 py-2.5">
                                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ring-1 ring-inset ${lc.tile}`}>{lc.emoji}</span>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-semibold text-slate-800">{l.itemName}</p>
                                      {issue ? (
                                        <p className="flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                                          <AlertTriangle className="h-3 w-3" />
                                          {issue}
                                        </p>
                                      ) : (
                                        <p className="font-mono text-[11px] text-slate-400">{formatNPR(Number(m?.price ?? l.price))} each</p>
                                      )}
                                    </div>
                                    <span className="rounded-lg bg-fuchsia-50 px-2 py-1 font-mono text-xs font-black text-fuchsia-700">×{l.quantity}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        </>
                      )}

                      <div className="rounded-xl bg-slate-50 p-3.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Description</p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-700">{selectedMenuItem.description}</p>
                      </div>

                      <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 p-3.5">
                        <Barcode className="h-4 w-4 shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">SKU / Barcode Reference</p>
                          <p className="truncate font-mono text-xs font-semibold text-slate-800">{selectedMenuItem.skuBarcodeReference || '—'}</p>
                        </div>
                      </div>

                      {canEditOrDelete ? (
                        <div className="space-y-2.5 border-t border-slate-100 pt-4">
                          <div className="grid grid-cols-2 gap-2">
                            {selectedMenuItem.status !== 'Available' ? (
                              <button
                                onClick={() => handleQuickStatus(selectedMenuItem, 'Available')}
                                disabled={togglingId === selectedMenuItem._id}
                                className="col-span-2 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-emerald-50 py-2.5 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200 transition-colors hover:bg-emerald-100 disabled:opacity-60"
                              >
                                {togglingId === selectedMenuItem._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                {en ? 'Mark Available' : 'उपलब्ध बनाउनुहोस्'}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleQuickStatus(selectedMenuItem, 'Sold Out')}
                                disabled={togglingId === selectedMenuItem._id}
                                className="col-span-2 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-amber-50 py-2.5 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-200 transition-colors hover:bg-amber-100 disabled:opacity-60"
                              >
                                {togglingId === selectedMenuItem._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                                {en ? 'Mark Sold Out' : 'सकियो भनेर चिन्ह लगाउनुहोस्'}
                              </button>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => openEditModal(selectedMenuItem)}
                              className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-white shadow-md transition-all hover:shadow-lg ${
                                combo ? 'bg-gradient-to-br from-fuchsia-600 to-purple-600 shadow-fuchsia-500/25' : 'bg-gradient-to-br from-purple-600 to-violet-600 shadow-purple-500/25'
                              }`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              {combo ? (en ? 'Edit combo' : 'कम्बो सम्पादन') : en ? 'Edit' : 'सम्पादन गर्नुहोस्'}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(selectedMenuItem._id)}
                              className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-rose-50 py-2.5 text-xs font-bold text-rose-600 ring-1 ring-inset ring-rose-100 transition-colors hover:bg-rose-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {en ? 'Delete' : 'मेटाउनुहोस्'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-3 rounded-xl border border-rose-100 bg-rose-50/60 p-3.5 text-xs text-rose-800">
                          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                          <div>
                            <p className="font-bold">{en ? 'Action Restricted' : 'कार्य प्रतिबन्धित'}</p>
                            <p className="mt-0.5">{t.restrictedAction}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className={`${CARD} p-8 text-center`}>
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-50 text-purple-500">
                  <UtensilsCrossed className="h-7 w-7" />
                </div>
                <p className="text-sm text-slate-500">
                  {en ? 'Select a menu item from the list to view details.' : 'विवरण हेर्न मेनु वस्तु छान्नुहोस्।'}
                </p>
              </div>
            )}

            {/* Unavailable summary */}
            {!loading && !loadError && menuItems.length > 0 && (
              <div className={`${CARD} space-y-3 p-5`}>
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  {en ? 'Unavailable Items' : 'अनुपलब्ध वस्तुहरू'}
                  {unavailableItems.length > 0 && (
                    <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{unavailableItems.length}</span>
                  )}
                </h3>
                <div className="mm-scroll max-h-[200px] space-y-1.5 overflow-y-auto pr-1">
                  {unavailableItems.length === 0 ? (
                    <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      {en ? 'All menu items are available.' : 'सबै वस्तुहरू उपलब्ध छन्।'}
                    </p>
                  ) : (
                    unavailableItems.map((m) => (
                      <button
                        key={m._id}
                        onClick={() => setSelectedMenuItem(m)}
                        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-amber-100 bg-amber-50/50 p-2.5 text-left text-xs transition-colors hover:bg-amber-50"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span>{getCat(isComboItem(m) ? COMBO : m.category).emoji}</span>
                          <span className="truncate font-semibold text-slate-800">{m.itemName}</span>
                        </span>
                        <span className="shrink-0 font-bold text-amber-700">{m.status}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==========================================
          ADD / EDIT MODAL (Orders-style split layout)
      ========================================== */}
      {showFormModal && mounted && createPortal(
        <div
          className="mm-fade fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2 backdrop-blur-[3px] sm:p-4"
          id="menu-form-modal"
          onClick={() => !submitting && closeModal()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-form-title"
            onClick={(e) => e.stopPropagation()}
            className={`mm-pop flex max-h-[88vh] w-full flex-col overflow-hidden rounded-3xl border border-purple-100 bg-[#fbfaff] shadow-2xl shadow-purple-900/20 transition-[max-width] duration-300 ${
              formIsCombo ? 'max-w-6xl' : 'max-w-2xl'
            }`}
          >
            {/* Header */}
            <div
              className={`flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4 ${
                formIsCombo
                  ? 'border-fuchsia-100 bg-gradient-to-r from-fuchsia-50 via-purple-50 to-white'
                  : 'border-purple-100 bg-gradient-to-r from-purple-50 via-white to-white'
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg ${
                    formIsCombo
                      ? 'bg-gradient-to-br from-fuchsia-600 to-purple-600 shadow-fuchsia-500/30'
                      : 'bg-gradient-to-br from-purple-600 to-violet-600 shadow-purple-500/30'
                  }`}
                >
                  {formIsCombo ? (
                    <span className="text-xl leading-none">🍱</span>
                  ) : formMode === 'edit' ? (
                    <Pencil className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Plus className="h-5 w-5" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 id="menu-form-title" className="truncate text-lg font-bold tracking-tight text-slate-900">
                    {formIsCombo
                      ? formMode === 'edit'
                        ? en ? 'Edit Combo' : 'कम्बो सम्पादन'
                        : en ? 'Create Combo' : 'कम्बो बनाउनुहोस्'
                      : formMode === 'edit'
                      ? en ? 'Edit Menu Item' : 'मेनु वस्तु सम्पादन गर्नुहोस्'
                      : en ? 'Add Menu Item' : 'मेनु वस्तु थप्नुहोस्'}
                  </h2>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
                    <span>Restaurant ID:</span>
                    <span className="font-mono font-semibold text-purple-700">{formData.restaurantId || '—'}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {formIsCombo && (
                  <span className="hidden items-center gap-1.5 rounded-full bg-fuchsia-600 px-3 py-1 text-[11px] font-bold text-white shadow-sm sm:inline-flex">
                    <Layers className="h-3.5 w-3.5" />
                    {formComboQty} {en ? 'items' : 'वस्तु'}
                  </span>
                )}
                <button
                  onClick={closeModal}
                  disabled={submitting}
                  aria-label="Close"
                  className="cursor-pointer rounded-xl p-2 text-slate-400 transition-colors hover:bg-white hover:text-slate-900 disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Mobile tab switch (combo only) */}
            {formIsCombo && (
              <div className="flex shrink-0 gap-1 border-b border-fuchsia-100 bg-white p-2 lg:hidden" role="tablist">
                {([
                  ['details', en ? 'Details' : 'विवरण', Pencil],
                  ['combo', `${en ? 'Combo' : 'कम्बो'} (${formComboQty})`, Layers],
                ] as const).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={formTab === key}
                    onClick={() => setFormTab(key as FormTab)}
                    className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl py-2 text-sm font-bold transition-all ${
                      formTab === key ? 'bg-fuchsia-600 text-white shadow-sm' : 'text-slate-500 hover:bg-fuchsia-50'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" id="menu-form">
              {formError && (
                <div role="alert" className="mx-3 mt-3 flex shrink-0 items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs font-medium text-rose-700 sm:mx-5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {formError}
                </div>
              )}

              <div
                className={`grid min-h-0 flex-1 gap-4 p-3 sm:p-5 ${
                  formIsCombo ? 'grid-cols-1 lg:grid-cols-12' : 'grid-cols-1'
                }`}
              >
                {/* ===== LEFT: ITEM DETAILS ===== */}
                <div className={`min-h-0 ${formIsCombo ? `lg:col-span-5 ${formTab === 'details' ? 'flex' : 'hidden'} lg:flex` : 'flex'}`}>
                  <div className={`${CARD} flex min-h-0 w-full flex-col`}>
                    <div className="flex shrink-0 items-center gap-2.5 border-b border-slate-100 px-5 py-4">
                      <Pencil className="h-4 w-4 text-purple-600" aria-hidden="true" />
                      <h3 className="text-sm font-bold text-slate-900">{en ? 'Item details' : 'वस्तु विवरण'}</h3>
                    </div>

                    <div className="mm-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
                      {/* 📷 Photo */}
                      <div className="space-y-1.5">
                        <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                          {en ? 'Photo (optional)' : 'फोटो (ऐच्छिक)'}
                        </span>
                        <div className="flex items-center gap-3">
                          <div className={`flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-3xl ring-1 ring-inset ${getCat(formData.category).tile}`}>
                            <MenuImage src={imagePreview} fallback={getCat(formData.category).emoji} size={300} />
                          </div>
                          <div className="flex flex-col items-start gap-1.5">
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-purple-50 px-3 py-2 text-xs font-bold text-purple-700 ring-1 ring-inset ring-purple-100 transition-colors hover:bg-purple-100">
                              <ImagePlus className="h-4 w-4" />
                              {imagePreview ? (en ? 'Change photo' : 'फोटो बदल्नुहोस्') : (en ? 'Upload photo' : 'फोटो अपलोड गर्नुहोस्')}
                              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePickImage} />
                            </label>
                            {imagePreview && (
                              <button
                                type="button"
                                onClick={handleRemoveImage}
                                className="cursor-pointer text-xs font-semibold text-rose-600 hover:underline"
                              >
                                {en ? 'Remove photo' : 'फोटो हटाउनुहोस्'}
                              </button>
                            )}
                            <span className="text-[11px] text-slate-400">
                              {en ? 'JPG, PNG or WebP · max 5 MB. No photo = category icon.' : 'JPG, PNG वा WebP · ५ MB सम्म। फोटो छैन भने श्रेणी आइकन देखिन्छ।'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Category */}
                      <div className="space-y-1.5">
                        <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                          Category <span className="text-rose-500">*</span>
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                          {REGULAR_CATEGORIES.map((cat) => {
                            const selected = formData.category === cat;
                            return (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => handleFormChange('category', cat)}
                                aria-pressed={selected}
                                className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 px-2 py-2.5 text-[11px] font-semibold transition-all ${
                                  selected
                                    ? 'border-purple-500 bg-purple-50 text-purple-800 shadow-sm'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-purple-200'
                                }`}
                              >
                                <span className="text-xl">{getCat(cat).emoji}</span>
                                {cat}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleFormChange('category', COMBO)}
                          aria-pressed={formIsCombo}
                          className={`relative mt-2 flex w-full cursor-pointer items-center gap-3 overflow-hidden rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                            formIsCombo
                              ? 'border-fuchsia-500 bg-gradient-to-r from-fuchsia-50 to-purple-50 shadow-sm'
                              : 'border-dashed border-fuchsia-200 bg-white hover:border-fuchsia-300 hover:bg-fuchsia-50/40'
                          }`}
                        >
                          {!formIsCombo && <span className="mm-shine pointer-events-none absolute inset-0" />}
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-xl shadow-sm ring-1 ring-fuchsia-100">🍱</span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-xs font-bold ${formIsCombo ? 'text-fuchsia-800' : 'text-slate-800'}`}>
                              {en ? 'Combo meal' : 'कम्बो'}
                            </span>
                            <span className="block text-[11px] text-slate-500">
                              {en ? 'Bundle several menu items at one price' : 'धेरै वस्तु एउटै मूल्यमा'}
                            </span>
                          </span>
                          {formIsCombo && <CheckCircle2 className="h-5 w-5 shrink-0 text-fuchsia-600" />}
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <label htmlFor="mm-name" className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                          {formIsCombo ? (en ? 'Combo name' : 'कम्बोको नाम') : 'Item Name'} <span className="text-rose-500">*</span>
                        </label>
                        <input
                          id="mm-name"
                          type="text"
                          required
                          autoFocus
                          value={formData.itemName}
                          onChange={(e) => handleFormChange('itemName', e.target.value)}
                          placeholder={formIsCombo ? 'e.g. Momo & Coke Combo' : 'e.g. Chicken Momo'}
                          className={inputBase}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label htmlFor="mm-desc" className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                            Description <span className="text-rose-500">*</span>
                          </label>
                          <div className="flex items-center gap-2">
                            {formIsCombo && formData.comboItems.length > 0 && (
                              <button
                                type="button"
                                onClick={writeComboDescription}
                                className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-fuchsia-50 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-700 hover:bg-fuchsia-100"
                              >
                                <Wand2 className="h-3 w-3" />
                                {en ? 'Write from items' : 'वस्तुबाट लेख्नुहोस्'}
                              </button>
                            )}
                            <span className="text-[10px] text-slate-400">{formData.description.length}/200</span>
                          </div>
                        </div>
                        <textarea
                          id="mm-desc"
                          required
                          rows={2}
                          maxLength={200}
                          value={formData.description}
                          onChange={(e) => handleFormChange('description', e.target.value)}
                          placeholder={formIsCombo ? 'e.g. Includes 1× Chicken Momo, 1× Coke' : 'e.g. Steamed dumplings served with spicy tomato chutney'}
                          className={`${inputBase} resize-none`}
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label htmlFor="mm-price" className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                            {formIsCombo ? (en ? 'Combo price' : 'कम्बो मूल्य') : 'Price (NPR)'} <span className="text-rose-500">*</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">NPR</span>
                            <input
                              id="mm-price"
                              type="number"
                              required
                              min="0"
                              step="0.01"
                              value={formData.price}
                              onChange={(e) => handleFormChange('price', e.target.value)}
                              placeholder="0.00"
                              className={`${inputBase} pl-12 font-mono font-bold`}
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label htmlFor="mm-sku" className="block text-xs font-bold uppercase tracking-wider text-slate-500">SKU Barcode Reference</label>
                          <input
                            id="mm-sku"
                            type="text"
                            value={formData.skuBarcodeReference}
                            onChange={(e) => handleFormChange('skuBarcodeReference', e.target.value)}
                            placeholder="Optional"
                            className={`${inputBase} font-mono`}
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Status</span>
                        <div className="grid grid-cols-3 gap-2">
                          {STATUS_OPTIONS.map((s) => {
                            const selected = formData.status === s;
                            const sm = getStatus(s);
                            return (
                              <button
                                key={s}
                                type="button"
                                onClick={() => handleFormChange('status', s)}
                                aria-pressed={selected}
                                className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border-2 px-2 py-2.5 text-xs font-semibold transition-all ${
                                  selected
                                    ? 'border-purple-500 bg-purple-50 text-purple-800 shadow-sm'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-purple-200'
                                }`}
                              >
                                <span className={`h-2 w-2 rounded-full ${sm.dot}`} />
                                {s}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {formIsCombo && formComboQty < 2 && (
                        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200 lg:hidden">
                          {en ? 'Add at least 2 items on the Combo tab to save.' : 'कम्तीमा २ वस्तु थप्नुहोस्।'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* ===== RIGHT: COMBO BUILDER ===== */}
                {formIsCombo && (
                  <div className={`min-h-0 lg:col-span-7 ${formTab === 'combo' ? 'flex' : 'hidden'} lg:flex`}>
                    <div className={`${CARD} flex min-h-0 w-full flex-col`}>
                      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <Layers className="h-4 w-4 text-fuchsia-600" aria-hidden="true" />
                          <h3 className="text-sm font-bold text-slate-900">{en ? "What's in this combo" : 'कम्बोमा के छ'}</h3>
                        </div>
                        <span
                          key={formComboQty}
                          className={`mm-card rounded-full px-3 py-1 font-mono text-xs font-bold ${
                            formComboQty >= 2 ? 'bg-fuchsia-600 text-white' : 'bg-fuchsia-50 text-fuchsia-700 ring-1 ring-inset ring-fuchsia-200'
                          }`}
                        >
                          {formComboQty} {en ? 'items' : 'वस्तु'}
                        </span>
                      </div>

                      <div className="mm-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                        {/* Selected lines */}
                        <div className="space-y-1.5">
                          {formData.comboItems.length === 0 ? (
                            <div className="rounded-2xl border-2 border-dashed border-fuchsia-200 bg-fuchsia-50/30 px-3 py-6 text-center">
                              <p className="text-2xl">🥟 + 🥤</p>
                              <p className="mt-1 text-xs font-semibold text-slate-600">
                                {en ? 'Tap items below to add them' : 'तलका वस्तु थिचेर थप्नुहोस्'}
                              </p>
                              <p className="text-[11px] text-slate-400">{en ? 'A combo needs at least 2 items.' : 'कम्तीमा २ वस्तु चाहिन्छ।'}</p>
                            </div>
                          ) : (
                            formData.comboItems.map((l) => {
                              const m = menuById[l.menuItemId];
                              const lc = getCat(m?.category || 'Other');
                              const unit = Number(m?.price ?? l.price) || 0;
                              return (
                                <div key={l.menuItemId} className="mm-card flex items-center gap-2.5 rounded-xl border border-fuchsia-100 bg-white p-2">
                                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg ring-1 ring-inset ${lc.tile}`}>{lc.emoji}</span>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-bold text-slate-800">{l.itemName}</p>
                                    <p className="font-mono text-[10px] text-slate-400">{formatNPR(unit * l.quantity)}</p>
                                  </div>
                                  <div className="inline-flex items-center gap-1 rounded-lg bg-fuchsia-50 p-0.5 ring-1 ring-inset ring-fuchsia-100">
                                    <button
                                      type="button"
                                      onClick={() => changeComboQty(l.menuItemId, -1)}
                                      aria-label={`Fewer ${l.itemName}`}
                                      className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-white text-fuchsia-700 shadow-sm hover:bg-fuchsia-600 hover:text-white"
                                    >
                                      <Minus className="h-3 w-3" />
                                    </button>
                                    <span className="min-w-[18px] text-center font-mono text-xs font-bold text-fuchsia-900">{l.quantity}</span>
                                    <button
                                      type="button"
                                      onClick={() => changeComboQty(l.menuItemId, 1)}
                                      aria-label={`More ${l.itemName}`}
                                      className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-fuchsia-600 text-white shadow-sm hover:bg-fuchsia-700"
                                    >
                                      <Plus className="h-3 w-3" />
                                    </button>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeComboLine(l.menuItemId)}
                                    aria-label={`Remove ${l.itemName}`}
                                    className="cursor-pointer rounded-md p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>

                        {/* Value summary */}
                        {formData.comboItems.length > 0 && (
                          <div className="space-y-2 rounded-xl border border-fuchsia-100 bg-fuchsia-50/40 p-3">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500">{en ? 'Bought separately' : 'छुट्टाछुट्टै'}</span>
                              <span className="font-mono font-semibold text-slate-700">{formatNPR(formComboWorth)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500">{en ? 'Combo price' : 'कम्बो मूल्य'}</span>
                              <span className="font-mono font-bold text-fuchsia-700">{formData.price ? formatNPR(formPrice) : '—'}</span>
                            </div>
                            {formData.price && (
                              <div
                                className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                                  formSave > 0 ? 'bg-emerald-50 text-emerald-700' : formSave < 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600'
                                }`}
                              >
                                <span className="flex items-center gap-1">
                                  <BadgePercent className="h-3.5 w-3.5" />
                                  {formSave > 0
                                    ? en ? 'Customer saves' : 'ग्राहकले बचत गर्छ'
                                    : formSave < 0
                                    ? en ? 'Costs more than separately' : 'छुट्टै भन्दा महँगो'
                                    : en ? 'Same as separately' : 'उस्तै मूल्य'}
                                </span>
                                <span className="font-mono">
                                  {formatNPR(Math.abs(formSave))}
                                  {formSave > 0 && formSavePct > 0 ? ` (${formSavePct}%)` : ''}
                                </span>
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{en ? 'Quick price' : 'छिटो मूल्य'}</span>
                              {COMBO_DISCOUNTS.map((p) => (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => applyComboDiscount(p)}
                                  className="cursor-pointer rounded-full border border-fuchsia-200 bg-white px-2.5 py-1 text-[11px] font-bold text-fuchsia-700 transition hover:bg-fuchsia-600 hover:text-white active:scale-95"
                                >
                                  -{p}%
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Picker */}
                        <div className="space-y-2 border-t border-slate-100 pt-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{en ? 'Add items' : 'वस्तु थप्नुहोस्'}</p>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              value={comboSearch}
                              onChange={(e) => setComboSearch(e.target.value)}
                              placeholder={en ? 'Find a menu item to add...' : 'थप्न वस्तु खोज्नुहोस्...'}
                              aria-label={en ? 'Search items to add to the combo' : 'कम्बोमा थप्न खोज्नुहोस्'}
                              className="w-full rounded-xl border border-fuchsia-200 bg-white py-2 pl-9 pr-3 text-xs outline-none transition focus:border-fuchsia-500 focus:ring-4 focus:ring-fuchsia-500/10"
                            />
                          </div>
                          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                            {comboPickable.length === 0 ? (
                              <p className="col-span-full rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-400">
                                {menuItems.filter((m) => !isComboItem(m)).length === 0
                                  ? en ? 'Add some regular menu items first.' : 'पहिले साधारण वस्तु थप्नुहोस्।'
                                  : en ? 'No items match.' : 'कुनै वस्तु भेटिएन।'}
                              </p>
                            ) : (
                              comboPickable.map((m) => {
                                const mc = getCat(m.category);
                                const inCombo = formData.comboItems.find((l) => l.menuItemId === m._id);
                                const unavailable = m.status !== 'Available';
                                return (
                                  <button
                                    key={m._id}
                                    type="button"
                                    onClick={() => addComboLine(m)}
                                    className={`flex cursor-pointer items-center gap-2.5 rounded-xl p-2 text-left transition-all active:scale-[0.99] ${
                                      inCombo ? 'bg-fuchsia-100/70 ring-1 ring-fuchsia-300' : 'bg-white ring-1 ring-slate-100 hover:ring-fuchsia-200'
                                    }`}
                                  >
                                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ring-1 ring-inset ${mc.tile} ${unavailable ? 'opacity-50 grayscale' : ''}`}>
                                      {mc.emoji}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-xs font-semibold text-slate-800">{m.itemName}</span>
                                      <span className="block font-mono text-[10px] text-slate-400">
                                        {formatNPR(m.price)}
                                        {unavailable && <span className="ml-1 font-sans font-bold text-amber-600">· {m.status}</span>}
                                      </span>
                                    </span>
                                    {inCombo ? (
                                      <span className="rounded-md bg-fuchsia-600 px-1.5 py-0.5 text-[10px] font-black text-white">×{inCombo.quantity}</span>
                                    ) : (
                                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-100">
                                        <Plus className="h-3.5 w-3.5" />
                                      </span>
                                    )}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-4">
                <p className="hidden truncate text-xs text-slate-400 sm:block">
                  {formIsCombo && formComboQty < 2 ? (en ? 'Add at least 2 items to save the combo.' : 'कम्तीमा २ वस्तु थप्नुहोस्।') : ''}
                </p>
                <div className="ml-auto flex gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={submitting}
                    className="cursor-pointer rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={submitDisabled}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none ${
                      formIsCombo ? 'bg-gradient-to-br from-fuchsia-600 to-purple-600 shadow-fuchsia-500/30' : 'bg-gradient-to-br from-purple-600 to-violet-600 shadow-purple-500/30'
                    }`}
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {formMode === 'edit'
                      ? en ? 'Save Changes' : 'परिवर्तन सुरक्षित गर्नुहोस्'
                      : formIsCombo
                      ? en ? 'Create Combo' : 'कम्बो बनाउनुहोस्'
                      : en ? 'Add Item' : 'थप्नुहोस्'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ---------- DELETE CONFIRMATION ---------- */}
      {confirmDeleteId && (
        <div
          className="mm-fade fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[3px]"
          onClick={() => !deletingId && setConfirmDeleteId(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            className="mm-pop w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <Trash2 className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">
              {itemToDelete && isComboItem(itemToDelete)
                ? en ? 'Delete this combo?' : 'यो कम्बो मेटाउने हो?'
                : en ? 'Delete this menu item?' : 'यो मेनु वस्तु मेटाउने हो?'}
            </h3>
            {itemToDelete && (
              <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-800">
                {getCat(isComboItem(itemToDelete) ? COMBO : itemToDelete.category).emoji} {itemToDelete.itemName}
              </p>
            )}
            {combosUsingItem.length > 0 && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-900">
                <p className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {en ? `Used in ${combosUsingItem.length} combo${combosUsingItem.length > 1 ? 's' : ''}` : `${combosUsingItem.length} कम्बोमा प्रयोग`}
                </p>
                <p className="mt-1 text-amber-800">{combosUsingItem.map((c) => c.itemName).join(', ')}</p>
                <p className="mt-1 text-amber-700">
                  {en ? 'Those combos will show it as removed until you edit them.' : 'ती कम्बो सम्पादन नगरेसम्म यो हटाइएको देखिनेछ।'}
                </p>
              </div>
            )}
            <p className="mt-3 text-sm text-slate-500">
              {en ? 'This will permanently remove it from your menu. This cannot be undone.' : 'यो कार्य पूर्ववत गर्न सकिँदैन।'}
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                disabled={deletingId === confirmDeleteId}
                className="flex-1 cursor-pointer rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                disabled={deletingId === confirmDeleteId}
                className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-600/25 transition-colors hover:bg-rose-500 disabled:opacity-70"
              >
                {deletingId === confirmDeleteId && <Loader2 className="h-4 w-4 animate-spin" />}
                {en ? 'Delete' : 'मेटाउनुहोस्'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}