import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ScreenHeader, Screen } from "@/src/components/ScreenHeader";
import { computeBill, normalizeCharges, type Charges } from "@/src/utils/charges";

type Field = {
  key: keyof Charges;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  prefix?: string;
  suffix?: string;
};

const FIELDS: Field[] = [
  { key: "delivery_charge", label: "Delivery Charge", hint: "Flat fee added to every delivery order", icon: "bicycle", prefix: "₹" },
  { key: "free_delivery_above", label: "Free Delivery Above", hint: "Waive delivery fee when item total ≥ this (0 = never)", icon: "gift", prefix: "₹" },
  { key: "packing_charge", label: "Packing Charge", hint: "Flat packaging fee added to every order", icon: "cube", prefix: "₹" },
  { key: "gst_percent", label: "GST / Tax", hint: "Applied on (item total − discount)", icon: "receipt", suffix: "%" },
];

const PREVIEW_SUBTOTAL = 500;

export default function AdminCharges() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [server, setServer] = useState<Charges | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Api.getCharges()
      .then((r: any) => {
        const c = normalizeCharges(r);
        setServer(c);
        setValues({
          delivery_charge: String(c.delivery_charge),
          free_delivery_above: String(c.free_delivery_above),
          packing_charge: String(c.packing_charge),
          gst_percent: String(c.gst_percent),
        });
      })
      .catch((e: any) => setError(e?.message || "Could not load charges"))
      .finally(() => setLoading(false));
  }, []);

  const parsed: Charges = normalizeCharges({
    delivery_charge: parseFloat(values.delivery_charge) || 0,
    free_delivery_above: parseFloat(values.free_delivery_above) || 0,
    packing_charge: parseFloat(values.packing_charge) || 0,
    gst_percent: parseFloat(values.gst_percent) || 0,
  });

  const dirty = !!server && (
    server.delivery_charge !== parsed.delivery_charge ||
    server.free_delivery_above !== parsed.free_delivery_above ||
    server.packing_charge !== parsed.packing_charge ||
    server.gst_percent !== parsed.gst_percent
  );

  const preview = computeBill(PREVIEW_SUBTOTAL, 0, parsed);

  const setField = (k: string, v: string) => {
    setSaved(false);
    setError("");
    // allow digits + single dot for gst
    const clean = k === "gst_percent" ? v.replace(/[^0-9.]/g, "") : v.replace(/[^0-9]/g, "");
    setValues((prev) => ({ ...prev, [k]: clean }));
  };

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const out: any = await Api.adminUpdateCharges({
        delivery_charge: parsed.delivery_charge,
        free_delivery_above: parsed.free_delivery_above,
        packing_charge: parsed.packing_charge,
        gst_percent: parsed.gst_percent,
      });
      const c = normalizeCharges(out);
      setServer(c);
      setValues({
        delivery_charge: String(c.delivery_charge),
        free_delivery_above: String(c.free_delivery_above),
        packing_charge: String(c.packing_charge),
        gst_percent: String(c.gst_percent),
      });
      setSaved(true);
    } catch (e: any) {
      setError(e?.message || "Could not save charges");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Charges & Taxes" subtitle="Delivery, packing & GST applied at checkout" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={18} color={colors.primary} />
              <Text style={styles.infoText}>
                These charges apply to every customer order across the app. Customers see this breakdown on the cart & checkout bill.
              </Text>
            </View>

            {FIELDS.map((f) => (
              <View key={f.key} style={styles.fieldCard}>
                <View style={[styles.fieldIc, { backgroundColor: colors.primarySoft }]}>
                  <Ionicons name={f.icon} size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>{f.label}</Text>
                  <Text style={styles.fieldHint}>{f.hint}</Text>
                </View>
                <View style={styles.inputWrap}>
                  {f.prefix ? <Text style={styles.affix}>{f.prefix}</Text> : null}
                  <TextInput
                    testID={`charge-input-${f.key}`}
                    value={values[f.key as string] ?? ""}
                    onChangeText={(v) => setField(f.key as string, v)}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                  />
                  {f.suffix ? <Text style={styles.affix}>{f.suffix}</Text> : null}
                </View>
              </View>
            ))}

            {/* Live preview */}
            <Text style={styles.sectionLabel}>LIVE PREVIEW (₹{PREVIEW_SUBTOTAL} ORDER)</Text>
            <View style={styles.previewCard}>
              <Row label="Item total" value={`₹${preview.subtotal}`} />
              <Row label="Delivery fee" value={preview.delivery_fee === 0 ? "FREE" : `₹${preview.delivery_fee}`} />
              <Row label="Packing charge" value={`₹${preview.packing_charge}`} />
              <Row label={`GST (${preview.gst_percent}%)`} value={`₹${preview.gst_amount}`} />
              <View style={styles.divider} />
              <Row label="To pay" value={`₹${preview.total}`} bold />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {saved && !dirty ? (
              <View style={styles.savedBox}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={styles.savedText}>Charges saved — live for all customers now.</Text>
              </View>
            ) : null}

            <TouchableOpacity
              testID="charges-save"
              activeOpacity={0.9}
              disabled={!dirty || saving}
              onPress={save}
              style={[styles.saveBtn, { opacity: !dirty || saving ? 0.5 : 1 }]}
            >
              {saving ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <>
                  <Ionicons name="save" size={18} color={colors.onPrimary} />
                  <Text style={styles.saveTxt}>{dirty ? "Save Charges" : "Saved"}</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: bold ? font.bold : font.reg }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, fontSize: bold ? 16 : 14, fontWeight: bold ? font.black : font.semi }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  infoText: { flex: 1, fontSize: 12, color: colors.textPrimary, lineHeight: 18 },

  fieldCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md, ...shadow.card },
  fieldIc: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  fieldLabel: { fontSize: 15, fontWeight: font.bold, color: colors.textPrimary },
  fieldHint: { fontSize: 11, color: colors.textSecondary, marginTop: 2, lineHeight: 15 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 10, minWidth: 86 },
  affix: { fontSize: 15, fontWeight: font.black, color: colors.textSecondary },
  input: { minWidth: 40, paddingVertical: 10, fontSize: 16, fontWeight: font.black, color: colors.textPrimary, textAlign: "center" },

  sectionLabel: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.6, marginTop: spacing.md, marginBottom: spacing.sm },
  previewCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.card },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },

  error: { color: colors.error, fontSize: 13, fontWeight: font.semi, marginTop: spacing.md },
  savedBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.successSoft, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  savedText: { color: colors.textPrimary, fontSize: 13, fontWeight: font.semi },

  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54, borderRadius: radius.lg, marginTop: spacing.xl, backgroundColor: colors.primary, ...shadow.lifted },
  saveTxt: { fontSize: 16, fontWeight: font.black, color: colors.onPrimary },
});
