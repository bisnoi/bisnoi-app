import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { AdminHeader } from "@/src/components/AdminHeader";
import { Card } from "@/src/components/ui";
import { ReportsView, type StatCard, type ExportConfig } from "@/src/components/ReportsView";

const COLS = [
  { key: "date", label: "Date" },
  { key: "type", label: "Type" },
  { key: "ref", label: "Reference" },
  { key: "restaurant", label: "Restaurant" },
  { key: "status", label: "Status" },
  { key: "amount", label: "Amount (INR)" },
];

export default function AdminReports() {
  const getCards = (d: any): StatCard[] => {
    const s = d.summary || {};
    return [
      { label: "Gross Sales", value: `\u20B9${s.gross_sales ?? 0}`, icon: "cash", color: colors.success },
      { label: "Total Orders", value: String(s.total_orders ?? 0), icon: "receipt", color: colors.primary },
      { label: "Commission", value: `\u20B9${s.commission_earned ?? 0}`, icon: "trending-up", color: "#0EA5E9" },
      { label: "Rider Payouts", value: `\u20B9${s.rider_payouts ?? 0}`, icon: "bicycle", color: colors.warning },
      { label: "Owner Payouts", value: `\u20B9${s.owner_payouts_due ?? 0}`, icon: "storefront", color: "#8B5CF6" },
      { label: "Platform Revenue", value: `\u20B9${s.platform_revenue ?? 0}`, icon: "wallet", color: colors.success },
    ];
  };

  const getExport = (d: any): ExportConfig => {
    const s = d.summary || {};
    return {
      filenameBase: "bisnoi-platform-report",
      title: "Platform Sales Report",
      summaryPairs: [
        ["Period", d?.period?.label || ""],
        ["Gross Sales", `\u20B9${s.gross_sales ?? 0}`],
        ["Total Orders", String(s.total_orders ?? 0)],
        ["Online Sales", `\u20B9${s.online_sales ?? 0}`],
        ["POS Sales", `\u20B9${s.pos_sales ?? 0}`],
        ["Commission Earned", `\u20B9${s.commission_earned ?? 0}`],
        ["Rider Payouts", `\u20B9${s.rider_payouts ?? 0}`],
        ["Owner Payouts Due", `\u20B9${s.owner_payouts_due ?? 0}`],
        ["Platform Revenue", `\u20B9${s.platform_revenue ?? 0}`],
      ],
      cols: COLS,
      rows: d.rows || [],
    };
  };

  const renderExtra = (d: any) => {
    const list: any[] = d.by_restaurant || [];
    if (!list.length) return null;
    return (
      <Card style={{ marginTop: spacing.md }}>
        <Text style={styles.sectionTitle}>SALES BY RESTAURANT</Text>
        <View style={styles.tHead}>
          <Text style={[styles.th, { flex: 2 }]}>Restaurant</Text>
          <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Orders</Text>
          <Text style={[styles.th, { flex: 1.2, textAlign: "right" }]}>Sales</Text>
          <Text style={[styles.th, { flex: 1.2, textAlign: "right" }]}>Commission</Text>
        </View>
        {list.slice(0, 30).map((b, i) => (
          <View key={`${b.restaurant}-${i}`} style={styles.tRow} testID={`report-rest-${i}`}>
            <Text style={[styles.td, { flex: 2, color: colors.textPrimary, fontWeight: font.semi }]} numberOfLines={1}>{b.restaurant}</Text>
            <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>{b.orders}</Text>
            <Text style={[styles.td, { flex: 1.2, textAlign: "right", fontWeight: font.black, color: colors.textPrimary }]}>₹{b.sales}</Text>
            <Text style={[styles.td, { flex: 1.2, textAlign: "right" }]}>₹{b.commission}</Text>
          </View>
        ))}
      </Card>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <AdminHeader title="Reports" subtitle="Platform sales & payouts" />
      <ReportsView fetcher={Api.adminReports} accent={colors.primary} getCards={getCards} getExport={getExport} renderExtra={renderExtra} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.5 },
  tHead: { flexDirection: "row", paddingVertical: 8, marginTop: spacing.sm, borderBottomWidth: 2, borderBottomColor: colors.borderStrong },
  th: { fontSize: 11, fontWeight: font.black, color: colors.textSecondary },
  tRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  td: { fontSize: 12, color: colors.textSecondary },
});
