import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, TextInput, FlatList, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSmartBack } from "@/src/utils/nav";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Rating, Pill, Empty } from "@/src/components/ui";

export default function Search() {
  const router = useRouter();
  const goBack = useSmartBack();
  const { q: initialQ } = useLocalSearchParams<{ q?: string }>();
  const [q, setQ] = useState(initialQ || "");
  const [results, setResults] = useState<any[]>([]);
  const [sort, setSort] = useState<"rating" | "delivery" | "price" | "">("");
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(async () => {
    const params: any = {};
    if (q) params.q = q;
    if (sort) params.sort = sort;
    const res = await Api.restaurants(params);
    setResults(res as any[]);
  }, [q, sort]);

  useEffect(() => { run(); }, [run]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await run(); } finally { setRefreshing(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.searchHeader}>
        <TouchableOpacity testID="customer-search-back" onPress={goBack}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.bar}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Restaurants & cuisines"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            autoFocus={!initialQ}
          />
          {q.length > 0 && (
            <TouchableOpacity onPress={() => setQ("")}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md, alignItems: 'center' }}>
        <Pill label="Rating" active={sort === "rating"} icon="star" onPress={() => setSort(sort === "rating" ? "" : "rating")} />
        <Pill label="Fastest" active={sort === "delivery"} icon="flash" onPress={() => setSort(sort === "delivery" ? "" : "delivery")} />
        <Pill label="Price: Low" active={sort === "price"} icon="cash" onPress={() => setSort(sort === "price" ? "" : "price")} />
      </ScrollView>

      {results.length === 0 ? (
        <Empty icon="search" title="No results" subtitle="Try a different keyword" />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={() => router.push(`/restaurant/${item.id}` as any)}>
              <Image source={{ uri: item.image }} style={styles.img} />
              <View style={{ flex: 1, padding: spacing.md }}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>{item.cuisines.join(" • ")}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <Rating value={item.rating} />
                  <Text style={styles.meta}>• {item.delivery_time} mins</Text>
                  <Text style={styles.meta}>• ₹{item.price_for_two}</Text>
                </View>
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
  searchHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  bar: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.md, paddingVertical: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, ...shadow.card },
  input: { flex: 1, fontSize: 14, color: colors.textPrimary, padding: 0 },
  card: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.card },
  img: { width: 100, height: 100 },
  name: { fontSize: 15, fontWeight: font.bold, color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textSecondary },
});
