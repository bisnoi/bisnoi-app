import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { confirmDialog } from "@/src/utils/confirm";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, TextInput, Modal, Platform, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Card, StatusBadge, Empty, Pill } from "@/src/components/ui";
import { AdminHeader } from "@/src/components/AdminHeader";
import { GoogleMapView } from "@/src/components/GoogleMapView";

const FILTERS = ["all", "placed", "accepted", "preparing", "ready", "picked", "delivered", "cancelled"];

/**
 * Admin — All Orders screen.
 * Each order card is tappable → opens a Live-Track modal that polls the backend
 * every ~4 seconds for the rider's current location and re-renders the map.
 */
export default function AdminOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [tracking, setTracking] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const o = (await Api.adminOrders()) as any[];
      setOrders(o);
    } catch (e) {
      // Non-fatal
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const handleDelete = useCallback(async (order: any) => {
    const ok = await confirmDialog(
      "Delete this order?",
      `Order ${order.order_number || order.id} will be permanently removed. This cannot be undone.`,
      "Delete",
      true,
    );
    if (!ok) return;
    setDeletingId(order.id);
    try {
      await Api.adminDeleteOrder(order.id);
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      if (typeof window !== "undefined" && window.alert) window.alert(e?.message || "Could not delete order");
    } finally {
      setDeletingId(null);
    }
  }, []);


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter !== "all" && o.status !== filter) return false;
      if (!q) return true;
      return (
        (o.order_number || "").toLowerCase().includes(q) ||
        (o.restaurant_name || "").toLowerCase().includes(q) ||
        (o.customer_name || "").toLowerCase().includes(q) ||
        (o.rider_name || "").toLowerCase().includes(q) ||
        (o.id || "").toLowerCase().includes(q)
      );
    });
  }, [orders, filter, search]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AdminHeader title="All Orders" subtitle={`${filtered.length} of ${orders.length} orders`} />

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          testID="admin-orders-search"
          value={search}
          onChangeText={setSearch}
          placeholder="Search order #, restaurant, customer or rider"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
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
        ) : filtered.length === 0 ? (
          <Empty icon="receipt" title="No orders" />
        ) : (
          filtered.map((o) => {
            const orderNum: string = o.order_number || "";
            const prefix = orderNum ? orderNum.slice(0, -4) : "";
            const code = orderNum ? orderNum.slice(-4) : "";
            const isLiveEligible = !!o.rider_id && ["picked", "ready", "preparing", "accepted"].includes(o.status);
            const transferPending = !!o.transfer_requested;
            const transfers = (o.previous_riders || []).length;
            return (
              <TouchableOpacity
                key={o.id}
                activeOpacity={0.85}
                onPress={() => setTracking(o)}
                testID={`admin-order-row-${o.id}`}
              >
                <Card style={{
                  marginBottom: spacing.sm,
                  borderColor: transferPending ? colors.error : undefined,
                  borderWidth: transferPending ? 1.5 : undefined,
                }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ fontSize: 15, fontWeight: font.bold, color: colors.textPrimary }}>{o.restaurant_name}</Text>
                      {orderNum ? (
                        <View style={styles.orderNumRow}>
                          <Text style={styles.orderNumLbl}>ORDER</Text>
                          <Text style={styles.orderNumPrefix}>#{prefix}</Text>
                          <Text style={styles.orderNumHighlight}>{code}</Text>
                          {transferPending ? (
                            <View style={styles.xferTag} testID={`admin-xfer-tag-${o.id}`}>
                              <Ionicons name="warning" size={10} color={colors.error} />
                              <Text style={styles.xferTagTxt}>NEEDS RIDER</Text>
                            </View>
                          ) : transfers > 0 ? (
                            <View style={styles.xferHistTag}>
                              <Ionicons name="swap-horizontal" size={10} color={colors.warning} />
                              <Text style={styles.xferHistTagTxt}>{transfers}x transfer</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                        {o.customer_name || "Customer"} • {(o.items || []).length} items • ₹{o.total}
                      </Text>
                      {o.rider_name ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                          <Ionicons name="bicycle" size={12} color={colors.primary} />
                          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: font.bold }}>{o.rider_name}</Text>
                          {isLiveEligible ? <View style={styles.liveDot} /> : null}
                          {isLiveEligible ? <Text style={styles.liveTxt}>LIVE</Text> : null}
                        </View>
                      ) : null}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                        <Ionicons name="time" size={11} color={colors.textMuted} />
                        <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                          {new Date(o.placed_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                        </Text>
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      <StatusBadge status={o.status} />
                      <TouchableOpacity
                        onPress={(e: any) => { e.stopPropagation?.(); handleDelete(o); }}
                        hitSlop={8}
                        disabled={deletingId === o.id}
                        testID={`admin-order-delete-${o.id}`}
                      >
                        {deletingId === o.id ? (
                          <ActivityIndicator size="small" color={colors.error} />
                        ) : (
                          <Ionicons name="trash-outline" size={16} color={colors.error} />
                        )}
                      </TouchableOpacity>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <LiveTrackModal order={tracking} onClose={() => setTracking(null)} />
    </SafeAreaView>
  );
}

/**
 * Live tracking modal — polls /api/admin/orders/{id} every 4 seconds so long
 * as it stays open. Shows the rider's most-recent lat/lng on a Google map,
 * along with the restaurant + drop location for full context.
 */
function LiveTrackModal({ order, onClose }: { order: any | null; onClose: () => void }) {
  const [detail, setDetail] = useState<any | null>(order);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    setDetail(order);
  }, [order]);

  useEffect(() => {
    if (!order?.id) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    let stopped = false;
    const tick = async () => {
      try {
        const d = await Api.adminOrder(order.id);
        if (!stopped) setDetail(d);
      } catch (_e) {
        // ignore transient failures — keep polling
      }
    };
    tick(); // immediate refresh
    timerRef.current = setInterval(tick, 4000);
    return () => {
      stopped = true;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [order?.id]);

  if (!order) return null;
  const d = detail || order;
  const drop = d.address || {};
  const restLat = d.restaurant_lat ?? drop.lat;
  const restLng = d.restaurant_lng ?? drop.lng;
  const riderLat = d.rider_lat ?? restLat;
  const riderLng = d.rider_lng ?? restLng;
  const orderNum: string = d.order_number || "";
  const prefix = orderNum ? orderNum.slice(0, -4) : "";
  const code = orderNum ? orderNum.slice(-4) : "";
  const updatedTs = d.rider_location_updated_at ? new Date(d.rider_location_updated_at) : null;
  const secondsAgo = updatedTs ? Math.max(0, Math.round((Date.now() - updatedTs.getTime()) / 1000)) : null;
  const markers: any[] = [];
  if (restLat && restLng) markers.push({ key: "rest", lat: restLat, lng: restLng, label: d.restaurant_name || "Restaurant", color: "2D7A4D", icon: "store" });
  if (drop.lat && drop.lng) markers.push({ key: "drop", lat: drop.lat, lng: drop.lng, label: "Drop", color: "0EA5E9", icon: "home" });
  if (d.rider_id && riderLat && riderLng) markers.push({ key: "rider", lat: riderLat, lng: riderLng, label: d.rider?.name || d.rider_name || "Rider", color: "D94838", icon: "rider" });

  const dial = (phone?: string | null) => { if (!phone) return; try { Linking.openURL(`tel:${phone}`); } catch (_e) {} };

  return (
    <Modal visible={!!order} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.trackSafe} edges={["top"]}>
        <View style={styles.trackHead}>
          <TouchableOpacity onPress={onClose} hitSlop={12} testID="live-track-close">
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.trackTitle}>Live tracking</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
              {orderNum ? (
                <>
                  <Text style={styles.trackNumPrefix}>#{prefix}</Text>
                  <Text style={styles.trackNumCode}>{code}</Text>
                </>
              ) : null}
              <StatusBadge status={d.status} />
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {markers.length > 0 ? (
            <GoogleMapView markers={markers} height={340} showPath interactive />
          ) : (
            <View style={styles.mapPlaceholder}>
              <Ionicons name="map" size={30} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>No location data yet</Text>
            </View>
          )}

          <View style={[
            styles.liveBanner,
            d.transfer_requested && { backgroundColor: colors.errorSoft, borderColor: colors.error + "44" },
          ]}>
            <View style={[styles.liveDotBig, d.transfer_requested && { backgroundColor: colors.error }]} />
            <Text style={[styles.liveBannerTxt, d.transfer_requested && { color: colors.error }]}>
              {d.transfer_requested
                ? "Transfer requested — waiting for another rider to take over. Customer + restaurant already notified."
                : d.rider_id
                  ? (secondsAgo === null
                      ? "Waiting for the rider to share their location…"
                      : `Rider location updated ${secondsAgo}s ago • auto-refreshes every 4s`)
                  : "No rider assigned yet — location will start streaming once a rider accepts."}
            </Text>
          </View>

          <View style={styles.detailBlock}>
            <Text style={styles.detailHead}>Restaurant</Text>
            <Text style={styles.detailPrimary}>{d.restaurant_name || "—"}</Text>
            <Text style={styles.detailSub}>Ph: {d.restaurant_phone || "—"}</Text>
          </View>

          <View style={styles.detailBlock}>
            <Text style={styles.detailHead}>Customer</Text>
            <Text style={styles.detailPrimary}>{d.customer_name || "—"}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
              <Text style={styles.detailSub}>{d.customer_phone || "—"}</Text>
              {d.customer_phone ? (
                <TouchableOpacity onPress={() => dial(d.customer_phone)} activeOpacity={0.85} style={styles.callBtn}>
                  <Ionicons name="call" size={12} color={colors.onPrimary} />
                  <Text style={styles.callBtnTxt}>Call</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.detailSub}>{drop.line || drop.line1 || drop.address_line || "—"}</Text>
          </View>

          <View style={styles.detailBlock}>
            <Text style={styles.detailHead}>Rider</Text>
            {d.rider_id ? (
              <>
                <Text style={styles.detailPrimary}>{d.rider?.name || d.rider_name || "Rider"}</Text>
                {d.rider?.account_id ? <Text style={styles.detailAcct}>{d.rider.account_id}</Text> : null}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
                  <Text style={styles.detailSub}>{d.rider?.phone || "—"}</Text>
                  {d.rider?.phone ? (
                    <TouchableOpacity onPress={() => dial(d.rider.phone)} activeOpacity={0.85} style={styles.callBtn}>
                      <Ionicons name="call" size={12} color={colors.onPrimary} />
                      <Text style={styles.callBtnTxt}>Call</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {riderLat && riderLng ? (
                  <Text style={styles.detailSub}>Lat {Number(riderLat).toFixed(5)}, Lng {Number(riderLng).toFixed(5)}</Text>
                ) : null}
              </>
            ) : d.transfer_requested ? (
              <View style={styles.xferPendingBox}>
                <Ionicons name="warning" size={14} color={colors.error} />
                <Text style={styles.xferPendingTxt}>
                  Transfer requested — waiting for a new rider to take over
                </Text>
              </View>
            ) : (
              <Text style={styles.detailSub}>Not yet assigned</Text>
            )}
          </View>

          {(d.previous_riders || []).length > 0 ? (
            <View style={styles.detailBlock} testID="xfer-history-block">
              <Text style={styles.detailHead}>Transfer history</Text>
              {(d.previous_riders as any[]).map((pr, idx) => (
                <View key={idx} style={styles.xferHistRow}>
                  <View style={styles.xferHistDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.xferHistName}>{pr.rider_name || "Rider"}</Text>
                    <Text style={styles.xferHistMeta}>
                      {(pr.reason_label || pr.reason || "released")}
                      {pr.released_at ? ` • ${new Date(pr.released_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}` : ""}
                    </Text>
                    {pr.note ? <Text style={styles.xferHistNote}>“{pr.note}”</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.detailBlock}>
            <Text style={styles.detailHead}>Items ({(d.items || []).length})</Text>
            {(d.items || []).map((it: any, idx: number) => (
              <View key={idx} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }} numberOfLines={1}>{(it.quantity || 1)} × {it.name}</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: font.bold }}>₹{(it.price || 0) * (it.quantity || 1)}</Text>
              </View>
            ))}
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={{ color: colors.textPrimary, fontWeight: font.black }}>Total</Text>
              <Text style={{ color: colors.textPrimary, fontWeight: font.black }}>₹{d.total || 0}</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 8, alignItems: "center" },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: spacing.lg, marginTop: spacing.xs,
    paddingHorizontal: spacing.md, backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, paddingVertical: Platform.OS === "ios" ? 12 : 8, fontSize: 14, color: colors.textPrimary },
  // Order-number highlight (last 4 pill)
  orderNumRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
  orderNumLbl: { fontSize: 10, fontWeight: font.bold, color: colors.textMuted, letterSpacing: 0.6 },
  orderNumPrefix: { fontSize: 13, color: colors.textSecondary, fontWeight: font.bold, letterSpacing: 0.4, fontVariant: ["tabular-nums"] } as any,
  orderNumHighlight: {
    fontSize: 13, fontWeight: font.black, color: colors.primary, letterSpacing: 1,
    paddingHorizontal: 7, paddingVertical: 2, backgroundColor: colors.primarySoft,
    borderRadius: radius.sm, fontVariant: ["tabular-nums"], overflow: "hidden",
  } as any,
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success, marginLeft: 4 },
  liveTxt: { fontSize: 9, fontWeight: font.black, color: colors.success, letterSpacing: 0.6 },
  // Live-track modal
  trackSafe: { flex: 1, backgroundColor: colors.background },
  trackHead: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  trackTitle: { fontSize: 16, fontWeight: font.black, color: colors.textPrimary },
  trackNumPrefix: { fontSize: 12, color: colors.textSecondary, fontWeight: font.bold, letterSpacing: 0.4 },
  trackNumCode: {
    fontSize: 13, fontWeight: font.black, color: colors.primary, letterSpacing: 1,
    paddingHorizontal: 6, paddingVertical: 1, backgroundColor: colors.primarySoft,
    borderRadius: radius.sm, fontVariant: ["tabular-nums"], overflow: "hidden",
  } as any,
  mapPlaceholder: {
    height: 200, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceAlt, marginHorizontal: spacing.lg, marginTop: spacing.md,
    borderRadius: radius.md,
  },
  liveBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.successSoft, borderWidth: 1, borderColor: colors.success + "44",
  },
  liveDotBig: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  liveBannerTxt: { color: colors.success, fontSize: 12, fontWeight: font.bold, flex: 1, lineHeight: 17 },
  detailBlock: {
    marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, ...shadow.card,
  },
  detailHead: { fontSize: 10, fontWeight: font.black, color: colors.textMuted, letterSpacing: 0.8, textTransform: "uppercase" },
  detailPrimary: { fontSize: 15, fontWeight: font.bold, color: colors.textPrimary, marginTop: 4 },
  detailSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
  detailAcct: { fontSize: 11, fontWeight: font.black, color: colors.textSecondary, marginTop: 2, letterSpacing: 0.6 },
  callBtn: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  callBtnTxt: { color: colors.onPrimary, fontSize: 11, fontWeight: font.black },
  // Transfer visualization
  xferTag: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.sm,
    backgroundColor: colors.errorSoft,
  },
  xferTagTxt: { fontSize: 9, fontWeight: font.black, color: colors.error, letterSpacing: 0.6 },
  xferHistTag: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.sm,
    backgroundColor: colors.warningSoft,
  },
  xferHistTagTxt: { fontSize: 9, fontWeight: font.black, color: colors.warning, letterSpacing: 0.6 },
  xferPendingBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 10, borderRadius: radius.md,
    backgroundColor: colors.errorSoft, marginTop: 6,
  },
  xferPendingTxt: { color: colors.error, fontSize: 12, fontWeight: font.bold, flex: 1, lineHeight: 16 },
  xferHistRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 8, paddingLeft: 4 },
  xferHistDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warning, marginTop: 8 },
  xferHistName: { fontSize: 13, fontWeight: font.bold, color: colors.textPrimary },
  xferHistMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  xferHistNote: { fontSize: 11, color: colors.textMuted, fontStyle: "italic", marginTop: 3, lineHeight: 15 },
});
