import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { StatusBadge, Empty } from "@/src/components/ui";

export default function Orders() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const o = await Api.myOrders();
      setOrders(o as any[]);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}><Text style={styles.title}>My Orders</Text></View>
      {orders.length === 0 ? (
        <Empty icon="receipt-outline" title="No orders yet" subtitle="Your order history will appear here" />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(i) => i.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => router.push(`/order/${item.id}` as any)} style={styles.card} activeOpacity={0.85}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.rName} numberOfLines={1}>{item.restaurant_name}</Text>
                <StatusBadge status={item.status} />
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.sm }}>
                {item.items.slice(0, 3).map((i: any) => (
                  <Image key={i.menu_item_id} source={{ uri: i.image }} style={styles.thumb} />
                ))}
              </View>
              <Text style={styles.itemList} numberOfLines={2}>
                {item.items.map((i: any) => `${i.quantity}× ${i.name}`).join(", ")}
              </Text>
              <View style={styles.footer}>
                <Text style={styles.date}>{dayjs(item.placed_at).format("DD MMM, h:mm A")}</Text>
                <Text style={styles.total}>₹{item.total}</Text>
              </View>
              <View style={styles.trackBtn}>
                <Ionicons name="navigate" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: font.bold, fontSize: 12 }}>VIEW DETAILS</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 20, fontWeight: font.black, color: colors.textPrimary },
  card: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  rName: { fontSize: 16, fontWeight: font.bold, color: colors.textPrimary, flex: 1, marginRight: 8 },
  thumb: { width: 44, height: 44, borderRadius: 6 },
  itemList: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.sm },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, borderStyle: "dashed" },
  date: { fontSize: 12, color: colors.textMuted },
  total: { fontSize: 16, fontWeight: font.black, color: colors.textPrimary },
  trackBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.primarySoft, borderRadius: radius.pill },
});
