import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ScreenHeader, Screen } from "@/src/components/ScreenHeader";

type Field = {
  key: string;
  label: string;
  hint: string;
  prefix?: string;
  suffix?: string;
  decimal?: boolean;
};

type Group = { title: string; icon: keyof typeof Ionicons.glyphMap; color: string; fields: Field[] };

const GROUPS: Group[] = [
  {
    title: "Admin Commission",
    icon: "trending-up",
    color: colors.primary,
    fields: [
      { key: "owner_commission_percent", label: "Owner commission", hint: "% of each order's item total charged to the restaurant owner", suffix: "%", decimal: true },
      { key: "rider_commission_percent", label: "Rider commission", hint: "% cut kept by admin from the rider's payout", suffix: "%", decimal: true },
    ],
  },
  {
    title: "Customer Delivery Charge",
    icon: "bicycle",
    color: "#0EA5E9",
    fields: [
      { key: "per_km_charge", label: "Charge per km", hint: "₹ per km added to the customer's delivery fee (per-km mode)", prefix: "₹" },
      { key: "base_delivery_fee", label: "Base delivery fee", hint: "Fixed base added before the per-km amount", prefix: "₹" },
      { key: "min_delivery_fee", label: "Minimum delivery fee", hint: "Delivery fee never goes below this", prefix: "₹" },
      { key: "delivery_charge", label: "Flat delivery fee", hint: "Used only when mode is Flat", prefix: "₹" },
      { key: "free_delivery_above", label: "Free delivery above", hint: "Waive delivery fee when item total ≥ this (0 = never)", prefix: "₹" },
    ],
  },
  {
    title: "Rider Payout (Admin pays rider)",
    icon: "wallet",
    color: colors.warning,
    fields: [
      { key: "rider_payout_per_km", label: "Payout per km", hint: "₹ per km paid to the rider for a delivery", prefix: "₹" },
      { key: "rider_base_payout", label: "Base payout", hint: "Fixed base paid per delivery", prefix: "₹" },
      { key: "rider_min_payout", label: "Minimum payout", hint: "Rider payout never goes below this", prefix: "₹" },
    ],
  },
  {
    title: "Restaurant Onboarding",
    icon: "storefront",
    color: colors.secondary,
    fields: [
      { key: "onboarding_fee", label: "One-time joining fee", hint: "Owner pays this via Razorpay when approved (0 = disabled, goes live instantly)", prefix: "₹" },
    ],
  },
  {
    title: "Other Charges",
    icon: "receipt",
    color: "#7C3AED",
    fields: [
      { key: "packing_charge", label: "Packing charge", hint: "Flat packaging fee added to every order", prefix: "₹" },
      { key: "gst_percent", label: "GST / Tax", hint: "Applied on (item total − discount)", suffix: "%", decimal: true },
    ],
  },
];

const ALL_KEYS = GROUPS.flatMap((g) => g.fields.map((f) => f.key));

export default function AdminCommission() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"per_km" | "flat">("per_km");
  const [server, setServer] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [summary, setSummary] = useState<any>(null);

  const load = () => {
    Api.adminGetPlatform()
      .then((r: any) => {
        setServer(r);
        setMode(r.delivery_mode === "per_km" ? "per_km" : "flat");
        const v: Record<string, string> = {};
        ALL_KEYS.forEach((k) => { v[k] = String(r[k] ?? 0); });
        setValues(v);
      })
      .catch((e: any) => setError(e?.message || "Could not load settings"))
      .finally(() => setLoading(false));
    Api.adminCommissionSummary().then(setSummary).catch(() => {});
  };
  useEffect(load, []);

  const setField = (k: string, v: string, decimal?: boolean) => {
    setSaved(false); setError("");
    const clean = decimal ? v.replace(/[^0-9.]/g, "") : v.replace(/[^0-9]/g, "");
    setValues((prev) => ({ ...prev, [k]: clean }));
  };

  const dirty = useMemo(() => {
    if (!server) return false;
    if ((server.delivery_mode === "per_km" ? "per_km" : "flat") !== mode) return true;
    return ALL_KEYS.some((k) => {
      const cur = parseFloat(values[k] || "0") || 0;
      return Number(server[k] ?? 0) !== cur;
    });
  }, [server, values, mode]);

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      const body: Record<string, any> = { delivery_mode: mode };
      ALL_KEYS.forEach((k) => { body[k] = parseFloat(values[k] || "0") || 0; });
      const out: any = await Api.adminPatchPlatform(body);
      setServer(out);
      setMode(out.delivery_mode === "per_km" ? "per_km" : "flat");
      const v: Record<string, string> = {};
      ALL_KEYS.forEach((k) => { v[k] = String(out[k] ?? 0); });
      setValues(v);
      setSaved(true);
      Api.adminCommissionSummary().then(setSummary).catch(() => {});
    } catch (e: any) {
      setError(e?.message || "Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Commission & Pricing" subtitle="Commission, per-km pay, onboarding fee" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 90 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Earnings summary */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>ADMIN EARNINGS (TO DATE)</Text>
              <Text style={styles.summaryBig}>₹{summary?.admin_earnings ?? 0}</Text>
              <View style={styles.summaryRow}>
                <SumChip label="Owner commission" value={`₹${summary?.owner_commission ?? 0}`} />
                <SumChip label="Rider commission" value={`₹${summary?.rider_commission ?? 0}`} />
                <SumChip label="Onboarding" value={`₹${summary?.onboarding_fees ?? 0}`} />
              </View>
              <View style={styles.summaryRow}>
                <SumChip label="Rider payouts" value={`₹${summary?.rider_payouts ?? 0}`} />
                <SumChip label="Orders" value={`${summary?.order_count ?? 0}`} />
                <SumChip label="Dine-in" value={`${summary?.dinein_count ?? 0}`} />
              </View>
            </View>

            {/* Delivery mode toggle */}
            <Text style={styles.sectionLabel}>DELIVERY FEE MODE</Text>
            <View style={styles.modeRow}>
              {(["per_km", "flat"] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  testID={`mode-${m}`}
                  activeOpacity={0.9}
                  onPress={() => { setMode(m); setSaved(false); }}
                  style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
                >
                  <Ionicons name={m === "per_km" ? "map" : "pricetag"} size={16} color={mode === m ? colors.onPrimary : colors.textSecondary} />
                  <Text style={[styles.modeTxt, mode === m && { color: colors.onPrimary }]}>{m === "per_km" ? "Per Kilometre" : "Flat Fee"}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {GROUPS.map((g) => (
              <View key={g.title}>
                <View style={styles.groupHead}>
                  <View style={[styles.groupIc, { backgroundColor: g.color + "22" }]}>
                    <Ionicons name={g.icon} size={16} color={g.color} />
                  </View>
                  <Text style={styles.groupTitle}>{g.title}</Text>
                </View>
                {g.fields.map((f) => (
                  <View key={f.key} style={styles.fieldCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>{f.label}</Text>
                      <Text style={styles.fieldHint}>{f.hint}</Text>
                    </View>
                    <View style={styles.inputWrap}>
                      {f.prefix ? <Text style={styles.affix}>{f.prefix}</Text> : null}
                      <TextInput
                        testID={`platform-input-${f.key}`}
                        value={values[f.key] ?? ""}
                        onChangeText={(v) => setField(f.key, v, f.decimal)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        style={styles.input}
                      />
                      {f.suffix ? <Text style={styles.affix}>{f.suffix}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            ))}

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {saved && !dirty ? (
              <View style={styles.savedBox}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={styles.savedText}>Saved — live across the app now.</Text>
              </View>
            ) : null}

            <TouchableOpacity
              testID="platform-save"
              activeOpacity={0.9}
              disabled={!dirty || saving}
              onPress={save}
              style={[styles.saveBtn, { opacity: !dirty || saving ? 0.5 : 1 }]}
            >
              {saving ? <ActivityIndicator color={colors.onPrimary} /> : (
                <>
                  <Ionicons name="save" size={18} color={colors.onPrimary} />
                  <Text style={styles.saveTxt}>{dirty ? "Save Settings" : "Saved"}</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function SumChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.sumChip}>
      <Text style={styles.sumVal}>{value}</Text>
      <Text style={styles.sumLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryCard: { backgroundColor: colors.textPrimary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, ...shadow.lifted },
  summaryTitle: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: font.black, letterSpacing: 0.6 },
  summaryBig: { color: "#fff", fontSize: 32, fontWeight: font.black, marginTop: 2, marginBottom: spacing.sm },
  summaryRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  sumChip: { flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 8 },
  sumVal: { color: "#fff", fontSize: 15, fontWeight: font.black },
  sumLbl: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: font.semi, marginTop: 2 },

  sectionLabel: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.6, marginBottom: spacing.sm },
  modeRow: { flexDirection: "row", gap: 10, marginBottom: spacing.lg },
  modeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  modeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeTxt: { fontSize: 14, fontWeight: font.bold, color: colors.textSecondary },

  groupHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md, marginBottom: spacing.sm },
  groupIc: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  groupTitle: { fontSize: 14, fontWeight: font.black, color: colors.textPrimary },

  fieldCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm, ...shadow.card },
  fieldLabel: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary },
  fieldHint: { fontSize: 11, color: colors.textSecondary, marginTop: 2, lineHeight: 15 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 10, minWidth: 90 },
  affix: { fontSize: 15, fontWeight: font.black, color: colors.textSecondary },
  input: { minWidth: 44, paddingVertical: 10, fontSize: 16, fontWeight: font.black, color: colors.textPrimary, textAlign: "center" },

  error: { color: colors.error, fontSize: 13, fontWeight: font.semi, marginTop: spacing.md },
  savedBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.successSoft, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  savedText: { color: colors.textPrimary, fontSize: 13, fontWeight: font.semi },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54, borderRadius: radius.lg, marginTop: spacing.xl, backgroundColor: colors.primary, ...shadow.lifted },
  saveTxt: { fontSize: 16, fontWeight: font.black, color: colors.onPrimary },
});
