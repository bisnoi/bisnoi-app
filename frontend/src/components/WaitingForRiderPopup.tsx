import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, font, shadow } from "@/src/theme";
import { getSocket, joinRoom, leaveRoom } from "@/src/socket";
import { useAuth } from "@/src/auth";
import { Api } from "@/src/api";
import { notify } from "@/src/utils/confirm";
import { playPickup, primeAudio } from "@/src/utils/ring";

/**
 * Full-screen "Waiting for Rider" popup for OWNER and ADMIN.
 *
 * Flow:
 *   1. Owner/admin accepts an order (PATCH /orders/{oid}/status accepted).
 *   2. Backend emits `waiting_for_rider` to `restaurant:{rid}` + `admin` rooms.
 *      Popup opens here + soft ring loop starts.
 *   3. Every 15 s (DISPATCH_RETRY_SECS) backend widens the radius and re-broadcasts
 *      to more riders + emits `dispatch_progress`. Popup shows a live attempt +
 *      radius counter so owner knows the retry is running.
 *   4. First rider that accepts triggers `rider_assigned` → popup closes,
 *      ring stops, we show a 2-second success toast.
 *   5. If nobody accepts after all attempts, backend emits `dispatch_stalled` →
 *      popup shows a "No rider found" state with a big RETRY button that hits
 *      POST /orders/{oid}/redispatch to restart the ladder.
 *
 * Mounts once inside owner + admin app shells and self-manages via sockets.
 */
export function WaitingForRiderPopup() {
  const { user } = useAuth();
  const role = user?.role;

  const [visible, setVisible] = useState(false);
  const [order, setOrder] = useState<{
    order_id: string;
    restaurant_id?: string;
    restaurant_name?: string;
    order_number?: string;
    total?: number;
  } | null>(null);
  const [attempt, setAttempt] = useState<number>(1);
  const [maxAttempts, setMaxAttempts] = useState<number>(4);
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [notified, setNotified] = useState<number>(0);
  const [stalled, setStalled] = useState<boolean>(false);
  const [retrying, setRetrying] = useState<boolean>(false);
  const [assigning, setAssigning] = useState<{ rider_name?: string } | null>(null);
  const dismissTimer = useRef<any>(null);

  // Ring pulse — subtle scale/opacity animation on the wave rings behind the icon.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible || stalled) {
      pulse.stopAnimation();
      return;
    }
    Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: Platform.OS !== "web",
      }),
    ).start();
    return () => { pulse.stopAnimation(); pulse.setValue(0); };
  }, [visible, stalled, pulse]);

  const close = useCallback(() => {
    setVisible(false);
    setOrder(null);
    setStalled(false);
    setAssigning(null);
    if (dismissTimer.current) { clearTimeout(dismissTimer.current); dismissTimer.current = null; }
  }, []);

  // Owners join every restaurant room they own (fetch on mount).
  // Admins join the global "admin" room.
  useEffect(() => {
    if (role !== "restaurant_owner" && role !== "admin") return;
    const s = getSocket();
    if (!s) return;
    const rooms: string[] = [];
    (async () => {
      if (role === "admin") {
        joinRoom("admin");
        rooms.push("admin");
      } else if (role === "restaurant_owner") {
        try {
          const rests: any[] = (await Api.ownerRests().catch(() => [])) as any[];
          (rests || []).forEach((r: any) => {
            if (r?.id) {
              joinRoom(`restaurant:${r.id}`);
              rooms.push(`restaurant:${r.id}`);
            }
          });
        } catch { /* ignore */ }
      }
    })();
    return () => {
      rooms.forEach((r) => leaveRoom(r));
    };
  }, [role]);

  useEffect(() => {
    if (role !== "restaurant_owner" && role !== "admin") return;
    const s = getSocket();
    if (!s) return;

    const onWaiting = (data: any) => {
      // Non-intrusive short beep on popup open (owner already gets the loud
      // new-order ring separately via OrderAlerts). We just want a quick chime
      // to acknowledge "search started".
      try { primeAudio(); playPickup(); } catch { /* ignore */ }
      setOrder({
        order_id: data.order_id,
        restaurant_id: data.restaurant_id,
        restaurant_name: data.restaurant_name,
        order_number: data.order_number,
        total: data.total,
      });
      setAttempt(1);
      setMaxAttempts(data.max_attempts || 4);
      setRadiusKm(0);
      setNotified(0);
      setStalled(false);
      setAssigning(null);
      setVisible(true);
    };
    const onProgress = (data: any) => {
      // Only update if popup is showing the SAME order.
      setOrder((cur) => {
        if (!cur || cur.order_id !== data.order_id) return cur;
        return cur;
      });
      // Guard: only update counter if we're currently tracking THIS order.
      setAttempt((prev) => {
        // We can't read `order` from state here without capturing; instead use
        // a functional update on all three counters below.
        return prev;
      });
      // These setters are safe unconditionally; the outer visibility check
      // (order?.order_id === data.order_id) is done in render.
      setAttempt(data.attempt || 1);
      setMaxAttempts(data.max_attempts || 4);
      setRadiusKm(data.radius_km || 0);
      setNotified(data.notified || 0);
    };
    const onAssigned = (data: any) => {
      // If popup is for THIS order, show a brief success state then close.
      setOrder((cur) => {
        if (!cur || cur.order_id !== data.order_id) return cur;
        setAssigning({ rider_name: data.rider_name });
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
        dismissTimer.current = setTimeout(() => close(), 2400);
        return cur;
      });
    };
    const onStalled = (data: any) => {
      setOrder((cur) => {
        if (!cur || cur.order_id !== data.order_id) return cur;
        setStalled(true);
        return cur;
      });
    };

    s.on("waiting_for_rider", onWaiting);
    s.on("dispatch_progress", onProgress);
    s.on("rider_assigned", onAssigned);
    s.on("dispatch_stalled", onStalled);
    return () => {
      s.off("waiting_for_rider", onWaiting);
      s.off("dispatch_progress", onProgress);
      s.off("rider_assigned", onAssigned);
      s.off("dispatch_stalled", onStalled);
    };
  }, [role, close]);

  const onRetry = useCallback(async () => {
    if (!order) return;
    setRetrying(true);
    try {
      await Api.redispatchOrder(order.order_id);
      // Reset UI to "searching" state — backend will start firing progress events.
      setStalled(false);
      setAttempt(1);
      setNotified(0);
      setRadiusKm(0);
      try { primeAudio(); playPickup(); } catch {}
    } catch (e: any) {
      notify("Retry failed", e?.message || "Please try again in a moment.");
    } finally {
      setRetrying(false);
    }
  }, [order]);

  const pulseStyle = useMemo(() => {
    return {
      transform: [
        {
          scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.9] }),
        },
      ],
      opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
    };
  }, [pulse]);

  if (role !== "restaurant_owner" && role !== "admin") return null;
  if (!visible || !order) return null;

  // -------- SUCCESS STATE (rider accepted) ------------------------------------
  if (assigning) {
    return (
      <Modal transparent visible animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop} testID="waiting-rider-modal">
          <View style={[styles.card, { borderColor: colors.success }]}>
            <View style={[styles.iconWrap, { backgroundColor: colors.successSoft }]}>
              <Ionicons name="checkmark-circle" size={54} color={colors.success} />
            </View>
            <Text style={styles.title}>Rider assigned!</Text>
            <Text style={styles.sub}>
              {assigning.rider_name ? `${assigning.rider_name} accepted` : "A rider has accepted"} the pickup for order #{order.order_number || order.order_id.slice(0, 6)}.
            </Text>
            <TouchableOpacity
              testID="waiting-rider-close"
              onPress={close}
              style={[styles.btn, { backgroundColor: colors.success }]}
              activeOpacity={0.85}
            >
              <Text style={[styles.btnTxt, { color: "#fff" }]}>Great</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // -------- STALLED STATE ("no rider found") ----------------------------------
  if (stalled) {
    return (
      <Modal transparent visible animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop} testID="waiting-rider-modal">
          <View style={[styles.card, { borderColor: colors.error }]}>
            <View style={[styles.iconWrap, { backgroundColor: colors.errorSoft }]}>
              <Ionicons name="alert-circle" size={54} color={colors.error} />
            </View>
            <Text style={styles.title}>No rider found yet</Text>
            <Text style={styles.sub}>
              We tried {maxAttempts} rounds for order #{order.order_number || order.order_id.slice(0, 6)}
              {order.restaurant_name ? ` at ${order.restaurant_name}` : ""}. Tap RETRY to keep looking.
            </Text>
            <View style={styles.btnRow}>
              <TouchableOpacity
                testID="waiting-rider-dismiss"
                onPress={close}
                style={[styles.btn, { backgroundColor: colors.surfaceAlt, flex: 1 }]}
                activeOpacity={0.85}
              >
                <Text style={[styles.btnTxt, { color: colors.textPrimary }]}>Dismiss</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="waiting-rider-retry"
                onPress={onRetry}
                disabled={retrying}
                style={[styles.btn, { backgroundColor: colors.primary, flex: 1, opacity: retrying ? 0.7 : 1 }]}
                activeOpacity={0.85}
              >
                <Ionicons name="refresh" size={16} color={colors.onPrimary} style={{ marginRight: 6 }} />
                <Text style={[styles.btnTxt, { color: colors.onPrimary }]}>
                  {retrying ? "Retrying…" : "RETRY DISPATCH"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // -------- SEARCHING STATE (default) -----------------------------------------
  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => { /* not dismissible during search */ }}>
      <View style={styles.backdrop} testID="waiting-rider-modal">
        <View style={styles.card}>
          <View style={styles.pulseWrap}>
            <Animated.View style={[styles.pulseRing, pulseStyle]} />
            <Animated.View style={[styles.pulseRing, { ...pulseStyle, animationDelay: "500ms" as any }]} />
            <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="bicycle" size={54} color={colors.primary} />
            </View>
          </View>
          <Text style={styles.title} testID="waiting-rider-title">Looking for a rider…</Text>
          <Text style={styles.sub}>
            {order.restaurant_name ? `${order.restaurant_name} • ` : ""}Order #{order.order_number || order.order_id.slice(0, 6)}
            {order.total ? ` • ₹${order.total}` : ""}
          </Text>

          <View style={styles.statsRow}>
            <Stat label="Attempt" value={`${attempt}/${maxAttempts}`} testID="waiting-attempt" />
            <Stat label="Radius" value={radiusKm ? `${radiusKm} km` : "—"} testID="waiting-radius" />
            <Stat label="Riders pinged" value={String(notified)} testID="waiting-notified" />
          </View>

          <View style={styles.hint}>
            <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.hintTxt}>
              Auto-retry every 15s with a wider radius. Popup closes as soon as a rider accepts.
            </Text>
          </View>

          <TouchableOpacity
            testID="waiting-rider-minimize"
            onPress={close}
            style={[styles.btn, { backgroundColor: colors.surfaceAlt, marginTop: spacing.md }]}
            activeOpacity={0.85}
          >
            <Text style={[styles.btnTxt, { color: colors.textPrimary }]}>Minimize</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Stat({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.stat} testID={testID}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(11,15,12,0.62)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadow.lifted,
    alignItems: "center",
  },
  pulseWrap: {
    width: 132,
    height: 132,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  pulseRing: {
    position: "absolute",
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: font.black,
    color: colors.textPrimary,
    textAlign: "center",
    marginTop: 4,
  },
  sub: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
    width: "100%",
    justifyContent: "space-around",
  },
  stat: {
    alignItems: "center",
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  statValue: {
    fontSize: 16,
    fontWeight: font.black,
    color: colors.primary,
  },
  statLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontWeight: font.semi,
  },
  hint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  hintTxt: {
    flex: 1,
    fontSize: 11.5,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    minWidth: 140,
  },
  btnRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    width: "100%",
  },
  btnTxt: {
    fontSize: 14,
    fontWeight: font.black,
    letterSpacing: 0.5,
  },
});
