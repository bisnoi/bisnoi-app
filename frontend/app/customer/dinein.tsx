import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Image, TextInput, FlatList, RefreshControl, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Rating, Empty } from "@/src/components/ui";

export default function DineInTab() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(async () => {
    try {
      const params: any = {};
      if (q) params.q = q;
      const res = await Api.restaurants(params);
      // Only restaurants that have the POS / dine-in system enabled can take dine-in orders.
      setResults(((res as any[]) || []).filter((r) => r.pos_enabled !== false));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(run, 250);
    return () => clearTimeout(t);
  }, [run]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await run(); } finally { setRefreshing(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headIcon}>
          <Ionicons name="restaurant" size={20} color={colors.onPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Dine In</Text>
          <Text style={styles.subtitle}>Order at your table — no waiting</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={styles.bar}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            testID="dinein-search"
            value={q}
            onChangeText={setQ}
            placeholder="Search the restaurant you're at"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          {q.length > 0 && (
            <TouchableOpacity onPress={() => setQ("")}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Info strip */}
      <View style={styles.infoStrip}>
        <Ionicons name="information-circle" size={16} color={colors.primary} />
        <Text style={styles.infoText}>Pick your restaurant, enter your table number, and order.</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : results.length === 0 ? (
        <Empty icon="restaurant-outline" title="No restaurants" subtitle="Try a different search" />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`dinein-rest-${item.id}`}
              style={styles.card}
              activeOpacity={0.9}
              onPress={() => router.push(`/dinein-order?rid=${item.id}` as any)}
            >
              <Image source={{ uri: item.image }} style={styles.img} />
              <View style={{ flex: 1, padding: spacing.md }}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>{(item.cuisines || []).join(" • ")}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <Rating value={item.rating} />
                  <Text style={styles.meta}>• {item.delivery_time} mins</Text>
                </View>
                <View style={styles.dineBadge}>
                  <Ionicons name="restaurant" size={11} color={colors.primary} />
                  <Text style={styles.dineBadgeTxt}>Dine-in available</Text>
                </View>
              </View>
              <View style={styles.chev}>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
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
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  headIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", ...shadow.card },
  title: { fontSize: 22, fontWeight: font.black, color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  searchWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  bar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, ...shadow.card },
  input: { flex: 1, fontSize: 14, color: colors.textPrimary, padding: 0 },
  infoStrip: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  infoText: { flex: 1, fontSize: 12.5, color: colors.textPrimary, fontWeight: font.semi },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.card },
  img: { width: 96, height: 96 },
  name: { fontSize: 15, fontWeight: font.bold, color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textSecondary },
  dineBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  dineBadgeTxt: { fontSize: 10.5, fontWeight: font.bold, color: colors.primary },
  chev: { paddingRight: spacing.md },
});
