import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ThemeProvider } from "@react-navigation/native";
import { tabBar, bisnoiNavTheme } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { useRiderHeartbeat } from "@/src/utils/useRiderHeartbeat";
import { useRoleGuard } from "@/src/utils/roleGuard";

export default function RiderLayout() {
  const { user } = useAuth();
  const roleOk = useRoleGuard(["rider"]);
  // Fire GPS heartbeats only when this account is an ONLINE rider. This is what
  // powers nearby-first dispatch — see /rider/heartbeat + _nearby_riders on
  // the backend. Toggling online/offline from the header instantly starts/stops.
  const isOnlineRider = user?.role === "rider" && (user as any)?.is_online !== false;
  useRiderHeartbeat(isOnlineRider);

  if (!roleOk) return null;

  return (
    <ThemeProvider value={bisnoiNavTheme}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tabBar.activeTintColor,
        tabBarInactiveTintColor: tabBar.inactiveTintColor,
        tabBarStyle: tabBar.style,
        tabBarLabelStyle: tabBar.labelStyle,
        tabBarIconStyle: tabBar.iconStyle,
        tabBarItemStyle: { borderRadius: 22, marginHorizontal: 2 },
        sceneStyle: { paddingBottom: 112, backgroundColor: "transparent" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Available", tabBarIcon: ({ color, size }) => <Ionicons name="flash" size={size} color={color} /> }} />
      <Tabs.Screen name="orders" options={{ title: "My Deliveries", tabBarIcon: ({ color, size }) => <Ionicons name="bicycle" size={size} color={color} /> }} />
      <Tabs.Screen name="finance" options={{ title: "Earnings", tabBarIcon: ({ color, size }) => <Ionicons name="wallet" size={size} color={color} /> }} />
      <Tabs.Screen name="reviews" options={{ title: "Reviews", tabBarIcon: ({ color, size }) => <Ionicons name="star" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} /> }} />
      {/* All secondary/legal screens are reachable from Profile, but hidden
          from the bottom bar so we keep exactly 5 tabs. */}
      <Tabs.Screen name="complaints" options={{ href: null }} />
      <Tabs.Screen name="reports" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="faqs" options={{ href: null }} />
      <Tabs.Screen name="help" options={{ href: null }} />
      <Tabs.Screen name="terms" options={{ href: null }} />
      <Tabs.Screen name="privacy" options={{ href: null }} />
      <Tabs.Screen name="contact-us" options={{ href: null }} />
      <Tabs.Screen name="refund-policy" options={{ href: null }} />
      <Tabs.Screen name="cancellation-policy" options={{ href: null }} />
    </Tabs>
    </ThemeProvider>
  );
}
