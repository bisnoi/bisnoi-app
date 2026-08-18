import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, RefreshControl, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Card, Empty } from "@/src/components/ui";
import { exportCSV, exportPDF, type Col } from "@/src/utils/exportReport";

export type StatCard = { label: string; value: string; icon: keyof typeof Ionicons.glyphMap; color: string };
export type ExportConfig = { filenameBase: string; title: string; summaryPairs: [string, string][]; cols: Col[]; rows: any[] };

type RangeKey = "today" | "week" | "month" | "all" | "custom";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computeRange(key: RangeKey, customFrom: string, customTo: string): { from?: string; to?: string } {
  const now = new Date();
  const today = ymd(now);
  if (key === "today") return { from: today, to: today };
  if (key === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { from: ymd(start), to: today };
  }
  if (key === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: ymd(start), to: today };
  }
  if (key === "custom") {
    return { from: customFrom || undefined, to: customTo || undefined };
  }
  return {};
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reusable Reports screen body. Provides date filters, summary cards, a daily
 * trend, an optional extra section, a detailed rows table and CSV/PDF export.
 */
export function ReportsView({
  fetcher,
  accent = colors.primary,
  getCards,
  getExport,
  renderExtra,
}: {
  fetcher: (params: { from?: string; to?: string }) => Promise<any>;
  accent?: string;
  getCards: (data: any) => StatCard[];
  getExport: (data: any) => ExportConfig;
  renderExtra?: (data: any) => React.ReactNode;
}) {
  const [range, setRange] = useState<RangeKey>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const params = useMemo(() => computeRange(range, customFrom, customTo), [range, customFrom, customTo]);

  const load = useCallback(async () => {
    try {
      const d = await fetcher(params);
      setData(d);
    } catch (e: any) {
      console.warn(e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetcher, params.from, params.to]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const customInvalid =
    range === "custom" &&
    ((!!customFrom && !DATE_RE.test(customFrom)) || (!!customTo && !DATE_RE.test(customTo)));

  const cards = data ? getCards(data) : [];
  const daily: any[] = data?.daily || [];
  const maxSales = daily.reduce((m, x) => Math.max(m, x.sales || 0), 0) || 1;
  const rows: any[] = data?.rows || [];

  const doExport = (kind: "csv" | "pdf") => {
    if (!data) return;
    const cfg = getExport(data);
    const stamp = ymd(new Date());
    const periodLabel = data?.period?.label || "";
    if (kind === "csv") {
      const ok = exportCSV(`${cfg.filenameBase}-${stamp}.csv`, cfg.cols, cfg.rows, cfg.summaryPairs);
      if (!ok && Platform.OS === "web") window.alert("Export not supported here.");
    } else {
      const ok = exportPDF(cfg.title, periodLabel, cfg.summaryPairs, cfg.cols, cfg.rows);
      if (!ok && Platform.OS === "web") window.alert("Please allow pop-ups to download the PDF.");
    }
  };

  const RANGES: { key: RangeKey; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "all", label: "All Time" },
    { key: "custom", label: "Custom" },
  ];

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={accent} />}
    >
      {/* Date range filter */}
      <View style={styles.filterWrap}>
        {RANGES.map((r) => (
          <TouchableOpacity
            key={r.key}
            testID={`report-range-${r.key}`}
            onPress={() => setRange(r.key)}
            activeOpacity={0.85}
            style={[styles.rangeChip, range === r.key && { backgroundColor: accent, borderColor: accent }]}
          >
            <Text style={[styles.rangeTxt, range === r.key && { color: colors.onPrimary }]}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {range === "custom" && (
        <View style={styles.customRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dateLabel}>From</Text>
            <TextInput
              testID="report-from"
              value={customFrom}
              onChangeText={setCustomFrom}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              style={styles.dateInput}
              autoCapitalize="none"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.dateLabel}>To</Text>
            <TextInput
              testID="report-to"
              value={customTo}
              onChangeText={setCustomTo}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              style={styles.dateInput}
              autoCapitalize="none"
            />
          </View>
        </View>
      )}
      {customInvalid && <Text style={styles.warn}>Use date format YYYY-MM-DD</Text>}

      {loading && !data ? (
        <ActivityIndicator color={accent} style={{ marginTop: 40 }} />
      ) : (
        <>
          {/* Summary cards */}
          <View style={styles.cardGrid}>
            {cards.map((c) => (
              <View key={c.label} style={styles.statCard} testID={`report-stat-${c.label}`}>
                <View style={[styles.icBox, { backgroundColor: c.color + "22" }]}>
                  <Ionicons name={c.icon} size={18} color={c.color} />
                </View>
                <Text style={styles.statVal} numberOfLines={1}>{c.value}</Text>
                <Text style={styles.statLabel}>{c.label}</Text>
              </View>
            ))}
          </View>

          {/* Export actions */}
          <View style={styles.exportRow}>
            <TouchableOpacity testID="export-csv" onPress={() => doExport("csv")} style={[styles.exportBtn, { borderColor: accent }]} activeOpacity={0.85}>
              <Ionicons name="download-outline" size={16} color={accent} />
              <Text style={[styles.exportTxt, { color: accent }]}>CSV</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="export-pdf" onPress={() => doExport("pdf")} style={[styles.exportBtn, { borderColor: accent }]} activeOpacity={0.85}>
              <Ionicons name="document-text-outline" size={16} color={accent} />
              <Text style={[styles.exportTxt, { color: accent }]}>PDF</Text>
            </TouchableOpacity>
          </View>

          {/* Daily trend */}
          {daily.length > 0 && (
            <Card style={{ marginTop: spacing.md }}>
              <Text style={styles.sectionTitle}>DAILY SALES</Text>
              <View style={{ marginTop: spacing.sm, gap: 8 }}>
                {daily.slice(-10).map((d) => (
                  <View key={d.date} style={styles.trendRow}>
                    <Text style={styles.trendDate}>{d.date.slice(5)}</Text>
                    <View style={styles.trendTrack}>
                      <View style={[styles.trendFill, { width: `${Math.max(4, (d.sales / maxSales) * 100)}%`, backgroundColor: accent }]} />
                    </View>
                    <Text style={styles.trendVal}>₹{Math.round(d.sales)}</Text>
                  </View>
                ))}
              </View>
            </Card>
          )}

          {/* Extra (e.g. admin per-restaurant) */}
          {renderExtra ? renderExtra(data) : null}

          {/* Detailed breakdown */}
          <Card style={{ marginTop: spacing.md }}>
            <Text style={styles.sectionTitle}>DETAILED BREAKDOWN</Text>
            {rows.length === 0 ? (
              <Empty icon="document-outline" title="No records" subtitle="No transactions in this period." />
            ) : (
              <View style={{ marginTop: spacing.sm }}>
                <View style={styles.tHead}>
                  <Text style={[styles.th, { flex: 1.1 }]}>Date</Text>
                  <Text style={[styles.th, { flex: 1 }]}>Type</Text>
                  <Text style={[styles.th, { flex: 1.4 }]}>Ref</Text>
                  <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Amount</Text>
                </View>
                {rows.slice(0, 80).map((r, i) => (
                  <View key={`${r.ref}-${i}`} style={styles.tRow} testID={`report-row-${i}`}>
                    <Text style={[styles.td, { flex: 1.1 }]} numberOfLines={1}>{r.date}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={[styles.typePill, { backgroundColor: (r.type === "POS" ? "#0EA5E9" : r.type === "Delivery" ? colors.secondary : colors.primary) + "22" }]}>
                        <Text style={[styles.typeTxt, { color: r.type === "POS" ? "#0EA5E9" : r.type === "Delivery" ? colors.secondary : colors.primary }]} numberOfLines={1}>{r.type}</Text>
                      </View>
                    </View>
                    <Text style={[styles.td, { flex: 1.4 }]} numberOfLines={1}>{r.ref}</Text>
                    <Text style={[styles.td, { flex: 1, textAlign: "right", fontWeight: font.black, color: colors.textPrimary }]}>₹{r.amount}</Text>
                  </View>
                ))}
                {rows.length > 80 && <Text style={styles.moreTxt}>+{rows.length - 80} more — export to see all</Text>}
              </View>
            )}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  filterWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rangeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  rangeTxt: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary },
  customRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  dateLabel: { fontSize: 11, fontWeight: font.semi, color: colors.textSecondary, marginBottom: 4 },
  dateInput: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 12, height: 44, color: colors.textPrimary, fontSize: 14 },
  warn: { color: colors.warning, fontSize: 12, marginTop: 6, fontWeight: font.semi },

  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
  statCard: { width: "31%", flexGrow: 1, minWidth: 100, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.card },
  icBox: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary, marginTop: 8 },
  statLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: font.semi, marginTop: 2 },

  exportRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  exportBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: radius.md, borderWidth: 1.5, backgroundColor: colors.surface },
  exportTxt: { fontSize: 14, fontWeight: font.black },

  sectionTitle: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.5 },
  trendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  trendDate: { width: 44, fontSize: 11, color: colors.textSecondary, fontWeight: font.semi },
  trendTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.surfaceAlt, overflow: "hidden" },
  trendFill: { height: "100%", borderRadius: 5 },
  trendVal: { width: 70, textAlign: "right", fontSize: 12, fontWeight: font.bold, color: colors.textPrimary },

  tHead: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: colors.borderStrong },
  th: { fontSize: 11, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.3 },
  tRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  td: { fontSize: 12, color: colors.textSecondary },
  typePill: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  typeTxt: { fontSize: 10, fontWeight: font.black },
  moreTxt: { fontSize: 11, color: colors.textMuted, textAlign: "center", marginTop: spacing.sm, fontStyle: "italic" },
});
