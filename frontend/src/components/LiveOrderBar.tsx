import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, spacing, radius, font, shadow } from "@/src/theme";

const ACTIVE_STATUSES = ["placed", "accepted", "preparing", "ready", "picked"];

const STATUS_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  placed: { label: "Order placed", icon: "receipt-outline" },
  accepted: { label: "Order accepted", icon: "checkmark-circle-outline" },
  preparing: { label: "Preparing your food", icon: "restaurant-outline" },
  ready: { label: "Ready for pickup", icon: "fast-food-outline" },
  picked: { label: "On The Way", icon: "bicycle-outline" },
};

/**
 * Thin live-order status bar — shown above the floating tab pill (home) or
 * above the sticky cart bar (restaurant menu page). Polls for the customer's
 * active order and hides itself automatically once delivered/cancelled.
 */
export function LiveOrderBar({ bottom }: { bottom: number }) {
  const router = useRouter();
  const { user } = useAuth();
  const [order, setOrder] = useState<any>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const scootAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!user) { setOrder(null); return; }
    let mounted = true;
    const load = async () => {
      try {
        const list: any[] = await Api.myOrders();
        const active = (list || []).find((o: any) => ACTIVE_STATUSES.includes(o.status));
        if (mounted) setOrder(active || null);
      } catch {
        /* ignore — keep last known state */
      }
    };
    load();
    pollTimer.current = setInterval(load, 8000);
    return () => {
      mounted = false;
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [user]);

  useEffect(() => {
    if (order?.status === "picked") {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(scootAnim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(scootAnim, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [order?.status, scootAnim]);

  if (!order) return null;
  const meta = STATUS_META[order.status] || STATUS_META.placed;
  const translateX = scootAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 14] });

  return (
    <TouchableOpacity
      testID="live-order-bar"
      activeOpacity={0.9}
      onPress={() => router.push(`/order/${order.id}` as any)}
      style={[styles.bar, { bottom }]}
    >
      <Animated.View
        style={[styles.iconWrap, order.status === "picked" ? { transform: [{ translateX }] } : null]}
      >
        <Ionicons name={meta.icon} size={18} color="#fff" />
      </Animated.View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label} numberOfLines={1}>{meta.label}</Text>
        <Text style={styles.sub} numberOfLines={1}>{order.restaurant_name}</Text>
      </View>
      <Text style={styles.amount}>₹{order.total}</Text>
      <Ionicons name="chevron-forward" size={16} color="#fff" style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    ...shadow.lifted,
  },
  iconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  label: { color: "#fff", fontWeight: font.black, fontSize: 13 },
  sub: { color: "#FBE6E1", fontSize: 11, marginTop: 1 },
  amount: { color: "#fff", fontWeight: font.black, fontSize: 14 },
});
