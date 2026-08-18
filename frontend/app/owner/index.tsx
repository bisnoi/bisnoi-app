import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { Api } from "@/src/api";
import { useAuth, isStaff } from "@/src/auth";
import { colors, spacing, radius, font } from "@/src/theme";
import { Card, StatusBadge, Empty } from "@/src/components/ui";
import ConsoleDashboard, { P, ConsoleNav } from "@/src/components/ConsoleDashboard";
import { openRazorpayCheckout } from "@/src/utils/razorpay";

type Stats = {
  restaurants: number;
  orders_today: number;
  revenue: number;
  active_orders: number;
  pending_orders?: number;
  completed_orders?: number;
  total_categories?: number;
  total_menu_items?: number;
  pos_revenue?: number;
  pos_bills?: number;
};

type Restaurant = {
  id: string;
  name?: string;
  image_url?: string;
  status?: string;
  is_enabled?: boolean;
  is_open?: boolean;
  open_now?: boolean;
  rating?: number;
  address?: string;
} | null;

/* ============================================================================
   Owner home — desktop shows the Reztro-style console (ConsoleDashboard),
   mobile keeps the existing bottom-tab dashboard. (Width >= 1024 = desktop.)
   ============================================================================ */
export default function OwnerHome() {
  const { width } = useWindowDimensions();
  if (width >= 1024) return <OwnerDesktopDashboard />;
  return <OwnerMobileDashboard />;
}

function OwnerMobileDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);
  const [toggling, setToggling] = useState(false);
  const [payingFee, setPayingFee] = useState(false);
  const [feeError, setFeeError] = useState("");

  const needsOnboardingFee = !!restaurant && !(restaurant as any)?.onboarding_paid &&
    ((restaurant as any)?.status || "").toLowerCase() === "pending_payment" &&
    Number((restaurant as any)?.onboarding_fee || 0) > 0;

  const payOnboardingFee = useCallback(async () => {
    if (payingFee) return;
    setPayingFee(true); setFeeError("");
    try {
      const pay: any = await Api.createPayment({ purpose: "onboarding_fee" });
      await openRazorpayCheckout({
        keyId: pay.key_id,
        orderId: pay.razorpay_order_id,
        amount: pay.amount,
        name: "Bisnoi",
        description: "Restaurant onboarding fee",
        prefill: { name: pay?.prefill?.name || "", contact: pay?.prefill?.contact || "" },
        themeColor: colors.primary,
        onSuccess: async (resp) => {
          try {
            await Api.verifyPayment({
              payment_id: pay.payment_id,
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            setPayingFee(false);
            load();
          } catch (e: any) {
            setFeeError(e?.message || "Verification failed"); setPayingFee(false);
          }
        },
        onDismiss: () => { setFeeError("Payment cancelled. Tap to retry."); setPayingFee(false); },
        onError: (e: any) => { setFeeError((e?.description || e?.message) || "Payment failed"); setPayingFee(false); },
      });
    } catch (e: any) {
      setFeeError(e?.message || "Could not start payment"); setPayingFee(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payingFee]);

  const toggleOpen = useCallback(async () => {
    if (!restaurant || toggling) return;
    const next = !(restaurant.is_open ?? true);
    setToggling(true);
    try {
      const updated = await Api.ownerSetAvailability({ is_open: next });
      setRestaurant(updated as Restaurant);
    } catch (e: any) {
      console.warn(e?.message);
    } finally {
      setToggling(false);
    }
  }, [restaurant, toggling]);

  const load = useCallback(async () => {
    try {
      const [s, r, o] = await Promise.all([
        Api.ownerStats(),
        Api.ownerMyRestaurant().catch(() => null),
        Api.ownerRecentOrders(20).catch(() => []),
      ]);
      setStats(s as Stats);
      setRestaurant(r as Restaurant);
      setOrders(((o as any[]) || []).slice(0, 5));
    } catch (e: any) {
      console.warn(e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(useCallback(() => {
    Api.ownerNotifUnread().then((r: any) => setUnread(r?.count || 0)).catch(() => {});
  }, []));

  const hasRestaurant = !!restaurant;
  const hasCats = (stats?.total_categories ?? 0) > 0;
  const hasItems = (stats?.total_menu_items ?? 0) > 0;
  const restEnabled = restaurant?.is_enabled ?? true;
  const restStatus = (restaurant?.status || "").toLowerCase();
  const pendingApproval = hasRestaurant && restStatus && restStatus !== "active";
  const isOpen = restaurant?.is_open ?? true;
  const openNow = restaurant?.open_now ?? true;

  // Top stat cards (6)
  const cards = [
    { label: "Restaurants", value: stats?.restaurants ?? 0, icon: "storefront" as const, color: colors.primary },
    { label: "Categories", value: stats?.total_categories ?? 0, icon: "albums" as const, color: "#8B5CF6", onPress: () => router.push("/owner/categories") },
    { label: "Menu Items", value: stats?.total_menu_items ?? 0, icon: "restaurant" as const, color: colors.secondary, onPress: () => router.push("/owner/menu") },
    { label: "Orders Today", value: stats?.orders_today ?? 0, icon: "receipt" as const, color: "#0EA5E9", onPress: () => router.push("/owner/orders") },
    { label: "Active", value: stats?.active_orders ?? 0, icon: "flash" as const, color: colors.warning, onPress: () => router.push("/owner/orders") },
    { label: "Revenue", value: `\u20B9${stats?.revenue ?? 0}`, icon: "cash" as const, color: colors.success },
    { label: "POS Sales", value: `\u20B9${stats?.pos_revenue ?? 0}`, icon: "calculator" as const, color: "#0EA5E9", onPress: () => router.push("/owner/pos") },
  ];

  // Quick actions (everything not in the bottom tab bar lives here).
  // For restaurant_staff, we filter based on their granted permissions and hide
  // Staff/Roles entirely (only real owners can manage staff).
  const rawActions = [
    { label: "New Bill", icon: "calculator" as const, color: "#0EA5E9", onPress: () => router.push("/owner/pos"), module: "pos" },
    { label: "Table QR", icon: "qr-code" as const, color: "#16A34A", onPress: () => router.push("/owner/qr-tables"), module: "pos" },
    { label: "Categories", icon: "albums" as const, color: "#8B5CF6", onPress: () => router.push("/owner/categories"), module: "menu" },
    { label: "Offers", icon: "pricetags" as const, color: colors.primary, onPress: () => router.push("/owner/offers"), module: "settings" },
    { label: "Complaints", icon: "alert-circle" as const, color: colors.error, onPress: () => router.push("/owner/complaints"), module: "reviews" },
    { label: "Finance", icon: "wallet" as const, color: colors.success, onPress: () => router.push("/owner/finance"), module: "finance" },
    { label: "Reports", icon: "stats-chart" as const, color: "#0EA5E9", onPress: () => router.push("/owner/reports"), module: "reports" },
    { label: "Marketing", icon: "megaphone" as const, color: "#25D366", onPress: () => router.push("/owner/marketing" as any), module: "settings" },
    { label: "Customers", icon: "people" as const, color: "#0EA5E9", onPress: () => router.push("/owner/customers" as any), module: "reviews" },
    { label: "Outlet Info", icon: "storefront" as const, color: "#F59E0B", onPress: () => router.push("/owner/outlet"), module: "settings" },
    { label: "Staff & Roles", icon: "people-circle" as const, color: "#8B5CF6", onPress: () => router.push("/owner/staff"), module: "__owner_only__" },
    { label: "Add Menu", icon: "add-circle" as const, color: colors.primary, onPress: () => router.push("/owner/menu"), module: "menu" },
    { label: "Profile", icon: "person-circle" as const, color: colors.secondary, onPress: () => router.push("/owner/profile") },
  ];
  const actions = rawActions.filter((a) => {
    if (a.module === "__owner_only__") return !isStaff(user);
    if (!isStaff(user)) return true;
    if (!a.module) return true;
    return (user?.permissions || []).includes(a.module);
  });

  // Setup checklist (only shown when something is missing)
  const checklist = [
    { done: hasRestaurant, label: "Restaurant approved & live", icon: "storefront" as const },
    { done: hasCats, label: "Create at least 1 category", icon: "albums" as const, onPress: () => router.push("/owner/categories") },
    { done: hasItems, label: "Add menu items", icon: "fast-food" as const, onPress: () => router.push("/owner/menu") },
  ];
  const incompleteSteps = checklist.filter((c) => !c.done);
  const completion = Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100);

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.hi, { fontSize: 18 }]} numberOfLines={1}>Hi, {user?.name || "Owner"} 👋</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* No restaurant warning */}
            {!hasRestaurant ? (
              <View style={[styles.banner, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
                <Ionicons name="information-circle" size={22} color={colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bannerTitle, { color: colors.warning }]}>No restaurant yet</Text>
                  <Text style={styles.bannerText}>
                    Once your partner application is approved, your restaurant goes live automatically and you can start adding categories and menu items.
                  </Text>
                </View>
              </View>
            ) : needsOnboardingFee ? (
              <View style={[styles.banner, { backgroundColor: colors.primarySoft, borderColor: colors.primary, flexDirection: "column", alignItems: "stretch", gap: 10 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Ionicons name="rocket" size={22} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.bannerTitle, { color: colors.primary }]}>One step left — go live!</Text>
                    <Text style={styles.bannerText}>
                      Pay the one-time onboarding fee of ₹{Number((restaurant as any)?.onboarding_fee || 0)} to activate your restaurant and start receiving orders.
                    </Text>
                  </View>
                </View>
                {feeError ? <Text style={{ color: colors.error, fontSize: 12, fontWeight: font.semi }}>{feeError}</Text> : null}
                <TouchableOpacity
                  testID="pay-onboarding-fee"
                  activeOpacity={0.9}
                  disabled={payingFee}
                  onPress={payOnboardingFee}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: radius.md, backgroundColor: colors.primary, opacity: payingFee ? 0.6 : 1 }}
                >
                  {payingFee ? <ActivityIndicator color={colors.onPrimary} /> : (
                    <>
                      <Ionicons name="card" size={18} color={colors.onPrimary} />
                      <Text style={{ color: colors.onPrimary, fontWeight: font.black, fontSize: 15 }}>Pay ₹{Number((restaurant as any)?.onboarding_fee || 0)} & Go Live</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : pendingApproval ? (
              <View style={[styles.banner, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
                <Ionicons name="time" size={22} color={colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bannerTitle, { color: colors.warning }]}>
                    Restaurant status: {restStatus || "pending"}
                  </Text>
                  <Text style={styles.bannerText}>
                    Your restaurant is not yet active. You can prep your menu, but customers won't see it until admin marks it active.
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Availability — Online/Offline master switch + today's status */}
            {hasRestaurant ? (
              <View style={[styles.availCard, { borderColor: openNow ? colors.success : colors.error }]}>
                <View style={styles.availRow}>
                  <View style={[styles.availDot, { backgroundColor: openNow ? colors.success : colors.error }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.availTitle}>
                      {isOpen ? (openNow ? "You are ONLINE" : "Online — but closed now") : "You are OFFLINE"}
                    </Text>
                    <Text style={styles.availSub}>
                      {isOpen
                        ? openNow
                          ? "Accepting orders from customers"
                          : "Outside today's hours — customers can't order"
                        : "Customers see 'Closed' and can't place orders"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    testID="owner-availability-toggle"
                    onPress={toggleOpen}
                    disabled={toggling}
                    activeOpacity={0.85}
                    style={[styles.switchTrack, { backgroundColor: isOpen ? colors.success : colors.borderStrong }]}
                  >
                    {toggling ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <View style={[styles.switchThumb, { alignSelf: isOpen ? "flex-end" : "flex-start" }]} />
                    )}
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  testID="owner-set-hours-btn"
                  onPress={() => router.push("/owner/hours")}
                  style={styles.hoursBtn}
                  activeOpacity={0.8}
                >
                  <Ionicons name="time-outline" size={16} color={colors.primary} />
                  <Text style={styles.hoursBtnText}>Set weekly opening hours</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: "auto" }} />
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Setup checklist (shown when incomplete) */}
            {hasRestaurant && incompleteSteps.length > 0 ? (
              <View style={styles.checklistWrap}>
                <View style={styles.checklistHead}>
                  <Text style={styles.checklistTitle}>SETUP {completion}% COMPLETE</Text>
                  <Text style={styles.checklistSub}>Finish these to start selling</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${completion}%` }]} />
                </View>
                <View style={{ marginTop: spacing.sm, gap: 8 }}>
                  {checklist.map((c) => (
                    <TouchableOpacity
                      key={c.label}
                      disabled={c.done || !c.onPress}
                      onPress={c.onPress}
                      style={styles.checkItem}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={c.done ? "checkmark-circle" : "ellipse-outline"}
                        size={20}
                        color={c.done ? colors.success : colors.textMuted}
                      />
                      <Text style={[styles.checkLabel, c.done && styles.checkLabelDone]}>{c.label}</Text>
                      {!c.done && c.onPress ? (
                        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                      ) : null}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Stats grid */}
            <View style={styles.statGrid}>
              {cards.map((c) => {
                const inner = (
                  <Card key={c.label} style={styles.statCard}>
                    <View style={[styles.icBox, { backgroundColor: c.color + "22" }]}>
                      <Ionicons name={c.icon} size={20} color={c.color} />
                    </View>
                    <Text style={styles.statVal}>{c.value}</Text>
                    <Text style={styles.statLabel}>{c.label}</Text>
                  </Card>
                );
                return c.onPress ? (
                  <TouchableOpacity key={c.label} style={{ width: "47%" }} onPress={c.onPress} activeOpacity={0.7}>
                    {inner}
                  </TouchableOpacity>
                ) : (
                  <View key={c.label} style={{ width: "47%" }}>{inner}</View>
                );
              })}
            </View>

            {/* Recent Orders */}
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sTitle}>RECENT ORDERS</Text>
                {orders.length > 0 ? (
                  <TouchableOpacity onPress={() => router.push("/owner/orders")}>
                    <Text style={styles.viewAll}>View all →</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {orders.length === 0 ? (
                <Empty icon="receipt" title="No orders yet" subtitle="App & dine-in (table) orders will appear here" />
              ) : (
                orders.map((o) => {
                  const isOffline = o.channel === "offline";
                  const created = o.created_at ? new Date(o.created_at) : null;
                  const card = (
                    <Card key={o.id} style={{ marginBottom: spacing.sm }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <View style={[styles.channelChip, { backgroundColor: isOffline ? "#7C3AED22" : colors.primarySoft }]}>
                              <Ionicons name={isOffline ? "restaurant" : "phone-portrait"} size={11} color={isOffline ? "#7C3AED" : colors.primary} />
                              <Text style={[styles.channelChipText, { color: isOffline ? "#7C3AED" : colors.primary }]}>
                                {o.source_label || (isOffline ? "Offline" : "Online")}
                              </Text>
                            </View>
                            {o.table_label ? (
                              <View style={styles.tableChip}>
                                <Text style={styles.tableChipText}>{o.table_label}</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={{ fontWeight: font.bold, color: colors.textPrimary, marginTop: 4 }} numberOfLines={1}>
                            {o.customer_name || (isOffline ? "Walk-in" : "Customer")}
                          </Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                            {(o.items?.length || 0)} items • ₹{o.total}
                            {created ? ` • ${created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                          </Text>
                        </View>
                        <StatusBadge status={o.status} />
                      </View>
                    </Card>
                  );
                  // Only ONLINE app orders have a customer order-tracking detail page.
                  return isOffline ? (
                    <View key={o.id}>{card}</View>
                  ) : (
                    <TouchableOpacity key={o.id} activeOpacity={0.7} onPress={() => router.push(`/order/${o.id}` as any)}>
                      {card}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ============================ Desktop (console) owner dashboard ============================ */
const OWNER_NAV_ALL: (ConsoleNav & { module?: string })[] = [
  { key: "dashboard", label: "Dashboard", route: "/owner", icon: "grid", module: "dashboard" },
  { key: "orders", label: "Orders", route: "/owner/orders", icon: "receipt-outline", module: "orders" },
  { key: "pos", label: "Billing", route: "/owner/pos", icon: "calculator-outline", module: "pos" },
  { key: "qr-tables", label: "Table QR", route: "/owner/qr-tables", icon: "qr-code-outline", module: "pos" },
  { key: "menu", label: "Menu", route: "/owner/menu", icon: "fast-food-outline", module: "menu" },
  { key: "categories", label: "Categories", route: "/owner/categories", icon: "albums-outline", module: "menu" },
  { key: "reviews", label: "Reviews", route: "/owner/reviews", icon: "star-outline", module: "reviews" },
  { key: "offers", label: "Offers", route: "/owner/offers", icon: "pricetags-outline", module: "settings" },
  { key: "complaints", label: "Complaints", route: "/owner/complaints", icon: "alert-circle-outline", module: "reviews" },
  { key: "finance", label: "Finance", route: "/owner/finance", icon: "wallet-outline", module: "finance" },
  { key: "reports", label: "Reports", route: "/owner/reports", icon: "stats-chart-outline", module: "reports" },
  { key: "marketing", label: "Marketing", route: "/owner/marketing", icon: "megaphone-outline", module: "settings" },
  { key: "customers", label: "Customers", route: "/owner/customers", icon: "people-outline", module: "reviews" },
  { key: "outlet", label: "Outlet Info", route: "/owner/outlet", icon: "storefront-outline", module: "settings" },
  { key: "hours", label: "Hours", route: "/owner/hours", icon: "time-outline", module: "settings" },
  { key: "staff", label: "Staff & Roles", route: "/owner/staff", icon: "people-circle-outline", module: "__owner_only__" },
  { key: "profile", label: "Profile", route: "/owner/profile", icon: "person-circle-outline" },
];

/** Build the console nav list for the currently signed-in user, filtering
 *  Staff entries and hiding modules a `restaurant_staff` was not granted. */
function ownerNavFor(user: any): ConsoleNav[] {
  const staff = user?.role === "restaurant_staff";
  return OWNER_NAV_ALL
    .filter((n) => {
      if (n.module === "__owner_only__") return !staff;
      if (!staff) return true;
      if (!n.module) return true;
      return (user?.permissions || []).includes(n.module);
    })
    .map(({ module, ...rest }) => rest);
}

function OwnerControlStrip({ restaurant, stats, toggling, onToggle, onHours, go }: any) {
  if (!restaurant) {
    return (
      <View style={cs.banner} testID="owner-no-restaurant">
        <Ionicons name="information-circle" size={22} color={P.primary} />
        <View style={{ flex: 1 }}>
          <Text style={cs.bannerTitle}>No restaurant yet</Text>
          <Text style={cs.bannerText}>Once your partner application is approved, your restaurant goes live automatically.</Text>
        </View>
      </View>
    );
  }
  const isOpen = restaurant.is_open ?? true;
  const openNow = restaurant.open_now ?? true;
  const restStatus = (restaurant.status || "").toLowerCase();
  const pendingApproval = !!restStatus && restStatus !== "active";
  const hasCats = (stats?.total_categories ?? 0) > 0;
  const hasItems = (stats?.total_menu_items ?? 0) > 0;
  const checklist = [
    { done: true, label: "Restaurant approved & live" },
    { done: hasCats, label: "Create at least 1 category", route: "/owner/categories" },
    { done: hasItems, label: "Add menu items", route: "/owner/menu" },
  ];
  const incomplete = checklist.filter((c) => !c.done);
  const completion = Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100);

  return (
    <View style={{ gap: 14 }}>
      {pendingApproval ? (
        <View style={[cs.banner, { borderColor: P.primary }]} testID="owner-pending-banner">
          <Ionicons name="time" size={22} color={P.primary} />
          <View style={{ flex: 1 }}>
            <Text style={cs.bannerTitle}>Restaurant status: {restStatus}</Text>
            <Text style={cs.bannerText}>Not active yet — prep your menu; customers can't see it until admin marks it active.</Text>
          </View>
        </View>
      ) : null}

      <View style={cs.availCard} testID="owner-availability-card">
        <View style={[cs.statusDot, { backgroundColor: isOpen && openNow ? P.green : P.primary }]} />
        <View style={{ flex: 1 }}>
          <Text style={cs.availTitle}>{isOpen ? (openNow ? "You are ONLINE" : "Online — closed now") : "You are OFFLINE"}</Text>
          <Text style={cs.availSub}>{isOpen ? (openNow ? "Accepting orders from customers" : "Outside today's opening hours") : "Customers see 'Closed' and can't order"}</Text>
        </View>
        <TouchableOpacity testID="owner-set-hours-btn" onPress={onHours} style={cs.hoursBtn} activeOpacity={0.85}>
          <Ionicons name="time-outline" size={16} color={P.primary} />
          <Text style={cs.hoursBtnText}>Set hours</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="owner-availability-toggle"
          onPress={onToggle}
          disabled={toggling}
          activeOpacity={0.85}
          style={[cs.switchTrack, { backgroundColor: isOpen ? P.green : "#C9CED6" }]}
        >
          {toggling ? <ActivityIndicator size="small" color="#fff" /> : <View style={[cs.switchThumb, { alignSelf: isOpen ? "flex-end" : "flex-start" }]} />}
        </TouchableOpacity>
      </View>

      {incomplete.length > 0 ? (
        <View style={cs.checklist} testID="owner-setup-checklist">
          <Text style={cs.checkHead}>SETUP {completion}% COMPLETE</Text>
          <View style={cs.progressTrack}><View style={[cs.progressFill, { width: `${completion}%` }]} /></View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18, marginTop: 12 }}>
            {checklist.map((c) => (
              <TouchableOpacity key={c.label} disabled={c.done || !c.route} onPress={() => c.route && go(c.route)} style={cs.checkItem} activeOpacity={0.7}>
                <Ionicons name={c.done ? "checkmark-circle" : "ellipse-outline"} size={18} color={c.done ? P.green : P.sub} />
                <Text style={[cs.checkLabel, c.done && { color: P.sub, textDecorationLine: "line-through" }]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function OwnerDesktopDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [restaurant, setRestaurant] = useState<Restaurant>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [unread, setUnread] = useState(0);
  const [toggling, setToggling] = useState(false);

  useFocusEffect(useCallback(() => {
    Api.ownerMyRestaurant().then((r: any) => setRestaurant(r)).catch(() => {});
    Api.ownerStats().then((s: any) => setStats(s)).catch(() => {});
    Api.ownerNotifUnread().then((r: any) => setUnread(r?.count || 0)).catch(() => {});
  }, []));

  const toggleOpen = useCallback(async () => {
    if (!restaurant || toggling) return;
    const next = !(restaurant.is_open ?? true);
    setToggling(true);
    try {
      const updated = await Api.ownerSetAvailability({ is_open: next });
      setRestaurant(updated as Restaurant);
    } catch (e: any) {
      console.warn(e?.message);
    } finally {
      setToggling(false);
    }
  }, [restaurant, toggling]);

  const topSlot = (
    <OwnerControlStrip
      restaurant={restaurant}
      stats={stats}
      toggling={toggling}
      onToggle={toggleOpen}
      onHours={() => router.push("/owner/hours")}
      go={(r: string) => router.push(r as any)}
    />
  );

  return (
    <ConsoleDashboard
      load={Api.ownerDashboard}
      nav={ownerNavFor(user)}
      brand={restaurant?.name || "Bisnoi"}
      title="Dashboard"
      greeting="Welcome back! Here's your restaurant at a glance."
      activeKey="dashboard"
      bellRoute="/owner/notifications"
      bellCount={unread}
      topSlot={topSlot}
      embedded
    />
  );
}

const cs = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: P.primaryTint, borderRadius: 16, borderWidth: 1, borderColor: P.line, padding: 16 },
  bannerTitle: { fontSize: 14, fontWeight: "800", color: P.text, marginBottom: 2 },
  bannerText: { fontSize: 12.5, color: P.sub, lineHeight: 18 },
  availCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: P.card, borderRadius: 16, borderWidth: 1, borderColor: P.line, padding: 16 },
  statusDot: { width: 14, height: 14, borderRadius: 7 },
  availTitle: { fontSize: 15, fontWeight: "800", color: P.text },
  availSub: { fontSize: 12.5, color: P.sub, marginTop: 2 },
  hoursBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: P.primaryTint, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  hoursBtnText: { fontSize: 13, fontWeight: "700", color: P.primary },
  switchTrack: { width: 56, height: 32, borderRadius: 16, padding: 3, justifyContent: "center" },
  switchThumb: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#fff" },
  checklist: { backgroundColor: P.card, borderRadius: 16, borderWidth: 1, borderColor: P.line, padding: 16 },
  checkHead: { fontSize: 12, fontWeight: "800", color: P.text, letterSpacing: 0.4, marginBottom: 10 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: P.track, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: P.green, borderRadius: 3 },
  checkItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkLabel: { fontSize: 13, fontWeight: "600", color: P.text },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  hero: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  hi: { fontSize: 24, fontWeight: font.black, color: colors.textPrimary },
  sub: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },

  liveChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.successSoft, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.success,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  liveChipText: { fontSize: 10, fontWeight: font.black, color: colors.success, letterSpacing: 0.6 },

  bellBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  bellBadge: { position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.error, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.background },
  bellBadgeText: { color: "#fff", fontSize: 10, fontWeight: font.black },

  banner: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.sm,
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
    padding: spacing.md, borderRadius: radius.md, borderWidth: 1,
  },
  bannerTitle: { fontSize: 14, fontWeight: font.bold, marginBottom: 2 },
  bannerText: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },

  checklistWrap: {
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    padding: spacing.md, backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  checklistHead: { marginBottom: spacing.sm },
  checklistTitle: { fontSize: 12, fontWeight: font.black, color: colors.textPrimary, letterSpacing: 0.4 },
  checklistSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  progressTrack: { height: 6, backgroundColor: colors.borderStrong, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.success, borderRadius: 3 },
  checkItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  checkLabel: { flex: 1, fontSize: 13, color: colors.textPrimary, fontWeight: font.semi },
  checkLabelDone: { color: colors.textMuted, textDecorationLine: "line-through" },

  statGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: spacing.md,
    paddingHorizontal: spacing.lg, marginTop: spacing.md,
  },
  statCard: { padding: spacing.md, gap: 6 },
  icBox: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 22, fontWeight: font.black, color: colors.textPrimary, marginTop: 4 },
  statLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: font.semi },

  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  sTitle: { fontSize: 13, fontWeight: font.black, color: colors.textPrimary, letterSpacing: 0.4, marginBottom: spacing.sm },
  viewAll: { fontSize: 12, color: colors.primary, fontWeight: font.bold },

  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  actionBtn: {
    width: "23%", minWidth: 78, flexGrow: 1, alignItems: "center", gap: 6,
    backgroundColor: colors.surface, borderRadius: radius.md,
    paddingVertical: spacing.md, paddingHorizontal: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  actionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 11, fontWeight: font.semi, color: colors.textPrimary, textAlign: "center" },

  availCard: {
    marginHorizontal: spacing.lg, marginTop: spacing.lg,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1.5, padding: spacing.md, gap: spacing.sm,
  },
  availRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  availDot: { width: 12, height: 12, borderRadius: 6 },
  availTitle: { fontSize: 15, fontWeight: font.black, color: colors.textPrimary },
  availSub: { fontSize: 12, fontWeight: font.med, color: colors.textSecondary, marginTop: 2 },
  switchTrack: { width: 56, height: 32, borderRadius: 16, padding: 3, justifyContent: "center" },
  switchThumb: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#FFFFFF" },
  hoursBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.primarySoft, borderRadius: radius.md,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  hoursBtnText: { fontSize: 13, fontWeight: font.bold, color: colors.primary },
  channelChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  channelChipText: { fontSize: 10, fontWeight: font.black, letterSpacing: 0.3 },
  tableChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  tableChipText: { fontSize: 10, fontWeight: font.bold, color: colors.textSecondary },
});
