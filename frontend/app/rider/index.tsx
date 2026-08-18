import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert } from "react-native";
import { notify } from "@/src/utils/confirm";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, spacing, radius, font } from "@/src/theme";
import { Card, StatusBadge, Empty, Button } from "@/src/components/ui";
import { RiderOfferBanner } from "@/src/components/RiderOfferBanner";
import { NearbyRestaurantsMap } from "@/src/components/NearbyRestaurantsMap";
import { useCachedLocation } from "@/src/components/LocationPrompt";
import { getSocket, joinRoom, leaveRoom } from "@/src/socket";
import { playPickup, primeAudio } from "@/src/utils/ring";
import { useRiderLocationShare } from "@/src/utils/useRiderLocationShare";

export default function RiderHome() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const { start: startShare } = useRiderLocationShare();
  const [feed, setFeed] = useState<any[]>([]);
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  // Online/offline: default to true so riders that have never toggled remain
  // discoverable. `user.is_online === false` means they've explicitly gone offline.
  const [online, setOnline] = useState<boolean>((user as any)?.is_online !== false);
  const [togglingOnline, setTogglingOnline] = useState(false);

  useEffect(() => {
    setOnline((user as any)?.is_online !== false);
  }, [user]);

  // Cached rider location for centering the map (falls back to Bengaluru
  // when the LocationPrompt hasn't been resolved yet). Subscribed rather than
  // read once, since the first GPS fix lands after this screen has mounted.
  const cachedGeo = useCachedLocation();
  const riderCenter = useMemo(
    () => (cachedGeo ? { lat: cachedGeo.lat, lng: cachedGeo.lng } : null),
    [cachedGeo],
  );

  const toggleOnline = async () => {
    const next = !online;
    setTogglingOnline(true);
    setOnline(next); // optimistic
    try {
      await Api.setRiderOnline(next);
      await refresh();
      if (next) {
        // When going back online, immediately re-poll the feed.
        load();
      } else {
        setFeed([]);
      }
    } catch (e: any) {
      setOnline(!next); // revert
      notify("Couldn't update status", e?.message || "Try again in a moment.");
    } finally {
      setTogglingOnline(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const [f, r] = await Promise.all([
        Api.availableForRider() as Promise<any[]>,
        Api.restaurants().catch(() => []) as Promise<any[]>,
      ]);
      setFeed(f);
      setRestaurants(r || []);
    } catch (e: any) {
      console.warn(e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime bell: join the "riders" room and re-poll + chime when the server
  // fans out a new pickup. This gets the rider a bell BEFORE the 5-second
  // OrderAlerts polling cycle catches up — critical when many riders are all
  // racing for the same order.
  useEffect(() => {
    if (user?.role !== "rider") return;
    const s = getSocket();
    if (!s) return;
    joinRoom("riders");
    const onPickup = () => {
      try { primeAudio(); playPickup(); } catch { /* ignore */ }
      load();
    };
    s.on("pickup_available", onPickup);
    return () => {
      s.off("pickup_available", onPickup);
      leaveRoom("riders");
    };
  }, [user?.role, load]);

  const accept = async (oid: string) => {
    setAccepting(oid);
    try {
      await Api.assignRider(oid);
      // Start pushing this rider's live GPS the moment they take the order —
      // no separate manual "share location" step needed.
      try { startShare(oid); } catch { /* ignore — user can still share manually */ }
      notify("Accepted", "Order assigned. Find it under My Deliveries.");
      load();
      setTimeout(() => router.push("/rider/orders" as any), 250);
    } catch (e: any) {
      notify("Cannot accept", e.message);
    } finally {
      setAccepting(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.titleBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hi}>Hey, {user?.name || "Rider"} 🛵</Text>
          <Text style={styles.sub}>
            {online
              ? `${feed.length} order${feed.length === 1 ? "" : "s"} ready for pickup`
              : "You're offline — no new orders will come in"}
          </Text>
        </View>
        <TouchableOpacity
          testID="rider-online-toggle"
          onPress={toggleOnline}
          disabled={togglingOnline}
          activeOpacity={0.85}
          style={[
            styles.onlinePill,
            {
              backgroundColor: online ? "#DCFCE7" : "#FEE2E2",
              borderColor: online ? "#86EFAC" : "#FCA5A5",
              opacity: togglingOnline ? 0.6 : 1,
            },
          ]}
        >
          <View
            style={[
              styles.onlineDot,
              { backgroundColor: online ? "#16A34A" : "#DC2626" },
            ]}
          />
          <Text
            style={[
              styles.onlineTxt,
              { color: online ? "#15803D" : "#B91C1C" },
            ]}
          >
            {online ? "ONLINE" : "OFFLINE"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="rider-reports-link"
          onPress={() => router.push("/rider/reports" as any)}
          style={styles.headerBtn}
          activeOpacity={0.85}
        >
          <Ionicons name="stats-chart-outline" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          testID="rider-complaints-link"
          onPress={() => router.push("/rider/complaints" as any)}
          style={styles.headerBtn}
          activeOpacity={0.85}
        >
          <Ionicons name="alert-circle-outline" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {/* Top-of-feed rewards / peak-bonus / referral banners */}
        <RiderOfferBanner />

        {/* Nearby restaurants mini-map (green pins on each outlet with lat/lng) */}
        {restaurants.length > 0 ? (
          <View style={{ marginBottom: spacing.md }}>
            <View style={styles.sectionHead}>
              <Ionicons name="map" size={14} color={colors.textSecondary} />
              <Text style={styles.sectionTitle}>NEARBY RESTAURANTS</Text>
              <Text style={styles.sectionCount}>{restaurants.length}</Text>
            </View>
            <NearbyRestaurantsMap center={riderCenter} restaurants={restaurants} height={220} />
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : feed.length === 0 ? (
          <Empty icon="flash-off" title="No orders right now" subtitle="Pull down to refresh and check again" />
        ) : (
          feed.map((o) => {
            const isTransfer = !!o.transfer_requested;
            const prev = isTransfer && (o.previous_riders || []).length > 0
              ? o.previous_riders[o.previous_riders.length - 1]
              : null;
            return (
              <Card key={o.id} style={{ marginBottom: spacing.md, borderColor: isTransfer ? colors.error : undefined, borderWidth: isTransfer ? 1.5 : undefined }}>
                {isTransfer ? (
                  <View style={styles.xferBanner} testID={`feed-transfer-${o.id}`}>
                    <Ionicons name="swap-horizontal" size={14} color={colors.error} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.xferBannerTitle}>Takeover from another rider</Text>
                      <Text style={styles.xferBannerSub}>
                        {prev?.rider_name || "A rider"} released this order
                        {prev?.reason_label ? ` (${prev.reason_label.toLowerCase()})` : ""}
                        {prev?.note ? ` — “${prev.note}”` : ""}
                      </Text>
                    </View>
                  </View>
                ) : null}

                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontSize: 15, fontWeight: font.bold, color: colors.textPrimary }}>{o.restaurant_name}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                      <Ionicons name="location" size={13} color={colors.textSecondary} />
                      <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }} numberOfLines={1}>
                        {o.address?.line || "Customer address"}
                      </Text>
                    </View>
                  </View>
                  <StatusBadge status={o.status} />
                </View>

                <View style={styles.metaRow}>
                  <Meta icon="receipt" label={`${o.items.length} items`} />
                  <Meta icon="cash" label={`₹${o.total}`} />
                  <Meta icon="card" label={o.payment_method?.toUpperCase()} />
                </View>

                <Button
                  title={accepting === o.id
                    ? (isTransfer ? "Taking over…" : "Accepting…")
                    : (isTransfer ? "Take over this delivery" : "Accept Delivery")}
                  icon={isTransfer ? "swap-horizontal" : "checkmark-circle"}
                  onPress={() => accept(o.id)}
                  loading={accepting === o.id}
                  full
                />
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Meta({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Ionicons name={icon} size={13} color={colors.textSecondary} />
      <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: font.semi }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  titleBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  headerBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 11, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.8, textTransform: "uppercase" },
  sectionCount: { fontSize: 11, fontWeight: font.bold, color: colors.textMuted, marginLeft: 4 },
  onlinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  onlineTxt: { fontSize: 11, fontWeight: font.black, letterSpacing: 0.6 },
  hi: { fontSize: 22, fontWeight: font.black, color: colors.textPrimary },
  sub: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  metaRow: { flexDirection: "row", gap: 16, marginTop: spacing.sm, marginBottom: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  xferBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    padding: 10, borderRadius: radius.md,
    backgroundColor: colors.errorSoft, marginBottom: spacing.sm,
  },
  xferBannerTitle: { fontSize: 11, fontWeight: font.black, color: colors.error, letterSpacing: 0.6, textTransform: "uppercase" },
  xferBannerSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
});
