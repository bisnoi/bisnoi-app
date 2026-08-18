import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, font } from "@/src/theme";

export type AppStatus = "pending" | "clarification_requested" | "approved" | "rejected";

export function statusMeta(s: string) {
  const m: Record<string, { bg: string; fg: string; label: string; icon: keyof typeof Ionicons.glyphMap }> = {
    pending: { bg: colors.warningSoft, fg: colors.warning, label: "Under Review", icon: "time" },
    clarification_requested: { bg: colors.primarySoft, fg: colors.primary, label: "Clarification", icon: "chatbubble-ellipses" },
    approved: { bg: colors.successSoft, fg: colors.success, label: "Approved", icon: "checkmark-circle" },
    rejected: { bg: colors.errorSoft, fg: colors.error, label: "Rejected", icon: "close-circle" },
  };
  return m[s] || { bg: colors.surfaceAlt, fg: colors.textSecondary, label: s, icon: "information-circle" };
}

export function ApplicationStatusPill({ status }: { status: string }) {
  const m = statusMeta(status);
  return (
    <View style={[styles.pill, { backgroundColor: m.bg }]}>
      <Ionicons name={m.icon} size={12} color={m.fg} />
      <Text style={{ color: m.fg, fontWeight: font.bold, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{m.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
});
