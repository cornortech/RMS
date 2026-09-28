import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";

const API_BASE = (import.meta.env.VITE_API_URL || "https://rms-elhj.onrender.com").trim().replace(/\/+$/, "");

/* ═══════════════════════════════════════════════════════════════════
   SERVER CALLS — the only place in this file that talks to your backend.
   If your old LoyaltyManager used other URLs or field names, change them
   here. Nothing else in this file needs to change.
   ═══════════════════════════════════════════════════════════════════ */
const request = async (url, options) => {
  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // the server did not send JSON
  }
  if (!res.ok || !data || data.success === false) {
    throw new Error((data && data.message) || `Request failed (${res.status})`);
  }
  return data;
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const api = {
  // All programs of this restaurant
  listPrograms: async (restaurantId) => {
    const data = await request(`${API_BASE}/api/loyalty-programs?restaurantId=${encodeURIComponent(restaurantId)}`);
    return asArray(data.data);
  },

  // Create one program
  createProgram: async (payload) => {
    await request(`${API_BASE}/api/loyalty-programs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  // Customers who joined one program
  listMembers: async (restaurantId, program) => {
    const data = await request(`${API_BASE}/api/loyalty?restaurantId=${encodeURIComponent(restaurantId)}&search=`);
    return asArray(data.data).filter(
      (m) =>
        (m.programId && String(m.programId) === String(program._id)) ||
        (m.programName && m.programName === program.programName)
    );
  },
};

const EMPTY_FORM = { programName: "", reward: "", completeWithinDays: 30, description: "" };

const getRestaurantId = () => {
  try {
    const stored = JSON.parse(localStorage.getItem("RESTAURANTUser") || "null");
    return (stored && (stored.id || stored.username)) || "";
  } catch (e) {
    return "";
  }
};

const programKey = (p) => p._id || p.id || p.programName;

export default function LoyaltyManager() {
  const restaurantId = useMemo(getRestaurantId, []);

  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState({ type: "", text: "" });
  const toastTimer = useRef(null);

  // "Add New Program" card
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // "View Members" card
  const [activeProgram, setActiveProgram] = useState(null);
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const membersRequest = useRef(0);

  const showToast = (type, text) => {
    clearTimeout(toastTimer.current);
    setToast({ type, text });
    toastTimer.current = setTimeout(() => setToast({ type: "", text: "" }), 4000);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const loadPrograms = useCallback(
    async (silent = false) => {
      if (!restaurantId) {
        setLoading(false);
        setLoadError("Restaurant session not found. Please log in again.");
        return;
      }
      if (!silent) setLoading(true);
      setLoadError("");
      try {
        setPrograms(await api.listPrograms(restaurantId));
      } catch (err) {
        setLoadError(err.message || "Could not load loyalty programs.");
      } finally {
        setLoading(false);
      }
    },
    [restaurantId]
  );

  useEffect(() => {
    loadPrograms();
  }, [loadPrograms]);

  /* ── Add New Program ─────────────────────────────────────────── */
  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormError("");
    setShowAdd(true);
  };

  const closeAdd = () => {
    if (!saving) setShowAdd(false);
  };

  const setField = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    if (saving) return;

    const programName = form.programName.trim();
    const reward = form.reward.trim();
    const days = Number(form.completeWithinDays);

    if (!programName) {
      setFormError("Program name is required.");
      return;
    }
    if (!reward) {
      setFormError("Reward details are required.");
      return;
    }
    if (!Number.isFinite(days) || days < 1) {
      setFormError("Complete Within (Days) must be 1 or more.");
      return;
    }

    setFormError("");
    setSaving(true);
    try {
      await api.createProgram({
        restaurantId,
        programName,
        reward,
        completeWithinDays: Math.floor(days),
        description: form.description.trim(),
      });
      setShowAdd(false);
      setForm(EMPTY_FORM);
      showToast("success", "Loyalty program created successfully!");
      loadPrograms(true);
    } catch (err) {
      setFormError(err.message || "Failed to create the program.");
    } finally {
      setSaving(false);
    }
  };

  /* ── View Members ────────────────────────────────────────────── */
  const openMembers = async (program) => {
    const requestId = ++membersRequest.current;
    setActiveProgram(program);
    setMembers([]);
    setMembersError("");
    setMemberSearch("");
    setMembersLoading(true);
    try {
      const list = await api.listMembers(restaurantId, program);
      if (requestId === membersRequest.current) setMembers(list);
    } catch (err) {
      if (requestId === membersRequest.current) setMembersError(err.message || "Could not load members.");
    } finally {
      if (requestId === membersRequest.current) setMembersLoading(false);
    }
  };

  const closeMembers = () => {
    membersRequest.current += 1; // ignore any answer that is still on its way
    setActiveProgram(null);
  };

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => `${m.customerName || ""} ${m.customerPhone || ""}`.toLowerCase().includes(q));
  }, [members, memberSearch]);

  const totalPoints = useMemo(() => members.reduce((sum, m) => sum + (Number(m.points) || 0), 0), [members]);

  return (
    <div style={styles.wrap}>
      <LoyaltyStyles />
      <Toast toast={toast} />

      {/* Top bar: count + Add New Program button */}
      <div style={styles.toolbar}>
        <div>
          <div style={styles.toolbarTitle}>Your loyalty programs</div>
          <div style={styles.toolbarSub}>
            {loading ? "Loading…" : `${programs.length} ${programs.length === 1 ? "program" : "programs"}`}
          </div>
        </div>
        <button type="button" onClick={openAdd} className="lm-btn-primary" style={styles.addBtn}>
          <span aria-hidden="true" style={styles.plus}>+</span>
          Add New Program
        </button>
      </div>

      {/* Programs list */}
      {loading ? (
        <div style={styles.stateBox}>
          <span className="lm-spinner lm-spinner-dark" style={{ margin: 0 }} />
          Loading programs…
        </div>
      ) : loadError ? (
        <div style={styles.errorBox}>
          <span style={{ fontSize: 28 }}>⚠️</span>
          <p style={styles.stateText}>{loadError}</p>
          <button type="button" onClick={() => loadPrograms()} className="lm-btn-ghost" style={styles.cancelBtn}>
            Try again
          </button>
        </div>
      ) : programs.length === 0 ? (
        <div style={styles.emptyBox}>
          <span style={{ fontSize: 34 }}>⭐</span>
          <p style={styles.emptyTitle}>No loyalty programs yet</p>
          <p style={styles.stateText}>
            Create your first program. Customers can then join it from Create Bill or Pending Bill.
          </p>
          <button type="button" onClick={openAdd} className="lm-btn-primary" style={styles.addBtn}>
            <span aria-hidden="true" style={styles.plus}>+</span>
            Add New Program
          </button>
        </div>
      ) : (
        <div style={styles.grid}>
          {programs.map((program) => (
            <div key={programKey(program)} className="lm-program-card" style={styles.programCard}>
              <div style={styles.programHead}>
                <div style={styles.programIcon}>⭐</div>
                <h3 style={styles.programName}>{program.programName || "Untitled program"}</h3>
              </div>

              <div style={styles.metaList}>
                <div style={styles.metaRow}>
                  <span aria-hidden="true">🎁</span>
                  <span>
                    <span style={styles.metaLabel}>Reward:</span> {program.reward || "—"}
                  </span>
                </div>
                {program.completeWithinDays ? (
                  <div style={styles.metaRow}>
                    <span aria-hidden="true">⏳</span>
                    <span>Complete within {program.completeWithinDays} days</span>
                  </div>
                ) : null}
              </div>

              {program.description ? <p style={styles.programDesc}>{program.description}</p> : null}

              <button
                type="button"
                onClick={() => openMembers(program)}
                className="lm-btn-outline"
                style={styles.viewBtn}
              >
                👥 View Members
              </button>
            </div>
          ))}
        </div>
      )}

      {/* CARD 1 — Add New Program */}
      <Modal
        open={showAdd}
        onClose={closeAdd}
        icon="⭐"
        title="Add New Program"
        subtitle="Create a loyalty program. Customers can join it from Create Bill or Pending Bill."
      >
        <form onSubmit={handleCreate} style={styles.form} noValidate>
          <Field
            id="lm-program-name"
            label="Program Name"
            icon="🏷️"
            required
            autoFocus
            value={form.programName}
            onChange={setField("programName")}
            placeholder="e.g. Coffee Club 10-Points"
          />
          <Field
            id="lm-reward"
            label="Reward"
            icon="🎁"
            required
            value={form.reward}
            onChange={setField("reward")}
            placeholder="e.g. Free Cappuccino"
          />
          <Field
            id="lm-days"
            label="Complete Within (Days)"
            icon="⏳"
            required
            type="number"
            min="1"
            value={form.completeWithinDays}
            onChange={setField("completeWithinDays")}
            placeholder="30"
          />
          <Field
            id="lm-description"
            label="Description"
            icon="📝"
            multiline
            rows={3}
            value={form.description}
            onChange={setField("description")}
            placeholder="Campaign details or rules (optional)"
          />

          {formError && (
            <div role="alert" style={styles.formError}>
              ⚠️ {formError}
            </div>
          )}
          <p style={styles.requiredNote}>* Required fields</p>

          <div style={styles.modalButtons}>
            <button type="button" onClick={closeAdd} disabled={saving} className="lm-btn-ghost" style={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className="lm-btn-primary" style={styles.submitBtn}>
              {saving && <span className="lm-spinner" />}
              {saving ? "Saving…" : "Create Program"}
            </button>
          </div>
        </form>
      </Modal>

      {/* CARD 2 — View Members */}
      <Modal
        open={Boolean(activeProgram)}
        onClose={closeMembers}
        icon="👥"
        title="Program Members"
        subtitle={activeProgram ? activeProgram.programName : ""}
        wide
      >
        {membersLoading ? (
          <div style={styles.stateBox}>
            <span className="lm-spinner lm-spinner-dark" style={{ margin: 0 }} />
            Loading members…
          </div>
        ) : membersError ? (
          <div role="alert" style={styles.formError}>
            ⚠️ {membersError}
          </div>
        ) : (
          <>
            <div style={styles.statRow}>
              <div style={styles.statChip}>
                <span style={styles.statLabel}>Members</span>
                <span style={styles.statValue}>{members.length}</span>
              </div>
              <div style={styles.statChip}>
                <span style={styles.statLabel}>Active points</span>
                <span style={styles.statValue}>{totalPoints}</span>
              </div>
            </div>

            {members.length > 0 && (
              <input
                type="search"
                className="lm-input"
                style={{ ...styles.input, marginBottom: 14 }}
                placeholder="Search by name or phone"
                aria-label="Search members"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
              />
            )}

            {members.length === 0 ? (
              <div style={styles.stateBox}>No customers have joined this program yet.</div>
            ) : filteredMembers.length === 0 ? (
              <div style={styles.stateBox}>No members match your search.</div>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.theadRow}>
                      <th style={styles.th}>Customer</th>
                      <th style={{ ...styles.th, textAlign: "right" }}>Points</th>
                      <th style={{ ...styles.th, textAlign: "right" }}>Lifetime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMembers.map((m) => (
                      <tr key={m._id || m.customerPhone} style={styles.tr}>
                        <td style={styles.td}>
                          <div style={styles.memberName}>{m.customerName || "Unnamed customer"}</div>
                          <div style={styles.memberPhone}>{m.customerPhone || "—"}</div>
                        </td>
                        <td style={{ ...styles.td, textAlign: "right" }}>
                          <span style={styles.pointsBadge}>{m.points ?? 0}</span>
                        </td>
                        <td style={{ ...styles.td, textAlign: "right", color: "#64748b" }}>
                          {m.totalPointsEarned ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <div style={{ ...styles.modalButtons, marginTop: 18 }}>
          <button type="button" onClick={closeMembers} className="lm-btn-ghost" style={styles.cancelBtn}>
            Close
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Modal — always centered on the SCREEN (not on the page).
   It is rendered straight into <body>, so no parent element can push
   it off-center, and the page behind is frozen while it is open.
   ═══════════════════════════════════════════════════════════════════ */
function Modal({ open, onClose, icon, title, subtitle, wide = false, children }) {
  const onCloseRef = useRef(onClose);
  const pressStartedOnOverlay = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return undefined;

    const handleKey = (e) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", handleKey);

    // Freeze the page behind the card without letting the layout jump.
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      document.removeEventListener("keydown", handleKey);
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="lm-overlay"
      style={styles.overlay}
      onMouseDown={(e) => {
        pressStartedOnOverlay.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        // close only when the press AND the release both happened on the dark area
        if (pressStartedOnOverlay.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="lm-dialog lm-pop"
        style={{ ...styles.dialog, ...(wide ? styles.dialogWide : null) }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div style={styles.dialogAccent} />
        <button type="button" onClick={onClose} className="lm-close" style={styles.closeBtn} aria-label="Close">
          ✕
        </button>
        <div className="lm-scroll" style={styles.dialogScroll}>
          <div style={styles.dialogHeader}>
            {icon && <div style={styles.dialogIcon}>{icon}</div>}
            <div style={{ minWidth: 0 }}>
              <h3 style={styles.dialogTitle}>{title}</h3>
              {subtitle && <p style={styles.dialogSubtitle}>{subtitle}</p>}
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

function Toast({ toast }) {
  if (!toast.text) return null;
  const ok = toast.type === "success";
  return createPortal(
    <div
      role={ok ? "status" : "alert"}
      className="lm-toast"
      style={{
        ...styles.toast,
        backgroundColor: ok ? "#f0fdf4" : "#fef2f2",
        color: ok ? "#166534" : "#991b1b",
        borderColor: ok ? "#bbf7d0" : "#fecaca",
      }}
    >
      <span aria-hidden="true">{ok ? "✨" : "⚠️"}</span>
      {toast.text}
    </div>,
    document.body
  );
}

function Field({ id, label, icon, required = false, multiline = false, ...inputProps }) {
  const Control = multiline ? "textarea" : "input";
  return (
    <div style={styles.fieldWrap}>
      <label htmlFor={id} style={styles.fieldLabel}>
        {icon && (
          <span aria-hidden="true" style={{ marginRight: 6 }}>
            {icon}
          </span>
        )}
        {label}
        {required && <span style={styles.requiredMark}> *</span>}
      </label>
      <Control
        id={id}
        className="lm-input"
        style={{ ...styles.input, ...(multiline ? styles.textarea : null) }}
        {...inputProps}
      />
    </div>
  );
}

function LoyaltyStyles() {
  return (
    <style>{`
      .lm-btn-primary { transition: filter 0.15s ease, opacity 0.15s ease; }
      .lm-btn-primary:hover:not(:disabled) { filter: brightness(1.07); }
      .lm-btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }

      .lm-btn-ghost { transition: background-color 0.15s ease; }
      .lm-btn-ghost:hover:not(:disabled) { background-color: #f8fafc; }
      .lm-btn-ghost:disabled { opacity: 0.6; cursor: not-allowed; }

      .lm-btn-outline { transition: background-color 0.15s ease, border-color 0.15s ease; }
      .lm-btn-outline:hover { background-color: #f3e8ff; border-color: #d8b4fe; }

      .lm-btn-primary:focus-visible,
      .lm-btn-ghost:focus-visible,
      .lm-btn-outline:focus-visible,
      .lm-close:focus-visible { outline: 2px solid #9333ea; outline-offset: 2px; }

      .lm-input { transition: border-color 0.15s ease, box-shadow 0.15s ease; }
      .lm-input:focus { border-color: #9333ea !important; box-shadow: 0 0 0 3px rgba(147, 51, 234, 0.12); }

      .lm-program-card { transition: box-shadow 0.15s ease, transform 0.15s ease; }
      .lm-program-card:hover { box-shadow: 0 8px 24px rgba(147, 51, 234, 0.1); transform: translateY(-2px); }

      .lm-close { transition: background-color 0.15s ease, color 0.15s ease; }
      .lm-close:hover { background-color: #f1f5f9; color: #0f172a; }

      .lm-spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255, 255, 255, 0.4);
        border-top-color: #ffffff;
        border-radius: 50%;
        margin-right: 8px;
        vertical-align: -2px;
        animation: lmSpin 0.6s linear infinite;
      }
      .lm-spinner-dark { border-color: rgba(147, 51, 234, 0.25); border-top-color: #9333ea; }
      @keyframes lmSpin { to { transform: rotate(360deg); } }

      .lm-overlay { animation: lmFade 0.18s ease; }
      @keyframes lmFade { from { opacity: 0; } to { opacity: 1; } }

      .lm-pop { animation: lmPop 0.22s cubic-bezier(0.16, 1, 0.3, 1); }
      @keyframes lmPop {
        from { opacity: 0; transform: translateY(10px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      .lm-toast { animation: lmToast 0.25s ease; }
      @keyframes lmToast {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* The card is never taller than the screen. If it is, it scrolls inside itself. */
      .lm-dialog { max-height: calc(100vh - 48px); max-height: calc(100dvh - 48px); }

      @media (max-width: 480px) {
        .lm-overlay { padding: 12px !important; }
        .lm-dialog { max-height: calc(100vh - 24px); max-height: calc(100dvh - 24px); }
        .lm-scroll { padding: 22px 18px 22px !important; }
      }
      @media (prefers-reduced-motion: reduce) {
        .lm-overlay, .lm-pop, .lm-toast { animation: none !important; }
        .lm-btn-primary, .lm-btn-ghost, .lm-btn-outline, .lm-input, .lm-program-card, .lm-close { transition: none !important; }
      }
    `}</style>
  );
}

const FONT = "'Segoe UI', Roboto, -apple-system, sans-serif";

const styles = {
  wrap: { display: "flex", flexDirection: "column", gap: 20 },

  /* top bar */
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  toolbarTitle: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  toolbarSub: { fontSize: 13, color: "#64748b", marginTop: 2 },
  addBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "12px 20px",
    borderRadius: 12,
    border: "none",
    backgroundColor: "#9333ea",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: "0 4px 12px rgba(147, 51, 234, 0.25)",
  },
  plus: { fontSize: 18, fontWeight: 700, lineHeight: 1 },

  /* loading / empty / error boxes */
  stateBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "40px 20px",
    textAlign: "center",
    color: "#64748b",
    fontSize: 14,
    fontWeight: 500,
    backgroundColor: "#faf5ff",
    border: "1px dashed #d8b4fe",
    borderRadius: 16,
  },
  emptyBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: "44px 20px",
    textAlign: "center",
    backgroundColor: "#faf5ff",
    border: "1px dashed #d8b4fe",
    borderRadius: 18,
  },
  errorBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: "36px 20px",
    textAlign: "center",
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 18,
  },
  emptyTitle: { margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" },
  stateText: { margin: "0 0 8px", maxWidth: 380, fontSize: 13, lineHeight: 1.5, color: "#64748b" },

  /* program cards */
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 16,
  },
  programCard: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 20,
    backgroundColor: "#faf5ff",
    border: "1px solid #f3e8ff",
    borderRadius: 18,
  },
  programHead: { display: "flex", alignItems: "center", gap: 12 },
  programIcon: {
    flexShrink: 0,
    width: 40,
    height: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    border: "1px solid #e9d5ff",
  },
  programName: { margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a", wordBreak: "break-word" },
  metaList: { display: "flex", flexDirection: "column", gap: 6 },
  metaRow: { display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, lineHeight: 1.4, color: "#475569" },
  metaLabel: { fontWeight: 700, color: "#0f172a" },
  programDesc: { margin: 0, fontSize: 13, lineHeight: 1.5, color: "#64748b", wordBreak: "break-word" },
  viewBtn: {
    marginTop: "auto",
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #e9d5ff",
    backgroundColor: "#ffffff",
    color: "#7e22ce",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  /* toast */
  toast: {
    position: "fixed",
    top: 20,
    left: 0,
    right: 0,
    margin: "0 auto",
    width: "max-content",
    maxWidth: "calc(100% - 32px)",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 18px",
    borderRadius: 14,
    border: "1px solid",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: 500,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
    zIndex: 10000,
  },

  /* modal (card) */
  overlay: {
    position: "fixed",
    inset: 0,
    display: "flex",
    padding: 24,
    overflowY: "auto",
    backgroundColor: "rgba(15, 23, 42, 0.62)",
    backdropFilter: "blur(4px)",
    fontFamily: FONT,
    zIndex: 9999,
  },
  dialog: {
    position: "relative",
    margin: "auto",
    width: "100%",
    maxWidth: 460,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    border: "1px solid #e2e8f0",
    boxShadow: "0 25px 50px -12px rgba(15, 23, 42, 0.35)",
  },
  dialogWide: { maxWidth: 700 },
  dialogAccent: {
    height: 4,
    flexShrink: 0,
    background: "linear-gradient(90deg, #9333ea, #c026d3)",
  },
  closeBtn: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 30,
    height: 30,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    backgroundColor: "#f8fafc",
    color: "#64748b",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1,
    cursor: "pointer",
    zIndex: 2,
  },
  dialogScroll: {
    padding: "26px 30px 28px",
    overflowY: "auto",
    flex: "1 1 auto",
    minHeight: 0,
  },
  dialogHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 22,
    paddingRight: 34,
  },
  dialogIcon: {
    flexShrink: 0,
    width: 44,
    height: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 21,
    borderRadius: 13,
    background: "linear-gradient(135deg, #f3e8ff, #fae8ff)",
    border: "1px solid #e9d5ff",
  },
  dialogTitle: { margin: 0, fontSize: 18, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.01em" },
  dialogSubtitle: { margin: "4px 0 0", fontSize: 13, lineHeight: 1.45, color: "#64748b" },

  /* form */
  form: { display: "flex", flexDirection: "column", gap: 16 },
  fieldWrap: { display: "flex", flexDirection: "column", gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: 600, color: "#334155" },
  requiredMark: { color: "#dc2626", fontWeight: 700 },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "13px 16px",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
  },
  textarea: { resize: "vertical", minHeight: 84, lineHeight: 1.5 },
  requiredNote: { margin: 0, fontSize: 12, color: "#94a3b8" },
  formError: {
    padding: "10px 14px",
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#991b1b",
    fontSize: 13,
    fontWeight: 500,
  },
  modalButtons: { display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 6 },
  cancelBtn: {
    padding: "12px 18px",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    color: "#475569",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  submitBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "12px 20px",
    borderRadius: 12,
    border: "none",
    backgroundColor: "#9333ea",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: "0 4px 12px rgba(147, 51, 234, 0.25)",
  },

  /* members card */
  statRow: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 },
  statChip: {
    flex: "1 1 140px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    backgroundColor: "#faf5ff",
    border: "1px solid #f3e8ff",
    borderRadius: 14,
  },
  statLabel: { fontSize: 12, fontWeight: 700, color: "#7e22ce", textTransform: "uppercase", letterSpacing: 0.5 },
  statValue: { fontSize: 18, fontWeight: 800, color: "#0f172a" },
  tableWrap: { overflowX: "auto", border: "1px solid #f1f5f9", borderRadius: 14 },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 14 },
  theadRow: {
    backgroundColor: "#faf5ff",
    color: "#475569",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  th: { padding: "12px 14px", fontWeight: 700 },
  tr: { borderTop: "1px solid #f1f5f9" },
  td: { padding: "12px 14px", color: "#0f172a", verticalAlign: "middle" },
  memberName: { fontWeight: 600 },
  memberPhone: { marginTop: 2, fontSize: 12, color: "#64748b" },
  pointsBadge: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    backgroundColor: "#f3e8ff",
    color: "#7e22ce",
    border: "1px solid #e9d5ff",
  },
};