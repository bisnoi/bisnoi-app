import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Switch, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ScreenHeader, Screen } from "@/src/components/ScreenHeader";

type Settings = {
  cancellation_policy_enabled: boolean;
  cancellation_policy_text: string;
  cod_enabled: boolean;
  online_enabled: boolean;
  cards_enabled: boolean;
  upi_enabled: boolean;
  wallets_enabled: boolean;
  paylater_enabled: boolean;
};

const TOGGLES: { key: keyof Settings; label: string; sub: string; icon: any }[] = [
  { key: "online_enabled", label: "Online payments", sub: "Master switch for all online payment options", icon: "globe-outline" },
  { key: "cards_enabled", label: "Cards section", sub: "Credit / debit cards (add & saved cards)", icon: "card-outline" },
  { key: "upi_enabled", label: "UPI section", sub: "PhonePe, Paytm, Amazon Pay + custom UPI IDs", icon: "phone-portrait-outline" },
  { key: "wallets_enabled", label: "Wallets section", sub: "Amazon Pay Balance, Mobikwik", icon: "wallet-outline" },
  { key: "paylater_enabled", label: "Pay Later section", sub: "Simpl, LazyPay", icon: "time-outline" },
  { key: "cod_enabled", label: "Cash on Delivery", sub: "Pay on delivery option", icon: "cash-outline" },
];

export default function AdminCheckoutSettings() {
  const [s, setS] = useState<Settings | null>(null);
  const [serverS, setServerS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Api.checkoutSettings()
      .then((r: any) => { setS(r); setServerS(r); })
      .catch(() => setError("Could not load settings"));
  }, []);

  const dirty = !!s && !!serverS && JSON.stringify(s) !== JSON.stringify(serverS);

  const toggle = (key: keyof Settings) => {
    if (!s) return;
    setS({ ...s, [key]: !s[key] } as Settings);
  };

  const save = async () => {
    if (!s || saving) return;
    setSaving(true);
    setError("");
    try {
      const r: any = await Api.adminSetCheckoutSettings(s);
      setS(r);
      setServerS(r);
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 2500);
    } catch (e: any) {
      setError(e?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Checkout Settings" subtitle="Control what customers see on checkout" />
      {!s ? (
        <View style={{ padding: 40, alignItems: "center" }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
          {/* Cancellation policy */}
          <Text style={styles.sectionLabel}>CANCELLATION POLICY</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Show on checkout page</Text>
                <Text style={styles.rowSub}>Displayed above the Place Order bar</Text>
              </View>
              <Switch
                value={s.cancellation_policy_enabled}
                onValueChange={() => toggle("cancellation_policy_enabled")}
                trackColor={{ true: colors.primary, false: colors.borderStrong }}
                thumbColor="#fff"
                testID="toggle-cancellation-policy"
              />
            </View>
            <TextInput
              value={s.cancellation_policy_text}
              onChangeText={(t) => setS({ ...s, cancellation_policy_text: t })}
              multiline
              placeholder="Cancellation policy text shown to customers"
              placeholderTextColor={colors.textMuted}
              style={styles.textarea}
              testID="cancellation-policy-input"
            />
          </View>

          {/* Payment options */}
          <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>PAYMENT OPTIONS ON CHECKOUT</Text>
          <View style={styles.card}>
            {TOGGLES.map((t, i) => (
              <View key={t.key} style={[styles.switchRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12 }]}>
                <View style={styles.icBox}><Ionicons name={t.icon} size={18} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{t.label}</Text>
                  <Text style={styles.rowSub}>{t.sub}</Text>
                </View>
                <Switch
                  value={!!s[t.key]}
                  onValueChange={() => toggle(t.key)}
                  trackColor={{ true: colors.primary, false: colors.borderStrong }}
                  thumbColor="#fff"
                  testID={`toggle-${t.key}`}
                />
              </View>
            ))}
          </View>
          <Text style={styles.note}>
            Card / UPI / Wallet / Pay Later selections route through the secure Razorpay gateway at payment time.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.saveBtn, { opacity: !dirty || saving ? 0.5 : 1 }]}
            disabled={!dirty || saving}
            onPress={save}
            activeOpacity={0.9}
            testID="save-checkout-settings"
          >
            {saving ? <ActivityIndicator color={colors.onPrimary} /> : (
              <>
                <Ionicons name={savedTick ? "checkmark-circle" : "save-outline"} size={18} color={colors.onPrimary} />
                <Text style={styles.saveTxt}>{savedTick ? "Saved" : dirty ? "Save Settings" : "No changes"}</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.6, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 10, ...shadow.card },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  icBox: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  textarea: {
    minHeight: 90, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderStrong,
    borderRadius: radius.md, padding: 12, fontSize: 13, color: colors.textPrimary, textAlignVertical: "top",
  },
  note: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 17 },
  error: { color: colors.error, fontSize: 13, fontWeight: font.semi, marginTop: spacing.md },
  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52,
    borderRadius: radius.lg, marginTop: spacing.xl, backgroundColor: colors.primary, ...shadow.lifted,
  },
  saveTxt: { fontSize: 15, fontWeight: font.black, color: colors.onPrimary },
});
