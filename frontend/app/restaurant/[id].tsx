import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  TextInput, ActivityIndicator, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSmartBack } from "@/src/utils/nav";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { useCart } from "@/src/cart";
import { useAuth } from "@/src/auth";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Rating, VegDot, Empty, Card } from "@/src/components/ui";
import { isFav, toggleFav } from "@/src/utils/favorites";
import { offerLabel, type Offer } from "@/src/utils/offers";
import { GoogleMapView } from "@/src/components/GoogleMapView";
import { LiveOrderBar } from "@/src/components/LiveOrderBar";

type MenuItem = { id: string; name: string; description: string; price: number; image: string; category: string; veg: boolean; available: boolean; rating: number; };
type Restaurant = { id: string; name: string; image: string; cuisines: string[]; rating: number; delivery_time: number; price_for_two: number; address: string; offer_text?: string; lat: number; lng: number; open_now?: boolean; };
type Review = { id: string; user_name: string; rating: number; comment: string; created_at: string; };

export default function RestaurantDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = useSmartBack();
  const cart = useCart();
  const { user } = useAuth();

  const [data, setData] = useState<{ restaurant: Restaurant; menu: MenuItem[]; reviews: Review[]; offers?: Offer[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [vegOnly, setVegOnly] = useState(false);
  const [activeCat, setActiveCat] = useState<string>("All");
  const [fav, setFav] = useState(false);

  useEffect(() => {
    if (id) isFav(String(id)).then(setFav);
  }, [id]);

  const onToggleFav = async () => {
    if (!id) return;
    setFav(await toggleFav(String(id)));
  };

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await Api.restaurant(String(id));
      setData(res as any);
    } catch (e) {
      // ignore
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const categories = useMemo(() => {
    if (!data) return ["All"];
    const set = new Set<string>(["All"]);
    data.menu.forEach((m) => set.add(m.category));
    return Array.from(set);
  }, [data]);

  const filteredMenu = useMemo(() => {
    if (!data) return [];
    return data.menu.filter((m) => {
      if (vegOnly && !m.veg) return false;
      if (activeCat !== "All" && m.category !== activeCat) return false;
      if (query && !m.name.toLowerCase().includes(query.toLowerCase()) && !m.description.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [data, query, vegOnly, activeCat]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Header onBack={goBack} title="Restaurant" />
        <Empty icon="alert-circle-outline" title="Not found" subtitle="This restaurant could not be loaded" />
      </SafeAreaView>
    );
  }

  const r = data.restaurant;
  const closed = r.open_now === false;
  const itemCountInCart = (mid: string) => cart.items.find((i) => i.menu_item_id === mid)?.quantity || 0;

  const handleAdd = async (m: MenuItem) => {
    if (closed) return;
    if (!user) {
      router.push({ pathname: "/login", params: { next: `/restaurant/${r.id}` } } as any);
      return;
    }
    await cart.add({
      menu_item_id: m.id, name: m.name, price: m.price, image: m.image,
      restaurant_id: r.id, restaurant_name: r.name,
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Header
        onBack={goBack}
        title={r.name}
        subtitle={r.cuisines.join(" • ")}
        right={
          <TouchableOpacity testID="fav-toggle" onPress={onToggleFav} hitSlop={10} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={fav ? "heart" : "heart-outline"} size={24} color={fav ? colors.primary : colors.textPrimary} />
          </TouchableOpacity>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: !user ? 110 : cart.count > 0 ? 120 : 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Image source={{ uri: r.image }} style={styles.heroImg} />
          {r.offer_text && (
            <View style={styles.offerBadge}>
              <Ionicons name="pricetag" size={12} color="#fff" />
              <Text style={styles.offerText}>{r.offer_text}</Text>
            </View>
          )}
        </View>

        {/* Info card */}
        <View style={styles.infoCard}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.rName}>{r.name}</Text>
            <Rating value={r.rating} size={14} />
          </View>
          <Text style={styles.cuisines}>{r.cuisines.join(", ")}</Text>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.metaText}>{r.delivery_time} mins</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="cash-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.metaText}>₹{r.price_for_two} for two</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.metaText} numberOfLines={1}>{r.address}</Text>
            </View>
          </View>
          {closed ? (
            <View style={styles.closedBanner} testID="restaurant-closed-banner">
              <Ionicons name="moon" size={16} color={colors.error} />
              <Text style={styles.closedBannerText}>Currently closed — not accepting orders right now</Text>
            </View>
          ) : null}
        </View>

        {/* Restaurant location */}
        {!!r.lat && !!r.lng && (
          <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
            <Text style={[styles.sectionTitle, { marginBottom: spacing.sm }]}>LOCATION</Text>
            <GoogleMapView
              height={180}
              showPath={false}
              markers={[{ key: "rest", lat: r.lat, lng: r.lng, label: r.name, color: "F59E0B", icon: "restaurant" }]}
            />
          </View>
        )}

        {/* Offers strip */}
        {(data.offers || []).length > 0 && (
          <View style={styles.offersWrap}>
            <Text style={styles.offersTitle}>OFFERS FOR YOU</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: spacing.lg }}>
              {(data.offers || []).map((o) => (
                <View key={o.id} style={styles.offerCard} testID={`offer-card-${o.id}`}>
                  <View style={styles.offerIc}>
                    <Ionicons name="pricetag" size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.offerLabelTxt}>{offerLabel(o)}</Text>
                    <Text style={styles.offerSub} numberOfLines={1}>
                      {o.code ? `Code ${o.code}` : o.title}{o.min_order ? ` • Min ₹${o.min_order}` : ""}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Search & veg toggle */}
        <View style={styles.searchWrap}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={colors.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search menu items"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
            />
          </View>
          <TouchableOpacity
            style={[styles.vegToggle, vegOnly && { borderColor: colors.vegGreen, backgroundColor: "#EAF5EE" }]}
            onPress={() => setVegOnly((v) => !v)}
            activeOpacity={0.85}
          >
            <VegDot veg={true} />
            <Text style={[styles.vegLabel, vegOnly && { color: colors.vegGreen }]}>Veg only</Text>
          </TouchableOpacity>
        </View>

        {/* Category chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 8, paddingVertical: spacing.sm, alignItems: "center" }}>
          {categories.map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => setActiveCat(c)}
              style={[styles.catChip, activeCat === c && { backgroundColor: colors.primary, borderColor: colors.primary }]}
            >
              <Text style={{ color: activeCat === c ? "#fff" : colors.textSecondary, fontWeight: font.semi, fontSize: 12 }}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Menu items */}
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md, marginTop: spacing.sm }}>
          {filteredMenu.length === 0 ? (
            <Empty icon="restaurant-outline" title="No items match" subtitle="Try a different filter" />
          ) : (
            filteredMenu.map((m) => {
              const qty = itemCountInCart(m.id);
              return (
                <View key={m.id} style={styles.menuRow}>
                  <View style={{ flex: 1, paddingRight: spacing.md }}>
                    <VegDot veg={m.veg} />
                    <Text style={styles.mName} numberOfLines={2}>{m.name}</Text>
                    <Text style={styles.mPrice}>₹{m.price}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <Ionicons name="star" size={12} color={colors.success} />
                      <Text style={styles.mMeta}>{m.rating?.toFixed(1) || "4.2"}</Text>
                    </View>
                    <Text style={styles.mDesc} numberOfLines={3}>{m.description}</Text>
                  </View>
                  <View style={{ width: 110, alignItems: "center" }}>
                    {m.image ? (
                      <Image source={{ uri: m.image }} style={styles.mImg} />
                    ) : (
                      <View style={[styles.mImg, styles.mImgEmpty]} testID={`menu-noimg-${m.id}`}>
                        <Ionicons name="fast-food-outline" size={30} color={colors.textMuted} />
                      </View>
                    )}
                    {closed ? (
                      <View style={styles.closedChip} testID={`closed-chip-${m.id}`}>
                        <Text style={styles.closedChipText}>Closed</Text>
                      </View>
                    ) : qty > 0 ? (
                      <View style={styles.qtyBox}>
                        <TouchableOpacity onPress={() => cart.decrement(m.id)} style={styles.qBtn}>
                          <Ionicons name="remove" size={16} color={colors.primary} />
                        </TouchableOpacity>
                        <Text style={styles.qty}>{qty}</Text>
                        <TouchableOpacity onPress={() => cart.increment(m.id)} style={styles.qBtn}>
                          <Ionicons name="add" size={16} color={colors.primary} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity style={styles.addBtn} onPress={() => handleAdd(m)} activeOpacity={0.85}>
                        <Text style={styles.addBtnText}>ADD</Text>
                        <Ionicons name="add" size={14} color={colors.primary} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Reviews */}
        {data.reviews.length > 0 && (
          <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl }}>
            <Text style={styles.sectionTitle}>RATINGS & REVIEWS</Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              {data.reviews.slice(0, 5).map((rv) => (
                <Card key={rv.id}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontWeight: font.bold, color: colors.textPrimary }}>{rv.user_name}</Text>
                    <Rating value={rv.rating} />
                  </View>
                  {!!rv.comment && <Text style={{ color: colors.textSecondary, marginTop: 6, fontSize: 13 }}>{rv.comment}</Text>}
                </Card>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Sticky cart bar */}
      {user && cart.count > 0 && cart.restaurantId === r.id && (
        <TouchableOpacity style={styles.cartBar} activeOpacity={0.9} onPress={() => router.push("/customer/cart" as any)}>
          <View>
            <Text style={styles.cartCount}>{cart.count} item{cart.count > 1 ? "s" : ""} • ₹{cart.subtotal}</Text>
            <Text style={styles.cartSub}>Extra charges may apply</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={styles.cartCta}>View Cart</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </View>
        </TouchableOpacity>
      )}

      {/* Sticky guest CTA — replaces the cart bar for guest users */}
      {!user && (
        <TouchableOpacity
          testID="login-to-continue-btn"
          style={styles.loginToContinueBar}
          activeOpacity={0.9}
          onPress={() => router.push({ pathname: "/login", params: { next: `/restaurant/${r.id}` } } as any)}
        >
          <Text style={styles.loginToContinueTxt}>Login to Continue</Text>
        </TouchableOpacity>
      )}
      <LiveOrderBar bottom={user && cart.count > 0 && cart.restaurantId === r.id ? 96 : 16} />
    </SafeAreaView>
  );
}

function Header({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: font.black, color: colors.textPrimary },
  headerSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  hero: { position: "relative" },
  heroImg: { width: "100%", height: 200 },
  offerBadge: { position: "absolute", left: spacing.lg, bottom: spacing.md, backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, flexDirection: "row", alignItems: "center", gap: 6 },
  offerText: { color: "#fff", fontWeight: font.bold, fontSize: 12 },
  infoCard: { backgroundColor: colors.surface, marginHorizontal: spacing.lg, marginTop: -spacing.lg, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  rName: { fontSize: 20, fontWeight: font.black, color: colors.textPrimary, flex: 1, marginRight: 8 },
  cuisines: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  metaText: { fontSize: 12, color: colors.textSecondary, fontWeight: font.semi },
  searchWrap: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  offersWrap: { marginTop: spacing.lg, paddingLeft: spacing.lg },
  offersTitle: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.5, marginBottom: spacing.sm },
  offerCard: { flexDirection: "row", alignItems: "center", gap: 10, width: 230, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary + "40", backgroundColor: colors.primarySoft, borderStyle: "dashed" },
  offerIc: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  offerLabelTxt: { fontSize: 14, fontWeight: font.black, color: colors.textPrimary },
  offerSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  searchBar: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontSize: 14, color: colors.textPrimary, padding: 0 },
  vegToggle: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  vegLabel: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  menuRow: { flexDirection: "row", padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  mName: { fontSize: 15, fontWeight: font.bold, color: colors.textPrimary, marginTop: 6 },
  mPrice: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary, marginTop: 4 },
  mMeta: { fontSize: 12, color: colors.success, fontWeight: font.bold },
  mDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 6 },
  mImg: { width: 110, height: 90, borderRadius: radius.md, marginBottom: -22 },
  mImgEmpty: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  addBtn: { marginTop: 4, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 18, paddingVertical: 8, backgroundColor: "#fff", borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, ...shadow.card },
  addBtnText: { color: colors.primary, fontWeight: font.black, fontSize: 13, letterSpacing: 0.5 },
  qtyBox: { marginTop: 4, flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, overflow: "hidden", backgroundColor: "#fff", ...shadow.card },
  qBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  qty: { paddingHorizontal: 6, fontWeight: font.black, color: colors.primary, minWidth: 22, textAlign: "center", fontSize: 13 },
  sectionTitle: { fontSize: 13, fontWeight: font.black, color: colors.textPrimary, letterSpacing: 0.5 },
  cartBar: { position: "absolute", bottom: spacing.lg, left: spacing.lg, right: spacing.lg, backgroundColor: colors.primary, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", ...shadow.lifted },
  cartCount: { color: "#fff", fontWeight: font.black, fontSize: 14 },
  cartSub: { color: "#FBE6E1", fontSize: 11, marginTop: 2 },
  cartCta: { color: "#fff", fontWeight: font.black, fontSize: 14 },
  closedBanner: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md, backgroundColor: colors.errorSoft, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12 },
  closedBannerText: { flex: 1, color: colors.error, fontWeight: font.bold, fontSize: 12.5 },
  closedChip: { marginTop: 4, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  closedChipText: { color: colors.textMuted, fontWeight: font.black, fontSize: 12, letterSpacing: 0.5 },
  loginToContinueBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "#EF4444",
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  loginToContinueTxt: { color: "#fff", fontWeight: font.black, fontSize: 16, letterSpacing: 0.3 },
});
