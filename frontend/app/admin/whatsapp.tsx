import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Switch, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ScreenHeader, Screen } from "@/src/components/ScreenHeader";

type Field = { key: string; label: string; hint: string; placeholder: string; secret?: boolean };

const FIELDS: Field[] = [
  { key: "access_token", label: "Access Token", hint: "Permanent / system-user token from Meta", placeholder: "Paste WhatsApp token", secret: true },
  { key: "phone_number_id", label: "Phone Number ID", hint: "Sender phone number id (not the phone number)", placeholder: "e.g. 123456789012345" },
  { key: "bill_template", label: "Bill Template Name", hint: "Approved template with one {{1}} body param (optional)", placeholder: "e.g. pos_bill" },
  { key: "template_lang", label: "Template Language", hint: "Language code of the template", placeholder: "en" },
  { key: "api_version", label: "API Version", hint: "Graph API version", placeholder: "v21.0" },
  { key: "default_cc", label: "Default Country Code", hint: "Prefixed to 10-digit numbers", placeholder: "91" },
];

export default function AdminWhatsApp() {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(true);
  const [tokenSet, setTokenSet] = useState(false);
  const [tokenMask, setTokenMask] = useState("");
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = () => {
    setLoading(true);
    Api.adminGetWhatsapp()
      .then((r: any) => {
        setEnabled(!!r.enabled);
        setTokenSet(!!r.access_token_set);
        setTokenMask(r.access_token || "");
        setConfigured(!!r.configured);
        setVals({
          access_token: "",
          phone_number_id: r.phone_number_id || "",
          bill_template: r.bill_template || "",
          template_lang: r.template_lang || "en",
          api_version: r.api_version || "v21.0",
          default_cc: r.default_cc || "91",
        });
      })
      .catch((e: any) => setError(e?.message || "Could not load settings"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const setField = (k: string, v: string) => { setSaved(false); setError(""); setVals((p) => ({ ...p, [k]: v })); };

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      const body: any = { enabled };
      for (const f of FIELDS) {
        if (f.key === "access_token") {
          if (vals.access_token && vals.access_token.trim()) body.access_token = vals.access_token.trim();
        } else {
          body[f.key] = (vals[f.key] || "").trim();
        }
      }
      const r: any = await Api.adminUpdateWhatsapp(body);
      setTokenSet(!!r.access_token_set);
      setTokenMask(r.access_token || "");
      setConfigured(!!r.configured);
      setVals((p) => ({ ...p, access_token: "" }));
      setSaved(true);
    } catch (e: any) {
      setError(e?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="WhatsApp Cloud API" subtitle="Credentials for sending bills over WhatsApp" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Status */}
            <View style={[styles.statusBox, { backgroundColor: configured ? colors.successSoft : colors.warningSoft }]}>
              <Ionicons name={configured ? "checkmark-circle" : "alert-circle"} size={20} color={configured ? colors.success : colors.warning} />
              <Text style={[styles.statusText, { color: configured ? colors.success : colors.warning }]}>
                {configured ? "Connected — bills will send via the WhatsApp Cloud API." : "Not configured yet — bills fall back to a wa.me click link."}
              </Text>
            </View>

            {/* Enable toggle */}
            <View style={styles.toggleRow}>
              <View style={[styles.fieldIc, { backgroundColor: "#25D36622" }]}>
                <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Enable WhatsApp sending</Text>
                <Text style={styles.fieldHint}>Turn off to always use the manual wa.me link</Text>
              </View>
              <Switch testID="whatsapp-enabled" value={enabled} onValueChange={(v) => { setEnabled(v); setSaved(false); }} trackColor={{ true: colors.primary }} />
            </View>

            {FIELDS.map((f) => (
              <View key={f.key} style={styles.fieldCard}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={styles.fieldLabel}>{f.label}</Text>
                  {f.secret && tokenSet ? <Text style={styles.savedTag}>Saved {tokenMask}</Text> : null}
                </View>
                <Text style={styles.fieldHint}>{f.hint}</Text>
                <TextInput
                  testID={`whatsapp-input-${f.key}`}
                  value={vals[f.key] ?? ""}
                  onChangeText={(v) => setField(f.key, v)}
                  placeholder={f.secret && tokenSet ? "•••••• (unchanged — type to replace)" : f.placeholder}
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={f.secret}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
              </View>
            ))}

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {saved ? (
              <View style={styles.savedBox}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={styles.savedText}>Settings saved.</Text>
              </View>
            ) : null}

            <TouchableOpacity testID="whatsapp-save" activeOpacity={0.9} disabled={saving} onPress={save} style={[styles.saveBtn, { opacity: saving ? 0.6 : 1 }]}>
              {saving ? <ActivityIndicator color={colors.onPrimary} /> : (
                <><Ionicons name="save" size={18} color={colors.onPrimary} /><Text style={styles.saveTxt}>Save Settings</Text></>
              )}
            </TouchableOpacity>

            <TouchableOpacity testID="whatsapp-docs" onPress={() => Linking.openURL("https://developers.facebook.com/docs/whatsapp/cloud-api/get-started")} style={styles.docsLink}>
              <Ionicons name="open-outline" size={14} color={colors.primary} />
              <Text style={styles.docsText}>How to get these credentials (Meta docs)</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusBox: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  statusText: { flex: 1, fontSize: 13, fontWeight: font.semi, lineHeight: 18 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md, ...shadow.card },
  fieldIc: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  fieldCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md, ...shadow.card },
  fieldLabel: { fontSize: 15, fontWeight: font.bold, color: colors.textPrimary },
  fieldHint: { fontSize: 11.5, color: colors.textSecondary, marginTop: 2, lineHeight: 15 },
  savedTag: { fontSize: 11, color: colors.success, fontWeight: font.bold },
  input: { marginTop: 10, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: colors.textPrimary },
  error: { color: colors.error, fontSize: 13, fontWeight: font.semi, marginTop: spacing.sm },
  savedBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.successSoft, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  savedText: { color: colors.textPrimary, fontSize: 13, fontWeight: font.semi },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54, borderRadius: radius.lg, marginTop: spacing.xl, backgroundColor: colors.primary, ...shadow.lifted },
  saveTxt: { fontSize: 16, fontWeight: font.black, color: colors.onPrimary },
  docsLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.lg },
  docsText: { color: colors.primary, fontWeight: font.semi, fontSize: 13 },
});
