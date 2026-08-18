import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { Rating, Empty } from "@/src/components/ui";
import { getFavIds, toggleFav } from "@/src/utils/favorites";

type Restaurant = { id: string; name: string; image: string; cuisines: string[]; rating: number; delivery_time: number; price_for_two: number };

export default function Favorites() {
  const router = useRouter();
  const [items, setItems] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ids = await getFavIds();
      if (ids.length === 0) { setItems([]); return; }
      const all = (await Api.restaurants()) as Restaurant[];
      setItems(all.filter((r) => ids.includes(r.id)));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const remove = async (id: string) => {
    await toggleFav(id);
    setItems((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScreenHeader title="Favourites" subtitle="Your saved restaurants" />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <Empty icon="heart-outline" title="No favourites yet" subtitle="Tap the heart on any restaurant to save it here" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 112 }}>
        {items.map((r) => (
            <TouchableOpacity key={r.id} style={styles.card} activeOpacity={0.9} onPress={() => router.push(`/restaurant/${r.id}` as any)}>
              <Image source={{ uri: r.image }} style={styles.img} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{r.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>{r.cuisines.join(", ")}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <Rating value={r.rating} />
                  <Text style={styles.meta}>{r.delivery_time} mins</Text>
                </View>
              </View>
              <TouchableOpacity testID={`fav-remove-${r.id}`} onPress={() => remove(r.id)} hitSlop={10} style={styles.heart}>
                <Ionicons name="heart" size={22} color={colors.primary} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  img: { width: 72, height: 72, borderRadius: radius.md },
  name: { fontSize: 15, fontWeight: font.black, color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textSecondary },
  heart: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
