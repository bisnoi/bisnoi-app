import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert, Modal, TextInput, Linking, Platform } from "react-native";
import { notify } from "@/src/utils/confirm";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { Card, StatusBadge, Empty, Button, Pill } from "@/src/components/ui";
import { GoogleMapView } from "@/src/components/GoogleMapView";
import { useRiderLocationShare } from "@/src/utils/useRiderLocationShare";

const FILTERS = ["active", "all", "delivered"];

// Emergency-transfer reasons — MUST match backend TRANSFER_REASONS keys.
const TRANSFER_REASONS: { key: string; label: string; icon: any }[] = [
  { key: "vehicle_breakdown", label: "Vehicle breakdown", icon: "construct" },
  { key: "accident_injury", label: "Accident or injury", icon: "medkit" },
  { key: "personal_emergency", label: "Personal emergency", icon: "alert-circle" },
  { key: "bad_weather", label: "Bad weather", icon: "rainy" },
  { key: "other", label: "Other", icon: "ellipsis-horizontal-circle" },
];

export default function RiderOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("active");
  const [busy, setBusy] = useState<string | null>(null);
  const { sharingOrderId, start: startShare, stop: stopShare, error: shareError } = useRiderLocationShare();

  // Normalise a phone into a dial-ready E.164 string (India defaults to +91).
  const dialPhone = (raw?: string | null) => {
    const digits = String(raw || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("91") && digits.length >= 12) return `+${digits}`;
    if (digits.length === 10) return `+91${digits}`;
    return `+${digits}`;
  };
  const callPhone = async (raw?: string | null) => {
    const phone = dialPhone(raw);
    if (!phone) { Alert.alert("No phone", "Customer phone number is not available on this order."); return; }
    const url = `tel:${phone}`;
    try {
      const can = Platform.OS === "web" ? true : await Linking.canOpenURL(url);
      if (!can) throw new Error("Calling not supported on this device");
      await Linking.openURL(url);
    } catch (e: any) {
      Alert.alert("Cannot call", e?.message || "Please try dialling manually.");
    }
  };
  const whatsappPhone = async (raw?: string | null, name?: string | null) => {
    const digits = String(raw || "").replace(/\D/g, "");
    if (!digits) { Alert.alert("No phone", "Customer phone number is not available."); return; }
    const full = digits.length === 10 ? `91${digits}` : digits;
    const url = `https://wa.me/${full}?text=${encodeURIComponent(`Hi ${name || "there"}, I am your Bisnoi delivery rider. On my way with your order.`)}`;
    if (Platform.OS === "web") window.open(url, "_blank");
    else Linking.openURL(url);
  };

  // Emergency-transfer modal state
  const [xferOrder, setXferOrder] = useState<any | null>(null);
  const [xferReason, setXferReason] = useState<string>("vehicle_breakdown");
  const [xferNote, setXferNote] = useState<string>("");
  const [xferBusy, setXferBusy] = useState(false);
  const [xferError, setXferError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const o = (await Api.myOrders()) as any[];
      setOrders(o);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (oid: string, status: string) => {
    setBusy(oid);
    try {
      await Api.updateOrderStatus(oid, status);
      load();
    } catch (e: any) {
      notify("Error", e.message);
    } finally {
      setBusy(null);
    }
  };

  const openXfer = (o: any) => {
    setXferOrder(o);
    setXferReason("vehicle_breakdown");
    setXferNote("");
    setXferError(null);
  };
  const closeXfer = () => {
    if (xferBusy) return;
    setXferOrder(null);
    setXferReason("vehicle_breakdown");
    setXferNote("");
    setXferError(null);
  };
  const submitXfer = async () => {
    if (!xferOrder) return;
    setXferBusy(true);
    setXferError(null);
    try {
      await Api.requestRiderTransfer(xferOrder.id, xferReason, xferNote.trim() || undefined);
      // Stop sharing our location for this order so we don't pollute the trail
      if (sharingOrderId === xferOrder.id) {
        try { stopShare(); } catch {}
      }
      setXferOrder(null);
      setXferNote("");
      notify("Transfer requested", "Another rider will pick this up shortly. Thanks for the heads-up — please take care of yourself.");
      load();
    } catch (e: any) {
      setXferError(e?.message || "Could not request transfer");
    } finally {
      setXferBusy(false);
    }
  };

  const simulate = async (oid: string) => {
    setBusy(oid + ":sim");
    try {
      await Api.simulateStep(oid);
      load();
    } catch (e: any) {
      notify("Error", e.message);
    } finally {
      setBusy(null);
    }
  };

  const active = orders.filter((o) => ["accepted", "preparing", "ready", "picked"].includes(o.status));
  const delivered = orders.filter((o) => o.status === "delivered");
  const list = filter === "active" ? active : filter === "delivered" ? delivered : orders;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.titleBar}>
        <Text style={styles.title}>My Deliveries</Text>
        <Text style={styles.sub}>Track and update your active orders</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pill key={f} label={f.toUpperCase()} active={filter === f} onPress={() => setFilter(f)} />
        ))}
      </ScrollView>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : list.length === 0 ? (
          <Empty icon="bicycle" title="No deliveries here" subtitle="Accept an order from the Available tab" />
        ) : (
          list.map((o) => {
            const drop = o.address || {};
            const riderLat = o.rider_lat || drop.lat;
            const riderLng = o.rider_lng || drop.lng;
            const isPicked = o.status === "picked";
            const canPickup = o.status === "ready";
            // 10-digit order number → last 4 digits are the handover code the
            // rider must recite to the restaurant owner. Highlighted big and
            // bold once assigned so it's easy to read out.
            const orderNum: string = o.order_number || "";
            const orderPrefix = orderNum ? orderNum.slice(0, -4) : "";
            const orderCode = orderNum ? orderNum.slice(-4) : (o.handover_code || "");
            const showHandover = !!orderCode && !isPicked && o.status !== "delivered";
            return (
              <Card key={o.id} style={{ marginBottom: spacing.md, padding: 0, overflow: "hidden" }}>
                <View style={{ padding: spacing.lg }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: font.bold, color: colors.textPrimary }}>{o.restaurant_name}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                        {o.customer_name || "Customer"} • ₹{o.total}
                      </Text>
                    </View>
                    <StatusBadge status={o.status} />
                  </View>

                  {/* Quick-contact row — Call + WhatsApp buttons.  Visible whenever a
                      customer phone is present on the order.  On the picked leg the
                      rider is en-route to the customer so this is the primary tap
                      target; before pickup it also helps coordinate with the drop
                      location. */}
                  {o.customer_phone ? (
                    <View style={styles.contactRow} testID={`rider-contact-row-${o.id}`}>
                      <TouchableOpacity
                        testID={`rider-call-customer-${o.id}`}
                        onPress={() => callPhone(o.customer_phone)}
                        activeOpacity={0.85}
                        style={[styles.contactBtn, styles.callBtn]}
                      >
                        <Ionicons name="call" size={16} color={colors.onPrimary} />
                        <Text style={styles.callBtnTxt}>Call Customer</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID={`rider-whatsapp-customer-${o.id}`}
                        onPress={() => whatsappPhone(o.customer_phone, o.customer_name)}
                        activeOpacity={0.85}
                        style={[styles.contactBtn, styles.waSquare]}
                      >
                        <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {/* Order number line — prefix muted, last 4 highlighted */}
                  {orderNum ? (
                    <View style={styles.orderNumRow} testID={`rider-order-num-${o.id}`}>
                      <Text style={styles.orderNumLbl}>Order</Text>
                      <Text style={styles.orderNumPrefix}>#{orderPrefix}</Text>
                      <Text style={styles.orderNumHighlight}>{orderCode}</Text>
                    </View>
                  ) : null}

                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: spacing.sm }}>
                    <Ionicons name="location" size={14} color={colors.textSecondary} style={{ marginTop: 2 }} />
                    <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }}>{drop.line}</Text>
                  </View>
                </View>

                {/* Big handover code call-out — this is what the rider recites
                    to the restaurant. Only visible before pickup is confirmed. */}
                {showHandover ? (
                  <View style={styles.handoverPanel} testID={`rider-handover-${o.id}`}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <Ionicons name="key" size={14} color={colors.onPrimary} />
                      <Text style={styles.handoverPanelTitle}>Handover code</Text>
                    </View>
                    <Text style={styles.handoverCodeBig} testID={`rider-handover-code-${o.id}`}>
                      {orderCode}
                    </Text>
                    <Text style={styles.handoverPanelSub}>
                      Tell this to the restaurant owner. They will verify it before handing over the order.
                    </Text>
                  </View>
                ) : null}

                {drop.lat && o.status !== "delivered" && (
                  <GoogleMapView
                    height={180}
                    markers={[
                      { key: "rider", lat: riderLat, lng: riderLng, label: "You", color: "D94838", icon: "rider" },
                      { key: "drop", lat: drop.lat, lng: drop.lng, label: "Drop", color: "2D7A4D", icon: "home" },
                    ]}
                  />
                )}

                <View style={{ padding: spacing.lg, gap: spacing.sm }}>
                  {canPickup && (
                    <View style={styles.pickupHintRow}>
                      <Ionicons name="information-circle" size={16} color={colors.warning} />
                      <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }}>
                        Show the code above to the restaurant. They'll mark the order as picked up once verified.
                      </Text>
                    </View>
                  )}
                  {isPicked && (
                    <>
                      <Button
                        title={sharingOrderId === o.id ? "Stop sharing location" : "Share live location"}
                        icon={sharingOrderId === o.id ? "stop-circle" : "navigate-circle"}
                        variant={sharingOrderId === o.id ? "danger" : "primary"}
                        onPress={() => (sharingOrderId === o.id ? stopShare() : startShare(o.id))}
                        full
                      />
                      {sharingOrderId === o.id && (
                        <View style={styles.liveRow}>
                          <View style={styles.liveDot} />
                          <Text style={{ color: colors.success, fontSize: 12, fontWeight: font.bold, flex: 1 }}>
                            Live location ON — the customer sees you move in real time
                          </Text>
                        </View>
                      )}
                      {!!shareError && sharingOrderId !== o.id && (
                        <Text style={{ color: colors.error, fontSize: 12 }}>{shareError}</Text>
                      )}
                      <View style={{ flexDirection: "row", gap: spacing.sm }}>
                        <View style={{ flex: 1 }}>
                          <Button title="Simulate Move" icon="navigate" variant="secondary" onPress={() => simulate(o.id)} loading={busy === o.id + ":sim"} full />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Button title="Delivered" icon="checkmark-done" onPress={() => setStatus(o.id, "delivered")} loading={busy === o.id} full />
                        </View>
                      </View>

                      {/* Emergency: something happened during delivery → hand
                          this order to another rider without cancelling it. */}
                      <TouchableOpacity
                        testID={`report-transfer-${o.id}`}
                        onPress={() => openXfer(o)}
                        activeOpacity={0.85}
                        style={styles.emergencyBtn}
                      >
                        <Ionicons name="warning" size={14} color={colors.error} />
                        <Text style={styles.emergencyBtnTxt}>Report issue & transfer to another rider</Text>
                      </TouchableOpacity>
                      {(o.previous_riders || []).length > 0 ? (
                        <Text style={styles.xferHistory} testID={`xfer-history-${o.id}`}>
                          Handed off {o.previous_riders.length}x • last released by {o.previous_riders[o.previous_riders.length - 1]?.rider_name || "rider"}
                        </Text>
                      ) : null}
                    </>
                  )}
                  {["accepted", "preparing"].includes(o.status) && (
                    <View style={styles.infoRow}>
                      <Ionicons name="time" size={16} color={colors.warning} />
                      <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }}>
                        Waiting for the restaurant to mark it ready for pickup.
                      </Text>
                    </View>
                  )}
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>

      {/* Emergency-transfer modal — pick a reason + optional note; submit
          releases the order back to the rider feed for anyone else to take. */}
      <Modal visible={!!xferOrder} animationType="fade" transparent onRequestClose={closeXfer}>
        <View style={styles.xferBackdrop}>
          <View style={styles.xferCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={styles.xferHeadIc}>
                <Ionicons name="warning" size={20} color={colors.error} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.xferTitle}>Transfer this order</Text>
                <Text style={styles.xferSub}>Only use this if you cannot safely continue the delivery. Another rider will pick it up right after.</Text>
              </View>
            </View>

            <Text style={styles.xferLabel}>What happened?</Text>
            <View style={styles.reasonGrid}>
              {TRANSFER_REASONS.map((r) => {
                const on = xferReason === r.key;
                return (
                  <TouchableOpacity
                    key={r.key}
                    testID={`xfer-reason-${r.key}`}
                    activeOpacity={0.85}
                    onPress={() => setXferReason(r.key)}
                    style={[styles.reasonPill, on && styles.reasonPillOn]}
                  >
                    <Ionicons name={r.icon} size={13} color={on ? colors.onPrimary : colors.textSecondary} />
                    <Text style={[styles.reasonPillTxt, on && { color: colors.onPrimary }]}>{r.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.xferLabel}>Add a note (optional)</Text>
            <TextInput
              testID="xfer-note"
              value={xferNote}
              onChangeText={setXferNote}
              placeholder="e.g. tyre puncture near Silk Board, will need ~1hr"
              placeholderTextColor={colors.textMuted}
              multiline
              style={styles.xferInput}
              maxLength={300}
            />

            {xferError ? (
              <Text style={styles.xferErr}>{xferError}</Text>
            ) : null}

            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <TouchableOpacity
                onPress={closeXfer}
                disabled={xferBusy}
                activeOpacity={0.85}
                style={[styles.xferBtn, styles.xferBtnGhost, xferBusy && { opacity: 0.6 }]}
              >
                <Text style={[styles.xferBtnTxt, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="xfer-submit"
                onPress={submitXfer}
                disabled={xferBusy}
                activeOpacity={0.85}
                style={[styles.xferBtn, { backgroundColor: colors.error, opacity: xferBusy ? 0.7 : 1 }]}
              >
                {xferBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="swap-horizontal" size={14} color="#fff" />
                    <Text style={[styles.xferBtnTxt, { color: "#fff" }]}>Release to another rider</Text>
                  </>
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
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: spacing.md, backgroundColor: colors.warningSoft, borderRadius: radius.md },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: spacing.sm, backgroundColor: colors.successSoft, borderRadius: radius.md },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  // Rider ↔ customer quick-contact row (Call + WhatsApp buttons).
  contactRow: { flexDirection: "row", gap: 8, marginTop: spacing.md },
  contactBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 42, borderRadius: radius.md },
  callBtn: { flex: 1, backgroundColor: colors.success, paddingHorizontal: spacing.md },
  callBtnTxt: { color: colors.onPrimary, fontSize: 13.5, fontWeight: font.black },
  waSquare: { width: 46, backgroundColor: "#25D36622", borderWidth: 1, borderColor: "#25D366" },
  // Order number row (10-digit, prefix muted + last 4 highlighted)
  orderNumRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, flexWrap: "wrap" },
  orderNumLbl: { fontSize: 10, fontWeight: font.bold, color: colors.textMuted, letterSpacing: 0.5, textTransform: "uppercase" },
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
  // Big highlighted handover code panel
  handoverPanel: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  handoverPanelTitle: {
    fontSize: 11,
    fontWeight: font.black,
    color: colors.onPrimary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    opacity: 0.9,
  },
  handoverCodeBig: {
    fontSize: 44,
    fontWeight: font.black,
    color: colors.onPrimary,
    letterSpacing: 8,
    fontVariant: ["tabular-nums"],
    marginTop: 2,
    marginBottom: 4,
  } as any,
  handoverPanelSub: {
    fontSize: 11,
    color: colors.onPrimary,
    opacity: 0.9,
    textAlign: "center",
    lineHeight: 15,
    marginTop: 2,
    paddingHorizontal: 4,
  },
  pickupHintRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: spacing.md, backgroundColor: colors.warningSoft, borderRadius: radius.md,
  },
  // Emergency-transfer CTA + history hint
  emergencyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginTop: spacing.sm, paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.error,
    backgroundColor: colors.errorSoft,
  },
  emergencyBtnTxt: { color: colors.error, fontSize: 12, fontWeight: font.black, letterSpacing: 0.3 },
  xferHistory: { fontSize: 11, color: colors.textMuted, marginTop: 4, fontStyle: "italic" },
  // Transfer modal
  xferBackdrop: { flex: 1, backgroundColor: "rgba(11,15,12,0.55)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  xferCard: { width: "100%", maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: 6 },
  xferHeadIc: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.errorSoft, alignItems: "center", justifyContent: "center" },
  xferTitle: { fontSize: 16, fontWeight: font.black, color: colors.textPrimary },
  xferSub: { fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginTop: 2 },
  xferLabel: { fontSize: 11, fontWeight: font.black, color: colors.textMuted, letterSpacing: 0.6, textTransform: "uppercase", marginTop: spacing.md, marginBottom: 6 },
  reasonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  reasonPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.pill,
    borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface,
  },
  reasonPillOn: { backgroundColor: colors.error, borderColor: colors.error },
  reasonPillTxt: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary },
  xferInput: {
    marginTop: 0, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: colors.textPrimary, minHeight: 66, textAlignVertical: "top",
    backgroundColor: colors.surfaceAlt,
  },
  xferErr: { fontSize: 12, fontWeight: font.bold, color: colors.error, marginTop: 8 },
  xferBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: radius.md },
  xferBtnGhost: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  xferBtnTxt: { fontWeight: font.black, fontSize: 13 },
});
