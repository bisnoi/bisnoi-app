import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, radius, font, spacing } from "@/src/theme";
import { startRing, stopRing, playChime, playPickup, primeAudio, startDineinVoiceAlert, stopDineinVoiceAlert, dineinVoiceMessage } from "@/src/utils/ring";

type Toast = { title: string; body: string; role: string } | null;

/**
 * Global order-alert engine (web PWA). Mounted once at the app root.
 * - Restaurant owner: loud looping "tring tring" while there are unread new-order
 *   notifications; an on-screen banner lets them View & silence.
 * - Rider: short beep + toast when a new pickup becomes available.
 * - Customer: pleasant chime + toast on every order status update.
 */
export default function OrderAlerts() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [ownerCount, setOwnerCount] = useState(0);
  const [hasDinein, setHasDinein] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const toastTimer = useRef<any>(null);
  const snoozedRef = useRef<Set<string>>(new Set());
  const placedIdsRef = useRef<string[]>([]);
  const dineinPlacedIdsRef = useRef<string[]>([]);
  const dineinTableLabelsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!user) {
      stopRing();
      setOwnerCount(0);
      return;
    }

    const prime = () => primeAudio();
    const hasWebListeners = typeof window !== "undefined" && typeof window.addEventListener === "function";
    if (hasWebListeners) {
      window.addEventListener("pointerdown", prime);
      window.addEventListener("keydown", prime);
    }

    const seen = new Set<string>();
    let initialized = false;

    const showToast = (title: string, body: string, role: string) => {
      setToast({ title, body, role });
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 6000);
    };

    const poll = async () => {
      try {
        if (user.role === "restaurant_owner") {
          const [ordersRes, dineinRes] = await Promise.all([
            Api.myOrders().catch(() => []),
            Api.ownerDineinOrders("placed").catch(() => []),
          ]);
          const placedDelivery = ((ordersRes as any[]) || []).filter((o) => o.status === "placed");
          const placedDinein = ((dineinRes as any[]) || []); // backend already filters status=placed
          const placed = [...placedDelivery, ...placedDinein];
          const placedIds = placed.map((o) => o.id);
          placedIdsRef.current = placedIds;
          dineinPlacedIdsRef.current = placedDinein.map((o) => o.id);
          // forget snoozed ids that are no longer pending (e.g. owner accepted them)
          Array.from(snoozedRef.current).forEach((id) => {
            if (!placedIds.includes(id)) snoozedRef.current.delete(id);
          });
          const ringable = placed.filter((o) => !snoozedRef.current.has(o.id));
          const ringableDinein = placedDinein.filter((o) => !snoozedRef.current.has(o.id));
          dineinTableLabelsRef.current = ringableDinein.map((o: any) => o.table_label).filter(Boolean);
          if (ringable.length > 0) {
            // Dine-in orders get a distinct "door chime"; online/delivery gets the telephone bell.
            startRing(ringableDinein.length > 0 ? "dinein" : "online");
            setOwnerCount(ringable.length);
            setHasDinein(ringableDinein.length > 0);
            if (ringableDinein.length > 0) {
              startDineinVoiceAlert(() => dineinVoiceMessage(dineinTableLabelsRef.current));
            } else {
              stopDineinVoiceAlert();
            }
          } else {
            stopRing();
            stopDineinVoiceAlert();
            setOwnerCount(0);
            setHasDinein(false);
          }
        } else {
          const list: any[] = (await Api.notifications()) as any[];
          const type = user.role === "rider" ? "pickup_available" : "order_update";
          const unread = (list || []).filter((n) => !n.read && n.type === type);
          if (!initialized) {
            unread.forEach((n) => seen.add(n.id));
            initialized = true;
          } else {
            const fresh = unread.filter((n) => !seen.has(n.id));
            if (fresh.length > 0) {
              fresh.forEach((n) => seen.add(n.id));
              if (user.role === "rider") playPickup();
              else playChime();
              showToast(fresh[0].title, fresh[0].body, user.role);
            }
          }
        }
      } catch {
        /* ignore polling errors */
      }
    };

    poll();
    const id = setInterval(poll, 5000);
    return () => {
      clearInterval(id);
      clearTimeout(toastTimer.current);
      stopRing();
      stopDineinVoiceAlert();
      if (hasWebListeners) {
        window.removeEventListener("pointerdown", prime);
        window.removeEventListener("keydown", prime);
      }
    };
  }, [user?.id, user?.role]);

  const ackOwner = async (navigate: boolean) => {
    primeAudio();
    stopRing();
    stopDineinVoiceAlert();
    const goDinein = hasDinein;
    setOwnerCount(0);
    setHasDinein(false);
    // snooze the currently-pending orders so the ring doesn't immediately restart;
    // it will ring again only when a NEW order arrives (or these are accepted).
    placedIdsRef.current.forEach((id) => snoozedRef.current.add(id));
    try { await Api.ownerNotifReadAll(); } catch {}
    // mark pending dine-in orders accepted so they don't ring again on reload
    try {
      await Promise.all(dineinPlacedIdsRef.current.map((id) => Api.ownerAcceptDineinOrder(id).catch(() => {})));
    } catch {}
    if (navigate) router.push((goDinein ? "/owner/pos" : "/owner/orders") as any);
  };

  if (!user) return null;

  const top = (insets.top || 0) + 8;

  // Owner: persistent loud new-order banner
  if (user.role === "restaurant_owner" && ownerCount > 0) {
    return (
      <View pointerEvents="box-none" style={[styles.wrap, { top }]}>
        <TouchableOpacity
          testID="owner-new-order-banner"
          activeOpacity={0.9}
          onPress={() => ackOwner(true)}
          style={[styles.card, { backgroundColor: colors.primary, borderColor: colors.primaryDark }]}
        >
          <View style={styles.iconCircleDark}>
            <Ionicons name="notifications" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.onPrimary }]} numberOfLines={1}>
              🔔 {hasDinein ? "New dine-in order" : "New order"}{ownerCount > 1 ? `s (${ownerCount})` : ""}!
            </Text>
            <Text style={[styles.body, { color: colors.onPrimary }]} numberOfLines={1}>
              {hasDinein ? "Tap to open dine-in section" : "Tap to view orders"}
            </Text>
          </View>
          <TouchableOpacity
            testID="owner-silence-btn"
            onPress={() => ackOwner(false)}
            style={styles.silenceBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="volume-mute" size={18} color={colors.onPrimary} />
            <Text style={[styles.silenceText, { color: colors.onPrimary }]}>Silence</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
    );
  }

  // Rider / Customer: transient toast
  if (toast) {
    const isRider = toast.role === "rider";
    return (
      <View pointerEvents="box-none" style={[styles.wrap, { top }]}>
        <TouchableOpacity
          testID="alert-toast"
          activeOpacity={0.9}
          onPress={() => {
            setToast(null);
            router.push((isRider ? "/rider/notifications" : "/customer/orders") as any);
          }}
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name={isRider ? "bicycle" : "fast-food"} size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{toast.title}</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={2}>{toast.body}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    zIndex: 9999,
  },
  card: {
    width: "100%",
    maxWidth: 640,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    boxShadow: "0px 8px 24px rgba(0,0,0,0.35)",
    elevation: 8,
  },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  iconCircleDark: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  title: { fontSize: 14, fontWeight: font.black },
  body: { fontSize: 12, fontWeight: font.med, marginTop: 1 },
  silenceBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.18)" },
  silenceText: { fontSize: 12, fontWeight: font.bold },
});
