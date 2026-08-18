import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Card, Empty } from "@/src/components/ui";
import { AdminHeader } from "@/src/components/AdminHeader";

const inr = (n: number) => "\u20B9" + (Number(n) || 0).toFixed(2);

export default function AdminFinance() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { try { setD(await Api.adminFinance()); } catch (e: any) { console.warn(e?.message); } finally { setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const s = d?.summary || {};

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <AdminHeader title="Finance" subtitle="Platform revenue & payouts" />
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>PLATFORM REVENUE</Text>
            <Text style={styles.heroAmt}>{inr(s.platform_revenue || 0)}</Text>
            <Text style={styles.heroSub}>Commission earned {inr(s.commission_earned || 0)} • {s.total_orders || 0} sales</Text>
          </View>
          <View style={styles.grid}>
            <Stat icon="trending-up" color={colors.primary} label="Gross Sales" value={inr(s.gross_sales || 0)} />
            <Stat icon="briefcase" color={colors.success} label="Commission" value={inr(s.commission_earned || 0)} />
            <Stat icon="storefront" color="#8B5CF6" label="Owner Payouts Due" value={inr(s.owner_payouts_due || 0)} />
            <Stat icon="bicycle" color="#0EA5E9" label="Rider Payouts" value={inr(s.rider_payouts || 0)} />
          </View>
          <Text style={styles.secTitle}>WEEKLY BREAKDOWN</Text>
          {(d?.weekly || []).length === 0 ? <Empty icon="bar-chart-outline" title="No data" subtitle="Weekly sales will appear here." /> : (d.weekly).map((w: any, i: number) => (
            <Card key={i} style={{ marginBottom: spacing.sm }}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{w.period}</Text>
                  <Text style={styles.rowSub}>{w.orders} sales • Gross {inr(w.gross)}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.rowAmt}>{inr(w.commission)}</Text>
                  <View style={[styles.tag, { backgroundColor: (w.status === "settled" ? colors.success : colors.warning) + "22" }]}>
                    <Text style={[styles.tagTxt, { color: w.status === "settled" ? colors.success : colors.warning }]}>{(w.status || "").toUpperCase()}</Text>
                  </View>
                </View>
              </View>
            </Card>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Stat({ icon, color, label, value }: any) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIc, { backgroundColor: color + "22" }]}><Ionicons name={icon} size={18} color={color} /></View>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.textPrimary, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.md },
  heroLabel: { fontSize: 12, fontWeight: font.black, color: colors.surface, opacity: 0.8, letterSpacing: 0.6 },
  heroAmt: { fontSize: 34, fontWeight: font.black, color: colors.surface, marginTop: 4 },
  heroSub: { fontSize: 12, color: colors.surface, opacity: 0.8, marginTop: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statCard: { width: "47%", flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.card },
  statIc: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary, marginTop: 8 },
  statLbl: { fontSize: 11, color: colors.textSecondary, fontWeight: font.semi, marginTop: 2 },
  secTitle: { fontSize: 13, fontWeight: font.black, color: colors.textPrimary, letterSpacing: 0.4, marginTop: spacing.xl, marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowTitle: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  rowAmt: { fontSize: 16, fontWeight: font.black, color: colors.textPrimary },
  tag: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, marginTop: 3 },
  tagTxt: { fontSize: 9, fontWeight: font.black },
});
