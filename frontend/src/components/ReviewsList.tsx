import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Card, Empty } from "@/src/components/ui";

type Review = {
  id: string;
  restaurant_id: string;
  restaurant_name?: string;
  order_id?: string | null;
  user_name: string;
  rating: number;
  comment: string;
  created_at: string;
};
type Data = { count: number; average: number; reviews: Review[] };

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= Math.round(value) ? "star" : "star-outline"}
          size={size}
          color={colors.primary}
        />
      ))}
    </View>
  );
}

function fmtDate(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

export function ReviewsList({
  fetcher,
  emptyTitle = "No reviews yet",
  emptySubtitle = "Reviews will appear here once customers start rating.",
  accent = colors.primary,
}: {
  fetcher: () => Promise<any>;
  emptyTitle?: string;
  emptySubtitle?: string;
  accent?: string;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await fetcher();
      setData(d as Data);
    } catch (e: any) {
      console.warn(e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetcher]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const reviews = data?.reviews || [];

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 110 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={accent} />}
    >
      {loading ? (
        <ActivityIndicator color={accent} style={{ marginTop: 40 }} />
      ) : reviews.length === 0 ? (
        <Empty icon="star-outline" title={emptyTitle} subtitle={emptySubtitle} />
      ) : (
        <>
          {/* Summary */}
          <View style={styles.summary}>
            <View style={styles.avgBox}>
              <Text style={[styles.avgVal, { color: accent }]}>{(data?.average ?? 0).toFixed(1)}</Text>
              <Stars value={data?.average ?? 0} size={16} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sumTitle}>Customer Rating</Text>
              <Text style={styles.sumSub}>Based on {data?.count ?? 0} review{(data?.count ?? 0) === 1 ? "" : "s"}</Text>
            </View>
          </View>

          {/* List */}
          {reviews.map((rv) => (
            <Card key={rv.id} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={[styles.avatar, { backgroundColor: accent }]}>
                  <Text style={styles.avatarTxt}>{(rv.user_name || "U")[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{rv.user_name || "Customer"}</Text>
                  <Text style={styles.rest} numberOfLines={1}>{rv.restaurant_name || "Restaurant"}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Stars value={rv.rating} />
                  <Text style={styles.date}>{fmtDate(rv.created_at)}</Text>
                </View>
              </View>
              {rv.comment ? <Text style={styles.comment}>“{rv.comment}”</Text> : null}
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card,
  },
  avgBox: { alignItems: "center", gap: 4, paddingRight: spacing.md, borderRightWidth: 1, borderRightColor: colors.border },
  avgVal: { fontSize: 34, fontWeight: font.black, lineHeight: 38 },
  sumTitle: { fontSize: 16, fontWeight: font.black, color: colors.textPrimary },
  sumSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: "#fff", fontWeight: font.black, fontSize: 16 },
  name: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary },
  rest: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  date: { fontSize: 10, color: colors.textMuted },
  comment: { fontSize: 13, color: colors.textPrimary, marginTop: 10, lineHeight: 19, fontStyle: "italic" },
});
