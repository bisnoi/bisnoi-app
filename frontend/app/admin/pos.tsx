import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Card, Empty, Pill } from "@/src/components/ui";
import { AdminHeader } from "@/src/components/AdminHeader";
import { confirmDialog } from "@/src/utils/confirm";
import { ReceiptModal, inr, PAY_LABEL, TYPE_LABEL } from "@/src/components/ReceiptModal";

function fmt(iso?: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

export default function AdminPOS() {
  const [stats, setStats] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [receipt, setReceipt] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async (rid: string) => {
    try {
      const [s, o] = await Promise.all([
        Api.adminPosStats(),
        Api.adminPosOrders(rid === "all" ? undefined : rid),
      ]);
      setStats(s);
      setOrders((o as any[]) || []);
    } catch (e: any) {
      console.warn(e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(filter); }, [filter]));
  const handleDelete = useCallback(async (bill: any) => {
    const ok = await confirmDialog(
      "Delete this bill?",
      `Bill ${bill.bill_number || bill.id} will be permanently removed. This cannot be undone.`,
      "Delete",
      true,
    );
    if (!ok) return;
    setDeletingId(bill.id);
    try {
      await Api.adminDeletePosOrder(bill.id);
      setOrders((prev) => prev.filter((o) => o.id !== bill.id));
    } catch (e: any) {
      if (typeof window !== "undefined" && window.alert) window.alert(e?.message || "Could not delete bill");
    } finally {
      setDeletingId(null);
    }
  }, []);


  const byRest = stats?.by_restaurant || [];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AdminHeader title="POS Sales" subtitle="Counter billing across all restaurants" />

      {loading && !stats ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 50 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(filter); }} tintColor={colors.primary} />}
        >
          {/* Summary */}
          <View style={styles.statGrid}>
            <View style={styles.statCard}>
              <View style={[styles.icBox, { backgroundColor: colors.primary + "22" }]}><Ionicons name="cash" size={18} color={colors.primary} /></View>
              <Text style={styles.statVal}>{inr(stats?.total_sales ?? 0)}</Text>
              <Text style={styles.statLabel}>Total POS Sales</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.icBox, { backgroundColor: "#0EA5E922" }]}><Ionicons name="receipt" size={18} color="#0EA5E9" /></View>
              <Text style={styles.statVal}>{stats?.total_bills ?? 0}</Text>
              <Text style={styles.statLabel}>Total Bills</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.icBox, { backgroundColor: colors.success + "22" }]}><Ionicons name="today" size={18} color={colors.success} /></View>
              <Text style={styles.statVal}>{inr(stats?.today_sales ?? 0)}</Text>
              <Text style={styles.statLabel}>Today's Sales</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.icBox, { backgroundColor: colors.warning + "22" }]}><Ionicons name="flash" size={18} color={colors.warning} /></View>
              <Text style={styles.statVal}>{stats?.today_bills ?? 0}</Text>
              <Text style={styles.statLabel}>Today's Bills</Text>
            </View>
          </View>

          {/* Restaurant filter */}
          {byRest.length > 0 ? (
            <>
              <Text style={styles.secTitle}>FILTER BY RESTAURANT</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }} style={{ flexGrow: 0 }}>
                <Pill label={`All (${stats?.total_bills ?? 0})`} active={filter === "all"} onPress={() => setFilter("all")} />
                {byRest.map((r: any) => (
                  <Pill key={r.restaurant_id} label={`${r.restaurant_name} (${r.bills})`} active={filter === r.restaurant_id} onPress={() => setFilter(r.restaurant_id)} />
                ))}
              </ScrollView>
            </>
          ) : null}

          {/* Bills list */}
          <Text style={styles.secTitle}>BILLS ({orders.length})</Text>
          {orders.length === 0 ? (
            <Empty icon="receipt-outline" title="No POS bills" subtitle="Owner-generated counter bills will appear here." />
          ) : orders.map((b) => (
            <TouchableOpacity key={b.id} activeOpacity={0.85} onPress={() => setReceipt(b)} testID={`admin-pos-${b.id}`}>
              <Card style={{ marginBottom: spacing.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={styles.billIc}><Ionicons name="receipt" size={18} color={colors.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={styles.billNo}>{b.bill_number}</Text>
                      <Text style={styles.rest} numberOfLines={1}>• {b.restaurant_name}</Text>
                    </View>
                    <Text style={styles.billMeta}>{fmt(b.created_at)} • {b.item_count} items • {PAY_LABEL[b.payment_method] || b.payment_method}</Text>
                  </View>
                  <Text style={styles.billTotal}>{inr(b.total)}</Text>
                  <TouchableOpacity
                    onPress={(e: any) => { e.stopPropagation?.(); handleDelete(b); }}
                    hitSlop={8}
                    disabled={deletingId === b.id}
                    testID={`admin-pos-delete-${b.id}`}
                  >
                    {deletingId === b.id ? (
                      <ActivityIndicator size="small" color={colors.error} />
                    ) : (
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                    )}
                  </TouchableOpacity>
                </View>
              </Card>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ReceiptModal visible={!!receipt} bill={receipt} onClose={() => setReceipt(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statCard: { width: "47%", flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.card },
  icBox: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 20, fontWeight: font.black, color: colors.textPrimary, marginTop: 8 },
  statLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: font.semi, marginTop: 2 },
  secTitle: { fontSize: 13, fontWeight: font.black, color: colors.textPrimary, letterSpacing: 0.4, marginTop: spacing.xl, marginBottom: spacing.sm },
  billIc: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  billNo: { fontSize: 14, fontWeight: font.black, color: colors.textPrimary },
  rest: { fontSize: 12, color: colors.textSecondary, flex: 1 },
  billMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  billTotal: { fontSize: 16, fontWeight: font.black, color: colors.primary },
});
