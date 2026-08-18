import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Switch, ActivityIndicator, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ScreenHeader, Screen } from "@/src/components/ScreenHeader";

type CatalogEvent = { key: string; label: string; default_roles: string[] };
type EventSetting = { enabled: boolean; roles: Record<string, boolean> };
type Settings = {
  catalog: CatalogEvent[];
  roles: string[];
  events: Record<string, EventSetting>;
  updated_at?: string;
};

type Broadcast = {
  id: string;
  title: string;
  body: string;
  url?: string;
  roles: string[];
  created_at: string;
  completed_at?: string;
  recipients: number;
  sent_push: number;
  sent_inapp: number;
};

const ROLE_META: Record<string, { label: string; icon: any; color: string }> = {
  customer: { label: "Customer", icon: "person-outline", color: "#2563EB" },
  restaurant_owner: { label: "Owner", icon: "storefront-outline", color: "#DB2777" },
  rider: { label: "Rider", icon: "bicycle-outline", color: "#059669" },
  admin: { label: "Admin", icon: "shield-checkmark-outline", color: "#7C3AED" },
};

export default function AdminNotifications() {
  const [tab, setTab] = useState<"auto" | "manual">("auto");

  // Auto settings state
  const [s, setS] = useState<Settings | null>(null);
  const [serverS, setServerS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [err, setErr] = useState("");

  // Manual broadcast state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [targets, setTargets] = useState<Record<string, boolean>>({
    customer: true, restaurant_owner: false, rider: false,
  });
  const [sending, setSending] = useState(false);
  const [lastSend, setLastSend] = useState<any>(null);
  const [history, setHistory] = useState<Broadcast[]>([]);
  const [confirm, setConfirm] = useState(false);

  const loadSettings = useCallback(async () => {
    setErr("");
    try {
      const r: any = await Api.adminGetNotifSettings();
      setS(r); setServerS(r);
    } catch (e: any) {
      setErr(e?.message || "Could not load notification settings");
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const r: any = await Api.adminListBroadcasts();
      setHistory((r as Broadcast[]) || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadSettings(); loadHistory(); }, [loadSettings, loadHistory]);

  const dirty = useMemo(() => {
    if (!s || !serverS) return false;
    return JSON.stringify(s.events) !== JSON.stringify(serverS.events);
  }, [s, serverS]);

  const toggleEnabled = (key: string) => {
    if (!s) return;
    setS({ ...s, events: { ...s.events, [key]: { ...s.events[key], enabled: !s.events[key].enabled } } });
  };

  const toggleRole = (key: string, role: string) => {
    if (!s) return;
    const evt = s.events[key];
    const roles = { ...evt.roles, [role]: !evt.roles[role] };
    setS({ ...s, events: { ...s.events, [key]: { ...evt, roles } } });
  };

  const saveSettings = async () => {
    if (!s || saving) return;
    setSaving(true); setErr("");
    try {
      const payload: any = { events: {} };
      Object.keys(s.events).forEach((k) => {
        payload.events[k] = {
          enabled: s.events[k].enabled,
          roles: s.events[k].roles,
        };
      });
      const r: any = await Api.adminUpdateNotifSettings(payload);
      setS(r); setServerS(r);
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 2500);
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    } finally { setSaving(false); }
  };

  const toggleTarget = (role: string) => setTargets((t) => ({ ...t, [role]: !t[role] }));

  const chosenRoles = () => Object.keys(targets).filter((k) => targets[k]);

  const doSend = async () => {
    if (sending) return;
    const roles = chosenRoles();
    if (!title.trim() || !body.trim()) { Alert.alert("Missing fields", "Title and message are required."); return; }
    if (!roles.length) { Alert.alert("No target", "Select at least one recipient role."); return; }
    setSending(true); setLastSend(null);
    try {
      const r: any = await Api.adminBroadcastPush({
        title: title.trim(),
        body: body.trim(),
        url: url.trim() || undefined,
        roles,
      });
      setLastSend(r);
      setTitle(""); setBody(""); setUrl("");
      setConfirm(false);
      loadHistory();
    } catch (e: any) {
      Alert.alert("Send failed", e?.message || "Something went wrong");
    } finally { setSending(false); }
  };

  return (
    <Screen>
      <ScreenHeader title="Push Notifications" subtitle="Automatic triggers + manual marketing pushes" />

      {/* Tab switcher */}
      <View style={styles.tabsWrap}>
        {(["auto", "manual"] as const).map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} activeOpacity={0.85}
            style={[styles.tab, tab === t && styles.tabActive]} testID={`notif-tab-${t}`}>
            <Ionicons name={t === "auto" ? "settings-outline" : "megaphone-outline"} size={16} color={tab === t ? colors.onPrimary : colors.textSecondary} />
            <Text style={[styles.tabTxt, tab === t && { color: colors.onPrimary }]}>
              {t === "auto" ? "Auto Triggers" : "Send Manual Push"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "auto" ? (
        !s ? (
          <View style={{ padding: 40, alignItems: "center" }}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>AUTOMATIC NOTIFICATION EVENTS</Text>
            <Text style={styles.help}>
              Toggle each event on/off, or restrict which recipient roles get notified. When an event is OFF, no in-app
              notification or push is sent for that trigger.
            </Text>
            <View style={{ gap: 12, marginTop: spacing.md }}>
              {s.catalog.map((evt) => {
                const ev = s.events[evt.key];
                if (!ev) return null;
                return (
                  <View key={evt.key} style={styles.eventCard} testID={`event-card-${evt.key}`}>
                    <View style={styles.eventHead}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.eventTitle}>{evt.label}</Text>
                        <Text style={styles.eventKey}>{evt.key}</Text>
                      </View>
                      <Switch
                        value={ev.enabled}
                        onValueChange={() => toggleEnabled(evt.key)}
                        trackColor={{ true: colors.primary, false: colors.borderStrong }}
                        thumbColor="#fff"
                        testID={`event-enable-${evt.key}`}
                      />
                    </View>
                    <View style={styles.rolesRow}>
                      {s.roles.map((r) => {
                        const meta = ROLE_META[r] || { label: r, icon: "ellipse-outline", color: colors.textSecondary };
                        const on = !!ev.roles[r];
                        return (
                          <TouchableOpacity
                            key={r}
                            disabled={!ev.enabled}
                            onPress={() => toggleRole(evt.key, r)}
                            activeOpacity={0.85}
                            style={[styles.roleChip, on && { backgroundColor: meta.color + "22", borderColor: meta.color }, !ev.enabled && { opacity: 0.4 }]}
                            testID={`event-role-${evt.key}-${r}`}
                          >
                            <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={14} color={on ? meta.color : colors.textSecondary} />
                            <Text style={[styles.roleChipTxt, on && { color: meta.color }]}>{meta.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>

            {err ? <Text style={styles.error}>{err}</Text> : null}

            <TouchableOpacity
              style={[styles.saveBtn, { opacity: !dirty || saving ? 0.5 : 1 }]}
              disabled={!dirty || saving} onPress={saveSettings} activeOpacity={0.9}
              testID="save-notif-settings"
            >
              {saving ? <ActivityIndicator color={colors.onPrimary} /> : (
                <>
                  <Ionicons name={savedTick ? "checkmark-circle" : "save-outline"} size={18} color={colors.onPrimary} />
                  <Text style={styles.saveTxt}>{savedTick ? "Saved" : dirty ? "Save Settings" : "No changes"}</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        )
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionLabel}>SEND A MARKETING / MANUAL PUSH</Text>
          <Text style={styles.help}>
            Delivered as both an in-app notification and (if the device is subscribed) a browser web-push. Great for
            campaigns, announcements, or one-off alerts.
          </Text>

          <View style={[styles.card, { marginTop: spacing.md }]}>
            <Text style={styles.label}>Title</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Weekend Special! 20% off"
              placeholderTextColor={colors.textMuted} maxLength={120} style={styles.input}
              testID="broadcast-title" />

            <Text style={styles.label}>Message</Text>
            <TextInput value={body} onChangeText={setBody} multiline maxLength={500}
              placeholder="Say something engaging..." placeholderTextColor={colors.textMuted}
              style={[styles.input, { minHeight: 100, textAlignVertical: "top" }]}
              testID="broadcast-body" />

            <Text style={styles.label}>Click-through URL (optional)</Text>
            <TextInput value={url} onChangeText={setUrl} placeholder="/customer or /order/abc123"
              placeholderTextColor={colors.textMuted} autoCapitalize="none" style={styles.input}
              testID="broadcast-url" />

            <Text style={[styles.label, { marginTop: spacing.sm }]}>Send To</Text>
            <View style={styles.targetRow}>
              {(["customer", "restaurant_owner", "rider"] as const).map((r) => {
                const meta = ROLE_META[r];
                const on = !!targets[r];
                return (
                  <TouchableOpacity key={r} onPress={() => toggleTarget(r)} activeOpacity={0.85}
                    style={[styles.targetChip, on && { backgroundColor: meta.color + "18", borderColor: meta.color }]}
                    testID={`target-${r}`}
                  >
                    <Ionicons name={meta.icon} size={16} color={on ? meta.color : colors.textSecondary} />
                    <Text style={[styles.targetTxt, on && { color: meta.color }]}>{meta.label}</Text>
                    {on ? <Ionicons name="checkmark-circle" size={16} color={meta.color} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            {lastSend ? (
              <View style={styles.sendResult}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={styles.sendResultTxt}>
                  Sent to {lastSend.recipients} users • {lastSend.sent_inapp} in-app • {lastSend.sent_push} browser push
                </Text>
              </View>
            ) : null}
          </View>

          {confirm ? (
            <View style={styles.confirmCard}>
              <Ionicons name="warning-outline" size={22} color={colors.warning} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.confirmTitle}>Confirm send?</Text>
                <Text style={styles.confirmSub}>
                  This will notify all {chosenRoles().map((r) => ROLE_META[r]?.label || r).join(" + ")} users. Cannot be undone.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setConfirm(false)} style={styles.confirmCancel} testID="broadcast-cancel-confirm">
                <Text style={styles.confirmCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={doSend} disabled={sending} style={styles.confirmSend} testID="broadcast-send-confirm">
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmSendTxt}>Send Now</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.saveBtn, { marginTop: spacing.lg, opacity: (!title || !body || !chosenRoles().length) ? 0.5 : 1 }]}
              disabled={!title || !body || !chosenRoles().length}
              onPress={() => setConfirm(true)}
              activeOpacity={0.9}
              testID="broadcast-send"
            >
              <Ionicons name="send" size={18} color={colors.onPrimary} />
              <Text style={styles.saveTxt}>Send Push Notification</Text>
            </TouchableOpacity>
          )}

          {/* History */}
          <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>RECENT BROADCASTS</Text>
          {!history.length ? (
            <View style={styles.emptyBox}>
              <Ionicons name="megaphone-outline" size={26} color={colors.textMuted} />
              <Text style={styles.emptyTxt}>No manual pushes yet. Send your first campaign above.</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {history.slice(0, 20).map((b) => (
                <View key={b.id} style={styles.historyItem} testID={`history-${b.id}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.hTitle} numberOfLines={1}>{b.title}</Text>
                    <Text style={styles.hBody} numberOfLines={2}>{b.body}</Text>
                    <View style={styles.hRoles}>
                      {b.roles.map((r) => (
                        <View key={r} style={styles.hRoleChip}>
                          <Ionicons name={ROLE_META[r]?.icon || "ellipse-outline"} size={11} color={ROLE_META[r]?.color || colors.textSecondary} />
                          <Text style={[styles.hRoleTxt, { color: ROLE_META[r]?.color || colors.textSecondary }]}>{ROLE_META[r]?.label || r}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={styles.hMeta}>
                      {new Date(b.created_at).toLocaleString()} • {b.recipients} recipients • {b.sent_inapp} in-app · {b.sent_push} push
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabsWrap: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabTxt: { fontSize: 13, fontWeight: font.bold, color: colors.textSecondary },
  sectionLabel: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.6 },
  help: { fontSize: 12, color: colors.textSecondary, marginTop: 6, lineHeight: 18 },
  eventCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, ...shadow.card },
  eventHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  eventTitle: { fontSize: 15, fontWeight: font.bold, color: colors.textPrimary },
  eventKey: { fontSize: 11, color: colors.textMuted, marginTop: 2, fontFamily: "monospace" as any },
  rolesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  roleChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  roleChipTxt: { fontSize: 12, fontWeight: font.semi, color: colors.textSecondary },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 10, ...shadow.card },
  label: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary, letterSpacing: 0.4, marginTop: 4 },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.textPrimary },
  targetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  targetChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  targetTxt: { fontSize: 13, fontWeight: font.bold, color: colors.textSecondary },
  sendResult: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, backgroundColor: "#E7F8EE", padding: 10, borderRadius: radius.md },
  sendResultTxt: { flex: 1, fontSize: 12, fontWeight: font.semi, color: "#166534" },
  confirmCard: { flexDirection: "row", alignItems: "center", marginTop: spacing.lg, backgroundColor: "#FEF6E7", borderWidth: 1, borderColor: "#F59E0B", padding: 12, borderRadius: radius.lg },
  confirmTitle: { fontSize: 14, fontWeight: font.black, color: "#92400E" },
  confirmSub: { fontSize: 12, color: "#92400E", marginTop: 2 },
  confirmCancel: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.surface, marginLeft: 8 },
  confirmCancelTxt: { fontSize: 13, fontWeight: font.bold, color: colors.textSecondary },
  confirmSend: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.primary, marginLeft: 8 },
  confirmSendTxt: { fontSize: 13, fontWeight: font.black, color: colors.onPrimary },
  error: { color: colors.error, fontSize: 13, fontWeight: font.semi, marginTop: spacing.md },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, borderRadius: radius.lg, marginTop: spacing.xl, backgroundColor: colors.primary, ...shadow.lifted },
  saveTxt: { fontSize: 15, fontWeight: font.black, color: colors.onPrimary },
  emptyBox: { alignItems: "center", padding: 24, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginTop: 10, gap: 8 },
  emptyTxt: { fontSize: 13, color: colors.textSecondary, textAlign: "center" },
  historyItem: { flexDirection: "row", gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 12 },
  hTitle: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary },
  hBody: { fontSize: 13, color: colors.textSecondary, marginTop: 3, lineHeight: 18 },
  hRoles: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  hRoleChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  hRoleTxt: { fontSize: 11, fontWeight: font.bold },
  hMeta: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
});
