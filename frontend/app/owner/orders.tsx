import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert, TextInput, Modal } from "react-native";
import { notify } from "@/src/utils/confirm";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { Card, StatusBadge, Empty, Pill } from "@/src/components/ui";
import PrepTimer from "@/src/components/PrepTimer";
import { WaitingForRiderPopup } from "@/src/components/WaitingForRiderPopup";

// Channel filters — online (app) + offline dine-in/takeaway/walk-in (POS)
const CHANNELS: { key: string; label: string }[] = [
  { key: "all", label: "ALL" },
  { key: "online", label: "APP" },
  { key: "dine_in", label: "DINE-IN" },
  { key: "takeaway", label: "TAKEAWAY" },
  { key: "walk_in", label: "WALK-IN" },
];

export default function OwnerOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [channel, setChannel] = useState("all");

  // Handover verification modal state
  const [handoverOrder, setHandoverOrder] = useState<any | null>(null);
  const [handoverCode, setHandoverCode] = useState("");
  const [handoverBusy, setHandoverBusy] = useState(false);
  const [handoverError, setHandoverError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const o = await Api.ownerRecentOrders(200);
      setOrders(o as any[]);
    } catch (e: any) {
      console.warn(e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (oid: string, status: string) => {
    try {
      await Api.updateOrderStatus(oid, status);
      load();
    } catch (e: any) {
      notify("Error", e.message);
    }
  };

  const openHandover = (o: any) => {
    setHandoverOrder(o);
    setHandoverCode("");
    setHandoverError(null);
  };
  const closeHandover = () => {
    setHandoverOrder(null);
    setHandoverCode("");
    setHandoverError(null);
  };
  const submitHandover = async () => {
    if (!handoverOrder) return;
    const code = handoverCode.replace(/\D/g, "");
    if (code.length !== 4) {
      setHandoverError("Please enter the 4-digit code");
      return;
    }
    setHandoverBusy(true);
    setHandoverError(null);
    try {
      await Api.verifyHandover(handoverOrder.id, code);
      closeHandover();
      await load();
      if (typeof window !== "undefined") {
        // Small success toast — the list will also refresh.
        notify("Handover complete", "Order handed over to the rider.");
      }
    } catch (e: any) {
      setHandoverError(e?.message || "Incorrect code");
    } finally {
      setHandoverBusy(false);
    }
  };

  const NEXT_STATUS: Record<string, { label: string; status: string; color: string }[]> = {
    placed: [{ label: "Accept", status: "accepted", color: colors.success }, { label: "Reject", status: "cancelled", color: colors.error }],
    accepted: [{ label: "Start preparing", status: "preparing", color: colors.primary }],
    preparing: [{ label: "Mark ready", status: "ready", color: colors.success }],
    ready: [],
    picked: [],
    delivered: [],
    cancelled: [],
  };

  const filtered = orders.filter((o) => {
    if (channel === "all") return true;
    if (channel === "online") return o.channel === "online";
    return o.order_type === channel; // dine_in / takeaway / walk_in
  });

  const onlineCount = orders.filter((o) => o.channel === "online").length;
  const offlineCount = orders.length - onlineCount;

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <WaitingForRiderPopup />
      <View style={styles.titleBar}>
        <Text style={styles.title}>Orders</Text>
        <Text style={styles.sub}>{onlineCount} app • {offlineCount} dine-in / counter</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {CHANNELS.map((f) => (
          <Pill key={f.key} label={f.label} active={channel === f.key} onPress={() => setChannel(f.key)} />
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <Empty icon="receipt" title="No orders" subtitle="App & dine-in (table) orders appear here as they come in" />
        ) : (
          filtered.map((o) => {
            const isOffline = o.channel === "offline";
            const actions = isOffline ? [] : (NEXT_STATUS[o.status] || []);
            const created = o.created_at ? new Date(o.created_at) : null;
            // Prep timer: runs from the moment the restaurant accepts the
            // order until it's marked "ready". Green while inside the prep
            // window, red (counting up) once the estimate is exceeded.
            const prepActive = ["accepted", "preparing"].includes(o.status);
            const prepStartedAt: string | null = prepActive
              ? (o.status_timestamps?.accepted
                  || o.status_timestamps?.preparing
                  || o.placed_at
                  || null)
              : null;
            // Online orders: split the 10-digit order number so the last 4
            // digits (the "handover code") are visually highlighted.
            const orderNum: string | null = !isOffline ? (o.order_number || null) : null;
            const orderPrefix = orderNum ? orderNum.slice(0, -4) : "";
            const orderCode = orderNum ? orderNum.slice(-4) : "";
            const canHandover = !isOffline && !!o.rider_id && !o.handover_verified && ["accepted", "preparing", "ready"].includes(o.status);
            return (
              <Card key={o.id} style={{ marginBottom: spacing.md }}>
                {/* Header row: channel chip + table/bill + status */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <View style={[styles.channelChip, { backgroundColor: isOffline ? "#7C3AED22" : colors.primarySoft }]}>
                        <Ionicons name={isOffline ? "restaurant" : "phone-portrait"} size={11} color={isOffline ? "#7C3AED" : colors.primary} />
                        <Text style={[styles.channelChipText, { color: isOffline ? "#7C3AED" : colors.primary }]}>
                          {o.source_label || (isOffline ? "Offline" : "Online")}
                        </Text>
                      </View>
                      {o.table_label ? (
                        <View style={styles.tableChip}><Text style={styles.tableChipText}>{o.table_label}</Text></View>
                      ) : null}
                      {o.bill_number ? (
                        <View style={styles.tableChip}><Text style={styles.tableChipText}>#{o.bill_number}</Text></View>
                      ) : null}
                    </View>
                    {orderNum ? (
                      <View style={styles.orderNumRow} testID={`order-num-${o.id}`}>
                        <Text style={styles.orderNumPrefixLabel}>Order</Text>
                        <Text style={styles.orderNumPrefix}>#{orderPrefix}</Text>
                        <Text style={styles.orderNumHighlight}>{orderCode}</Text>
                      </View>
                    ) : null}
                    <Text style={{ fontWeight: font.bold, fontSize: 15, color: colors.textPrimary, marginTop: 6 }} numberOfLines={1}>
                      {o.customer_name || (isOffline ? "Walk-in" : "Customer")}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                      {created ? created.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                    </Text>
                  </View>
                  <StatusBadge status={o.status} />
                </View>

                {prepStartedAt ? (
                  <View style={{ marginTop: spacing.sm }}>
                    <PrepTimer
                      testID={`prep-timer-${o.id}`}
                      startedAt={prepStartedAt}
                      prepMin={o.prep_min}
                    />
                  </View>
                ) : null}

                <View style={{ marginTop: spacing.sm, gap: 4 }}>
                  {(o.items || []).map((it: any, idx: number) => (
                    <View key={idx} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>
                        {(it.qty ?? it.quantity ?? 1)} × {it.name}
                      </Text>
                      <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: font.semi }}>₹{(it.price || 0) * (it.qty ?? it.quantity ?? 1)}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.totalRow}>
                  <Text style={{ fontWeight: font.bold, fontSize: 14, color: colors.textPrimary }}>Total • ₹{o.total}</Text>
                  {o.payment_method ? (
                    <Text style={{ fontSize: 11, color: colors.textMuted, textTransform: "uppercase", fontWeight: font.bold }}>{o.payment_method}</Text>
                  ) : null}
                </View>

                {/* Handover section — visible when a rider is assigned and the
                    order hasn't been handed over yet. */}
                {canHandover ? (
                  <View style={styles.handoverBox} testID={`handover-box-${o.id}`}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
                      <Text style={styles.handoverTitle}>Handover verification</Text>
                    </View>
                    <Text style={styles.handoverSub}>
                      Rider <Text style={{ fontWeight: font.bold, color: colors.textPrimary }}>{o.rider_name || "assigned"}</Text> will
                      recite a 4-digit code. Match it with the highlighted digits above and confirm below.
                    </Text>
                    <TouchableOpacity
                      testID={`verify-handover-${o.id}`}
                      activeOpacity={0.9}
                      onPress={() => openHandover(o)}
                      style={styles.handoverBtn}
                    >
                      <Ionicons name="key" size={14} color={colors.onPrimary} />
                      <Text style={styles.handoverBtnTxt}>Verify & hand over</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {o.handover_verified ? (
                  <View style={styles.handoverDoneBox}>
                    <Ionicons name="checkmark-done-circle" size={16} color={colors.success} />
                    <Text style={styles.handoverDoneTxt}>Order handed over to rider</Text>
                  </View>
                ) : null}

                {actions.length > 0 && (
                  <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                    {actions.map((a) => (
                      <TouchableOpacity
                        key={a.status}
                        onPress={() => updateStatus(o.id, a.status)}
                        activeOpacity={0.85}
                        style={[styles.actionBtn, { backgroundColor: a.color }]}
                      >
                        <Text style={{ color: "#fff", fontWeight: font.bold, fontSize: 13 }}>{a.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </Card>
            );
          })
        )}
      </ScrollView>

      {/* Handover verification modal */}
      <Modal visible={!!handoverOrder} transparent animationType="fade" onRequestClose={closeHandover}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="key" size={20} color={colors.primary} />
              <Text style={styles.modalTitle}>Verify handover code</Text>
            </View>
            <Text style={styles.modalSub}>
              Ask the rider for the last 4 digits of their order. Enter them below to hand over the order.
            </Text>
            {handoverOrder?.order_number ? (
              <View style={styles.modalOrderRow}>
                <Text style={styles.modalOrderLbl}>Order</Text>
                <Text style={styles.modalOrderPrefix}>#{String(handoverOrder.order_number).slice(0, -4)}</Text>
                <Text style={styles.modalOrderCode}>{String(handoverOrder.order_number).slice(-4)}</Text>
              </View>
            ) : null}
            <TextInput
              testID="handover-code-input"
              value={handoverCode}
              onChangeText={(v) => { setHandoverCode(v.replace(/\D/g, "").slice(0, 4)); setHandoverError(null); }}
              placeholder="0000"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={4}
              autoFocus
              style={styles.modalInput}
            />
            {handoverError ? (
              <Text style={styles.modalError}>{handoverError}</Text>
            ) : null}
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <TouchableOpacity
                onPress={closeHandover}
                activeOpacity={0.85}
                style={[styles.modalBtn, styles.modalBtnGhost]}
              >
                <Text style={[styles.modalBtnTxt, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="handover-submit"
                onPress={submitHandover}
                disabled={handoverBusy}
                activeOpacity={0.85}
                style={[styles.modalBtn, { backgroundColor: colors.primary, opacity: handoverBusy ? 0.7 : 1 }]}
              >
                {handoverBusy ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={[styles.modalBtnTxt, { color: colors.onPrimary }]}>Confirm handover</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  titleBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 22, fontWeight: font.black, color: colors.textPrimary },
  sub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 8, alignItems: "center" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.md },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  channelChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  channelChipText: { fontSize: 10, fontWeight: font.black, letterSpacing: 0.3 },
  tableChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  tableChipText: { fontSize: 10, fontWeight: font.bold, color: colors.textSecondary },
  // Order number row (10-digit ID, last 4 highlighted)
  orderNumRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" },
  orderNumPrefixLabel: { fontSize: 10, fontWeight: font.bold, color: colors.textMuted, letterSpacing: 0.5, textTransform: "uppercase" },
  orderNumPrefix: { fontSize: 13, color: colors.textSecondary, fontWeight: font.bold, letterSpacing: 0.4, fontVariant: ["tabular-nums"] } as any,
  orderNumHighlight: {
    fontSize: 14,
    fontWeight: font.black,
    color: colors.primary,
    letterSpacing: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    fontVariant: ["tabular-nums"],
    overflow: "hidden",
  } as any,
  // Handover verification cta box
  handoverBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  handoverTitle: { fontSize: 13, fontWeight: font.black, color: colors.primary, textTransform: "uppercase", letterSpacing: 0.4 },
  handoverSub: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  handoverBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginTop: spacing.sm, paddingVertical: 11, borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  handoverBtnTxt: { color: colors.onPrimary, fontWeight: font.black, fontSize: 13, letterSpacing: 0.3 },
  handoverDoneBox: {
    marginTop: spacing.md, flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: radius.md, backgroundColor: colors.successSoft,
  },
  handoverDoneTxt: { fontSize: 12, fontWeight: font.bold, color: colors.success },
  // Modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(11,15,12,0.55)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: { width: "100%", maxWidth: 380, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: 6 },
  modalTitle: { fontSize: 16, fontWeight: font.black, color: colors.textPrimary },
  modalSub: { fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginTop: 2 },
  modalOrderRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, flexWrap: "wrap" },
  modalOrderLbl: { fontSize: 10, fontWeight: font.bold, color: colors.textMuted, letterSpacing: 0.5, textTransform: "uppercase" },
  modalOrderPrefix: { fontSize: 14, color: colors.textSecondary, fontWeight: font.bold, letterSpacing: 0.4, fontVariant: ["tabular-nums"] } as any,
  modalOrderCode: {
    fontSize: 15, fontWeight: font.black, color: colors.primary,
    letterSpacing: 1, paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: colors.primarySoft, borderRadius: radius.sm,
    fontVariant: ["tabular-nums"], overflow: "hidden",
  } as any,
  modalInput: {
    marginTop: spacing.md, borderWidth: 2, borderColor: colors.borderStrong,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 22, fontWeight: font.black, color: colors.textPrimary,
    textAlign: "center", letterSpacing: 8, backgroundColor: colors.surfaceAlt,
  },
  modalError: { fontSize: 12, fontWeight: font.bold, color: colors.error, marginTop: 8 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  modalBtnGhost: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  modalBtnTxt: { fontWeight: font.black, fontSize: 13 },
});
