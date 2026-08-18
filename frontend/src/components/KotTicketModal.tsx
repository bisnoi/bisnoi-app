import React from "react";
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";

function fmt(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function buildHtml(k: any): string {
  const rows = (k.kot?.items || k.items || [])
    .map((it: any) => `<tr><td style="font-size:18px;font-weight:700">${it.name}</td><td style="text-align:right;font-size:18px;font-weight:800">x${it.qty}</td></tr>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${k.kot?.kot_number || "KOT"}</title>
  <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#000;padding:14px;max-width:300px;margin:auto}
  h2{text-align:center;margin:0} .sub{text-align:center;font-size:13px;margin:2px 0 8px}
  .tbl{font-size:16px;font-weight:800;text-align:center;border:2px solid #000;padding:6px;margin-bottom:8px}
  table{width:100%;border-collapse:collapse} td{padding:6px 0;border-bottom:1px dashed #aaa}
  </style></head><body>
  <h2>KITCHEN ORDER TICKET</h2>
  <div class="sub">${k.restaurant_name || ""} • ${k.kot?.kot_number || ""}<br/>${fmt(k.created_at || k.kot?.created_at)}</div>
  <div class="tbl">${k.table_label || ""}</div>
  <table>${rows}</table>
  </body></html>`;
}

export function KotTicketModal({ visible, ticket, onClose }: { visible: boolean; ticket: any; onClose: () => void }) {
  if (!ticket) return null;
  const items = ticket.kot?.items || ticket.items || [];
  const print = () => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    try {
      const w = window.open("", "PRINT", "height=600,width=380");
      if (!w) return;
      w.document.write(buildHtml(ticket));
      w.document.close();
      w.focus();
      setTimeout(() => { try { w.print(); } catch (_) {} }, 300);
    } catch (_) {}
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.head}>
            <View style={styles.icon}><Ionicons name="restaurant" size={20} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Sent to Kitchen</Text>
              <Text style={styles.sub}>{ticket.kot?.kot_number} • {ticket.table_label}</Text>
            </View>
            <TouchableOpacity testID="kot-ticket-close" onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ padding: spacing.lg }}>
            <Text style={styles.kotLabel}>KITCHEN ORDER TICKET</Text>
            <Text style={styles.time}>{fmt(ticket.created_at || ticket.kot?.created_at)}</Text>
            <View style={styles.tableBox}><Text style={styles.tableTxt}>{ticket.table_label}</Text></View>
            <View style={styles.divider} />
            {items.map((it: any, i: number) => (
              <View key={i} style={styles.row}>
                <Text style={styles.name} numberOfLines={2}>{it.name}</Text>
                <Text style={styles.qty}>x{it.qty}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.actions}>
            {Platform.OS === "web" ? (
              <TouchableOpacity testID="kot-ticket-print" style={[styles.btn, styles.ghost]} onPress={print} activeOpacity={0.85}>
                <Ionicons name="print" size={18} color={colors.primary} />
                <Text style={[styles.btnTxt, { color: colors.primary }]}>Print KOT</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity testID="kot-ticket-done" style={[styles.btn, styles.primary]} onPress={onClose} activeOpacity={0.85}>
              <Text style={[styles.btnTxt, { color: colors.onPrimary }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: { width: "100%", maxWidth: 380, backgroundColor: colors.surface, borderRadius: radius.xl, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  head: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, fontWeight: font.black, color: colors.textPrimary },
  sub: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  kotLabel: { fontSize: 13, fontWeight: font.black, color: colors.textSecondary, textAlign: "center", letterSpacing: 1 },
  time: { fontSize: 12, color: colors.textMuted, textAlign: "center", marginTop: 2 },
  tableBox: { borderWidth: 2, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 8, marginTop: 10 },
  tableTxt: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary, textAlign: "center" },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, borderStyle: "dashed", marginVertical: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  name: { flex: 1, fontSize: 16, fontWeight: font.bold, color: colors.textPrimary },
  qty: { fontSize: 16, fontWeight: font.black, color: colors.primary, marginLeft: 10 },
  actions: { flexDirection: "row", gap: spacing.sm, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 48, borderRadius: radius.md },
  primary: { backgroundColor: colors.primary },
  ghost: { borderWidth: 1, borderColor: colors.primary },
  btnTxt: { fontSize: 15, fontWeight: font.black },
});
