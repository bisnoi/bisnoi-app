import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ScreenHeader, Screen } from "@/src/components/ScreenHeader";

type Rules = Record<string, number | undefined>;

const FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "free_cancel_window_seconds", label: "Free-cancel window (seconds)", hint: "Within this time after placing, customer gets 100% refund" },
  { key: "before_pickup_customer_refund_pct", label: "Before-pickup refund %", hint: "Customer refund % when cancelled before rider pickup" },
  { key: "after_pickup_customer_refund_pct", label: "After-pickup refund %", hint: "Customer refund % when cancelled after pickup (usually 0)" },
  { key: "restaurant_score_high_threshold", label: "Score threshold: High", hint: "\u2265 this score \u2192 restaurant absorbs 0% (platform takes)" },
  { key: "restaurant_score_mid_threshold", label: "Score threshold: Mid", hint: "\u2265 this score \u2192 restaurant absorbs 50%" },
  { key: "restaurant_share_high_pct", label: "Restaurant share % (High band)", hint: "Score \u2265 High threshold" },
  { key: "restaurant_share_mid_pct", label: "Restaurant share % (Mid band)", hint: "Between mid and high threshold" },
  { key: "restaurant_share_low_pct", label: "Restaurant share % (Low band)", hint: "Below mid threshold" },
  { key: "weight_mark_ready", label: "Score weight: Mark-Ready", hint: "Weight in composite score (0\u2013100)" },
  { key: "weight_handover", label: "Score weight: On-Time Handover", hint: "Weight in composite score" },
  { key: "weight_availability", label: "Score weight: Availability", hint: "Weight in composite score" },
  { key: "target_mark_ready_seconds", label: "Target mark-ready (seconds)", hint: "SLA for order acceptance \u2192 ready" },
  { key: "target_handover_seconds", label: "Target handover (seconds)", hint: "Ready \u2192 rider picked SLA" },
  { key: "rider_penalty_after_pickup", label: "Rider penalty (after pickup, \u20B9)", hint: "Applied when rider cancels after pickup" },
  { key: "rider_penalty_before_pickup", label: "Rider penalty (before pickup, \u20B9)", hint: "Applied when rider cancels before pickup" },
];

export default function AdminCancellationRules() {
  const [rules, setRules] = useState<Rules | null>(null);
  const [server, setServer] = useState<Rules | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const load = async () => {
    try {
      const r: any = await Api.adminGetCancellationRules();
      setRules({ ...r });
      setServer({ ...r });
    } catch (e: any) {
      setStatus(e?.message || "Could not load");
    }
  };
  useEffect(() => { load(); }, []);

  const dirty = !!rules && !!server && FIELDS.some((f) => (rules[f.key] ?? "") !== (server[f.key] ?? ""));

  const save = async () => {
    if (!rules) return;
    setSaving(true);
    setStatus("");
    try {
      const body: any = {};
      FIELDS.forEach((f) => {
        if (rules[f.key] !== undefined) body[f.key] = Number(rules[f.key]);
      });
      const r: any = await Api.adminUpdateCancellationRules(body);
      setRules({ ...r });
      setServer({ ...r });
      setStatus("Saved");
      setTimeout(() => setStatus(""), 2500);
    } catch (e: any) {
      setStatus(e?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  // Preview outcome text
  const previewText = rules ? previewOutcome(rules) : "";

  return (
    <Screen>
      <ScreenHeader title="Cancellation Rules" subtitle="Configure refund %, phase timing, restaurant score bands" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.md }}>
        {!rules ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={styles.previewCard}>
              <Text style={styles.previewLabel}>PREVIEW</Text>
              <Text style={styles.previewTxt}>{previewText}</Text>
            </View>
            {FIELDS.map((f) => (
              <View key={f.key} style={styles.card}>
                <Text style={styles.label}>{f.label}</Text>
                <Text style={styles.hint}>{f.hint}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={rules[f.key] === undefined ? "" : String(rules[f.key])}
                  onChangeText={(t) => setRules({ ...rules, [f.key]: t === "" ? undefined : Number(t) })}
                />
              </View>
            ))}
            {!!status && <Text style={{ color: status === "Saved" ? colors.success : colors.error, fontSize: 13 }}>{status}</Text>}
            <TouchableOpacity
              style={[styles.saveBtn, { opacity: !dirty || saving ? 0.5 : 1 }]}
              disabled={!dirty || saving}
              onPress={save}
            >
              {saving ? <ActivityIndicator color={colors.onPrimary} /> : (
                <>
                  <Ionicons name="save-outline" size={16} color={colors.onPrimary} />
                  <Text style={styles.saveTxt}>{dirty ? "Save Rules" : "No changes"}</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function previewOutcome(r: any): string {
  const w = Number(r.free_cancel_window_seconds || 60);
  const beforePct = Number(r.before_pickup_customer_refund_pct || 0);
  const afterPct = Number(r.after_pickup_customer_refund_pct || 0);
  const hi = Number(r.restaurant_score_high_threshold || 80);
  const mi = Number(r.restaurant_score_mid_threshold || 60);
  return `Within ${w}s \u2192 100% refund (customer)\nBefore pickup \u2192 ${beforePct}% refund\nAfter pickup \u2192 ${afterPct}% refund\nRestaurant refund share: score \u2265${hi} \u2192 ${r.restaurant_share_high_pct || 0}%, \u2265${mi} \u2192 ${r.restaurant_share_mid_pct || 50}%, else \u2192 ${r.restaurant_share_low_pct || 100}%`;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.card },
  label: { fontSize: 13, fontWeight: font.bold, color: colors.textPrimary },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  input: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, padding: 10, fontSize: 14, color: colors.textPrimary, backgroundColor: colors.background, marginTop: 6 },
  previewCard: { backgroundColor: colors.primarySoft, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, padding: spacing.md },
  previewLabel: { fontSize: 11, fontWeight: font.black, letterSpacing: 0.6, color: colors.primary },
  previewTxt: { fontSize: 13, color: colors.textPrimary, marginTop: 6, lineHeight: 20 },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: radius.lg, backgroundColor: colors.primary, marginTop: spacing.md },
  saveTxt: { fontSize: 14, fontWeight: font.black, color: colors.onPrimary },
});
