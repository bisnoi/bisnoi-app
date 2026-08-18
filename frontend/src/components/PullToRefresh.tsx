import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

/**
 * Global "swipe down to refresh" for the web PWA.
 *
 * Because the app root is rendered with position:fixed (to behave like a native
 * app), the browser's own pull-to-refresh is disabled. This component restores
 * that gesture: when the user drags down while the current scroll area is at the
 * very top, we show a pull indicator and reload the page on release.
 *
 * No-op on native (iOS/Android build) where RefreshControl is used per screen.
 */
const THRESHOLD = 70; // px of pull needed to trigger a refresh
const MAX = 96; // max visual pull

function findScroller(node: any): any {
  let el = node as HTMLElement | null;
  while (el && el !== document.body) {
    try {
      const style = window.getComputedStyle(el);
      const oy = style.overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 2) {
        return el;
      }
    } catch {
      /* ignore */
    }
    el = el.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startY = useRef(0);
  const armed = useRef(false);
  const scroller = useRef<any>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const onStart = (e: TouchEvent) => {
      if (refreshing || e.touches.length !== 1) {
        armed.current = false;
        return;
      }
      const t = e.touches[0];
      startY.current = t.clientY;
      const sc = findScroller(e.target);
      scroller.current = sc;
      const top = sc ? (sc.scrollTop || 0) : 0;
      armed.current = top <= 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!armed.current || refreshing || e.touches.length !== 1) return;
      const sc = scroller.current;
      if (sc && (sc.scrollTop || 0) > 0) {
        // scrolled away from the top -> cancel gesture
        armed.current = false;
        if (pullRef.current !== 0) { pullRef.current = 0; setPull(0); }
        return;
      }
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        if (pullRef.current !== 0) { pullRef.current = 0; setPull(0); }
        return;
      }
      // pulling down at the top
      const dist = Math.min(delta * 0.5, MAX);
      pullRef.current = dist;
      setPull(dist);
      if (e.cancelable && delta > 6) e.preventDefault();
    };

    const finish = () => {
      if (!armed.current) return;
      armed.current = false;
      if (pullRef.current >= THRESHOLD) {
        setRefreshing(true);
        setPull(THRESHOLD);
        setTimeout(() => {
          try { window.location.reload(); } catch { /* ignore */ }
        }, 250);
      } else if (pullRef.current !== 0) {
        pullRef.current = 0;
        setPull(0);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", finish, { passive: true });
    window.addEventListener("touchcancel", finish, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove as any);
      window.removeEventListener("touchend", finish);
      window.removeEventListener("touchcancel", finish);
    };
  }, [refreshing]);

  if (Platform.OS !== "web") return null;
  if (pull <= 0 && !refreshing) return null;

  const progress = Math.min(pull / THRESHOLD, 1);
  const ready = progress >= 1;

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View
        style={[
          styles.badge,
          {
            transform: [{ translateY: (refreshing ? THRESHOLD : pull) - 46 }],
            opacity: refreshing ? 1 : Math.min(progress + 0.15, 1),
          },
        ]}
      >
        {refreshing ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons
            name={ready ? "arrow-up" : "arrow-down"}
            size={20}
            color={ready ? colors.primary : colors.textSecondary}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // pinned to the viewport top, centered horizontally
    position: (Platform.OS === "web" ? "fixed" : "absolute") as any,
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 99999,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
