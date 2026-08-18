import React from "react";
import { Api } from "@/src/api";
import { colors } from "@/src/theme";
import { Screen, ScreenHeader } from "@/src/components/ScreenHeader";
import { ReportsView, type StatCard, type ExportConfig } from "@/src/components/ReportsView";

const COLS = [
  { key: "date", label: "Date" },
  { key: "type", label: "Type" },
  { key: "ref", label: "Order Ref" },
  { key: "restaurant", label: "Restaurant" },
  { key: "amount", label: "Earning (INR)" },
];

export default function RiderReports() {
  const getCards = (d: any): StatCard[] => {
    const s = d.summary || {};
    return [
      { label: "Deliveries", value: String(s.total_deliveries ?? 0), icon: "bicycle", color: colors.secondary },
      { label: "Total Earnings", value: `\u20B9${s.total_earnings ?? 0}`, icon: "wallet", color: colors.success },
      { label: "Per Delivery", value: `\u20B9${d.fee_per_order ?? 40}`, icon: "cash", color: colors.primary },
    ];
  };

  const getExport = (d: any): ExportConfig => {
    const s = d.summary || {};
    return {
      filenameBase: "bisnoi-rider-report",
      title: "Rider Earnings Report",
      summaryPairs: [
        ["Period", d?.period?.label || ""],
        ["Total Deliveries", String(s.total_deliveries ?? 0)],
        ["Total Earnings", `\u20B9${s.total_earnings ?? 0}`],
        ["Per Delivery", `\u20B9${d.fee_per_order ?? 40}`],
      ],
      cols: COLS,
      rows: d.rows || [],
    };
  };

  return (
    <Screen>
      <ScreenHeader title="Reports" subtitle="Your delivery earnings" accent={colors.secondary} />
      <ReportsView fetcher={Api.riderReports} accent={colors.secondary} getCards={getCards} getExport={getExport} />
    </Screen>
  );
}
