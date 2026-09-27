import React, { useState, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, ShoppingBag, ClipboardList, LayoutGrid, Flame, Utensils,
  Boxes, FilePlus, Clock, TrendingUp, ShieldCheck, Users, Settings,
  FileText, Printer, X, LogOut, Menu, Lock, User2, AlertCircle, Loader2,
  Eye, EyeOff, PanelLeftClose, PanelLeftOpen, ChevronRight, Repeat, Timer,
   Languages, ArrowLeft, Store, KeyRound,Bell,
} from 'lucide-react';
import { useLang } from './i18n';
import { Customer, Sale } from './types';
import { TRANSLATIONS } from './translations';
import Tables from './components/Table';
import KitchenDisplay from './components/KitchenDisplay';
import CreateBill from './components/CreateBill';
import TotalOrder from './components/DailyOrderItem';
import UnpaidBill from './components/UnPaidBill';
import StockManagement from './components/StockManagement';
import Dashboard from './components/Dashboard';
import CreateOrder from './components/CreateOrder';
import MenuManager from './components/MenuManager';
import BillingManager from './components/BillingManager';
import LoginScreen from './components/LoginScreen';
import AdminDashboard from './components/AdminDashboard';
import StaffManager from './components/StaffManager';
import RESTAURANTSettings from './components/Setting';
import OrdersPage from './components/Orders';
import OfflineBanner from './offline/OfflineBanner';
import { hasUnsyncedChanges } from './offline/offlineFetch';
   import Notifications from './components/Notifications';

const API_BASE_URL = `${(import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '')}/api`;

type Lang = 'en' | 'ne';

/* ------------------------------------------------------------------ */
/*  Roles & access                                                     */
/* ------------------------------------------------------------------ */

type StaffRole = 'Manager' | 'Waiter' | 'Kitchen Staff' | 'Cashier';

type AppView =
  | 'dashboard' | 'pos' | 'inventory' | 'billing' | 'staff' | 'settings'
  | 'orders' | 'tables' | 'kitchen' | 'createbill' | 'totalorder'
 | 'unpaidbill' | 'stock' | 'notifications';

interface RoleConfig {
  label: StaffRole;
  pages: AppView[];
  defaultView: AppView;
}

const ROLE_ACCESS: Record<StaffRole, RoleConfig> = {
  Manager: {
    label: 'Manager',
    pages: ['dashboard', 'pos', 'inventory', 'billing', 'staff', 'settings', 'orders', 'tables', 'kitchen', 'createbill', 'totalorder', 'unpaidbill', 'stock','notifications'],
    defaultView: 'dashboard',
  },
  Waiter: {
    label: 'Waiter',
    pages: ['inventory', 'orders', 'pos','notifications'],
    defaultView: 'pos',
  },
  'Kitchen Staff': {
    label: 'Kitchen Staff',
    pages: ['kitchen', 'stock'],
    defaultView: 'kitchen',
  },
  Cashier: {
    label: 'Cashier',
    pages: ['createbill', 'tables', 'billing', 'totalorder', 'unpaidbill', 'stock'],
    defaultView: 'createbill',
  },
};

const LEGACY_ROLE_MAP: Record<StaffRole, 'Viewer' | 'restoacist' | 'Owner'> = {
  Manager: 'Owner',
  Waiter: 'Viewer',
  'Kitchen Staff': 'restoacist',
  Cashier: 'restoacist',
};

/** Visual identity per role — used for badges, avatars and status dots. */
const ROLE_TONE: Record<StaffRole, { badge: string; dot: string; avatar: string; label: { en: string; ne: string } }> = {
  Manager: {
    badge: 'bg-purple-50 text-purple-700 ring-purple-200',
    dot: 'bg-purple-500',
    avatar: 'from-purple-500 via-violet-600 to-indigo-600',
    label: { en: 'Manager', ne: 'प्रबन्धक' },
  },
  Waiter: {
    badge: 'bg-amber-50 text-amber-700 ring-amber-200',
    dot: 'bg-amber-500',
    avatar: 'from-amber-400 to-orange-500',
    label: { en: 'Waiter', ne: 'वेटर' },
  },
  'Kitchen Staff': {
    badge: 'bg-orange-50 text-orange-700 ring-orange-200',
    dot: 'bg-orange-500',
    avatar: 'from-orange-500 to-rose-500',
    label: { en: 'Kitchen Staff', ne: 'भान्सा कर्मचारी' },
  },
  Cashier: {
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dot: 'bg-emerald-500',
    avatar: 'from-emerald-500 to-teal-600',
    label: { en: 'Cashier', ne: 'क्यासियर' },
  },
};

/* ------------------------------------------------------------------ */
/*  Navigation config (single source of truth for sidebar + header)    */
/* ------------------------------------------------------------------ */

type NavGroupKey = 'overview' | 'operations' | 'billing' | 'admin';

interface NavItem {
  view: AppView;
  icon: LucideIcon;
  group: NavGroupKey;
  label: { en: string; ne: string };
}

const NAV_GROUPS: { key: NavGroupKey; label: { en: string; ne: string } }[] = [
  { key: 'overview', label: { en: 'Overview', ne: 'अवलोकन' } },
  { key: 'operations', label: { en: 'Operations', ne: 'सञ्चालन' } },
  { key: 'billing', label: { en: 'Billing', ne: 'बिलिङ' } },
  { key: 'admin', label: { en: 'Administration', ne: 'प्रशासन' } },
];

const NAV_ITEMS: NavItem[] = [
  { view: 'dashboard', icon: LayoutDashboard, group: 'overview', label: { en: 'Dashboard', ne: 'ड्यासबोर्ड' } },

  { view: 'pos', icon: ShoppingBag, group: 'operations', label: { en: 'Create Order', ne: 'अर्डर बनाउनुहोस्' } },
  { view: 'orders', icon: ClipboardList, group: 'operations', label: { en: 'Orders', ne: 'अर्डरहरू' } },
     { view: 'notifications', icon: Bell, group: 'operations', label: { en: 'Notifications', ne: 'सूचनाहरू' } },
  { view: 'tables', icon: LayoutGrid, group: 'operations', label: { en: 'Tables', ne: 'टेबलहरू' } },
  { view: 'kitchen', icon: Flame, group: 'operations', label: { en: 'Kitchen', ne: 'भान्सा' } },
  { view: 'inventory', icon: Utensils, group: 'operations', label: { en: 'Menu', ne: 'मेनु' } },
  { view: 'stock', icon: Boxes, group: 'operations', label: { en: 'Stock', ne: 'स्टक' } },

  { view: 'createbill', icon: FilePlus, group: 'billing', label: { en: 'Create Bill', ne: 'बिल बनाउनुहोस्' } },
  { view: 'unpaidbill', icon: Clock, group: 'billing', label: { en: 'Pending Bills', ne: 'बाँकी बिलहरू' } },
  { view: 'totalorder', icon: TrendingUp, group: 'billing', label: { en: 'Total Sales', ne: 'कुल बिक्री' } },
  { view: 'billing', icon: ShieldCheck, group: 'billing', label: { en: 'Billing & VAT Audit', ne: 'बिलिङ र भ्याट अडिट' } },

  { view: 'staff', icon: Users, group: 'admin', label: { en: 'Manage Staff', ne: 'कर्मचारी व्यवस्थापन' } },
  { view: 'settings', icon: Settings, group: 'admin', label: { en: 'Settings', ne: 'सेटिङ्स' } },
];

/* Shared class recipes */
const FOCUS_RING = 'outline-none focus-visible:ring-4 focus-visible:ring-purple-500/25 focus-visible:ring-offset-0';
const GRADIENT_BTN =
  'bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 text-white shadow-md shadow-purple-500/20 hover:shadow-lg hover:shadow-purple-500/30 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-200';
const GLASS_PANEL = 'bg-white/80 backdrop-blur-xl border border-purple-100/80 shadow-xl shadow-purple-950/5';

/* ------------------------------------------------------------------ */
/*  Global styles + animations                                         */
/* ------------------------------------------------------------------ */

function GlobalStyles() {
  return (
    <style>{`
      @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes popIn { from { opacity: 0; transform: scale(.96) translateY(10px); } to { opacity: 1; transform: none; } }
      @keyframes slideRight { from { transform: translateX(-100%); } to { transform: none; } }
      @keyframes spinSlow { to { transform: rotate(360deg); } }
      @keyframes floaty { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
      @keyframes progressBar { 0% { transform: translateX(-120%); } 100% { transform: translateX(320%); } }
      @keyframes blobMove { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(24px,-30px) scale(1.1); } }
      @keyframes pulseRing { 0% { transform: scale(.9); opacity: .55; } 100% { transform: scale(1.7); opacity: 0; } }
      @keyframes textSwap { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

      .anim-fade-up { animation: fadeUp .45s cubic-bezier(.22,1,.36,1) both; }
      .anim-fade-in { animation: fadeIn .25s ease-out both; }
      .anim-pop { animation: popIn .32s cubic-bezier(.22,1,.36,1) both; }
      .anim-slide-right { animation: slideRight .3s cubic-bezier(.22,1,.36,1) both; }
      .anim-spin-slow { animation: spinSlow 1.4s linear infinite; }
      .anim-floaty { animation: floaty 3s ease-in-out infinite; }
      .anim-progress { animation: progressBar 1.4s ease-in-out infinite; }
      .anim-blob { animation: blobMove 12s ease-in-out infinite; }
      .anim-pulse-ring { animation: pulseRing 1.8s ease-out infinite; }
      .anim-text-swap { animation: textSwap .4s ease-out both; }
      .anim-shimmer {
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent);
        background-size: 200% 100%;
        animation: shimmer 2.4s ease-in-out infinite;
      }

      /* Perforated "order ticket" edge used on the staff sign-in card */
      .ticket-edge {
        background-image: radial-gradient(circle at 8px 0, transparent 5px, #fff 5.5px);
        background-size: 16px 10px;
        background-repeat: repeat-x;
      }

      .thin-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
      .thin-scroll::-webkit-scrollbar-track { background: transparent; }
      .thin-scroll::-webkit-scrollbar-thumb { background: #e9d5ff; border-radius: 999px; }
      .thin-scroll::-webkit-scrollbar-thumb:hover { background: #c084fc; }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: .01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: .01ms !important;
        }
      }
    `}</style>
  );
}

/** Soft ambient glow behind every screen. Purely decorative. */
function AmbientBackdrop({ intensity = 'normal' }: { intensity?: 'normal' | 'soft' }) {
  const o = intensity === 'soft' ? 'opacity-60' : 'opacity-100';
  return (
    <div aria-hidden="true" className={`pointer-events-none fixed inset-0 -z-0 overflow-hidden ${o}`}>
      <div className="absolute -top-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-purple-300/30 blur-3xl anim-blob" />
      <div className="absolute -bottom-48 -right-40 h-[32rem] w-[32rem] rounded-full bg-violet-300/25 blur-3xl anim-blob" style={{ animationDelay: '-5s' }} />
      <div className="absolute top-1/3 left-1/2 h-64 w-64 rounded-full bg-indigo-200/30 blur-3xl anim-blob" style={{ animationDelay: '-2s' }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Splash / loading screen                                            */
/* ------------------------------------------------------------------ */

function SplashScreen({ lang }: { lang: Lang }) {
  const messages = lang === 'en'
    ? ['Verifying secure session…', 'Setting up your workspace…', 'Warming up the kitchen…', 'Almost ready…']
    : ['सुरक्षित सेसन रुजु गर्दै…', 'तपाईंको वर्कस्पेस तयार गर्दै…', 'भान्सा तयार गर्दै…', 'लगभग तयार…'];
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % messages.length), 1100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  return (
    <div
      className="relative min-h-screen bg-[#fbfaff] flex flex-col items-center justify-center overflow-hidden font-sans"
      role="status"
      aria-live="polite"
    >
      <AmbientBackdrop />

      <div className="relative z-10 flex flex-col items-center anim-fade-up">
        <div className="relative h-24 w-24 flex items-center justify-center anim-floaty">
          <span className="absolute inset-0 rounded-[28px] bg-purple-400/30 anim-pulse-ring" />
          <span className="absolute -inset-2.5 rounded-[34px] border-2 border-purple-100 border-t-purple-600 anim-spin-slow" />
          <div className="relative h-24 w-24 rounded-[28px] bg-gradient-to-br from-purple-500 via-violet-600 to-indigo-600 flex items-center justify-center shadow-2xl shadow-purple-500/40">
            <Utensils className="h-10 w-10 text-white" strokeWidth={2.2} aria-hidden="true" />
          </div>
        </div>

        <h1 className="mt-10 text-4xl font-black tracking-tight text-slate-900">
          Atithi{' '}
          <span className="bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 bg-clip-text text-transparent">RMS</span>
        </h1>
        <p className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.28em] text-slate-500">
          {lang === 'en' ? 'Restaurant Management System' : 'रेस्टुरेन्ट व्यवस्थापन प्रणाली'}
        </p>

        <div className="mt-9 h-1.5 w-60 rounded-full bg-purple-100 overflow-hidden">
          <div className="h-full w-2/5 rounded-full bg-gradient-to-r from-purple-500 via-violet-500 to-indigo-500 anim-progress" />
        </div>

        <p key={idx} className="mt-4 h-4 text-xs font-medium text-slate-500 anim-text-swap">
          {messages[idx]}
        </p>
      </div>

      <p className="absolute bottom-6 z-10 text-[10px] font-semibold tracking-[0.2em] text-slate-400 uppercase">
        Cornor Tech Pvt. Ltd.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Live clock + shift timer (isolated so the app doesn't re-render)   */
/* ------------------------------------------------------------------ */

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="hidden lg:flex items-center gap-2.5 rounded-xl border border-purple-100/80 bg-white/70 px-3 py-1.5">
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <time dateTime={now.toISOString()} className="leading-tight">
        <span className="block text-xs font-bold text-slate-900 font-mono tabular-nums">
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span className="block text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
          {now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
      </time>
    </div>
  );
}

/** Shows how long the current staff member has been signed in on this terminal. */
function ShiftTimer({ lang }: { lang: Lang }) {
  const [start] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem('staffShiftStart'));
      return v > 0 ? v : Date.now();
    } catch {
      return Date.now();
    }
  });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const mins = Math.max(0, Math.floor((now - start) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const text = h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;

  return (
    <div
      className="hidden xl:flex items-center gap-2 rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-amber-800"
      title={lang === 'en' ? 'Time since you signed in' : 'लगइन भएदेखिको समय'}
    >
      <Timer className="h-4 w-4" aria-hidden="true" />
      <span className="text-[11px] font-bold">
        {lang === 'en' ? 'On shift' : 'ड्युटीमा'}{' '}
        <span className="font-mono tabular-nums">{text}</span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Language switch                                                    */
/* ------------------------------------------------------------------ */

function LanguageSwitch({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div
      role="group"
      aria-label={lang === 'en' ? 'Language' : 'भाषा'}
      className="flex items-center rounded-xl border border-purple-100/80 bg-white/70 p-1 text-[11px] font-extrabold"
    >
      <Languages className="mx-1.5 h-3.5 w-3.5 text-slate-400 hidden sm:block" aria-hidden="true" />
      {(['en', 'ne'] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          aria-label={l === 'en' ? 'English' : 'नेपाली'}
          className={`px-2.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer active:scale-[0.96] ${FOCUS_RING} ${
            lang === l
              ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-sm shadow-purple-500/30'
              : 'text-slate-500 hover:text-purple-700 hover:bg-purple-50'
          }`}
        >
          {l === 'en' ? 'EN' : 'ने'}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sidebar (shared between desktop + mobile drawer)                   */
/* ------------------------------------------------------------------ */

interface SidebarProps {
  lang: Lang;
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  canAccess: (view: AppView) => boolean;
  labelFor: (item: NavItem) => string;
  collapsed: boolean;
  isMobile?: boolean;
  onClose?: () => void;
  staffRole: StaffRole;
  staffId?: string;
  restaurantName: string;
  roleLabel: string;
  onStaffLogout: () => void;
  onLogout: () => void;
}

function Sidebar({
  lang, currentView, onNavigate, canAccess, labelFor, collapsed, isMobile, onClose,
  staffRole, staffId, restaurantName, roleLabel, onStaffLogout, onLogout,
}: SidebarProps) {
  const compact = collapsed && !isMobile;
  const tone = ROLE_TONE[staffRole];

  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: NAV_ITEMS.filter((i) => i.group === g.key && canAccess(i.view)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="h-full flex flex-col bg-white/85 backdrop-blur-xl border-r border-purple-100/80">
      {/* Brand */}
      <div className={`relative flex items-center ${compact ? 'justify-center px-2' : 'justify-between px-5'} pt-6 pb-5`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="absolute inset-0 rounded-2xl bg-purple-500/40 blur-md" aria-hidden="true" />
            <div className="relative h-11 w-11 rounded-2xl bg-gradient-to-br from-purple-500 via-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-purple-500/30">
              <Utensils className="h-5 w-5" strokeWidth={2.3} aria-hidden="true" />
            </div>
          </div>
          {!compact && (
            <div className="min-w-0">
              <p className="text-[17px] font-black text-slate-900 tracking-tight leading-tight">
                Atithi <span className="text-purple-600">RMS</span>
              </p>
              <span className="mt-1 block truncate text-[10px] font-bold text-slate-500 uppercase tracking-[0.16em] leading-none">
                {restaurantName || 'Restaurant'}
              </span>
            </div>
          )}
        </div>
        {isMobile && (
          <button
            onClick={onClose}
            aria-label={lang === 'en' ? 'Close menu' : 'मेनु बन्द गर्नुहोस्'}
            className={`p-2 rounded-xl border border-purple-100 text-slate-500 hover:text-purple-700 hover:bg-purple-50 active:scale-[0.96] transition-all cursor-pointer ${FOCUS_RING}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav
        aria-label={lang === 'en' ? 'Main navigation' : 'मुख्य नेभिगेसन'}
        className={`flex-1 overflow-y-auto thin-scroll ${compact ? 'px-3' : 'px-4'} pb-4 space-y-6`}
      >
        {groups.map((group) => (
          <div key={group.key} role="group" aria-label={group.label[lang]}>
            {compact ? (
              <div className="mx-3 mb-2.5 h-px bg-purple-100/80" aria-hidden="true" />
            ) : (
              <p className="px-3 mb-2 text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400">
                {group.label[lang]}
              </p>
            )}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active = currentView === item.view;
                const Icon = item.icon;
                const label = labelFor(item);
                return (
                  <li key={item.view}>
                    <button
                      onClick={() => onNavigate(item.view)}
                      title={compact ? label : undefined}
                      aria-label={compact ? label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={`group relative w-full flex items-center gap-3 rounded-xl text-[13px] font-semibold transition-all duration-200 cursor-pointer active:scale-[0.98] ${FOCUS_RING} ${
                        compact ? 'justify-center py-3' : 'px-3 py-2.5'
                      } ${
                        active
                          ? 'bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 text-white shadow-lg shadow-purple-500/25'
                          : 'text-slate-600 hover:bg-purple-50/80 hover:text-purple-700'
                      }`}
                    >
                      {active && !compact && (
                        <span className="absolute -left-4 top-1/2 -translate-y-1/2 h-7 w-1 rounded-r-full bg-purple-600" aria-hidden="true" />
                      )}
                      <Icon
                        aria-hidden="true"
                        className={`h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                          active ? 'text-white' : 'text-slate-400 group-hover:text-purple-600'
                        }`}
                      />
                      {!compact && <span className="truncate">{label}</span>}
                      {!compact && active && <ChevronRight className="ml-auto h-4 w-4 opacity-80" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer: staff identity + logout */}
      <div className={`border-t border-purple-100/60 bg-gradient-to-b from-white/60 to-purple-50/40 ${compact ? 'p-3' : 'p-4'} space-y-2.5`}>
        <div
          className={`flex items-center gap-3 rounded-2xl border border-purple-100/80 bg-white/90 shadow-sm ${compact ? 'justify-center p-2' : 'p-3'}`}
        >
          <div className="relative shrink-0">
            <div
              className={`h-10 w-10 rounded-xl bg-gradient-to-br ${tone.avatar} text-white flex items-center justify-center text-sm font-black shadow-md`}
              aria-hidden="true"
            >
              {staffRole.charAt(0)}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" aria-hidden="true" />
          </div>
          {!compact && (
            <div className="min-w-0 leading-tight">
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">{roleLabel}</p>
              <p className="truncate text-sm font-bold text-slate-900">{tone.label[lang]}</p>
              <p className="truncate text-[10px] font-mono text-slate-500">{staffId}</p>
            </div>
          )}
        </div>

        <button
          onClick={onStaffLogout}
          title={lang === 'en' ? 'Log Out Staff' : 'कर्मचारी बाहिर निस्कनुहोस्'}
          aria-label={lang === 'en' ? 'Log Out Staff' : 'कर्मचारी बाहिर निस्कनुहोस्'}
          className={`w-full py-2.5 px-3 rounded-xl border border-red-100 bg-red-50/80 text-red-700 hover:bg-red-100 hover:border-red-200 active:scale-[0.98] text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer outline-none focus-visible:ring-4 focus-visible:ring-red-500/20`}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {!compact && <span>{lang === 'en' ? 'Log Out Staff' : 'कर्मचारी बाहिर निस्कनुहोस्'}</span>}
        </button>

        <button
          onClick={onLogout}
          title={lang === 'en' ? 'Switch restaurant account' : 'रेस्टुरेन्ट खाता बदल्नुहोस्'}
          aria-label={lang === 'en' ? 'Switch restaurant account' : 'रेस्टुरेन्ट खाता बदल्नुहोस्'}
          className={`w-full flex items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-purple-700 transition-colors cursor-pointer py-1.5 ${FOCUS_RING}`}
        >
          <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
          {!compact && <span>{lang === 'en' ? 'Switch restaurant account' : 'रेस्टुरेन्ट खाता बदल्नुहोस्'}</span>}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Staff login gate                                                   */
/* ------------------------------------------------------------------ */

const ROLE_HINTS: { role: StaffRole; icon: LucideIcon; desc: { en: string; ne: string } }[] = [
  { role: 'Manager', icon: LayoutDashboard, desc: { en: 'Full access: dashboard, staff and settings', ne: 'पूर्ण पहुँच: ड्यासबोर्ड, कर्मचारी र सेटिङ्स' } },
  { role: 'Waiter', icon: ShoppingBag, desc: { en: 'Take orders and check the menu', ne: 'अर्डर लिनुहोस् र मेनु हेर्नुहोस्' } },
  { role: 'Kitchen Staff', icon: Flame, desc: { en: 'Kitchen display and stock', ne: 'भान्सा डिस्प्ले र स्टक' } },
  { role: 'Cashier', icon: FilePlus, desc: { en: 'Bills, tables and daily sales', ne: 'बिल, टेबल र दैनिक बिक्री' } },
];

function StaffLoginGate({
  lang,
  setLang,
  restaurantName,
  onStaffLoginSuccess,
  onBackToRestaurantLogin,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  restaurantName: string;
  onStaffLoginSuccess: (role: StaffRole, staffId: string, restaurantName: string) => void;
  onBackToRestaurantLogin: () => void;
}) {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [capsOn, setCapsOn] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!id.trim() || !password.trim()) {
      setError(lang === 'en' ? 'Enter both staff ID and password.' : 'कर्मचारी आईडी र पासवर्ड दुवै भर्नुहोस्।');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/staff/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send restaurantName so backend can match/sync
        body: JSON.stringify({ id: id.trim(), password, restaurantName }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.message || (lang === 'en' ? 'Invalid staff ID or password.' : 'गलत आईडी वा पासवर्ड।'));
        setLoading(false);
        return;
      }

      if (!data?.user) {
        setError(lang === 'en' ? 'Invalid user data received.' : 'अमान्य डेटा प्राप्त भयो।');
        setLoading(false);
        return;
      }

      const role = data.user.role as StaffRole;
      const returnedRestaurant: string | undefined = data.user.restaurantName;
      const userId = data.user.id || data.user._id;

      if (!role || !ROLE_ACCESS[role]) {
        setError(
          lang === 'en'
            ? 'This staff account has no recognized role. Contact your admin.'
            : 'यो कर्मचारी खातासँग मान्य भूमिका छैन। एडमिनलाई सम्पर्क गर्नुहोस्।'
        );
        setLoading(false);
        return;
      }

      if (data.token) localStorage.setItem('authToken', data.token);

      setLoading(false);
      onStaffLoginSuccess(role, userId, returnedRestaurant || restaurantName);
    } catch (err) {
      setError(lang === 'en' ? 'Could not reach the server. Please try again.' : 'सर्भरसम्म पुग्न सकिएन। फेरि प्रयास गर्नुहोस्।');
      setLoading(false);
    }
  };

  const handleBackClick = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (err) {
      /* ignore */
    }
    if (onBackToRestaurantLogin) onBackToRestaurantLogin();
    else window.location.href = '/';
  };

  const checkCaps = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsOn(e.getModifierState?.('CapsLock') ?? false);
  };

  const inputWrap =
    'group flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3.5 transition-all duration-200 hover:border-purple-200 hover:bg-white focus-within:border-purple-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-purple-500/20';
  const inputIcon = 'h-[18px] w-[18px] text-slate-400 transition-colors group-focus-within:text-purple-600';

  const displayName = restaurantName || (lang === 'en' ? 'Restaurant' : 'रेस्टुरेन्ट');

  return (
    <div className="relative min-h-screen bg-[#fbfaff] flex flex-col font-sans overflow-hidden">
      <AmbientBackdrop />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-5">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-purple-500 via-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-500/30">
            <Utensils className="h-4 w-4" aria-hidden="true" />
          </div>
          <p className="text-base font-black tracking-tight text-slate-900">
            Atithi <span className="text-purple-600">RMS</span>
          </p>
        </div>
        <LanguageSwitch lang={lang} setLang={setLang} />
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 pb-10 sm:px-8">
        <div className={`w-full max-w-4xl grid md:grid-cols-[1fr_1.05fr] rounded-[28px] overflow-hidden anim-pop ${GLASS_PANEL}`}>
          {/* LEFT: restaurant + role guide (desktop) */}
          <section
            aria-label={lang === 'en' ? 'Restaurant and roles' : 'रेस्टुरेन्ट र भूमिकाहरू'}
            className="hidden md:flex flex-col justify-between gap-8 p-9 bg-gradient-to-br from-purple-50 via-violet-50/70 to-indigo-50/60 border-r border-purple-100/70"
          >
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                {lang === 'en' ? 'Restaurant verified' : 'रेस्टुरेन्ट प्रमाणित'}
              </span>

              <div className="mt-5 flex items-center gap-3.5">
                <div className="h-14 w-14 shrink-0 rounded-2xl bg-white ring-1 ring-purple-100 shadow-sm flex items-center justify-center text-purple-600">
                  <Store className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-purple-600">
                    {lang === 'en' ? 'Staff terminal' : 'कर्मचारी टर्मिनल'}
                  </p>
                  <p className="mt-1 truncate text-xl font-black tracking-tight text-slate-900">{displayName}</p>
                </div>
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-bold text-slate-500">
                {lang === 'en' ? 'Your role decides what you can open' : 'तपाईंको भूमिकाअनुसार पहुँच मिल्छ'}
              </p>
              <ul className="space-y-2">
                {ROLE_HINTS.map(({ role, icon: Icon, desc }) => {
                  const tone = ROLE_TONE[role];
                  return (
                    <li
                      key={role}
                      className="flex items-center gap-3 rounded-2xl bg-white/80 px-3.5 py-3 ring-1 ring-purple-100/80 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-purple-500/10"
                    >
                      <span className={`h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br ${tone.avatar} text-white flex items-center justify-center shadow-sm`}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 leading-tight">
                        <p className="text-[13px] font-bold text-slate-900">{tone.label[lang]}</p>
                        <p className="truncate text-[11px] text-slate-500">{desc[lang]}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          {/* RIGHT: form */}
          <section className="bg-white p-7 sm:p-10 flex flex-col justify-center">
            {/* Mobile restaurant chip */}
            <div className="md:hidden mb-6 flex items-center gap-3 rounded-2xl bg-purple-50/70 p-3 ring-1 ring-purple-100">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-white ring-1 ring-purple-100 flex items-center justify-center text-purple-600">
                <Store className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-purple-600">
                  {lang === 'en' ? 'Staff terminal' : 'कर्मचारी टर्मिनल'}
                </p>
                <p className="truncate text-sm font-black text-slate-900">{displayName}</p>
              </div>
            </div>

            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-purple-100 to-indigo-100 text-purple-700 ring-1 ring-purple-200/70 flex items-center justify-center">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </div>

            <h1 className="mt-5 text-2xl sm:text-[28px] font-black tracking-tight text-slate-900">
              {lang === 'en' ? 'Sign in to your shift' : 'आफ्नो सिफ्टमा लगइन गर्नुहोस्'}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">
              {lang === 'en'
                ? 'Use the staff ID and password your restaurant admin gave you.'
                : 'रेस्टुरेन्ट एडमिनले दिएको कर्मचारी आईडी र पासवर्ड प्रयोग गर्नुहोस्।'}
            </p>

            {error && (
              <div
                role="alert"
                className="mt-5 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800 anim-fade-in"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
              <div>
                <label htmlFor="staff-id" className="block text-xs font-bold text-slate-700 mb-1.5">
                  {lang === 'en' ? 'Staff ID' : 'कर्मचारी आईडी'}
                </label>
                <div className={inputWrap}>
                  <User2 className={inputIcon} aria-hidden="true" />
                  <input
                    id="staff-id"
                    type="text"
                    value={id}
                    onChange={(e) => { setId(e.target.value); if (error) setError(''); }}
                    placeholder="e.g. STF-0042"
                    className="w-full outline-none text-sm text-slate-900 placeholder:text-slate-400 font-mono bg-transparent"
                    autoComplete="username"
                    autoCapitalize="characters"
                    spellCheck={false}
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label htmlFor="staff-password" className="block text-xs font-bold text-slate-700 mb-1.5">
                  {lang === 'en' ? 'Password' : 'पासवर्ड'}
                </label>
                <div className={inputWrap}>
                  <Lock className={inputIcon} aria-hidden="true" />
                  <input
                    id="staff-password"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
                    onKeyUp={checkCaps}
                    onKeyDown={checkCaps}
                    onBlur={() => setCapsOn(false)}
                    placeholder="••••••••"
                    className="w-full outline-none text-sm text-slate-900 placeholder:text-slate-400 bg-transparent"
                    autoComplete="current-password"
                    aria-describedby={capsOn ? 'caps-warning' : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    aria-label={showPw
                      ? (lang === 'en' ? 'Hide password' : 'पासवर्ड लुकाउनुहोस्')
                      : (lang === 'en' ? 'Show password' : 'पासवर्ड देखाउनुहोस्')}
                    aria-pressed={showPw}
                    className={`rounded-lg p-1 text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors cursor-pointer ${FOCUS_RING}`}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
                {capsOn && (
                  <p id="caps-warning" className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 anim-fade-in">
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    {lang === 'en' ? 'Caps Lock is on' : 'क्याप्स लक अन छ'}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className={`relative mt-2 w-full overflow-hidden flex items-center justify-center gap-2 rounded-2xl text-sm font-bold py-3.5 cursor-pointer disabled:opacity-75 disabled:hover:translate-y-0 disabled:cursor-wait ${GRADIENT_BTN} ${FOCUS_RING}`}
              >
                {loading && <span className="absolute inset-0 anim-shimmer" aria-hidden="true" />}
                {loading
                  ? <Loader2 className="relative h-4 w-4 animate-spin" aria-hidden="true" />
                  : null}
                <span className="relative">
                  {loading
                    ? lang === 'en' ? 'Checking credentials…' : 'जाँच गर्दै…'
                    : lang === 'en' ? 'Sign in' : 'लगइन गर्नुहोस्'}
                </span>
                {!loading && <ChevronRight className="relative h-4 w-4" aria-hidden="true" />}
              </button>
            </form>

            <p className="mt-5 text-center text-[11px] text-slate-500">
              {lang === 'en' ? 'Forgot your password? Ask your manager to reset it.' : 'पासवर्ड बिर्सनुभयो? म्यानेजरलाई रिसेट गर्न भन्नुहोस्।'}
            </p>

            <div className="mt-6 pt-5 border-t border-slate-100">
              <button
                type="button"
                onClick={handleBackClick}
                className={`mx-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-purple-700 hover:bg-purple-50 transition-colors cursor-pointer ${FOCUS_RING}`}
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                {lang === 'en' ? 'Back to restaurant login' : 'रेस्टुरेन्ट लगइनमा फर्कनुहोस्'}
              </button>
            </div>
          </section>
        </div>
      </main>

      <footer className="relative z-10 pb-5 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        Cornor Tech Pvt. Ltd.
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [sales] = useState<Sale[]>([]);
const { lang, setLang } = useLang();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('sidebarCollapsed') === '1'; } catch { return false; }
  });
  const [splashDone, setSplashDone] = useState(false);

  const [authState, setAuthState] = useState<{ isAuthenticated: boolean | null; isAdmin: boolean }>({
    isAuthenticated: null,
    isAdmin: false,
  });

  const [currentUserPayload, setCurrentUserPayload] = useState<{ _id: string; id: string; RESTAURANTName: string } | null>(null);

  const [staffAuthState, setStaffAuthState] = useState<{ isAuthenticated: boolean; role: StaffRole | null }>({
    isAuthenticated: false,
    role: null,
  });
  const [staffPayload, setStaffPayload] = useState<{ id: string; role: StaffRole; RESTAURANTName: string } | null>(null);

  const [Customers, setCustomers] = useState<Customer[]>([]);
  const [invoiceToView, setInvoiceToView] = useState<Sale | null>(null);

  const fetchCustomers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/Customers`);
      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        setCustomers(result.data);
      } else {
        console.error('Unexpected response shape while fetching Customers:', result);
      }
    } catch (error) {
      console.error('🔴 Failed to fetch Customers from MongoDB:', error);
    }
  };
  void fetchCustomers; // kept for later use

  const refreshData = () => {
    // fetchBills(); fetchStocks(); fetchCustomers();
  };

  // Minimum splash time so the loading screen feels smooth, not flashy
  useEffect(() => {
    const id = setTimeout(() => setSplashDone(true), 1400);
    return () => clearTimeout(id);
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem('sidebarCollapsed', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  // Session verification
  useEffect(() => {
    const checkSession = async () => {
      const token = localStorage.getItem('authToken');
      if (!token) {
        setAuthState({ isAuthenticated: false, isAdmin: false });
        return;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/auth/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();

        if (response.ok && data.success) {
          const targetUser = data.user || data.data?.user || data.data || data;
                    localStorage.setItem('offlineSessionUser', JSON.stringify(targetUser)); // 📴 used when offline

          const isAdminUser = !!(
            targetUser?.isAdmin === true ||
            targetUser?.role === 'Admin' ||
            String(targetUser?.role).toLowerCase() === 'admin' ||
            String(targetUser?.id).toLowerCase() === 'admin'
          );

          setCurrentUserPayload({
            _id: targetUser?._id || targetUser?.id || 'user-id',
            id: targetUser?.id || targetUser?._id || 'user-id',
            RESTAURANTName: targetUser?.RESTAURANTName || targetUser?.restaurantName || 'Restaurant Workspace',
          });

          setAuthState({ isAuthenticated: true, isAdmin: isAdminUser });
        } else {
          localStorage.removeItem('authToken');
          setAuthState({ isAuthenticated: false, isAdmin: false });
        }
            } catch (err) {
        // 📴 No internet → stay logged in with the last saved session
        const saved = localStorage.getItem('offlineSessionUser');
        if (saved) {
          const targetUser = JSON.parse(saved);
          setCurrentUserPayload({
            _id: targetUser?._id || targetUser?.id || 'user-id',
            id: targetUser?.id || targetUser?._id || 'user-id',
            RESTAURANTName: targetUser?.RESTAURANTName || targetUser?.restaurantName || 'Restaurant Workspace',
          });
          setAuthState({ isAuthenticated: true, isAdmin: targetUser?.isAdmin === true });
        } else {
          localStorage.removeItem('authToken');
          setAuthState({ isAuthenticated: false, isAdmin: false });
        }
      }
    };
    checkSession();
  }, []);

  // Restore staff session for this restaurant
  useEffect(() => {
    if (
      authState.isAuthenticated === true &&
      !authState.isAdmin &&
      currentUserPayload &&
      !staffAuthState.isAuthenticated
    ) {
      const savedRole = localStorage.getItem('staffRole') as StaffRole | null;
      const savedId = localStorage.getItem('staffId');
      const savedRESTAURANT = localStorage.getItem('staffRESTAURANTName');

      if (
        savedRole && savedId && savedRESTAURANT &&
        savedRESTAURANT === currentUserPayload.RESTAURANTName &&
        ROLE_ACCESS[savedRole]
      ) {
        setStaffPayload({ id: savedId, role: savedRole, RESTAURANTName: savedRESTAURANT });
        setStaffAuthState({ isAuthenticated: true, role: savedRole });
        setCurrentView(ROLE_ACCESS[savedRole].defaultView);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState.isAuthenticated, authState.isAdmin, currentUserPayload]);

  // Keep the current view valid for the staff role
  useEffect(() => {
    if (staffPayload && !ROLE_ACCESS[staffPayload.role].pages.includes(currentView)) {
      setCurrentView(ROLE_ACCESS[staffPayload.role].defaultView);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffPayload]);

  // Scroll to top whenever the page changes
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [currentView]);

  // Escape closes the invoice modal first, then the mobile drawer
  useEffect(() => {
    if (!invoiceToView && !isMobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (invoiceToView) setInvoiceToView(null);
      else setIsMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [invoiceToView, isMobileMenuOpen]);

    const handleLogout = async () => {
    // 📴 Warn if some orders/bills are still only on this device
    if (
      (await hasUnsyncedChanges()) &&
      !window.confirm('Some orders/bills are saved on this device but NOT synced yet.\nThey will sync the next time this restaurant logs in here.\n\nLog out anyway?')
    ) return;
    localStorage.removeItem('offlineSessionUser');
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    localStorage.removeItem('staffRole');
    localStorage.removeItem('staffId');
    localStorage.removeItem('staffRESTAURANTName');
    localStorage.removeItem('staffShiftStart');
    setCurrentUserPayload(null);
    setStaffPayload(null);
    setStaffAuthState({ isAuthenticated: false, role: null });
    setAuthState({ isAuthenticated: false, isAdmin: false });
  };

  const handleStaffLogout = () => {
    localStorage.removeItem('staffRole');
    localStorage.removeItem('staffId');
    localStorage.removeItem('staffRESTAURANTName');
    localStorage.removeItem('staffShiftStart');
    setStaffPayload(null);
    setStaffAuthState({ isAuthenticated: false, role: null });
  };

  const handleLoginSuccess = (token: string, userDetails?: any) => {
    localStorage.setItem('authToken', token);

    let isUserAdmin = false;
    let decodedPayload: any = null;

    if (token && token.includes('.')) {
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          window.atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        decodedPayload = JSON.parse(jsonPayload);
      } catch (e) {
        console.error('Failed to parse token claims', e);
      }
    }

    const roleSource = userDetails?.user || userDetails?.data?.user || userDetails?.data || userDetails || decodedPayload || {};

    if (
      roleSource.isAdmin === true ||
      roleSource.role === 'Admin' ||
      String(roleSource.role).toLowerCase() === 'admin' ||
      roleSource.isSystemAdmin === true ||
      String(roleSource.id).toLowerCase() === 'admin'
    ) {
      isUserAdmin = true;
    }

    setCurrentUserPayload({
      _id: roleSource._id || roleSource.id || 'user-id',
      id: roleSource.id || roleSource._id || 'user-id',
      RESTAURANTName: roleSource.RESTAURANTName || 'Restaurant Workspace',
    });

    localStorage.setItem('user', JSON.stringify({
      _id: roleSource._id || roleSource.id || '',
      id: roleSource.id || roleSource._id || '',
      RESTAURANTName: roleSource.RESTAURANTName || '',
    }));

    setAuthState({ isAuthenticated: true, isAdmin: isUserAdmin });
  };

  const handleStaffLoginSuccess = (role: StaffRole, staffId: string, RESTAURANTName: string) => {
    localStorage.setItem('staffRole', role);
    localStorage.setItem('staffId', staffId);
    localStorage.setItem('staffRESTAURANTName', RESTAURANTName);
    localStorage.setItem('staffShiftStart', String(Date.now()));
    setStaffPayload({ id: staffId, role, RESTAURANTName });
    setStaffAuthState({ isAuthenticated: true, role });
    setCurrentView(ROLE_ACCESS[role].defaultView);
  };

  /* ================== GATEWAY ROUTING ================== */

  // Gateway 1: splash / session check
  if (authState.isAuthenticated === null || !splashDone) {
    return (
      <>
        <GlobalStyles />
        <SplashScreen lang={lang} />
      </>
    );
  }

  // Gateway 2: not logged in
  if (authState.isAuthenticated === false) {
    return (
      <>
        <GlobalStyles />
        <LoginScreen
          lang={lang}
          setLang={setLang}
          onLoginSuccess={(token, user) => handleLoginSuccess(token, user)}
        />
      </>
    );
  }

  // Gateway 3: admin
  if (authState.isAuthenticated && authState.isAdmin === true) {
    const adminTranslations = TRANSLATIONS[lang];
    return (
      <>
        <GlobalStyles />
        <AdminDashboard
          lang={lang}
          setLang={setLang}
          onLogout={handleLogout}
          currentUserPayload={currentUserPayload}
          user={currentUserPayload}
          payload={currentUserPayload}
          t={adminTranslations}
          translations={adminTranslations}
          langData={adminTranslations}
        />
      </>
    );
  }

  // Gateway 4: restaurant logged in, staff not yet
  if (authState.isAuthenticated && !authState.isAdmin && !staffAuthState.isAuthenticated) {
    return (
      <>
        <GlobalStyles />
        <StaffLoginGate
          lang={lang}
          setLang={setLang}
          restaurantName={currentUserPayload?.RESTAURANTName || ''}
          onStaffLoginSuccess={handleStaffLoginSuccess}
          onBackToRestaurantLogin={handleLogout}
        />
      </>
    );
  }

  // Gateway 5: main system
  const t = TRANSLATIONS[lang];
  const staffRole: StaffRole = staffPayload?.role ?? 'Waiter';
  const tone = ROLE_TONE[staffRole];
  const legacyRole = LEGACY_ROLE_MAP[staffRole];
  const canAccess = (view: AppView) => ROLE_ACCESS[staffRole].pages.includes(view);
  const activeRESTAURANTName = staffPayload?.RESTAURANTName || currentUserPayload?.RESTAURANTName || '';

  const labelFor = (item: NavItem) => (item.view === 'dashboard' ? t.dashboard : item.label[lang]);
  const currentItem = NAV_ITEMS.find((i) => i.view === currentView);
  const currentGroup = NAV_GROUPS.find((g) => g.key === currentItem?.group);
  const CurrentIcon = currentItem?.icon ?? LayoutDashboard;

  const navigate = (view: AppView) => {
    setCurrentView(view);
    setIsMobileMenuOpen(false);
  };

  const sidebarProps = {
    lang,
    currentView,
    onNavigate: navigate,
    canAccess,
    labelFor,
    staffRole,
    staffId: staffPayload?.id,
    restaurantName: activeRESTAURANTName,
    roleLabel: t.role,
    onStaffLogout: () => { handleStaffLogout(); setIsMobileMenuOpen(false); },
    onLogout: () => { handleLogout(); setIsMobileMenuOpen(false); },
  };

  return (
    <div className="relative min-h-screen bg-[#fbfaff] flex font-sans text-slate-800 antialiased" id="app-root">
      <GlobalStyles />
      <AmbientBackdrop intensity="soft" />

      {/* Skip link for keyboard users */}
      <a
        href="#app-main-viewport"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-xl focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-purple-700 focus:shadow-lg focus:ring-4 focus:ring-purple-500/25"
      >
        {lang === 'en' ? 'Skip to content' : 'सामग्रीमा जानुहोस्'}
      </a>

      {/* DESKTOP SIDEBAR */}
      <aside
        className={`relative z-10 hidden md:block sticky top-0 h-screen shrink-0 transition-[width] duration-300 ease-out ${
          sidebarCollapsed ? 'w-[84px]' : 'w-72'
        }`}
        id="app-sidebar"
      >
        <Sidebar {...sidebarProps} collapsed={sidebarCollapsed} />
      </aside>

      {/* MAIN VIEWPORT */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0" id="app-viewport">
        {/* HEADER */}
        <header
          className="h-[72px] sticky top-0 z-20 flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 bg-white/75 backdrop-blur-xl border-b border-purple-100/70"
          id="app-header"
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className={`md:hidden p-2.5 rounded-xl border border-purple-100 bg-white text-slate-600 hover:text-purple-700 hover:bg-purple-50 active:scale-[0.96] transition-all cursor-pointer ${FOCUS_RING}`}
              id="mobile-menu-toggle"
              aria-label={lang === 'en' ? 'Open navigation menu' : 'नेभिगेसन मेनु खोल्नुहोस्'}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-drawer-overlay"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>

            <button
              onClick={toggleSidebar}
              className={`hidden md:flex p-2.5 rounded-xl border border-purple-100 bg-white text-slate-500 hover:text-purple-700 hover:bg-purple-50 active:scale-[0.96] transition-all cursor-pointer ${FOCUS_RING}`}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!sidebarCollapsed}
              aria-controls="app-sidebar"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed
                ? <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
                : <PanelLeftClose className="h-5 w-5" aria-hidden="true" />}
            </button>

            <div className="flex items-center gap-3 min-w-0">
              <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-100 via-violet-100 to-indigo-100 text-purple-700 ring-1 ring-purple-200/60">
                <CurrentIcon className="h-[18px] w-[18px]" aria-hidden="true" />
              </div>
              <div className="min-w-0 leading-tight">
                <nav aria-label="Breadcrumb" className="hidden sm:block">
                  <ol className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                    <li className="truncate max-w-[160px]">{activeRESTAURANTName || 'Restaurant'}</li>
                    {currentGroup && (
                      <>
                        <li aria-hidden="true"><ChevronRight className="h-3 w-3 text-slate-300" /></li>
                        <li className="truncate">{currentGroup.label[lang]}</li>
                      </>
                    )}
                  </ol>
                </nav>
                <h1 className="truncate text-base sm:text-lg font-black tracking-tight text-slate-900">
                  {currentItem ? labelFor(currentItem) : ''}
                </h1>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5" id="header-right">
            <ShiftTimer lang={lang} />
            <LiveClock />
            <LanguageSwitch lang={lang} setLang={setLang} />

            {/* Staff identity */}
            <div className="flex items-center gap-2.5 rounded-xl border border-purple-100/80 bg-white/90 p-1 sm:pr-3 shadow-sm">
              <div
                className={`h-8 w-8 rounded-lg bg-gradient-to-br ${tone.avatar} text-white flex items-center justify-center text-xs font-black`}
                aria-hidden="true"
              >
                {staffRole.charAt(0)}
              </div>
              <div className="hidden sm:block leading-tight">
                <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ${tone.badge}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
                  {tone.label[lang]}
                </span>
                <p className="mt-0.5 text-[10px] font-mono text-slate-500">{staffPayload?.id}</p>
              </div>
            </div>
          </div>
        </header>

        {/* CONTENT */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 outline-none" id="app-main-viewport" tabIndex={-1}>
          <div key={currentView} className="mx-auto w-full max-w-[1600px] anim-fade-up">
            {currentView === 'dashboard' && canAccess('dashboard') && <Dashboard lang={lang} setView={setCurrentView} />}

            {currentView === 'pos' && canAccess('pos') && <CreateOrder />}

            {currentView === 'totalorder' && canAccess('totalorder') && (
              <TotalOrder restaurantId={activeRESTAURANTName} />
            )}

            {currentView === 'unpaidbill' && canAccess('unpaidbill') && <UnpaidBill lang={lang} />}

            {currentView === 'kitchen' && canAccess('kitchen') && <KitchenDisplay />}

           {currentView === 'createbill' && canAccess('createbill') && <CreateBill lang={lang} />}

            {currentView === 'tables' && canAccess('tables') && <Tables />}

            {currentView === 'orders' && canAccess('orders') && <OrdersPage />}
               {currentView === 'notifications' && canAccess('notifications') && <Notifications />}

            {currentView === 'inventory' && canAccess('inventory') && (
              <MenuManager lang={lang} currentUserRole={legacyRole} />
            )}

            {currentView === 'stock' && canAccess('stock') && <StockManagement />}

            {currentView === 'billing' && canAccess('billing') && (
              <BillingManager
                sales={sales}
                Customers={Customers}
                lang={lang}
                currentUserRole={legacyRole}
                onBillingUpdated={refreshData}
                onViewInvoice={(sale) => setInvoiceToView(sale)}
                initialInvoice={invoiceToView}
                onClearInitialInvoice={() => setInvoiceToView(null)}
              />
            )}

            {canAccess('staff') && currentView === 'staff' && (
              <StaffManager RESTAURANTName={activeRESTAURANTName} />
            )}

            {canAccess('settings') && currentView === 'settings' && <RESTAURANTSettings />}
          </div>
        </main>

        <footer className="px-4 sm:px-6 lg:px-8 py-4 border-t border-purple-100/50 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 flex flex-wrap items-center justify-between gap-2">
          <span>Atithi RMS · Cornor Tech Pvt. Ltd.</span>
          <span className="inline-flex items-center gap-1.5 normal-case tracking-normal text-[11px] text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            {lang === 'en' ? 'Connected' : 'जडान भएको'}
          </span>
        </footer>
      </div>

      
      {/* 📴 Offline / sync status */}
      <OfflineBanner />

      {/* GLOBAL INVOICE MODAL */}
      {invoiceToView && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 anim-fade-in"
          id="global-invoice-modal"
          onClick={(e) => { if (e.target === e.currentTarget) setInvoiceToView(null); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-dialog-title"
            className={`rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 anim-pop ${GLASS_PANEL} bg-white/95 shadow-2xl shadow-purple-900/20`}
          >
            <div className="flex justify-between items-center border-b border-purple-100/70 pb-4">
              <span id="invoice-dialog-title" className="font-extrabold text-slate-900 flex items-center gap-2.5 text-sm">
                <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-purple-100 to-violet-100 text-purple-700 flex items-center justify-center ring-1 ring-purple-200/60">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                </span>
                {lang === 'en' ? 'Tax Invoice Audit View' : 'कर बिजक विवरण'}
              </span>
              <button
                onClick={() => setInvoiceToView(null)}
                aria-label={lang === 'en' ? 'Close invoice' : 'बिजक बन्द गर्नुहोस्'}
                autoFocus
                className={`p-2 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-100 active:scale-[0.96] transition-all cursor-pointer ${FOCUS_RING}`}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <style>{`
              @media print {
                @page { size: 80mm auto; margin: 2mm; }
                html, body { width: 80mm; }
                body * { visibility: hidden; }
                #global-printable-receipt, #global-printable-receipt * { visibility: visible; }
                #global-printable-receipt {
                  position: absolute; left: 0; top: 0;
                  width: 76mm; max-width: 76mm;
                  max-height: none !important; overflow: visible !important;
                  border: none !important; box-shadow: none !important;
                  background: #fff !important; padding: 0 !important; margin: 0 !important;
                  font-size: 9px; line-height: 1.35;
                }
                #global-printable-receipt * {
                  font-weight: 600 !important; color: #000 !important;
                  -webkit-font-smoothing: antialiased;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                #global-printable-receipt h3 { font-size: 12px; font-weight: 800 !important; }
                #global-printable-receipt h4 { font-size: 10px; font-weight: 700 !important; }
                #global-printable-receipt table { font-size: 8.5px; }
              }
            `}</style>

            <div
              className="p-5 border border-slate-200 rounded-2xl bg-[#fcfbff] font-sans text-xs text-slate-800 space-y-3 shadow-inner max-h-[420px] overflow-y-auto thin-scroll"
              id="global-printable-receipt"
            >
              <div className="text-center space-y-0.5 pb-2 border-b border-slate-300 border-dashed">
                <h3 className="text-sm font-extrabold text-slate-950 uppercase tracking-tight">
                  {invoiceToView.RESTAURANTName || t.title}
                </h3>
                <p className="text-[10px] text-slate-500">{invoiceToView.location || t.location}</p>
                <p className="font-semibold text-[10px]">PAN / VAT No: {invoiceToView.panOrVat || ' '}</p>
                <h4 className="text-[11px] font-extrabold text-slate-950 uppercase border-y border-slate-200 py-1 tracking-wider mt-1.5">
                  PAYMENT RECEIPT
                </h4>
                {invoiceToView.paymentStatus === 'Refunded' && (
                  <div
                    className="my-1.5 py-1 bg-red-100 text-red-800 border-2 border-red-300 font-bold rounded uppercase tracking-widest text-[11px]"
                    id="invoice-void-banner"
                  >
                    VOID / REFUNDED INVOICE
                  </div>
                )}
              </div>

              <div className="text-[10px] space-y-0.5 border-b border-slate-200 pb-2 leading-tight">
                <div className="flex justify-between gap-2">
                  <span>Invoice No: <span className="font-mono font-bold text-slate-950">{invoiceToView.id}</span></span>
                  <span>Date: <span className="font-mono">{new Date(invoiceToView.createdAt).toLocaleString()}</span></span>
                </div>

                <div>
                  Bill To:{' '}
                  <span className="font-bold text-slate-900">
                    {invoiceToView.CustomerId
                      ? (Customers.find((p) => (p.id || p._id) === invoiceToView.CustomerId)?.fullName ||
                          (Customers.find((p) => (p.id || p._id) === invoiceToView.CustomerId) as any)?.name ||
                          invoiceToView.CustomerId)
                      : 'Walk-in'}
                  </span>
                </div>

                <div>Merged from: <span className="font-semibold text-slate-950">1 bill(s)</span></div>
                <div>Payment Method: <span className="font-semibold text-slate-950">{invoiceToView.paymentMethod}</span></div>
              </div>

              <table className="w-full text-[10px] leading-tight">
                <thead>
                  <tr className="border-b border-slate-300 font-bold text-slate-950 text-left">
                    <th scope="col" className="pb-1">Item</th>
                    <th scope="col" className="pb-1 text-center">Qty</th>
                    <th scope="col" className="pb-1 text-right">Rate</th>
                    <th scope="col" className="pb-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 border-b border-slate-300">
                  {invoiceToView.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-1"><p className="font-bold text-slate-950">{item.name}</p></td>
                      <td className="py-1 text-center font-mono">{item.quantity}</td>
                      <td className="py-1 text-right font-mono">NPR {item.unitPrice.toFixed(2)}</td>
                      <td className="py-1 text-right font-mono">NPR {item.totalPrice.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="space-y-0.5 text-[10px] text-slate-700 max-w-[210px] ml-auto leading-tight">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-mono">NPR {invoiceToView.subTotal.toFixed(2)}</span>
                </div>
                {invoiceToView.discount > 0 && (
                  <div className="flex justify-between text-red-700">
                    <span>Discount:</span>
                    <span className="font-mono">-NPR {invoiceToView.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium">
                  <span>Taxable Amount:</span>
                  <span className="font-mono">NPR {(invoiceToView.subTotal - invoiceToView.discount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-400 pt-1 text-[11px] text-slate-950 font-bold">
                  <span>GRAND TOTAL:</span>
                  <span className="font-mono text-purple-700">NPR {invoiceToView.grandTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="text-[10px] font-bold text-slate-900 pt-1">
                STATUS: <span className="text-purple-700">PAID ({invoiceToView.paymentMethod})</span>
              </div>

              {invoiceToView.refundReason && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-800 space-y-0.5 mt-3 text-[10px]">
                  <p className="font-bold uppercase text-[9px]">Refund Audit Reason Log:</p>
                  <p className="italic">"{invoiceToView.refundReason}"</p>
                  <p className="text-[9px] font-mono text-right">
                    Refunded on: {new Date(invoiceToView.refundedAt || '').toLocaleString()}
                  </p>
                </div>
              )}

              <div className="pt-6 border-t border-dashed border-slate-300 text-[9px] space-y-2 text-center">
                <div className="italic text-slate-500">Thank you, visit again!</div>
                <div className="font-semibold text-slate-500">Powered By: Atithi RMS by Cornor Tech Pvt. Ltd.</div>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-purple-100/70">
              <button
                type="button"
                onClick={() => setInvoiceToView(null)}
                className={`px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-xl active:scale-[0.98] transition-all cursor-pointer ${FOCUS_RING}`}
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className={`px-6 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 cursor-pointer ${GRADIENT_BTN} ${FOCUS_RING}`}
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
                Print Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE DRAWER */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden flex"
          id="mobile-drawer-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={lang === 'en' ? 'Navigation menu' : 'नेभिगेसन मेनु'}
        >
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm anim-fade-in"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-72 max-w-[85vw] h-full z-50 shadow-2xl shadow-purple-900/20 anim-slide-right">
            <Sidebar
              {...sidebarProps}
              collapsed={false}
              isMobile
              onClose={() => setIsMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}