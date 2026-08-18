import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";

type Tbl = { id: string; label: string; status?: string; amount?: number; minutes?: number; kots?: number };

const STATUS: Record<string, { label: string; dot: string; bg: string; border: string; dashed?: boolean }> = {
  blank:       { label: "Blank Table",       dot: "#D1D5DB", bg: "#F9FAFB", border: "#E5E7EB", dashed: true },
  running:     { label: "Running Table",     dot: "#38BDF8", bg: "#EFF8FF", border: "#7DD3FC" },
  printed:     { label: "Printed Table",     dot: "#22C55E", bg: "#F0FDF4", border: "#86EFAC" },
  paid:        { label: "Paid Table",        dot: "#FDE68A", bg: "#FFFBEB", border: "#FDE68A" },
  running_kot: { label: "Running KOT Table", dot: "#F59E0B", bg: "#FFF7ED", border: "#FDBA74" },
};
const STATUS_ORDER = ["blank", "running", "printed", "paid", "running_kot"];

function normalizeStatus(raw?: string): string {
  const s = (raw || "").toLowerCase();
  if (s === "free" || s === "blank") return "blank";
  if (s === "printed") return "printed";
  if (s === "paid") return "paid";
  if (s === "running_kot" || s === "kot") return "running_kot";
  if (s === "occupied" || s === "running") return "running";
  return "blank";
}

export default function OwnerTablesPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [rest, setRest] = useState<any>(null);
  const [tables, setTables] = useState<Tbl[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [newCount, setNewCount] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async (isRefresh?: boolean) => {
    if (isRefresh) setRefreshing(true);
    setMsg("");
    try {
      const r: any = await Api.ownerMyRestaurant();
      setRest(r);
      if (r?.id) {
        const t: any = await Api.ownerTables(r.id);
        const list: Tbl[] = Array.isArray(t) ? t : (t?.tables || []);
        setTables(list);
      }
    } catch (e: any) {
      setMsg(e?.message || "Could not load tables");
      setTables([
        { id: "demo-1", label: "1", status: "free" },
        { id: "demo-2", label: "2", status: "free" },
        { id: "demo-3", label: "3", status: "free" },
        { id: "demo-4", label: "4", status: "free" },
      ]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const pickTable = (label: string) => {
    router.push({ pathname: "/owner/pos" as any, params: { table: label, type: "dine_in" } } as any);
  };
  const startWalkIn = () => {
    router.push({ pathname: "/owner/pos" as any, params: { type: "pickup" } } as any);
  };
  const startDelivery = () => {
    router.push({ pathname: "/owner/pos" as any, params: { type: "delivery" } } as any);
  };

  const applyCount = async () => {
    const n = parseInt(newCount || "0", 10);
    if (!Number.isFinite(n) || n < 0 || saving || !rest?.id) return;
    setSaving(true); setMsg("");
    try {
      const t: any = await Api.ownerSetTableCount(n, rest.id);
      const list: Tbl[] = Array.isArray(t) ? t : (t?.tables || []);
      setTables(list);
      setNewCount("");
      setMsg(`${list.length} table${list.length === 1 ? "" : "s"} ready.`);
    } catch (e: any) {
      setMsg(e?.message || "Could not update tables");
    } finally {
      setSaving(false);
    }
  };

  const addOneTable = async () => {
    const label = addLabel.trim();
    if (!label || saving) return;
    setSaving(true); setMsg("");
    try {
      const nextN = (tables.length || 0) + 1;
      const t: any = await Api.ownerSetTableCount(nextN, rest?.id);
      const list: Tbl[] = Array.isArray(t) ? t : (t?.tables || []);
      setTables(list);
      setAddLabel("");
      setMsg(`Added. You now have ${list.length} table${list.length === 1 ? "" : "s"}.`);
    } catch (e: any) {
      setTables((prev) => [...prev, { id: `local-${Date.now()}`, label, status: "free" }]);
      setAddLabel("");
      setMsg("Table added locally.");
    } finally {
      setSaving(false);
    }
  };

  const HeaderButtons = () => (
    <View style={[styles.actionsRow, isMobile && styles.actionsRowMobile]}>
      <TouchableOpacity testID="tables-add-table" onPress={() => setShowAdd((v) => !v)} activeOpacity={0.85} style={[styles.actionBtn, styles.actionBtnPrimary, isMobile && styles.actionBtnMobile]}>
        <Text style={styles.actionBtnPrimaryTxt}>Add Table</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="tables-delivery" onPress={startDelivery} activeOpacity={0.85} style={[styles.actionBtn, styles.actionBtnPrimary, isMobile && styles.actionBtnMobile]}>
        <Text style={styles.actionBtnPrimaryTxt}>Delivery</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="tables-walkin" onPress={startWalkIn} activeOpacity={0.85} style={[styles.actionBtn, styles.actionBtnPrimary, isMobile && styles.actionBtnMobile]}>
        <Text style={styles.actionBtnPrimaryTxt}>Pick Up</Text>
      </TouchableOpacity>
    </View>
  );

  const Legend = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.legendRow}>
      {STATUS_ORDER.map((key) => (
        <View key={key} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: STATUS[key].dot }]} />
          <Text style={styles.legendTxt}>{STATUS[key].label}</Text>
        </View>
      ))}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="tables-back">
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.hTitle}>Table View</Text>
        <TouchableOpacity testID="tables-refresh" onPress={() => load(true)} style={styles.refreshBtn} activeOpacity={0.8}>
          {refreshing ? <ActivityIndicator size="small" color={colors.textPrimary} /> : <Ionicons name="refresh" size={20} color={colors.textPrimary} />}
        </TouchableOpacity>
        {!isMobile ? <HeaderButtons /> : null}
      </View>

      {isMobile ? <View style={styles.mobileActionsWrap}><HeaderButtons /></View> : null}

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <Legend />

        {showAdd ? (
          <View style={styles.addBox}>
            <Text style={styles.inpLbl}>Add one table</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                testID="add-table-label"
                value={addLabel}
                onChangeText={setAddLabel}
                placeholder="e.g. 5"
                placeholderTextColor={colors.textMuted}
                style={[styles.inp, { flex: 1 }]}
              />
              <TouchableOpacity
                testID="add-table-btn"
                onPress={addOneTable}
                activeOpacity={0.85}
                disabled={!addLabel.trim() || saving}
                style={[styles.addBtn, (!addLabel.trim() || saving) && { opacity: 0.5 }]}
              >
                <Ionicons name="add" size={16} color={colors.onPrimary} />
                <Text style={styles.addBtnTxt}>Add</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.inpLbl, { marginTop: 14 }]}>Or set total number of tables</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                testID="set-count-input"
                value={newCount}
                onChangeText={setNewCount}
                placeholder={`${tables.length}`}
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                style={[styles.inp, { flex: 1 }]}
              />
              <TouchableOpacity
                testID="set-count-btn"
                onPress={applyCount}
                activeOpacity={0.85}
                disabled={!newCount.trim() || saving}
                style={[styles.addBtn, styles.addBtnAlt, (!newCount.trim() || saving) && { opacity: 0.5 }]}
              >
                <Text style={[styles.addBtnTxt, { color: colors.primary }]}>Apply</Text>
              </TouchableOpacity>
            </View>
            {msg ? <Text style={styles.msg} testID="tables-msg">{msg}</Text> : null}
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : tables.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="grid-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No tables set up yet</Text>
            <Text style={styles.emptySub}>Tap "Add Table" above to start dine-in billing.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {tables.map((t) => {
              const st = normalizeStatus(t.status);
              const cfg = STATUS[st];
              const isBlank = st === "blank";
              return (
                <TouchableOpacity
                  key={t.id}
                  testID={`table-card-${t.label}`}
                  onPress={() => pickTable(t.label)}
                  activeOpacity={0.8}
                  style={[
                    styles.card,
                    { backgroundColor: cfg.bg, borderColor: cfg.border },
                    cfg.dashed && styles.cardDashed,
                  ]}
                >
                  {!isBlank && t.minutes != null ? <Text style={styles.cardMeta}>{t.minutes} Min</Text> : null}
                  {!isBlank && t.kots != null ? <Text style={styles.cardMeta}>{t.kots}</Text> : null}
                  <Text style={styles.cardLbl}>{t.label}</Text>
                  {!isBlank && t.amount != null ? <Text style={styles.cardAmt}>{"\u20B9"}{t.amount.toFixed(2)}</Text> : null}
                  {!isBlank ? (
                    <View style={styles.printIcon}>
                      <Ionicons name="print-outline" size={14} color={colors.textSecondary} />
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, flexWrap: "wrap" },
  backBtn: { width: 36, height: 36, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  hTitle: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary, flexShrink: 0 },
  refreshBtn: { width: 36, height: 36, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  mobileActionsWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.sm },
  actionsRow: { flexDirection: "row", gap: 8, marginLeft: "auto" },
  actionsRowMobile: { marginLeft: 0, flexWrap: "wrap" },
  actionBtn: { height: 38, paddingHorizontal: 14, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  actionBtnMobile: { flex: 1, minWidth: 90 },
  actionBtnPrimary: { backgroundColor: "#B91C1C" },
  actionBtnPrimaryTxt: { color: "#fff", fontWeight: font.black, fontSize: 13 },
  legendRow: { flexDirection: "row", gap: 18, paddingVertical: spacing.md, alignItems: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendTxt: { fontSize: 12.5, color: colors.textSecondary, fontWeight: font.semi },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  card: { width: 110, height: 100, borderWidth: 1.5, borderRadius: radius.md, padding: 10, alignItems: "center", justifyContent: "center", ...shadow.card },
  cardDashed: { borderStyle: "dashed" },
  cardMeta: { fontSize: 10, color: colors.textSecondary, fontWeight: font.semi, position: "absolute", top: 8, left: 10 },
  cardLbl: { fontSize: 20, fontWeight: font.black, color: colors.textPrimary },
  cardAmt: { fontSize: 12, fontWeight: font.bold, color: colors.textPrimary, marginTop: 4 },
  printIcon: { position: "absolute", bottom: 6, left: 8, width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  emptyBox: { alignItems: "center", paddingVertical: 30, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: font.black, color: colors.textPrimary },
  emptySub: { fontSize: 12.5, color: colors.textSecondary, textAlign: "center" },
  addBox: { marginBottom: spacing.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  inpLbl: { fontSize: 11, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.4, marginBottom: 6 },
  inp: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: 12, height: 44, fontSize: 14, color: colors.textPrimary, outlineWidth: 0 as any, borderWidth: 0 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.primary },
  addBtnAlt: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  addBtnTxt: { fontSize: 13.5, fontWeight: font.black, color: colors.onPrimary, letterSpacing: 0.4 },
  msg: { marginTop: 10, fontSize: 12.5, fontWeight: font.semi, color: colors.textSecondary },
});
