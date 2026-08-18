import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { useSmartBack } from "@/src/utils/nav";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { Empty } from "@/src/components/ui";

type Notif = {
  id: string; type: string; title: string; body: string; read: boolean;
  created_at: string; item_id?: string; restaurant_id?: string;
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const s = Math.floor((Date.now() - then) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

const META: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  item_approved: { icon: "checkmark-circle", color: colors.success, bg: colors.successSoft },
  item_rejected: { icon: "close-circle", color: colors.error, bg: colors.errorSoft },
  new_order: { icon: "bag-check", color: colors.primary, bg: colors.primarySoft },
  rider_assigned: { icon: "bicycle", color: colors.success, bg: colors.successSoft },
};

const ORDER_TYPES = ["new_order", "rider_assigned"];

export default function OwnerNotifications() {
  const router = useRouter();
  const goBack = useSmartBack();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = (await Api.ownerNotifications()) as Notif[];
      setItems(list || []);
      // Mark everything read once viewed
      if ((list || []).some((n) => !n.read)) {
        Api.ownerNotifReadAll().catch(() => {});
      }
    } catch (e) {
      /* noop */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity testID="notif-back" onPress={goBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.sub}>Updates on your menu items</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <Empty icon="notifications-off" title="No notifications yet" subtitle="You'll be notified here when admin approves or rejects your menu items" />
        ) : (
          items.map((n) => {
            const m = META[n.type] || { icon: "notifications", color: colors.primary, bg: colors.primarySoft };
            return (
              <TouchableOpacity
                key={n.id}
                testID={`notif-row-${n.id}`}
                activeOpacity={0.8}
                onPress={() => router.push(ORDER_TYPES.includes(n.type) ? "/owner/orders" : "/owner/menu")}
                style={[styles.row, !n.read && styles.rowUnread]}
              >
                <View style={[styles.icon, { backgroundColor: m.bg }]}>
                  <Ionicons name={m.icon} size={20} color={m.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{n.title}</Text>
                    {!n.read ? <View style={styles.unreadDot} /> : null}
                  </View>
                  <Text style={styles.rowBody}>{n.body}</Text>
                  <Text style={styles.rowTime}>{timeAgo(n.created_at)}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: font.black, color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  row: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  rowUnread: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: font.bold, color: colors.textPrimary, flexShrink: 1 },
  rowBody: { fontSize: 13, color: colors.textSecondary, marginTop: 3, lineHeight: 18 },
  rowTime: { fontSize: 11, color: colors.textMuted, marginTop: 6, fontWeight: font.semi },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
});
