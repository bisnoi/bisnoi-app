import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { Api } from "@/src/api";

function bandColor(band?: string): string {
  if (band === "high") return colors.success;
  if (band === "mid") return colors.warning;
  return colors.error;
}

function bandLabel(band?: string): string {
  if (band === "high") return "Excellent (0% refund share)";
  if (band === "mid") return "Fair (50% refund share)";
  return "Needs Improvement (100% refund share)";
}

function fmtSeconds(s: number | undefined): string {
  if (!s || s <= 0) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export default function OwnerPerformance() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const d: any = await Api.ownerPerformance();
      setData(d);
    } catch (e: any) {
      setError(e?.message || "Could not load performance");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const score = Number(data?.composite_score || 0);
  const band = data?.score_band || "low";
  const color = bandColor(band);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScreenHeader title="My Performance" subtitle="How your restaurant is doing" />
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          {error ? (
            <Text style={{ color: colors.error }}>{error}</Text>
          ) : null}

          {/* Big score card */}
          <View style={[styles.scoreCard, { borderColor: color + "55" }]}>
            <Text style={styles.smallLabel}>COMPOSITE SCORE (LAST 7 DAYS)</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
              <Text style={[styles.bigScore, { color }]}>{score.toFixed(1)}</Text>
              <Text style={{ color: colors.textSecondary, fontWeight: font.bold }}>/ 100</Text>
            </View>
            <View style={[styles.bandChip, { backgroundColor: color + "22" }]}>
              <Ionicons name={band === "high" ? "checkmark-circle" : band === "mid" ? "alert-circle" : "warning"} size={14} color={color} />
              <Text style={{ color, fontWeight: font.black, fontSize: 12 }}>{bandLabel(band)}</Text>
            </View>
          </View>

          {/* Metric cards */}
          <View style={styles.metricRow}>
            <MetricCard
              icon="timer"
              label="Mark-Ready Avg"
              value={fmtSeconds(Number(data?.mark_ready_avg_seconds || 0))}
              hint={`Target \u2264 ${fmtSeconds(15 * 60)}`}
            />
            <MetricCard
              icon="handshake"
              iconLib="material"
              label="On-Time Handover"
              value={`${Number(data?.on_time_handover_pct || 0).toFixed(0)}%`}
              hint="Ready \u2192 Picked by rider"
            />
          </View>
          <View style={styles.metricRow}>
            <MetricCard
              icon="wifi"
              label="Daily Availability"
              value={`${Number(data?.availability_pct || 0).toFixed(0)}%`}
              hint="Kitchen online during hours"
            />
            <MetricCard
              icon="receipt"
              label="Orders Considered"
              value={String(data?.orders_considered || 0)}
              hint="In last 7 days"
            />
          </View>

          {/* Improvement tips */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>How your score is calculated</Text>
            <Text style={styles.cardBody}>
              Score is a weighted composite: Mark-ready time (40%), On-time handover (30%) and Availability (30%).
            </Text>
            <Text style={styles.cardBody}>
              Bands: <Text style={{ color: colors.success }}>&gt;80 Excellent</Text>, <Text style={{ color: colors.warning }}>60–80 Fair</Text>, <Text style={{ color: colors.error }}>&lt;60 Needs improvement</Text>.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tips to improve</Text>
            <Bullet text="Accept and mark orders ready within the target time." />
            <Bullet text="Hand over to riders promptly — avoid holding cooked orders." />
            <Bullet text="Stay online during your committed hours; toggle availability accurately." />
            <Bullet text="Keep out-of-stock items marked unavailable to prevent order cancellations." />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function MetricCard({ icon, iconLib, label, value, hint }: { icon: any; iconLib?: string; label: string; value: string; hint?: string }) {
  return (
    <View style={styles.metricCard}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name={iconLib === "material" ? "hand-right" : icon} size={18} color={colors.primary} />
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
      <Text style={{ color: colors.primary, fontWeight: font.black }}>•</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1, lineHeight: 19 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  scoreCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 6,
    ...shadow.card,
  },
  smallLabel: { color: colors.textMuted, fontSize: 11, fontWeight: font.black, letterSpacing: 0.6 },
  bigScore: { fontSize: 46, fontWeight: font.black },
  bandChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  metricRow: { flexDirection: "row", gap: spacing.md },
  metricCard: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
    ...shadow.card,
  },
  metricLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: font.bold },
  metricValue: { color: colors.textPrimary, fontSize: 22, fontWeight: font.black, marginTop: 4 },
  metricHint: { color: colors.textMuted, fontSize: 11 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
    gap: 4,
  },
  cardTitle: { color: colors.textPrimary, fontWeight: font.black, fontSize: 14, marginBottom: 4 },
  cardBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
});
