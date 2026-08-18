import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, Image, TextInput, useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { useAuth, isStaff } from "@/src/auth";
import { LineAreaChart, DonutChart, BarChartWeek } from "@/src/components/charts";

// Reztro-style warm palette (admin dashboard only — independent of the app accent).
const P = {
  page: "#F4E9DD", rail: "#FFFFFF", card: "#FFFFFF",
  primary: "#F26B21", primarySoft: "#FBE2D0", primaryTint: "#FFF3EA",
  dark: "#222630", text: "#1F2430", sub: "#8A93A0", line: "#EFE7DF",
  green: "#1FA463", track: "#F1ECE6", chipBg: "#F7F1EA",
};
const DONUT_COLORS = ["#F26B21", "#F7C9A6", "#2B2F36", "#FBE0CC", "#F4A06A"];
const DAYS_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type Nav = { key: string; label: string; route: string; icon: keyof typeof Ionicons.glyphMap; badge?: number; module?: string };

export default function AdminDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const threeCol = width >= 1300;
  const pairRow = threeCol ? true : width >= 760;

  const [d, setD] = useState<any>(null);
  const [waiting, setWaiting] = useState(0);
  const [openComplaints, setOpenComplaints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [dash, cw, comps] = await Promise.all([
        Api.adminDashboard(),
        Api.adminChatWaiting().catch(() => ({ waiting: 0 })),
        Api.adminComplaints().catch(() => []),
      ]);
      setD(dash);
      setWaiting((cw as any)?.waiting ?? 0);
      setOpenComplaints(((comps as any[]) || []).filter((c) => c.status !== "resolved").length);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const rawNav: Nav[] = [
    { key: "dashboard", label: "Dashboard", route: "/admin", icon: "grid", module: "dashboard" },
    { key: "orders", label: "Orders", route: "/admin/orders", icon: "receipt-outline", module: "orders" },
    { key: "messages", label: "Messages", route: "/admin/support", icon: "chatbubble-ellipses-outline", badge: waiting, module: "support" },
    { key: "menu", label: "Menu", route: "/admin/menu", icon: "fast-food-outline", module: "restaurants" },
    { key: "restaurants", label: "Restaurants", route: "/admin/restaurants", icon: "storefront-outline", module: "restaurants" },
    { key: "users", label: "Users", route: "/admin/users", icon: "people-outline", module: "users" },
    { key: "riders", label: "Manage Riders", route: "/admin/riders", icon: "bicycle-outline", module: "users" },
    { key: "live-riders", label: "Live Riders", route: "/admin/live-riders", icon: "location", module: "users" },
    { key: "staff", label: "Admin Staff", route: "/admin/staff", icon: "shield-checkmark-outline", module: "__owner_only__" },
    { key: "reviews", label: "Reviews", route: "/admin/reviews", icon: "star-outline", module: "reviews" },
    { key: "offers", label: "Offers", route: "/admin/offers", icon: "pricetags-outline", module: "banners" },
    { key: "applications", label: "Applications", route: "/admin/applications", icon: "document-text-outline", module: "applications" },
    { key: "complaints", label: "Complaints", route: "/admin/complaints", icon: "alert-circle-outline", badge: openComplaints, module: "support" },
    { key: "finance", label: "Finance", route: "/admin/finance", icon: "wallet-outline", module: "finance" },
    { key: "reports", label: "Reports", route: "/admin/reports", icon: "stats-chart-outline", module: "finance" },
    { key: "pos", label: "POS Sales", route: "/admin/pos", icon: "calculator-outline", module: "orders" },
    { key: "ads", label: "Ads", route: "/admin/ads", icon: "megaphone-outline", module: "banners" },
    { key: "marketing", label: "Marketing", route: "/admin/marketing", icon: "send-outline", module: "support" },
    { key: "whatsapp", label: "WhatsApp", route: "/admin/whatsapp", icon: "logo-whatsapp", module: "support" },
    { key: "charges", label: "Charges", route: "/admin/charges", icon: "card-outline", module: "commission" },
    { key: "checkout", label: "Checkout", route: "/admin/checkout-settings", icon: "options-outline", module: "commission" },
    { key: "commission", label: "Commission & Pricing", route: "/admin/commission", icon: "trending-up-outline", module: "commission" },
    { key: "price-policy", label: "Price Policy", route: "/admin/price-policy", icon: "pricetag-outline", module: "price_policy" },
    { key: "legal-content", label: "Legal Content", route: "/admin/legal-content", icon: "document-text-outline", module: "settings" },
    { key: "cancellation-rules", label: "Cancellation Rules", route: "/admin/cancellation-rules", icon: "close-circle-outline", module: "settings" },
    { key: "cod-rules", label: "COD Rules", route: "/admin/cod-rules", icon: "cash-outline", module: "settings" },
    { key: "customer-payments", label: "Customer Payments", route: "/admin/customer-payments", icon: "card-outline", module: "users" },
    { key: "restaurant-performance", label: "Restaurant Performance", route: "/admin/restaurant-performance", icon: "trending-up-outline", module: "restaurants" },
    { key: "notifications", label: "Notifications", route: "/admin/notifications", icon: "notifications-outline", module: "notifications" },
    { key: "activity-logs", label: "Activity Logs", route: "/admin/activity-logs", icon: "reader-outline", module: "__owner_only__" },
    { key: "appearance", label: "Theme", route: "/admin/appearance", icon: "color-palette-outline", module: "settings" },
    { key: "customcss", label: "Custom CSS", route: "/admin/custom-css", icon: "code-slash-outline", module: "settings" },
  ];

  // Filter nav for staff: only show modules they have permission for; hide
  // owner-only entries (like Admin Staff management) entirely.
  const nav: Nav[] = rawNav.filter((n) => {
    if (n.module === "__owner_only__") return !isStaff(user);
    if (!isStaff(user)) return true;
    return (user?.permissions || []).includes(n.module || "");
  });

  const go = (r: string) => router.push(r as any);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: P.page }} edges={["top"]}>
      <View style={{ flex: 1, flexDirection: "row" }}>
        {/* Desktop: persistent labeled sidebar */}
        {isDesktop ? <Sidebar nav={nav} expanded drawer={false} go={go} /> : null}

        {/* ---------- Main ---------- */}
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={P.primary} size="large" />
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: isDesktop ? 24 : 14, paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={P.primary} />}
          >
            <Header user={user} isDesktop={isDesktop} waiting={waiting} go={go} onMenu={() => setDrawerOpen(true)} />

            <View style={{ flexDirection: threeCol ? "row" : "column", gap: 18, marginTop: 18 }}>
              {/* Center column */}
              <View style={{ flex: 1, gap: 18 }}>
                <StatRow stats={d?.stats} isDesktop={isDesktop} />

                <Row2 stack={!pairRow} leftFlex={1.7} rightFlex={1}>
                  <RevenueCard rev={d?.revenue} />
                  <TopCategoriesCard cats={d?.top_categories} />
                </Row2>

                <Row2 stack={!pairRow} leftFlex={1.7} rightFlex={1}>
                  <OrdersOverviewCard ov={d?.orders_overview} />
                  <OrderTypesCard types={d?.order_types} />
                </Row2>

                <RecentOrdersCard rows={d?.recent_orders} isDesktop={isDesktop} go={go} />
                <ReviewsCard reviews={d?.reviews} go={go} />

                {!threeCol ? (
                  <>
                    <TrendingCard items={d?.trending_menus} horizontal go={go} />
                    <ActivityCard items={d?.recent_activity} />
                  </>
                ) : null}
              </View>

              {threeCol ? (
                <View style={{ width: 330, gap: 18 }}>
                  <TrendingCard items={d?.trending_menus} go={go} />
                  <ActivityCard items={d?.recent_activity} />
                </View>
              ) : null}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Mobile: slide-in labeled drawer */}
      {!isDesktop && drawerOpen ? (
        <View style={styles.drawerOverlay}>
          <TouchableOpacity testID="admin-drawer-backdrop" activeOpacity={1} style={styles.drawerBackdrop} onPress={() => setDrawerOpen(false)} />
          <Sidebar nav={nav} expanded drawer go={go} onClose={() => setDrawerOpen(false)} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

/* ============================ Sidebar ============================ */
function Sidebar({ nav, expanded, drawer, go, onClose }: { nav: Nav[]; expanded: boolean; drawer?: boolean; go: (r: string) => void; onClose?: () => void }) {
  const width = drawer ? 272 : expanded ? 232 : 64;
  const handle = (route: string) => { go(route); if (onClose) onClose(); };
  return (
    <View style={[styles.sidebar, { width }, drawer && styles.sidebarDrawer]}>
      <View style={[styles.logoRow, !expanded && { justifyContent: "center", paddingHorizontal: 0 }]}>
        <View style={styles.logoBadge}><Ionicons name="restaurant" size={18} color="#fff" /></View>
        {expanded ? <Text style={styles.logoText}>Bisnoi</Text> : null}
        {drawer ? (
          <TouchableOpacity testID="admin-drawer-close" onPress={onClose} style={styles.drawerClose} hitSlop={10}>
            <Ionicons name="close" size={22} color={P.text} />
          </TouchableOpacity>
        ) : null}
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
        {nav.map((n) => {
          const active = n.key === "dashboard";
          return (
            <TouchableOpacity
              key={n.key}
              testID={`admin-nav-${n.key}`}
              activeOpacity={0.8}
              onPress={() => handle(n.route)}
              style={[styles.navItem, !expanded && { justifyContent: "center", paddingHorizontal: 0, marginHorizontal: 8 }, active && styles.navItemActive]}
            >
              <Ionicons name={n.icon} size={20} color={active ? "#fff" : P.sub} />
              {expanded ? <Text style={[styles.navLabel, active && { color: "#fff" }]} numberOfLines={1}>{n.label}</Text> : null}
              {n.badge ? (
                <View style={[styles.navBadge, !expanded && { position: "absolute", top: 4, right: 8 }]}>
                  <Text style={styles.navBadgeText}>{n.badge}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* ============================ Header ============================ */
function Header({ user, isDesktop, waiting, go, onMenu }: any) {
  return (
    <View style={styles.header}>
      {!isDesktop ? (
        <TouchableOpacity testID="admin-menu-open" onPress={onMenu} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="menu" size={22} color={P.text} />
        </TouchableOpacity>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.h1, !isDesktop && { fontSize: 19 }]} numberOfLines={1}>Dashboard</Text>
        {isDesktop ? <Text style={styles.hsub}>Hello {user?.name || "Admin"}, welcome back!</Text> : null}
      </View>
      {isDesktop ? (
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={P.sub} />
          <TextInput placeholder="Search anything" placeholderTextColor={P.sub} style={styles.searchInput} />
        </View>
      ) : null}
      <TouchableOpacity testID="header-messages" onPress={() => go("/admin/support")} style={styles.iconBtn}>
        <Ionicons name="notifications-outline" size={18} color={P.text} />
        {waiting > 0 ? <View style={styles.bellDot} /> : null}
      </TouchableOpacity>
      {isDesktop ? (
        <TouchableOpacity onPress={() => go("/admin/profile")} style={styles.iconBtn}>
          <Ionicons name="settings-outline" size={18} color={P.text} />
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity onPress={() => go("/admin/profile")} style={styles.profilePill} activeOpacity={0.85}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{(user?.name || "A")[0].toUpperCase()}</Text></View>
        {isDesktop ? (
          <View>
            <Text style={styles.profileName} numberOfLines={1}>{user?.name || "Admin"}</Text>
            <Text style={styles.profileRole}>Admin</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

/* ============================ Stat cards ============================ */
function StatRow({ stats, isDesktop }: any) {
  const cards = [
    { key: "total_orders", label: "Total Orders", icon: "receipt" as const, fmt: (v: number) => v.toLocaleString("en-IN") },
    { key: "total_customers", label: "Total Customer", icon: "people" as const, fmt: (v: number) => v.toLocaleString("en-IN") },
    { key: "total_revenue", label: "Total Revenue", icon: "cash" as const, fmt: (v: number) => `₹${Number(v).toLocaleString("en-IN")}` },
  ];
  return (
    <View style={{ flexDirection: "row", gap: isDesktop ? 14 : 8 }}>
      {cards.map((c) => {
        const s = stats?.[c.key] || { value: 0, delta: 0 };
        const up = (s.delta ?? 0) >= 0;
        const delta = (
          <View style={styles.deltaPill}>
            <Ionicons name={up ? "arrow-up" : "arrow-down"} size={10} color={up ? P.green : P.primary} />
            <Text style={[styles.deltaText, { color: up ? P.green : P.primary }]}>{Math.abs(s.delta ?? 0).toFixed(1)}%</Text>
          </View>
        );
        if (!isDesktop) {
          // Compact vertical card so label + value always fit on narrow screens.
          return (
            <View key={c.key} style={styles.statCardM} testID={`stat-${c.key}`}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={styles.statIconSm}><Ionicons name={c.icon} size={15} color="#fff" /></View>
                {delta}
              </View>
              <Text style={styles.statLabelM} numberOfLines={1}>{c.label}</Text>
              <Text style={styles.statValueM} numberOfLines={1} adjustsFontSizeToFit>{c.fmt(s.value || 0)}</Text>
            </View>
          );
        }
        return (
          <View key={c.key} style={[styles.statCard, { minWidth: 200 }]} testID={`stat-${c.key}`}>
            <View style={styles.statIcon}><Ionicons name={c.icon} size={22} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.statLabel} numberOfLines={1}>{c.label}</Text>
              <Text style={styles.statValue} numberOfLines={1}>{c.fmt(s.value || 0)}</Text>
            </View>
            {delta}
          </View>
        );
      })}
    </View>
  );
}

/* ============================ Revenue ============================ */
function RevenueCard({ rev }: any) {
  return (
    <Card>
      <View style={styles.cardHead}>
        <View>
          <Text style={styles.cardTitle}>Total Revenue</Text>
          <Text style={styles.bigNumber}>₹{Number(rev?.total || 0).toLocaleString("en-IN")}</Text>
        </View>
        <FilterChip label="Last 8 Months" />
      </View>
      <Legend />
      <LineAreaChart
        labels={rev?.labels || []}
        income={rev?.income || []}
        expense={rev?.expense || []}
        peakIndex={rev?.peak?.index ?? -1}
        peakTitle={rev?.peak?.label || ""}
        peakValue={`₹${Number(rev?.peak?.value || 0).toLocaleString("en-IN")}`}
      />
    </Card>
  );
}

function Legend() {
  return (
    <View style={{ flexDirection: "row", gap: 16, marginBottom: 4 }}>
      <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: P.primary }]} /><Text style={styles.legendText}>Income</Text></View>
      <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: P.dark }]} /><Text style={styles.legendText}>Expense</Text></View>
    </View>
  );
}

/* ============================ Top categories ============================ */
function TopCategoriesCard({ cats }: any) {
  const data = (cats || []).map((c: any, i: number) => ({ label: c.name, value: c.value, color: DONUT_COLORS[i % DONUT_COLORS.length] }));
  return (
    <Card>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Top Categories</Text>
        <FilterChip label="This Month" />
      </View>
      <View style={{ alignItems: "center", marginVertical: 8 }}>
        {data.length ? <DonutChart data={data} /> : <Text style={styles.empty}>No data</Text>}
      </View>
      <View style={{ gap: 8, marginTop: 4 }}>
        {data.map((c: any) => (
          <View key={c.label} style={styles.catRow}>
            <View style={[styles.dot, { backgroundColor: c.color }]} />
            <Text style={styles.catName}>{c.label}</Text>
            <Text style={styles.catPct}>{c.value}%</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

/* ============================ Orders overview ============================ */
function OrdersOverviewCard({ ov }: any) {
  const peak = ov?.peak_index ?? -1;
  return (
    <Card>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Orders Overview</Text>
        <FilterChip label="This Week" />
      </View>
      <BarChartWeek
        labels={ov?.labels || []}
        values={ov?.values || []}
        peakIndex={peak}
        tooltipTitle={peak >= 0 ? DAYS_FULL[peak] : ""}
        tooltipValue={peak >= 0 ? `${ov?.peak_value || 0} orders` : ""}
      />
    </Card>
  );
}

/* ============================ Order types ============================ */
function OrderTypesCard({ types }: any) {
  const icons: any = { "Dine-In": "restaurant", Takeaway: "bag-handle", Online: "globe" };
  return (
    <Card>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Order Types</Text>
        <FilterChip label="This Month" />
      </View>
      <View style={{ gap: 18, marginTop: 6 }}>
        {(types || []).map((t: any) => (
          <View key={t.type} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={styles.otIcon}><Ionicons name={icons[t.type] || "ellipse"} size={16} color={P.primary} /></View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                <Text style={styles.otLabel}>{t.type} <Text style={{ color: P.sub }}>{t.pct}%</Text></Text>
                <Text style={styles.otCount}>{t.count}</Text>
              </View>
              <View style={styles.otTrack}><View style={[styles.otFill, { width: `${Math.max(4, t.pct)}%` }]} /></View>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

/* ============================ Recent orders ============================ */
function statusMeta(s: string) {
  if (s === "delivered") return { label: "Completed", bg: P.primary, fg: "#fff" };
  if (s === "cancelled") return { label: "Cancelled", bg: P.dark, fg: "#fff" };
  return { label: "On Process", bg: P.primarySoft, fg: P.primary };
}
function RecentOrdersCard({ rows, isDesktop, go }: any) {
  return (
    <Card>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Recent Orders</Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <FilterChip label="This Week" />
          <TouchableOpacity onPress={() => go("/admin/orders")} style={styles.seeAllBtn}><Text style={styles.seeAllText}>See All</Text></TouchableOpacity>
        </View>
      </View>
      {/* header row */}
      <View style={[styles.tr, styles.thead]}>
        <Text style={[styles.th, { flex: 2.4 }]}>Menu</Text>
        {isDesktop ? <Text style={[styles.th, { width: 44, textAlign: "center" }]}>Qty</Text> : null}
        <Text style={[styles.th, { width: 70, textAlign: "right" }]}>Amount</Text>
        {isDesktop ? <Text style={[styles.th, { flex: 1.2 }]}>Customer</Text> : null}
        <Text style={[styles.th, { width: 92, textAlign: "center" }]}>Status</Text>
      </View>
      {(rows || []).map((o: any) => {
        const m = statusMeta(o.status);
        return (
          <View key={o.id} style={styles.tr} testID={`recent-order-${o.id}`}>
            <View style={{ flex: 2.4, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Thumb uri={o.image} />
              <View style={{ flex: 1 }}>
                <Text style={styles.menuName} numberOfLines={1}>{o.name}</Text>
                <Text style={styles.menuSub} numberOfLines={1}>{o.order_no} · {o.category || "Item"}</Text>
              </View>
            </View>
            {isDesktop ? <Text style={[styles.td, { width: 44, textAlign: "center" }]}>{o.qty}</Text> : null}
            <Text style={[styles.tdAmount, { width: 70, textAlign: "right" }]}>₹{o.amount}</Text>
            {isDesktop ? <Text style={[styles.td, { flex: 1.2 }]} numberOfLines={1}>{o.customer}</Text> : null}
            <View style={{ width: 92, alignItems: "center" }}>
              <View style={[styles.statusBadge, { backgroundColor: m.bg }]}><Text style={[styles.statusText, { color: m.fg }]}>{m.label}</Text></View>
            </View>
          </View>
        );
      })}
      {(rows || []).length === 0 ? <Text style={styles.empty}>No orders yet</Text> : null}
    </Card>
  );
}

/* ============================ Trending menus ============================ */
function TrendingCard({ items, horizontal, go }: any) {
  return (
    <Card>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Trending Menus</Text>
        <FilterChip label="This Week" />
      </View>
      {horizontal ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 4 }}>
          {(items || []).map((it: any, i: number) => <TrendingItem key={i} it={it} width={200} />)}
        </ScrollView>
      ) : (
        <View style={{ gap: 16, marginTop: 4 }}>
          {(items || []).slice(0, 4).map((it: any, i: number) => <TrendingItem key={i} it={it} />)}
        </View>
      )}
    </Card>
  );
}
function TrendingItem({ it, width }: { it: any; width?: number }) {
  return (
    <View style={[{ gap: 8 }, width ? { width } : null]}>
      {it.image ? (
        <Image source={{ uri: it.image }} style={styles.trendImg} />
      ) : (
        <View style={[styles.trendImg, { alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name="fast-food" size={30} color={P.primary} />
        </View>
      )}
      <Text style={styles.trendName} numberOfLines={1}>{it.name}</Text>
      <Text style={styles.menuSub}>{it.category || "Item"}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={styles.miniRow}><Ionicons name="star" size={12} color="#F5A623" /><Text style={styles.miniText}>{Number(it.rating || 0).toFixed(1)}</Text></View>
        <View style={styles.miniRow}><Ionicons name="bag-handle-outline" size={12} color={P.sub} /><Text style={styles.miniText}>{it.orders}</Text></View>
        <Text style={[styles.trendPrice, { marginLeft: "auto" }]}>₹{it.price}</Text>
      </View>
    </View>
  );
}

/* ============================ Recent activity ============================ */
function ActivityCard({ items }: any) {
  return (
    <Card>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Recent Activity</Text>
        <Ionicons name="ellipsis-horizontal" size={18} color={P.sub} />
      </View>
      <View style={{ marginTop: 6 }}>
        {(items || []).map((a: any, i: number) => (
          <View key={i} style={styles.actRow}>
            <View style={styles.actIcon}><Ionicons name={a.icon || "ellipse"} size={15} color={P.primary} /></View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Text style={styles.actName}>{a.name}</Text>
                {a.tag ? <View style={styles.actTag}><Text style={styles.actTagText}>{a.tag}</Text></View> : null}
              </View>
              <Text style={styles.actText}>{a.text}</Text>
              <Text style={styles.actTime}>{a.time}</Text>
            </View>
          </View>
        ))}
        {(items || []).length === 0 ? <Text style={styles.empty}>No recent activity</Text> : null}
      </View>
    </Card>
  );
}

/* ============================ Reviews ============================ */
function ReviewsCard({ reviews, go }: any) {
  return (
    <Card>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Customer Reviews</Text>
        <TouchableOpacity onPress={() => go("/admin/reviews")}><Text style={styles.seeAllText}>See More Reviews</Text></TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingVertical: 4 }}>
        {(reviews || []).map((r: any, i: number) => (
          <View key={i} style={styles.reviewCard}>
            <Text style={styles.reviewTitle} numberOfLines={1}>{r.title}</Text>
            <Text style={styles.reviewComment} numberOfLines={3}>{r.comment}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
              <Text style={styles.reviewUser}>{r.user} · {r.date}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Ionicons key={s} name={s <= Math.round(r.rating) ? "star" : "star-outline"} size={13} color="#F5A623" />
              ))}
              <Text style={styles.reviewRating}>{Number(r.rating).toFixed(1)}</Text>
            </View>
          </View>
        ))}
        {(reviews || []).length === 0 ? <Text style={styles.empty}>No reviews yet</Text> : null}
      </ScrollView>
    </Card>
  );
}

/* ============================ Shared bits ============================ */
function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
function Row2({ children, stack, leftFlex = 1, rightFlex = 1 }: any) {
  const [a, b] = React.Children.toArray(children);
  return (
    <View style={{ flexDirection: stack ? "column" : "row", gap: 18 }}>
      <View style={{ flex: stack ? undefined : leftFlex }}>{a}</View>
      <View style={{ flex: stack ? undefined : rightFlex }}>{b}</View>
    </View>
  );
}
function FilterChip({ label }: { label: string }) {
  return (
    <View style={styles.filterChip}>
      <Text style={styles.filterText}>{label}</Text>
      <Ionicons name="chevron-down" size={12} color={P.sub} />
    </View>
  );
}
function Thumb({ uri }: { uri?: string }) {
  if (!uri) return (
    <View style={[styles.thumb, { backgroundColor: P.primarySoft, alignItems: "center", justifyContent: "center" }]}>
      <Ionicons name="fast-food" size={18} color={P.primary} />
    </View>
  );
  return <Image source={{ uri }} style={styles.thumb} />;
}

const styles = StyleSheet.create({
  /* sidebar */
  sidebar: { backgroundColor: P.rail, borderRightWidth: 1, borderRightColor: P.line, paddingTop: 8 },
  sidebarDrawer: { borderRightWidth: 0, ...{ shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 4, height: 0 }, elevation: 16 } },
  drawerOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row", zIndex: 1000 } as any,
  drawerBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)" } as any,
  drawerClose: { marginLeft: "auto", width: 34, height: 34, borderRadius: 17, backgroundColor: P.chipBg, alignItems: "center", justifyContent: "center" },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, height: 56, marginBottom: 8 },
  logoBadge: { width: 32, height: 32, borderRadius: 10, backgroundColor: P.primary, alignItems: "center", justifyContent: "center" },
  logoText: { fontSize: 20, fontWeight: "800", color: P.text },
  navItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: 12, borderRadius: 12, marginBottom: 2 },
  navItemActive: { backgroundColor: P.primary },
  navLabel: { fontSize: 14, fontWeight: "600", color: P.sub, flex: 1 },
  navBadge: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: P.primary, alignItems: "center", justifyContent: "center" },
  navBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  upgradeCard: { margin: 14, marginTop: 24, backgroundColor: P.primaryTint, borderRadius: 16, padding: 14, alignItems: "center" },
  upgradeImg: { width: 64, height: 64, borderRadius: 32, marginBottom: 10 },
  upgradeText: { fontSize: 11.5, color: P.text, textAlign: "center", lineHeight: 16, marginBottom: 12 },
  upgradeBtn: { backgroundColor: P.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18, alignSelf: "stretch", alignItems: "center" },
  upgradeBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  /* header */
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  h1: { fontSize: 24, fontWeight: "800", color: P.text },
  hsub: { fontSize: 13, color: P.sub, marginTop: 2 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: P.card, borderRadius: 12, paddingHorizontal: 14, height: 44, width: 280, borderWidth: 1, borderColor: P.line },
  searchInput: { flex: 1, fontSize: 14, color: P.text, outlineStyle: "none" } as any,
  iconBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: P.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: P.line },
  bellDot: { position: "absolute", top: 10, right: 12, width: 7, height: 7, borderRadius: 4, backgroundColor: P.primary },
  profilePill: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: P.card, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 5, borderWidth: 1, borderColor: P.line },
  avatar: { width: 34, height: 34, borderRadius: 9, backgroundColor: P.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  profileName: { fontSize: 13, fontWeight: "700", color: P.text, maxWidth: 110 },
  profileRole: { fontSize: 11, color: P.sub },

  /* cards */
  card: { backgroundColor: P.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: P.line },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: P.text },
  bigNumber: { fontSize: 24, fontWeight: "800", color: P.text, marginTop: 4 },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: P.chipBg, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 },
  filterText: { fontSize: 12, fontWeight: "600", color: P.text },
  empty: { color: P.sub, fontSize: 13, textAlign: "center", paddingVertical: 16 },

  /* stat */
  statCard: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: P.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: P.line },
  statIcon: { width: 46, height: 46, borderRadius: 13, backgroundColor: P.primary, alignItems: "center", justifyContent: "center" },
  statLabel: { fontSize: 12, color: P.sub, fontWeight: "600" },
  statValue: { fontSize: 22, fontWeight: "800", color: P.text, marginTop: 3 },
  deltaPill: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start" },
  deltaText: { fontSize: 11, fontWeight: "700" },
  statCardM: { flex: 1, minWidth: 0, backgroundColor: P.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: P.line, gap: 8 },
  statIconSm: { width: 32, height: 32, borderRadius: 9, backgroundColor: P.primary, alignItems: "center", justifyContent: "center" },
  statLabelM: { fontSize: 11, color: P.sub, fontWeight: "600" },
  statValueM: { fontSize: 16, fontWeight: "800", color: P.text },

  /* legend / donut */
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 12, color: P.sub, fontWeight: "600" },
  catRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  catName: { fontSize: 13, color: P.text, fontWeight: "600", flex: 1 },
  catPct: { fontSize: 13, color: P.sub, fontWeight: "700" },

  /* order types */
  otIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: P.primarySoft, alignItems: "center", justifyContent: "center" },
  otLabel: { fontSize: 13, fontWeight: "700", color: P.text },
  otCount: { fontSize: 13, fontWeight: "800", color: P.text },
  otTrack: { height: 8, borderRadius: 4, backgroundColor: P.track, overflow: "hidden" },
  otFill: { height: 8, borderRadius: 4, backgroundColor: P.dark },

  /* table */
  thead: { borderBottomWidth: 1, borderBottomColor: P.line, paddingBottom: 10, marginBottom: 4 },
  tr: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 6 },
  th: { fontSize: 11.5, color: P.sub, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  td: { fontSize: 13, color: P.text, fontWeight: "600" },
  tdAmount: { fontSize: 13, color: P.primary, fontWeight: "800" },
  thumb: { width: 40, height: 40, borderRadius: 10 },
  menuName: { fontSize: 13.5, fontWeight: "700", color: P.text },
  menuSub: { fontSize: 11, color: P.sub, marginTop: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: "700" },
  seeAllBtn: { backgroundColor: P.primaryTint, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7 },
  seeAllText: { color: P.primary, fontWeight: "700", fontSize: 12.5 },

  /* trending */
  trendImg: { width: "100%", height: 120, borderRadius: 14, backgroundColor: P.primarySoft },
  trendName: { fontSize: 15, fontWeight: "800", color: P.text },
  miniRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  miniText: { fontSize: 12, color: P.sub, fontWeight: "700" },
  trendPrice: { fontSize: 15, fontWeight: "800", color: P.primary },

  /* activity */
  actRow: { flexDirection: "row", gap: 12, paddingBottom: 16 },
  actIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: P.primarySoft, alignItems: "center", justifyContent: "center" },
  actName: { fontSize: 13, fontWeight: "800", color: P.text },
  actTag: { backgroundColor: P.chipBg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  actTagText: { fontSize: 10, fontWeight: "700", color: P.sub },
  actText: { fontSize: 12.5, color: P.text, marginTop: 3, lineHeight: 17 },
  actTime: { fontSize: 11, color: P.sub, marginTop: 4 },

  /* reviews */
  reviewCard: { width: 250, backgroundColor: P.page, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: P.line },
  reviewTitle: { fontSize: 14, fontWeight: "800", color: P.text },
  reviewComment: { fontSize: 12, color: P.sub, marginTop: 6, lineHeight: 17 },
  reviewUser: { fontSize: 11.5, color: P.text, fontWeight: "700" },
  reviewRating: { fontSize: 12, fontWeight: "800", color: P.text, marginLeft: 4 },
});
