import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, Image, TextInput, useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { LineAreaChart, DonutChart, BarChartWeek } from "@/src/components/charts";

// Bisnoi Owner Console — Riday-style light theme with green accent.
export const P = {
  page: "#F6F8F7", rail: "#FFFFFF", card: "#FFFFFF",
  primary: "#16A34A", primarySoft: "#DFF7E7", primaryTint: "#F2FBF5", white: "#FFFFFF",
  dark: "#101828", text: "#101828", sub: "#667085", line: "#E6ECE8",
  green: "#16A34A", secondary: "#0EA5A4",
  track: "#F2F4F7", chipBg: "#F2FBF5",
  upBg: "#ECFDF3", upText: "#027A48", downBg: "#FEF3F2", downText: "#B42318",
};
const DONUT_COLORS = ["#16A34A", "#0EA5A4", "#86EFAC", "#F97316", "#BBF7D0"];
const DAYS_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type ConsoleNav = { key: string; label: string; route: string; icon: keyof typeof Ionicons.glyphMap; badge?: number };

type Props = {
  load: () => Promise<any>;
  nav: ConsoleNav[];
  brand?: string;
  title?: string;
  greeting?: string;
  activeKey?: string;
  bellRoute: string;
  bellCount?: number;
  topSlot?: React.ReactNode;
  embedded?: boolean;
};

export default function ConsoleDashboard({ load, nav, brand = "Bisnoi", title = "Dashboard", greeting, activeKey = "dashboard", bellRoute, bellCount = 0, topSlot, embedded = false }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const threeCol = width >= 1300;
  const pairRow = threeCol ? true : width >= 760;

  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const doLoad = React.useCallback(async () => {
    try { setD(await load()); } finally { setLoading(false); setRefreshing(false); }
  }, [load]);

  useFocusEffect(React.useCallback(() => { doLoad(); }, [doLoad]));

  const go = (r: string) => router.push(r as any);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: P.page }} edges={["top"]}>
      <View style={{ flex: 1, flexDirection: "row" }}>
        {isDesktop && !embedded ? <Sidebar nav={nav} brand={brand} activeKey={activeKey} expanded drawer={false} go={go} /> : null}

        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={P.primary} size="large" />
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: isDesktop ? 24 : 14, paddingBottom: 90 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); doLoad(); }} tintColor={P.primary} />}
          >
            <Header user={user} isDesktop={isDesktop} title={title} greeting={greeting} bellRoute={bellRoute} bellCount={bellCount} go={go} onMenu={() => setDrawerOpen(true)} />

            {topSlot ? <View style={{ marginTop: 16 }}>{topSlot}</View> : null}

            <View style={{ flexDirection: threeCol ? "row" : "column", gap: 18, marginTop: 18 }}>
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
                <RecentOrdersCard rows={d?.recent_orders} isDesktop={isDesktop} go={go} ordersRoute={nav.find((n) => n.key === "orders")?.route || "/"} />
                <ReviewsCard reviews={d?.reviews} go={go} reviewsRoute={nav.find((n) => n.key === "reviews")?.route || "/"} />
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

      {!isDesktop && drawerOpen ? (
        <View style={styles.drawerOverlay}>
          <TouchableOpacity testID="console-drawer-backdrop" activeOpacity={1} style={styles.drawerBackdrop} onPress={() => setDrawerOpen(false)} />
          <Sidebar nav={nav} brand={brand} activeKey={activeKey} expanded drawer go={go} onClose={() => setDrawerOpen(false)} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

/* ============================ Sidebar ============================ */
export function Sidebar({ nav, brand, activeKey, expanded, drawer, go, onClose, onToggleCollapse }: { nav: ConsoleNav[]; brand: string; activeKey: string; expanded: boolean; drawer?: boolean; go: (r: string) => void; onClose?: () => void; onToggleCollapse?: () => void }) {
  const width = drawer ? 272 : expanded ? 232 : 72;
  const handle = (route: string) => { go(route); if (onClose) onClose(); };
  return (
    <View style={[styles.sidebar, { width }, drawer && styles.sidebarDrawer]}>
      <View style={[styles.logoRow, !expanded && !drawer && { justifyContent: "center", paddingHorizontal: 0 }]}>
        <View style={styles.logoBadge}><Text style={styles.logoBadgeText}>B</Text></View>
        {expanded || drawer ? (
          <View style={{ flex: 1 }}>
            <Text style={styles.logoText}>{brand}</Text>
            <Text style={styles.logoSub}>Owner Console</Text>
          </View>
        ) : null}
        {drawer ? (
          <TouchableOpacity testID="console-drawer-close" onPress={onClose} style={styles.drawerClose} hitSlop={10}>
            <Ionicons name="close" size={22} color={P.text} />
          </TouchableOpacity>
        ) : onToggleCollapse ? (
          <TouchableOpacity
            testID="console-sidebar-toggle"
            onPress={onToggleCollapse}
            hitSlop={8}
            style={[styles.collapseBtn, !expanded && { position: "absolute", top: 14, right: -14 }]}
            activeOpacity={0.8}
          >
            <Ionicons name={expanded ? "chevron-back" : "chevron-forward"} size={14} color={P.primary} />
          </TouchableOpacity>
        ) : null}
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
        {nav.map((n) => {
          const active = n.key === activeKey;
          return (
            <TouchableOpacity
              key={n.key}
              testID={`console-nav-${n.key}`}
              activeOpacity={0.8}
              onPress={() => handle(n.route)}
              style={[styles.navItem, !expanded && { justifyContent: "center", paddingHorizontal: 0, marginHorizontal: 8 }, active && styles.navItemActive]}
            >
              <Ionicons name={n.icon} size={20} color={active ? P.primary : P.sub} />
              {expanded ? <Text style={[styles.navLabel, active && { color: P.upText, fontWeight: "700" }]} numberOfLines={1}>{n.label}</Text> : null}
              {active && expanded && !n.badge ? <Ionicons name="chevron-forward" size={14} color={P.primary} style={{ marginLeft: "auto" }} /> : null}
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
function Header({ user, isDesktop, title, greeting, bellRoute, bellCount, go, onMenu }: any) {
  return (
    <View style={styles.header}>
      {!isDesktop ? (
        <TouchableOpacity testID="console-menu-open" onPress={onMenu} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="menu" size={22} color={P.text} />
        </TouchableOpacity>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.h1, !isDesktop && { fontSize: 19 }]} numberOfLines={1}>{title}</Text>
        {isDesktop ? <Text style={styles.hsub}>{greeting || `Hello ${user?.name || "there"}, welcome back!`}</Text> : null}
      </View>
      {isDesktop ? (
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={P.sub} />
          <TextInput placeholder="Search anything" placeholderTextColor={P.sub} style={styles.searchInput} />
        </View>
      ) : null}
      <TouchableOpacity testID="console-pos-btn" onPress={() => go("/owner/pos")} style={styles.posBtn} activeOpacity={0.85}>
        <Ionicons name="calculator-outline" size={16} color={P.white} />
        <Text style={styles.posBtnTxt}>POS</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="console-bell" onPress={() => go(bellRoute)} style={styles.iconBtn}>
        <Ionicons name="notifications-outline" size={18} color={P.text} />
        {bellCount > 0 ? <View style={styles.bellDot} /> : null}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => go(bellRoute)} style={styles.profilePill} activeOpacity={0.85}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{(user?.name || "A")[0].toUpperCase()}</Text></View>
        {isDesktop ? (
          <View>
            <Text style={styles.profileName} numberOfLines={1}>{user?.name || "User"}</Text>
            <Text style={styles.profileRole}>{user?.role === "restaurant_owner" ? "Owner" : "Admin"}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

/* ============================ Stat cards ============================ */
function StatRow({ stats, isDesktop }: any) {
  const cards = [
    { key: "total_orders", label: "Total Orders", icon: "receipt-outline" as const, fmt: (v: number) => v.toLocaleString("en-IN") },
    { key: "total_customers", label: "Total Customer", icon: "people-outline" as const, fmt: (v: number) => v.toLocaleString("en-IN") },
    { key: "total_revenue", label: "Total Revenue", icon: "cash-outline" as const, fmt: (v: number) => `₹${Number(v).toLocaleString("en-IN")}` },
  ];
  return (
    <View style={{ flexDirection: "row", gap: isDesktop ? 14 : 8 }}>
      {cards.map((c) => {
        const s = stats?.[c.key] || { value: 0, delta: 0 };
        const up = (s.delta ?? 0) >= 0;
        const delta = (
          <View style={[styles.deltaPill, { backgroundColor: up ? P.upBg : P.downBg }]}>
            <Ionicons name={up ? "arrow-up" : "arrow-down"} size={10} color={up ? P.upText : P.downText} />
            <Text style={[styles.deltaText, { color: up ? P.upText : P.downText }]}>{Math.abs(s.delta ?? 0).toFixed(1)}%</Text>
          </View>
        );
        if (!isDesktop) {
          return (
            <View key={c.key} style={styles.statCardM} testID={`stat-${c.key}`}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={styles.statIconSm}><Ionicons name={c.icon} size={16} color={P.primary} /></View>
                {delta}
              </View>
              <Text style={styles.statLabelM} numberOfLines={1}>{c.label}</Text>
              <Text style={styles.statValueM} numberOfLines={1} adjustsFontSizeToFit>{c.fmt(s.value || 0)}</Text>
            </View>
          );
        }
        return (
          <View key={c.key} style={[styles.statCard, { minWidth: 200 }]} testID={`stat-${c.key}`}>
            <View style={styles.statIcon}><Ionicons name={c.icon} size={22} color={P.primary} /></View>
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
        incomeColor={P.primary}
        expenseColor={P.secondary}
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
      <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: P.secondary }]} /><Text style={styles.legendText}>Expense</Text></View>
    </View>
  );
}

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

function OrdersOverviewCard({ ov }: any) {
  const peak = ov?.peak_index ?? -1;
  return (
    <Card>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Orders Overview</Text>
        <FilterChip label="This Week" />
      </View>
      <BarChartWeek
        barColor={P.primarySoft}
        peakColor={P.primary}
        labels={ov?.labels || []}
        values={ov?.values || []}
        peakIndex={peak}
        tooltipTitle={peak >= 0 ? DAYS_FULL[peak] : ""}
        tooltipValue={peak >= 0 ? `${ov?.peak_value || 0} orders` : ""}
      />
    </Card>
  );
}

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

function statusMeta(s: string) {
  if (s === "delivered") return { label: "Completed", bg: P.upBg, fg: P.upText };
  if (s === "cancelled") return { label: "Cancelled", bg: P.downBg, fg: P.downText };
  return { label: "On Process", bg: P.primaryTint, fg: P.upText };
}
function RecentOrdersCard({ rows, isDesktop, go, ordersRoute }: any) {
  return (
    <Card>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Recent Orders</Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <FilterChip label="This Week" />
          <TouchableOpacity onPress={() => go(ordersRoute)} style={styles.seeAllBtn}><Text style={styles.seeAllText}>See All</Text></TouchableOpacity>
        </View>
      </View>
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

function ReviewsCard({ reviews, go, reviewsRoute }: any) {
  return (
    <Card>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Customer Reviews</Text>
        <TouchableOpacity onPress={() => go(reviewsRoute)}><Text style={styles.seeAllText}>See More Reviews</Text></TouchableOpacity>
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
  sidebar: { backgroundColor: P.rail, borderRightWidth: 1, borderRightColor: P.line, paddingTop: 8 },
  sidebarDrawer: { borderRightWidth: 0, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 4, height: 0 }, elevation: 16 },
  drawerOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row", zIndex: 1000 } as any,
  drawerBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)" } as any,
  drawerClose: { marginLeft: "auto", width: 34, height: 34, borderRadius: 17, backgroundColor: P.chipBg, alignItems: "center", justifyContent: "center" },
  collapseBtn: { marginLeft: "auto", width: 28, height: 28, borderRadius: 14, backgroundColor: P.card, borderWidth: 1, borderColor: P.line, alignItems: "center", justifyContent: "center", shadowColor: "#101828", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, height: 56, marginBottom: 8 },
  logoBadge: { width: 36, height: 36, borderRadius: 11, backgroundColor: P.primary, alignItems: "center", justifyContent: "center" },
  logoBadgeText: { color: "#fff", fontSize: 20, fontWeight: "900" },
  logoText: { fontSize: 19, fontWeight: "800", color: P.text },
  logoSub: { fontSize: 11, color: P.sub, fontWeight: "600", marginTop: -1 },
  navItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: 12, borderRadius: 12, marginBottom: 2 },
  navItemActive: { backgroundColor: P.primarySoft },
  navLabel: { fontSize: 14, fontWeight: "600", color: P.sub, flex: 1 },
  navBadge: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: P.primary, alignItems: "center", justifyContent: "center" },
  navBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  upgradeCard: { margin: 14, marginTop: 24, backgroundColor: P.primaryTint, borderRadius: 16, padding: 14, alignItems: "center" },
  upgradeImg: { width: 64, height: 64, borderRadius: 32, marginBottom: 10 },
  upgradeText: { fontSize: 11.5, color: P.text, textAlign: "center", lineHeight: 16, marginBottom: 12 },
  upgradeBtn: { backgroundColor: P.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18, alignSelf: "stretch", alignItems: "center" },
  upgradeBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  h1: { fontSize: 24, fontWeight: "800", color: P.text },
  hsub: { fontSize: 13, color: P.sub, marginTop: 2 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: P.card, borderRadius: 12, paddingHorizontal: 14, height: 44, width: 280, borderWidth: 1, borderColor: P.line },
  searchInput: { flex: 1, fontSize: 14, color: P.text, outlineStyle: "none" } as any,
  iconBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: P.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: P.line },
  posBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: P.primary, borderRadius: 12, paddingHorizontal: 16, height: 44 },
  posBtnTxt: { color: P.white, fontWeight: "900", fontSize: 14, letterSpacing: 0.4 },
  bellDot: { position: "absolute", top: 10, right: 12, width: 7, height: 7, borderRadius: 4, backgroundColor: P.primary },
  profilePill: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: P.card, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 5, borderWidth: 1, borderColor: P.line },
  avatar: { width: 34, height: 34, borderRadius: 9, backgroundColor: P.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  profileName: { fontSize: 13, fontWeight: "700", color: P.text, maxWidth: 110 },
  profileRole: { fontSize: 11, color: P.sub },

  card: { backgroundColor: P.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: P.line, shadowColor: "#101828", shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 2 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: P.text },
  bigNumber: { fontSize: 24, fontWeight: "800", color: P.text, marginTop: 4 },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: P.chipBg, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 },
  filterText: { fontSize: 12, fontWeight: "600", color: P.text },
  empty: { color: P.sub, fontSize: 13, textAlign: "center", paddingVertical: 16 },

  statCard: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: P.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: P.line },
  statIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: P.primaryTint, alignItems: "center", justifyContent: "center" },
  statLabel: { fontSize: 12, color: P.sub, fontWeight: "600" },
  statValue: { fontSize: 22, fontWeight: "800", color: P.text, marginTop: 3 },
  deltaPill: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  deltaText: { fontSize: 11, fontWeight: "700" },
  statCardM: { flex: 1, minWidth: 0, backgroundColor: P.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: P.line, gap: 8 },
  statIconSm: { width: 34, height: 34, borderRadius: 11, backgroundColor: P.primaryTint, alignItems: "center", justifyContent: "center" },
  statLabelM: { fontSize: 11, color: P.sub, fontWeight: "600" },
  statValueM: { fontSize: 16, fontWeight: "800", color: P.text },

  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 12, color: P.sub, fontWeight: "600" },
  catRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  catName: { fontSize: 13, color: P.text, fontWeight: "600", flex: 1 },
  catPct: { fontSize: 13, color: P.sub, fontWeight: "700" },

  otIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: P.primarySoft, alignItems: "center", justifyContent: "center" },
  otLabel: { fontSize: 13, fontWeight: "700", color: P.text },
  otCount: { fontSize: 13, fontWeight: "800", color: P.text },
  otTrack: { height: 8, borderRadius: 4, backgroundColor: P.track, overflow: "hidden" },
  otFill: { height: 8, borderRadius: 4, backgroundColor: P.primary },

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

  trendImg: { width: "100%", height: 120, borderRadius: 14, backgroundColor: P.primarySoft },
  trendName: { fontSize: 15, fontWeight: "800", color: P.text },
  miniRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  miniText: { fontSize: 12, color: P.sub, fontWeight: "700" },
  trendPrice: { fontSize: 15, fontWeight: "800", color: P.primary },

  actRow: { flexDirection: "row", gap: 12, paddingBottom: 16 },
  actIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: P.primarySoft, alignItems: "center", justifyContent: "center" },
  actName: { fontSize: 13, fontWeight: "800", color: P.text },
  actTag: { backgroundColor: P.chipBg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  actTagText: { fontSize: 10, fontWeight: "700", color: P.sub },
  actText: { fontSize: 12.5, color: P.text, marginTop: 3, lineHeight: 17 },
  actTime: { fontSize: 11, color: P.sub, marginTop: 4 },

  reviewCard: { width: 250, backgroundColor: P.page, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: P.line },
  reviewTitle: { fontSize: 14, fontWeight: "800", color: P.text },
  reviewComment: { fontSize: 12, color: P.sub, marginTop: 6, lineHeight: 17 },
  reviewUser: { fontSize: 11.5, color: P.text, fontWeight: "700" },
  reviewRating: { fontSize: 12, fontWeight: "800", color: P.text, marginLeft: 4 },
});
