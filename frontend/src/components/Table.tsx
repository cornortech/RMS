import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useLang } from '../i18n';

const getApiBase = (): string => {
  const url = import.meta.env.VITE_API_URL || "https://rms-elhj.onrender.com";
  return url.trim().replace(/\/+$/, "") + "/api/tables";
};

interface TableItem {
  id: string;
  _id: string;
  restaurantId: string;
  tableName: string;
  capacity: number;
  occupiedSeats?: number;
  freeSeats?: number;
  status: string;
  createdAt: string;
}

interface FormState {
  tableName: string;
  capacity: number;
  occupiedSeats: number;
  status: string;
}

const initialForm: FormState = { tableName: "", capacity: 4, occupiedSeats: 0, status: "Available" };

const STATUS_OPTIONS = ["Available", "Occupied", "Reserved", "Out of Service"];
// Only for showing on screen. The saved value always stays English.
const STATUS_LABEL: Record<string, { en: string; ne: string }> = {
  Available: { en: "Available", ne: "उपलब्ध" },
  Occupied: { en: "Occupied", ne: "भरिएको" },
  Reserved: { en: "Reserved", ne: "आरक्षित" },
  "Out of Service": { en: "Out of Service", ne: "सेवामा छैन" },
};
const SHORT: Record<string, string> = { Available: "Free", Occupied: "Busy", Reserved: "Held", "Out of Service": "Off" };

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  Available: { bg: "#e8f7ee", text: "#12703a", dot: "#22a558" },
  Occupied: { bg: "#fdebea", text: "#a3251d", dot: "#e5484d" },
  Reserved: { bg: "#fff3dc", text: "#8a5300", dot: "#f0a020" },
  "Out of Service": { bg: "#ececf1", text: "#52525f", dot: "#9a9aa8" },
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
const taken = (t: { capacity: number; occupiedSeats?: number }) => clamp(t.occupiedSeats ?? 0, 0, t.capacity);

/** Keeps status and guest count consistent with each other. */
const syncStatus = (status: string, occupied: number, changedField: "status" | "guests") => {
  if (changedField === "guests") {
    if (occupied > 0 && status === "Available") return { status: "Occupied", occupied };
    if (occupied === 0 && status === "Occupied") return { status: "Available", occupied };
    return { status, occupied };
  }
  if (status === "Available" || status === "Out of Service") return { status, occupied: 0 };
  if (status === "Occupied") return { status, occupied: Math.max(1, occupied) };
  return { status, occupied };
};

const getRestaurantId = (): string => {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return parsed?.id || parsed?._id || "";
  } catch {
    return "";
  }
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=DM+Sans:wght@400;500;600;700&display=swap');
.tb{--ink:#1b1330;--muted:#6d6585;--line:#e6e0f2;--brand:#7c3aed;--brand-d:#5b21b6;--paper:#faf8ff;--free:#22a558;--used:#e5484d;
  font-family:'DM Sans',system-ui,sans-serif;color:var(--ink);background:var(--paper);min-height:100vh;padding:28px 20px 80px}
.tb *{box-sizing:border-box}
.tb-wrap{max-width:1240px;margin:0 auto}
.tb h1,.tb h2,.tb h3{font-family:'Bricolage Grotesque',sans-serif;margin:0}
.tb button{font-family:inherit;cursor:pointer}
.tb button:disabled{cursor:not-allowed;opacity:.45}
.tb :focus-visible{outline:3px solid #c4b5fd;outline-offset:2px}
.tb-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:22px}
.tb-head h1{font-size:clamp(28px,4vw,40px);font-weight:800;letter-spacing:-1px;line-height:1.05}
.tb-head p{margin:6px 0 0;color:var(--muted);font-size:14px}
.tb-primary{background:var(--brand);color:#fff;border:0;border-radius:12px;padding:12px 20px;font-weight:700;font-size:14px;
  box-shadow:0 6px 18px rgba(124,58,237,.28);transition:transform .15s,background .15s}
.tb-primary:hover{background:var(--brand-d);transform:translateY(-1px)}
.tb-ghost{background:#fff;color:var(--ink);border:1px solid var(--line);border-radius:12px;padding:12px 18px;font-weight:600;font-size:14px}
.tb-ghost:hover{border-color:#c9bde8}

.tb-over{background:#fff;border:1px solid var(--line);border-radius:20px;padding:20px;margin-bottom:18px}
.tb-over-top{display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px;margin-bottom:14px}
.tb-big{font-family:'Bricolage Grotesque',sans-serif;font-size:36px;font-weight:800;letter-spacing:-1px;line-height:1}
.tb-big small{font-family:'DM Sans';font-size:14px;font-weight:500;color:var(--muted);letter-spacing:0;margin-left:8px}
.tb-legend{display:flex;gap:16px;font-size:13px;font-weight:600;color:var(--muted)}
.tb-legend span{display:inline-flex;align-items:center;gap:6px}
.tb-legend i{width:10px;height:10px;border-radius:50%;display:block}
.tb-bar{display:flex;height:14px;border-radius:99px;overflow:hidden;background:#f0ecf9;gap:2px}
.tb-bar span{display:block;transition:flex .5s ease;min-width:0}
.tb-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.tb-chip{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:99px;border:1px solid var(--line);
  background:#fff;font-size:13px;font-weight:600;color:var(--ink);transition:all .15s}
.tb-chip:hover{border-color:#c9bde8}
.tb-chip[aria-pressed=true]{background:var(--ink);color:#fff;border-color:var(--ink)}
.tb-chip i{width:9px;height:9px;border-radius:50%;display:block}
.tb-chip b{font-weight:800;opacity:.75}

.tb-tools{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
.tb-in{width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:#fff;font:inherit;font-size:14px;color:var(--ink)}
.tb-in:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px #ddd0fb}
.tb-search{flex:1;min-width:220px}
.tb-sort{width:auto;min-width:170px}

.tb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.tb-card{background:#fff;border:1px solid var(--line);border-radius:20px;padding:16px;display:flex;flex-direction:column;gap:14px;
  transition:box-shadow .2s,transform .2s;animation:tbIn .35s ease both}
.tb-card:hover{box-shadow:0 14px 30px -12px rgba(60,30,120,.25);transform:translateY(-2px)}
.tb-card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.tb-card h3{font-size:19px;font-weight:800;letter-spacing:-.3px;line-height:1.2;word-break:break-word}
.tb-badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;padding:4px 10px;border-radius:99px;white-space:nowrap}
.tb-badge i{width:7px;height:7px;border-radius:50%;display:block}
.tb-stage{position:relative;height:138px;border-radius:14px;display:grid;place-items:center;
  background:radial-gradient(circle at 50% 50%,#fff 0,#f7f3ff 100%);border:1px dashed var(--line)}
.tb-floor{position:relative;width:150px;height:110px}
.tb-top{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:grid;place-items:center;text-align:center;line-height:1;
  font-family:'Bricolage Grotesque';font-weight:800;color:#fff;font-size:18px;box-shadow:inset 0 -4px 0 rgba(0,0,0,.14),0 6px 14px rgba(0,0,0,.14)}
.tb-top small{display:block;font-family:'DM Sans';font-size:9px;font-weight:600;opacity:.85;margin-top:3px}
.tb-seat{position:absolute;width:15px;height:15px;border-radius:50%;transform:translate(-50%,-50%);border:2.5px solid;transition:all .3s}

.tb-guests{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#f7f3ff;border-radius:14px;padding:10px 12px}
.tb-guests-txt b{display:block;font-size:15px;font-weight:800}
.tb-guests-txt span{font-size:12px;color:var(--muted);font-weight:600}
.tb-guests-txt .free{color:#12703a}
.tb-stepper{display:flex;align-items:center;gap:6px}
.tb-stepper button{width:36px;height:36px;border-radius:10px;border:1px solid var(--line);background:#fff;font-size:20px;font-weight:600;color:var(--ink);line-height:1}
.tb-stepper button:hover:not(:disabled){border-color:var(--brand);color:var(--brand)}
.tb-stepper output{min-width:24px;text-align:center;font-weight:800;font-size:16px}

.tb-quick{display:grid;grid-template-columns:repeat(4,1fr);gap:3px;background:#f3effb;padding:3px;border-radius:12px}
.tb-quick button{border:0;background:transparent;border-radius:9px;padding:8px 0;font-size:12px;font-weight:600;color:var(--muted);transition:all .15s}
.tb-quick button:hover{color:var(--ink)}
.tb-quick button[aria-pressed=true]{background:#fff;color:var(--ink);font-weight:800;box-shadow:0 1px 4px rgba(0,0,0,.1)}
.tb-actions{display:flex;gap:8px}
.tb-actions button{flex:1;padding:9px 0;border-radius:10px;font-weight:700;font-size:13px;border:1px solid var(--line);background:#fff;color:var(--ink)}
.tb-actions button:hover{border-color:#c9bde8;background:#faf8ff}
.tb-actions .del{color:#c0281f}
.tb-actions .del:hover{background:#fdebea;border-color:#f6c4c1}
.tb-actions .sure{background:#c0281f;color:#fff;border-color:#c0281f}

.tb-skel{height:400px;border-radius:20px;background:linear-gradient(100deg,#f0ecf9 30%,#f9f6ff 50%,#f0ecf9 70%);background-size:200% 100%;animation:tbSk 1.2s infinite}
.tb-empty{text-align:center;padding:60px 20px;background:#fff;border:2px dashed var(--line);border-radius:20px}
.tb-empty h3{font-size:22px;margin-bottom:6px}
.tb-empty p{color:var(--muted);margin:0 0 18px;font-size:14px}
.tb-err{display:flex;justify-content:space-between;align-items:center;gap:10px;background:#fdebea;color:#a3251d;border:1px solid #f6c4c1;
  padding:12px 16px;border-radius:12px;margin-bottom:16px;font-size:14px;font-weight:600}
.tb-err button{background:none;border:0;color:inherit;font-weight:800;font-size:16px}

/* ── Modal overlay, rendered via a portal directly into document.body
   (see the ModalPortal component) so it is completely outside the
   page's own DOM/layout tree. position:fixed on a portal-rendered
   node always centers on the real browser viewport — it can no
   longer be trapped by any ancestor's transform/overflow/filter,
   which is what pins a "fixed" element to the page instead of the
   screen. Wider + shorter card per request. */
.tb-back{
  position:fixed;inset:0;z-index:9999;background:rgba(27,19,48,.55);backdrop-filter:blur(3px);
  display:flex;align-items:center;justify-content:center;padding:24px;overflow-y:auto;
  animation:tbFade .2s;
}
.tb-modal{
  position:relative;width:100%;max-width:600px;margin:auto;
  max-height:min(600px,calc(100vh - 64px));max-height:min(600px,calc(100dvh - 64px));
  background:#fff;border-radius:24px;overflow:hidden;
  display:flex;flex-direction:column;
  box-shadow:0 30px 80px -20px rgba(27,19,48,.45),0 0 0 1px rgba(27,19,48,.05);
  animation:tbPop .25s cubic-bezier(.2,.9,.25,1);
}
.tb-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:22px 26px 0}
.tb-modal-head-txt h2{font-size:23px;font-weight:800;letter-spacing:-.5px;line-height:1.15}
.tb-modal-head-txt p{margin:4px 0 0;font-size:13px;color:var(--muted);font-weight:500}
.tb-close{flex-shrink:0;width:34px;height:34px;border-radius:10px;border:1px solid var(--line);background:#fff;
  font-size:17px;line-height:1;color:var(--muted);display:grid;place-items:center;transition:all .15s}
.tb-close:hover{background:#f7f3ff;color:var(--ink);border-color:#c9bde8}
.tb-modal-body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:16px 26px 20px;
  display:grid;grid-template-columns:1fr 1fr;gap:16px 20px;align-content:start}
.tb-modal-body .tb-full{grid-column:1 / -1}
.tb-modal-footer{flex:0 0 auto;display:flex;gap:10px;padding:14px 26px;border-top:1px solid var(--line);background:#fcfaff}
.tb-modal-footer button{flex:1}

.tb-lbl{font-size:13px;font-weight:700;display:block;margin-bottom:8px}
.tb-hint{font-size:12px;color:var(--muted);margin-top:6px}
.tb-step{display:flex;align-items:center;gap:10px}
.tb-step button{width:38px;height:38px;border-radius:11px;border:1px solid var(--line);background:#fff;font-size:20px;font-weight:600;color:var(--ink);transition:all .15s;flex-shrink:0}
.tb-step button:hover:not(:disabled){border-color:var(--brand);color:var(--brand)}
.tb-step input{width:100%;text-align:center;font-weight:800;font-size:17px}
.tb-opts{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tb-opt{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:12px;border:1.5px solid var(--line);background:#fff;font-size:13px;font-weight:600;text-align:left;color:var(--ink);transition:all .15s}
.tb-opt:hover{border-color:#c9bde8}
.tb-opt i{width:10px;height:10px;border-radius:50%;display:block}
.tb-opt[aria-pressed=true]{border-color:var(--brand);background:#f5f0ff;box-shadow:0 0 0 3px #ede4ff}
.tb-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:var(--ink);color:#fff;padding:12px 20px;border-radius:99px;
  font-size:14px;font-weight:600;z-index:60;box-shadow:0 10px 30px rgba(0,0,0,.3);animation:tbUp .3s}

@keyframes tbIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes tbFade{from{opacity:0}to{opacity:1}}
@keyframes tbPop{from{opacity:0;transform:scale(.94) translateY(8px)}to{opacity:1;transform:none}}
@keyframes tbUp{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes tbSk{to{background-position:-200% 0}}
@media (max-width:640px){.tb-modal-body{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){.tb *{animation:none!important;transition:none!important}}
`;

/** Top-down table: filled seats = guests sitting, hollow seats = free. */
const TableShape: React.FC<{ capacity: number; occupied: number; status: string }> = ({ capacity, occupied, status }) => {
  const s = STATUS_STYLES[status] || STATUS_STYLES.Available;
  const shown = Math.min(capacity, 12);
  const wide = capacity > 4;
  const w = wide ? 88 : 56;
  const h = wide ? 48 : 56;
  const rx = wide ? 46 : 38;
  const ry = wide ? 40 : 38;
  const off = status === "Out of Service";

  return (
    <div className="tb-floor" aria-hidden="true">
      {Array.from({ length: shown }).map((_, i) => {
        const a = (2 * Math.PI * i) / shown - Math.PI / 2;
        const isTaken = i < occupied;
        const color = off ? "#9a9aa8" : isTaken ? "#e5484d" : status === "Reserved" ? "#f0a020" : "#22a558";
        return (
          <span
            key={i}
            className="tb-seat"
            style={{
              left: `${50 + (rx / 75) * 50 * Math.cos(a) * (wide ? 1.55 : 1.15)}%`,
              top: `${50 + (ry / 55) * 50 * Math.sin(a) * (wide ? 1.12 : 1.15)}%`,
              borderColor: color,
              background: isTaken && !off ? color : "#fff",
              opacity: off ? 0.5 : 1,
            }}
          />
        );
      })}
      <div
        className="tb-top"
        style={{
          width: w,
          height: h,
          borderRadius: wide ? 16 : "50%",
          background: `linear-gradient(145deg, ${s.dot}, ${s.text})`,
          opacity: off ? 0.55 : 1,
        }}
      >
        <div>
          {occupied}/{capacity}
          <small>seats</small>
        </div>
      </div>
    </div>
  );
};

/** Renders its children into document.body so position:fixed centers
 *  on the real viewport, unaffected by any ancestor's transform,
 *  filter, or overflow settings elsewhere on the page. */
const ModalPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
};

const Tables: React.FC = () => {
  const restaurantId = getRestaurantId();
   const { lang, tr } = useLang();

  const [tables, setTables] = useState<TableItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [form, setForm] = useState<FormState>(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [showForm, setShowForm] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedFilter, setSelectedFilter] = useState<string>("All");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [toast, setToast] = useState<string>("");

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2400);
  };

  const fetchTables = useCallback(async () => {
    if (!restaurantId) {
      setError("No restaurant session found. Please log in again.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${getApiBase()}?restaurantId=${encodeURIComponent(restaurantId)}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to fetch tables.");
      setTables(json.data || []);
    } catch (err: unknown) {
      setError((err as Error).message || "Something went wrong while fetching tables.");
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  const resetForm = useCallback(() => {
    setForm(initialForm);
    setEditingId(null);
    setShowForm(false);
  }, []);

  // Escape closes the modal.
  useEffect(() => {
    if (!showForm) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && resetForm();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showForm, resetForm]);

  // Lock page scroll while the modal is open, so the background
  // (the 20+ table cards) can't scroll underneath it.
  useEffect(() => {
    if (!showForm) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showForm]);

  const setCapacity = (n: number) =>
    setForm((p) => {
      const capacity = clamp(n, 1, 50);
      return { ...p, capacity, occupiedSeats: Math.min(p.occupiedSeats, capacity) };
    });

  const setGuests = (n: number) =>
    setForm((p) => {
      const r = syncStatus(p.status, clamp(n, 0, p.capacity), "guests");
      return { ...p, occupiedSeats: r.occupied, status: r.status };
    });

  const setFormStatus = (status: string) =>
    setForm((p) => {
      const r = syncStatus(status, p.occupiedSeats, "status");
      return { ...p, status: r.status, occupiedSeats: Math.min(r.occupied, p.capacity) };
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId) return;
    setSubmitting(true);
    setError("");
    try {
      const isEditing = Boolean(editingId);
      const API_BASE = getApiBase();
      const res = await fetch(isEditing ? `${API_BASE}/${editingId}` : API_BASE, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, restaurantId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to save table.");

      if (isEditing) {
        setTables((prev) => prev.map((t) => (t._id === editingId || t.id === editingId ? json.data : t)));
      } else {
        setTables((prev) => [json.data, ...prev]);
      }
      notify(isEditing ? "Table updated" : "Table added");
      resetForm();
    } catch (err: unknown) {
      setError((err as Error).message || "Something went wrong while saving the table.");
    } finally {
      setSubmitting(false);
    }
  };

  /** Instantly updates the card, then saves. Rolls back if the server refuses. */
  const updateTable = async (table: TableItem, patch: Partial<TableItem>, message?: string) => {
    const targetId = table._id || table.id;
    const previous = tables;
    const next = { ...table, ...patch };
    setTables((prev) => prev.map((t) => ((t._id || t.id) === targetId ? next : t)));
    try {
      const res = await fetch(`${getApiBase()}/${targetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...next, restaurantId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);
      setTables((prev) => prev.map((t) => ((t._id || t.id) === targetId ? json.data : t)));
      if (message) notify(message);
    } catch (err: unknown) {
      setTables(previous);
      setError((err as Error).message || "Failed to update table.");
    }
  };

  const changeStatus = (table: TableItem, status: string) => {
    if (table.status === status) return;
    const r = syncStatus(status, taken(table), "status");
    updateTable(table, { status: r.status, occupiedSeats: r.occupied }, `${table.tableName} is now ${status.toLowerCase()}`);
  };

  const changeGuests = (table: TableItem, delta: number) => {
    const n = clamp(taken(table) + delta, 0, table.capacity);
    if (n === taken(table)) return;
    const r = syncStatus(table.status, n, "guests");
    updateTable(table, { status: r.status, occupiedSeats: r.occupied });
  };

  const handleEdit = (table: TableItem) => {
    setEditingId(table._id || table.id);
    setForm({
      tableName: table.tableName || "",
      capacity: table.capacity || 2,
      occupiedSeats: taken(table),
      status: table.status || "Available",
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${getApiBase()}/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);
      setTables((prev) => prev.filter((t) => t._id !== id && t.id !== id));
      setConfirmId(null);
      notify("Table deleted");
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to delete table.");
    }
  };

  const mine = useMemo(() => tables.filter((t) => String(t.restaurantId) === String(restaurantId)), [tables, restaurantId]);

  const counts = useMemo(
    () => mine.reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.status]: (acc[t.status] || 0) + 1 }), {}),
    [mine]
  );

  const seatStats = useMemo(() => {
    const usable = mine.filter((t) => t.status !== "Out of Service");
    const total = usable.reduce((n, t) => n + t.capacity, 0);
    const used = usable.reduce((n, t) => n + taken(t), 0);
    return { total, used, free: total - used };
  }, [mine]);

  const visible = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const list = mine.filter(
      (t) => t.tableName.toLowerCase().includes(q) && (selectedFilter === "All" || t.status === selectedFilter)
    );
    if (sortBy === "name") list.sort((a, b) => a.tableName.localeCompare(b.tableName, undefined, { numeric: true }));
    if (sortBy === "capacity") list.sort((a, b) => b.capacity - a.capacity);
    if (sortBy === "free") list.sort((a, b) => b.capacity - taken(b) - (a.capacity - taken(a)));
    return list;
  }, [mine, searchQuery, selectedFilter, sortBy]);

  const pct = seatStats.total > 0 ? Math.round((seatStats.used / seatStats.total) * 100) : 0;
  const filtering = searchQuery.trim() !== "" || selectedFilter !== "All";
  const clearFilters = () => { setSearchQuery(""); setSelectedFilter("All"); };

  return (
    <div className="tb">
      <style>{CSS}</style>
      <div className="tb-wrap">
        <header className="tb-head">
          <div>
            <h1>{tr('Tables', 'टेबलहरू')}</h1>
            <p>Track who is seated and how many seats are still free, table by table.</p>
          </div>
          <button className="tb-primary" onClick={() => { resetForm(); setShowForm(true); }}>
            + Add table
          </button>
        </header>

        <section className="tb-over" aria-label="Floor overview">
          <div className="tb-over-top">
            <div className="tb-big">
              {seatStats.free} seats free
              <small>{seatStats.used} of {seatStats.total} taken · {mine.length} tables</small>
            </div>
            <div className="tb-legend">
              <span><i style={{ background: "var(--used)" }} />Guests seated</span>
              <span><i style={{ background: "var(--free)" }} />Free seats</span>
            </div>
          </div>
          <div className="tb-bar" role="img" aria-label={`${pct}% of seats are taken`}>
            <span style={{ flex: seatStats.used, background: "var(--used)" }} />
            <span style={{ flex: seatStats.free, background: "var(--free)" }} />
          </div>
          <div className="tb-chips">
            <button className="tb-chip" aria-pressed={selectedFilter === "All"} onClick={() => setSelectedFilter("All")}>
              All <b>{mine.length}</b>
            </button>
            {STATUS_OPTIONS.map((s) => (
              <button key={s} className="tb-chip" aria-pressed={selectedFilter === s} onClick={() => setSelectedFilter(s)}>
                <i style={{ background: STATUS_STYLES[s].dot }} />
                {s} <b>{counts[s] || 0}</b>
              </button>
            ))}
          </div>
        </section>

        <div className="tb-tools">
          <input
            className="tb-in tb-search"
            type="search"
            placeholder={tr('Search by table name', 'टेबलको नामले खोज्नुहोस्')}
            aria-label="Search tables"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select className="tb-in tb-sort" aria-label="Sort tables" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="newest">Sort: Newest first</option>
            <option value="name">Sort: Name A–Z</option>
            <option value="capacity">Sort: Most seats</option>
            <option value="free">Sort: Most free seats</option>
          </select>
          {filtering && <button className="tb-ghost" onClick={clearFilters}>Clear filters</button>}
        </div>

        {error && (
          <div className="tb-err" role="alert">
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss error">✕</button>
          </div>
        )}

        {loading ? (
          <div className="tb-grid">
            {[0, 1, 2, 3].map((i) => <div key={i} className="tb-skel" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="tb-empty">
            <h3>{filtering ? "No tables match" : "Your floor is empty"}</h3>
            <p>{filtering ? "Try a different name or clear the filters." : "Add your first table to start tracking seating."}</p>
            {filtering ? (
              <button className="tb-ghost" onClick={clearFilters}>Clear filters</button>
            ) : (
              <button className="tb-primary" onClick={() => setShowForm(true)}>+ Add table</button>
            )}
          </div>
        ) : (
          <div className="tb-grid">
            {visible.map((t, i) => {
              const s = STATUS_STYLES[t.status] || STATUS_STYLES.Available;
              const key = t._id || t.id;
              const used = taken(t);
              const free = t.capacity - used;
              const off = t.status === "Out of Service";
              return (
                <article key={key} className="tb-card" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <div className="tb-card-top">
                    <h3>{t.tableName}</h3>
                    <span className="tb-badge" style={{ background: s.bg, color: s.text }}>
                      <i style={{ background: s.dot }} />
                      {t.status}
                    </span>
                  </div>

                  <div className="tb-stage">
                    <TableShape capacity={t.capacity} occupied={used} status={t.status} />
                  </div>

                  <div className="tb-guests">
                    <div className="tb-guests-txt">
                      <b>{off ? "Not in use" : `${used} ${used === 1 ? "guest" : "guests"} seated`}</b>
                      <span className={free > 0 && !off ? "free" : ""}>
                        {off ? `${t.capacity} seats` : free === 0 ? "Table is full" : `${free} of ${t.capacity} seats free`}
                      </span>
                    </div>
                    <div className="tb-stepper" role="group" aria-label={`Guests at ${t.tableName}`}>
                      <button aria-label="Remove a guest" disabled={off || used === 0} onClick={() => changeGuests(t, -1)}>−</button>
                      <output aria-live="polite">{used}</output>
                      <button aria-label="Add a guest" disabled={off || free === 0} onClick={() => changeGuests(t, 1)}>+</button>
                    </div>
                  </div>

                  <div className="tb-quick" role="group" aria-label={`Change status of ${t.tableName}`}>
                    {STATUS_OPTIONS.map((st) => (
                      <button key={st} title={st} aria-label={st} aria-pressed={t.status === st} onClick={() => changeStatus(t, st)}>
                        {SHORT[st]}
                      </button>
                    ))}
                  </div>

                  <div className="tb-actions">
                    <button onClick={() => handleEdit(t)}>{tr('Edit', 'सम्पादन')}</button>
                    {confirmId === key ? (
                      <>
                        <button className="sure" onClick={() => handleDelete(key)}>Yes, delete</button>
                        <button onClick={() => setConfirmId(null)}>Keep</button>
                      </>
                    ) : (
                      <button className="del" onClick={() => setConfirmId(key)}>Delete</button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <ModalPortal>
          {/* Clicking the dimmed backdrop closes the modal; clicking
              inside the modal itself does not (stopPropagation below). */}
          <div className="tb-back" onClick={resetForm}>
            <form
              className="tb-modal"
              onSubmit={handleSubmit}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={editingId ? "Edit table" : "Add table"}
            >
              <div className="tb-modal-head">
                <div className="tb-modal-head-txt">
                  <h2>{editingId ? "Edit table" : "Add a table"}</h2>
                  <p>{editingId ? "Update seating and status." : "Set it up and start seating guests."}</p>
                </div>
                <button type="button" className="tb-close" aria-label="Close" onClick={resetForm}>✕</button>
              </div>

              <div className="tb-modal-body">
                <div className="tb-full">
                  <label className="tb-lbl" htmlFor="tb-name">Table name</label>
                  <input
                    id="tb-name"
                    className="tb-in"
                    autoFocus
                    required
                    placeholder="e.g. Window 4 or VIP Booth"
                    value={form.tableName}
                    onChange={(e) => setForm((p) => ({ ...p, tableName: e.target.value }))}
                  />
                </div>

                <div>
                  <span className="tb-lbl">Seats at this table</span>
                  <div className="tb-step">
                    <button type="button" aria-label="Fewer seats" onClick={() => setCapacity(form.capacity - 1)}>−</button>
                    <input className="tb-in" type="number" min={1} max={50} aria-label="Number of seats" value={form.capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
                    <button type="button" aria-label="More seats" onClick={() => setCapacity(form.capacity + 1)}>+</button>
                  </div>
                </div>

                <div>
                  <span className="tb-lbl">Guests seated now</span>
                  <div className="tb-step">
                    <button type="button" aria-label="Fewer guests" disabled={form.occupiedSeats === 0} onClick={() => setGuests(form.occupiedSeats - 1)}>−</button>
                    <input className="tb-in" type="number" min={0} max={form.capacity} aria-label="Guests seated" value={form.occupiedSeats} onChange={(e) => setGuests(Number(e.target.value))} />
                    <button type="button" aria-label="More guests" disabled={form.occupiedSeats >= form.capacity} onClick={() => setGuests(form.occupiedSeats + 1)}>+</button>
                  </div>
                  <div className="tb-hint">
                    {form.capacity - form.occupiedSeats} of {form.capacity} seats stay free.
                  </div>
                </div>

                <div className="tb-full tb-stage" style={{ height: 120 }}>
                  <TableShape capacity={form.capacity} occupied={form.occupiedSeats} status={form.status} />
                </div>

                <div className="tb-full">

                 <span className="tb-lbl">{tr('Status', 'स्थिति')}</span>
<div className="tb-opts">
  {STATUS_OPTIONS.map((s) => (
    <button type="button" key={s} className="tb-opt" aria-pressed={form.status === s} onClick={() => setFormStatus(s)}>
      <i style={{ background: STATUS_STYLES[s].dot }} />
      {STATUS_LABEL[s][lang]}
    </button>
  ))}
</div>


                </div>
              </div>

              <div className="tb-modal-footer">
                <button type="submit" className="tb-ghost" disabled={submitting}>
                  {submitting ? "Saving…" : editingId ? "Save changes" : "Add table"}
                </button>
                <button type="button" className="tb-ghost" onClick={resetForm}>Cancel</button>
              </div>
            </form>
          </div>
        </ModalPortal>
      )}

      {toast && <div className="tb-toast" role="status">{toast}</div>}
    </div>
  );
};

export default Tables;