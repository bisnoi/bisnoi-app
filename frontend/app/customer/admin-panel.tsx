import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { notify, confirmDialog } from "@/src/utils/confirm";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useSmartBack } from "@/src/utils/nav";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Button, Empty } from "@/src/components/ui";
import { dobFromIso } from "@/src/components/form";
import { ApplicationStatusPill, statusMeta } from "@/src/applicationStatus";

type Status = "pending" | "clarification_requested" | "approved" | "rejected";
const TABS: { key: Status; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: "pending", label: "Pending", icon: "hourglass", color: colors.warning },
  { key: "clarification_requested", label: "Clarification", icon: "chatbubble-ellipses", color: colors.primary },
  { key: "approved", label: "Approved", icon: "checkmark-circle", color: colors.success },
  { key: "rejected", label: "Rejected", icon: "close-circle", color: colors.error },
];

export default function AdminPanel() {
  const router = useRouter();
  const goBack = useSmartBack();
  const { user } = useAuth();
  const [filter, setFilter] = useState<Status>("pending");
  const [apps, setApps] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [actionType, setActionType] = useState<"approve" | "reject" | "request_clarification" | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    try {
      const params: Record<string, any> = {};
      if (filter !== "all") params.status = filter;
      const [list, st] = await Promise.all([
        Api.adminApplications(params),
        Api.adminApplicationStats().catch(() => ({})),
      ]);
      setApps((list as any[]) || []);
      setStats((st as any) || {});
    } catch (e: any) {
      notify("Couldn't load applications", e?.message || "Try again");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, isAdmin]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const openDetail = async (a: any) => {
    setDetail(a);
    setDetailLoading(true);
    try {
      const full = await Api.adminGetApplication(a.id);
      setDetail(full);
    } catch {
      // keep summary
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetail(null);
    setActionType(null);
    setNotes("");
  };

  const beginAction = (a: "approve" | "reject" | "request_clarification") => {
    setActionType(a);
    setNotes("");
  };

  const submitAction = async () => {
    if (!detail || !actionType) return;
    if ((actionType === "request_clarification" || actionType === "reject") && !notes.trim()) {
      notify("Add a note", actionType === "reject" ? "Please share the reason for rejection." : "Please describe what clarification is needed.");
      return;
    }
    setBusy(true);
    try {
      await Api.adminReviewApplication(detail.id, { action: actionType, admin_notes: notes.trim() || null });
      notify(
        actionType === "approve" ? "Approved" : actionType === "reject" ? "Rejected" : "Clarification requested",
        actionType === "approve"
          ? "The applicant's role has been upgraded."
          : actionType === "reject"
          ? "The application has been rejected."
          : "The applicant has been notified.",
      );
      closeDetail();
      load();
    } catch (e: any) {
      notify("Action failed", e?.message || "Try again");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!detail) return;
    const isApprovedPartner = detail.status === "approved" && detail.type === "restaurant_partner";
    const msg = isApprovedPartner
      ? "This will permanently delete the application AND the restaurant it created (menu, categories included). The owner will be reverted to a customer. This cannot be undone."
      : detail.status === "approved" && detail.type === "rider"
      ? "This will permanently delete the application and revert the rider back to a customer. This cannot be undone."
      : "This will permanently delete this application. This cannot be undone.";
    const ok = await confirmDialog("Delete application?", msg, "Delete", true);
    if (!ok) return;
    setBusy(true);
    try {
      const res: any = await Api.adminDeleteApplication(detail.id);
      notify(
        "Application deleted",
        res?.removed_restaurants
          ? "The application and its restaurant were removed, and the owner is now a customer."
          : "The application has been removed.",
      );
      closeDetail();
      load();
    } catch (e: any) {
      notify("Delete failed", e?.message || "Try again");
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Header title="Admin Panel" onBack={goBack} />
        <Empty icon="lock-closed" title="Admin only" subtitle="You don't have permission to view this page." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Header title="Admin Panel" subtitle="Review partner & rider applications" onBack={goBack} />

      {/* 4-tab segmented bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}
        contentContainerStyle={{ paddingHorizontal: spacing.md }}
      >
        {TABS.map((t) => {
          const active = filter === t.key;
          const count = stats[t.key] ?? 0;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setFilter(t.key)}
              activeOpacity={0.85}
              style={[styles.tab, active && { borderBottomColor: t.color }]}
            >
              <Ionicons name={t.icon} size={16} color={active ? t.color : colors.textMuted} />
              <Text style={[styles.tabLabel, { color: active ? t.color : colors.textSecondary }]}>{t.label}</Text>
              {count > 0 ? (
                <View style={[styles.tabBadge, { backgroundColor: active ? t.color : colors.surfaceAlt }]}>
                  <Text style={[styles.tabBadgeText, { color: active ? "#fff" : colors.textSecondary }]}>{count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : apps.length === 0 ? (
        <Empty icon="checkmark-done-circle" title="Nothing to review" subtitle={`No ${TABS.find((t) => t.key === filter)?.label.toLowerCase()} applications right now.`} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 112, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {apps.map((a) => (
            <TouchableOpacity key={a.id} style={styles.card} activeOpacity={0.85} onPress={() => openDetail(a)}>
              <View style={[styles.cardIcon, { backgroundColor: a.type === "rider" ? colors.successSoft : colors.primarySoft }]}>
                <Ionicons name={a.type === "rider" ? "bicycle" : "restaurant"} size={22} color={a.type === "rider" ? colors.success : colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {a.type === "rider" ? a.payload?.full_name || "Rider" : a.payload?.restaurant_name || a.payload?.business_name || "Restaurant"}
                  </Text>
                  {a.is_resubmitted && a.status === "pending" ? (
                    <View style={styles.resubBadge}>
                      <Ionicons name="refresh" size={10} color={colors.primary} />
                      <Text style={styles.resubBadgeText}>RESUBMITTED</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.cardSub} numberOfLines={1}>
                  {a.applicant_name || "User"} · +91 {a.applicant_phone}
                </Text>
                <Text style={styles.cardMeta}>
                  {a.type === "rider" ? "Rider Application" : "Restaurant Partner"} · {new Date(a.created_at).toLocaleDateString()}
                </Text>
              </View>
              <ApplicationStatusPill status={a.status} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Review modal */}
      <Modal visible={!!detail} animationType="slide" onRequestClose={closeDetail} transparent={false}>
        <SafeAreaView style={styles.safe} edges={["top"]}>
          <Header
            title={detail?.type === "rider" ? "Rider Application" : "Partner Application"}
            onBack={closeDetail}
            backIcon="close"
          />
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            {detailLoading || !detail ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
            ) : (
              <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
                {/* Status banner */}
                <View style={[styles.statusBanner, { backgroundColor: statusMeta(detail.status).bg }]}>
                  <Ionicons name={statusMeta(detail.status).icon} size={26} color={statusMeta(detail.status).fg} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: statusMeta(detail.status).fg, fontWeight: font.black, fontSize: 16 }}>
                      {statusMeta(detail.status).label}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                      Submitted {new Date(detail.created_at).toLocaleString()}
                    </Text>
                  </View>
                </View>

                {/* Applicant */}
                <SectionBlock title="Applicant" icon="person-circle">
                  <Row k="Name" v={detail.applicant_name} />
                  <Row k="Phone" v={`+91 ${detail.applicant_phone}`} />
                </SectionBlock>

                {/* Payload */}
                {detail.type === "rider" ? (
                  <PayloadRider p={detail.payload || {}} />
                ) : (
                  <PayloadPartner p={detail.payload || {}} />
                )}

                {/* Conversation */}
                {(detail.clarification_thread || []).length > 0 ? (
                  <SectionBlock title="Conversation" icon="chatbubbles">
                    <View style={{ gap: 10 }}>
                      {(detail.clarification_thread || []).map((m: any, i: number) => (
                        <View
                          key={i}
                          style={[
                            styles.bubble,
                            m.by === "admin"
                              ? { backgroundColor: colors.primarySoft, borderColor: colors.primary, alignSelf: "flex-start" }
                              : { backgroundColor: colors.successSoft, borderColor: colors.success, alignSelf: "flex-end" },
                          ]}
                        >
                          <Text style={{ color: m.by === "admin" ? colors.primary : colors.success, fontWeight: font.bold, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                            {m.by === "admin" ? "Admin" : "Applicant"} · {new Date(m.at).toLocaleString()}
                          </Text>
                          <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 20 }}>{m.message}</Text>
                        </View>
                      ))}
                    </View>
                  </SectionBlock>
                ) : null}

                {/* Admin notes (last) */}
                {detail.admin_notes ? (
                  <SectionBlock title="Last admin note" icon="document-text">
                    <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 20 }}>{detail.admin_notes}</Text>
                  </SectionBlock>
                ) : null}

                {/* Action composer */}
                {!["approved", "rejected"].includes(detail.status) ? (
                  <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
                    {actionType ? (
                      <View style={styles.actionBox}>
                        <Text style={styles.actionTitle}>
                          {actionType === "approve" ? "Approve application" : actionType === "reject" ? "Reject application" : "Request clarification"}
                        </Text>
                        <Text style={styles.actionHint}>
                          {actionType === "approve"
                            ? "Approving will upgrade the applicant's role automatically. Add an optional welcome note."
                            : actionType === "reject"
                            ? "Share a clear reason. The applicant will see this note."
                            : "Describe exactly what is missing or unclear so the applicant can respond."}
                        </Text>
                        <TextInput
                          style={styles.notesInput}
                          placeholder={
                            actionType === "approve"
                              ? "Welcome note (optional)"
                              : actionType === "reject"
                              ? "Reason for rejection"
                              : "What clarification is needed?"
                          }
                          placeholderTextColor={colors.textMuted}
                          value={notes}
                          onChangeText={setNotes}
                          multiline
                        />
                        <View style={{ flexDirection: "row", gap: spacing.sm }}>
                          <Button title="Cancel" variant="ghost" onPress={() => setActionType(null)} style={{ flex: 1 }} />
                          <Button
                            title={actionType === "approve" ? "Confirm Approve" : actionType === "reject" ? "Confirm Reject" : "Send Request"}
                            variant={actionType === "reject" ? "danger" : "primary"}
                            onPress={submitAction}
                            loading={busy}
                            style={{ flex: 1.4 }}
                          />
                        </View>
                      </View>
                    ) : (
                      <>
                        <Button title="Approve" icon="checkmark-circle" onPress={() => beginAction("approve")} full />
                        <Button title="Request Clarification" icon="chatbubble-ellipses" variant="secondary" onPress={() => beginAction("request_clarification")} full />
                        <Button title="Reject" icon="close-circle" variant="danger" onPress={() => beginAction("reject")} full />
                        <Button title="Delete Application" icon="trash" variant="ghost" onPress={handleDelete} loading={busy} full />
                      </>
                    )}
                  </View>
                ) : (
                  <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
                    <View style={{ alignItems: "flex-start" }}>
                      <ApplicationStatusPill status={detail.status} />
                      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>This application is closed.</Text>
                    </View>
                    {detail.status === "approved" && detail.type === "restaurant_partner" ? (
                      <Text style={{ color: colors.textMuted, fontSize: 11.5, lineHeight: 16 }}>
                        Deleting will also remove the restaurant created from this application and revert the owner to a customer.
                      </Text>
                    ) : null}
                    <Button
                      testID="app-delete-btn"
                      title="Delete Application"
                      icon="trash"
                      variant="danger"
                      onPress={handleDelete}
                      loading={busy}
                      full
                    />
                  </View>
                )}
              </ScrollView>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

/* ---------- helpers ---------- */
function Header({ title, subtitle, onBack, backIcon = "chevron-back" }: { title: string; subtitle?: string; onBack: () => void; backIcon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} hitSlop={10}>
        <Ionicons name={backIcon} size={26} color={colors.textPrimary} />
      </TouchableOpacity>
      <View style={{ flex: 1, marginLeft: 8 }}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

function StatTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SectionBlock({ title, icon, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Ionicons name={icon} size={16} color={colors.primary} />
        <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      </View>
      {children}
    </View>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowKey}>{k}</Text>
      <Text style={styles.rowVal} numberOfLines={3}>{v || "—"}</Text>
    </View>
  );
}

function DocThumb({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={{ marginRight: 10, marginBottom: 10 }}>
      <Image source={{ uri: value }} style={styles.docThumb} contentFit="cover" />
      <Text style={styles.docLabel}>{label}</Text>
    </View>
  );
}

function PayloadPartner({ p }: { p: any }) {
  return (
    <>
      <SectionBlock title="Business" icon="business">
        <Row k="Restaurant" v={p.restaurant_name} />
        <Row k="Business" v={p.business_name} />
        <Row k="Owner" v={p.owner_name} />
        <Row k="Contact" v={p.contact_phone} />
        <Row k="Email" v={p.contact_email} />
        <Row k="Cuisines" v={(p.cuisines || []).join(", ")} />
        <Row k="Hours" v={`${p.opening_time || "—"} – ${p.closing_time || "—"}`} />
      </SectionBlock>
      <SectionBlock title="Address" icon="location">
        <Row k="Address" v={p.address} />
        <Row k="City" v={p.city} />
        <Row k="Pincode" v={p.pincode} />
      </SectionBlock>
      <SectionBlock title="Compliance" icon="shield-checkmark">
        <Row k="FSSAI" v={p.fssai_number} />
        <Row k="GSTIN" v={p.gst_number} />
        <Row k="PAN" v={p.pan_number} />
      </SectionBlock>
      <SectionBlock title="Bank" icon="card">
        <Row k="Account Name" v={p.bank_account_name} />
        <Row k="Account" v={p.bank_account_number ? "•••• " + String(p.bank_account_number).slice(-4) : "—"} />
        <Row k="IFSC" v={p.bank_ifsc} />
      </SectionBlock>
      <SectionBlock title="Documents" icon="cloud-upload">
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <DocThumb label="FSSAI" value={p.fssai_doc} />
          <DocThumb label="GST" value={p.gst_doc} />
          <DocThumb label="PAN" value={p.pan_doc} />
          <DocThumb label="Restaurant" value={p.restaurant_photo} />
          <DocThumb label="Menu" value={p.menu_photo} />
        </View>
        {!(p.fssai_doc || p.gst_doc || p.pan_doc || p.restaurant_photo || p.menu_photo) ? (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>No documents uploaded.</Text>
        ) : null}
      </SectionBlock>
    </>
  );
}

function PayloadRider({ p }: { p: any }) {
  return (
    <>
      <SectionBlock title="Personal" icon="person">
        <Row k="Full name" v={p.full_name} />
        <Row k="Phone" v={p.contact_phone} />
        <Row k="Email" v={p.contact_email} />
        <Row k="DOB" v={dobFromIso(p.date_of_birth) || p.date_of_birth} />
      </SectionBlock>
      <SectionBlock title="Address" icon="location">
        <Row k="Address" v={p.address} />
        <Row k="City" v={p.city} />
        <Row k="Pincode" v={p.pincode} />
      </SectionBlock>
      <SectionBlock title="Vehicle" icon="bicycle">
        <Row k="Type" v={p.vehicle_type} />
        <Row k="Number" v={p.vehicle_number} />
        <Row k="RC" v={p.rc_number} />
        <Row k="License" v={p.license_number} />
      </SectionBlock>
      <SectionBlock title="KYC" icon="shield-checkmark">
        <Row k="Aadhaar" v={p.aadhaar_number ? "•••• •••• " + String(p.aadhaar_number).slice(-4) : "—"} />
        <Row k="PAN" v={p.pan_number} />
      </SectionBlock>
      <SectionBlock title="Bank" icon="card">
        <Row k="Account Name" v={p.bank_account_name} />
        <Row k="Account" v={p.bank_account_number ? "•••• " + String(p.bank_account_number).slice(-4) : "—"} />
        <Row k="IFSC" v={p.bank_ifsc} />
      </SectionBlock>
      <SectionBlock title="Documents" icon="cloud-upload">
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <DocThumb label="Aadhaar" value={p.aadhaar_doc} />
          <DocThumb label="License" value={p.license_doc} />
          <DocThumb label="RC" value={p.rc_doc} />
          <DocThumb label="Profile" value={p.profile_photo} />
        </View>
        {!(p.aadhaar_doc || p.license_doc || p.rc_doc || p.profile_photo) ? (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>No documents uploaded.</Text>
        ) : null}
      </SectionBlock>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary },
  headerSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
    marginRight: spacing.xs,
  },
  tabLabel: { fontSize: 13, fontWeight: font.bold, letterSpacing: 0.2 },
  tabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  tabBadgeText: { fontSize: 11, fontWeight: font.black, lineHeight: 14 },

  resubBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  resubBadgeText: { fontSize: 9, fontWeight: font.black, color: colors.primary, letterSpacing: 0.4 },

  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  cardIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, fontWeight: font.black, color: colors.textPrimary },
  cardSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  cardMeta: { fontSize: 11, color: colors.textMuted, marginTop: 3 },

  statusBanner: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.lg, borderRadius: radius.lg, marginBottom: spacing.md },
  section: { marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 12, fontWeight: font.black, color: colors.primary, letterSpacing: 0.5 },
  row: { flexDirection: "row", paddingVertical: 5, gap: 8 },
  rowKey: { width: 110, color: colors.textMuted, fontSize: 12, fontWeight: font.semi, textTransform: "uppercase", letterSpacing: 0.3 },
  rowVal: { flex: 1, color: colors.textPrimary, fontSize: 13, fontWeight: font.med },

  bubble: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, maxWidth: "92%" },

  docThumb: { width: 80, height: 80, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  docLabel: { fontSize: 10, color: colors.textMuted, marginTop: 4, textAlign: "center" },

  actionBox: { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm, ...shadow.card },
  actionTitle: { fontSize: 16, fontWeight: font.black, color: colors.textPrimary },
  actionHint: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
  notesInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, minHeight: 90, textAlignVertical: "top", color: colors.textPrimary, backgroundColor: colors.surfaceAlt },
});
