import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Card, Empty } from "@/src/components/ui";
import { Screen, ScreenHeader } from "@/src/components/ScreenHeader";

const inr = (n: number) => "\u20B9" + (Number(n) || 0).toFixed(2);
function fmtDate(iso?: string) { if (!iso) return ""; try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch { return iso; } }

export default function OwnerFinance() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { try { setD(await Api.ownerFinance()); } catch (e: any) { console.warn(e?.message); } finally { setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const s = d?.summary || {};
  const np = d?.next_payout || {};

  return (
    <Screen>
      <ScreenHeader title="Finance" subtitle="Earnings, payouts & invoices" />
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
          {/* Next payout hero */}
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>NEXT PAYOUT</Text>
            <Text style={styles.heroAmt}>{inr(np.amount || 0)}</Text>
            <View style={styles.heroMeta}>
              <Ionicons name="calendar" size={14} color={colors.onPrimary} />
              <Text style={styles.heroMetaTxt}>{fmtDate(np.date)} • {np.period || "This week"}</Text>
            </View>
          </View>

          {/* Summary grid */}
          <View style={styles.grid}>
            <Stat icon="cash" color={colors.success} label="Net Earnings" value={inr(s.net_earnings || 0)} />
            <Stat icon="trending-up" color={colors.primary} label="Gross Sales" value={inr(s.gross_sales || 0)} />
            <Stat icon="remove-circle" color={colors.error} label={`Commission (${Math.round((d?.commission_rate || 0) * 100)}%)`} value={inr(s.commission || 0)} />
            <Stat icon="receipt" color="#0EA5E9" label={`GST (${Math.round((d?.gst_rate || 0) * 100)}%)`} value={inr(s.gst || 0)} />
          </View>

          {/* Payout history */}
          <Text style={styles.secTitle}>PAYOUT HISTORY</Text>
          {(d?.payout_history || []).length === 0 ? (
            <Empty icon="time-outline" title="No past payouts" subtitle="Completed weekly payouts will show here." />
          ) : (d.payout_history).map((p: any, i: number) => (
            <Card key={i} style={{ marginBottom: spacing.sm }}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{p.period}</Text>
                  <Text style={styles.rowSub}>{p.orders} orders • Gross {inr(p.gross)}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.rowAmt}>{inr(p.net)}</Text>
                  <View style={styles.paidTag}><Text style={styles.paidTxt}>PAID</Text></View>
                </View>
              </View>
            </Card>
          ))}

          {/* Invoices */}
          <Text style={styles.secTitle}>INVOICES & TAXES</Text>
          {(d?.invoices || []).length === 0 ? (
            <Empty icon="document-text-outline" title="No invoices" subtitle="Weekly GST invoices will be generated here." />
          ) : (d.invoices).map((inv: any, i: number) => (
            <Card key={i} style={{ marginBottom: spacing.sm }}>
              <View style={styles.row}>
                <View style={[styles.invIc]}><Ionicons name="document-text" size={18} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{inv.invoice_no}</Text>
                  <Text style={styles.rowSub}>{inv.period}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.rowAmt}>{inr(inv.net)}</Text>
                  <Text style={styles.rowSub}>GST {inr(inv.gst)}</Text>
                </View>
              </View>
            </Card>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

function Stat({ icon, color, label, value }: { icon: any; color: string; label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIc, { backgroundColor: color + "22" }]}><Ionicons name={icon} size={18} color={color} /></View>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.md },
  heroLabel: { fontSize: 12, fontWeight: font.black, color: colors.onPrimary, opacity: 0.85, letterSpacing: 0.6 },
  heroAmt: { fontSize: 36, fontWeight: font.black, color: colors.onPrimary, marginTop: 4 },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  heroMetaTxt: { fontSize: 13, color: colors.onPrimary, opacity: 0.9, fontWeight: font.semi },
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
  invIc: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
});
