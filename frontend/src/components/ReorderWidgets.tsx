import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { useCart } from "@/src/cart";
import { colors, spacing, radius, font, shadow } from "@/src/theme";

export type ReorderItem = {
  menu_item_id: string;
  name: string;
  price: number;
  image: string;
  restaurant_id: string;
  restaurant_name: string;
  times_ordered?: number;
};

type WidgetPayload = {
  favourite: ReorderItem | null;
  last_ordered: ReorderItem | null;
};

export default function ReorderWidgets() {
  const router = useRouter();
  const { add } = useCart();
  const [data, setData] = useState<WidgetPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await Api.customerReorderWidgets();
      setData(res as WidgetPayload);
    } catch {
      setData({ favourite: null, last_ordered: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const oneTapCheckout = async (item: ReorderItem, key: string) => {
    if (busyId) return;
    setBusyId(key);
    try {
      await add({
        menu_item_id: item.menu_item_id,
        name: item.name,
        price: item.price,
        image: item.image,
        restaurant_id: item.restaurant_id,
        restaurant_name: item.restaurant_name,
      });
      router.push("/customer/cart" as any);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap} testID="reorder-widgets-loading">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const fav = data?.favourite || null;
  const last = data?.last_ordered || null;

  // Hide the whole section for brand-new customers with no order history
  if (!fav && !last) return null;

  // Avoid showing the same item twice — if fav === last, keep only fav
  const showLast = last && (!fav || last.menu_item_id !== fav.menu_item_id);

  return (
    <View style={styles.section} testID="reorder-widgets-section">
      <Text style={styles.title}>Quick reorder</Text>
      <View style={styles.row}>
        {fav && (
          <ReorderCard
            testID="favourite-card"
            badge="YOUR FAVOURITE"
            badgeIcon="heart"
            badgeColor="#EF4444"
            item={fav}
            busy={busyId === "fav"}
            subtitle={fav.times_ordered ? `Ordered ${fav.times_ordered}× before` : "Your top pick"}
            onPress={() => oneTapCheckout(fav, "fav")}
          />
        )}
        {showLast && (
          <ReorderCard
            testID="last-ordered-card"
            badge="ORDER AGAIN"
            badgeIcon="refresh"
            badgeColor={colors.primary}
            item={last!}
            busy={busyId === "last"}
            subtitle="Reorder your last item"
            onPress={() => oneTapCheckout(last!, "last")}
          />
        )}
      </View>
    </View>
  );
}

function ReorderCard({
  item,
  badge,
  badgeIcon,
  badgeColor,
  subtitle,
  onPress,
  busy,
  testID,
}: {
  item: ReorderItem;
  badge: string;
  badgeIcon: keyof typeof Ionicons.glyphMap;
  badgeColor: string;
  subtitle: string;
  onPress: () => void;
  busy: boolean;
  testID: string;
}) {
  return (
    <View style={styles.card} testID={testID}>
      <View style={[styles.badge, { backgroundColor: badgeColor }]}>
        <Ionicons name={badgeIcon} size={11} color="#fff" />
        <Text style={styles.badgeText}>{badge}</Text>
      </View>
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Ionicons name="restaurant" size={32} color={colors.textSecondary} />
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.restName} numberOfLines={1}>{item.restaurant_name}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>₹{item.price}</Text>
          <TouchableOpacity
            style={[styles.cta, busy && { opacity: 0.6 }]}
            onPress={onPress}
            disabled={busy}
            activeOpacity={0.85}
            testID={`${testID}-add-btn`}
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="flash" size={14} color="#fff" />
                <Text style={styles.ctaText}>Add & Checkout</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  title: {
    fontSize: 16,
    fontWeight: font.black,
    color: colors.textPrimary,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  row: { flexDirection: "row", gap: 12 },
  loadingWrap: { paddingVertical: spacing.lg, alignItems: "center" },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.card,
  },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: font.black, letterSpacing: 0.5 },
  image: { width: "100%", height: 110 },
  imagePlaceholder: { backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  body: { padding: 10 },
  itemName: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary },
  restName: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  subtitle: { fontSize: 11, color: colors.textSecondary, marginTop: 4, fontStyle: "italic" },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    gap: 6,
  },
  price: { fontSize: 15, fontWeight: font.black, color: colors.textPrimary },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.sm,
    minHeight: 32,
  },
  ctaText: { color: "#fff", fontSize: 11, fontWeight: font.bold },
});
