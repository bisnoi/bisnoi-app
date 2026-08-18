import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, RefreshControl, Modal, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Empty, Pill, Button } from "@/src/components/ui";
import { AdminHeader } from "@/src/components/AdminHeader";

// ---- Types ---------------------------------------------------------------
type RiderRow = {
  id: string;
  name?: string;
  phone?: string;
  account_id?: string;
  rider_verified?: boolean | null;
  is_blocked?: boolean | null;
  is_online_live?: boolean;
  toggled_online?: boolean;
  last_heartbeat_at?: string;
  last_lat?: number;
  last_lng?: number;
  stats: {
    total: number; delivered: number; cancelled: number; active: number;
    earnings: number; avg_rating?: number | null;
  };
  kyc: {
    has_application: boolean;
    application_id?: string;
    application_status?: string;
    docs?: Record<string, any>;
  };
  admin_last_action_by?: string;
  admin_last_action_at?: string;
  admin_last_action_note?: string;
};

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "online", label: "Online" },
  { key: "verified", label: "Verified" },
  { key: "pending", label: "Pending KYC" },
  { key: "blocked", label: "Blocked" },
  { key: "offline", label: "Offline" },
];

// -------------------------------------------------------------------------

export default function AdminRiders() {
  const [rows, setRows] = useState<RiderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [detail, setDetail] = useState<RiderRow | null>(null);

  const load = useCallback(async () => {
    try {
      const data = (await Api.adminRiders({ q: search, status })) as RiderRow[];
      setRows(data || []);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [search, status]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const kpi = useMemo(() => {
    const totalDelivered = rows.reduce((a, r) => a + (r.stats?.delivered || 0), 0);
    const online = rows.filter((r) => r.is_online_live).length;
    const verified = rows.filter((r) => r.rider_verified === true).length;
    const blocked = rows.filter((r) => r.is_blocked).length;
    return { totalDelivered, online, verified, blocked };
  }, [rows]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AdminHeader title="Manage Riders" subtitle={`${rows.length} riders • ${kpi.online} online now`} />

      {/* KPI strip */}
      <View style={styles.kpiRow}>
        <KpiCard icon="checkmark-circle" tint={colors.success} label="Verified" value={kpi.verified} />
        <KpiCard icon="radio" tint={colors.primary} label="Online" value={kpi.online} />
        <KpiCard icon="bicycle" tint={colors.warning} label="Delivered" value={kpi.totalDelivered} />
        <KpiCard icon="ban" tint={colors.error} label="Blocked" value={kpi.blocked} />
      </View>

      {/* Search + status pills */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          testID="admin-riders-search"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={load}
          placeholder="Search by name, phone or rider ID"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => { setSearch(""); load(); }} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <Pill key={f.key} label={f.label} active={status === f.key} onPress={() => setStatus(f.key)} />
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : rows.length === 0 ? (
          <Empty icon="bicycle" title="No riders found" subtitle="Try clearing filters or search" />
        ) : (
          rows.map((r) => <RiderCard key={r.id} r={r} onOpen={() => setDetail(r)} />)
        )}
      </ScrollView>

      {/* Detail modal */}
      <RiderDetailModal
        rider={detail}
        onClose={() => setDetail(null)}
        onChanged={() => { setDetail(null); load(); }}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------

function KpiCard({ icon, tint, label, value }: { icon: any; tint: string; label: string; value: number }) {
  return (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiIcon, { backgroundColor: tint + "22" }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View>
        <Text style={styles.kpiVal}>{value}</Text>
        <Text style={styles.kpiLabel}>{label}</Text>
      </View>
    </View>
  );
}

function RiderCard({ r, onOpen }: { r: RiderRow; onOpen: () => void }) {
  const isVerified = r.rider_verified === true;
  const isBlocked = !!r.is_blocked;
  const initials = (r.name || "R").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <TouchableOpacity
      testID={`admin-rider-card-${r.id}`}
      activeOpacity={0.85}
      onPress={onOpen}
      style={[styles.card, isBlocked && { borderColor: colors.error }]}
    >
      <View style={styles.avatar}>
        <Text style={{ color: "#fff", fontWeight: font.black, fontSize: 16 }}>{initials}</Text>
        {r.is_online_live ? <View style={styles.onlineDot} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Text style={styles.name} numberOfLines={1}>{r.name || "Unnamed Rider"}</Text>
          {isVerified ? (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={11} color={colors.success} />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          ) : (
            <View style={styles.pendingBadge}><Text style={styles.pendingText}>KYC pending</Text></View>
          )}
          {isBlocked ? (
            <View style={styles.blockedBadge}>
              <Ionicons name="ban" size={11} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 10, fontWeight: font.black }}>BLOCKED</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.phone}>+91 {r.phone} · {r.account_id || "—"}</Text>
        <View style={styles.metaRow}>
          <Meta icon="checkmark-done" text={`${r.stats.delivered}/${r.stats.total} orders`} />
          {r.stats.active > 0 ? <Meta icon="flash" text={`${r.stats.active} active`} tint={colors.warning} /> : null}
          <Meta icon="cash" text={`₹${r.stats.earnings.toFixed(0)}`} />
          {r.stats.avg_rating ? <Meta icon="star" text={r.stats.avg_rating.toFixed(1)} tint={colors.warning} /> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function Meta({ icon, text, tint }: { icon: any; text: string; tint?: string }) {
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={11} color={tint || colors.textSecondary} />
      <Text style={{ fontSize: 11, color: tint || colors.textSecondary, fontWeight: font.semi }}>{text}</Text>
    </View>
  );
}

function RiderDetailModal({ rider, onClose, onChanged }: { rider: RiderRow | null; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<"verify" | "unverify" | "block" | "unblock" | "offline" | "profile" | null>(null);
  const [note, setNote] = useState("");
  const [tab, setTab] = useState<"overview" | "edit" | "docs">("overview");
  const [form, setForm] = useState<Record<string, any>>({});

  const setF = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  React.useEffect(() => {
    if (!rider) { setDetail(null); setForm({}); setTab("overview"); return; }
    setLoading(true); setNote("");
    Api.adminRiderDetail(rider.id).then((d: any) => {
      setDetail(d);
      // Seed form values from user + application
      const app = d?.application?.payload || {};
      setForm({
        name: rider.name || "",
        phone: rider.phone || "",
        email: (d?.rider?.email) || "",
        full_name: app.full_name || rider.name || "",
        contact_phone: app.contact_phone || rider.phone || "",
        contact_email: app.contact_email || "",
        date_of_birth: app.date_of_birth || "",
        city: app.city || "",
        address: app.address || "",
        pincode: app.pincode || "",
        vehicle_type: app.vehicle_type || "bike",
        vehicle_number: app.vehicle_number || "",
        rc_number: app.rc_number || "",
        license_number: app.license_number || "",
        aadhaar_number: app.aadhaar_number || "",
        pan_number: app.pan_number || "",
        bank_account_name: app.bank_account_name || "",
        bank_account_number: app.bank_account_number || "",
        bank_ifsc: app.bank_ifsc || "",
        aadhaar_doc: app.aadhaar_doc || "",
        license_doc: app.license_doc || "",
        rc_doc: app.rc_doc || "",
        profile_photo: app.profile_photo || "",
      });
    }).finally(() => setLoading(false));
  }, [rider]);

  if (!rider) return null;

  const act = async (kind: "verify" | "unverify" | "block" | "unblock" | "offline") => {
    setSaving(kind);
    const body: any = { note: note || undefined };
    if (kind === "verify") body.verified = true;
    if (kind === "unverify") body.verified = false;
    if (kind === "block") body.blocked = true;
    if (kind === "unblock") body.blocked = false;
    if (kind === "offline") body.force_offline = true;
    try {
      await Api.adminRiderAction(rider.id, body);
      onChanged();
    } finally { setSaving(null); }
  };

  const saveProfile = async () => {
    setSaving("profile");
    try {
      // Only send fields whose value is non-empty / changed
      const payload: Record<string, any> = { admin_note: note || undefined };
      Object.entries(form).forEach(([k, v]) => {
        if (v === "" || v === undefined || v === null) return;
        payload[k] = v;
      });
      await Api.adminRiderProfileEdit(rider.id, payload);
      onChanged();
    } catch (e: any) {
      alert(e?.message || "Failed to save profile");
    } finally { setSaving(null); }
  };

  const app = detail?.application;
  const orders = detail?.orders || [];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.mBack}>
        <View style={styles.mCard}>
          <View style={styles.mHead}>
            <Text style={styles.mTitle}>{rider.name || "Rider"}</Text>
            <TouchableOpacity onPress={onClose} testID="rider-detail-close" hitSlop={8}>
              <Ionicons name="close" size={26} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={styles.tabBar}>
            {[
              { k: "overview", label: "Overview", icon: "person-circle" as const },
              { k: "edit", label: "Edit Profile", icon: "create-outline" as const },
              { k: "docs", label: "Documents", icon: "document-attach-outline" as const },
            ].map((t) => (
              <TouchableOpacity
                key={t.k}
                testID={`rider-tab-${t.k}`}
                onPress={() => setTab(t.k as any)}
                style={[styles.tabItem, tab === t.k && styles.tabItemActive]}
              >
                <Ionicons name={t.icon} size={14} color={tab === t.k ? colors.primary : colors.textSecondary} />
                <Text style={[styles.tabLabel, tab === t.k && { color: colors.primary }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
            ) : tab === "overview" ? (
              <>
                {/* Profile summary */}
                <View style={styles.profRow}>
                  {form.profile_photo ? (
                    <View style={[styles.avatar, { width: 60, height: 60, overflow: "hidden" }]}>
                      <img src={form.profile_photo} style={{ width: 60, height: 60, objectFit: "cover" as any }} />
                    </View>
                  ) : (
                    <View style={[styles.avatar, { width: 60, height: 60 }]}>
                      <Text style={{ color: "#fff", fontWeight: font.black, fontSize: 22 }}>
                        {(rider.name || "R").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: font.bold, color: colors.textPrimary }}>+91 {rider.phone}</Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{rider.account_id}</Text>
                    <Text style={{ fontSize: 11, color: rider.is_online_live ? colors.success : colors.textMuted, marginTop: 4, fontWeight: font.bold }}>
                      {rider.is_online_live ? "● Online now" : "○ Offline"}
                      {rider.last_heartbeat_at ? `  ·  last ping ${new Date(rider.last_heartbeat_at).toLocaleTimeString()}` : ""}
                    </Text>
                  </View>
                </View>

                {/* Stats */}
                <View style={styles.statsGrid}>
                  <StatBox label="Total orders" value={rider.stats.total} />
                  <StatBox label="Delivered" value={rider.stats.delivered} tint={colors.success} />
                  <StatBox label="Active" value={rider.stats.active} tint={colors.warning} />
                  <StatBox label="Cancelled" value={rider.stats.cancelled} tint={colors.error} />
                  <StatBox label="Earnings" value={`₹${rider.stats.earnings.toFixed(0)}`} />
                  <StatBox label="Rating" value={rider.stats.avg_rating ? rider.stats.avg_rating.toFixed(1) : "—"} tint={colors.warning} />
                </View>

                {/* KYC quick view */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>KYC snapshot</Text>
                  {app ? (
                    <View>
                      <Text style={styles.kycStatusRow}>
                        Status:  <Text style={{ color: app.status === "approved" ? colors.success : app.status === "rejected" ? colors.error : colors.warning, fontWeight: font.black }}>
                          {(app.status || "pending").toUpperCase()}
                        </Text>
                      </Text>
                      <KVRow k="Full Name" v={app.payload?.full_name} />
                      <KVRow k="DOB" v={app.payload?.date_of_birth} />
                      <KVRow k="Address" v={`${app.payload?.address || ""}${app.payload?.city ? ", " + app.payload.city : ""}${app.payload?.pincode ? " - " + app.payload.pincode : ""}`} />
                      <KVRow k="Vehicle" v={`${app.payload?.vehicle_type || ""} ${app.payload?.vehicle_number || ""}`} />
                      <KVRow k="License" v={app.payload?.license_number} />
                      <KVRow k="Aadhaar" v={app.payload?.aadhaar_number ? maskAadhaar(app.payload.aadhaar_number) : "—"} />
                      <KVRow k="PAN" v={app.payload?.pan_number} />
                      <KVRow k="Bank A/c" v={app.payload?.bank_account_number ? `${maskAadhaar(app.payload.bank_account_number)} • ${app.payload?.bank_ifsc || ""}` : "—"} />
                    </View>
                  ) : (
                    <Text style={{ color: colors.textMuted, fontStyle: "italic" }}>
                      No KYC on file. Use the "Edit Profile" tab to fill it in on behalf of the rider.
                    </Text>
                  )}
                </View>

                {/* Recent orders */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Recent orders  ({orders.length})</Text>
                  {orders.slice(0, 8).map((o: any) => (
                    <View key={o.id} style={styles.orderRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: font.bold, color: colors.textPrimary, fontSize: 13 }}>
                          #{o.order_number || o.id.slice(0, 6)}  ·  ₹{o.total}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                          {o.restaurant_name || "—"}  ·  {new Date(o.created_at).toLocaleString()}
                        </Text>
                      </View>
                      <View style={[styles.orderStatus, { backgroundColor: statusColor(o.status) + "22" }]}>
                        <Text style={{ color: statusColor(o.status), fontSize: 10, fontWeight: font.black, textTransform: "uppercase" }}>{o.status}</Text>
                      </View>
                    </View>
                  ))}
                  {orders.length === 0 && !loading ? (
                    <Text style={{ color: colors.textMuted, fontStyle: "italic" }}>No orders yet</Text>
                  ) : null}
                </View>

                {/* Admin action note + verify/block/offline */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Admin action note (optional)</Text>
                  <TextInput
                    testID="rider-admin-note"
                    value={note}
                    onChangeText={setNote}
                    placeholder="Reason for this action (visible in activity log)"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    style={styles.noteInput}
                  />
                  {rider.admin_last_action_at ? (
                    <Text style={styles.actionMeta}>
                      Last admin action: {rider.admin_last_action_by || "—"}  ·  {new Date(rider.admin_last_action_at).toLocaleString()}
                      {rider.admin_last_action_note ? `\n"${rider.admin_last_action_note}"` : ""}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.actionsGrid}>
                  {rider.rider_verified !== true ? (
                    <Button testID="rider-verify-btn" title="Verify" icon="checkmark-circle" onPress={() => act("verify")} loading={saving === "verify"} />
                  ) : (
                    <Button testID="rider-unverify-btn" title="Un-verify" icon="close-circle" variant="secondary" onPress={() => act("unverify")} loading={saving === "unverify"} />
                  )}
                  {rider.is_blocked ? (
                    <Button testID="rider-unblock-btn" title="Unblock" icon="checkmark-done" variant="secondary" onPress={() => act("unblock")} loading={saving === "unblock"} />
                  ) : (
                    <Button testID="rider-block-btn" title="Block" icon="ban" variant="danger" onPress={() => act("block")} loading={saving === "block"} />
                  )}
                  {rider.is_online_live ? (
                    <Button testID="rider-force-offline-btn" title="Force Offline" icon="power" variant="secondary" onPress={() => act("offline")} loading={saving === "offline"} />
                  ) : null}
                </View>
              </>
            ) : tab === "edit" ? (
              <EditProfileForm form={form} setF={setF} note={note} setNote={setNote} saving={saving === "profile"} onSave={saveProfile} />
            ) : (
              <DocumentsTab form={form} setF={setF} saving={saving === "profile"} onSave={saveProfile} />
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function KVRow({ k, v }: { k: string; v?: any }) {
  return (
    <View style={styles.docRow}>
      <Text style={styles.docKey}>{k}</Text>
      <Text style={styles.docVal} numberOfLines={2} selectable>{v || "—"}</Text>
    </View>
  );
}

function maskAadhaar(s: string) {
  if (!s) return "";
  const t = String(s).replace(/\s/g, "");
  if (t.length <= 4) return t;
  return "•".repeat(Math.max(0, t.length - 4)) + t.slice(-4);
}

// ---------------- Edit Profile tab ----------------
function EditProfileForm({
  form, setF, note, setNote, saving, onSave,
}: { form: any; setF: (k: string, v: any) => void; note: string; setNote: (s: string) => void; saving: boolean; onSave: () => void }) {
  return (
    <>
      <SectionTitle>Basic Identity</SectionTitle>
      <FieldRow label="Full name" value={form.name} onChange={(v) => setF("name", v)} testID="edit-name" />
      <FieldRow label="Mobile number" value={form.phone} onChange={(v) => setF("phone", v.replace(/[^0-9]/g, "").slice(0, 10))} testID="edit-phone" keyboardType="phone-pad" prefix="+91" />
      <FieldRow label="Email" value={form.email} onChange={(v) => setF("email", v)} testID="edit-email" keyboardType="email-address" placeholder="rider@example.com" />

      <SectionTitle>Address</SectionTitle>
      <FieldRow label="KYC name (as per Aadhaar)" value={form.full_name} onChange={(v) => setF("full_name", v)} testID="edit-fullname" />
      <FieldRow label="Date of birth" value={form.date_of_birth} onChange={(v) => setF("date_of_birth", v)} testID="edit-dob" placeholder="YYYY-MM-DD" />
      <FieldRow label="Address" value={form.address} onChange={(v) => setF("address", v)} testID="edit-address" multiline />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 2 }}><FieldRow label="City" value={form.city} onChange={(v) => setF("city", v)} testID="edit-city" /></View>
        <View style={{ flex: 1 }}><FieldRow label="Pincode" value={form.pincode} onChange={(v) => setF("pincode", v.replace(/[^0-9]/g, "").slice(0, 6))} testID="edit-pincode" keyboardType="number-pad" /></View>
      </View>

      <SectionTitle>Vehicle</SectionTitle>
      <VehicleTypeRow value={form.vehicle_type} onChange={(v) => setF("vehicle_type", v)} />
      <FieldRow label="Vehicle number (e.g. KA01AB1234)" value={form.vehicle_number} onChange={(v) => setF("vehicle_number", v.toUpperCase())} testID="edit-vehicle-num" />
      <FieldRow label="RC number" value={form.rc_number} onChange={(v) => setF("rc_number", v)} testID="edit-rc" />
      <FieldRow label="Driving licence number" value={form.license_number} onChange={(v) => setF("license_number", v)} testID="edit-dl" />

      <SectionTitle>KYC IDs</SectionTitle>
      <FieldRow label="Aadhaar number (12 digits)" value={form.aadhaar_number} onChange={(v) => setF("aadhaar_number", v.replace(/[^0-9]/g, "").slice(0, 12))} testID="edit-aadhaar" keyboardType="number-pad" />
      <FieldRow label="PAN number (ABCDE1234F)" value={form.pan_number} onChange={(v) => setF("pan_number", v.toUpperCase().slice(0, 10))} testID="edit-pan" />

      <SectionTitle>Bank Details (for payouts)</SectionTitle>
      <FieldRow label="Account holder name" value={form.bank_account_name} onChange={(v) => setF("bank_account_name", v)} testID="edit-bank-name" />
      <FieldRow label="Account number" value={form.bank_account_number} onChange={(v) => setF("bank_account_number", v.replace(/[^0-9]/g, "").slice(0, 20))} testID="edit-bank-acc" keyboardType="number-pad" />
      <FieldRow label="IFSC code" value={form.bank_ifsc} onChange={(v) => setF("bank_ifsc", v.toUpperCase().slice(0, 11))} testID="edit-bank-ifsc" />

      <SectionTitle>Admin note (recorded in application timeline)</SectionTitle>
      <TextInput
        testID="edit-admin-note"
        value={note}
        onChangeText={setNote}
        placeholder="Why are you editing this profile?"
        placeholderTextColor={colors.textMuted}
        multiline
        style={styles.noteInput}
      />

      <View style={{ marginTop: spacing.lg }}>
        <Button testID="edit-save-btn" title={saving ? "Saving…" : "Save Profile"} icon="save-outline" onPress={onSave} loading={saving} />
      </View>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>{children}</Text>;
}

function FieldRow({ label, value, onChange, testID, placeholder, keyboardType, multiline, prefix }: {
  label: string; value: any; onChange: (v: string) => void; testID?: string;
  placeholder?: string; keyboardType?: any; multiline?: boolean; prefix?: string;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {prefix ? (
          <View style={styles.prefixBox}><Text style={{ fontWeight: font.bold, color: colors.textPrimary }}>{prefix}</Text></View>
        ) : null}
        <TextInput
          testID={testID}
          value={value || ""}
          onChangeText={onChange}
          placeholder={placeholder || label}
          placeholderTextColor={colors.textMuted}
          keyboardType={keyboardType}
          multiline={multiline}
          style={[styles.fieldInput, multiline && { minHeight: 60, textAlignVertical: "top" }, prefix ? { flex: 1 } : null]}
        />
      </View>
    </View>
  );
}

function VehicleTypeRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = [
    { k: "bike", label: "Bike", icon: "bicycle" as const },
    { k: "scooter", label: "Scooter", icon: "speedometer" as const },
    { k: "bicycle", label: "Bicycle", icon: "leaf" as const },
    { k: "ev", label: "EV", icon: "battery-charging" as const },
  ];
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>Vehicle type</Text>
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        {options.map((o) => {
          const active = value === o.k;
          return (
            <TouchableOpacity
              key={o.k}
              testID={`edit-vehicle-${o.k}`}
              onPress={() => onChange(o.k)}
              style={[styles.vehChip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              activeOpacity={0.85}
            >
              <Ionicons name={o.icon} size={13} color={active ? colors.onPrimary : colors.textPrimary} />
              <Text style={{ color: active ? colors.onPrimary : colors.textPrimary, fontWeight: font.bold, fontSize: 12 }}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ---------------- Documents tab ----------------
function DocumentsTab({ form, setF, saving, onSave }: { form: any; setF: (k: string, v: any) => void; saving: boolean; onSave: () => void }) {
  return (
    <>
      <SectionTitle>Rider photos & documents</SectionTitle>
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 10 }}>
        Click any tile below to upload / replace. Files stay under 3 MB each.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <DocTile label="Profile photo" value={form.profile_photo} onChange={(v) => setF("profile_photo", v)} testID="doc-profile-photo" />
        <DocTile label="Aadhaar" value={form.aadhaar_doc} onChange={(v) => setF("aadhaar_doc", v)} testID="doc-aadhaar" />
        <DocTile label="Driving Licence" value={form.license_doc} onChange={(v) => setF("license_doc", v)} testID="doc-license" />
        <DocTile label="RC (Registration Cert.)" value={form.rc_doc} onChange={(v) => setF("rc_doc", v)} testID="doc-rc" />
      </View>
      <View style={{ marginTop: spacing.xl }}>
        <Button testID="docs-save-btn" title={saving ? "Saving…" : "Save Documents"} icon="save-outline" onPress={onSave} loading={saving} />
      </View>
    </>
  );
}

function DocTile({ label, value, onChange, testID }: { label: string; value?: string; onChange: (v: string) => void; testID?: string }) {
  const pick = () => {
    if (Platform.OS !== "web") return;
    // eslint-disable-next-line
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,application/pdf";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 3 * 1024 * 1024) {
        alert("File must be under 3 MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => onChange(String(reader.result || ""));
      reader.readAsDataURL(file);
    };
    input.click();
  };
  const isImg = value?.startsWith("data:image");
  return (
    <TouchableOpacity
      testID={testID}
      onPress={pick}
      activeOpacity={0.85}
      style={styles.docTile}
    >
      {isImg ? (
        <img src={value} style={{ width: "100%", height: 120, objectFit: "cover" as any, borderRadius: 8 }} />
      ) : value ? (
        <View style={styles.docThumbEmpty}>
          <Ionicons name="document" size={30} color={colors.primary} />
          <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 4 }}>PDF / file</Text>
        </View>
      ) : (
        <View style={styles.docThumbEmpty}>
          <Ionicons name="cloud-upload-outline" size={26} color={colors.textMuted} />
          <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 6 }}>Upload</Text>
        </View>
      )}
      <Text style={styles.docTileLabel}>{label}</Text>
    </TouchableOpacity>
  );
}


function StatBox({ label, value, tint }: { label: string; value: any; tint?: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statVal, tint ? { color: tint } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function statusColor(s: string) {
  if (s === "delivered") return colors.success;
  if (s === "cancelled") return colors.error;
  if (s === "picked") return colors.primary;
  if (s === "accepted" || s === "preparing" || s === "ready") return colors.warning;
  return colors.textSecondary;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  kpiRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  kpiCard: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    padding: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  kpiIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  kpiVal: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary },
  kpiLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: font.bold, textTransform: "uppercase", letterSpacing: 0.4 },

  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: spacing.lg, marginTop: spacing.md, paddingHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, paddingVertical: Platform.OS === "ios" ? 12 : 8, fontSize: 14, color: colors.textPrimary },
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 8, alignItems: "center" },

  card: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: colors.warning },
  onlineDot: { position: "absolute", right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.success, borderWidth: 2, borderColor: "#FFF" },
  name: { fontSize: 15, fontWeight: font.bold, color: colors.textPrimary, flexShrink: 1 },
  phone: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.successSoft },
  verifiedText: { color: colors.success, fontSize: 10, fontWeight: font.black, letterSpacing: 0.3 },
  pendingBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.warningSoft },
  pendingText: { color: colors.warning, fontSize: 10, fontWeight: font.black, letterSpacing: 0.3 },
  blockedBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.error },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  meta: { flexDirection: "row", alignItems: "center", gap: 4 },

  mBack: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  mCard: { backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "94%" },
  mHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  mTitle: { fontSize: 20, fontWeight: font.black, color: colors.textPrimary },

  profRow: { flexDirection: "row", gap: 14, marginBottom: spacing.lg, alignItems: "center" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.lg },
  statBox: { flexGrow: 1, minWidth: "30%", padding: 10, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  statVal: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary },
  statLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 2, letterSpacing: 0.3, textTransform: "uppercase", fontWeight: font.bold },

  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 },
  kycStatusRow: { fontSize: 13, color: colors.textPrimary, marginBottom: 8 },
  docRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  docKey: { fontSize: 12, color: colors.textSecondary, textTransform: "capitalize" },
  docVal: { fontSize: 12, color: colors.textPrimary, fontWeight: font.semi, maxWidth: "60%" },

  orderRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  orderStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },

  noteInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10, fontSize: 13, color: colors.textPrimary, minHeight: 60, textAlignVertical: "top" },
  actionMeta: { marginTop: 8, fontSize: 11, color: colors.textMuted, lineHeight: 15 },

  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  // Tabs
  tabBar: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabItemActive: { borderBottomColor: colors.primary },
  tabLabel: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary },

  fieldLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: font.black,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fieldInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    fontSize: 13,
    color: colors.textPrimary,
    flex: 1,
  },
  prefixBox: {
    paddingHorizontal: 10,
    paddingVertical: 12,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  vehChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  docTile: {
    width: "48%",
    padding: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  docThumbEmpty: {
    width: "100%",
    height: 120,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed" as any,
    alignItems: "center",
    justifyContent: "center",
  },
  docTileLabel: {
    fontSize: 11,
    fontWeight: font.bold,
    color: colors.textPrimary,
    marginTop: 6,
    textAlign: "center",
  },
});
