import React, { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ScreenHeader, Screen } from "@/src/components/ScreenHeader";

export default function AdminCustomerPayments() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r: any = await Api.adminListCustomersPayments();
      setItems(r?.items || []);
    } catch { setItems([]); }
    finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return items;
    return items.filter((it) => (it.name || "").toLowerCase().includes(q) || (it.phone || "").includes(q));
  }, [items, query]);

  const blockedCount = items.filter((i) => !i.cod_available).length;

  return (
    <Screen>
      <ScreenHeader title="Customer Payments" subtitle={`${items.length} customers \u2022 ${blockedCount} with COD blocked`} />
      <View style={{ padding: spacing.lg, paddingBottom: 8 }}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or phone"
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, fontSize: 14, color: colors.textPrimary }}
          />
        </View>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: 100, gap: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        >
          {filtered.map((it) => (
            <TouchableOpacity key={it.id} style={styles.row} onPress={() => setSelected(it)}>
              <View style={styles.avatar}>
                <Text style={{ fontWeight: font.black, color: "#fff" }}>
                  {(it.name || it.phone || "?")[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{it.name || "Unnamed"}</Text>
                <Text style={styles.phone}>+91 {it.phone}</Text>
                {it.metrics ? (
                  <Text style={styles.metrics}>
                    Orders: {it.metrics.total_orders} \u2022 Cancel: {it.metrics.cancel_rate_pct}% \u2022 RTO: {it.metrics.rto_count}
                  </Text>
                ) : null}
              </View>
              <View style={[styles.pill, { backgroundColor: it.cod_available ? colors.successSoft : colors.errorSoft }]}>
                <Text style={{ color: it.cod_available ? colors.success : colors.error, fontSize: 11, fontWeight: font.black }}>
                  {it.cod_available ? "COD OK" : "COD BLOCKED"}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
          {filtered.length === 0 && (
            <Text style={{ textAlign: "center", color: colors.textSecondary, marginTop: 40 }}>No customers match your search.</Text>
          )}
        </ScrollView>
      )}
      <CustomerModal customer={selected} onClose={() => setSelected(null)} onSaved={load} />
    </Screen>
  );
}

function CustomerModal({ customer, onClose, onSaved }: { customer: any | null; onClose: () => void; onSaved: () => void }) {
  const [override, setOverride] = useState<"allow" | "block" | "clear">("clear");
  const [reason, setReason] = useState("");
  const [fakeFlag, setFakeFlag] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!customer) return;
    setOverride((customer.override as any) || "clear");
    setReason(customer.reason || "");
    setFakeFlag(!!(customer.metrics && customer.metrics.fake_order_flag));
    setStatus("");
  }, [customer]);

  if (!customer) return null;

  const save = async () => {
    setSaving(true); setStatus("");
    try {
      await Api.adminUpdateCustomerPayment(customer.id, { override, reason, fake_order_flag: fakeFlag });
      onSaved();
      onClose();
    } catch (e: any) { setStatus(e?.message || "Could not save"); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={{ fontSize: 15, fontWeight: font.black, color: colors.textPrimary }}>Payment status</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={20} color={colors.textSecondary} /></TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
            <Text style={styles.name}>{customer.name || "Unnamed"} \u2022 +91 {customer.phone}</Text>

            {customer.metrics ? (
              <View style={styles.card}>
                <Text style={styles.smallLabel}>METRICS ({customer.metrics.lookback_days} days)</Text>
                <Text style={styles.metricLine}>Total orders: {customer.metrics.total_orders}</Text>
                <Text style={styles.metricLine}>Cancelled by customer: {customer.metrics.cancelled_by_customer}</Text>
                <Text style={styles.metricLine}>Cancel rate: {customer.metrics.cancel_rate_pct}%</Text>
                <Text style={styles.metricLine}>RTO count: {customer.metrics.rto_count}</Text>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.smallLabel}>OVERRIDE</Text>
              {(["clear", "allow", "block"] as const).map((k) => (
                <TouchableOpacity key={k} style={styles.radioRow} onPress={() => setOverride(k)}>
                  <Ionicons name={override === k ? "radio-button-on" : "radio-button-off"} size={18} color={override === k ? colors.primary : colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: colors.textPrimary, fontWeight: font.bold }}>
                      {k === "clear" ? "Auto (follow rules)" : k === "allow" ? "Force ALLOW COD" : "Force BLOCK COD"}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.smallLabel}>REASON (shown to customer if blocked)</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                multiline
                placeholder="e.g. Multiple recent cancellations"
                placeholderTextColor={colors.textMuted}
                style={styles.textarea}
              />
            </View>

            <TouchableOpacity style={styles.card} onPress={() => setFakeFlag((v) => !v)}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name={fakeFlag ? "warning" : "warning-outline"} size={20} color={fakeFlag ? colors.error : colors.textMuted} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: font.bold }}>Fake / fraudulent flag</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>When ON, COD will be auto-blocked as suspicious.</Text>
                </View>
              </View>
            </TouchableOpacity>

            {!!status && <Text style={{ color: colors.error, fontSize: 13 }}>{status}</Text>}

            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost, { flex: 1 }]} onPress={onClose}>
                <Text style={styles.btnGhostTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary, { flex: 1, opacity: saving ? 0.6 : 1 }]} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryTxt}>Save</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, height: 42, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary },
  phone: { fontSize: 12, color: colors.textSecondary },
  metrics: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  modal: { width: "92%", maxWidth: 560, backgroundColor: colors.surface, borderRadius: radius.xl, overflow: "hidden", ...shadow.lifted },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  smallLabel: { fontSize: 11, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.6, marginBottom: 6 },
  card: { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  metricLine: { color: colors.textPrimary, fontSize: 13, marginTop: 3 },
  radioRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  textarea: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, padding: 10, minHeight: 60, textAlignVertical: "top", color: colors.textPrimary, backgroundColor: colors.surface },
  btn: { paddingVertical: 12, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  btnGhost: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  btnGhostTxt: { color: colors.textPrimary, fontWeight: font.bold },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryTxt: { color: "#fff", fontWeight: font.black },
});
