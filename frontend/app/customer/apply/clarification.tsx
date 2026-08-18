import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSmartBack } from "@/src/utils/nav";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Button, Empty } from "@/src/components/ui";
import { ApplicationStatusPill, statusMeta } from "@/src/applicationStatus";
import { FormField, FormSection, DocumentPicker, dobFromIso } from "@/src/components/form";
import { notify } from "@/src/utils/confirm";

export default function ClarificationScreen() {
  const router = useRouter();
  const goBack = useSmartBack();
  const { id, view } = useLocalSearchParams<{ id: string; view?: string }>();
  const isReadOnly = view === "1";
  const [app, setApp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Response composer
  const [message, setMessage] = useState("");
  const [newFssaiDoc, setNewFssaiDoc] = useState<string | null>(null);
  const [newAadhaarDoc, setNewAadhaarDoc] = useState<string | null>(null);
  const [newLicenseDoc, setNewLicenseDoc] = useState<string | null>(null);
  const [newProfilePhoto, setNewProfilePhoto] = useState<string | null>(null);
  const [newRestaurantPhoto, setNewRestaurantPhoto] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await Api.getApplication(String(id));
      setApp(r);
    } catch (e: any) {
      notify("Couldn't load application", e?.message || "Try again");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const submit = async () => {
    if (!message.trim()) {
      notify("Add a message", "Please type a short response to the admin");
      return;
    }
    const patch: Record<string, any> = {};
    if (newFssaiDoc) patch.fssai_doc = newFssaiDoc;
    if (newAadhaarDoc) patch.aadhaar_doc = newAadhaarDoc;
    if (newLicenseDoc) patch.license_doc = newLicenseDoc;
    if (newProfilePhoto) patch.profile_photo = newProfilePhoto;
    if (newRestaurantPhoto) patch.restaurant_photo = newRestaurantPhoto;

    setBusy(true);
    try {
      await Api.respondClarification(String(id), { message: message.trim(), patch });
      notify("Sent", "Your response has been submitted for review.", () => router.replace("/customer/apply" as any));
    } catch (e: any) {
      notify("Couldn't send", e?.message || "Try again");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={[styles.header, { borderBottomWidth: 0 }]}>
          <TouchableOpacity onPress={goBack} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Application</Text>
          <View style={{ width: 26 }} />
        </View>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  if (!app) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Empty icon="alert-circle" title="Application not found" />
      </SafeAreaView>
    );
  }

  const needsResponse = app.status === "clarification_requested" && !isReadOnly;
  const isPartner = app.type === "restaurant_partner";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isPartner ? "Partner Application" : "Rider Application"}</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          keyboardShouldPersistTaps="handled"
        >
          {/* Status banner */}
          <View style={[styles.statusCard, { backgroundColor: statusMeta(app.status).bg }]}>
            <Ionicons name={statusMeta(app.status).icon} size={28} color={statusMeta(app.status).fg} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: statusMeta(app.status).fg, fontWeight: font.black, fontSize: 16 }}>
                {statusMeta(app.status).label}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                Submitted {new Date(app.created_at).toLocaleString()}
              </Text>
            </View>
          </View>

          {app.admin_notes ? (
            <View style={styles.adminNote}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Ionicons name="chatbubble-ellipses" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: font.black, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  Admin note
                </Text>
              </View>
              <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 20 }}>{app.admin_notes}</Text>
            </View>
          ) : null}

          {/* Submitted details summary */}
          <FormSection title="Submitted Details" icon="document-text">
            {isPartner ? (
              <>
                <Row k="Restaurant" v={app.payload?.restaurant_name} />
                <Row k="Owner" v={app.payload?.owner_name} />
                <Row k="Cuisines" v={(app.payload?.cuisines || []).join(", ")} />
                <Row k="Address" v={app.payload?.address} />
                <Row k="FSSAI" v={app.payload?.fssai_number} />
                <Row k="GSTIN" v={app.payload?.gst_number || "—"} />
              </>
            ) : (
              <>
                <Row k="Name" v={app.payload?.full_name} />
                <Row k="DOB" v={dobFromIso(app.payload?.date_of_birth) || app.payload?.date_of_birth} />
                <Row k="Vehicle" v={`${app.payload?.vehicle_type} • ${app.payload?.vehicle_number}`} />
                <Row k="License" v={app.payload?.license_number} />
                <Row k="Aadhaar" v={app.payload?.aadhaar_number ? "•••• •••• " + String(app.payload.aadhaar_number).slice(-4) : "—"} />
                <Row k="Address" v={app.payload?.address} />
              </>
            )}
          </FormSection>

          {/* Conversation timeline */}
          {(app.clarification_thread || []).length > 0 ? (
            <FormSection title="Conversation" icon="chatbubbles">
              <View style={{ gap: 10 }}>
                {(app.clarification_thread || []).map((m: any, idx: number) => (
                  <View key={idx} style={[styles.bubble, m.by === "admin" ? styles.bubbleAdmin : styles.bubbleUser]}>
                    <Text style={{ color: m.by === "admin" ? colors.primary : colors.success, fontWeight: font.bold, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                      {m.by === "admin" ? "Admin" : "You"} • {new Date(m.at).toLocaleString()}
                    </Text>
                    <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 20 }}>{m.message}</Text>
                  </View>
                ))}
              </View>
            </FormSection>
          ) : null}

          {/* Response composer */}
          {needsResponse ? (
            <>
              <FormSection title="Your Response" icon="send">
                <FormField label="Message to admin" value={message} onChangeText={setMessage} multiline required placeholder="Explain or clarify the requested point" />
                <Text style={styles.hint}>You can also re-upload any document below if requested.</Text>
              </FormSection>

              <FormSection title="Re-upload Documents (optional)" icon="cloud-upload">
                {isPartner ? (
                  <>
                    <DocumentPicker label="Updated FSSAI certificate" value={newFssaiDoc} onChange={setNewFssaiDoc} />
                    <DocumentPicker label="Updated restaurant photo" value={newRestaurantPhoto} onChange={setNewRestaurantPhoto} />
                  </>
                ) : (
                  <>
                    <DocumentPicker label="Updated Aadhaar" value={newAadhaarDoc} onChange={setNewAadhaarDoc} />
                    <DocumentPicker label="Updated driving license" value={newLicenseDoc} onChange={setNewLicenseDoc} />
                    <DocumentPicker label="Updated profile photo" value={newProfilePhoto} onChange={setNewProfilePhoto} />
                  </>
                )}
              </FormSection>

              <Button title="Send Response" icon="paper-plane" onPress={submit} loading={busy} full />
            </>
          ) : (
            <View style={{ marginTop: spacing.md }}>
              <ApplicationStatusPill status={app.status} />
              {app.status === "approved" ? (
                <Text style={[styles.hint, { marginTop: 8 }]}>
                  Your account has been upgraded. Switch to your new role from Profile to access partner tools.
                </Text>
              ) : null}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary },
  statusCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.lg, borderRadius: radius.lg, marginBottom: spacing.md },
  adminNote: { backgroundColor: colors.primarySoft, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, marginBottom: spacing.md },
  row: { flexDirection: "row", paddingVertical: 6, gap: 8 },
  rowKey: { width: 110, color: colors.textMuted, fontSize: 12, fontWeight: font.semi, textTransform: "uppercase", letterSpacing: 0.3 },
  rowVal: { flex: 1, color: colors.textPrimary, fontSize: 13, fontWeight: font.med },
  hint: { color: colors.textMuted, fontSize: 12 },
  bubble: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, ...shadow.card },
  bubbleAdmin: { backgroundColor: colors.primarySoft, borderColor: colors.primary, alignSelf: "flex-start", maxWidth: "92%" },
  bubbleUser: { backgroundColor: colors.successSoft, borderColor: colors.success, alignSelf: "flex-end", maxWidth: "92%" },
});
