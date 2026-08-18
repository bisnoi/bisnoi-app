import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView,
  Animated, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";

export type PaySelection = {
  kind: "cod" | "online";
  label: string;
  sub?: string;
  icon: string; // Ionicons name
};

export type CheckoutSettings = {
  cancellation_policy_enabled: boolean;
  cancellation_policy_text: string;
  cod_enabled: boolean;
  online_enabled: boolean;
  cards_enabled: boolean;
  upi_enabled: boolean;
  wallets_enabled: boolean;
  paylater_enabled: boolean;
};

type SavedMethod = {
  id: string; type: "card" | "upi";
  last4?: string; brand?: string; name_on_card?: string; upi_id?: string; is_default?: boolean;
};

const UPI_APPS = [
  { key: "phonepe", label: "PhonePe UPI", color: "#5F259F", initial: "\u092A" },
  { key: "paytm", label: "Paytm UPI", color: "#00B9F1", initial: "P" },
  { key: "amazonpay-upi", label: "Amazon Pay UPI", color: "#232F3E", initial: "a" },
];
const WALLETS = [
  { key: "amazon-balance", label: "Amazon Pay Balance", color: "#232F3E", initial: "a" },
  { key: "mobikwik", label: "Mobikwik", color: "#2D4C9B", initial: "M" },
];
const PAY_LATER = [
  { key: "simpl", label: "Simpl", color: "#00A2FF", initial: "S" },
  { key: "lazypay", label: "LazyPay", color: "#7B2FF7", initial: "L" },
];

function detectBrand(num: string): string {
  const n = num.replace(/\D/g, "");
  if (/^4/.test(n)) return "Visa";
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return "Mastercard";
  if (/^3[47]/.test(n)) return "Amex";
  if (/^(60|65|81|82)/.test(n)) return "RuPay";
  return "Card";
}

export default function PaymentSheet({
  visible, onClose, settings, gatewayEnabled, selected, onSelect,
  codAvailable = true, codReason = null,
}: {
  visible: boolean;
  onClose: () => void;
  settings: CheckoutSettings;
  gatewayEnabled: boolean;
  selected: PaySelection | null;
  onSelect: (sel: PaySelection) => void;
  codAvailable?: boolean;
  codReason?: string | null;
}) {
  const slide = useRef(new Animated.Value(0)).current;
  const [methods, setMethods] = useState<SavedMethod[]>([]);
  const [loading, setLoading] = useState(false);

  // add-card form
  const [cardOpen, setCardOpen] = useState(false);
  const [cardNum, setCardNum] = useState("");
  const [cardName, setCardName] = useState("");
  const [savingCard, setSavingCard] = useState(false);
  // add-upi form
  const [upiOpen, setUpiOpen] = useState(false);
  const [upiId, setUpiId] = useState("");
  const [savingUpi, setSavingUpi] = useState(false);
  const [error, setError] = useState("");

  const onlineOk = settings.online_enabled && gatewayEnabled;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list: any = await Api.myPaymentMethods();
      setMethods(Array.isArray(list) ? list : []);
    } catch {
      setMethods([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setError("");
      load();
      slide.setValue(0);
      Animated.spring(slide, { toValue: 1, useNativeDriver: true, damping: 20, stiffness: 170 }).start();
    }
  }, [visible, load, slide]);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [560, 0] });

  const savedCards = useMemo(() => methods.filter((m) => m.type === "card"), [methods]);
  const savedUpis = useMemo(() => methods.filter((m) => m.type === "upi"), [methods]);

  const pick = (sel: PaySelection) => { onSelect(sel); onClose(); };

  const saveCard = async () => {
    const digits = cardNum.replace(/\D/g, "");
    if (digits.length < 12) { setError("Enter a valid card number"); return; }
    setSavingCard(true);
    setError("");
    try {
      const pm: any = await Api.addPaymentMethod({
        type: "card", last4: digits.slice(-4), brand: detectBrand(digits), name_on_card: cardName.trim(),
      });
      setCardNum(""); setCardName(""); setCardOpen(false);
      await load();
      pick({ kind: "online", label: `${pm.brand} \u2022\u2022\u2022\u2022 ${pm.last4}`, sub: "Card", icon: "card" });
    } catch (e: any) {
      setError(e?.message || "Could not save card");
    } finally {
      setSavingCard(false);
    }
  };

  const saveUpi = async () => {
    setSavingUpi(true);
    setError("");
    try {
      const pm: any = await Api.addPaymentMethod({ type: "upi", upi_id: upiId.trim() });
      setUpiId(""); setUpiOpen(false);
      await load();
      pick({ kind: "online", label: pm.upi_id, sub: "UPI", icon: "phone-portrait" });
    } catch (e: any) {
      setError(e?.message || "Could not save UPI ID");
    } finally {
      setSavingUpi(false);
    }
  };

  const removeMethod = async (id: string) => {
    try { await Api.deletePaymentMethod(id); } catch {}
    setMethods((p) => p.filter((m) => m.id !== id));
  };

  const isSel = (label: string) => selected?.label === label;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]} testID="payment-sheet">
          {/* header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} testID="payment-sheet-close">
              <Ionicons name="chevron-down" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Payment settings</Text>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
            {!onlineOk && (
              <View style={styles.warnBox}>
                <Ionicons name="information-circle" size={16} color={colors.warning} />
                <Text style={styles.warnTxt}>Online payments are currently unavailable. Please use Pay on Delivery.</Text>
              </View>
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            {/* ---------------- CARDS ---------------- */}
            {settings.cards_enabled && (
              <>
                <Text style={styles.sectionLabel}>C A R D S</Text>
                <View style={styles.group}>
                  <TouchableOpacity
                    style={styles.rowItem}
                    activeOpacity={0.8}
                    disabled={!onlineOk}
                    onPress={() => { setCardOpen((s) => !s); setUpiOpen(false); setError(""); }}
                    testID="add-card-row"
                  >
                    <View style={styles.iconBox}><Ionicons name="card-outline" size={20} color={colors.textPrimary} /></View>
                    <Text style={[styles.rowLabel, !onlineOk && styles.disabledTxt]}>Add credit or debit cards</Text>
                    <Ionicons name={cardOpen ? "remove" : "add"} size={20} color={onlineOk ? colors.success : colors.textMuted} />
                  </TouchableOpacity>

                  {cardOpen && (
                    <View style={styles.addForm}>
                      <TextInput
                        value={cardNum}
                        onChangeText={(t) => setCardNum(t.replace(/[^\d ]/g, "").slice(0, 19))}
                        placeholder="Card number"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                        style={styles.input}
                        testID="card-number-input"
                      />
                      <TextInput
                        value={cardName}
                        onChangeText={setCardName}
                        placeholder="Name on card"
                        placeholderTextColor={colors.textMuted}
                        style={styles.input}
                        testID="card-name-input"
                      />
                      <Text style={styles.pciNote}>We store only the last 4 digits — payment completes securely on the gateway.</Text>
                      <TouchableOpacity style={styles.saveBtn} onPress={saveCard} disabled={savingCard} testID="save-card-btn">
                        {savingCard ? <ActivityIndicator color={colors.onPrimary} size="small" /> : <Text style={styles.saveTxt}>Save card</Text>}
                      </TouchableOpacity>
                    </View>
                  )}

                  {savedCards.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.rowItem}
                      activeOpacity={0.8}
                      disabled={!onlineOk}
                      onPress={() => pick({ kind: "online", label: `${c.brand} \u2022\u2022\u2022\u2022 ${c.last4}`, sub: "Card", icon: "card" })}
                      testID={`saved-card-${c.id}`}
                    >
                      <View style={styles.iconBox}><Ionicons name="card" size={20} color={colors.primary} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowLabel, !onlineOk && styles.disabledTxt]}>{c.brand} {"\u2022\u2022\u2022\u2022"} {c.last4}</Text>
                        {!!c.name_on_card && <Text style={styles.rowSub}>{c.name_on_card}</Text>}
                      </View>
                      <TouchableOpacity onPress={() => removeMethod(c.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                      <Radio on={isSel(`${c.brand} \u2022\u2022\u2022\u2022 ${c.last4}`)} />
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* ---------------- UPI ---------------- */}
            {settings.upi_enabled && (
              <>
                <Text style={styles.sectionLabel}>U P I</Text>
                <View style={styles.group}>
                  {UPI_APPS.map((u) => (
                    <TouchableOpacity
                      key={u.key}
                      style={styles.rowItem}
                      activeOpacity={0.8}
                      disabled={!onlineOk}
                      onPress={() => pick({ kind: "online", label: u.label, sub: "UPI", icon: "phone-portrait" })}
                      testID={`upi-${u.key}`}
                    >
                      <View style={[styles.brandBox, { backgroundColor: u.color }]}><Text style={styles.brandTxt}>{u.initial}</Text></View>
                      <Text style={[styles.rowLabel, { flex: 1 }, !onlineOk && styles.disabledTxt]}>{u.label}</Text>
                      <Radio on={isSel(u.label)} />
                    </TouchableOpacity>
                  ))}

                  {savedUpis.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={styles.rowItem}
                      activeOpacity={0.8}
                      disabled={!onlineOk}
                      onPress={() => pick({ kind: "online", label: m.upi_id || "UPI", sub: "UPI", icon: "phone-portrait" })}
                      testID={`saved-upi-${m.id}`}
                    >
                      <View style={styles.iconBox}><Ionicons name="at" size={18} color={colors.primary} /></View>
                      <Text style={[styles.rowLabel, { flex: 1 }, !onlineOk && styles.disabledTxt]}>{m.upi_id}</Text>
                      <TouchableOpacity onPress={() => removeMethod(m.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                      <Radio on={isSel(m.upi_id || "UPI")} />
                    </TouchableOpacity>
                  ))}

                  <TouchableOpacity
                    style={styles.rowItem}
                    activeOpacity={0.8}
                    disabled={!onlineOk}
                    onPress={() => { setUpiOpen((s) => !s); setCardOpen(false); setError(""); }}
                    testID="add-upi-row"
                  >
                    <View style={styles.iconBox}><Ionicons name="add-circle-outline" size={20} color={colors.textPrimary} /></View>
                    <Text style={[styles.rowLabel, { flex: 1 }, !onlineOk && styles.disabledTxt]}>Add new UPI ID</Text>
                    <Ionicons name={upiOpen ? "remove" : "add"} size={20} color={onlineOk ? colors.success : colors.textMuted} />
                  </TouchableOpacity>

                  {upiOpen && (
                    <View style={styles.addForm}>
                      <TextInput
                        value={upiId}
                        onChangeText={setUpiId}
                        placeholder="yourname@upi"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                        style={styles.input}
                        testID="upi-id-input"
                      />
                      <TouchableOpacity style={styles.saveBtn} onPress={saveUpi} disabled={savingUpi} testID="save-upi-btn">
                        {savingUpi ? <ActivityIndicator color={colors.onPrimary} size="small" /> : <Text style={styles.saveTxt}>Save UPI ID</Text>}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </>
            )}

            {/* ---------------- WALLETS ---------------- */}
            {settings.wallets_enabled && (
              <>
                <Text style={styles.sectionLabel}>W A L L E T S</Text>
                <View style={styles.group}>
                  {WALLETS.map((w) => (
                    <TouchableOpacity
                      key={w.key}
                      style={styles.rowItem}
                      activeOpacity={0.8}
                      disabled={!onlineOk}
                      onPress={() => pick({ kind: "online", label: w.label, sub: "Wallet", icon: "wallet" })}
                      testID={`wallet-${w.key}`}
                    >
                      <View style={[styles.brandBox, { backgroundColor: w.color }]}><Text style={styles.brandTxt}>{w.initial}</Text></View>
                      <Text style={[styles.rowLabel, { flex: 1 }, !onlineOk && styles.disabledTxt]}>{w.label}</Text>
                      <Radio on={isSel(w.label)} />
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* ---------------- PAY LATER ---------------- */}
            {settings.paylater_enabled && (
              <>
                <Text style={styles.sectionLabel}>P A Y   L A T E R</Text>
                <View style={styles.group}>
                  {PAY_LATER.map((p) => (
                    <TouchableOpacity
                      key={p.key}
                      style={styles.rowItem}
                      activeOpacity={0.8}
                      disabled={!onlineOk}
                      onPress={() => pick({ kind: "online", label: p.label, sub: "Pay Later", icon: "time" })}
                      testID={`paylater-${p.key}`}
                    >
                      <View style={[styles.brandBox, { backgroundColor: p.color }]}><Text style={styles.brandTxt}>{p.initial}</Text></View>
                      <Text style={[styles.rowLabel, { flex: 1 }, !onlineOk && styles.disabledTxt]}>{p.label}</Text>
                      <Radio on={isSel(p.label)} />
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* ---------------- PAY ON DELIVERY ---------------- */}
            {settings.cod_enabled && (
              <>
                <Text style={styles.sectionLabel}>P A Y   O N   D E L I V E R Y</Text>
                <View style={styles.group}>
                  <TouchableOpacity
                    style={[styles.rowItem, !codAvailable && { opacity: 0.5 }]}
                    activeOpacity={0.8}
                    disabled={!codAvailable}
                    onPress={() => codAvailable && pick({ kind: "cod", label: "Cash on Delivery", sub: "Pay when your food arrives", icon: "cash" })}
                    testID="pay-cod"
                  >
                    <View style={[styles.brandBox, { backgroundColor: colors.success }]}><Ionicons name="cash" size={16} color="#fff" /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLabel}>Cash on Delivery</Text>
                      {!codAvailable && codReason ? (
                        <Text style={{ fontSize: 11, color: colors.error, marginTop: 2 }} numberOfLines={2}>{codReason}</Text>
                      ) : null}
                    </View>
                    {codAvailable ? (
                      <Radio on={selected?.kind === "cod"} />
                    ) : (
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: colors.errorSoft }}>
                        <Text style={{ fontSize: 10, color: colors.error, fontWeight: "800" }}>UNAVAILABLE</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Radio({ on }: { on: boolean }) {
  return (
    <View style={[styles.radio, on && { borderColor: colors.primary }]}>
      {on && <View style={styles.radioDot} />}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, maxHeight: "88%",
    alignSelf: "center", width: "100%", maxWidth: 560,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: spacing.md },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: font.black, color: colors.textPrimary },
  sectionLabel: { fontSize: 11, fontWeight: font.black, color: colors.textMuted, letterSpacing: 1, marginTop: spacing.lg, marginBottom: spacing.sm },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.card },
  rowItem: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: spacing.md, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  iconBox: {
    width: 40, height: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.surface,
  },
  brandBox: { width: 40, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  brandTxt: { color: "#fff", fontWeight: font.black, fontSize: 15 },
  rowLabel: { fontSize: 15, fontWeight: font.semi, color: colors.textPrimary, flexShrink: 1 },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  disabledTxt: { color: colors.textMuted },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  addForm: { padding: spacing.md, gap: 10, backgroundColor: colors.surfaceAlt, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: colors.textPrimary },
  pciNote: { fontSize: 11, color: colors.textMuted },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  saveTxt: { color: colors.onPrimary, fontWeight: font.black, fontSize: 14 },
  warnBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: 10, marginTop: spacing.sm },
  warnTxt: { flex: 1, fontSize: 12, color: colors.textPrimary, fontWeight: font.semi },
  error: { color: colors.error, fontSize: 13, fontWeight: font.semi, marginTop: spacing.sm },
});
