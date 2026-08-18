import React from "react";
import { Api } from "@/src/api";
import { colors } from "@/src/theme";
import { Screen, ScreenHeader } from "@/src/components/ScreenHeader";
import { ReportsView, type StatCard, type ExportConfig } from "@/src/components/ReportsView";

const COLS = [
  { key: "date", label: "Date" },
  { key: "type", label: "Type" },
  { key: "ref", label: "Reference" },
  { key: "restaurant", label: "Restaurant" },
  { key: "status", label: "Status" },
  { key: "amount", label: "Amount (INR)" },
];

export default function OwnerReports() {
  const getCards = (d: any): StatCard[] => {
    const s = d.summary || {};
    return [
      { label: "Gross Sales", value: `\u20B9${s.gross_sales ?? 0}`, icon: "cash", color: colors.success },
      { label: "Orders", value: String(s.orders ?? 0), icon: "receipt", color: colors.primary },
      { label: "Online", value: `\u20B9${s.online_sales ?? 0}`, icon: "globe", color: "#0EA5E9" },
      { label: "POS", value: `\u20B9${s.pos_sales ?? 0}`, icon: "calculator", color: "#8B5CF6" },
      { label: "Commission 20%", value: `\u20B9${s.commission ?? 0}`, icon: "remove-circle", color: colors.error },
      { label: "Net Earnings", value: `\u20B9${s.net_earnings ?? 0}`, icon: "wallet", color: colors.success },
    ];
  };

  const getExport = (d: any): ExportConfig => {
    const s = d.summary || {};
    return {
      filenameBase: "bisnoi-owner-report",
      title: "Owner Sales Report",
      summaryPairs: [
        ["Period", d?.period?.label || ""],
        ["Gross Sales", `\u20B9${s.gross_sales ?? 0}`],
        ["Orders", String(s.orders ?? 0)],
        ["Online Sales", `\u20B9${s.online_sales ?? 0}`],
        ["POS Sales", `\u20B9${s.pos_sales ?? 0}`],
        ["Commission (20%)", `\u20B9${s.commission ?? 0}`],
        ["GST (5%)", `\u20B9${s.gst ?? 0}`],
        ["Net Earnings", `\u20B9${s.net_earnings ?? 0}`],
      ],
      cols: COLS,
      rows: d.rows || [],
    };
  };

  return (
    <Screen>
      <ScreenHeader title="Reports" subtitle="Sales & earnings breakdown" />
      <ReportsView fetcher={Api.ownerReports} accent={colors.primary} getCards={getCards} getExport={getExport} />
    </Screen>
  );
}
