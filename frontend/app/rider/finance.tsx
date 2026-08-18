import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Card, Empty } from "@/src/components/ui";

const inr = (n: number) => "\u20B9" + (Number(n) || 0).toFixed(2);
function fmtDate(iso?: string) { if (!iso) return ""; try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch { return iso; } }

export default function RiderFinance() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { try { setD(await Api.riderFinance()); } catch (e: any) { console.warn(e?.message); } finally { setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const s = d?.summary || {}; const np = d?.next_payout || {};

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
        <Text style={{ fontSize: 22, fontWeight: font.black, color: colors.textPrimary }}>Earnings</Text>
        <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>Payouts & delivery earnings</Text>
      </View>
      {loading ? <ActivityIndicator color={colors.secondary} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 110 }}>
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>NEXT PAYOUT</Text>
            <Text style={styles.heroAmt}>{inr(np.amount || 0)}</Text>
            <View style={styles.heroMeta}><Ionicons name="calendar" size={14} color={colors.onSecondary || "#fff"} /><Text style={styles.heroMetaTxt}>{fmtDate(np.date)} • {np.deliveries || 0} deliveries</Text></View>
          </View>
          <View style={styles.grid}>
            <Stat icon="cash" color={colors.success} label="Total Earnings" value={inr(s.total_earnings || 0)} />
            <Stat icon="bicycle" color={colors.secondary} label="Deliveries" value={String(s.total_deliveries || 0)} />
            <Stat icon="pricetag" color={colors.primary} label="Per Delivery" value={inr(s.avg_per_delivery || 0)} />
          </View>
          <Text style={styles.secTitle}>PAYOUT HISTORY</Text>
          {(d?.payout_history || []).length === 0 ? <Empty icon="time-outline" title="No past payouts" subtitle="Weekly payouts will appear here." /> : (d.payout_history).map((p: any, i: number) => (
            <Card key={i} style={{ marginBottom: spacing.sm }}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{p.period}</Text><Text style={styles.rowSub}>{p.deliveries} deliveries</Text></View>
                <View style={{ alignItems: "flex-end" }}><Text style={styles.rowAmt}>{inr(p.amount)}</Text><View style={styles.paidTag}><Text style={styles.paidTxt}>PAID</Text></View></View>
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
  hero: { backgroundColor: colors.secondary, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.md },
  heroLabel: { fontSize: 12, fontWeight: font.black, color: "#fff", opacity: 0.85, letterSpacing: 0.6 },
  heroAmt: { fontSize: 36, fontWeight: font.black, color: "#fff", marginTop: 4 },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  heroMetaTxt: { fontSize: 13, color: "#fff", opacity: 0.9, fontWeight: font.semi },
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
  paidTag: { backgroundColor: colors.success + "22", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, marginTop: 3 },
  paidTxt: { fontSize: 9, fontWeight: font.black, color: colors.success },
});
