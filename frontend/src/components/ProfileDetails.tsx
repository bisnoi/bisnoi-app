import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, shadow } from "@/src/theme";

export type DetailRow = { label: string; value?: string | null };

/** A titled card that renders label/value rows. Rows with empty values are hidden.
 *  If no rows have values, the whole section is hidden. */
export function DetailSection({
  title,
  icon,
  accent = colors.primary,
  rows,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent?: string;
  rows: DetailRow[];
}) {
  const visible = rows.filter(
    (r) => r.value !== undefined && r.value !== null && String(r.value).trim() !== "",
  );
  if (visible.length === 0) return null;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.icBox, { backgroundColor: accent + "22" }]}>
          <Ionicons name={icon} size={16} color={accent} />
        </View>
        <Text style={styles.title}>{title}</Text>
      </View>
      <View>
        {visible.map((r, i) => (
          <View key={r.label + i} style={[styles.row, i < visible.length - 1 && styles.rowBorder]}>
            <Text style={styles.label}>{r.label}</Text>
            <Text style={styles.value} numberOfLines={3}>{String(r.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Mask an account / id number, keeping only the last 4 digits visible. */
export function maskAccount(num?: string | null): string {
  if (!num) return "";
  const s = String(num).replace(/\s+/g, "");
  if (s.length <= 4) return s;
  return "\u2022\u2022\u2022\u2022 " + s.slice(-4);
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadow.card,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm },
  icBox: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 13, fontWeight: font.black, color: colors.textPrimary, letterSpacing: 0.4, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, paddingVertical: 9 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { fontSize: 13, color: colors.textSecondary, fontWeight: font.semi, flexShrink: 0 },
  value: { fontSize: 13, color: colors.textPrimary, fontWeight: font.semi, flex: 1, textAlign: "right" },
});
