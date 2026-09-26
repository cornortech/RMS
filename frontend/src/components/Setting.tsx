import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import QrUploader from "./QrUploader";
import TableQrManager from "./TableQrManager";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000").trim().replace(/\/+$/, '');

const TABS = [
  { key: "details", label: "Our Details", icon: "🏢" },
  { key: "credentials", label: "Change Password", icon: "🔑" },
  { key: "otherDetails", label: "Edit Information", icon: "✏️" },
  { key: "qrManage", label: "Payment QR Manage", icon: "🔳" },
  { key: "loyaltyManage", label: "Manage Loyalty", icon: "⭐" },
    { key: "tableQr", label: "Table QR", icon: "🪑" },
];

export default function RESTAURANTSettings() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("details");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const [passwordForm, setPasswordForm] = useState({ password: "", confirmPassword: "" });
  const [detailsForm, setDetailsForm] = useState({
    restaurantId: "",
    RESTAURANTName: "",
    phone: "",
    email: "",
    location: "",
    PanOrVat: "",
  });

  // Loyalty states
  const [loyaltyMembers, setLoyaltyMembers] = useState([]);
  const [loyaltySearch, setLoyaltySearch] = useState("");
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [loyaltyCounts, setLoyaltyCounts] = useState({ totalEnrollments: 0, totalActivePoints: 0, totalLifetimePoints: 0 });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);

  const [newLoyaltyForm, setNewLoyaltyForm] = useState({
    customerPhone: "",
    customerName: "",
    programName: "",
    reward: "",
    completeWithinDays: 30,
    description: "",
    points: 0
  });

  const [editLoyaltyForm, setEditLoyaltyForm] = useState({
    customerName: "",
    customerPhone: "",
    programName: "",
    reward: "",
    completeWithinDays: 30,
    description: "",
    points: 0,
    totalPointsEarned: 0
  });

  const [pointsForm, setPointsForm] = useState({ action: "ADD", points: 0 });

  useEffect(() => {
    const storedUser = localStorage.getItem("RESTAURANTUser");
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      setUser(parsed);

      const foundName = parsed.RESTAURANTName || parsed.restaurantName || parsed.name || "";
      const foundId = parsed.id || parsed.username || "";

      setDetailsForm({
        restaurantId: foundId,
        RESTAURANTName: foundName,
        phone: parsed.phone || "",
        email: parsed.email || "",
        location: parsed.location || "",
        PanOrVat: parsed.PanOrVat || parsed.panOrVat || "",
      });
    }
  }, []);

  useEffect(() => {
    if (activeTab === "loyaltyManage" && user) {
      fetchLoyaltyMembers();
    }
  }, [activeTab, user, loyaltySearch]);

  // Lock page scroll while any loyalty modal is open, so the dialog behaves like
  // a true screen-centered overlay instead of drifting with the page's scroll.
  useEffect(() => {
    const anyModalOpen = showAddModal || showEditModal || showPointsModal || showDeleteModal;
    if (!anyModalOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showAddModal, showEditModal, showPointsModal, showDeleteModal]);

  const fetchLoyaltyMembers = async () => {
    const restaurantId = user?.id || user?.username;
    if (!restaurantId) return;

    setLoyaltyLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/loyalty?restaurantId=${restaurantId}&search=${encodeURIComponent(loyaltySearch)}`);
      const data = await res.json();
      setLoyaltyLoading(false);
      if (data.success) {
        setLoyaltyMembers(data.data || []);
        if (data.counts) {
          setLoyaltyCounts(data.counts);
        } else {
          const members = data.data || [];
          setLoyaltyCounts({
            totalEnrollments: members.length,
            totalActivePoints: members.reduce((sum, m) => sum + (m.points || 0), 0),
            totalLifetimePoints: members.reduce((sum, m) => sum + (m.totalPointsEarned || 0), 0)
          });
        }
      } else {
        showMessage("error", data.message || "Failed to load loyalty records.");
      }
    } catch (err) {
      setLoyaltyLoading(false);
      showMessage("error", "Network error while loading loyalty data.");
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: "", text: "" }), 4000);
  };

  const updateUser = async (payload) => {
    const userId = user?._id || user?.id;
    if (!user || !userId) {
      showMessage("error", "User session not found. Please log in again.");
      return null;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setLoading(false);
      if (!data.success) {
        showMessage("error", data.message || "Something went wrong.");
        return null;
      }
      return data.data;
    } catch (err) {
      setLoading(false);
      showMessage("error", "Network error. Please try again.");
      return null;
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!passwordForm.password) {
      showMessage("error", "Password cannot be empty.");
      return;
    }
    if (passwordForm.password.length < 4) {
      showMessage("error", "Password must be at least 4 characters.");
      return;
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      showMessage("error", "Passwords do not match.");
      return;
    }

    const payload = { password: passwordForm.password };
    const updated = await updateUser(payload);
    if (updated) {
      const merged = { ...user, ...updated };
      setUser(merged);
      localStorage.setItem("RESTAURANTUser", JSON.stringify(merged));
      setPasswordForm({ password: "", confirmPassword: "" });
      showMessage("success", "Password updated successfully!");
    }
  };

  const handleDetailsSubmit = async (e) => {
    e.preventDefault();
    if (!detailsForm.RESTAURANTName || !detailsForm.phone || !detailsForm.email || !detailsForm.location) {
      showMessage("error", "Please fill all required fields.");
      return;
    }

    const { restaurantId, ...payload } = detailsForm;
    const updated = await updateUser(payload);
    if (updated) {
      const merged = { ...user, ...updated };
      setUser(merged);
      localStorage.setItem("RESTAURANTUser", JSON.stringify(merged));
      showMessage("success", "Restaurant details updated successfully!");
    }
  };

  const handleCreateLoyalty = async (e) => {
    e.preventDefault();
    const restaurantId = user?.id || user?.username;
    if (!newLoyaltyForm.customerPhone) {
      showMessage("error", "Customer phone number is required.");
      return;
    }
    if (!newLoyaltyForm.programName) {
      showMessage("error", "Program Name is required.");
      return;
    }
    if (!newLoyaltyForm.reward) {
      showMessage("error", "Reward details are required.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/loyalty`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId,
          customerPhone: newLoyaltyForm.customerPhone,
          customerName: newLoyaltyForm.customerName,
          programName: newLoyaltyForm.programName,
          reward: newLoyaltyForm.reward,
          completeWithinDays: Number(newLoyaltyForm.completeWithinDays) || 30,
          description: newLoyaltyForm.description,
          points: Number(newLoyaltyForm.points) || 0
        })
      });
      const data = await res.json();
      if (data.success) {
        showMessage("success", "Customer successfully enrolled in program!");
        setShowAddModal(false);
        setNewLoyaltyForm({ customerPhone: "", customerName: "", programName: "", reward: "", completeWithinDays: 30, description: "", points: 0 });
        fetchLoyaltyMembers();
      } else {
        showMessage("error", data.message || "Failed to Add New.");
      }
    } catch (err) {
      showMessage("error", "Network error while enrolling customer.");
    }
  };

  const handleUpdateLoyaltyDetails = async (e) => {
    e.preventDefault();
    if (!selectedMember) return;

    try {
      const res = await fetch(`${API_BASE}/api/loyalty/${selectedMember._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editLoyaltyForm,
          completeWithinDays: Number(editLoyaltyForm.completeWithinDays),
          points: Number(editLoyaltyForm.points),
          totalPointsEarned: Number(editLoyaltyForm.totalPointsEarned)
        })
      });
      const data = await res.json();
      if (data.success) {
        showMessage("success", "Loyalty details updated successfully!");
        setShowEditModal(false);
        setSelectedMember(null);
        fetchLoyaltyMembers();
      } else {
        showMessage("error", data.message || "Failed to update loyalty record.");
      }
    } catch (err) {
      showMessage("error", "Network error.");
    }
  };

  const handleUpdatePoints = async (e) => {
    e.preventDefault();
    if (!selectedMember) return;

    try {
      const res = await fetch(`${API_BASE}/api/loyalty/${selectedMember._id}/points`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: pointsForm.action,
          points: Number(pointsForm.points)
        })
      });
      const data = await res.json();
      if (data.success) {
        showMessage("success", `Points updated successfully via ${pointsForm.action}!`);
        setShowPointsModal(false);
        setSelectedMember(null);
        setPointsForm({ action: "ADD", points: 0 });
        fetchLoyaltyMembers();
      } else {
        showMessage("error", data.message || "Failed to update points.");
      }
    } catch (err) {
      showMessage("error", "Network error updating points.");
    }
  };

  const confirmDeleteLoyalty = (member) => {
    setMemberToDelete(member);
    setShowDeleteModal(true);
  };

  const executeDeleteLoyalty = async () => {
    if (!memberToDelete) return;

    try {
      const res = await fetch(`${API_BASE}/api/loyalty/${memberToDelete._id}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.success) {
        showMessage("success", "Loyalty record deleted successfully.");
        setShowDeleteModal(false);
        setMemberToDelete(null);
        fetchLoyaltyMembers();
      } else {
        showMessage("error", data.message || "Failed to delete.");
      }
    } catch (err) {
      showMessage("error", "Network error.");
    }
  };

  if (!user) {
    return (
      <div style={styles.centerScreen}>
        <GlobalStyles />
        <div style={styles.emptyCard}>
          <span style={{ fontSize: 34 }}>🔒</span>
          <p style={{ color: "#64748b", fontSize: 15, fontWeight: 500, margin: 0 }}>
            No user session found. Please log in first.
          </p>
          <button onClick={() => window.location.reload()} className="rs-btn-ghost" style={styles.ghostBtn}>
            Reload page
          </button>
        </div>
      </div>
    );
  }

  const displayName = user.RESTAURANTName || user.restaurantName || user.name || "Unnamed Restaurant";
  const displayId = user.id || user.username || "N/A";
  const deleteMemberName = memberToDelete?.customerName || memberToDelete?.customerPhone || "this customer";

  return (
    <div style={styles.page} className="rs-page">
      <GlobalStyles />
      <div style={styles.container}>

        {/* Header Section */}
        <div style={styles.header}>
          <div>
            <span style={styles.badge}>Account Settings</span>
            <h1 style={styles.title}>Restaurant Profile</h1>
            <p style={styles.subtitle}>Manage your restaurant information, security credentials, QR code, and customer loyalty</p>
          </div>
        </div>

        {/* Floating Notification Banner */}
        {message.text && (
          <div
            role="alert"
            className="rs-banner"
            style={{
              ...styles.banner,
              backgroundColor: message.type === "success" ? "#f0fdf4" : "#fef2f2",
              color: message.type === "success" ? "#166534" : "#991b1b",
              borderColor: message.type === "success" ? "#bbf7d0" : "#fecaca",
            }}
          >
            <span style={{ fontSize: 16 }}>{message.type === "success" ? "✨" : "⚠️"}</span>
            {message.text}
          </div>
        )}

        {/* Tab Navigation */}
        <div style={styles.tabBar} role="tablist" aria-label="Settings sections">
          {TABS.map((tab) => (
            <TabButton
              key={tab.key}
              active={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              label={tab.label}
              icon={tab.icon}
            />
          ))}
        </div>

        {/* Main Card Container */}
        <div style={styles.card} className="rs-card">
          <div key={activeTab} className="rs-fade">

            {activeTab === "details" && (
              <div role="tabpanel">
                <div style={styles.sectionHeader}>
                  <h2 style={styles.sectionTitle}>Overview Details</h2>
                  <p style={styles.sectionDesc}>Your registered restaurant information on record</p>
                </div>
                <div style={styles.detailsGrid}>
                  <DetailRow label="Restaurant Name" value={displayName} icon="🏢" />
                  <DetailRow label="PAN / VAT Number" value={user.PanOrVat || user.panOrVat || "Not provided"} icon="🧾" />
                  <DetailRow label="Phone Number" value={user.phone || "Not provided"} icon="📞" />
                  <DetailRow label="Email Address" value={user.email || "Not provided"} icon="✉️" />
                  <DetailRow label="Location" value={user.location || "Not provided"} icon="📍" />
                  <DetailRow label="Restaurant ID" value={displayId} icon="🆔" />
                  <DetailRow label="Account Security" value="•••••••• (Secured)" icon="🔒" />
                </div>
              </div>
            )}

            {activeTab === "credentials" && (
              <div style={{ maxWidth: 520 }} role="tabpanel">
                <div style={styles.sectionHeader}>
                  <h2 style={styles.sectionTitle}>Change Password</h2>
                  <p style={styles.sectionDesc}>Secure your account with a strong new password</p>
                </div>
                <form onSubmit={handlePasswordSubmit} style={styles.form}>
                  <FormField
                    label="New Password"
                    type="password"
                    value={passwordForm.password}
                    onChange={(v) => setPasswordForm({ ...passwordForm, password: v })}
                    placeholder="Enter new password (min 4 characters)"
                    hint="Must be at least 4 characters"
                  />
                  <FormField
                    label="Confirm New Password"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(v) => setPasswordForm({ ...passwordForm, confirmPassword: v })}
                    placeholder="Re-enter new password"
                  />
                  <button type="submit" disabled={loading} className="rs-btn-primary" style={styles.submitBtn}>
                    {loading && <span className="rs-spinner" />}
                    {loading ? "Updating password…" : "Update password"}
                  </button>
                </form>
              </div>
            )}

            {activeTab === "otherDetails" && (
              <div style={{ maxWidth: 520 }} role="tabpanel">
                <div style={styles.sectionHeader}>
                  <h2 style={styles.sectionTitle}>Edit Restaurant Details</h2>
                  <p style={styles.sectionDesc}>Keep your contact details and business info up-to-date</p>
                </div>
                <form onSubmit={handleDetailsSubmit} style={styles.form}>
                  <FormField
                    label="Restaurant ID"
                    value={detailsForm.restaurantId}
                    disabled={true}
                    onChange={() => {}}
                    placeholder="Restaurant ID"
                  />
                  <FormField
                    label="Restaurant Name"
                    value={detailsForm.RESTAURANTName}
                    onChange={(v) => setDetailsForm({ ...detailsForm, RESTAURANTName: v })}
                    placeholder="Enter restaurant name"
                  />
                  <FormField
                    label="PAN / VAT Number"
                    value={detailsForm.PanOrVat}
                    onChange={(v) => setDetailsForm({ ...detailsForm, PanOrVat: v })}
                    placeholder="Enter PAN or VAT number"
                  />
                  <FormField
                    label="Phone Number"
                    value={detailsForm.phone}
                    onChange={(v) => setDetailsForm({ ...detailsForm, phone: v })}
                    placeholder="Enter phone number"
                  />
                  <FormField
                    label="Email Address"
                    type="email"
                    value={detailsForm.email}
                    onChange={(v) => setDetailsForm({ ...detailsForm, email: v })}
                    placeholder="Enter email address"
                  />
                  <FormField
                    label="Location"
                    value={detailsForm.location}
                    onChange={(v) => setDetailsForm({ ...detailsForm, location: v })}
                    placeholder="Enter restaurant location"
                  />
                  <button type="submit" disabled={loading} className="rs-btn-primary" style={styles.submitBtn}>
                    {loading && <span className="rs-spinner" />}
                    {loading ? "Saving changes…" : "Save changes"}
                  </button>
                </form>
              </div>
            )}

            {activeTab === "qrManage" && (
              <div role="tabpanel">
                <div style={styles.sectionHeader}>
                  <h2 style={styles.sectionTitle}>QR Code</h2>
                  <p style={styles.sectionDesc}>Upload and manage the QR code your customers scan to reach your menu or ordering page</p>
                </div>
                <div style={styles.qrCard}>
                  <QrUploader />
                </div>
              </div>
            )}

            {activeTab === "tableQr" && (
  <div role="tabpanel">
    <div style={styles.sectionHeader}>
      <h2 style={styles.sectionTitle}>Table QR Manager</h2>
      <p style={styles.sectionDesc}>One QR code for every table. Customers scan it to see your menu and call a waiter.</p>
    </div>
    <TableQrManager />
  </div>
)}

            {activeTab === "loyaltyManage" && (
              <div role="tabpanel">
                <div style={styles.loyaltyHeaderRow}>
                  <div>
                    <h2 style={styles.sectionTitle}>Customer Loyalty Program</h2>
                    <p style={styles.sectionDesc}>Add New into programs, track rewards, and manage points</p>
                  </div>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="rs-btn-primary"
                    style={{ ...styles.submitBtn, marginTop: 0, width: "auto", padding: "10px 18px" }}
                  >
                    + Add New
                  </button>
                </div>

                {/* Metrics Cards */}
                <div style={styles.loyaltyMetricsGrid}>
                  <div style={styles.metricCard}>
                    <div style={styles.metricLabel}>Total Enrollments</div>
                    <div style={styles.metricValue}>{loyaltyCounts.totalEnrollments}</div>
                  </div>
                  <div style={styles.metricCard}>
                    <div style={styles.metricLabel}>Active Points Pool</div>
                    <div style={styles.metricValue}>{loyaltyCounts.totalActivePoints}</div>
                  </div>
                  <div style={styles.metricCard}>
                    <div style={styles.metricLabel}>Lifetime Earned</div>
                    <div style={styles.metricValue}>{loyaltyCounts.totalLifetimePoints}</div>
                  </div>
                </div>

                {/* Search Bar */}
                <div style={{ marginBottom: 20 }}>
                  <input
                    type="text"
                    placeholder="Search by customer name, phone, or program..."
                    value={loyaltySearch}
                    onChange={(e) => setLoyaltySearch(e.target.value)}
                    className="rs-input"
                    style={{ ...styles.input, maxWidth: 360 }}
                  />
                </div>

                {/* Loyalty Table */}
                {loyaltyLoading ? (
                  <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>Loading loyalty records…</div>
                ) : loyaltyMembers.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px", color: "#64748b", background: "#faf5ff", borderRadius: 16, border: "1px dashed #e9d5ff" }}>
                    No loyalty records found. Click "+ Add New" to add one!
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={styles.table}>
                      <thead>
                        <tr style={styles.tableHeaderRow}>
                          <th style={styles.th}>Customer Name</th>
                          <th style={styles.th}>Phone Number</th>
                          <th style={styles.th}>Program Name</th>
                          <th style={styles.th}>Reward</th>
                          <th style={styles.th}>Complete Within</th>
                          <th style={styles.th}>Points</th>
                          <th style={{ ...styles.th, textAlign: "right" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loyaltyMembers.map((member) => (
                          <tr key={member._id} style={styles.tableRow}>
                            <td style={styles.td}><strong>{member.customerName}</strong></td>
                            <td style={styles.td}>{member.customerPhone}</td>
                            <td style={styles.td}><span style={styles.programBadge}>{member.programName}</span></td>
                            <td style={styles.td}>{member.reward}</td>
                            <td style={styles.td}>{member.completeWithinDays} days</td>
                            <td style={styles.td}><span style={{ color: "#9333ea", fontWeight: 700 }}>{member.points} pts</span></td>
                            <td style={{ ...styles.td, textAlign: "right" }}>
                              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                <button
                                  onClick={() => {
                                    setSelectedMember(member);
                                    setPointsForm({ action: "ADD", points: 0 });
                                    setShowPointsModal(true);
                                  }}
                                  className="rs-btn-ghost"
                                  style={styles.actionBtn}
                                  title="Manage Points"
                                >
                                  ⭐ Points
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedMember(member);
                                    setEditLoyaltyForm({
                                      customerName: member.customerName || "",
                                      customerPhone: member.customerPhone || "",
                                      programName: member.programName || "",
                                      reward: member.reward || "",
                                      completeWithinDays: member.completeWithinDays || 30,
                                      description: member.description || "",
                                      points: member.points || 0,
                                      totalPointsEarned: member.totalPointsEarned || 0
                                    });
                                    setShowEditModal(true);
                                  }}
                                  className="rs-btn-ghost"
                                  style={styles.actionBtn}
                                  title="Edit Info"
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  onClick={() => confirmDeleteLoyalty(member)}
                                  className="rs-btn-ghost"
                                  style={{ ...styles.actionBtn, color: "#dc2626" }}
                                  title="Delete"
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* MODAL: Add New */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        icon="⭐"
        title="Enroll Loyalty Customer"
        subtitle="Add a customer to one of your loyalty programs"
        wide
      >
        <form onSubmit={handleCreateLoyalty} className="rs-form-grid">
          <FormField
            label="Customer Phone Number"
            icon="📱"
            required
            value={newLoyaltyForm.customerPhone}
            onChange={(v) => setNewLoyaltyForm({ ...newLoyaltyForm, customerPhone: v })}
            placeholder="e.g. 9841000000"
          />
          <FormField
            label="Customer Name"
            icon="🧑"
            value={newLoyaltyForm.customerName}
            onChange={(v) => setNewLoyaltyForm({ ...newLoyaltyForm, customerName: v })}
            placeholder="e.g. Ram Bahadur"
          />
          <FormField
            label="Program Name"
            icon="🏷️"
            required
            value={newLoyaltyForm.programName}
            onChange={(v) => setNewLoyaltyForm({ ...newLoyaltyForm, programName: v })}
            placeholder="e.g. Coffee Club 10-Points"
          />
          <FormField
            label="Reward"
            icon="🎁"
            required
            value={newLoyaltyForm.reward}
            onChange={(v) => setNewLoyaltyForm({ ...newLoyaltyForm, reward: v })}
            placeholder="e.g. Free Cappuccino"
          />
          <FormField
            label="Complete Within (Days)"
            icon="⏳"
            required
            type="number"
            value={newLoyaltyForm.completeWithinDays}
            onChange={(v) => setNewLoyaltyForm({ ...newLoyaltyForm, completeWithinDays: v })}
            placeholder="30"
          />
          <FormField
            label="Initial Points"
            icon="✨"
            type="number"
            value={newLoyaltyForm.points}
            onChange={(v) => setNewLoyaltyForm({ ...newLoyaltyForm, points: v })}
            placeholder="0"
          />
          <FormField
            label="Description"
            icon="📝"
            fullWidth
            value={newLoyaltyForm.description}
            onChange={(v) => setNewLoyaltyForm({ ...newLoyaltyForm, description: v })}
            placeholder="Campaign details or rules (optional)"
          />
          <p style={{ ...styles.requiredNote, gridColumn: "1 / -1" }}>* Required fields</p>
          <div style={{ ...styles.modalButtons, gridColumn: "1 / -1" }}>
            <button type="button" onClick={() => setShowAddModal(false)} className="rs-btn-ghost" style={styles.modalCancelBtn}>
              Cancel
            </button>
            <button type="submit" className="rs-btn-primary" style={{ ...styles.submitBtn, marginTop: 0 }}>
              Enroll Customer
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Edit Customer Details */}
      <Modal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        icon="✏️"
        title="Edit Loyalty Details"
        subtitle="Update this customer's program, reward, and points"
        wide
      >
        <form onSubmit={handleUpdateLoyaltyDetails} className="rs-form-grid">
          <FormField
            label="Customer Name"
            icon="🧑"
            value={editLoyaltyForm.customerName}
            onChange={(v) => setEditLoyaltyForm({ ...editLoyaltyForm, customerName: v })}
          />
          <FormField
            label="Customer Phone Number"
            icon="📱"
            value={editLoyaltyForm.customerPhone}
            onChange={(v) => setEditLoyaltyForm({ ...editLoyaltyForm, customerPhone: v })}
          />
          <FormField
            label="Program Name"
            icon="🏷️"
            value={editLoyaltyForm.programName}
            onChange={(v) => setEditLoyaltyForm({ ...editLoyaltyForm, programName: v })}
          />
          <FormField
            label="Reward"
            icon="🎁"
            value={editLoyaltyForm.reward}
            onChange={(v) => setEditLoyaltyForm({ ...editLoyaltyForm, reward: v })}
          />
          <FormField
            label="Complete Within (Days)"
            icon="⏳"
            type="number"
            value={editLoyaltyForm.completeWithinDays}
            onChange={(v) => setEditLoyaltyForm({ ...editLoyaltyForm, completeWithinDays: v })}
          />
          <FormField
            label="Description"
            icon="📝"
            value={editLoyaltyForm.description}
            onChange={(v) => setEditLoyaltyForm({ ...editLoyaltyForm, description: v })}
          />
          <FormField
            label="Current Points"
            icon="⭐"
            type="number"
            value={editLoyaltyForm.points}
            onChange={(v) => setEditLoyaltyForm({ ...editLoyaltyForm, points: v })}
          />
          <FormField
            label="Lifetime Earned"
            icon="🏆"
            type="number"
            value={editLoyaltyForm.totalPointsEarned}
            onChange={(v) => setEditLoyaltyForm({ ...editLoyaltyForm, totalPointsEarned: v })}
          />
          <div style={{ ...styles.modalButtons, gridColumn: "1 / -1" }}>
            <button type="button" onClick={() => setShowEditModal(false)} className="rs-btn-ghost" style={styles.modalCancelBtn}>
              Cancel
            </button>
            <button type="submit" className="rs-btn-primary" style={{ ...styles.submitBtn, marginTop: 0 }}>
              Save Changes
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Manage Points */}
      <Modal
        open={showPointsModal}
        onClose={() => setShowPointsModal(false)}
        icon="⭐"
        title="Manage Points"
        subtitle={selectedMember?.customerName || selectedMember?.customerPhone || "Update this customer's balance"}
      >
        <div style={styles.balanceChip}>
          <span style={styles.balanceChipLabel}>Current Balance</span>
          <span style={styles.balanceChipValue}>{selectedMember?.points ?? 0} pts</span>
        </div>
        <form onSubmit={handleUpdatePoints} style={styles.form}>
          <div style={styles.fieldWrap}>
            <label style={styles.fieldLabel}>Action Type</label>
            <div style={styles.segmentGroup} role="radiogroup" aria-label="Action type">
              {[
                { value: "ADD", label: "Add", icon: "➕" },
                { value: "REDEEM", label: "Redeem", icon: "➖" },
                { value: "SET", label: "Set", icon: "🎯" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={pointsForm.action === opt.value}
                  onClick={() => setPointsForm({ ...pointsForm, action: opt.value })}
                  className="rs-segment-btn"
                  style={{
                    ...styles.segmentBtn,
                    ...(pointsForm.action === opt.value ? styles.segmentBtnActive : null),
                  }}
                >
                  <span aria-hidden="true">{opt.icon}</span> {opt.label}
                </button>
              ))}
            </div>
          </div>
          <FormField
            label="Points Amount"
            icon="🔢"
            type="number"
            value={pointsForm.points}
            onChange={(v) => setPointsForm({ ...pointsForm, points: v })}
            placeholder="Enter points"
          />
          <div style={styles.modalButtons}>
            <button type="button" onClick={() => setShowPointsModal(false)} className="rs-btn-ghost" style={styles.modalCancelBtn}>
              Cancel
            </button>
            <button type="submit" className="rs-btn-primary" style={{ ...styles.submitBtn, marginTop: 0 }}>
              Confirm Update
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Delete Confirmation */}
      <Modal
        open={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setMemberToDelete(null); }}
        icon="🗑️"
        title="Delete loyalty record?"
        subtitle={memberToDelete ? `Remove ${deleteMemberName} from ${memberToDelete.programName || "this program"}` : ""}
        tone="danger"
      >
        <p style={styles.deleteText}>
          This action cannot be undone — all points and progress for this enrollment will be lost.
        </p>
        <div style={styles.modalButtons}>
          <button
            type="button"
            onClick={() => { setShowDeleteModal(false); setMemberToDelete(null); }}
            className="rs-btn-ghost"
            style={styles.modalCancelBtn}
          >
            Cancel
          </button>
          <button type="button" onClick={executeDeleteLoyalty} className="rs-btn-primary" style={styles.deleteBtn}>
            Yes, delete
          </button>
        </div>
      </Modal>
    </div>
  );
}

function TabButton({ active, onClick, label, icon }) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className="rs-tab"
      style={{
        ...styles.tabButton,
        backgroundColor: active ? "#9333ea" : "#ffffff",
        color: active ? "#ffffff" : "#475569",
        boxShadow: active ? "0 4px 14px rgba(147, 51, 234, 0.25)" : "0 1px 3px rgba(0, 0, 0, 0.05)",
        border: active ? "1px solid #9333ea" : "1px solid #e2e8f0",
      }}
    >
      <span style={{ fontSize: 15 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function DetailRow({ label, value, icon }) {
  return (
    <div style={styles.detailRow}>
      <div style={styles.detailIcon}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.detailLabel}>{label}</div>
        <div style={styles.detailValue}>{value}</div>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, type = "text", placeholder, disabled = false, hint, icon, required = false, fullWidth = false }) {
  const id = `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
  return (
    <div style={{ ...styles.fieldWrap, ...(fullWidth ? { gridColumn: "1 / -1" } : null) }}>
            <label htmlFor={id} style={styles.fieldLabel}>
        {icon && <span aria-hidden="true" style={{ marginRight: 6 }}>{icon}</span>}
        {label}
        {required && <span style={styles.requiredMark}> *</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className="rs-input"
        style={{
          ...styles.input,
          backgroundColor: disabled ? "#f8fafc" : "#ffffff",
          color: disabled ? "#94a3b8" : "#0f172a",
          borderColor: disabled ? "#e2e8f0" : "#cbd5e1",
          cursor: disabled ? "not-allowed" : "text",
        }}
      />
      {hint && <span style={styles.fieldHint}>{hint}</span>}
    </div>
  );
}

function Modal({ open, onClose, icon, title, subtitle, tone = "brand", wide = false, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const isDanger = tone === "danger";

  return createPortal(
    <div style={styles.modalOverlay} className="rs-modal-overlay" onClick={onClose}>
      <div
        style={{ ...styles.modalContent, ...(wide ? styles.modalContentWide : null) }}
        className="rs-modal-pop"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ ...styles.modalAccent, ...(isDanger ? styles.modalAccentDanger : null) }} />
        <button type="button" onClick={onClose} className="rs-modal-close" style={styles.modalCloseBtn} aria-label="Close dialog">
          ✕
        </button>
        <div style={styles.modalScrollArea}>
          {(icon || title) && (
            <div style={styles.modalHeader}>
              {icon && (
                <div style={{ ...styles.modalIconBadge, ...(isDanger ? styles.modalIconBadgeDanger : null) }}>
                  {icon}
                </div>
              )}
              <div>
                {title && <h3 style={styles.modalTitle}>{title}</h3>}
                {subtitle && <p style={styles.modalSubtitle}>{subtitle}</p>}
              </div>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

function GlobalStyles() {
  return (
    <style>{`
      .rs-tab {
        transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
      }
      .rs-tab:hover { transform: translateY(-1px); }
      .rs-tab:active { transform: translateY(0); }
      .rs-tab:focus-visible { outline: 2px solid #9333ea; outline-offset: 2px; }

      .rs-btn-primary { transition: filter 0.15s ease, opacity 0.15s ease; }
      .rs-btn-primary:hover:not(:disabled) { filter: brightness(1.07); }
      .rs-btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }
      .rs-btn-primary:focus-visible { outline: 2px solid #9333ea; outline-offset: 2px; }

      .rs-btn-ghost { transition: background-color 0.15s ease; }
      .rs-btn-ghost:hover { background-color: #f8fafc; }
      .rs-btn-ghost:focus-visible { outline: 2px solid #9333ea; outline-offset: 2px; }

      .rs-input:focus { border-color: #9333ea !important; box-shadow: 0 0 0 3px rgba(147, 51, 234, 0.12); }

      .rs-fade { animation: rsFadeIn 0.2s ease; }
      @keyframes rsFadeIn {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .rs-banner { animation: rsSlideDown 0.25s ease; }
      @keyframes rsSlideDown {
        from { opacity: 0; transform: translateY(-6px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .rs-spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255, 255, 255, 0.4);
        border-top-color: #ffffff;
        border-radius: 50%;
        margin-right: 8px;
        vertical-align: -2px;
        animation: rsSpin 0.6s linear infinite;
      }
      @keyframes rsSpin { to { transform: rotate(360deg); } }

      .rs-modal-overlay { animation: rsOverlayFade 0.18s ease; }
      @keyframes rsOverlayFade {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .rs-modal-pop { animation: rsModalPop 0.22s cubic-bezier(0.16, 1, 0.3, 1); }
      @keyframes rsModalPop {
        from { opacity: 0; transform: translateY(10px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      .rs-modal-close { transition: background-color 0.15s ease, color 0.15s ease; }
      .rs-modal-close:hover { background-color: #f1f5f9; color: #0f172a; }
      .rs-modal-close:focus-visible { outline: 2px solid #9333ea; outline-offset: 2px; }

      .rs-segment-btn { transition: background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease; }
      .rs-segment-btn:hover { color: #0f172a; }
      .rs-segment-btn:focus-visible { outline: 2px solid #9333ea; outline-offset: 2px; }

      .rs-form-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px 18px;
      }

      @media (max-width: 640px) {
        .rs-tab { flex: 1 1 calc(50% - 6px); justify-content: center; }
        .rs-form-grid { grid-template-columns: 1fr; }
      }
      @media (max-width: 480px) {
        .rs-page { padding: 22px 14px !important; }
        .rs-card { padding: 22px !important; }
      }
      @media (prefers-reduced-motion: reduce) {
        .rs-fade, .rs-banner, .rs-modal-overlay, .rs-modal-pop { animation: none !important; }
        .rs-tab, .rs-btn-primary, .rs-btn-ghost, .rs-input, .rs-modal-close, .rs-segment-btn { transition: none !important; }
      }
    `}</style>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#f8fafc",
    padding: "36px 24px",
    fontFamily: "'Segoe UI', Roboto, -apple-system, sans-serif",
  },
  centerScreen: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
  emptyCard: {
    backgroundColor: "#ffffff",
    padding: "40px",
    borderRadius: 24,
    border: "1px solid #e2e8f0",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.04)",
  },
  ghostBtn: {
    marginTop: 4,
    padding: "10px 18px",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    color: "#475569",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  container: {
    maxWidth: 960,
    margin: "0 auto",
  },
  header: {
    marginBottom: 24,
  },
  badge: {
    display: "inline-block",
    padding: "4px 12px",
    borderRadius: 9999,
    backgroundColor: "#f3e8ff",
    color: "#7e22ce",
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid #e9d5ff",
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 800,
    color: "#0f172a",
    margin: 0,
    letterSpacing: "-0.02em",
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 6,
    marginBottom: 0,
  },
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 18px",
    borderRadius: 14,
    border: "1px solid",
    marginBottom: 24,
    fontSize: 14,
    fontWeight: 500,
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.02)",
  },
  tabBar: {
    display: "flex",
    gap: 12,
    marginBottom: 24,
    flexWrap: "wrap",
  },
  tabButton: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 20px",
    borderRadius: 14,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: "36px",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.04)",
    border: "1px solid #e2e8f0",
  },
  sectionHeader: {
    marginBottom: 24,
  },
  loyaltyHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "#0f172a",
    margin: 0,
    letterSpacing: "-0.01em",
  },
  sectionDesc: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 4,
    marginBottom: 0,
  },
  detailsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    gap: 16,
  },
  detailRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    padding: "18px",
    backgroundColor: "#faf5ff",
    borderRadius: 16,
    border: "1px solid #f3e8ff",
  },
  detailIcon: {
    fontSize: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    border: "1px solid #e9d5ff",
    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
  },
  detailLabel: {
    fontSize: 11,
    color: "#7e22ce",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  detailValue: {
    fontSize: 14,
    color: "#0f172a",
    fontWeight: 600,
    marginTop: 4,
    wordBreak: "break-word",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  fieldWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
  },
  fieldHint: {
    fontSize: 12,
    color: "#94a3b8",
  },
  input: {
    padding: "13px 16px",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    fontSize: 14,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  },
  submitBtn: {
    marginTop: 8,
    padding: "14px 20px",
    borderRadius: 12,
    border: "none",
    backgroundColor: "#9333ea",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(147, 51, 234, 0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  qrCard: {
    padding: 28,
    borderRadius: 18,
    border: "1px dashed #c4b5fd",
    backgroundColor: "#faf5ff",
    marginBottom: 16,
  },
  loyaltyMetricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
    marginBottom: 24,
  },
  metricCard: {
    padding: "18px 20px",
    backgroundColor: "#faf5ff",
    borderRadius: 16,
    border: "1px solid #f3e8ff",
  },
  metricLabel: {
    fontSize: 12,
    color: "#7e22ce",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 800,
    color: "#0f172a",
    marginTop: 6,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
    fontSize: 14,
  },
  tableHeaderRow: {
    borderBottom: "2px solid #e2e8f0",
    color: "#475569",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  th: {
    padding: "12px 14px",
    fontWeight: 700,
  },
  tableRow: {
    borderBottom: "1px solid #f1f5f9",
    transition: "background-color 0.1s ease",
  },
  td: {
    padding: "14px 14px",
    color: "#0f172a",
  },
  programBadge: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    backgroundColor: "#f3e8ff",
    color: "#7e22ce",
    border: "1px solid #e9d5ff",
  },
  tierBadge: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
  },
  actionBtn: {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(15, 23, 42, 0.62)",
    backdropFilter: "blur(4px)",
    display: "flex",
    zIndex: 9999,
    padding: 24,
    overflowY: "auto",
  },
  modalContent: {
    position: "relative",
    margin: "auto",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    width: "100%",
    maxWidth: 460,
    maxHeight: "calc(100vh - 48px)",
    overflow: "hidden",
    boxShadow: "0 25px 50px -12px rgba(15, 23, 42, 0.35)",
    border: "1px solid #e2e8f0",
    display: "flex",
    flexDirection: "column",
  },
  modalContentWide: {
    maxWidth: 700,
  },
  modalAccent: {
    height: 4,
    width: "100%",
    flexShrink: 0,
    background: "linear-gradient(90deg, #9333ea, #c026d3)",
  },
  modalAccentDanger: {
    background: "linear-gradient(90deg, #dc2626, #f43f5e)",
  },
  modalCloseBtn: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 30,
    height: 30,
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    backgroundColor: "#f8fafc",
    color: "#64748b",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    lineHeight: 1,
  },
  modalScrollArea: {
    padding: "26px 30px 28px",
    overflowY: "auto",
    flex: "1 1 auto",
    minHeight: 0,
  },
  modalHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 22,
  },
  modalIconBadge: {
    flexShrink: 0,
    width: 44,
    height: 44,
    borderRadius: 13,
    background: "linear-gradient(135deg, #f3e8ff, #fae8ff)",
    border: "1px solid #e9d5ff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 21,
  },
  modalIconBadgeDanger: {
    background: "linear-gradient(135deg, #fee2e2, #ffe4e6)",
    border: "1px solid #fecaca",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: "#0f172a",
    margin: 0,
    letterSpacing: "-0.01em",
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#64748b",
    margin: "4px 0 0",
    lineHeight: 1.45,
  },
  modalButtons: {
    display: "flex",
    gap: 12,
    justifyContent: "flex-end",
    marginTop: 6,
  },
  modalCancelBtn: {
    padding: "12px 18px",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    color: "#475569",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  requiredMark: {
    color: "#dc2626",
    fontWeight: 700,
  },
  requiredNote: {
    fontSize: 12,
    color: "#94a3b8",
    margin: "2px 0 0",
  },
  balanceChip: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    backgroundColor: "#faf5ff",
    border: "1px solid #f3e8ff",
    borderRadius: 14,
    marginBottom: 20,
  },
  balanceChipLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#7e22ce",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  balanceChipValue: {
    fontSize: 18,
    fontWeight: 800,
    color: "#0f172a",
  },
  segmentGroup: {
    display: "flex",
    gap: 6,
    padding: 4,
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
  },
  segmentBtn: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "10px 10px",
    borderRadius: 9,
    border: "none",
    backgroundColor: "transparent",
    color: "#475569",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  segmentBtnActive: {
    backgroundColor: "#ffffff",
    color: "#7e22ce",
    boxShadow: "0 2px 6px rgba(15,23,42,0.10)",
  },
  deleteText: {
    fontSize: 14,
    color: "#475569",
    lineHeight: 1.6,
    margin: "0 0 22px",
  },
  deleteBtn: {
    padding: "12px 20px",
    borderRadius: 12,
    border: "none",
    backgroundColor: "#dc2626",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(220, 38, 38, 0.28)",
  },
};