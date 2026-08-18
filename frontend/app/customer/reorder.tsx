import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { Api } from "@/src/api";
import { useCart } from "@/src/cart";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Empty } from "@/src/components/ui";
import { notify } from "@/src/utils/confirm";

/**
 * Reorder tab — lists the customer's recent orders. Each card shows the
 * restaurant, items, total and a prominent "Reorder" button that instantly
 * refills the cart with the same items and jumps to the cart screen.
 */
export default function Reorder() {
  const router = useRouter();
  const { add, clear, restaurantId } = useCart();
  const [orders, setOrders] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const o: any = await Api.myOrders();
      const arr = Array.isArray(o) ? o : [];
      // Keep unique restaurants (most recent first)
      setOrders(arr);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const doReorder = async (order: any) => {
    if (busyId) return;
    setBusyId(order.id);
    try {
      // If cart currently has items from a different restaurant, clear first.
      if (restaurantId && restaurantId !== order.restaurant_id) {
        await clear();
      }
      // Re-add each item quantity times.
      const items = Array.isArray(order.items) ? order.items : [];
      for (const it of items) {
        const qty = Math.max(1, Number(it.quantity || 1));
        for (let i = 0; i < qty; i++) {
          await add({
            menu_item_id: it.menu_item_id,
            name: it.name,
            price: it.price,
            image: it.image,
            restaurant_id: order.restaurant_id,
            restaurant_name: order.restaurant_name,
          });
        }
      }
      notify("Items added to cart", `${items.length} item(s) from ${order.restaurant_name} added.`);
      router.push("/customer/cart" as any);
    } catch (e: any) {
      notify("Could not reorder", e?.message || "Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Reorder</Text>
          <Text style={styles.subtitle}>Your recent orders — one tap to re-add to cart</Text>
        </View>
        <TouchableOpacity onPress={() => router.push("/customer/orders" as any)} style={styles.allBtn} activeOpacity={0.8}>
          <Text style={{ color: colors.primary, fontWeight: font.bold, fontSize: 12 }}>All Orders</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 60, alignItems: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : orders.length === 0 ? (
        <Empty icon="repeat" title="Nothing to reorder yet" subtitle="Place your first order and it will show up here for quick reorder." />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(i) => i.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 100 }}
          renderItem={({ item }) => {
            const isBusy = busyId === item.id;
            return (
              <View style={styles.card}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={styles.rIcon}>
                    <Ionicons name="storefront" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rName} numberOfLines={1}>{item.restaurant_name}</Text>
                    <Text style={styles.date}>{dayjs(item.placed_at).format("DD MMM, h:mm A")} • {String(item.status || "").toUpperCase()}</Text>
                  </View>
                  <Text style={styles.total}>₹{item.total}</Text>
                </View>

                <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
                  {(item.items || []).slice(0, 4).map((i: any) => (
                    <Image key={i.menu_item_id} source={{ uri: i.image }} style={styles.thumb} />
                  ))}
                  {(item.items || []).length > 4 && (
                    <View style={[styles.thumb, styles.thumbMore]}>
                      <Text style={{ color: colors.textSecondary, fontWeight: font.bold, fontSize: 11 }}>+{item.items.length - 4}</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.itemList} numberOfLines={2}>
                  {(item.items || []).map((i: any) => `${i.quantity}× ${i.name}`).join(", ")}
                </Text>

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    onPress={() => router.push(`/order/${item.id}` as any)}
                    style={[styles.actionBtn, styles.actionSecondary]}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="eye" size={14} color={colors.textPrimary} />
                    <Text style={{ color: colors.textPrimary, fontWeight: font.bold, fontSize: 12 }}>Details</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => doReorder(item)}
                    disabled={isBusy}
                    style={[styles.actionBtn, styles.actionPrimary, { opacity: isBusy ? 0.6 : 1 }]}
                    activeOpacity={0.85}
                    testID={`reorder-${item.id}`}
                  >
                    {isBusy ? (
                      <ActivityIndicator size="small" color={colors.onPrimary} />
                    ) : (
                      <>
                        <Ionicons name="repeat" size={14} color={colors.onPrimary} />
                        <Text style={{ color: colors.onPrimary, fontWeight: font.black, fontSize: 12 }}>Reorder</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 20, fontWeight: font.black, color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  allBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  rIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rName: { fontSize: 15, fontWeight: font.black, color: colors.textPrimary },
  date: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  total: { fontSize: 15, fontWeight: font.black, color: colors.primary },
  thumb: { width: 46, height: 46, borderRadius: 8 },
  thumbMore: { backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  itemList: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 17 },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  actionSecondary: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  actionPrimary: { backgroundColor: colors.primary },
});
