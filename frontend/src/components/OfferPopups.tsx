import React, { useEffect, useMemo, useRef } from "react";
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Easing,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, shadow } from "@/src/theme";

const BLUE = "#4A72F5";

/* ============================================================
   1) OfferSuggestSheet — bottom sheet nudging the best offer
   ("EXCLUSIVELY FOR YOU — Save ₹X — APPLY")
   ============================================================ */
export function OfferSuggestSheet({
  visible, saveAmount, code, onApply, onClose,
}: {
  visible: boolean;
  saveAmount: number;
  code: string;
  onApply: () => void;
  onClose: () => void;
}) {
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      slide.setValue(0);
      Animated.spring(slide, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 160 }).start();
    }
  }, [visible, slide]);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [420, 0] });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        {/* floating close */}
        <TouchableOpacity onPress={onClose} style={styles.floatClose} testID="offer-suggest-close">
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]} testID="offer-suggest-sheet">
          {/* light-blue radial-ish header */}
          <View style={styles.sheetGlow} />
          <SealBadge />
          <Text style={styles.exclusive}>{"\u2726"}  EXCLUSIVELY FOR YOU  {"\u2726"}</Text>
          <Text style={styles.saveTitle}>
            Save <Text style={{ color: BLUE }}>{`\u20B9${saveAmount}`}</Text> on this order
          </Text>
          <Text style={styles.withCoupon}>with coupon {"'"}{code}{"'"}</Text>
          <Text style={styles.tapApply}>Tap on {"'APPLY'"} to avail this</Text>
          <TouchableOpacity style={styles.applyBtn} onPress={onApply} activeOpacity={0.9} testID="offer-suggest-apply">
            <Text style={styles.applyTxt}>APPLY</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Blue scalloped "seal" with a % — approximated with rotated rounded squares. */
function SealBadge() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  return (
    <Animated.View style={[styles.sealWrap, { transform: [{ scale }] }]}>
      <View style={[styles.sealSquare, { transform: [{ rotate: "0deg" }] }]} />
      <View style={[styles.sealSquare, { transform: [{ rotate: "22.5deg" }] }]} />
      <View style={[styles.sealSquare, { transform: [{ rotate: "45deg" }] }]} />
      <View style={[styles.sealSquare, { transform: [{ rotate: "67.5deg" }] }]} />
      <View style={styles.sealFace}>
        <Text style={styles.sealPct}>%</Text>
      </View>
    </Animated.View>
  );
}

/* ============================================================
   2) OfferCelebration — confetti + animated check popup
   ("'CODE' applied — You saved ₹X" / "Woohoo! Thanks")
   ============================================================ */
const CONFETTI_COLORS = ["#F97316", "#22C55E", "#3B82F6", "#EAB308", "#EC4899", "#8B5CF6", "#14B8A6"];

function ConfettiPiece({ delay, startX, drift, size, color, screenH, shape }: {
  delay: number; startX: number; drift: number; size: number; color: string; screenH: number; shape: "rect" | "circle" | "star";
}) {
  const prog = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(prog, {
      toValue: 1, duration: 2200, delay,
      easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();
  }, [prog, delay]);
  const translateY = prog.interpolate({ inputRange: [0, 1], outputRange: [-60, screenH * 0.85] });
  const translateX = prog.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, drift, drift * 1.6] });
  const rotate = prog.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${drift > 0 ? 540 : -540}deg`] });
  const opacity = prog.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 1, 1, 0] });
  if (shape === "star") {
    return (
      <Animated.Text style={{ position: "absolute", top: 0, left: startX, opacity, fontSize: size + 6, color, transform: [{ translateY }, { translateX }, { rotate }] }}>
        {"\u2605"}
      </Animated.Text>
    );
  }
  return (
    <Animated.View
      style={{
        position: "absolute", top: 0, left: startX, width: size, height: shape === "circle" ? size : size * 1.8,
        borderRadius: shape === "circle" ? size / 2 : 2, backgroundColor: color, opacity,
        transform: [{ translateY }, { translateX }, { rotate }],
      }}
    />
  );
}

export function OfferCelebration({
  visible, code, saveAmount, extraLine, onClose,
}: {
  visible: boolean;
  code: string;
  saveAmount: number;
  extraLine?: string;
  onClose: () => void;
}) {
  const { width: winW, height: winH } = useWindowDimensions();
  const pop = useRef(new Animated.Value(0)).current;
  const check = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      pop.setValue(0);
      check.setValue(0);
      Animated.sequence([
        Animated.spring(pop, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 180 }),
        Animated.spring(check, { toValue: 1, useNativeDriver: true, damping: 10, stiffness: 220 }),
      ]).start();
    }
  }, [visible, pop, check]);

  const pieces = useMemo(() => {
    if (!visible) return [] as any[];
    return Array.from({ length: 26 }).map((_, i) => ({
      key: i,
      delay: Math.random() * 700,
      startX: Math.random() * winW,
      drift: (Math.random() - 0.5) * 140,
      size: 6 + Math.random() * 7,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      shape: (["rect", "circle", "rect", "star"] as const)[i % 4],
    }));
  }, [visible, winW]);

  const cardScale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  const checkScale = check.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.celebrateBackdrop}>
        {pieces.map((p) => (
          <ConfettiPiece key={p.key} delay={p.delay} startX={p.startX} drift={p.drift} size={p.size} color={p.color} screenH={winH} shape={p.shape} />
        ))}
        <Animated.View style={[styles.celebrateCard, { transform: [{ scale: cardScale }], opacity: pop }]} testID="offer-celebration">
          <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }] }]}>
            <Ionicons name="checkmark" size={30} color="#fff" />
          </Animated.View>
          <Text style={styles.appliedCode}>{"'"}{code}{"'"} applied</Text>
          <Text style={styles.savedBig}>You saved {`\u20B9${saveAmount}`} on this order</Text>
          {!!extraLine && <Text style={styles.extraLine}>{extraLine}</Text>}
          <TouchableOpacity style={styles.thanksBtn} onPress={onClose} activeOpacity={0.85} testID="offer-celebration-thanks">
            <Text style={styles.thanksTxt}>Woohoo! Thanks</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  floatClose: {
    alignSelf: "center", width: 44, height: 44, borderRadius: 22, marginBottom: 14,
    backgroundColor: "rgba(60,60,60,0.85)", alignItems: "center", justifyContent: "center",
  },
  sheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingHorizontal: spacing.xl, paddingTop: 34, paddingBottom: 26, alignItems: "center",
    overflow: "hidden", alignSelf: "center", width: "100%", maxWidth: 560,
  },
  sheetGlow: {
    position: "absolute", top: -120, alignSelf: "center", width: 420, height: 260,
    borderRadius: 210, backgroundColor: "#E3ECFF", opacity: 0.8,
  },
  sealWrap: { width: 96, height: 96, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  sealSquare: {
    position: "absolute", width: 78, height: 78, borderRadius: 22, backgroundColor: BLUE,
  },
  sealFace: { alignItems: "center", justifyContent: "center" },
  sealPct: { color: "#fff", fontSize: 38, fontWeight: font.black },
  exclusive: { fontSize: 13, fontWeight: font.black, color: colors.textPrimary, letterSpacing: 3 },
  saveTitle: { fontSize: 26, fontWeight: font.black, color: colors.textPrimary, marginTop: 10, textAlign: "center" },
  withCoupon: { fontSize: 14, color: colors.textSecondary, marginTop: 6, fontWeight: font.semi },
  tapApply: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  applyBtn: {
    marginTop: 22, alignSelf: "stretch", backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 15, alignItems: "center", ...shadow.lifted,
  },
  applyTxt: { color: colors.onPrimary, fontSize: 16, fontWeight: font.black, letterSpacing: 3 },

  celebrateBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  celebrateCard: {
    backgroundColor: "#fff", borderRadius: 24, paddingHorizontal: spacing.xl, paddingVertical: 26,
    alignItems: "center", width: "100%", maxWidth: 420, ...shadow.lifted,
  },
  checkCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: BLUE,
    alignItems: "center", justifyContent: "center", marginBottom: 14,
  },
  appliedCode: { fontSize: 14, fontWeight: font.bold, color: colors.textSecondary, textAlign: "center" },
  savedBig: { fontSize: 21, fontWeight: font.black, color: colors.textPrimary, textAlign: "center", marginTop: 8, lineHeight: 30 },
  extraLine: { fontSize: 13, color: colors.textSecondary, marginTop: 6, textAlign: "center" },
  thanksBtn: {
    marginTop: 18, alignSelf: "stretch", backgroundColor: colors.surfaceAlt, borderRadius: radius.pill,
    paddingVertical: 13, alignItems: "center",
  },
  thanksTxt: { color: colors.success, fontSize: 15, fontWeight: font.black },
});
