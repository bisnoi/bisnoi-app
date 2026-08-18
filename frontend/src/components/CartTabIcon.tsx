import React, { useEffect, useRef } from "react";
import { View, Text, Animated, Easing, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCart } from "@/src/cart";
import { colors, font } from "@/src/theme";

/**
 * Cart tab icon that bounces gently while the cart has items.
 * The bounce is a subtle up-and-back translation looping every ~1.4s.
 */
export function CartTabIcon({ color, size }: { color: string; size: number }) {
  const { count } = useCart();
  const bounce = useRef(new Animated.Value(0)).current;
  const badgeScale = useRef(new Animated.Value(count > 0 ? 1 : 0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // Badge pop-in whenever count crosses 0 boundary
    Animated.spring(badgeScale, {
      toValue: count > 0 ? 1 : 0,
      useNativeDriver: true,
      damping: 8,
      stiffness: 220,
    }).start();
  }, [count > 0]);

  useEffect(() => {
    if (loopRef.current) loopRef.current.stop();
    if (count <= 0) {
      bounce.setValue(0);
      return;
    }
    // Continuous bouncing loop
    loopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, {
          toValue: -4,
          duration: 340,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: 340,
          easing: Easing.bounce,
          useNativeDriver: true,
        }),
        Animated.delay(700),
      ]),
    );
    loopRef.current.start();
    return () => {
      if (loopRef.current) loopRef.current.stop();
    };
  }, [count > 0]);

  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{ transform: [{ translateY: bounce }] }}>
        <Ionicons name="bag-handle" size={size} color={color} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.badge,
          {
            transform: [{ scale: badgeScale }],
            borderColor: colors.primary,
          },
        ]}
      >
        <Text style={styles.badgeTxt}>{count > 9 ? "9+" : count}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -6,
    right: -12,
    backgroundColor: colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  badgeTxt: { color: "#fff", fontSize: 10, fontWeight: font.black },
});
