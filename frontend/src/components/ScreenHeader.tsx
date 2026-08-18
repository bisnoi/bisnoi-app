import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, font, radius } from "@/src/theme";
import { useSmartBack } from "@/src/utils/nav";

export function ScreenHeader({ title, subtitle, accent = colors.primary, right }: { title: string; subtitle?: string; accent?: string; right?: React.ReactNode }) {
  const smartBack = useSmartBack();
  return (
    <View style={styles.header}>
      <TouchableOpacity testID="screen-back" onPress={smartBack} style={styles.back} hitSlop={10}>
        <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Screen({ children }: { children: React.ReactNode }) {
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>{children}</SafeAreaView>;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  back: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  title: { fontSize: 19, fontWeight: font.black, color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
});
