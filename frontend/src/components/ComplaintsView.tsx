import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal, ActivityIndicator, Platform, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Card, Empty } from "@/src/components/ui";

const STATUS_META: Record<string, { label: string; color: string }> = {
  open: { label: "Open", color: colors.warning },
  in_progress: { label: "In Progress", color: "#0EA5E9" },
  resolved: { label: "Resolved", color: colors.success },
};

function fmt(iso?: string) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
}

function StatusPill({ status }: { status: string }) {
  const m = STATUS_META[status] || STATUS_META.open;
  return (
    <View style={[styles.pill, { backgroundColor: m.color + "22" }]}>
      <View style={[styles.dot, { backgroundColor: m.color }]} />
      <Text style={[styles.pillTxt, { color: m.color }]}>{m.label}</Text>
    </View>
  );
}

/**
 * Reusable complaints screen body for owner / admin / rider / customer.
 * - canManage => staff: can reply + change status.
 * - canReply (defaults to canManage) => can post replies in the thread. Customers reply but cannot change status.
 */
export function ComplaintsView({ fetcher, canManage = true, canReply, accent = colors.primary }: { fetcher: () => Promise<any>; canManage?: boolean; canReply?: boolean; accent?: string }) {
  const allowReply = canReply ?? canManage;
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<any>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const d = await fetcher(); setList((d as any[]) || []); }
    catch (e: any) { console.warn(e?.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [fetcher]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refreshActive = async () => {
    const d = await fetcher();
    setList((d as any[]) || []);
    if (active) { const f = (d as any[]).find((x) => x.id === active.id); if (f) setActive(f); }
  };

  const sendReply = async () => {
    if (!reply.trim() || !active) return;
    setBusy(true);
    try { await Api.replyComplaint(active.id, reply.trim()); setReply(""); await refreshActive(); }
    catch (e: any) { if (Platform.OS === "web") window.alert(e?.message); }
    finally { setBusy(false); }
  };

  const changeStatus = async (s: string) => {
    if (!active) return;
    setBusy(true);
    try { await Api.setComplaintStatus(active.id, s); await refreshActive(); }
    catch (e: any) { if (Platform.OS === "web") window.alert(e?.message); }
    finally { setBusy(false); }
  };

  const counts = {
    open: list.filter((c) => c.status === "open").length,
    in_progress: list.filter((c) => c.status === "in_progress").length,
    resolved: list.filter((c) => c.status === "resolved").length,
  };

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 112 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={accent} />}>
        {loading ? (
          <ActivityIndicator color={accent} style={{ marginTop: 40 }} />
        ) : list.length === 0 ? (
          <Empty icon="checkmark-done-circle-outline" title="No complaints" subtitle="Customer complaints will appear here." />
        ) : (
          <>
            <View style={styles.summaryRow}>
              <View style={[styles.sChip, { backgroundColor: colors.warning + "18" }]}><Text style={[styles.sNum, { color: colors.warning }]}>{counts.open}</Text><Text style={styles.sLbl}>Open</Text></View>
              <View style={[styles.sChip, { backgroundColor: "#0EA5E918" }]}><Text style={[styles.sNum, { color: "#0EA5E9" }]}>{counts.in_progress}</Text><Text style={styles.sLbl}>In Progress</Text></View>
              <View style={[styles.sChip, { backgroundColor: colors.success + "18" }]}><Text style={[styles.sNum, { color: colors.success }]}>{counts.resolved}</Text><Text style={styles.sLbl}>Resolved</Text></View>
            </View>
            {list.map((c) => (
              <TouchableOpacity key={c.id} activeOpacity={0.85} onPress={() => { setActive(c); setReply(""); }} testID={`complaint-${c.id}`}>
                <Card style={{ marginBottom: spacing.sm }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <Text style={styles.subject} numberOfLines={1}>{c.subject}</Text>
                    <StatusPill status={c.status} />
                  </View>
                  <Text style={styles.msg} numberOfLines={2}>{c.message}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.meta} numberOfLines={1}>{c.customer_name || "Customer"}{c.restaurant_name ? ` • ${c.restaurant_name}` : ""}{c.order_no ? ` • #${c.order_no}` : ""}</Text>
                    <Text style={styles.meta}>{fmt(c.created_at)}</Text>
                  </View>
                  {(c.replies || []).length ? <Text style={styles.replyCount}>{c.replies.length} repl{c.replies.length === 1 ? "y" : "ies"}</Text> : null}
                </Card>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={!!active} transparent animationType="slide" onRequestClose={() => setActive(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle} numberOfLines={1}>{active?.subject}</Text>
              <TouchableOpacity onPress={() => setActive(null)} hitSlop={10}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: spacing.lg }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <StatusPill status={active?.status || "open"} />
                <Text style={styles.meta}>{fmt(active?.created_at)}</Text>
              </View>
              <Text style={styles.detMeta}>{active?.customer_name}{active?.restaurant_name ? ` • ${active?.restaurant_name}` : ""}{active?.order_no ? ` • Order #${active?.order_no}` : ""}</Text>
              <View style={styles.bubbleCust}><Text style={styles.bubbleTxt}>{active?.message}</Text></View>
              {(active?.replies || []).map((r: any) => (
                <View key={r.id} style={[styles.bubble, r.by_role === "customer" ? styles.bubbleCust : styles.bubbleStaff]}>
                  <Text style={styles.bubbleBy}>{r.by_name} • {r.by_role.replace("_", " ")}</Text>
                  <Text style={styles.bubbleTxt}>{r.message}</Text>
                  <Text style={styles.bubbleAt}>{fmt(r.at)}</Text>
                </View>
              ))}
            </ScrollView>
            {canManage || allowReply ? (
              <View style={styles.actionsWrap}>
                {canManage ? (
                  <View style={styles.statusBtns}>
                    {(["open", "in_progress", "resolved"] as const).map((s) => (
                      <TouchableOpacity key={s} testID={`status-${s}`} onPress={() => changeStatus(s)} disabled={busy} style={[styles.stBtn, active?.status === s && { backgroundColor: (STATUS_META[s].color), borderColor: STATUS_META[s].color }]}>
                        <Text style={[styles.stBtnTxt, active?.status === s && { color: "#fff" }]}>{STATUS_META[s].label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                {allowReply ? (
                  <View style={styles.replyRow}>
                    <TextInput testID="complaint-reply-input" value={reply} onChangeText={setReply} placeholder="Type a reply…" placeholderTextColor={colors.textMuted} style={styles.replyInput} />
                    <TouchableOpacity testID="complaint-reply-send" onPress={sendReply} disabled={busy || !reply.trim()} style={[styles.sendBtn, (!reply.trim() || busy) && { opacity: 0.5 }]}>
                      {busy ? <ActivityIndicator color={colors.onPrimary} size="small" /> : <Ionicons name="send" size={18} color={colors.onPrimary} />}
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  sChip: { flex: 1, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: "center" },
  sNum: { fontSize: 20, fontWeight: font.black },
  sLbl: { fontSize: 11, color: colors.textSecondary, fontWeight: font.semi, marginTop: 1 },
  subject: { flex: 1, fontSize: 15, fontWeight: font.black, color: colors.textPrimary },
  msg: { fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 18 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 8 },
  meta: { fontSize: 11, color: colors.textMuted, flexShrink: 1 },
  replyCount: { fontSize: 11, color: colors.primary, fontWeight: font.bold, marginTop: 6 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillTxt: { fontSize: 11, fontWeight: font.black },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: "88%" },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: font.black, color: colors.textPrimary, marginRight: 10 },
  detMeta: { fontSize: 12, color: colors.textSecondary, marginBottom: 10 },
  bubble: { borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, maxWidth: "92%" },
  bubbleCust: { backgroundColor: colors.surfaceAlt, alignSelf: "flex-start", borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, maxWidth: "92%" },
  bubbleStaff: { backgroundColor: colors.primarySoft, alignSelf: "flex-end" },
  bubbleBy: { fontSize: 11, fontWeight: font.black, color: colors.textSecondary, marginBottom: 3, textTransform: "capitalize" },
  bubbleTxt: { fontSize: 14, color: colors.textPrimary, lineHeight: 19 },
  bubbleAt: { fontSize: 10, color: colors.textMuted, marginTop: 4, textAlign: "right" },
  actionsWrap: { borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  statusBtns: { flexDirection: "row", gap: spacing.sm },
  stBtn: { flex: 1, height: 38, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  stBtnTxt: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary },
  replyRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  replyInput: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: 14, height: 46, color: colors.textPrimary, fontSize: 14 },
  sendBtn: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
});
