import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { useSmartBack } from "@/src/utils/nav";
import { Api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, spacing, radius, font, shadow } from "@/src/theme";

type Item = { id: string; name: string; price: number; veg?: boolean; available?: boolean; is_available?: boolean; image?: string; category?: string };

export default function DineInOrder() {
  const router = useRouter();
  const goBack = useSmartBack();
  const { rid, tid, t } = useLocalSearchParams<{ rid?: string; tid?: string; t?: string }>();
  const { user } = useAuth();

  const [rest, setRest] = useState<any>(null);
  const [tableLabel, setTableLabel] = useState<string>("");
  const [dineinToken, setDineinToken] = useState<string>("");
  const [menu, setMenu] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [step, setStep] = useState<"menu" | "success">("menu");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [placing, setPlacing] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [payMsg, setPayMsg] = useState("");

  // QR-verified only: no rid+tid+t means there's no way to safely resolve a table.
  const qrVerified = !!(rid && tid && t);

  const load = useCallback(async () => {
    if (!rid) { setErr("Restaurant not specified."); setLoading(false); return; }
    if (!qrVerified) {
      // No token — do not attempt to load a menu customer could order against blindly.
      setLoading(false);
      return;
    }
    try {
      const ctx: any = await Api.dineinContext(String(rid), String(tid), String(t));
      setTableLabel(ctx?.table?.label || "");
      setDineinToken(ctx?.dinein_token || "");

      const det: any = await Api.restaurant(String(rid));
      setRest(det.restaurant || det);
      setMenu(((det.menu || []) as Item[]).filter((m) => m));
    } catch (e: any) {
      setErr(e?.message || "This table QR looks invalid. Please rescan the code on your table.");
    } finally {
      setLoading(false);
    }
  }, [rid, tid, t, qrVerified]);

  useEffect(() => {
    load();
  }, [load]);

  const inc = (id: string) => setQty((s) => ({ ...s, [id]: (s[id] || 0) + 1 }));
  const dec = (id: string) => setQty((s) => ({ ...s, [id]: Math.max(0, (s[id] || 0) - 1) }));

  const cartItems = useMemo(() => menu.filter((m) => (qty[m.id] || 0) > 0), [menu, qty]);
  const subtotal = useMemo(() => cartItems.reduce((s, m) => s + m.price * (qty[m.id] || 0), 0), [cartItems, qty]);
  const count = useMemo(() => cartItems.reduce((s, m) => s + (qty[m.id] || 0), 0), [cartItems, qty]);

  const categories = useMemo(() => {
    const groups: Record<string, Item[]> = {};
    menu.forEach((m) => { const c = m.category || "Menu"; (groups[c] = groups[c] || []).push(m); });
    return Object.entries(groups);
  }, [menu]);

  const placeOrder = async () => {
    setPayMsg("");
    if (!user) {
      router.push({ pathname: "/login", params: { next: `/dinein-order?rid=${rid}&tid=${tid}&t=${t}` } } as any);
      return;
    }
    if (!dineinToken) { setPayMsg("Your table session expired. Please rescan the table QR."); return; }
    if (count === 0) return;
    setPlacing(true);
    try {
      const o: any = await Api.createDineinOrder({
        restaurant_id: String(rid),
        items: cartItems.map((m) => ({ menu_item_id: m.id, quantity: qty[m.id] })),
      }, dineinToken);
      setOrder(o);
      setStep("success");
    } catch (e: any) {
      setPayMsg(e?.message || "Could not place order.");
    } finally {
      setPlacing(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.safe} edges={["top"]}><View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /><Text style={styles.muted}>Loading menu…</Text></View></SafeAreaView>;
  }

  // ---- No QR / invalid QR: ordering is blocked by design ----
  if (!qrVerified || err) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <TopBar title="Dine-in" onBack={goBack} />
        <View style={styles.center}>
          <Ionicons name="qr-code-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.h2, { marginTop: 12 }]}>Scan the table QR to order</Text>
          <Text style={styles.muted}>{err || "Dine-in ordering only works by scanning the QR code on your table — this keeps your order going to the right table automatically."}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ---- Success / bill ----
  if (step === "success" && order) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
          <View style={styles.successTop}>
            <View style={styles.successIcon}><Ionicons name="checkmark" size={34} color="#fff" /></View>
            <Text style={styles.h1}>Order sent to kitchen!</Text>
            <Text style={styles.muted}>{rest?.name} • {order.table_label}</Text>
            <View style={styles.kotPill}><Text style={styles.kotTxt}>{order.kot_number}</Text></View>
          </View>

          <View style={styles.card}>
            {order.items?.map((it: any, i: number) => (
              <View key={i} style={styles.billRow}>
                <Text style={styles.billItem}>{it.quantity} × {it.name}</Text>
                <Text style={styles.billVal}>₹{it.price * it.quantity}</Text>
              </View>
            ))}
            {order.gst_amount > 0 && (<View style={styles.billRow}><Text style={styles.billItemMuted}>GST ({order.gst_percent}%)</Text><Text style={styles.billVal}>₹{order.gst_amount}</Text></View>)}
            <View style={styles.divider} />
            <View style={styles.billRow}><Text style={styles.billTotal}>Total</Text><Text style={styles.billTotal}>₹{order.total}</Text></View>
          </View>

          <View style={[styles.statusBox, { backgroundColor: colors.warningSoft }]}>
            <Ionicons name="cash" size={20} color={colors.warning} />
            <Text style={[styles.statusTxt, { color: colors.warning }]}>Please pay ₹{order.total} at the counter. Your food is being prepared.</Text>
          </View>

          <TouchableOpacity activeOpacity={0.9} onPress={() => { setQty({}); setOrder(null); setStep("menu"); }} style={styles.orderMore}>
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.orderMoreTxt}>Order more items</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---- Menu ----
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <TopBar title={rest?.name || "Dine-in"} subtitle={tableLabel || "Dine-in order"} onBack={goBack} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {categories.map(([cat, items]) => (
          <View key={cat} style={{ marginBottom: spacing.lg }}>
            <Text style={styles.catTitle}>{cat}</Text>
            {items.map((m) => {
              const unavailable = (m.available ?? m.is_available ?? true) === false;
              const n = qty[m.id] || 0;
              return (
                <View key={m.id} style={[styles.itemRow, unavailable && { opacity: 0.5 }]}>
                  <View style={[styles.vegDot, { borderColor: m.veg ? colors.success : colors.error }]}>
                    <View style={[styles.vegInner, { backgroundColor: m.veg ? colors.success : colors.error }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{m.name}</Text>
                    <Text style={styles.itemPrice}>₹{m.price}</Text>
                  </View>
                  {unavailable ? (
                    <Text style={styles.soldOut}>Sold out</Text>
                  ) : n > 0 ? (
                    <View style={styles.stepper}>
                      <TouchableOpacity testID={`dinein-dec-${m.id}`} onPress={() => dec(m.id)} style={styles.stepBtn}><Ionicons name="remove" size={18} color={colors.primary} /></TouchableOpacity>
                      <Text style={styles.stepCount}>{n}</Text>
                      <TouchableOpacity testID={`dinein-inc-${m.id}`} onPress={() => inc(m.id)} style={styles.stepBtn}><Ionicons name="add" size={18} color={colors.primary} /></TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity testID={`dinein-add-${m.id}`} onPress={() => inc(m.id)} style={styles.addBtn}>
                      <Text style={styles.addTxt}>ADD</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {count > 0 && (
        <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
          <View style={styles.bottomBar}>
            <View>
              <Text style={styles.bbCount}>{count} item{count > 1 ? "s" : ""}</Text>
              <Text style={styles.bbTotal}>₹{subtotal}</Text>
            </View>
            <TouchableOpacity testID="dinein-place-order" activeOpacity={0.9} onPress={placeOrder} disabled={placing} style={[styles.placeBtn, { opacity: placing ? 0.7 : 1 }]}>
              {placing ? <ActivityIndicator color={colors.onPrimary} /> : (
                <>
                  <Text style={styles.placeTxt}>{user ? "Place Dine-in Order" : "Login & Order"}</Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.onPrimary} />
                </>
              )}
            </TouchableOpacity>
          </View>
          {payMsg ? <Text style={[styles.err, { paddingHorizontal: 16, paddingBottom: 8, backgroundColor: colors.surface }]}>{payMsg}</Text> : null}
        </KeyboardStickyView>
      )}
      {count === 0 && payMsg ? (
        <View style={{ position: "absolute", bottom: 24, left: 16, right: 16 }}>
          <Text style={styles.err}>{payMsg}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function TopBar({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <View style={styles.topbar}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.topTitle} numberOfLines={1}>{title}</Text>
        {!!subtitle && (
          <View style={styles.tableRow}>
            <Ionicons name="restaurant" size={12} color={colors.primary} />
            <Text style={styles.tableRowTxt}>{subtitle}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: 8 },
  muted: { color: colors.textSecondary, fontSize: 14, textAlign: "center", marginTop: 6 },
  h1: { fontSize: 22, fontWeight: font.black, color: colors.textPrimary, marginTop: 10 },
  h2: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary },

  topbar: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary },
  tableRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  tableRowTxt: { color: colors.textSecondary, fontSize: 12, fontWeight: font.semi },

  catTitle: { fontSize: 16, fontWeight: font.black, color: colors.textPrimary, marginBottom: spacing.sm },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  vegDot: { width: 16, height: 16, borderWidth: 1.5, borderRadius: 3, alignItems: "center", justifyContent: "center" },
  vegInner: { width: 8, height: 8, borderRadius: 4 },
  itemName: { fontSize: 15, fontWeight: font.semi, color: colors.textPrimary },
  itemPrice: { fontSize: 14, fontWeight: font.bold, color: colors.textSecondary, marginTop: 2 },
  soldOut: { color: colors.error, fontSize: 12, fontWeight: font.bold },
  addBtn: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 18, backgroundColor: colors.primarySoft },
  addTxt: { color: colors.primary, fontWeight: font.black, fontSize: 13 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  stepBtn: { padding: 6 },
  stepCount: { fontSize: 15, fontWeight: font.black, color: colors.primary, minWidth: 18, textAlign: "center" },

  bottomBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, ...shadow.lifted },
  bbCount: { color: colors.textSecondary, fontSize: 12, fontWeight: font.semi },
  bbTotal: { color: colors.textPrimary, fontSize: 20, fontWeight: font.black },
  placeBtn: { flexDirection: "row", alignItems: "center", gap: 8, height: 50, borderRadius: radius.lg, backgroundColor: colors.primary, paddingHorizontal: 22 },
  placeTxt: { color: colors.onPrimary, fontSize: 16, fontWeight: font.black },

  successTop: { alignItems: "center", paddingVertical: spacing.lg },
  successIcon: { width: 66, height: 66, borderRadius: 33, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", ...shadow.lifted },
  kotPill: { backgroundColor: colors.textPrimary, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 16, marginTop: 12 },
  kotTxt: { color: "#fff", fontWeight: font.black, fontSize: 14, letterSpacing: 1 },

  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.md, ...shadow.card },
  billRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  billItem: { color: colors.textPrimary, fontSize: 14, fontWeight: font.semi, flex: 1 },
  billItemMuted: { color: colors.textSecondary, fontSize: 13, flex: 1 },
  billVal: { color: colors.textPrimary, fontSize: 14, fontWeight: font.semi },
  billTotal: { color: colors.textPrimary, fontSize: 17, fontWeight: font.black },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  statusBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  statusTxt: { fontSize: 14, fontWeight: font.bold, flex: 1 },
  orderMore: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.lg },
  orderMoreTxt: { color: colors.primary, fontSize: 15, fontWeight: font.bold },
  err: { color: colors.error, fontSize: 13, fontWeight: font.semi, marginTop: spacing.sm, textAlign: "center" },
});
