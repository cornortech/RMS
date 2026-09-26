import React, { useState, useEffect, useRef } from 'react';
import {
  Building2,
  UserPlus,
  Edit3,
  Trash2,
  LogOut,
  ShieldCheck,
  Activity,
  Search,
  CheckCircle,
  XCircle,
  RefreshCw,
  KeyRound,
  Eye,
  EyeOff,
  User,
  Plus,
  Phone,
  Mail,
  MapPin,
  FileText,
  Clock,
  TimerReset,
  AlertTriangle,
  Users,
  Sparkles
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================
interface UserPayload {
  _id: string;
  id: string;
  restaurantName?: string;
  RESTAURANTName?: string;
}

interface RESTAURANTAccount {
  _id: string;
  id: string;
  restaurantName?: string;
  RESTAURANTName?: string;
  isActive: boolean;
  password?: string;
  phone?: string;
  email?: string;
  location?: string;
  PanOrVat?: string;
  role?: string;      // used to detect the admin account
  isAdmin?: boolean;  // used to detect the admin account
  totalTime?: number;     // subscription length, in days
  remainingTime?: number; // days left on the subscription
}

// Staff login account (saved in RESTAURANTStaff collection only)
interface StaffAccount {
  _id: string;
  id: string;
  RESTAURANTName: string;
  staffName?: string;
  role: string;
  isActive: boolean;
  password?: string;
}

interface AdminDashboardProps {
  user: UserPayload;
  lang: 'en' | 'ne';
  onLogout: () => void;
}

// Role options for staff accounts (RESTAURANTStaff collection)
// Matches the ROLE_ACCESS map in App.tsx: Manager, Waiter, Kitchen Staff, Cashier.
const STAFF_ROLES = [
  'Manager',
  'Waiter',
  'Kitchen Staff',
  'Cashier',
];

// Accounts with one of these login IDs are treated as admin and pinned to the top of the table.
// (The logged-in admin, role "admin" and isAdmin === true are detected automatically.)
const ADMIN_LOGIN_IDS = ['admin'];

const DEFAULT_PLAN_DAYS = 30;

// ============================================================
// SMALL HELPERS
// ============================================================

// Reads a response body without ever throwing (the server may send HTML or an empty body).
const readJsonSafe = async (response: Response): Promise<any> => {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  } catch (err) {
    return {};
  }
};

// Picks the most useful error text from a server response.
const getServerMessage = (data: any, response: Response, fallback: string): string =>
  data?.message || data?.error || `${fallback} (HTTP ${response.status})`;

// Authorization header for the /api/staff routes.
// Uses the real login token if your app saved one (localStorage key "token"),
// otherwise falls back to the same placeholder that was used before.
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
  return { Authorization: `Bearer ${token || 'mock-jwt-token'}` };
};

// Two-letter initials for the avatar badge, e.g. "Everest Kitchen" -> "EK"
const getInitials = (name: string): string => {
  const clean = String(name || '').trim();
  if (!clean) return '??';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

// Turns remaining/total days into a color + label for the subscription bar.
const getTimeStatus = (remaining: number, total: number) => {
  const safeTotal = total > 0 ? total : 1;
  const pct = Math.max(0, Math.min(100, (remaining / safeTotal) * 100));
  if (remaining <= 0) {
    return { pct, bar: 'bg-rose-500', text: 'text-rose-700', bg: 'bg-rose-50', ring: 'border-rose-100', label: 'Expired' };
  }
  if (pct <= 20) {
    return { pct, bar: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', ring: 'border-amber-100', label: 'Expiring soon' };
  }
  return { pct, bar: 'bg-purple-500', text: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'border-emerald-100', label: 'Healthy' };
};

// ============================================================
// COMPONENT
// ============================================================
export default function AdminDashboard({ user, lang, onLogout }: AdminDashboardProps) {
  // ---------- Restaurant account list + form state ----------
  const [Restaurants, setRestaurants] = useState<RESTAURANTAccount[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form States for Creating/Editing RESTAURANT Accounts
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formRESTAURANTName, setFormRESTAURANTName] = useState('');
  const [formId, setFormId] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formPanOrVat, setFormPanOrVat] = useState('');
  const [formTotalTime, setFormTotalTime] = useState(String(DEFAULT_PLAN_DAYS));
  const [formRemainingTime, setFormRemainingTime] = useState(String(DEFAULT_PLAN_DAYS));

  // ---------- Staff modal state ----------
  const [selectedRESTAURANT, setSelectedRESTAURANT] = useState<string | null>(null);
  const [RESTAURANTStaff, setRESTAURANTStaff] = useState<StaffAccount[]>([]);
  const [isStaffLoading, setIsStaffLoading] = useState(false);
  const [isStaffSaving, setIsStaffSaving] = useState(false);

  const [isStaffEditing, setIsStaffEditing] = useState(false);
  const [staffEditingId, setStaffEditingId] = useState<string | null>(null);
  const [staffFormId, setStaffFormId] = useState('');
  const [staffFormName, setStaffFormName] = useState('');
  const [staffFormPassword, setStaffFormPassword] = useState('');
  const [staffFormRole, setStaffFormRole] = useState(STAFF_ROLES[0]);
  const [staffFormIsActive, setStaffFormIsActive] = useState(true);
  const [showStaffPassword, setShowStaffPassword] = useState(false);

  const BACKEND_URL = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');

  const t = {
    en: {
      dashTitle: "Admin Central Command",
      welcome: "Logged in as Admin:",
      searchPlaceholder: "Search Restaurant by name or ID...",
      createHeading: "Register New Restaurant User",
      editHeading: "Modify Restaurant Account Details",
      tableAction: "Actions",
      tableName: "Restaurant Store Name",
      tableId: "System ID",
      tableStatus: "Account Status",
      tableLocation: "Location",
      tableTime: "Subscription",
      submitCreate: "Register System Account",
      submitUpdate: "Save Configuration Changes",
      cancelBtn: "Discard Changes",
      active: "Active",
      inactive: "Deactivated",
      adminBadge: "Admin",
      statTotal: "Total Restaurants",
      statActive: "Active Accounts",
      statInactive: "Deactivated",
      statExpiring: "Expiring Soon"
    },
    ne: {
      dashTitle: "प्रशासक केन्द्रीय कमान्ड",
      welcome: "एडमिनको रूपमा लगइन गरिएको छ:",
      searchPlaceholder: "रेस्टुरेन्टको नाम वा ID खोज्नुहोस्...",
      createHeading: "नयाँ रेस्टुरेन्ट प्रयोगकर्ता दर्ता गर्नुहोस्",
      editHeading: "रेस्टुरेन्ट खाता विवरण परिमार्जन गर्नुहोस्",
      tableAction: "कार्यहरू",
      tableName: "रेस्टुरेन्ट पसलको नाम",
      tableId: "प्रणाली ID",
      tableStatus: "खाता स्थिति",
      tableLocation: "स्थान",
      tableTime: "सदस्यता",
      submitCreate: "प्रणाली खाता दर्ता गर्नुहोस्",
      submitUpdate: "परिवर्तनहरू बचत गर्नुहोस्",
      cancelBtn: "रद्द गर्नुहोस्",
      active: "सक्रिय",
      inactive: "निष्क्रिय",
      adminBadge: "एडमिन",
      statTotal: "कुल रेस्टुरेन्ट",
      statActive: "सक्रिय खाताहरू",
      statInactive: "निष्क्रिय",
      statExpiring: "चाँडै सकिने"
    }
  }[lang];

  // ---------- Toast message ----------
  const showNotice = (type: 'success' | 'error', msg: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotification({ type, msg });
    noticeTimer.current = setTimeout(() => setNotification(null), type === 'error' ? 7000 : 4000);
  };

  // Makes sure BOTH name spellings exist on every restaurant object, and that
  // time fields always fall back to sane numeric defaults.
  const normalizeRestaurant = (item: any): RESTAURANTAccount => {
    const name = item?.RESTAURANTName || item?.restaurantName || '';
    const totalTime = Number.isFinite(Number(item?.totalTime)) ? Number(item.totalTime) : DEFAULT_PLAN_DAYS;
    const remainingTime = Number.isFinite(Number(item?.remainingTime)) ? Number(item.remainingTime) : totalTime;
    return { ...item, RESTAURANTName: name, restaurantName: name, totalTime, remainingTime };
  };

  // 🔄 FETCH RESTAURANT LOGIN ACCOUNTS (RESTAURANTUser collection — NOT staff)
  const fetchAllRestaurants = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/admin/users`);
      const resData = await readJsonSafe(response);

      if (response.ok && resData.success) {
        const list = Array.isArray(resData.data) ? resData.data : [];
        setRestaurants(list.map(normalizeRestaurant));
      } else {
        showNotice('error', getServerMessage(resData, response, 'Failed to fetch user list.'));
      }
    } catch (err) {
      showNotice('error', 'Database connection failed.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllRestaurants();
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormRESTAURANTName('');
    setFormId('');
    setFormPassword('');
    setFormIsActive(true);
    setShowPassword(false);
    setFormPhone('');
    setFormEmail('');
    setFormLocation('');
    setFormPanOrVat('');
    setFormTotalTime(String(DEFAULT_PLAN_DAYS));
    setFormRemainingTime(String(DEFAULT_PLAN_DAYS));
  };

  const startEditMode = (resto: RESTAURANTAccount) => {
    setIsEditing(true);
    setEditingId(resto._id);
    setFormRESTAURANTName(resto.RESTAURANTName || resto.restaurantName || '');
    setFormId(resto.id);
    setFormIsActive(resto.isActive);
    setFormPassword('');
    setFormPhone(resto.phone || '');
    setFormEmail(resto.email || '');
    setFormLocation(resto.location || '');
    setFormPanOrVat(resto.PanOrVat || '');
    setFormTotalTime(String(resto.totalTime ?? DEFAULT_PLAN_DAYS));
    setFormRemainingTime(String(resto.remainingTime ?? resto.totalTime ?? DEFAULT_PLAN_DAYS));
  };

  // ➕ CREATE NEW RESTAURANT LOGIN ACCOUNT (RESTAURANTUser)
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formPhone.trim() || !formEmail.trim() || !formLocation.trim()) {
      showNotice('error', 'Phone, email and location are required.');
      return;
    }

    const totalTime = Math.max(1, Number(formTotalTime) || DEFAULT_PLAN_DAYS);

    try {
      const response = await fetch(`${BACKEND_URL}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          RESTAURANTName: formRESTAURANTName,
          id: formId,
          password: formPassword,
          phone: formPhone,
          email: formEmail,
          location: formLocation,
          PanOrVat: formPanOrVat,
          // Remaining time always starts equal to the total plan length on creation.
          totalTime,
          remainingTime: totalTime
        })
      });
      const data = await readJsonSafe(response);

      if (response.ok && data.success) {
        showNotice('success', 'Successfully generated new secure account profile!');
        if (data.data) {
          setRestaurants(prev => [...prev, normalizeRestaurant(data.data)]);
        }
        resetForm();
      } else {
        showNotice('error', getServerMessage(data, response, 'Validation matching check rejected.'));
      }
    } catch (err) {
      showNotice('error', 'Server offline during registration processing.');
    }
  };

  // ✏️ UPDATE RESTAURANT LOGIN ACCOUNT (RESTAURANTUser)
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;

    const totalTime = Math.max(1, Number(formTotalTime) || DEFAULT_PLAN_DAYS);
    const remainingTime = Math.max(0, Number(formRemainingTime) || 0);

    try {
      const response = await fetch(`${BACKEND_URL}/api/admin/users/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          RESTAURANTName: formRESTAURANTName,
          isActive: formIsActive,
          password: formPassword || undefined,
          phone: formPhone,
          email: formEmail,
          location: formLocation,
          PanOrVat: formPanOrVat,
          totalTime,
          remainingTime
        })
      });
      const data = await readJsonSafe(response);

      if (response.ok && data.success) {
        showNotice('success', 'Profile properties committed seamlessly.');
        setRestaurants(prev => prev.map(item => item._id === editingId ? normalizeRestaurant({
          ...item,
          RESTAURANTName: formRESTAURANTName,
          isActive: formIsActive,
          phone: formPhone,
          email: formEmail,
          location: formLocation,
          PanOrVat: formPanOrVat,
          totalTime,
          remainingTime
        }) : item));
        resetForm();
      } else {
        showNotice('error', getServerMessage(data, response, 'Refused to write database adjustments.'));
      }
    } catch (err) {
      showNotice('error', 'Database connection handshake failure during save.');
    }
  };

  // ❌ DELETE RESTAURANT LOGIN ACCOUNT (RESTAURANTUser)
  const handleDeleteUser = async (id: string) => {
    if (!window.confirm("Are you absolutely sure you want to permanently delete this system user profile? This cannot be undone.")) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/admin/users/${id}`, {
        method: 'DELETE'
      });
      const data = await readJsonSafe(response);

      if (response.ok && data.success) {
        showNotice('success', 'Target entity wiped cleanly from collections.');
        setRestaurants(prev => prev.filter(p => p._id !== id));
        if (editingId === id) resetForm();
      } else {
        showNotice('error', getServerMessage(data, response, 'Deletion parameters denied.'));
      }
    } catch (err) {
      showNotice('error', 'Network crash prevented data deletion.');
    }
  };

  // ⏱️ QUICK RENEW — adds N days to both total & remaining time without opening the form
  const handleExtendTime = async (resto: RESTAURANTAccount, days: number) => {
    const currentTotal = resto.totalTime ?? DEFAULT_PLAN_DAYS;
    const currentRemaining = resto.remainingTime ?? currentTotal;
    const newTotal = currentTotal + days;
    const newRemaining = currentRemaining + days;

    try {
      const response = await fetch(`${BACKEND_URL}/api/admin/users/${resto._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalTime: newTotal, remainingTime: newRemaining })
      });
      const data = await readJsonSafe(response);

      if (response.ok && data.success) {
        showNotice('success', `Added ${days} days to ${resto.RESTAURANTName || resto.restaurantName}.`);
        setRestaurants(prev => prev.map(item =>
          item._id === resto._id ? normalizeRestaurant({ ...item, totalTime: newTotal, remainingTime: newRemaining }) : item
        ));
      } else {
        showNotice('error', getServerMessage(data, response, 'Could not extend the subscription.'));
      }
    } catch (err) {
      showNotice('error', 'Network crash prevented the time extension.');
    }
  };

  // ============================================================
  // ADMIN ACCOUNT ALWAYS FIRST IN THE TABLE
  // ============================================================
  const isAdminAccount = (resto: RESTAURANTAccount): boolean => {
    const loginId = String(resto?.id || '').trim().toLowerCase();
    const currentAdminId = String(user?.id || '').trim().toLowerCase();
    const role = String(resto?.role || '').trim().toLowerCase();

    return (
      resto?.isAdmin === true ||
      role.includes('admin') ||
      ADMIN_LOGIN_IDS.includes(loginId) ||
      (!!user?._id && resto?._id === user._id) ||
      (!!currentAdminId && loginId === currentAdminId)
    );
  };

  const filteredRestaurants = Restaurants
    .filter(resto => {
      // Check both uppercase and lowercase variants sent from the backend
      const name = String(resto?.RESTAURANTName || resto?.restaurantName || "").toLowerCase();
      const id = String(resto?.id || "").toLowerCase();
      const query = String(searchQuery || "").toLowerCase();
      const matchesQuery = name.includes(query) || id.includes(query);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && resto.isActive) ||
        (statusFilter === 'inactive' && !resto.isActive);
      return matchesQuery && matchesStatus;
    })
    // Admin first, everyone else keeps their original order (sort is stable)
    .sort((a, b) => Number(isAdminAccount(b)) - Number(isAdminAccount(a)));

  // ---------- Dashboard-wide stats (derived, no extra requests) ----------
  const totalCount = Restaurants.length;
  const activeCount = Restaurants.filter(r => r.isActive).length;
  const inactiveCount = totalCount - activeCount;
  const expiringCount = Restaurants.filter(r => {
    const total = r.totalTime ?? DEFAULT_PLAN_DAYS;
    const remaining = r.remainingTime ?? total;
    return remaining <= Math.max(1, total * 0.2);
  }).length;

  // ============================================================
  // STAFF MANAGEMENT (separate from RESTAURANT login accounts above)
  // Wired to /api/staff endpoints -> RESTAURANTStaff collection only.
  // Only loads when a specific RESTAURANT name is clicked, and only
  // ever shows staff belonging to that one RESTAURANT.
  // ============================================================

  const resetStaffForm = () => {
    setIsStaffEditing(false);
    setStaffEditingId(null);
    setStaffFormId('');
    setStaffFormName('');
    setStaffFormPassword('');
    setStaffFormRole(STAFF_ROLES[0]);
    setStaffFormIsActive(true);
    setShowStaffPassword(false);
  };

  const fetchStaffForRESTAURANT = async (name: string) => {
    setIsStaffLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/admin/staff-by-RESTAURANT/${encodeURIComponent(name)}`);
      const resData = await readJsonSafe(response);

      if (response.ok && resData.success !== false) {
        // Accept: [ ... ]  or  { data: [ ... ] }  or  { staff: [ ... ] }
        const list = Array.isArray(resData)
          ? resData
          : Array.isArray(resData.data)
            ? resData.data
            : Array.isArray(resData.staff)
              ? resData.staff
              : [];
        setRESTAURANTStaff(list);
      } else {
        showNotice('error', getServerMessage(resData, response, 'Could not load RESTAURANT staff.'));
      }
    } catch (err) {
      console.error('Load staff failed:', err);
      showNotice('error', 'Could not load RESTAURANT staff.');
    } finally {
      setIsStaffLoading(false);
    }
  };

  const openRESTAURANTDetails = async (name: string) => {
    if (!name) {
      showNotice('error', 'This account has no restaurant name.');
      return;
    }
    setSelectedRESTAURANT(name);
    setRESTAURANTStaff([]);
    resetStaffForm();
    await fetchStaffForRESTAURANT(name);
  };

  const closeRESTAURANTDetails = () => {
    setSelectedRESTAURANT(null);
    setRESTAURANTStaff([]);
    resetStaffForm();
  };

  // Close the staff modal with Escape for a bit more polish/accessibility.
  useEffect(() => {
    if (!selectedRESTAURANT) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRESTAURANTDetails();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRESTAURANT]);

  const startStaffEditMode = (staff: StaffAccount) => {
    setIsStaffEditing(true);
    setStaffEditingId(staff._id);
    setStaffFormId(staff.id);
    setStaffFormName(staff.staffName || '');
    setStaffFormRole(STAFF_ROLES.includes(staff.role) ? staff.role : STAFF_ROLES[0]);
    setStaffFormIsActive(staff.isActive);
    setStaffFormPassword('');
  };

  // ➕ CREATE NEW STAFF LOGIN ACCOUNT (RESTAURANTStaff)
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStaffSaving) return;

    const restaurantName = selectedRESTAURANT;
    if (!restaurantName) {
      showNotice('error', 'No restaurant selected.');
      return;
    }

    const cleanName = staffFormName.trim();
    const cleanId = staffFormId.trim();

    if (!cleanName || !cleanId || !staffFormPassword.trim()) {
      showNotice('error', 'Please fill in all required fields (Name, ID and Password).');
      return;
    }

    setIsStaffSaving(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/staff/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify({
          restaurantName: restaurantName,
          RESTAURANTName: restaurantName,
          name: cleanName,
          staffName: cleanName,
          id: cleanId,
          password: staffFormPassword,
          role: staffFormRole,
          isActive: staffFormIsActive
        })
      });
      const data = await readJsonSafe(response);

      if (response.ok && data.success !== false) {
        showNotice('success', 'Staff account created.');
        resetStaffForm();
        await fetchStaffForRESTAURANT(restaurantName);
      } else {
        showNotice('error', getServerMessage(data, response, 'Failed to create staff account'));
      }
    } catch (err) {
      console.error('Create staff failed:', err);
      showNotice('error', 'Could not reach the server. Check that the backend is running.');
    } finally {
      setIsStaffSaving(false);
    }
  };

  // ✏️ UPDATE STAFF LOGIN ACCOUNT (RESTAURANTStaff)
  const handleUpdateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStaffSaving) return;

    const restaurantName = selectedRESTAURANT;
    if (!staffEditingId || !restaurantName) return;

    const cleanId = staffFormId.trim();
    if (!cleanId) {
      showNotice('error', 'Staff ID is required.');
      return;
    }

    setIsStaffSaving(true);
    try {
      const payload: Record<string, unknown> = {
        id: cleanId,
        staffName: staffFormName.trim(),
        role: staffFormRole,
        isActive: staffFormIsActive,
        RESTAURANTName: restaurantName
      };
      if (staffFormPassword.trim()) {
        payload.password = staffFormPassword;
      }

      const response = await fetch(`${BACKEND_URL}/api/staff/${staffEditingId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify(payload)
      });
      const data = await readJsonSafe(response);

      if (response.ok && data.success !== false) {
        showNotice('success', 'Staff account updated.');
        await fetchStaffForRESTAURANT(restaurantName);
        resetStaffForm();
      } else {
        showNotice('error', getServerMessage(data, response, 'Failed to update staff account'));
      }
    } catch (err) {
      console.error('Update staff failed:', err);
      showNotice('error', 'Could not reach the server. Check that the backend is running.');
    } finally {
      setIsStaffSaving(false);
    }
  };

  // ❌ DELETE STAFF LOGIN ACCOUNT (RESTAURANTStaff)
  const handleDeleteStaff = async (id: string) => {
    if (!selectedRESTAURANT) return;
    if (!window.confirm("Delete this staff member permanently? This cannot be undone.")) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/staff/${id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeader() }
      });
      const data = await readJsonSafe(response);

      if (response.ok && data.success !== false) {
        showNotice('success', 'Staff member deleted.');
        setRESTAURANTStaff(prev => prev.filter(s => s._id !== id));
        if (staffEditingId === id) resetStaffForm();
      } else {
        showNotice('error', getServerMessage(data, response, 'Failed to delete staff member'));
      }
    } catch (err) {
      console.error('Delete staff failed:', err);
      showNotice('error', 'Network crash prevented staff deletion.');
    }
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 antialiased font-sans">

      {/* Upper Navigation Canopy */}
      <nav className="bg-white border-b border-slate-200/80 sticky top-0 z-50 px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 bg-linear-to-br from-purple-600 to-fuchsia-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-purple-600/20">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">{t?.dashTitle || "Admin Dashboard"}</h1>
            <p className="text-xs text-slate-500 font-medium">{t.welcome} <span className="text-purple-600 font-bold">{user.RESTAURANTName || user.restaurantName}</span></p>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="flex items-center gap-2 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold uppercase tracking-wider rounded-xl transition-all border border-rose-100 cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          <span>Exit Panel</span>
        </button>
      </nav>

      {/* Main Operations Canvas */}
      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">

        {/* Overview stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`text-left bg-white rounded-2xl border p-5 shadow-xs transition-all cursor-pointer hover:-translate-y-0.5 ${
              statusFilter === 'all' ? 'border-purple-300 ring-2 ring-purple-500/10' : 'border-slate-200/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.statTotal}</span>
              <Building2 className="h-4 w-4 text-purple-500" />
            </div>
            <p className="text-2xl font-extrabold text-slate-900 mt-2">{totalCount}</p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`text-left bg-white rounded-2xl border p-5 shadow-xs transition-all cursor-pointer hover:-translate-y-0.5 ${
              statusFilter === 'active' ? 'border-emerald-300 ring-2 ring-emerald-500/10' : 'border-slate-200/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.statActive}</span>
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-extrabold text-slate-900 mt-2">{activeCount}</p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('inactive')}
            className={`text-left bg-white rounded-2xl border p-5 shadow-xs transition-all cursor-pointer hover:-translate-y-0.5 ${
              statusFilter === 'inactive' ? 'border-rose-300 ring-2 ring-rose-500/10' : 'border-slate-200/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.statInactive}</span>
              <XCircle className="h-4 w-4 text-rose-500" />
            </div>
            <p className="text-2xl font-extrabold text-slate-900 mt-2">{inactiveCount}</p>
          </button>

          <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.statExpiring}</span>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-2xl font-extrabold text-slate-900 mt-2">{expiringCount}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Column 1 & 2: RESTAURANT Login Account Directory */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-3xl border border-slate-200/60 shadow-xs p-6 space-y-5">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-purple-600" /> System Registries
                </h2>
                <button
                  onClick={fetchAllRestaurants}
                  className="p-2 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer text-slate-500 hover:text-purple-600"
                  title="Refresh Database Connection"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-purple-600' : ''}`} />
                </button>
              </div>

              {/* Live Search Engine */}
              <div className="relative">
                <Search className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-slate-400" />
                <input
                  type="text"
                  placeholder={t.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 transition-all placeholder-slate-400 font-medium"
                />
              </div>

              {/* Core CRUD Table Layout — clicking RESTAURANT name opens ONLY that RESTAURANT's staff */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200/60">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200/60 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="p-4">{t.tableName}</th>
                      <th className="p-4">{t.tableId}</th>
                      <th className="p-4">{t.tableLocation}</th>
                      <th className="p-4">{t.tableTime}</th>
                      <th className="p-4">{t.tableStatus}</th>
                      <th className="p-4 text-right">{t.tableAction}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {filteredRestaurants.length > 0 ? (
                      filteredRestaurants.map((resto) => {
                        const isAdminRow = isAdminAccount(resto);
                        const restoName = resto.RESTAURANTName || resto.restaurantName || '';
                        const total = resto.totalTime ?? DEFAULT_PLAN_DAYS;
                        const remaining = resto.remainingTime ?? total;
                        const timeStatus = getTimeStatus(remaining, total);

                        return (
                          <tr
                            key={resto._id}
                            className={`transition-colors ${
                              isAdminRow ? 'bg-purple-50/60 hover:bg-purple-50' : 'hover:bg-slate-50/60'
                            }`}
                          >
                            <td className="p-4">
                              <button
                                type="button"
                                onClick={() => openRESTAURANTDetails(restoName)}
                                className="flex items-center gap-2.5 group cursor-pointer text-left"
                              >
                                <span className="h-8 w-8 shrink-0 rounded-full bg-linear-to-br from-purple-500 to-fuchsia-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                                  {getInitials(restoName)}
                                </span>
                                <span className="font-bold text-slate-900 text-sm group-hover:text-purple-600 group-hover:underline">
                                  {restoName || 'Unnamed Store'}
                                </span>
                                {isAdminRow && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-600 text-white text-[9px] font-bold uppercase tracking-wider align-middle">
                                    <ShieldCheck className="h-3 w-3" />
                                    {t.adminBadge}
                                  </span>
                                )}
                              </button>
                            </td>
                            <td className="p-4 font-mono text-slate-500 font-semibold">{resto.id}</td>
                            <td className="p-4 text-slate-600 font-medium">
                              <span className="inline-flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                                {resto.location || '—'}
                              </span>
                            </td>
                            <td className="p-4 min-w-[150px]">
                              <div className="flex items-center justify-between mb-1">
                                <span className={`text-[10px] font-bold ${timeStatus.text}`}>
                                  {Math.max(0, remaining)} / {total} days
                                </span>
                                {!isAdminRow && (
                                  <button
                                    type="button"
                                    onClick={() => handleExtendTime(resto, 30)}
                                    title="Extend by 30 days"
                                    className="p-1 rounded-lg hover:bg-purple-50 text-slate-400 hover:text-purple-600 transition-colors cursor-pointer"
                                  >
                                    <TimerReset className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${timeStatus.bar} transition-all`}
                                  style={{ width: `${timeStatus.pct}%` }}
                                />
                              </div>
                              {timeStatus.label !== 'Healthy' && (
                                <span className={`inline-flex items-center gap-1 mt-1 text-[9px] font-bold uppercase tracking-wider ${timeStatus.text}`}>
                                  <AlertTriangle className="h-2.5 w-2.5" />
                                  {timeStatus.label}
                                </span>
                              )}
                            </td>
                            <td className="p-4">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                resto.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                              }`}>
                                {resto.isActive ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                {resto.isActive ? t.active : t.inactive}
                              </span>
                            </td>
                            <td className="p-4 text-right space-x-2 whitespace-nowrap">
                              <button
                                onClick={() => startEditMode(resto)}
                                className="p-2 bg-slate-50 hover:bg-purple-50 text-slate-600 hover:text-purple-700 border border-slate-200 hover:border-purple-200 rounded-xl transition-all cursor-pointer inline-flex items-center"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(resto._id)}
                                className="p-2 bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 rounded-xl transition-all cursor-pointer inline-flex items-center"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-10 text-center text-slate-400 font-medium bg-slate-50/30">
                          No active matching user configurations found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Column 3: RESTAURANT Login Account Mutator Box */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-3xl border border-slate-200/60 shadow-xs p-6 space-y-5 sticky top-24">
              <div>
                <div className="h-9 w-9 bg-purple-50 text-purple-700 rounded-xl flex items-center justify-center mb-3">
                  {isEditing ? <Edit3 className="h-4.5 w-4.5" /> : <Plus className="h-5 w-5" />}
                </div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  {isEditing ? t.editHeading : t.createHeading}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Configure access accounts directly into MongoDB environment parameters.</p>
              </div>

              <form onSubmit={isEditing ? handleUpdateUser : handleCreateUser} className="space-y-4">

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Restaurant Store Name</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Everest Kitchen"
                      value={formRESTAURANTName}
                      onChange={(e) => setFormRESTAURANTName(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-purple-500 transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Login Access ID</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      disabled={isEditing}
                      placeholder="Alphanumeric code string"
                      value={formId}
                      onChange={(e) => setFormId(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-purple-500 transition-all font-mono font-medium disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    {isEditing ? "New Security Password (Optional)" : "Security Password"}
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required={!isEditing}
                      autoComplete="new-password"
                      placeholder={isEditing ? "•••••••• (Preserve current)" : "Minimum 8 credentials"}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-purple-500 transition-all font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. 98XXXXXXXX"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-purple-500 transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      placeholder="e.g. Restaurant@example.com"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-purple-500 transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Location</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Kathmandu, Nepal"
                      value={formLocation}
                      onChange={(e) => setFormLocation(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-purple-500 transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">PAN / VAT Number</label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="e.g. 600123456"
                      value={formPanOrVat}
                      onChange={(e) => setFormPanOrVat(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-purple-500 transition-all font-medium"
                    />
                  </div>
                </div>

                {/* Subscription length — remaining time mirrors this on creation, and can
                    be adjusted independently once the account exists. */}
                <div className={`grid ${isEditing ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Total Plan (Days)
                    </label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="number"
                        min={1}
                        required
                        placeholder="30"
                        value={formTotalTime}
                        onChange={(e) => {
                          setFormTotalTime(e.target.value);
                          if (!isEditing) setFormRemainingTime(e.target.value);
                        }}
                        className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-purple-500 transition-all font-medium"
                      />
                    </div>
                  </div>

                  {isEditing && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Remaining (Days)
                      </label>
                      <div className="relative">
                        <TimerReset className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                        <input
                          type="number"
                          min={0}
                          required
                          placeholder="30"
                          value={formRemainingTime}
                          onChange={(e) => setFormRemainingTime(e.target.value)}
                          className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-purple-500 transition-all font-medium"
                        />
                      </div>
                    </div>
                  )}
                </div>
                {!isEditing && (
                  <p className="text-[10px] text-slate-400 -mt-2 px-0.5">Remaining days start out equal to the total plan length.</p>
                )}

                {isEditing && (
                  <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 select-none">
                    <div>
                      <span className="text-[11px] font-bold text-slate-700 block">Account Token Node</span>
                      <span className="text-[10px] text-slate-400 font-medium">Allow system queries access</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="rounded-md border-slate-300 text-purple-600 focus:ring-purple-500/20 h-5 w-5 accent-purple-600 cursor-pointer"
                    />
                  </div>
                )}

                <div className="space-y-2 pt-2">
                  <button
                    type="submit"
                    className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-purple-600/10 hover:shadow-lg hover:shadow-purple-600/20 active:scale-[0.99] cursor-pointer"
                  >
                    {isEditing ? t.submitUpdate : t.submitCreate}
                  </button>

                  {isEditing && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all text-center cursor-pointer"
                    >
                      {t.cancelBtn}
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      </main>

      {/* ============================================================
          FULL-SCREEN MODAL / OVERLAY FOR MANAGING STAFF OF SELECTED RESTAURANT
          ============================================================ */}
      {selectedRESTAURANT && (
        <div className="fixed inset-0 z-[100] bg-slate-50 overflow-y-auto">
          <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-6">

            {/* Header with X close */}
            <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{selectedRESTAURANT} — Staff Management</h2>
                <p className="text-slate-500 text-sm mt-1">Add, edit, or remove personnel credentials for this Restaurant.</p>
              </div>
              <button
                type="button"
                onClick={closeRESTAURANTDetails}
                className="p-3 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors cursor-pointer"
                title="Close"
              >
                <XCircle className="h-6 w-6 text-slate-500" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

              {/* List of Staff for this RESTAURANT only */}
              <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Users className="h-4 w-4 text-purple-600" /> Staff Directory
                  </h3>
                  <button
                    type="button"
                    onClick={() => fetchStaffForRESTAURANT(selectedRESTAURANT)}
                    className="p-2 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer text-slate-500 hover:text-purple-600"
                    title="Refresh"
                  >
                    <RefreshCw className={`h-4 w-4 ${isStaffLoading ? 'animate-spin text-purple-600' : ''}`} />
                  </button>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200/60">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200/60 text-slate-400 font-bold uppercase tracking-wider">
                        <th className="p-3">Staff Name</th>
                        <th className="p-3">Staff ID</th>
                        <th className="p-3">Role</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {RESTAURANTStaff.length > 0 ? (
                        RESTAURANTStaff.map((staff) => (
                          <tr key={staff._id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="p-3 font-bold text-slate-900">{staff.staffName || '—'}</td>
                            <td className="p-3 font-mono text-slate-500 font-semibold">{staff.id}</td>
                            <td className="p-3">{staff.role || 'Staff'}</td>
                            <td className="p-3">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                staff.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                              }`}>
                                {staff.isActive ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                {staff.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="p-3 text-right space-x-2 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => startStaffEditMode(staff)}
                                className="p-2 bg-slate-50 hover:bg-purple-50 text-slate-600 hover:text-purple-700 border border-slate-200 hover:border-purple-200 rounded-xl transition-all cursor-pointer inline-flex items-center"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteStaff(staff._id)}
                                className="p-2 bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 rounded-xl transition-all cursor-pointer inline-flex items-center"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="p-10 text-center text-slate-400 font-medium bg-slate-50/30">
                            {isStaffLoading ? 'Loading staff...' : 'No staff members found for this Restaurant.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Create / Edit Staff Form */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
                <div>
                  <div className="h-9 w-9 bg-purple-50 text-purple-700 rounded-xl flex items-center justify-center mb-3">
                    {isStaffEditing ? <Edit3 className="h-4.5 w-4.5" /> : <UserPlus className="h-5 w-5" />}
                  </div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">
                    {isStaffEditing ? 'Edit Staff Member' : 'Add Staff Member'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Restaurant: <span className="font-semibold text-slate-600">{selectedRESTAURANT}</span>
                  </p>
                </div>

                <form onSubmit={isStaffEditing ? handleUpdateStaff : handleCreateStaff} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Staff Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        required
                        placeholder="e.g. Ramesh Sharma"
                        value={staffFormName}
                        onChange={(e) => setStaffFormName(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-purple-500 transition-all font-medium"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Staff ID</label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        required
                        placeholder="Alphanumeric code string"
                        value={staffFormId}
                        onChange={(e) => setStaffFormId(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-purple-500 transition-all font-mono font-medium"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      {isStaffEditing ? 'New Password (optional)' : 'Password'}
                    </label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type={showStaffPassword ? "text" : "password"}
                        required={!isStaffEditing}
                        autoComplete="new-password"
                        placeholder={isStaffEditing ? "•••••••• (Preserve current)" : "Minimum 8 credentials"}
                        value={staffFormPassword}
                        onChange={(e) => setStaffFormPassword(e.target.value)}
                        className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-purple-500 transition-all font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => setShowStaffPassword(!showStaffPassword)}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showStaffPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Role</label>
                    <select
                      value={staffFormRole}
                      onChange={(e) => setStaffFormRole(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-purple-500 transition-all font-medium"
                    >
                      {STAFF_ROLES.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 select-none">
                    <div>
                      <span className="text-[11px] font-bold text-slate-700 block">Account Active</span>
                      <span className="text-[10px] text-slate-400 font-medium">Allow this staff member to log in</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={staffFormIsActive}
                      onChange={(e) => setStaffFormIsActive(e.target.checked)}
                      className="rounded-md border-slate-300 text-purple-600 focus:ring-purple-500/20 h-5 w-5 accent-purple-600 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-2 pt-2">
                    {/* One normal submit button -> form onSubmit handles create / update */}
                    <button
                      type="submit"
                      disabled={isStaffSaving}
                      className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-purple-600/10 hover:shadow-lg hover:shadow-purple-600/20 active:scale-[0.99] cursor-pointer"
                    >
                      {isStaffSaving ? 'Saving...' : isStaffEditing ? 'Save Changes' : 'Create Staff Account'}
                    </button>

                    {isStaffEditing && (
                      <button
                        type="button"
                        onClick={resetStaffForm}
                        className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all text-center cursor-pointer"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast message — rendered LAST with a higher z-index so it shows ABOVE the staff screen */}
      {notification && (
        <div className={`fixed bottom-5 right-5 z-[200] p-4 rounded-2xl shadow-2xl border flex items-center gap-3 max-w-md transition-all duration-300 text-sm font-semibold text-white ${
          notification.type === 'success' ? 'bg-emerald-600 border-emerald-500' : 'bg-rose-600 border-rose-500'
        }`}>
          <Activity className="h-5 w-5 shrink-0 animate-pulse" />
          <p>{notification.msg}</p>
        </div>
      )}

    </div>
  );
}