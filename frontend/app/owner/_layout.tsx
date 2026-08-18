import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, useWindowDimensions, Modal, StyleSheet, Platform, ActivityIndicator, Switch } from "react-native";
import { Tabs, useRouter, useSegments } from "expo-router";
import { ThemeProvider } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { bisnoiNavTheme, colors, font, radius } from "@/src/theme";
import { Sidebar, P as ConsoleP } from "@/src/components/ConsoleDashboard";
import { ownerNavFor, ownerActiveKey } from "@/src/nav/ownerNav";
import { useAuth } from "@/src/auth";
import { Api } from "@/src/api";
import { useRoleGuard } from "@/src/utils/roleGuard";

const COLLAPSE_KEY = "bisnoi_owner_sidebar_collapsed";

function loadCollapsed(): boolean {
  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      return window.localStorage.getItem(COLLAPSE_KEY) === "1";
    }
  } catch { /* ignore */ }
  return false;
}
function saveCollapsed(v: boolean) {
  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
    }
  } catch { /* ignore */ }
}

const MOBILE_TABS: { key: string; label: string; route: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "dashboard", label: "Dashboard", route: "/owner", icon: "bar-chart" },
  { key: "orders", label: "Orders", route: "/owner/orders", icon: "receipt-outline" },
  { key: "pos", label: "Bill", route: "/owner/pos", icon: "calculator" },
  { key: "menu", label: "Menu", route: "/owner/menu", icon: "restaurant-outline" },
  { key: "reviews", label: "Reviews", route: "/owner/reviews", icon: "star-outline" },
];

export default function OwnerLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const router = useRouter();
  const segments = useSegments();
  const { user } = useAuth();
  const roleOk = useRoleGuard(["restaurant_owner", "restaurant_staff"]);

  const [collapsed, setCollapsed] = useState<boolean>(() => loadCollapsed());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [toggling, setToggling] = useState(false);

  React.useEffect(() => {
    Api.ownerMyRestaurant().then((r: any) => setRestaurant(r)).catch(() => {});
  }, []);

  const isOpen = restaurant?.is_open ?? true;
  const toggleOpen = React.useCallback(async () => {
    if (!restaurant || toggling) return;
    const next = !(restaurant.is_open ?? true);
    setToggling(true);
    try {
      const updated = await Api.ownerSetAvailability({ is_open: next });
      setRestaurant(updated as any);
    } catch (e: any) {
      console.warn(e?.message);
    } finally {
      setToggling(false);
    }
  }, [restaurant, toggling]);

  const nav = useMemo(() => ownerNavFor(user), [user]);
  // segments for /owner/pos -> ["owner", "pos"], for /owner -> ["owner"]
  const activeSeg = (segments as string[])[1];
  const activeKey = ownerActiveKey(activeSeg);

  const toggleCollapse = () => setCollapsed((v) => { const n = !v; saveCollapsed(n); return n; });
  const go = (r: string) => router.push(r as any);

  // Listen for a global event so any screen (e.g. POS hamburger) can open the drawer.
  React.useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const open = () => setDrawerOpen(true);
    window.addEventListener("owner-drawer-open", open as any);
    return () => window.removeEventListener("owner-drawer-open", open as any);
  }, []);

  // Hide the desktop static sidebar on the Billing/POS screen so it feels like
  // a full-width POS (PetPooja style). The hamburger inside POS opens the drawer.
  const showDesktopSidebar = isDesktop;

  if (!roleOk) return null;

  return (
    <ThemeProvider value={bisnoiNavTheme}>
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: ConsoleP.page }}>
        {showDesktopSidebar ? (
          <Sidebar
            nav={nav}
            brand="Bisnoi"
            activeKey={activeKey}
            expanded={!collapsed}
            drawer={false}
            go={go}
            onToggleCollapse={toggleCollapse}
          />
        ) : null}

        <View style={{ flex: 1 }}>
          {!isDesktop ? (
            <SafeAreaView edges={["top"]} style={sl.mobileHeaderSafe}>
              <View style={sl.mobileHeader}>
                <TouchableOpacity testID="owner-drawer-open" onPress={() => setDrawerOpen(true)} style={sl.hbtn} activeOpacity={0.75} hitSlop={8}>
                  <Ionicons name="menu" size={22} color={colors.textPrimary} />
                </TouchableOpacity>
                <View style={sl.brandRow}>
                  <View style={sl.brandDot}><Text style={sl.brandDotTxt}>B</Text></View>
                  <View>
                    <Text style={sl.brandTitle}>Bisnoi</Text>
                    <Text style={sl.brandSub}>Owner Console</Text>
                  </View>
                </View>
                <View style={sl.availToggleWrap}>
                  {toggling ? (
                    <ActivityIndicator size="small" color={colors.textSecondary} style={{ marginRight: 6 }} />
                  ) : (
                    <Text style={[sl.availPillTxt, { color: isOpen ? colors.success : colors.textSecondary }]}>{isOpen ? "ONLINE" : "OFFLINE"}</Text>
                  )}
                  <Switch
                    testID="owner-header-availability-toggle"
                    value={isOpen}
                    onValueChange={toggleOpen}
                    disabled={toggling || !restaurant}
                    trackColor={{ true: colors.success, false: colors.borderStrong }}
                    thumbColor="#FFFFFF"
                  />
                </View>
                <TouchableOpacity testID="owner-header-notif" onPress={() => go("/owner/notifications")} style={sl.hbtn} activeOpacity={0.75}>
                  <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          ) : null}

          <Tabs
            screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
            tabBar={() => null}
          >
            <Tabs.Screen name="index" options={{ title: "Dashboard" }} />
            <Tabs.Screen name="orders" options={{ title: "Orders" }} />
            <Tabs.Screen name="pos" options={{ title: "Bill" }} />
            <Tabs.Screen name="tables" options={{ title: "Tables" }} />
            <Tabs.Screen name="menu" options={{ title: "Menu" }} />
            <Tabs.Screen name="reviews" options={{ title: "Reviews" }} />
            <Tabs.Screen name="categories" options={{ href: null }} />
            <Tabs.Screen name="offers" options={{ href: null }} />
            <Tabs.Screen name="complaints" options={{ href: null }} />
            <Tabs.Screen name="finance" options={{ href: null }} />
            <Tabs.Screen name="reports" options={{ href: null }} />
            <Tabs.Screen name="outlet" options={{ href: null }} />
            <Tabs.Screen name="hours" options={{ href: null }} />
            <Tabs.Screen name="profile" options={{ href: null }} />
            <Tabs.Screen name="notifications" options={{ href: null }} />
            <Tabs.Screen name="qr-tables" options={{ title: "Tables" }} />
            <Tabs.Screen name="staff" options={{ href: null }} />
          </Tabs>

          {!isDesktop ? (
            <SafeAreaView edges={["bottom"]} style={sl.mobileTabBarSafe}>
              <View style={sl.mobileTabBar}>
                {MOBILE_TABS.map((t) => {
                  const active = activeKey === t.key;
                  if (t.key === "pos") {
                    return (
                      <TouchableOpacity
                        key={t.key}
                        testID="owner-tab-pos"
                        onPress={() => go(t.route)}
                        style={sl.centerBtnWrap}
                        activeOpacity={0.85}
                      >
                        <View style={sl.centerBtn}>
                          <Ionicons name={t.icon} size={22} color="#fff" />
                        </View>
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      key={t.key}
                      testID={`owner-tab-${t.key}`}
                      onPress={() => go(t.route)}
                      style={sl.tabBtn}
                      activeOpacity={0.75}
                    >
                      <Ionicons name={t.icon} size={22} color={active ? colors.primary : colors.textSecondary} />
                      <Text style={[sl.tabLabel, active && { color: colors.primary, fontWeight: font.black }]}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </SafeAreaView>
          ) : null}
        </View>
      </View>

      {/* Owner drawer — used on mobile always, and on desktop for the POS/Billing screen */}
      <Modal transparent visible={drawerOpen} animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
        <View style={sl.drawerBackdrop}>
          <Sidebar
            nav={nav}
            brand="Bisnoi"
            activeKey={activeKey}
            expanded
            drawer
            go={(r) => { setDrawerOpen(false); go(r); }}
            onClose={() => setDrawerOpen(false)}
          />
          <TouchableOpacity activeOpacity={1} style={sl.drawerScrim} onPress={() => setDrawerOpen(false)} />
        </View>
      </Modal>

    </ThemeProvider>
  );
}

const sl = StyleSheet.create({
  mobileHeaderSafe: { backgroundColor: colors.surface },
  mobileHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, height: 54 },
  hbtn: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  posBtnTxt: { fontSize: 12, fontWeight: font.black, color: colors.textPrimary },
  availPill: { flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: 12, borderRadius: radius.md },
  availToggleWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  availPillDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#fff" },
  availPillTxt: { fontSize: 11, fontWeight: font.black, color: "#fff", letterSpacing: 0.3 },
  brandRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  brandDot: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  brandDotTxt: { color: colors.onPrimary, fontWeight: font.black, fontSize: 16 },
  brandTitle: { fontSize: 15, fontWeight: font.black, color: colors.textPrimary },
  brandSub: { fontSize: 10, color: colors.textSecondary, fontWeight: font.semi, marginTop: -1 },
  drawerBackdrop: { flex: 1, flexDirection: "row", backgroundColor: "rgba(0,0,0,0.42)" },
  drawerScrim: { flex: 1 },

  mobileTabBarSafe: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  mobileTabBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", height: 64, paddingHorizontal: 4 },
  tabBtn: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, paddingVertical: 6 },
  tabLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: font.semi },
  centerBtnWrap: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: -28 },
  centerBtn: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
});
