import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ThemeProvider } from "@react-navigation/native";
import { colors, font, tabBar, bisnoiNavTheme } from "@/src/theme";
import { CartTabIcon } from "@/src/components/CartTabIcon";

/**
 * Customer bottom tab bar — floating pill design.
 * Home  |  Dine In  |  Cart (bounces when it has items)  |  Reorder
 *
 * The bar detaches from the bottom of the viewport (margin on all sides),
 * has fully-rounded corners and a solid opaque background with a soft
 * shadow — matching the modern "floating" look. Screens get extra bottom
 * padding so the tab bar never covers their content.
 */

const TAB_ICON_SIZE = 22;
const TAB_LABEL_STYLE = {
  fontSize: 10,
  fontWeight: font.bold,
  lineHeight: 12,
  marginTop: 2,
  marginBottom: 0,
} as const;

// Merge shared floating style from theme (position: absolute, radius, shadow…)
const TAB_STYLE = {
  ...(tabBar.style || {}),
} as const;

// NO reserved bottom strip: the scene wrapper is fully transparent AND has no
// bottom padding. Scrollable page content extends the full height of the
// viewport so the actual page content (cards, images, backgrounds) flows
// UNDER the floating pill and shows through its 15% transparency.
// Each tab screen already adds its own `paddingBottom` inside the ScrollView
// so the last row can be scrolled ABOVE the pill when needed.
const SCENE_STYLE = { backgroundColor: "transparent" } as const;

export default function CustomerLayout() {
  return (
    <ThemeProvider value={bisnoiNavTheme}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tabBar.activeTintColor,
        tabBarInactiveTintColor: tabBar.inactiveTintColor,
        tabBarStyle: TAB_STYLE,
        tabBarLabelStyle: TAB_LABEL_STYLE,
        tabBarIconStyle: { marginTop: 2, marginBottom: 0 },
        tabBarItemStyle: { borderRadius: 22, marginHorizontal: 2 },
        sceneStyle: SCENE_STYLE,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Ionicons name="home" size={TAB_ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="dinein"
        options={{
          title: "Dine In",
          tabBarIcon: ({ color }) => <Ionicons name="restaurant" size={TAB_ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: "Cart",
          tabBarIcon: ({ color }) => <CartTabIcon color={color} size={TAB_ICON_SIZE} />,
          // Hide the floating pill on the Cart/Checkout screen so it never
          // overlaps the sticky "Place Order" action bar (Zomato-style).
          tabBarStyle: { display: "none" },
        }}
      />
      <Tabs.Screen
        name="reorder"
        options={{
          title: "Reorder",
          tabBarIcon: ({ color }) => <Ionicons name="repeat" size={TAB_ICON_SIZE} color={color} />,
        }}
      />

      {/* Non-tab screens (still accessible via router.push) */}
      <Tabs.Screen name="orders" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="admin-panel" options={{ href: null }} />
      <Tabs.Screen name="apply" options={{ href: null }} />
      <Tabs.Screen name="favorites" options={{ href: null }} />
      <Tabs.Screen name="addresses" options={{ href: null }} />
      <Tabs.Screen name="payments" options={{ href: null }} />
      <Tabs.Screen name="complaints" options={{ href: null }} />
      <Tabs.Screen name="help" options={{ href: null }} />
      <Tabs.Screen name="terms" options={{ href: null }} />
      <Tabs.Screen name="privacy" options={{ href: null }} />
      <Tabs.Screen name="refund-policy" options={{ href: null }} />
      <Tabs.Screen name="cancellation-policy" options={{ href: null }} />
      <Tabs.Screen name="contact-us" options={{ href: null }} />
      <Tabs.Screen name="faqs" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
    </ThemeProvider>
  );
}
