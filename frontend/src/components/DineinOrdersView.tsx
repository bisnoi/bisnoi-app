import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Empty } from "@/src/components/ui";

type DOrder = {
  id: string; table_label: string; kot_number: string; customer_name?: string; customer_phone?: string;
  items: { name: string; quantity: number; price: number }[]; total: number; subtotal: number;
  status: string; payment_status: string; payment_method?: string | null; created_at: string; restaurant_id: string;
};

function ago(iso?: string): string {
  if (!iso) return "";
  try {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return "just now";
    if (mins === 1) return "1 min ago";
    if (mins < 60) return `${mins} mins ago`;
    return `${Math.round(mins / 60)}h ago`;
  } catch { return ""; }
}

const PAY_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  paid: { label: "Paid online", color: colors.success, bg: colors.successSoft },
  pay_at_counter: { label: "Pay at counter", color: colors.warning, bg: colors.warningSoft },
  pending: { label: "Payment pending", color: colors.textSecondary, bg: colors.surfaceAlt },
};

export function DineinOrdersView({ rid, reloadSignal, onChanged }: { rid?: string; reloadSignal: number; onChanged: () => void }) {
  const [orders, setOrders] = useState<DOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const timer = useRef<any>(null);

  const load = useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true);
    try {
      const res: any = await Api.ownerDineinOrders();
      let list: DOrder[] = res || [];
      if (rid) list = list.filter((o) => o.restaurant_id === rid);
      setOrders(list);
    } catch (e: any) {
      console.warn(e?.message);
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => {
    load();
    timer.current = setInterval(() => load(true), 2000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load, reloadSignal]);

  const accept = async (o: DOrder) => {
    setBusy(o.id);
    try {
      await Api.ownerAcceptDineinOrder(o.id);
      await load(true);
      onChanged();
    } catch (e: any) {
      if (Platform.OS === "web") window.alert(e?.message || "Failed");
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 50 }} />;
  if (orders.length === 0) {
    return <Empty icon="restaurant-outline" title="No dine-in orders" subtitle="Customer dine-in orders will appear here in real time." />;
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
      {orders.map((o) => {
        const pay = PAY_BADGE[o.payment_status] || PAY_BADGE.pending;
        const isNew = o.status === "placed";
        return (
          <View key={o.id} style={[styles.card, isNew && styles.cardNew]} testID={`dinein-order-${o.id}`}>
            <View style={styles.rowTop}>
              <View style={styles.tablePill}>
                <Ionicons name="grid" size={13} color={colors.onPrimary} />
                <Text style={styles.tablePillTxt}>{o.table_label}</Text>
              </View>
              <Text style={styles.kot}>{o.kot_number}</Text>
              <View style={{ flex: 1 }} />
              <Text style={styles.time}>{ago(o.created_at)}</Text>
            </View>

            {(o.customer_name || o.customer_phone) ? (
              <Text style={styles.cust}>
                <Ionicons name="person" size={12} color={colors.textSecondary} /> {o.customer_name || "Guest"}{o.customer_phone ? ` • ${o.customer_phone}` : ""}
              </Text>
            ) : null}

            <View style={styles.items}>
              {o.items.map((it, i) => (
                <View key={i} style={styles.itemRow}>
                  <Text style={styles.itemName}>{it.quantity} × {it.name}</Text>
                  <Text style={styles.itemAmt}>₹{it.price * it.quantity}</Text>
                </View>
              ))}
            </View>

            <View style={styles.footer}>
              <View style={[styles.payBadge, { backgroundColor: pay.bg }]}>
                <Text style={[styles.payTxt, { color: pay.color }]}>{pay.label}</Text>
              </View>
              <View style={{ flex: 1 }} />
              <Text style={styles.total}>₹{o.total}</Text>
            </View>

            {isNew ? (
              <TouchableOpacity testID={`dinein-accept-${o.id}`} onPress={() => accept(o)} disabled={busy === o.id} style={[styles.acceptBtn, busy === o.id && { opacity: 0.6 }]} activeOpacity={0.85}>
                {busy === o.id ? <ActivityIndicator color={colors.onPrimary} /> : (
                  <>
                    <Ionicons name="checkmark-circle" size={16} color={colors.onPrimary} />
                    <Text style={styles.acceptTxt}>Accept & Preparing</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.acceptedRow}>
                <Ionicons name="checkmark-done" size={16} color={colors.success} />
                <Text style={styles.acceptedTxt}>Accepted • sent to kitchen</Text>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md, ...shadow.card },
  cardNew: { borderColor: colors.primary, borderWidth: 1.5 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  tablePill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 },
  tablePillTxt: { color: colors.onPrimary, fontSize: 12, fontWeight: font.black },
  kot: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary },
  time: { fontSize: 11, color: colors.textMuted },
  cust: { fontSize: 12.5, color: colors.textSecondary, marginTop: 8, fontWeight: font.semi },
  items: { marginTop: 8, gap: 3 },
  itemRow: { flexDirection: "row", justifyContent: "space-between" },
  itemName: { fontSize: 14, color: colors.textPrimary, fontWeight: font.semi, flex: 1 },
  itemAmt: { fontSize: 14, color: colors.textSecondary, fontWeight: font.semi },
  footer: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  payBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  payTxt: { fontSize: 11.5, fontWeight: font.bold },
  total: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary },
  acceptBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12, height: 44, borderRadius: radius.md, backgroundColor: colors.primary },
  acceptTxt: { color: colors.onPrimary, fontSize: 14, fontWeight: font.black },
  acceptedRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  acceptedTxt: { color: colors.success, fontSize: 13, fontWeight: font.bold },
});
