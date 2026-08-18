import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Empty } from "@/src/components/ui";
import PrepTimer from "@/src/components/PrepTimer";

type Kot = {
  session_id: string; table_id: string; table_label: string;
  kot_id: string; kot_number: string; items: any[]; status: "sent" | "preparing"; created_at: string;
};

function ago(iso?: string): string {
  if (!iso) return "";
  try {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return "just now";
    if (mins === 1) return "1 min ago";
    return `${mins} mins ago`;
  } catch { return ""; }
}

export function KitchenView({
  rid, reloadSignal, onChanged,
}: {
  rid?: string;
  reloadSignal: number;
  onChanged: () => void;
}) {
  const [kots, setKots] = useState<Kot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const timer = useRef<any>(null);

  const load = useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true);
    try {
      const res: any = await Api.ownerKitchenKots(rid);
      setKots(res || []);
    } catch (e: any) {
      console.warn(e?.message);
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => {
    load();
    timer.current = setInterval(() => load(true), 2000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load, reloadSignal]);

  const setStatus = async (k: Kot, status: "preparing" | "ready") => {
    setBusy(k.kot_id);
    try {
      await Api.ownerUpdateKotStatus(k.kot_id, status);
      await load(true);
      onChanged();
    } catch (e: any) {
      if (Platform.OS === "web") window.alert(e?.message || "Failed");
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 50 }} />;

  return (
    <>
      <View style={styles.bar}>
        <Text style={styles.barText}>{kots.length} pending KOT(s)</Text>
        <TouchableOpacity testID="kitchen-refresh" onPress={() => load()} style={styles.refresh}>
          <Ionicons name="refresh" size={16} color={colors.primary} />
          <Text style={styles.refreshTxt}>Refresh</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        {kots.length === 0 ? (
          <Empty icon="checkmark-done-circle-outline" title="Kitchen is all caught up" subtitle="New KOTs sent from tables will appear here." />
        ) : (
          kots.map((k) => {
            const prep = k.status === "preparing";
            return (
              <View key={k.kot_id} style={[styles.card, prep && styles.cardPrep]} testID={`kitchen-kot-${k.kot_id}`}>
                <View style={styles.cardHead}>
                  <View style={styles.tableTag}><Text style={styles.tableTagTxt}>{k.table_label}</Text></View>
                  <Text style={styles.kotNo}>{k.kot_number}</Text>
                  <Text style={styles.time}>{ago(k.created_at)}</Text>
                </View>
                <View style={{ marginTop: spacing.sm }}>
                  <PrepTimer
                    testID={`prep-timer-kot-${k.kot_id}`}
                    startedAt={k.created_at}
                    prepMin={(k as any).prep_min || 15}
                    compact
                  />
                </View>
                <View style={styles.items}>
                  {k.items.map((it, i) => (
                    <View key={i} style={styles.itemRow}>
                      <Text style={styles.qtyBox}>{it.qty}</Text>
                      <Text style={styles.itemName} numberOfLines={2}>{it.name}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.actions}>
                  {!prep ? (
                    <TouchableOpacity testID={`kitchen-prep-${k.kot_id}`} disabled={busy === k.kot_id} onPress={() => setStatus(k, "preparing")} style={[styles.actBtn, { borderColor: colors.primary }]}>
                      {busy === k.kot_id ? <ActivityIndicator color={colors.primary} size="small" /> : (
                        <><Ionicons name="flame" size={15} color={colors.primary} /><Text style={[styles.actTxt, { color: colors.primary }]}>Start Preparing</Text></>
                      )}
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity testID={`kitchen-ready-${k.kot_id}`} disabled={busy === k.kot_id} onPress={() => setStatus(k, "ready")} style={[styles.actBtn, styles.readyBtn]}>
                    {busy === k.kot_id ? <ActivityIndicator color={colors.onPrimary} size="small" /> : (
                      <><Ionicons name="checkmark-done" size={15} color={colors.onPrimary} /><Text style={[styles.actTxt, { color: colors.onPrimary }]}>Mark Ready</Text></>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  barText: { fontSize: 13, color: colors.textSecondary, fontWeight: font.semi },
  refresh: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary },
  refreshTxt: { fontSize: 13, fontWeight: font.bold, color: colors.primary },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: colors.warning, padding: spacing.md, marginBottom: spacing.sm, ...shadow.card },
  cardPrep: { borderLeftColor: colors.primary },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  tableTag: { backgroundColor: colors.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm },
  tableTagTxt: { fontSize: 13, fontWeight: font.black, color: colors.primary },
  kotNo: { flex: 1, fontSize: 13, fontWeight: font.bold, color: colors.textPrimary },
  time: { fontSize: 11, color: colors.textMuted },
  items: { marginTop: spacing.sm, gap: 6 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  qtyBox: { minWidth: 28, height: 28, lineHeight: 28, textAlign: "center", backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, fontSize: 14, fontWeight: font.black, color: colors.textPrimary, paddingHorizontal: 4 },
  itemName: { flex: 1, fontSize: 15, fontWeight: font.semi, color: colors.textPrimary },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  actBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, height: 42, borderRadius: radius.md, borderWidth: 1.5 },
  readyBtn: { backgroundColor: colors.success, borderColor: colors.success },
  actTxt: { fontSize: 13, fontWeight: font.black },
});
