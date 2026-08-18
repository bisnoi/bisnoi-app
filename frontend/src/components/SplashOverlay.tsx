import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Easing, Platform, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Exact brand green from the Bisnoi logo artwork.
const SPLASH_GREEN = "#287939";
const SPLASH_GREEN_DARK = "#1f5f2c";

// The real full Bisnoi logo (icon + wordmark + PURE VEG DELIVERY).
const LOGO_FULL = require("@/assets/images/logo-full.png");

/**
 * Full-screen brand splash shown on top of everything for a short duration
 * whenever the app first loads. It fades out smoothly. On web the pre-JS
 * <div id="pre-splash"> is removed as soon as this mounts so users see one
 * continuous green branded splash rather than two separate flashes.
 */
export default function SplashOverlay({ durationMs = 1500 }: { durationMs?: number }) {
  const [visible, setVisible] = useState(true);
  const fade = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const captionOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Remove the pre-JS splash div (if any) as soon as the React overlay is up.
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const el = document.getElementById("pre-splash");
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    // Animate in
    Animated.parallel([
      Animated.timing(logoOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 140 }),
    ]).start();

    Animated.timing(captionOpacity, {
      toValue: 1,
      duration: 400,
      delay: 250,
      useNativeDriver: true,
    }).start();

    const t = setTimeout(() => {
      Animated.timing(fade, {
        toValue: 0,
        duration: 400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start(() => setVisible(false));
    }, durationMs);

    // Web safety net: on some browsers (esp. headless / older) the
    // Animated.timing.start callback never fires, leaving the overlay
    // stuck at opacity 1 forever. Force-hide after fade window.
    const safety = setTimeout(() => setVisible(false), durationMs + 800);

    return () => { clearTimeout(t); clearTimeout(safety); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  return (
    <Animated.View pointerEvents={visible ? "auto" : "none"} style={[styles.overlay, { opacity: fade }]}>
      {/* Faint watermark food-pattern effect (subtle repeating circles) */}
      <View style={styles.patternLayer} pointerEvents="none">
        {Array.from({ length: 30 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.patternDot,
              {
                top: ((i * 79) % 100) + "%",
                left: ((i * 53) % 100) + "%",
              } as any,
            ]}
          />
        ))}
      </View>

      {/* Logo mark */}
      <Animated.View
        style={{
          transform: [{ scale: logoScale }],
          opacity: logoOpacity,
          alignItems: "center",
        }}
      >
        <Image
          source={LOGO_FULL}
          style={{ width: 260, height: 260 }}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Bottom tagline */}
      <Animated.View style={[styles.tagline, { opacity: captionOpacity }]}>
        <Ionicons name="leaf" size={14} color="#B4EFC6" />
        <Text style={styles.taglineTxt}>PURE VEG. PURE GOODNESS.</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SPLASH_GREEN,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  patternLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.08,
  },
  patternDot: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: "#fff",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  bigB: {
    color: "#fff",
    fontSize: 120,
    fontWeight: "900",
    lineHeight: 120,
    letterSpacing: -4,
  },
  bisnoiText: {
    color: "#fff",
    fontSize: 56,
    fontWeight: "800",
    marginTop: 12,
    letterSpacing: 1,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  dividerLine: {
    width: 40,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  pureVeg: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2.5,
  },
  tagline: {
    position: "absolute",
    bottom: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  taglineTxt: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
});
