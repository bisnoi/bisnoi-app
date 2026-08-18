import React from "react";
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";

export const inr = (n: number) => "\u20B9" + (Number(n) || 0).toFixed(2);
export const PAY_LABEL: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card" };
export const TYPE_LABEL: Record<string, string> = { dine_in: "Dine-in", takeaway: "Takeaway", walk_in: "Walk-in" };

function fmt(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function buildHtml(b: any): string {
  const rows = (b.items || [])
    .map(
      (it: any) =>
        `<tr><td>${it.name} <span style="color:#666">x${it.qty}</span></td><td style="text-align:right">${inr(it.amount)}</td></tr>`,
    )
    .join("");
  const line = (label: string, val: string, bold = false) =>
    `<tr><td style="${bold ? "font-weight:700" : ""}">${label}</td><td style="text-align:right;${bold ? "font-weight:700" : ""}">${val}</td></tr>`;
  const payLabel: Record<string, string> = { cash: "Cash", upi: "Online/UPI", card: "Card" };
  const payRows = (b.payments || [])
    .filter((p: any) => p.amount > 0)
    .map((p: any) => line(`Paid (${payLabel[p.method] || p.method})`, inr(p.amount)))
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${b.bill_number}</title>
  <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;padding:16px;max-width:320px;margin:auto}
  h2{text-align:center;margin:0 0 2px} .sub{text-align:center;color:#666;font-size:12px;margin-bottom:10px}
  table{width:100%;border-collapse:collapse;font-size:13px} td{padding:3px 0}
  .div{border-top:1px dashed #999;margin:8px 0} .tot td{font-size:16px;font-weight:800;border-top:2px solid #111;padding-top:6px}
  .foot{text-align:center;color:#666;font-size:12px;margin-top:12px}</style></head><body>
  <h2>${b.restaurant_name || "Restaurant"}</h2>
  <div class="sub">TAX INVOICE • ${b.bill_number}<br/>${fmt(b.created_at)}</div>
  <div class="sub">${TYPE_LABEL[b.order_type] || b.order_type}${b.table_label ? " • " + b.table_label : ""}${b.customer_name ? " • " + b.customer_name : ""}${b.customer_phone ? " • " + b.customer_phone : ""}</div>
  <div class="div"></div>
  <table>${rows}</table>
  <div class="div"></div>
  <table>
    ${line("Subtotal", inr(b.subtotal))}
    ${b.discount_amount > 0 ? line(`Discount${b.discount_type === "percent" ? ` (${b.discount_value}%)` : ""}`, "-" + inr(b.discount_amount)) : ""}
    ${b.tax_amount > 0 ? line(`GST (${b.tax_percent}%)`, "+" + inr(b.tax_amount)) : ""}
    <tr class="tot"><td>TOTAL</td><td style="text-align:right">${inr(b.total)}</td></tr>
    ${payRows}
    ${b.change > 0 ? line("Change", inr(b.change)) : ""}
  </table>
  <div class="foot">Thank you! Visit again — Bisnoi</div>
  </body></html>`;
}

const PAY_LABEL2: Record<string, string> = { cash: "Cash", upi: "Online/UPI", card: "Card" };

export function ReceiptModal({
  visible,
  bill,
  onClose,
  onNewBill,
}: {
  visible: boolean;
  bill: any;
  onClose: () => void;
  onNewBill?: () => void;
}) {
  const print = () => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    try {
      const w = window.open("", "PRINT", "height=700,width=420");
      if (!w) return;
      w.document.write(buildHtml(bill));
      w.document.close();
      w.focus();
      setTimeout(() => { try { w.print(); } catch (_) {} }, 300);
    } catch (_) {}
  };

  if (!bill) return null;
  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <View style={styles.row}>
      <Text style={[styles.rLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.rVal, strong && styles.strong]}>{value}</Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.head}>
            <View style={styles.tick}><Ionicons name="checkmark" size={22} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headTitle}>Bill Generated</Text>
              <Text style={styles.headSub}>{bill.bill_number}</Text>
            </View>
            <TouchableOpacity testID="receipt-close" onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ padding: spacing.lg }}>
            <Text style={styles.rest}>{bill.restaurant_name || "Restaurant"}</Text>
            <Text style={styles.meta}>{fmt(bill.created_at)}</Text>
            <View style={styles.tagRow}>
              <View style={styles.tag}><Text style={styles.tagTxt}>{TYPE_LABEL[bill.order_type] || bill.order_type}</Text></View>
              <View style={styles.tag}><Text style={styles.tagTxt}>{PAY_LABEL[bill.payment_method] || bill.payment_method}</Text></View>
              {bill.customer_name ? <View style={styles.tag}><Text style={styles.tagTxt}>{bill.customer_name}</Text></View> : null}
            </View>

            <View style={styles.divider} />
            {(bill.items || []).map((it: any, i: number) => (
              <View key={i} style={styles.itemRow}>
                <Text style={styles.itemName} numberOfLines={1}>{it.name} <Text style={styles.qty}>x{it.qty}</Text></Text>
                <Text style={styles.itemAmt}>{inr(it.amount)}</Text>
              </View>
            ))}
            <View style={styles.divider} />

            <Row label="Subtotal" value={inr(bill.subtotal)} />
            {bill.discount_amount > 0 ? (
              <Row label={`Discount${bill.discount_type === "percent" ? ` (${bill.discount_value}%)` : ""}`} value={"-" + inr(bill.discount_amount)} />
            ) : null}
            {bill.tax_amount > 0 ? <Row label={`GST (${bill.tax_percent}%)`} value={"+" + inr(bill.tax_amount)} /> : null}
            <View style={[styles.divider, { marginTop: 6 }]} />
            <Row label="TOTAL" value={inr(bill.total)} strong />

            {/* Split / partial payments */}
            {(bill.payments && bill.payments.length) ? (
              <>
                <View style={styles.divider} />
                {bill.payments.filter((p: any) => p.amount > 0).map((p: any, i: number) => (
                  <Row key={i} label={`Paid · ${PAY_LABEL2[p.method] || p.method}`} value={inr(p.amount)} />
                ))}
                {bill.settlement_discount > 0 ? <Row label="Unpaid → discount" value={"-" + inr(bill.settlement_discount)} /> : null}
                {bill.change > 0 ? <Row label="Change returned" value={inr(bill.change)} /> : null}
              </>
            ) : null}

            {/* WhatsApp delivery status */}
            {bill.whatsapp ? (
              <View style={[styles.waBox, { backgroundColor: bill.whatsapp.sent ? "#E7F8EE" : colors.surfaceAlt }]}>
                <Ionicons name="logo-whatsapp" size={18} color={bill.whatsapp.sent ? "#16A34A" : colors.textSecondary} />
                <Text style={styles.waTxt}>
                  {bill.whatsapp.sent
                    ? `Bill sent to ${bill.customer_phone || "customer"} on WhatsApp`
                    : "WhatsApp not auto-configured — tap to open & send"}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            {bill.whatsapp?.wa_link && Platform.OS === "web" ? (
              <TouchableOpacity testID="receipt-whatsapp" style={[styles.btn, styles.btnWa]} onPress={() => { try { window.open(bill.whatsapp.wa_link, "_blank"); } catch (_) {} }} activeOpacity={0.85}>
                <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                <Text style={[styles.btnTxt, { color: "#fff" }]}>WhatsApp</Text>
              </TouchableOpacity>
            ) : null}
            {Platform.OS === "web" ? (
              <TouchableOpacity testID="receipt-print" style={[styles.btn, styles.btnGhost]} onPress={print} activeOpacity={0.85}>
                <Ionicons name="print" size={18} color={colors.primary} />
                <Text style={[styles.btnTxt, { color: colors.primary }]}>Print</Text>
              </TouchableOpacity>
            ) : null}
            {onNewBill ? (
              <TouchableOpacity testID="receipt-new-bill" style={[styles.btn, styles.btnPrimary]} onPress={onNewBill} activeOpacity={0.85}>
                <Ionicons name="add" size={18} color={colors.onPrimary} />
                <Text style={[styles.btnTxt, { color: colors.onPrimary }]}>New Bill</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity testID="receipt-done" style={[styles.btn, styles.btnPrimary]} onPress={onClose} activeOpacity={0.85}>
                <Text style={[styles.btnTxt, { color: colors.onPrimary }]}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: { width: "100%", maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.xl, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  head: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  tick: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  headTitle: { fontSize: 17, fontWeight: font.black, color: colors.textPrimary },
  headSub: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  rest: { fontSize: 20, fontWeight: font.black, color: colors.textPrimary, textAlign: "center" },
  meta: { fontSize: 12, color: colors.textSecondary, textAlign: "center", marginTop: 2 },
  tagRow: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tag: { backgroundColor: colors.surfaceAlt, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  tagTxt: { fontSize: 11, fontWeight: font.bold, color: colors.textSecondary },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, borderStyle: "dashed", marginVertical: 10 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 3 },
  itemName: { flex: 1, fontSize: 14, color: colors.textPrimary, fontWeight: font.semi },
  qty: { color: colors.textMuted },
  itemAmt: { fontSize: 14, color: colors.textPrimary, fontWeight: font.bold },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 3 },
  rLabel: { fontSize: 14, color: colors.textSecondary },
  rVal: { fontSize: 14, color: colors.textPrimary, fontWeight: font.semi },
  strong: { fontSize: 19, fontWeight: font.black, color: colors.textPrimary },
  actions: { flexDirection: "row", gap: spacing.sm, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 48, borderRadius: radius.md },
  btnPrimary: { backgroundColor: colors.primary },
  btnGhost: { borderWidth: 1, borderColor: colors.primary },
  btnWa: { backgroundColor: "#25D366" },
  btnTxt: { fontSize: 15, fontWeight: font.black },
  waBox: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md },
  waTxt: { flex: 1, fontSize: 12, fontWeight: font.semi, color: colors.textSecondary },
});
