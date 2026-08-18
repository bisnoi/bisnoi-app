import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ScreenHeader, Screen } from "@/src/components/ScreenHeader";

type Rules = {
  auto_disable_enabled?: boolean;
  min_orders_for_auto_rule?: number;
  cancel_rate_threshold_pct?: number;
  rto_count_threshold?: number;
  lookback_days?: number;
};

export default function AdminCodRules() {
  const [rules, setRules] = useState<Rules | null>(null);
  const [server, setServer] = useState<Rules | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const load = async () => {
    try {
      const r: any = await Api.adminGetCodRules();
      setRules({ ...r }); setServer({ ...r });
    } catch (e: any) { setStatus(e?.message || "Could not load"); }
  };
  useEffect(() => { load(); }, []);

  const dirty = !!rules && !!server && JSON.stringify(rules) !== JSON.stringify(server);

  const save = async () => {
    if (!rules) return;
    setSaving(true); setStatus("");
    try {
      const r: any = await Api.adminUpdateCodRules(rules);
      setRules({ ...r }); setServer({ ...r });
      setStatus("Saved"); setTimeout(() => setStatus(""), 2500);
    } catch (e: any) { setStatus(e?.message || "Could not save"); }
    finally { setSaving(false); }
  };

  return (
    <Screen>
      <ScreenHeader title="COD Auto-Rules" subtitle="Rules that decide when Cash on Delivery is auto-disabled per customer" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.md }}>
        {!rules ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : (
          <>
            <View style={styles.card}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Auto-disable COD</Text>
                  <Text style={styles.hint}>When ON, COD is auto-blocked for customers who breach any rule below.</Text>
                </View>
                <Switch
                  value={!!rules.auto_disable_enabled}
                  onValueChange={(v) => setRules({ ...rules, auto_disable_enabled: v })}
                  trackColor={{ true: colors.primary, false: colors.borderStrong }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            <Field label="Lookback (days)" hint="Window for computing cancel-rate & RTO" value={rules.lookback_days} onChange={(v) => setRules({ ...rules, lookback_days: v })} />
            <Field label="Minimum orders for auto rule" hint="Only apply cancel-rate rule after N orders in the window" value={rules.min_orders_for_auto_rule} onChange={(v) => setRules({ ...rules, min_orders_for_auto_rule: v })} />
            <Field label="Cancel-rate threshold (%)" hint="Cancel-rate ABOVE this in the window blocks COD" value={rules.cancel_rate_threshold_pct} onChange={(v) => setRules({ ...rules, cancel_rate_threshold_pct: v })} />
            <Field label="RTO count threshold" hint="Return-to-Origin count AT-OR-ABOVE this blocks COD" value={rules.rto_count_threshold} onChange={(v) => setRules({ ...rules, rto_count_threshold: v })} />

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

function Field({ label, hint, value, onChange }: { label: string; hint: string; value: any; onChange: (n: number | undefined) => void }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>{hint}</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={value === undefined ? "" : String(value)}
        onChangeText={(t) => onChange(t === "" ? undefined : Number(t))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.card },
  label: { fontSize: 13, fontWeight: font.bold, color: colors.textPrimary },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  input: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, padding: 10, fontSize: 14, color: colors.textPrimary, backgroundColor: colors.background, marginTop: 6 },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: radius.lg, backgroundColor: colors.primary, marginTop: spacing.md },
  saveTxt: { fontSize: 14, fontWeight: font.black, color: colors.onPrimary },
});
