import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ScreenHeader, Screen } from "@/src/components/ScreenHeader";
import { notify } from "@/src/utils/confirm";

type Aud = "customer" | "restaurant" | "rider";
const AUDIENCES: Aud[] = ["customer", "restaurant", "rider"];
const KEYS = [
  { key: "terms", label: "Terms & Conditions" },
  { key: "privacy", label: "Privacy Policy" },
  { key: "refund_policy", label: "Refund Policy" },
  { key: "cancellation_policy", label: "Cancellation Policy" },
  { key: "contact_us", label: "Contact Us" },
  { key: "faqs", label: "FAQs" },
  { key: "help", label: "Help & Support" },
];

export default function AdminLegalContent() {
  const [audience, setAudience] = useState<Aud>("customer");
  const [pageKey, setPageKey] = useState<string>("terms");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [doc, setDoc] = useState<any>(null);
  const [content, setContent] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");

  const loadDoc = async () => {
    setLoading(true);
    setStatus("");
    try {
      const d: any = await Api.getLegal(audience, pageKey as any);
      setDoc(d);
      setContent(JSON.parse(JSON.stringify(d.content || {})));
      setDirty(false);
    } catch (e: any) {
      setStatus(e?.message || "Could not load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDoc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, pageKey]);

  const updateContent = (updater: (c: any) => any) => {
    setContent((prev: any) => {
      const next = updater(JSON.parse(JSON.stringify(prev || {})));
      setDirty(true);
      return next;
    });
  };

  const save = async () => {
    if (!content) return;
    setSaving(true);
    setStatus("");
    try {
      const r: any = await Api.adminUpdateLegal(audience, pageKey, content);
      setDoc(r);
      setContent(JSON.parse(JSON.stringify(r.content || {})));
      setDirty(false);
      setStatus("Saved");
      setTimeout(() => setStatus(""), 2500);
    } catch (e: any) {
      setStatus(e?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async () => {
    setSaving(true);
    setStatus("");
    try {
      const r: any = await Api.adminResetLegal(audience, pageKey);
      setDoc(r);
      setContent(JSON.parse(JSON.stringify(r.content || {})));
      setDirty(false);
      setStatus("Reset to default");
      setTimeout(() => setStatus(""), 2500);
    } catch (e: any) {
      setStatus(e?.message || "Could not reset");
    } finally {
      setSaving(false);
    }
  };

  const isSections = ["terms", "privacy", "refund_policy", "cancellation_policy", "help"].includes(pageKey);
  const isFaqs = pageKey === "faqs";
  const isContact = pageKey === "contact_us";

  return (
    <Screen>
      <ScreenHeader title="Legal Content" subtitle="Edit Terms / Privacy / Refund / Cancellation / Contact / FAQs / Help per audience" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.md }}>
        {/* Audience tabs */}
        <Text style={styles.sectionLabel}>AUDIENCE</Text>
        <View style={styles.tabsRow}>
          {AUDIENCES.map((a) => (
            <TouchableOpacity
              key={a}
              style={[styles.tab, audience === a && styles.tabActive]}
              onPress={() => setAudience(a)}
            >
              <Text style={[styles.tabTxt, audience === a && styles.tabTxtActive]}>{a.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Page selector */}
        <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>PAGE</Text>
        <View style={styles.chipsWrap}>
          {KEYS.map((k) => (
            <TouchableOpacity
              key={k.key}
              style={[styles.chip, pageKey === k.key && styles.chipActive]}
              onPress={() => setPageKey(k.key)}
            >
              <Text style={[styles.chipTxt, pageKey === k.key && styles.chipTxtActive]}>{k.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <View style={{ gap: spacing.md }}>
            {/* Title */}
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Page Title</Text>
              <TextInput
                style={styles.input}
                value={content?.title || ""}
                onChangeText={(t) => updateContent((c) => ({ ...c, title: t }))}
              />
            </View>

            {/* Contact us specific */}
            {isContact && (
              <View style={styles.card}>
                <Text style={styles.fieldLabel}>Contact details</Text>
                {[
                  ["phone", "Phone number"],
                  ["email", "Email"],
                  ["whatsapp", "WhatsApp"],
                  ["address", "Address"],
                  ["hours", "Hours"],
                  ["description", "Description"],
                ].map(([k, l]) => (
                  <View key={k} style={{ marginBottom: 8 }}>
                    <Text style={styles.subLabel}>{l}</Text>
                    <TextInput
                      style={styles.input}
                      value={(content?.contact || {})[k] || ""}
                      onChangeText={(t) => updateContent((c) => ({ ...c, contact: { ...(c.contact || {}), [k]: t } }))}
                    />
                  </View>
                ))}
              </View>
            )}

            {/* FAQs specific */}
            {isFaqs && (
              <View style={{ gap: spacing.md }}>
                {(content?.faqs || []).map((f: any, i: number) => (
                  <View key={i} style={styles.card}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={styles.fieldLabel}>Q&amp;A #{i + 1}</Text>
                      <TouchableOpacity onPress={() => updateContent((c) => ({ ...c, faqs: (c.faqs || []).filter((_: any, j: number) => j !== i) }))}>
                        <Ionicons name="trash-outline" size={18} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      style={styles.input}
                      placeholder="Question"
                      placeholderTextColor={colors.textMuted}
                      value={f.q || ""}
                      onChangeText={(t) => updateContent((c) => ({ ...c, faqs: (c.faqs || []).map((x: any, j: number) => j === i ? { ...x, q: t } : x) }))}
                    />
                    <TextInput
                      style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]}
                      placeholder="Answer"
                      placeholderTextColor={colors.textMuted}
                      multiline
                      value={f.a || ""}
                      onChangeText={(t) => updateContent((c) => ({ ...c, faqs: (c.faqs || []).map((x: any, j: number) => j === i ? { ...x, a: t } : x) }))}
                    />
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => updateContent((c) => ({ ...c, faqs: [...(c.faqs || []), { q: "", a: "" }] }))}
                >
                  <Ionicons name="add" size={18} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: font.bold }}>Add FAQ</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Sections editor */}
            {isSections && (
              <View style={{ gap: spacing.md }}>
                {(content?.sections || []).map((s: any, i: number) => (
                  <View key={i} style={styles.card}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={styles.fieldLabel}>Section #{i + 1}</Text>
                      <TouchableOpacity onPress={() => updateContent((c) => ({ ...c, sections: (c.sections || []).filter((_: any, j: number) => j !== i) }))}>
                        <Ionicons name="trash-outline" size={18} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      style={styles.input}
                      placeholder="Section title"
                      placeholderTextColor={colors.textMuted}
                      value={s.title || ""}
                      onChangeText={(t) => updateContent((c) => ({ ...c, sections: (c.sections || []).map((x: any, j: number) => j === i ? { ...x, title: t } : x) }))}
                    />
                    <TextInput
                      style={[styles.input, { minHeight: 100, textAlignVertical: "top" }]}
                      placeholder="Section body"
                      placeholderTextColor={colors.textMuted}
                      multiline
                      value={s.body || ""}
                      onChangeText={(t) => updateContent((c) => ({ ...c, sections: (c.sections || []).map((x: any, j: number) => j === i ? { ...x, body: t } : x) }))}
                    />
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => updateContent((c) => ({ ...c, sections: [...(c.sections || []), { title: "", body: "" }] }))}
                >
                  <Ionicons name="add" size={18} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: font.bold }}>Add Section</Text>
                </TouchableOpacity>
              </View>
            )}

            {!!status && <Text style={{ color: status.startsWith("Sav") || status.startsWith("Res") ? colors.success : colors.error, fontSize: 13 }}>{status}</Text>}

            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <TouchableOpacity
                style={[styles.saveBtn, { flex: 1, opacity: !dirty || saving ? 0.5 : 1 }]}
                disabled={!dirty || saving}
                onPress={save}
              >
                {saving ? <ActivityIndicator color={colors.onPrimary} /> : (
                  <>
                    <Ionicons name="save-outline" size={16} color={colors.onPrimary} />
                    <Text style={styles.saveTxt}>{dirty ? "Save Changes" : "No changes"}</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, flex: 1 }]}
                disabled={saving}
                onPress={resetToDefault}
              >
                <Ionicons name="refresh-outline" size={16} color={colors.textPrimary} />
                <Text style={[styles.saveTxt, { color: colors.textPrimary }]}>Reset to Default</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.6 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 8, ...shadow.card },
  tabsRow: { flexDirection: "row", gap: 8 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  tabActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  tabTxt: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.6 },
  tabTxtActive: { color: colors.primary },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipTxt: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary },
  chipTxtActive: { color: colors.primary },
  fieldLabel: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.4, marginBottom: 4 },
  subLabel: { fontSize: 11, fontWeight: font.bold, color: colors.textMuted, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, padding: 10, fontSize: 13, color: colors.textPrimary, backgroundColor: colors.background, minHeight: 40 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 12, borderRadius: radius.md, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary + "55" },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: radius.lg, backgroundColor: colors.primary },
  saveTxt: { fontSize: 14, fontWeight: font.black, color: colors.onPrimary },
});
