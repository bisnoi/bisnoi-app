import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, font, shadow } from "@/src/theme";

export function Button({
  title, onPress, variant = "primary", loading, disabled, icon, style, full, testID,
}: {
  title: string; onPress?: () => void; variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean; disabled?: boolean; icon?: keyof typeof Ionicons.glyphMap; style?: ViewStyle; full?: boolean; testID?: string;
}) {
  const palette = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    secondary: { bg: colors.surface, fg: colors.primary, border: colors.primary },
    ghost: { bg: "transparent", fg: colors.textPrimary, border: "transparent" },
    danger: { bg: colors.error, fg: "#fff", border: colors.error },
  }[variant];
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[
        styles.btn,
        full && { alignSelf: "stretch" },
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.5 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {icon ? <Ionicons name={icon} size={18} color={palette.fg} /> : null}
          <Text style={[styles.btnText, { color: palette.fg }]}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Pill({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.pill,
        { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.borderStrong },
      ]}
    >
      {icon ? <Ionicons name={icon} size={14} color={active ? colors.onPrimary : colors.textSecondary} /> : null}
      <Text style={{ color: active ? colors.onPrimary : colors.textSecondary, fontWeight: font.semi, fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Rating({ value, size = 12 }: { value: number; size?: number }) {
  const bg = value >= 4 ? colors.success : value >= 3 ? colors.warning : colors.error;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm }}>
      <Ionicons name="star" size={size} color="#fff" />
      <Text style={{ color: "#fff", fontWeight: font.bold, fontSize: size }}>{value.toFixed(1)}</Text>
    </View>
  );
}

export function VegDot({ veg }: { veg: boolean }) {
  const color = veg ? colors.vegGreen : colors.nonVegRed;
  return (
    <View style={{ width: 14, height: 14, borderWidth: 1.5, borderColor: color, padding: 1.5, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

export function Empty({ icon, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 60, paddingHorizontal: 32 }}>
      <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
        <Ionicons name={icon} size={36} color={colors.primary} />
      </View>
      <Text style={{ fontSize: 18, fontWeight: font.bold, color: colors.textPrimary, textAlign: "center" }}>{title}</Text>
      {subtitle ? <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", marginTop: 6 }}>{subtitle}</Text> : null}
    </View>
  );
}

export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[{ height: 1, backgroundColor: colors.border, marginVertical: spacing.md }, style]} />;
}

export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
        <Text style={{ fontSize: 16, fontWeight: font.black, color: colors.textPrimary, letterSpacing: 0.3 }}>{title.toUpperCase()}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    placed: { bg: colors.warningSoft, fg: colors.warning, label: "Placed" },
    accepted: { bg: colors.primarySoft, fg: colors.primary, label: "Accepted" },
    preparing: { bg: colors.primarySoft, fg: colors.primary, label: "Preparing" },
    ready: { bg: colors.successSoft, fg: colors.success, label: "Ready" },
    picked: { bg: colors.successSoft, fg: colors.success, label: "Out for delivery" },
    delivered: { bg: colors.successSoft, fg: colors.success, label: "Delivered" },
    cancelled: { bg: colors.errorSoft, fg: colors.error, label: "Cancelled" },
  };
  const s = map[status] || { bg: colors.surfaceAlt, fg: colors.textSecondary, label: status };
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: s.bg }}>
      <Text style={{ color: s.fg, fontSize: 11, fontWeight: font.bold, textTransform: "uppercase", letterSpacing: 0.4 }}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  btnText: { fontSize: 15, fontWeight: font.bold, letterSpacing: 0.3 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginRight: 8,
  },
});
