import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font } from "@/src/theme";

type TabDef = { name: string; label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon?: keyof typeof Ionicons.glyphMap };

// 5 visible owner tabs — the 3rd ("Bill") is the raised center action button.
const TABS: TabDef[] = [
  { name: "index", label: "Dashboard", icon: "stats-chart-outline", activeIcon: "stats-chart" },
  { name: "orders", label: "Orders", icon: "receipt-outline", activeIcon: "receipt" },
  { name: "pos", label: "Bill", icon: "calculator", activeIcon: "calculator" },
  { name: "menu", label: "Menu", icon: "restaurant-outline", activeIcon: "restaurant" },
  { name: "reviews", label: "Reviews", icon: "star-outline", activeIcon: "star" },
  { name: "qr-tables", label: "Tables", icon: "grid-outline", activeIcon: "grid" },
];
const CENTER = 2;
const BAR_H = 60;       // flat bar height (above safe-area inset)
const PROTRUDE = 28;    // how far the center button rises above the bar
const FAB = 62;         // center button diameter

export default function OwnerTabBar({ state, navigation }: any) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [bw, setBw] = useState(width);

  const current: string = state.routes[state.index]?.name;

  // Owner section now uses a full-height vertical sidebar (in owner/_layout) —
  // hide the floating bottom bar on ALL owner routes so the console look is
  // consistent across Dashboard, Orders, Billing, Menu, Reviews, Tables, etc.
  return null;

  const barH = BAR_H + insets.bottom;
  const cx = bw / 2;
  const dip = 30;        // cradle depth
  const half = 48;       // half-width of the cradle opening
  const path = `M0 0 H ${cx - half} C ${cx - half + 12} 0 ${cx - 34} ${dip} ${cx} ${dip} C ${cx + 34} ${dip} ${cx + half - 12} 0 ${cx + half} 0 H ${bw} V ${barH} H 0 Z`;

  const go = (name: string) => {
    if (name === current) return;
    const route = state.routes.find((r: any) => r.name === name);
    const event = navigation.emit({ type: "tabPress", target: route?.key, canPreventDefault: true });
    if (!event?.defaultPrevented) navigation.navigate(name);
  };

  return (
    <View
      style={[styles.wrap, { height: PROTRUDE + barH }]}
      pointerEvents="box-none"
      onLayout={(e) => setBw(e.nativeEvent.layout.width)}
    >
      {/* Curved bar background */}
      <Svg width={bw} height={barH} style={styles.svg} pointerEvents="none">
        <Path d={path} fill={colors.surface} />
      </Svg>

      {/* Tabs row */}
      <View style={[styles.row, { height: barH, paddingBottom: insets.bottom }]} pointerEvents="box-none">
        {TABS.map((t, i) => {
          const focused = current === t.name;
          if (i === CENTER) {
            return (
              <TouchableOpacity key={t.name} testID="owner-tab-pos" style={styles.slot} activeOpacity={0.85} onPress={() => go(t.name)}>
                <View style={{ height: 34 }} />
                <Text style={[styles.label, { color: focused ? colors.primary : colors.textPrimary, fontWeight: font.bold }]}>{t.label}</Text>
              </TouchableOpacity>
            );
          }
          return (
            <TouchableOpacity key={t.name} testID={`owner-tab-${t.name}`} style={styles.slot} activeOpacity={0.7} onPress={() => go(t.name)}>
              <Ionicons name={(focused && t.activeIcon) || t.icon} size={22} color={focused ? colors.primary : colors.textMuted} />
              <Text style={[styles.label, { color: focused ? colors.primary : colors.textMuted, fontWeight: focused ? font.bold : font.semi }]} numberOfLines={1}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Raised center action button (sits in the cradle) */}
      <View style={[styles.fabWrap, { left: cx - FAB / 2 }]} pointerEvents="box-none">
        <View style={styles.fabHalo}>
          <TouchableOpacity testID="owner-tab-pos-fab" activeOpacity={0.9} onPress={() => go("pos")} style={styles.fab}>
            <Ionicons name={TABS[CENTER].icon} size={26} color={colors.onPrimary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "transparent" },
  svg: { position: "absolute", left: 0, bottom: 0, filter: "drop-shadow(0 -6px 16px rgba(0,0,0,0.10))" } as any,
  row: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", paddingTop: 8 },
  slot: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 3, paddingBottom: 8 },
  label: { fontSize: 11, lineHeight: 15, letterSpacing: 0.2, textAlign: "center", includeFontPadding: false } as any,
  fabWrap: { position: "absolute", top: 0, alignItems: "center", justifyContent: "center", width: FAB },
  fabHalo: { width: FAB + 12, height: FAB + 12, borderRadius: (FAB + 12) / 2, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  fab: {
    width: FAB, height: FAB, borderRadius: FAB / 2, backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
    boxShadow: "0 8px 20px rgba(0,0,0,0.22)",
  } as any,
});
