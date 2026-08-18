import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, font } from "@/src/theme";

export type OfferCard = {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;      // banner background
  fg: string;      // text color
  accent: string;  // icon halo
};

const DEFAULT_OFFERS: OfferCard[] = [
  {
    id: "peak-bonus",
    title: "Peak-hour bonus is LIVE",
    subtitle: "Complete 5 orders between 12–3 PM to earn ₹150 extra.",
    icon: "flash",
    bg: "#FEF3C7",
    fg: "#78350F",
    accent: "#F59E0B",
  },
  {
    id: "streak",
    title: "Weekend streak +₹300",
    subtitle: "Deliver 15 orders Sat & Sun combined and unlock ₹300 bonus.",
    icon: "trophy",
    bg: "#DCFCE7",
    fg: "#166534",
    accent: "#16A34A",
  },
  {
    id: "refer",
    title: "Refer a rider, earn ₹500",
    subtitle: "Share your rider code — you both get ₹500 after 20 orders.",
    icon: "people",
    bg: "#DBEAFE",
    fg: "#1E3A8A",
    accent: "#2563EB",
  },
  {
    id: "rain-boost",
    title: "Rain surge active in your area",
    subtitle: "Delivery fees are 1.5× until 8 PM — go online now!",
    icon: "rainy",
    bg: "#EDE9FE",
    fg: "#5B21B6",
    accent: "#7C3AED",
  },
];

/**
 * Horizontally scrolling promo banner shown at the very top of the rider
 * "Available" screen. Auto-advances every 4 seconds so multiple offers stay
 * visible without the rider having to scroll manually.
 */
export function RiderOfferBanner({ offers = DEFAULT_OFFERS }: { offers?: OfferCard[] }) {
  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(0);
  const widthRef = useRef(0);

  useEffect(() => {
    if (offers.length <= 1) return;
    const id = setInterval(() => {
      if (!scrollRef.current || widthRef.current === 0) return;
      indexRef.current = (indexRef.current + 1) % offers.length;
      scrollRef.current.scrollTo({
        x: indexRef.current * widthRef.current,
        animated: true,
      });
    }, 4000);
    return () => clearInterval(id);
  }, [offers.length]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width; }}
      onMomentumScrollEnd={(e) => {
        const w = widthRef.current || e.nativeEvent.layoutMeasurement.width;
        indexRef.current = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, w));
      }}
      style={styles.wrap}
      contentContainerStyle={{ paddingHorizontal: spacing.lg }}
      testID="rider-offer-banner"
    >
      {offers.map((o, i) => (
        <View
          key={o.id}
          style={[
            styles.card,
            {
              backgroundColor: o.bg,
              borderColor: o.accent + "55",
              marginRight: i === offers.length - 1 ? 0 : 8,
            },
          ]}
          testID={`rider-offer-${o.id}`}
        >
          <View style={[styles.iconWrap, { backgroundColor: o.accent }]}>
            <Ionicons name={o.icon} size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: o.fg }]} numberOfLines={1}>
              {o.title}
            </Text>
            <Text style={[styles.sub, { color: o.fg, opacity: 0.85 }]} numberOfLines={2}>
              {o.subtitle}
            </Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  card: {
    width: 320,
    maxWidth: "94%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 13,
    fontWeight: font.black,
    letterSpacing: 0.2,
  },
  sub: {
    fontSize: 11.5,
    fontWeight: font.semi,
    marginTop: 2,
    lineHeight: 15,
  },
});
