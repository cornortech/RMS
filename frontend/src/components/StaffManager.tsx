import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import {
  UserPlus,
  Edit3,
  Trash2,
  RefreshCw,
  KeyRound,
  Eye,
  EyeOff,
  User,
  Users,
  CheckCircle,
  XCircle,
  Search,
  Plus,
  X,
  ShieldCheck,
  ChefHat,
  Wallet,
  Utensils,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';

// ---- Types ----
interface StaffAccount {
  _id: string;
  id: string;
  RESTAURANTName: string;
  staffName?: string;
  role: string;
  isActive: boolean;
}

interface StaffManagerProps {
  RESTAURANTName?: string;
  onClose?: () => void;
}

// Matches the restaurant role set used in App.tsx's ROLE_ACCESS map.
const STAFF_ROLES = ['Manager', 'Waiter', 'Kitchen Staff', 'Cashier'];

// Minimum password length (validation + UI use the same value)
const MIN_PASSWORD_LENGTH = 8;

// Visual identity for each role (full class names so Tailwind can detect them)
const ROLE_STYLES: Record<string, { icon: React.ElementType; badge: string; avatar: string; ring: string }> = {
  Manager: {
    icon: ShieldCheck,
    badge: 'bg-purple-50 text-purple-700 border-purple-100',
    avatar: 'from-purple-500 to-indigo-600',
    ring: 'ring-purple-200',
  },
  Waiter: {
    icon: Utensils,
    badge: 'bg-sky-50 text-sky-700 border-sky-100',
    avatar: 'from-sky-500 to-blue-600',
    ring: 'ring-sky-200',
  },
  'Kitchen Staff': {
    icon: ChefHat,
    badge: 'bg-amber-50 text-amber-700 border-amber-100',
    avatar: 'from-amber-500 to-orange-600',
    ring: 'ring-amber-200',
  },
  Cashier: {
    icon: Wallet,
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    avatar: 'from-emerald-500 to-teal-600',
    ring: 'ring-emerald-200',
  },
};

const FALLBACK_ROLE_STYLE = {
  icon: User,
  badge: 'bg-slate-50 text-slate-700 border-slate-200',
  avatar: 'from-slate-500 to-slate-700',
  ring: 'ring-slate-200',
};

const getRoleStyle = (role: string) => ROLE_STYLES[role] || FALLBACK_ROLE_STYLE;

// Move this to an env var when you deploy: import.meta.env.VITE_API_URL
const API_BASE_URL = `${(import.meta.env.VITE_API_URL || 'http://localhost:5000').trim().replace(/\/+$/, '')}/api`;

const api = axios.create({ baseURL: API_BASE_URL });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ---- Helpers ----
const getInitials = (name?: string, fallback?: string) => {
  const source = (name || fallback || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const getPasswordStrength = (pw: string) => {
  if (!pw) return { score: 0, label: '', color: 'bg-slate-200', text: 'text-slate-400' };
  let score = 0;
  if (pw.length >= MIN_PASSWORD_LENGTH) score++;
  if (pw.length >= 10) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const levels = [
    { label: 'Too weak', color: 'bg-rose-500', text: 'text-rose-600' },
    { label: 'Weak', color: 'bg-rose-500', text: 'text-rose-600' },
    { label: 'Okay', color: 'bg-amber-500', text: 'text-amber-600' },
    { label: 'Good', color: 'bg-lime-500', text: 'text-lime-600' },
    { label: 'Strong', color: 'bg-emerald-500', text: 'text-emerald-600' },
  ];
  return { score, ...levels[score] };
};

const generatePassword = (length = 10) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => chars[v % chars.length]).join('');
};

export default function StaffManager({ RESTAURANTName: propRESTAURANTName, onClose }: StaffManagerProps) {
  const { RESTAURANTName: paramRESTAURANTName } = useParams<{ RESTAURANTName?: string }>();
  const RESTAURANTName = propRESTAURANTName || paramRESTAURANTName || '';

  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const toastTimer = useRef<number | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Form / drawer state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formId, setFormId] = useState('');
  const [formStaffName, setFormStaffName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState(STAFF_ROLES[0]);
  const [formIsActive, setFormIsActive] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete modal + quick toggle state
  const [deleteTarget, setDeleteTarget] = useState<StaffAccount | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const showNotice = (type: 'success' | 'error', msg: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setNotification({ type, msg });
    toastTimer.current = window.setTimeout(() => setNotification(null), 4000);
  };

  // ---- Fetch staff scoped to this RESTAURANT only ----
  const fetchStaff = async () => {
    if (!RESTAURANTName) return;
    setIsLoading(true);
    try {
      const res = await api.get(`/admin/staff-by-RESTAURANT/${encodeURIComponent(RESTAURANTName)}`);
      const data = res.data?.data ?? res.data;
      setStaff(Array.isArray(data) ? data : []);
    } catch (err) {
      showNotice('error', 'Could not load staff for this restaurant. Check that the backend is running on port 5000.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [RESTAURANTName]);

  // Close drawer / modal with Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (deleteTarget) setDeleteTarget(null);
      else if (isFormOpen) closeForm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteTarget, isFormOpen]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  // ---- Derived data ----
  const stats = useMemo(() => {
    const active = staff.filter((s) => s.isActive).length;
    return {
      total: staff.length,
      active,
      inactive: staff.length - active,
      roles: new Set(staff.map((s) => s.role)).size,
    };
  }, [staff]);

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((s) => {
      const matchesSearch =
        !q || (s.staffName || '').toLowerCase().includes(q) || (s.id || '').toLowerCase().includes(q);
      const matchesRole = roleFilter === 'All' || s.role === roleFilter;
      const matchesStatus =
        statusFilter === 'all' || (statusFilter === 'active' ? s.isActive : !s.isActive);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [staff, search, roleFilter, statusFilter]);

  const hasActiveFilters = search.trim() !== '' || roleFilter !== 'All' || statusFilter !== 'all';
  const clearFilters = () => {
    setSearch('');
    setRoleFilter('All');
    setStatusFilter('all');
  };

  // ---- Form helpers ----
  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormId('');
    setFormStaffName('');
    setFormPassword('');
    setFormRole(STAFF_ROLES[0]);
    setFormIsActive(true);
    setShowPassword(false);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    resetForm();
  };

  const openCreateForm = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const startEditMode = (s: StaffAccount) => {
    setIsEditing(true);
    setEditingId(s._id);
    setFormId(s.id);
    setFormStaffName(s.staffName || '');
    setFormRole(STAFF_ROLES.includes(s.role) ? s.role : STAFF_ROLES[0]);
    setFormIsActive(s.isActive);
    setFormPassword('');
    setShowPassword(false);
    setIsFormOpen(true);
  };

  // ---- Create ----
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formId.trim() || !formPassword.trim() || !formStaffName.trim()) {
      showNotice('error', 'Staff name, ID and password are required.');
      return;
    }
    if (formPassword.length < MIN_PASSWORD_LENGTH) {
      showNotice('error', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/staff/create', {
        RESTAURANTName,
        staffName: formStaffName,
        id: formId,
        password: formPassword,
        role: formRole,
        isActive: formIsActive,
      });
      showNotice('success', 'Staff account created.');
      await fetchStaff();
      closeForm();
    } catch (err: any) {
      showNotice('error', err?.response?.data?.error || 'Failed to create staff account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---- Update ----
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    if (!formId.trim()) {
      showNotice('error', 'Staff ID is required.');
      return;
    }
    if (formPassword && formPassword.length < MIN_PASSWORD_LENGTH) {
      showNotice('error', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        id: formId,
        staffName: formStaffName,
        role: formRole,
        isActive: formIsActive,
        RESTAURANTName,
      };
      if (formPassword.trim()) payload.password = formPassword;

      await api.put(`/staff/${editingId}`, payload);
      showNotice('success', 'Staff account updated.');
      await fetchStaff();
      closeForm();
    } catch (err: any) {
      showNotice('error', err?.response?.data?.error || 'Failed to update staff account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---- Quick activate / deactivate ----
  const handleToggleActive = async (s: StaffAccount) => {
    setTogglingId(s._id);
    try {
      await api.put(`/staff/${s._id}`, {
        id: s.id,
        staffName: s.staffName,
        role: s.role,
        isActive: !s.isActive,
        RESTAURANTName,
      });
      setStaff((prev) => prev.map((x) => (x._id === s._id ? { ...x, isActive: !x.isActive } : x)));
      showNotice('success', `${s.staffName || s.id} is now ${s.isActive ? 'inactive' : 'active'}.`);
    } catch (err: any) {
      showNotice('error', err?.response?.data?.error || 'Failed to change account status.');
    } finally {
      setTogglingId(null);
    }
  };

  // ---- Delete ----
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.delete(`/staff/${deleteTarget._id}`);
      showNotice('success', 'Staff member deleted.');
      setStaff((prev) => prev.filter((s) => s._id !== deleteTarget._id));
      if (editingId === deleteTarget._id) closeForm();
      setDeleteTarget(null);
    } catch (err: any) {
      showNotice('error', err?.response?.data?.error || 'Failed to delete staff member.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!RESTAURANTName) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center max-w-sm shadow-sm">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <Users className="h-7 w-7 text-slate-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">No restaurant selected</h2>
          <p className="text-sm text-slate-500 mt-1">Open this page via a restaurant's staff link.</p>
        </div>
      </div>
    );
  }

  const strength = getPasswordStrength(formPassword);
  const inputBase =
    'w-full py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:bg-white focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all';

  const statCards = [
    { label: 'Total Staff', value: stats.total, icon: Users, tint: 'bg-purple-50 text-purple-600' },
    { label: 'Active', value: stats.active, icon: CheckCircle, tint: 'bg-emerald-50 text-emerald-600' },
    { label: 'Inactive', value: stats.inactive, icon: XCircle, tint: 'bg-rose-50 text-rose-600' },
    { label: 'Roles in Use', value: stats.roles, icon: ShieldCheck, tint: 'bg-sky-50 text-sky-600' },
  ];

  return (
    <div className="relative min-h-screen bg-slate-100/60 overflow-hidden">
      {/* Local animations */}
      <style>{`
        @keyframes sm-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes sm-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sm-pop { from { opacity: 0; transform: scale(.94) translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes sm-toast { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: none; } }
        @keyframes sm-card { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .sm-slide-in { animation: sm-slide-in .3s cubic-bezier(.22,1,.36,1); }
        .sm-fade-in { animation: sm-fade-in .2s ease-out; }
        .sm-pop { animation: sm-pop .22s cubic-bezier(.22,1,.36,1); }
        .sm-toast { animation: sm-toast .28s cubic-bezier(.22,1,.36,1); }
        .sm-card { animation: sm-card .35s cubic-bezier(.22,1,.36,1) both; }
      `}</style>

      {/* Decorative background blobs */}
      <div className="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full bg-purple-300/30 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 -left-32 h-96 w-96 rounded-full bg-indigo-300/20 blur-3xl" />

      <div className="relative max-w-6xl mx-auto p-4 sm:p-8 space-y-6">
        {/* ---------- Header ---------- */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-50/90 via-indigo-50/40 to-white border border-purple-200 p-6 sm:p-8 shadow-sm">
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            {/* Left Side: Icon & Titles */}
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 shrink-0 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-lg shadow-purple-600/25">
                <Users className="h-7 w-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                    Staff Directory
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
                  {RESTAURANTName}
                </h2>
                <p className="text-sm text-slate-600 mt-0.5">
                  Create, update, or manage staff credentials and permissions.
                </p>
              </div>
            </div>

            {/* Right Side: Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={openCreateForm}
                className="inline-flex items-center gap-2 px-5 py-3 bg-purple-600 text-white font-bold text-sm rounded-2xl shadow-lg shadow-purple-600/20 hover:bg-purple-700 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
              >
                <Plus className="h-4.5 w-4.5" /> Add Staff
              </button>
              
              {onClose && (
                <button
                  onClick={onClose}
                  aria-label="Close staff manager"
                  className="p-3 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/80 rounded-2xl transition-colors shadow-sm cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ---------- Stats Cards (With Light Background Added) ---------- */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((c, i) => (
            <div
              key={c.label}
              className="sm-card bg-gradient-to-br from-white via-purple-50/35 to-indigo-50/20 border border-purple-100/80 rounded-2xl p-4 sm:p-5 flex items-center gap-4 shadow-sm hover:shadow-md hover:border-purple-200 transition-all"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className={`h-11 w-11 shrink-0 rounded-xl flex items-center justify-center ${c.tint}`}>
                <c.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-slate-900 leading-none">
                  {isLoading && staff.length === 0 ? '–' : c.value}
                </p>
                <p className="text-xs font-semibold text-slate-500 mt-1">{c.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ---------- Toolbar ---------- */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or staff ID…"
                className={`${inputBase} pl-10 pr-10`}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex bg-slate-100 rounded-xl p-1 text-xs font-bold">
                {(['all', 'active', 'inactive'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3.5 py-2 rounded-lg capitalize transition-all cursor-pointer ${
                      statusFilter === s ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <button
                onClick={fetchStaff}
                aria-label="Refresh staff list"
                className="p-3 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-purple-600 transition-all cursor-pointer"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-purple-600' : ''}`} />
              </button>
            </div>
          </div>

          {/* Role chips */}
          <div className="flex flex-wrap gap-2">
            {['All', ...STAFF_ROLES].map((r) => {
              const active = roleFilter === r;
              const Icon = r === 'All' ? Users : getRoleStyle(r).icon;
              return (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                    active
                      ? 'bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-600/20'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300 hover:text-purple-700'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {r}
                </button>
              );
            })}
          </div>
        </div>

        {/* ---------- Result count ---------- */}
        {!isLoading && staff.length > 0 && (
          <div className="flex items-center justify-between px-1">
            <p className="text-sm text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-800">{filteredStaff.length}</span> of{' '}
              <span className="font-bold text-slate-800">{staff.length}</span> staff members
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs font-bold text-purple-600 hover:text-purple-800 cursor-pointer"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* ---------- Staff grid ---------- */}
        <div className="mt-6">
          {isLoading && staff.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-3xl p-5 animate-pulse space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-slate-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-2/3 rounded bg-slate-200" />
                      <div className="h-3 w-1/3 rounded bg-slate-100" />
                    </div>
                  </div>
                  <div className="h-6 w-28 rounded-full bg-slate-100" />
                  <div className="h-10 rounded-xl bg-slate-100" />
                </div>
              ))}
            </div>
          ) : filteredStaff.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredStaff.map((s, i) => {
                const rs = getRoleStyle(s.role);
                const RoleIcon = rs.icon;
                return (
                  <div
                    key={s._id}
                    className={`sm-card group relative bg-slate-50/90 hover:bg-white border-2 border-slate-200/80 rounded-3xl p-5 shadow-md hover:shadow-xl hover:shadow-purple-500/10 hover:-translate-y-1 hover:border-purple-300 transition-all duration-300 ${
                      s.isActive ? '' : 'opacity-70 bg-slate-100/80'
                    }`}
                    style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`h-14 w-14 shrink-0 rounded-2xl bg-gradient-to-br ${rs.avatar} text-white flex items-center justify-center text-lg font-extrabold shadow-md ring-4 ${rs.ring} ${
                          s.isActive ? '' : 'grayscale'
                        }`}
                      >
                        {getInitials(s.staffName, s.id)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-slate-900 truncate">{s.staffName || 'Unnamed staff'}</h4>
                        <p className="mt-0.5 inline-block font-mono text-xs font-semibold text-slate-600 bg-white/90 border border-slate-200 px-2 py-0.5 rounded-md truncate max-w-full shadow-2xs">
                          {s.id}
                        </p>
                      </div>
                      <div className="flex gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEditMode(s)}
                          aria-label={`Edit ${s.id}`}
                          className="p-2 bg-white hover:bg-purple-50 text-slate-500 hover:text-purple-700 border border-slate-200 hover:border-purple-200 rounded-xl transition-all cursor-pointer shadow-xs"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(s)}
                          aria-label={`Delete ${s.id}`}
                          className="p-2 bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-700 border border-slate-200 hover:border-rose-200 rounded-xl transition-all cursor-pointer shadow-xs"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border shadow-2xs ${rs.badge}`}
                      >
                        <RoleIcon className="h-3.5 w-3.5" />
                        {s.role || 'Staff'}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${
                          s.isActive ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      >
                        <span className="relative flex h-2 w-2">
                          {s.isActive && (
                            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                          )}
                          <span
                            className={`relative inline-flex h-2 w-2 rounded-full ${
                              s.isActive ? 'bg-emerald-500' : 'bg-slate-300'
                            }`}
                          />
                        </span>
                        {s.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-200/60 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">Allow login</span>
                      <button
                        role="switch"
                        aria-checked={s.isActive}
                        aria-label={`Toggle account for ${s.staffName || s.id}`}
                        disabled={togglingId === s._id}
                        onClick={() => handleToggleActive(s)}
                        className={`relative h-6 w-11 rounded-full transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait ${
                          s.isActive ? 'bg-purple-600' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            s.isActive ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ---------- Empty state ---------- */
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl py-16 px-6 text-center">
              <div className="mx-auto h-16 w-16 rounded-2xl bg-purple-50 text-purple-500 flex items-center justify-center mb-4">
                {hasActiveFilters ? <Search className="h-8 w-8" /> : <UserPlus className="h-8 w-8" />}
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                {hasActiveFilters ? 'No matching staff found' : 'No staff members yet'}
              </h3>
              <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                {hasActiveFilters
                  ? 'Try a different search term or clear your filters.'
                  : `Add your first team member to give them access to ${RESTAURANTName}.`}
              </p>
              <button
                onClick={hasActiveFilters ? clearFilters : openCreateForm}
                className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm rounded-xl shadow-md shadow-purple-600/20 transition-all cursor-pointer"
              >
                {hasActiveFilters ? (
                  'Clear filters'
                ) : (
                  <>
                    <Plus className="h-4 w-4" /> Add Staff Member
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ---------- Toast ---------- */}
      {notification && (
        <div
          role="status"
          className={`sm-toast fixed top-5 right-5 z-[70] flex items-center gap-3 max-w-sm pl-4 pr-3 py-3.5 rounded-2xl shadow-2xl text-sm font-semibold text-white ${
            notification.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle className="h-5 w-5 shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0" />
          )}
          <p className="flex-1">{notification.msg}</p>
          <button
            onClick={() => setNotification(null)}
            aria-label="Dismiss notification"
            className="p-1 rounded-lg hover:bg-white/20 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ---------- Create / Edit drawer ---------- */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="sm-fade-in absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={closeForm}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={isEditing ? 'Edit staff member' : 'Add staff member'}
            className="sm-slide-in absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col"
          >
            {/* Drawer header */}
            <div
              className="relative px-6 py-6 text-white shrink-0"
              style={{ backgroundImage: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)' }}
            >
              <button
                onClick={closeForm}
                aria-label="Close form"
                className="absolute right-4 top-4 p-2 bg-white/15 hover:bg-white/25 rounded-xl transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="h-12 w-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center mb-3">
                {isEditing ? <Edit3 className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
              </div>
              <h3 className="text-xl font-extrabold tracking-tight">
                {isEditing ? 'Edit Staff Member' : 'Add Staff Member'}
              </h3>
              <p className="text-sm text-purple-100 mt-0.5">
                {isEditing ? 'Update details or reset the password.' : 'Create a new login for your team.'}
                <span className="block text-xs mt-1 text-purple-200">
                  Restaurant: <span className="font-bold text-white">{RESTAURANTName}</span>
                </span>
              </p>
            </div>

            {/* Form */}
            <form
              onSubmit={isEditing ? handleUpdate : handleCreate}
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
                {/* Name */}
                <div className="space-y-1.5">
                  <label htmlFor="sm-name" className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Staff Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="sm-name"
                      type="text"
                      required
                      autoFocus
                      placeholder="e.g. Ramesh Sharma"
                      value={formStaffName}
                      onChange={(e) => setFormStaffName(e.target.value)}
                      className={`${inputBase} pl-10 pr-4`}
                    />
                  </div>
                </div>

                {/* ID */}
                <div className="space-y-1.5">
                  <label htmlFor="sm-id" className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Staff ID
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="sm-id"
                      type="text"
                      required
                      disabled={isEditing}
                      placeholder="Alphanumeric code string"
                      value={formId}
                      onChange={(e) => setFormId(e.target.value)}
                      className={`${inputBase} pl-10 pr-4 font-mono disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed`}
                    />
                  </div>
                  {isEditing && (
                    <p className="text-[11px] text-slate-400 font-medium">Staff ID can't be changed after creation.</p>
                  )}
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="sm-pw" className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      {isEditing ? 'New Password (optional)' : 'Password'}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setFormPassword(generatePassword());
                        setShowPassword(true);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-600 hover:text-purple-800 cursor-pointer"
                    >
                      <Sparkles className="h-3 w-3" /> Generate
                    </button>
                  </div>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="sm-pw"
                      type={showPassword ? 'text' : 'password'}
                      required={!isEditing}
                      minLength={formPassword ? MIN_PASSWORD_LENGTH : undefined}
                      placeholder={isEditing ? '•••••••• (keep current)' : `Minimum ${MIN_PASSWORD_LENGTH} characters`}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      className={`${inputBase} pl-10 pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {formPassword && (
                    <div className="pt-1">
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4].map((n) => (
                          <div
                            key={n}
                            className={`h-1.5 flex-1 rounded-full transition-colors ${
                              strength.score >= n ? strength.color : 'bg-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                      <p className={`text-[11px] font-bold mt-1.5 ${strength.text}`}>{strength.label}</p>
                    </div>
                  )}
                </div>

                {/* Role selector */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Role</span>
                  <div className="grid grid-cols-2 gap-2.5">
                    {STAFF_ROLES.map((role) => {
                      const rs = getRoleStyle(role);
                      const Icon = rs.icon;
                      const selected = formRole === role;
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => setFormRole(role)}
                          aria-pressed={selected}
                          className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-left text-sm font-bold transition-all cursor-pointer ${
                            selected
                              ? 'border-purple-500 bg-purple-50 text-purple-800 shadow-sm'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-purple-200'
                          }`}
                        >
                          <span
                            className={`h-8 w-8 shrink-0 rounded-lg flex items-center justify-center border ${rs.badge}`}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          {role}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Active switch */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200/70 select-none">
                  <div>
                    <span className="text-sm font-bold text-slate-800 block">Account Active</span>
                    <span className="text-xs text-slate-500 font-medium">Allow this staff member to log in</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formIsActive}
                    onClick={() => setFormIsActive(!formIsActive)}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors cursor-pointer ${
                      formIsActive ? 'bg-purple-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                        formIsActive ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Sticky footer */}
              <div className="shrink-0 border-t border-slate-100 bg-white px-6 py-4 flex gap-3">
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-[2] py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-purple-600/25 active:scale-[0.99] cursor-pointer inline-flex items-center justify-center gap-2"
                >
                  {isSubmitting && <RefreshCw className="h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}

      {/* ---------- Delete confirmation modal ---------- */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="sm-fade-in absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => !isDeleting && setDeleteTarget(null)}
            aria-hidden="true"
          />
          <div
            role="alertdialog"
            aria-modal="true"
            className="sm-pop relative bg-white rounded-3xl p-7 w-full max-w-sm shadow-2xl text-center"
          >
            <div className="mx-auto h-14 w-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
              <Trash2 className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900">Delete staff member?</h3>
            <p className="text-sm text-slate-500 mt-2">
              <span className="font-bold text-slate-800">{deleteTarget.staffName || deleteTarget.id}</span> will be
              removed permanently and lose access immediately. This cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-all cursor-pointer disabled:opacity-60"
              >
                Keep
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-rose-600/25 cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {isDeleting && <RefreshCw className="h-4 w-4 animate-spin" />}
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}