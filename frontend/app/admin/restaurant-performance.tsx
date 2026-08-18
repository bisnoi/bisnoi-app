import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ScreenHeader, Screen } from "@/src/components/ScreenHeader";

function bandColor(b?: string) {
  return b === "high" ? colors.success : b === "mid" ? colors.warning : colors.error;
}

function fmtSec(s?: number): string {
  if (!s || s <= 0) return "\u2014";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export default function AdminRestaurantPerformance() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r: any = await Api.adminAllRestaurantsPerformance();
      setItems(r?.items || []);
    } catch { setItems([]); }
    finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <Screen>
      <ScreenHeader title="Restaurant Performance" subtitle={`${items.length} restaurants \u2022 sorted by lowest score`} />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          {items.map((it) => (
            <View key={it.restaurant.id} style={styles.card}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={[styles.badge, { backgroundColor: bandColor(it.score_band) + "22" }]}>
                  <Text style={{ color: bandColor(it.score_band), fontWeight: font.black, fontSize: 14 }}>
                    {Number(it.composite_score).toFixed(0)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{it.restaurant.name}</Text>
                  <Text style={styles.sub}>Band: {String(it.score_band || "").toUpperCase()} \u2022 Orders analysed: {it.orders_considered}</Text>
                </View>
              </View>
              <View style={styles.metricRow}>
                <Metric label="Mark-Ready avg" value={fmtSec(it.mark_ready_avg_seconds)} />
                <Metric label="On-time handover" value={`${Number(it.on_time_handover_pct).toFixed(0)}%`} />
                <Metric label="Availability" value={`${Number(it.availability_pct).toFixed(0)}%`} />
              </View>
            </View>
          ))}
          {items.length === 0 && <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 40 }}>No restaurants found.</Text>}
        </ScrollView>
      )}
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 10, ...shadow.card },
  badge: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 14, fontWeight: font.black, color: colors.textPrimary },
  sub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  metricRow: { flexDirection: "row", gap: 8 },
  metricCard: { flex: 1, backgroundColor: colors.background, borderRadius: radius.sm, padding: 8, borderWidth: 1, borderColor: colors.border },
  metricLabel: { fontSize: 10, fontWeight: font.bold, color: colors.textMuted, letterSpacing: 0.4 },
  metricValue: { fontSize: 15, fontWeight: font.black, color: colors.textPrimary, marginTop: 2 },
});
