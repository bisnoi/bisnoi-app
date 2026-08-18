import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { Button, Empty } from "@/src/components/ui";
import { Api } from "@/src/api";

type Method = { id: string; type: "card" | "upi"; last4?: string; brand?: string; name_on_card?: string; upi_id?: string; is_default?: boolean };

function detectBrand(num: string): string {
  const n = num.replace(/\D/g, "");
  if (/^4/.test(n)) return "Visa";
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return "Mastercard";
  if (/^3[47]/.test(n)) return "Amex";
  if (/^(60|65|81|82)/.test(n)) return "RuPay";
  return "Card";
}

export default function Payments() {
  const [list, setList] = useState<Method[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"upi" | "card">("upi");
  const [detail, setDetail] = useState("");
  const [cardName, setCardName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const l: any = await Api.myPaymentMethods();
      setList(Array.isArray(l) ? l : []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const add = async () => {
    setError("");
    setSaving(true);
    try {
      if (type === "card") {
        const digits = detail.replace(/\D/g, "");
        if (digits.length < 12) { setError("Enter a valid card number"); setSaving(false); return; }
        await Api.addPaymentMethod({ type: "card", last4: digits.slice(-4), brand: detectBrand(digits), name_on_card: cardName.trim() });
      } else {
        await Api.addPaymentMethod({ type: "upi", upi_id: detail.trim() });
      }
      setDetail(""); setCardName(""); setType("upi"); setOpen(false);
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try { await Api.deletePaymentMethod(id); } catch {}
    setList((p) => p.filter((m) => m.id !== id));
  };
  const makeDefault = async (id: string) => {
    try { await Api.setDefaultPaymentMethod(id); } catch {}
    setList((p) => p.map((m) => ({ ...m, is_default: m.id === id })));
  };

  const displayName = (m: Method) => (m.type === "card" ? `${m.brand || "Card"} \u2022\u2022\u2022\u2022 ${m.last4}` : m.upi_id || "UPI");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScreenHeader title="Payment Methods" subtitle="Synced to your account for quick checkout" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 112 }}>
        {!open && <Button title="Add Payment Method" icon="add" onPress={() => setOpen(true)} full testID="add-payment" />}
        {open && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>Add Method</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              {(["upi", "card"] as const).map((t) => (
                <TouchableOpacity key={t} onPress={() => { setType(t); setError(""); }} style={[styles.tag, type === t && styles.tagActive]}>
                  <Ionicons name={t === "upi" ? "phone-portrait" : "card"} size={14} color={type === t ? colors.onPrimary : colors.textSecondary} />
                  <Text style={{ color: type === t ? colors.onPrimary : colors.textSecondary, fontWeight: font.semi, fontSize: 13 }}>{t.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              testID="payment-detail"
              value={detail}
              onChangeText={setDetail}
              placeholder={type === "upi" ? "yourname@upi" : "Card number"}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoCapitalize="none"
              keyboardType={type === "card" ? "number-pad" : "default"}
            />
            {type === "card" && (
              <TextInput
                value={cardName}
                onChangeText={setCardName}
                placeholder="Name on card"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            )}
            {type === "card" && <Text style={styles.pciNote}>Only the last 4 digits are stored — payment completes securely on the gateway.</Text>}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <View style={{ flex: 1 }}><Button title="Cancel" variant="secondary" onPress={() => setOpen(false)} full /></View>
              <View style={{ flex: 1 }}><Button title={saving ? "Saving..." : "Save"} icon="checkmark" onPress={add} disabled={saving} full testID="save-payment" /></View>
            </View>
          </View>
        )}
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
        ) : list.length === 0 && !open ? (
          <Empty icon="card-outline" title="No payment methods" subtitle="Add a UPI ID or card for quick checkout" />
        ) : (
          list.map((m) => (
            <View key={m.id} style={styles.row}>
              <View style={styles.icBox}><Ionicons name={m.type === "upi" ? "phone-portrait" : "card"} size={20} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={styles.label}>{m.type.toUpperCase()}</Text>
                  {m.is_default && <View style={styles.defaultPill}><Text style={styles.defaultTxt}>DEFAULT</Text></View>}
                </View>
                <Text style={styles.detail}>{displayName(m)}</Text>
                {!!m.name_on_card && <Text style={styles.subDetail}>{m.name_on_card}</Text>}
                <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
                  {!m.is_default && <TouchableOpacity onPress={() => makeDefault(m.id)}><Text style={styles.link}>Set default</Text></TouchableOpacity>}
                  <TouchableOpacity testID={`del-payment-${m.id}`} onPress={() => remove(m.id)}><Text style={[styles.link, { color: colors.error }]}>Remove</Text></TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
        <Text style={styles.note}>Cash on Delivery is always available at checkout (when enabled by the platform).</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  form: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: 10, ...shadow.card },
  formTitle: { fontSize: 16, fontWeight: font.black, color: colors.textPrimary },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  tagActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, padding: 12, fontSize: 14, color: colors.textPrimary },
  pciNote: { fontSize: 11, color: colors.textMuted },
  error: { color: colors.error, fontSize: 13, fontWeight: font.semi },
  row: { flexDirection: "row", gap: 12, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  icBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 15, fontWeight: font.bold, color: colors.textPrimary },
  detail: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  subDetail: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  link: { fontSize: 13, fontWeight: font.bold, color: colors.primary },
  defaultPill: { backgroundColor: colors.successSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  defaultTxt: { color: colors.success, fontSize: 9, fontWeight: font.black, letterSpacing: 0.5 },
  note: { fontSize: 12, color: colors.textMuted, textAlign: "center", marginTop: spacing.md },
});
