import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  Fingerprint, Users, UserCheck, UserX, Clock, Activity, Search, ChevronLeft, ChevronRight,
  Download, Printer, Plus, RefreshCw, Trash2, Wifi, WifiOff, Settings, BarChart3, Cpu, Link2, Info, X, Save,
} from 'lucide-react';

// Same backend address and login token as the rest of the app (see StaffManager.tsx)
const API_ROOT = (import.meta.env.VITE_API_URL || 'https://rms-elhj.onrender.com').trim().replace(/\/+$/, '');
const api = axios.create({ baseURL: `${API_ROOT}/api/attendance` });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
const errMsg = (err: any) => err?.response?.data?.message || 'Something went wrong. Please try again.';

// ---------- small helpers ----------
const hm = (min: number) => (min > 0 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : '—');
const shiftDate = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const prettyDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PAGE_SIZE = 15;

const card = 'bg-white rounded-2xl border border-slate-200/80 shadow-sm';
const input = 'w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-purple-500/20 focus:border-purple-400';
const btnPrimary = 'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 shadow-md shadow-purple-500/20 hover:shadow-lg disabled:opacity-60 cursor-pointer';
const btnLight = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer';

const STATUS: Record<string, { label: string; cls: string }> = {
  present: { label: 'Present', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  late: { label: 'Late', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  working: { label: 'Working now', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  absent: { label: 'Absent', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  not_in_yet: { label: 'Not in yet', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  weekly_off: { label: 'Day off', cls: 'bg-slate-50 text-slate-400 border-slate-200' },
  upcoming: { label: '—', cls: 'bg-white text-slate-300 border-slate-100' },
  not_joined: { label: 'Not joined', cls: 'bg-white text-slate-300 border-slate-100' },
};
const StatusPill: React.FC<{ status: string; late?: boolean }> = ({ status, late }) => {
  const s = STATUS[status] || STATUS.absent;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${s.cls}`}>{s.label}</span>
      {late && status === 'working' && <span className="px-2 py-0.5 rounded-full border text-[11px] font-bold bg-amber-50 text-amber-800 border-amber-200">Late</span>}
    </span>
  );
};

// Download rows as a real Excel file (uses the xlsx package already in this project)
async function downloadExcel(filename: string, header: string[], rows: (string | number)[][]) {
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Attendance');
  XLSX.writeFile(book, filename);
}

type Notify = (msg: string, type?: 'success' | 'error') => void;
type Tab = 'daily' | 'reports' | 'devices' | 'settings';

const Modal: React.FC<{ open: boolean; onClose: () => void; title: string; subtitle?: string; wide?: boolean; children: React.ReactNode }> = ({ open, onClose, title, subtitle, wide, children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className={`w-full ${wide ? 'max-w-3xl' : 'max-w-md'} bg-white rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-black text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 cursor-pointer" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

const Attendance: React.FC = () => {
  const [tab, setTab] = useState<Tab>('daily');
  const [historyFor, setHistoryFor] = useState<{ staffRef: string; fullName: string } | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const notify: Notify = (msg, type = 'success') => {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 4000);
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'daily', label: 'Daily attendance', icon: <Users className="w-4 h-4" /> },
    { id: 'reports', label: 'Reports', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'devices', label: 'Fingerprint devices', icon: <Cpu className="w-4 h-4" /> },
    { id: 'settings', label: 'Working hours', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-purple-500/20">
          <Fingerprint className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Staff Attendance</h1>
          <p className="text-xs text-slate-500">First finger scan of the day is check-in, the last scan is check-out.</p>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl w-full sm:w-fit overflow-x-auto print:hidden">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
              tab === t.id ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'daily' && <DailyTab onOpenHistory={setHistoryFor} notify={notify} />}
      {tab === 'reports' && <ReportsTab onOpenHistory={setHistoryFor} notify={notify} />}
      {tab === 'devices' && <DevicesTab notify={notify} />}
      {tab === 'settings' && <SettingsTab notify={notify} />}

      <HistoryModal person={historyFor} onClose={() => setHistoryFor(null)} notify={notify} />

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] max-w-sm px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white ${toast.type === 'success' ? 'bg-purple-700' : 'bg-rose-600'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
};

// ======================================================================
// Daily attendance
// ======================================================================
const DailyTab: React.FC<{ onOpenHistory: (p: any) => void; notify: Notify }> = ({ onOpenHistory, notify }) => {
  const [data, setData] = useState<any>(null);
  const [date, setDate] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ staffRef: '', date: '', time: '', note: '' });

  const load = async (d?: string) => {
    setIsLoading(true);
    try {
      const res = await api.get('/', { params: d ? { date: d } : {} });
      setData(res.data);
      setDate(res.data.date);
    } catch (err) {
      notify(errMsg(err), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // While looking at today, refresh every 60 seconds so new finger scans appear by themselves
  useEffect(() => {
    if (!data || data.date !== data.today) return;
    const timer = window.setInterval(() => load(data.date), 60000);
    return () => window.clearInterval(timer);
  }, [data?.date, data?.today]);

  const changeDate = (d: string) => {
    setPage(1);
    load(d);
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.rows || []).filter((r: any) => {
      if (q && !`${r.fullName} ${r.loginId} ${r.role}`.toLowerCase().includes(q)) return false;
      if (statusFilter === 'all') return true;
      if (statusFilter === 'present') return ['present', 'late', 'working'].includes(r.status);
      if (statusFilter === 'late') return r.isLate;
      if (statusFilter === 'absent') return ['absent', 'not_in_yet'].includes(r.status);
      return r.status === statusFilter;
    });
  }, [data, search, statusFilter]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const saveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/manual', manual);
      notify(res.data.message);
      setManualOpen(false);
      load(date);
    } catch (err) {
      notify(errMsg(err), 'error');
    }
  };

  const exportExcel = () =>
    downloadExcel(`attendance_${date}.xlsx`, ['Name', 'Role', 'Check-in', 'Check-out', 'Working time', 'Late (min)', 'Overtime (min)', 'Status'],
      rows.map((r: any) => [r.fullName, r.role, r.checkIn, r.checkOut, hm(r.workingMinutes), r.lateMinutes, r.overtimeMinutes, (STATUS[r.status] || { label: r.status }).label]));

  const s = data?.summary;
  const cards = [
    { label: 'Total staff', value: s?.totalStaff, icon: <Users className="w-4 h-4" />, cls: 'text-slate-700 bg-slate-100' },
    { label: 'Present', value: s?.present, icon: <UserCheck className="w-4 h-4" />, cls: 'text-purple-700 bg-purple-100' },
    { label: data?.date === data?.today ? 'Absent / not in' : 'Absent', value: s?.absent, icon: <UserX className="w-4 h-4" />, cls: 'text-rose-700 bg-rose-100' },
    { label: 'Late', value: s?.late, icon: <Clock className="w-4 h-4" />, cls: 'text-amber-700 bg-amber-100' },
    { label: 'Working now', value: s?.currentlyWorking, icon: <Activity className="w-4 h-4" />, cls: 'text-sky-700 bg-sky-100' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <button onClick={() => changeDate(shiftDate(date, -1))} className={btnLight} aria-label="Previous day"><ChevronLeft className="w-4 h-4" /></button>
          <input type="date" value={date} max={data?.today} onChange={(e) => e.target.value && changeDate(e.target.value)} className={`${input} w-auto font-semibold`} />
          <button onClick={() => changeDate(shiftDate(date, 1))} disabled={!data || date >= data.today} className={`${btnLight} disabled:opacity-40`} aria-label="Next day">
            <ChevronRight className="w-4 h-4" />
          </button>
          {data && date !== data.today && (
            <button onClick={() => changeDate(data.today)} className="px-3 py-2 text-xs font-bold text-purple-700 hover:bg-purple-50 rounded-xl cursor-pointer">Today</button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setManual({ staffRef: data?.rows?.[0]?.staffRef || '', date, time: '', note: '' });
              setManualOpen(true);
            }}
            className={btnPrimary}
          >
            <Plus className="w-4 h-4" /> Manual entry
          </button>
          <button onClick={exportExcel} className={btnLight}><Download className="w-4 h-4" /> Excel</button>
          <button onClick={() => window.print()} className={btnLight}><Printer className="w-4 h-4" /> PDF</button>
        </div>
      </div>

      <h2 className="hidden print:block text-lg font-bold">Attendance - {date && prettyDate(date)}</h2>

      {data?.isWeeklyOff && (
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600">{prettyDate(date)} is a day off. Anyone who scanned is still shown as present.</div>
      )}
      {s?.notLinked > 0 && (
        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2 print:hidden">
          <Info className="w-4 h-4 shrink-0 mt-px" />
          <span>{s.notLinked} staff member{s.notLinked === 1 ? ' is' : 's are'} not linked to the fingerprint machine. Set their <b>Device User ID</b> in the <b>Fingerprint devices</b> tab.</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((c) => (
          <div key={c.label} className={`${card} p-4`}>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${c.cls}`}>{c.icon}</div>
            <span className="text-2xl font-black text-slate-900 block">{isLoading && !data ? '…' : c.value ?? 0}</span>
            <span className="text-[11px] font-semibold text-slate-500">{c.label}</span>
          </div>
        ))}
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="p-3 border-b border-slate-100 flex flex-col sm:flex-row gap-2 print:hidden">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search name, login ID or role" className={`${input} pl-9`} />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className={`${input} sm:w-48 cursor-pointer`}>
            <option value="all">Everyone</option>
            <option value="present">Present</option>
            <option value="late">Late</option>
            <option value="working">Working now</option>
            <option value="absent">Absent / not in</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Check-in</th>
                <th className="py-3 px-4">Check-out</th>
                <th className="py-3 px-4">Working hours</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && !data ? (
                <tr><td colSpan={6} className="py-10 text-center text-slate-400">Loading…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-slate-400">No staff match.</td></tr>
              ) : (
                shown.map((r: any) => (
                  <tr key={r.staffRef} onClick={() => onOpenHistory(r)} className="hover:bg-purple-50/40 cursor-pointer">
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900 block">{r.fullName}</span>
                      <span className="text-[11px] text-slate-400">{r.deviceUserId ? `Device ID ${r.deviceUserId}` : 'not linked'}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{r.role}</td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-900">{r.checkIn || '—'}</span>
                      {r.lateMinutes > 0 && <span className="block text-[11px] text-amber-700">{r.lateMinutes} min late</span>}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-900">{r.checkOut || '—'}</span>
                      {r.overtimeMinutes > 0 && <span className="block text-[11px] text-purple-700">+{hm(r.overtimeMinutes)} overtime</span>}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-700">
                      {hm(r.workingMinutes)}
                      {r.hasManual && <span className="ml-1 text-[10px] text-slate-400">(manual)</span>}
                    </td>
                    <td className="py-3 px-4"><StatusPill status={r.status} late={r.isLate} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 print:hidden">
            <span>{rows.length} staff • page {page} of {pages}</span>
            <div className="flex gap-1">
              <button disabled={page === 1} onClick={() => setPage(page - 1)} className={`${btnLight} disabled:opacity-40`}>Previous</button>
              <button disabled={page === pages} onClick={() => setPage(page + 1)} className={`${btnLight} disabled:opacity-40`}>Next</button>
            </div>
          </div>
        )}
      </div>

      <Modal open={manualOpen} onClose={() => setManualOpen(false)} title="Manual entry" subtitle="Add a scan by hand (machine off, forgot to scan…)">
        <form onSubmit={saveManual} className="space-y-4 text-sm">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Staff member *</label>
            <select required value={manual.staffRef} onChange={(e) => setManual({ ...manual, staffRef: e.target.value })} className={`${input} cursor-pointer`}>
              {(data?.rows || []).map((r: any) => <option key={r.staffRef} value={r.staffRef}>{r.fullName} ({r.role})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Date *</label>
              <input type="date" required max={data?.today} value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} className={input} />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Time *</label>
              <input type="time" required value={manual.time} onChange={(e) => setManual({ ...manual, time: e.target.value })} className={input} />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Reason</label>
            <input value={manual.note} onChange={(e) => setManual({ ...manual, note: e.target.value })} placeholder="e.g. Machine was off" className={input} />
          </div>
          <p className="text-[11px] text-slate-500">Add the arrival time first, then the leaving time as a second entry.</p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setManualOpen(false)} className={btnLight}>Cancel</button>
            <button type="submit" className={btnPrimary}>Save</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
// ======================================================================
// Reports
// ======================================================================
const ReportsTab: React.FC<{ onOpenHistory: (p: any) => void; notify: Notify }> = ({ onOpenHistory, notify }) => {
  const todayLocal = new Date().toISOString().slice(0, 10);
  const [range, setRange] = useState({ from: `${todayLocal.slice(0, 7)}-01`, to: todayLocal });
  const [preset, setPreset] = useState('month');
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = async (from: string, to: string) => {
    setIsLoading(true);
    try {
      const res = await api.get('/report', { params: { from, to } });
      setData(res.data);
    } catch (err) {
      notify(errMsg(err), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load(range.from, range.to);
  }, []);

  const applyPreset = (p: string) => {
    const today = data?.today || todayLocal;
    let from = today, to = today;
    if (p === 'week') from = shiftDate(today, -new Date(`${today}T00:00:00Z`).getUTCDay());
    else if (p === 'month') from = `${today.slice(0, 7)}-01`;
    else if (p === 'lastMonth') {
      to = shiftDate(`${today.slice(0, 7)}-01`, -1);
      from = `${to.slice(0, 7)}-01`;
    }
    setPreset(p);
    setRange({ from, to });
    load(from, to);
  };

  const exportExcel = () =>
    downloadExcel(`attendance_report_${range.from}_to_${range.to}.xlsx`,
      ['Name', 'Role', 'Present days', 'Late days', 'Absent days', 'Total hours', 'Overtime hours', 'Average check-in'],
      (data?.staff || []).map((r: any) => [r.fullName, r.role, r.presentDays, r.lateDays, r.absentDays, r.totalWorkingHours, r.overtimeHours, r.averageCheckIn]));

  const maxBar = Math.max(1, ...(data?.daily || []).map((d: any) => d.present + d.absent));

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          {[['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['lastMonth', 'Last month']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => applyPreset(id)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer ${preset === id ? 'bg-purple-600 text-white border-purple-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
          <div className="flex items-center gap-1.5 text-xs">
            <input type="date" value={range.from} onChange={(e) => { setPreset('custom'); setRange({ ...range, from: e.target.value }); }} className={`${input} w-auto`} />
            <span className="text-slate-400">to</span>
            <input type="date" value={range.to} onChange={(e) => { setPreset('custom'); setRange({ ...range, to: e.target.value }); }} className={`${input} w-auto`} />
            <button onClick={() => load(range.from, range.to)} className="px-3 py-2 bg-slate-900 text-white font-bold rounded-xl cursor-pointer">Show</button>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportExcel} disabled={!data} className={btnLight}><Download className="w-4 h-4" /> Excel</button>
          <button onClick={() => window.print()} className={btnLight}><Printer className="w-4 h-4" /> PDF</button>
        </div>
      </div>

      <h2 className="hidden print:block text-lg font-bold">Attendance report {range.from} to {range.to}</h2>

      {isLoading && !data ? (
        <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
      ) : data && (
        <>
          <div className={`${card} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="font-black text-sm text-slate-900">Present vs absent per day</h3>
              <div className="flex gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-purple-600" /> Present</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-300" /> Absent</span>
                <span className="text-slate-400">{data.workingDays} working days</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <div className="flex items-end gap-1 h-40 min-w-fit">
                {data.daily.map((d: any) => (
                  <div key={d.date} className="flex flex-col items-center justify-end h-full w-5 shrink-0" title={`${d.date}: ${d.present} present, ${d.absent} absent${d.weeklyOff ? ' (day off)' : ''}`}>
                    <div className="w-full flex flex-col justify-end flex-1">
                      <div className="w-full bg-rose-300 rounded-t-sm" style={{ height: `${(d.absent / maxBar) * 100}%` }} />
                      <div className={`w-full ${d.weeklyOff ? 'bg-slate-300' : 'bg-purple-600'} ${d.absent ? '' : 'rounded-t-sm'}`} style={{ height: `${(d.present / maxBar) * 100}%` }} />
                    </div>
                    <span className="text-[9px] mt-1 text-slate-500">{d.date.slice(8)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`${card} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4 text-center">Present</th>
                    <th className="py-3 px-4 text-center">Late</th>
                    <th className="py-3 px-4 text-center">Absent</th>
                    <th className="py-3 px-4 text-right">Total hours</th>
                    <th className="py-3 px-4 text-right">Overtime</th>
                    <th className="py-3 px-4 text-center">Avg. check-in</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.staff.length === 0 ? (
                    <tr><td colSpan={7} className="py-10 text-center text-slate-400">No active staff.</td></tr>
                  ) : data.staff.map((r: any) => (
                    <tr key={r.staffRef} onClick={() => onOpenHistory(r)} className="hover:bg-purple-50/40 cursor-pointer">
                      <td className="py-3 px-4"><span className="font-bold text-slate-900 block">{r.fullName}</span><span className="text-[11px] text-slate-400">{r.role}</span></td>
                      <td className="py-3 px-4 text-center font-bold text-purple-700">{r.presentDays}</td>
                      <td className="py-3 px-4 text-center font-bold text-amber-600">{r.lateDays}</td>
                      <td className="py-3 px-4 text-center font-bold text-rose-600">{r.absentDays}</td>
                      <td className="py-3 px-4 text-right font-semibold">{r.totalWorkingHours} h</td>
                      <td className="py-3 px-4 text-right">{r.overtimeHours} h</td>
                      <td className="py-3 px-4 text-center">{r.averageCheckIn || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 print:hidden">Click a person to see every day and every scan. Days off and today are not counted as absent.</p>
        </>
      )}
    </div>
  );
};

// ======================================================================
// One person's history
// ======================================================================
const HistoryModal: React.FC<{ person: { staffRef: string; fullName: string } | null; onClose: () => void; notify: Notify }> = ({ person, onClose, notify }) => {
  const todayLocal = new Date().toISOString().slice(0, 10);
  const [range, setRange] = useState({ from: `${todayLocal.slice(0, 7)}-01`, to: todayLocal });
  const [data, setData] = useState<any>(null);

  const load = async () => {
    if (!person) return;
    try {
      const res = await api.get(`/history/${person.staffRef}`, { params: range });
      setData(res.data);
    } catch (err) {
      notify(errMsg(err), 'error');
    }
  };

  useEffect(() => {
    setData(null);
    load();
  }, [person?.staffRef]);

  const removeManual = async (id: string) => {
    if (!window.confirm('Remove this manual entry?')) return;
    try {
      const res = await api.delete(`/devices/logs/${id}`);
      notify(res.data.message);
      load();
    } catch (err) {
      notify(errMsg(err), 'error');
    }
  };

  return (
    <Modal open={!!person} onClose={onClose} title={person?.fullName || ''} subtitle="Attendance history" wide>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className={`${input} w-auto`} />
          <span className="text-slate-400">to</span>
          <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className={`${input} w-auto`} />
          <button onClick={load} className="px-3 py-2 bg-slate-900 text-white font-bold rounded-xl cursor-pointer">Show</button>
        </div>
        <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 max-h-[55vh] overflow-y-auto">
          {!data ? (
            <div className="py-8 text-center text-slate-400">Loading…</div>
          ) : data.history.map((h: any) => (
            <div key={h.date} className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="sm:w-40 font-semibold text-slate-800">{prettyDate(h.date)}</div>
              <div className="flex-1 flex flex-wrap items-center gap-1.5">
                {h.scans.length === 0 && <span className="text-slate-300">no scans</span>}
                {h.scans.map((sc: any) => (
                  <span key={sc.id} title={sc.note || (sc.source === 'manual' ? 'Manual entry' : sc.deviceId)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border font-mono text-xs ${sc.source === 'manual' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                    {sc.time}
                    {sc.source === 'manual' && (
                      <button onClick={() => removeManual(sc.id)} className="text-amber-700 hover:text-rose-600 cursor-pointer" aria-label="Remove manual entry"><Trash2 className="w-3 h-3" /></button>
                    )}
                  </span>
                ))}
              </div>
              <div className="sm:w-24 text-slate-600">{hm(h.workingMinutes)}</div>
              <div className="sm:w-28"><StatusPill status={h.status} /></div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">Grey = scan from the machine. Yellow = manual entry.</p>
      </div>
    </Modal>
  );
};

// ======================================================================
// Devices + staff fingerprint IDs
// ======================================================================
const DevicesTab: React.FC<{ notify: Notify }> = ({ notify }) => {
  const [devices, setDevices] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [unlinked, setUnlinked] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [ids, setIds] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', serialNumber: '', location: '' });
  const [linkChoice, setLinkChoice] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  const server = (() => {
    try {
      const u = new URL(API_ROOT);
      return { host: u.hostname, port: u.port || (u.protocol === 'https:' ? '443' : '80'), https: u.protocol === 'https:' };
    } catch {
      return { host: API_ROOT, port: '', https: false };
    }
  })();

  const load = async (keepTyping = false) => {
    setIsLoading(true);
    try {
      const [d, l, s] = await Promise.all([api.get('/devices'), api.get('/devices/logs'), api.get('/staff')]);
      setDevices(d.data.devices);
      setLogs(l.data.logs);
      setUnlinked(l.data.unlinked);
      setStaff(s.data.staff);
      if (!keepTyping) setIds(Object.fromEntries(s.data.staff.map((x: any) => [x.staffRef, x.deviceUserId])));
    } catch (err) {
      notify(errMsg(err), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 30000); // keep "online" status fresh
    return () => window.clearInterval(timer);
  }, []);

  const run = async (call: Promise<any>, after?: () => void) => {
    try {
      const res = await call;
      notify(res.data.message);
      after?.();
      load();
    } catch (err) {
      notify(errMsg(err), 'error');
    }
  };

  const register = (e: React.FormEvent) => {
    e.preventDefault();
    run(api.post('/devices/connect', form), () => {
      setAddOpen(false);
      setForm({ name: '', serialNumber: '', location: '' });
    });
  };

  const saveId = (staffRef: string, value: string) => run(api.put(`/staff/${staffRef}/device`, { deviceUserId: value }));

  const ago = (iso?: string) => {
    if (!iso) return 'never';
    const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.round(sec / 60)} min ago`;
    if (sec < 86400) return `${Math.round(sec / 3600)} h ago`;
    return new Date(iso).toLocaleString();
  };

  const freeStaff = staff.filter((s) => !s.deviceUserId);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-black text-slate-900">Machines</h3>
        <button onClick={() => setAddOpen(true)} className={btnPrimary}><Plus className="w-4 h-4" /> Add device</button>
      </div>

      {isLoading && !devices.length ? (
        <div className="py-8 text-center text-sm text-slate-400">Loading…</div>
      ) : devices.length === 0 ? (
        <div className="p-6 bg-white border border-dashed border-slate-300 rounded-2xl text-center text-sm text-slate-500">
          <Fingerprint className="w-8 h-8 text-purple-300 mx-auto mb-2" />
          No fingerprint machine yet. Click <b>Add device</b> and enter the serial number shown on the machine.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {devices.map((d) => (
            <div key={d.deviceId} className={`${card} p-4 ${d.status === 'active' ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2"><span className="font-bold text-slate-900">{d.name}</span><span className="text-[11px] text-slate-400">{d.deviceId}</span></div>
                  <span className="text-[11px] text-slate-500 font-mono">SN: {d.serialNumber}</span>
                  {d.location && <span className="text-[11px] text-slate-500"> • {d.location}</span>}
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold border ${
                  d.status !== 'active' ? 'bg-slate-50 text-slate-500 border-slate-200' : d.online ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}>
                  {d.online && d.status === 'active' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {d.status !== 'active' ? 'Disabled' : d.online ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
                <div className="p-2 bg-slate-50 rounded-xl"><span className="text-slate-400 block">Last seen</span><b className="text-slate-700">{ago(d.lastSeenAt)}</b></div>
                <div className="p-2 bg-slate-50 rounded-xl"><span className="text-slate-400 block">Last scan</span><b className="text-slate-700">{ago(d.lastLogAt)}</b></div>
                <div className="p-2 bg-slate-50 rounded-xl"><span className="text-slate-400 block">Scans received</span><b className="text-slate-700">{d.totalLogs}</b></div>
              </div>
              {d.info?.firmware && <p className="mt-2 text-[11px] text-slate-500">{d.info.firmware} • {d.info.userCount} users • {d.info.fingerprintCount} fingerprints</p>}
              <div className="flex flex-wrap gap-1.5 mt-3">
                <button onClick={() => run(api.post('/devices/sync', { deviceId: d.deviceId }))} className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-[11px] font-bold cursor-pointer">
                  <RefreshCw className="w-3 h-3" /> Sync all scans
                </button>
                <button onClick={() => run(api.put(`/devices/${d.deviceId}`, { status: d.status === 'active' ? 'inactive' : 'active' }))} className="px-2.5 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-xl text-[11px] font-bold cursor-pointer">
                  {d.status === 'active' ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => window.confirm(`Remove ${d.name}? Attendance already received is kept.`) && run(api.delete(`/devices/${d.deviceId}`))} className="px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 rounded-xl text-[11px] font-bold cursor-pointer">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="p-4 bg-purple-50/60 border border-purple-100 rounded-2xl text-sm text-slate-700 space-y-2">
        <h4 className="font-bold text-purple-900 flex items-center gap-1.5"><Info className="w-4 h-4" /> Settings to type into the machine</h4>
        <p className="text-xs">On the machine open <b>Menu → Comm. → Cloud Server Setting</b> (some models call it <b>ADMS</b>) and enter:</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="p-2 bg-white rounded-xl border border-purple-100"><span className="text-slate-400 block text-[11px]">Server address</span><b className="font-mono break-all">{server.host}</b></div>
          <div className="p-2 bg-white rounded-xl border border-purple-100"><span className="text-slate-400 block text-[11px]">Server port</span><b className="font-mono">{server.port}</b></div>
          <div className="p-2 bg-white rounded-xl border border-purple-100"><span className="text-slate-400 block text-[11px]">HTTPS</span><b>{server.https ? 'ON' : 'OFF'}</b></div>
        </div>
        <p className="text-xs">Turn <b>Enable Domain Name</b> ON and <b>Proxy</b> OFF, then restart the machine. It shows <b>Online</b> here within a minute.</p>
      </div>

      {/* Staff <-> Device User ID */}
      <div className={`${card} overflow-hidden`}>
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="font-black text-slate-900">Staff fingerprint IDs</h3>
          <p className="text-xs text-slate-500">Type the User ID each person has on the machine (e.g. 101) and press Save. Leave empty to unlink.</p>
        </div>
        <div className="divide-y divide-slate-100">
          {staff.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">No staff yet. Add staff in Manage Staff first.</div>
          ) : staff.map((s) => {
            const changed = (ids[s.staffRef] ?? '') !== (s.deviceUserId ?? '');
            return (
              <div key={s.staffRef} className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 ${s.isActive ? '' : 'opacity-50'}`}>
                <div className="flex-1">
                  <span className="font-bold text-slate-900">{s.fullName}</span>
                  <span className="text-xs text-slate-500"> • {s.role}{s.isActive ? '' : ' • inactive'}</span>
                </div>
                <input
                  value={ids[s.staffRef] ?? ''}
                  onChange={(e) => setIds({ ...ids, [s.staffRef]: e.target.value.replace(/[^A-Za-z0-9]/g, '') })}
                  placeholder="Device User ID"
                  maxLength={20}
                  className={`${input} sm:w-40 font-mono`}
                />
                <button onClick={() => saveId(s.staffRef, ids[s.staffRef] ?? '')} disabled={!changed} className={`${btnPrimary} disabled:opacity-40`}>
                  <Save className="w-4 h-4" /> Save
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {unlinked.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 text-sm font-bold text-amber-900 flex items-center gap-1.5">
            <Link2 className="w-4 h-4" /> These machine users scanned but are not linked to anyone
          </div>
          <div className="divide-y divide-slate-100">
            {unlinked.map((u) => {
              const key = `${u.deviceId}|${u.deviceUserId}`;
              return (
                <div key={key} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
                  <div className="flex-1"><b className="text-slate-900">Device User ID {u.deviceUserId}</b><span className="text-xs text-slate-500"> • {u.scans} scan{u.scans === 1 ? '' : 's'} • last {u.lastScan}</span></div>
                  <select value={linkChoice[key] || ''} onChange={(e) => setLinkChoice({ ...linkChoice, [key]: e.target.value })} className={`${input} sm:w-56 cursor-pointer`}>
                    <option value="">Choose staff…</option>
                    {freeStaff.map((s) => <option key={s.staffRef} value={s.staffRef}>{s.fullName}</option>)}
                  </select>
                  <button
                    onClick={() => (linkChoice[key] ? saveId(linkChoice[key], u.deviceUserId) : notify('Choose a staff member first.', 'error'))}
                    className={btnPrimary}
                  >
                    Link
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={`${card} overflow-hidden`}>
        <div className="px-4 py-3 border-b border-slate-100 font-black text-slate-900">Latest scans received</div>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                <th className="py-2.5 px-4">Time</th>
                <th className="py-2.5 px-4">Device user</th>
                <th className="py-2.5 px-4">Staff</th>
                <th className="py-2.5 px-4">From</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-slate-400">No scans yet.</td></tr>
              ) : logs.map((l) => (
                <tr key={l.id}>
                  <td className="py-2 px-4 font-mono text-xs">{l.punchTime}</td>
                  <td className="py-2 px-4">{l.deviceUserId || '—'}</td>
                  <td className="py-2 px-4">{l.staffName || <span className="text-amber-700 font-semibold">not linked</span>}</td>
                  <td className="py-2 px-4 text-slate-500">{l.source === 'manual' ? 'Manual' : l.deviceId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add fingerprint device" subtitle="Register the machine so its scans are saved for this restaurant">
        <form onSubmit={register} className="space-y-4 text-sm">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Device name *</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kitchen door" className={input} />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Serial number (SN) *</label>
            <input required value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value.toUpperCase() })} placeholder="e.g. CKJJ201560001" className={`${input} font-mono`} />
            <p className="mt-1 text-[11px] text-slate-500">On the machine: <b>Menu → System Info → Device Info → Serial Number</b>, or the sticker on the back.</p>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Location</label>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Staff entrance" className={input} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setAddOpen(false)} className={btnLight}>Cancel</button>
            <button type="submit" className={btnPrimary}>Add device</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

// ======================================================================
// Working hours
// ======================================================================
const SettingsTab: React.FC<{ notify: Notify }> = ({ notify }) => {
  const [form, setForm] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    api.get('/settings').then((res) => setForm(res.data.settings)).catch((err) => notify(errMsg(err), 'error'));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await api.put('/settings', { ...form, graceMinutes: Number(form.graceMinutes) });
      notify(res.data.message);
    } catch (err) {
      notify(errMsg(err), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!form) return <div className="py-8 text-center text-sm text-slate-400">Loading…</div>;

  const toggleDay = (d: number) =>
    setForm({ ...form, weeklyOffDays: form.weeklyOffDays.includes(d) ? form.weeklyOffDays.filter((x: number) => x !== d) : [...form.weeklyOffDays, d] });

  return (
    <form onSubmit={save} className={`${card} p-5 space-y-5 text-sm max-w-2xl`}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Shift starts</label>
          <input type="time" required value={form.workStart} onChange={(e) => setForm({ ...form, workStart: e.target.value })} className={input} />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Shift ends</label>
          <input type="time" required value={form.workEnd} onChange={(e) => setForm({ ...form, workEnd: e.target.value })} className={input} />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Grace (minutes)</label>
          <input type="number" min={0} max={240} required value={form.graceMinutes} onChange={(e) => setForm({ ...form, graceMinutes: e.target.value })} className={input} />
        </div>
      </div>
      <p className="text-[11px] text-slate-500">Late = arriving after shift start + grace. Overtime = leaving after shift end.</p>
      <div>
        <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Weekly day off (leave all off if open every day)</span>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((name, i) => (
            <button type="button" key={name} onClick={() => toggleDay(i)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${form.weeklyOffDays.includes(i) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-600 border-slate-200'}`}>
              {name.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>
      <div className="sm:w-1/2">
        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Time zone</label>
        <input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className={`${input} font-mono`} />
        <p className="mt-1 text-[11px] text-slate-500">Nepal: Asia/Kathmandu</p>
      </div>
      <div className="pt-3 border-t border-slate-100 flex justify-end">
        <button type="submit" disabled={isSaving} className={btnPrimary}>{isSaving ? 'Saving…' : 'Save working hours'}</button>
      </div>
    </form>
  );
};

export default Attendance;