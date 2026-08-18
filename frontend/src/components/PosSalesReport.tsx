import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, font, radius, shadow, spacing } from "@/src/theme";
import { Empty } from "@/src/components/ui";

type Choice = { value: string; label: string };
const PAYMENTS: Choice[] = [{ value: "all", label: "All payments" }, { value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "card", label: "Card" }, { value: "online", label: "Online" }];
const ORDER_TYPES: Choice[] = [{ value: "all", label: "All orders" }, { value: "dine_in", label: "Dine-in" }, { value: "online", label: "Online" }];
const STATUSES: Choice[] = [{ value: "all", label: "All statuses" }, { value: "success", label: "Success" }, { value: "cancelled", label: "Cancelled" }];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const money = (n: any) => `₹${Number(n || 0).toFixed(2)}`;
const labelFor = (list: Choice[], value: string) => list.find((x) => x.value === value)?.label || value;

function ChoiceField({ label, value, choices, onChange }: { label: string; value: string; choices: Choice[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TouchableOpacity style={styles.select} onPress={() => setOpen(true)} activeOpacity={0.8} testID={`report-${label.toLowerCase().replaceAll(" ", "-")}`}>
      <Text style={styles.selectText} numberOfLines={1}>{labelFor(choices, value)}</Text><Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
    </TouchableOpacity>
    <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
      <TouchableOpacity style={styles.modalShade} activeOpacity={1} onPress={() => setOpen(false)}>
        <View style={styles.choiceBox}>
          <Text style={styles.choiceTitle}>{label}</Text>
          {choices.map((choice) => <TouchableOpacity key={choice.value} style={[styles.choiceRow, value === choice.value && styles.choiceRowOn]} onPress={() => { onChange(choice.value); setOpen(false); }}>
            <Text style={[styles.choiceText, value === choice.value && styles.choiceTextOn]}>{choice.label}</Text>
            {value === choice.value && <Ionicons name="checkmark" size={18} color={colors.primary} />}
          </TouchableOpacity>)}
        </View>
      </TouchableOpacity>
    </Modal>
  </View>;
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => { const d = new Date(`${value}T12:00:00`); return Number.isNaN(d.getTime()) ? new Date() : d; });
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = first.getDay();
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells = [...Array(start).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const choose = (day: number) => { onChange(ymd(new Date(cursor.getFullYear(), cursor.getMonth(), day))); setOpen(false); };
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TouchableOpacity style={styles.select} onPress={() => setOpen(true)} activeOpacity={0.8} testID={`report-date-${label.toLowerCase()}`}>
      <Text style={styles.selectText}>{value}</Text><Ionicons name="calendar-outline" size={16} color={colors.primary} />
    </TouchableOpacity>
    <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.modalShade}>
        <View style={styles.calendarBox}>
          <View style={styles.calendarHead}><Text style={styles.calendarTitle}>{label} date</Text><TouchableOpacity onPress={() => setOpen(false)}><Ionicons name="close" size={21} color={colors.onPrimary} /></TouchableOpacity></View>
          <View style={styles.monthNav}><TouchableOpacity onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><Ionicons name="chevron-back" size={22} color={colors.textPrimary} /></TouchableOpacity><Text style={styles.monthText}>{cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</Text><TouchableOpacity onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><Ionicons name="chevron-forward" size={22} color={colors.textPrimary} /></TouchableOpacity></View>
          <View style={styles.week}>{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <Text key={d} style={styles.weekDay}>{d}</Text>)}</View>
          <View style={styles.days}>{cells.map((day, index) => !day ? <View key={`blank-${index}`} style={styles.day} /> : <TouchableOpacity key={day} style={[styles.day, ymd(new Date(cursor.getFullYear(), cursor.getMonth(), day)) === value && styles.dayOn]} onPress={() => choose(day)}><Text style={[styles.dayText, ymd(new Date(cursor.getFullYear(), cursor.getMonth(), day)) === value && styles.dayTextOn]}>{day}</Text></TouchableOpacity>)}</View>
          <TouchableOpacity style={styles.todayBtn} onPress={() => { onChange(ymd(new Date())); setOpen(false); }}><Text style={styles.todayTxt}>Today</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  </View>;
}

export function PosSalesReport() {
  const today = ymd(new Date());
  const weekAgo = ymd(new Date(Date.now() - 6 * 86400000));
  const [customOpen, setCustomOpen] = useState(false);
  const [fromDate, setFromDate] = useState(weekAgo);
  const [toDate, setToDate] = useState(today);
  const [payment, setPayment] = useState("all");
  const [orderType, setOrderType] = useState("all");
  const [status, setStatus] = useState("all");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await Api.ownerSalesReport({ from_date: fromDate, to_date: toDate, payment_type: payment, order_type: orderType, order_status: status })); }
    catch (error: any) { console.warn(error?.message); setData({ rows: [], totals: {} }); }
    finally { setLoading(false); }
  }, [fromDate, toDate, payment, orderType, status]);
  useEffect(() => { load(); }, [load]);
  const rows = data?.rows || [];
  const totals = data?.totals || {};
  const summary = useMemo(() => ({ count: totals.count || 0, total: totals.total || 0, average: totals.count ? totals.total / totals.count : 0 }), [totals]);
  const quick = (kind: "today" | "yesterday") => { const d = new Date(); if (kind === "yesterday") d.setDate(d.getDate() - 1); const value = ymd(d); setFromDate(value); setToDate(value); };
  return <ScrollView contentContainerStyle={styles.page}>
    <View style={styles.summaryRow}>{[[String(summary.count), "Bills"], [money(summary.total), "Total sales"], [money(summary.average), "Avg bill"]].map(([v, l]) => <View key={l} style={styles.summaryCard}><Text style={styles.summaryValue}>{v}</Text><Text style={styles.summaryLabel}>{l}</Text></View>)}</View>
    <View style={styles.actionRow}><TouchableOpacity style={[styles.filterButton, customOpen && styles.filterButtonOn]} onPress={() => setCustomOpen((v) => !v)}><Ionicons name="options-outline" size={17} color={customOpen ? colors.onPrimary : colors.textPrimary} /><Text style={[styles.filterBtnText, customOpen && styles.filterBtnTextOn]}>Custom filter</Text><Ionicons name={customOpen ? "chevron-up" : "chevron-down"} size={14} color={customOpen ? colors.onPrimary : colors.textSecondary} /></TouchableOpacity><TouchableOpacity style={styles.quickButton} onPress={() => quick("yesterday")}><Text style={styles.quickTxt}>Yesterday</Text></TouchableOpacity><TouchableOpacity style={styles.quickButton} onPress={() => quick("today")}><Text style={styles.quickTxt}>Today</Text></TouchableOpacity></View>
    {customOpen && <View style={styles.filters}>
      <View style={styles.filterTitleRow}><Text style={styles.filterTitle}>CUSTOM SALES REPORT</Text><Text style={styles.periodText}>{fromDate}  →  {toDate}</Text></View>
      <View style={styles.fieldRow}><DateField label="From" value={fromDate} onChange={setFromDate} /><DateField label="To" value={toDate} onChange={setToDate} /></View>
      <View style={styles.fieldRow}><ChoiceField label="Payment Type" value={payment} choices={PAYMENTS} onChange={setPayment} /><ChoiceField label="Order Type" value={orderType} choices={ORDER_TYPES} onChange={setOrderType} /></View>
      <View style={styles.fieldRow}><ChoiceField label="Order Status" value={status} choices={STATUSES} onChange={setStatus} /><View style={styles.field} /></View>
      <TouchableOpacity style={styles.searchButton} onPress={load} activeOpacity={0.85}><Ionicons name="search" size={17} color={colors.onPrimary} /><Text style={styles.searchText}>Search report</Text></TouchableOpacity>
    </View>}
    {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 36 }} /> : rows.length === 0 ? <Empty icon="document-text-outline" title="No sales found" subtitle="Try changing the dates or filters." /> : <View style={styles.tableCard}>
      <Text style={styles.reportCaption}>Sales report: {fromDate} to {toDate}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}><View>
        <View style={[styles.tableRow, styles.headerRow]}>{["Order no.", "Date", "Payment", "Order type", "Table / area", "My amount", "Discount", "Delivery", "Total"].map((h) => <Text key={h} style={[styles.cell, styles.headerCell]}>{h}</Text>)}</View>
        <View style={[styles.tableRow, styles.totalRow]}><Text style={styles.cell}>Total</Text><Text style={styles.cell}>-</Text><Text style={styles.cell}>-</Text><Text style={styles.cell}>-</Text><Text style={styles.cell}>-</Text><Text style={styles.cell}>{money(totals.my_amount)}</Text><Text style={styles.cell}>{money(totals.discount)}</Text><Text style={styles.cell}>{money(totals.delivery_charge)}</Text><Text style={[styles.cell, styles.totalAmount]}>{money(totals.total)}</Text></View>
        {rows.map((r: any, index: number) => <View key={`${r.id}-${index}`} style={styles.tableRow}><Text style={styles.cell}>{r.order_no || "-"}</Text><Text style={styles.cell}>{r.date || "-"}</Text><Text style={styles.cell}>{String(r.payment_type || "-").toUpperCase()}</Text><Text style={styles.cell}>{r.order_type_label || r.order_type || "-"}</Text><Text style={styles.cell}>{r.area_type || "-"}</Text><Text style={styles.cell}>{money(r.my_amount)}</Text><Text style={styles.cell}>{money(r.discount)}</Text><Text style={styles.cell}>{money(r.delivery_charge)}</Text><Text style={[styles.cell, styles.amountCell]}>{money(r.total)}</Text></View>)}
      </View></ScrollView>
    </View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { padding: spacing.lg, paddingBottom: 110 }, summaryRow: { flexDirection: "row", gap: 8 }, summaryCard: { flex: 1, minHeight: 78, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, ...shadow.card }, summaryValue: { fontSize: 16, fontWeight: font.black, color: colors.textPrimary }, summaryLabel: { marginTop: 3, color: colors.textSecondary, fontSize: 11, fontWeight: font.semi }, actionRow: { flexDirection: "row", gap: 8, marginTop: spacing.md }, filterButton: { flex: 1.35, height: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }, filterButtonOn: { backgroundColor: colors.primary, borderColor: colors.primary }, filterBtnText: { fontSize: 12, color: colors.textPrimary, fontWeight: font.bold }, filterBtnTextOn: { color: colors.onPrimary }, quickButton: { flex: 1, height: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }, quickTxt: { fontSize: 12, color: colors.textPrimary, fontWeight: font.bold }, filters: { marginTop: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: colors.primary, borderRadius: radius.md, padding: spacing.md, ...shadow.card }, filterTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }, filterTitle: { color: colors.textPrimary, fontSize: 12, fontWeight: font.black, letterSpacing: 0.4 }, periodText: { color: colors.textSecondary, fontSize: 10, fontWeight: font.semi }, fieldRow: { flexDirection: "row", gap: 10, marginTop: 10 }, field: { flex: 1 }, fieldLabel: { marginBottom: 5, color: colors.textSecondary, fontSize: 11, fontWeight: font.bold }, select: { height: 42, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 5 }, selectText: { flex: 1, fontSize: 12, color: colors.textPrimary }, searchButton: { marginTop: spacing.md, height: 43, borderRadius: radius.sm, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }, searchText: { color: colors.onPrimary, fontSize: 13, fontWeight: font.black }, tableCard: { marginTop: spacing.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, reportCaption: { padding: 11, color: colors.textSecondary, fontSize: 12, borderBottomWidth: 1, borderBottomColor: colors.border }, tableRow: { flexDirection: "row", minHeight: 47, alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border }, headerRow: { minHeight: 42, backgroundColor: colors.surfaceAlt }, totalRow: { backgroundColor: colors.primarySoft }, cell: { width: 101, paddingHorizontal: 9, color: colors.textSecondary, fontSize: 11.5 }, headerCell: { color: colors.textPrimary, fontWeight: font.black, fontSize: 10.5 }, totalAmount: { color: colors.primary, fontWeight: font.black }, amountCell: { color: colors.textPrimary, fontWeight: font.bold }, modalShade: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", alignItems: "center", justifyContent: "center", padding: 24 }, choiceBox: { width: "100%", maxWidth: 340, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }, choiceTitle: { fontSize: 16, color: colors.textPrimary, fontWeight: font.black, marginBottom: 7 }, choiceRow: { minHeight: 45, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.sm }, choiceRowOn: { backgroundColor: colors.primarySoft }, choiceText: { color: colors.textSecondary, fontSize: 14 }, choiceTextOn: { color: colors.primary, fontWeight: font.black }, calendarBox: { width: "100%", maxWidth: 355, overflow: "hidden", backgroundColor: colors.surface, borderRadius: radius.lg }, calendarHead: { height: 51, paddingHorizontal: 16, backgroundColor: colors.textPrimary, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, calendarTitle: { color: colors.onPrimary, fontSize: 15, fontWeight: font.black }, monthNav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.surfaceAlt }, monthText: { color: colors.primary, fontWeight: font.black, fontSize: 15 }, week: { flexDirection: "row", paddingTop: 12 }, weekDay: { width: "14.285%", textAlign: "center", fontSize: 11, color: colors.textPrimary, fontWeight: font.black }, days: { flexDirection: "row", flexWrap: "wrap", padding: 10 }, day: { width: "14.285%", aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: radius.sm }, dayOn: { backgroundColor: colors.primary }, dayText: { fontSize: 13, color: colors.textSecondary }, dayTextOn: { color: colors.onPrimary, fontWeight: font.black }, todayBtn: { height: 46, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary }, todayTxt: { color: colors.onPrimary, fontWeight: font.black },
});
