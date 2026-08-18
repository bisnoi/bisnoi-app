import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, useWindowDimensions,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ScreenHeader, Screen } from "@/src/components/ScreenHeader";
import { Empty } from "@/src/components/ui";
import { getSocket, joinRoom } from "@/src/socket";

type Session = {
  id: string; user_name: string; user_phone?: string; role: string; status: string;
  admin_name?: string | null; last_message?: string | null; updated_at?: string;
};
type Msg = { id: string; sender: string; sender_name: string; text: string; created_at: string };

const FILTERS = [
  { key: "waiting_admin", label: "Waiting" },
  { key: "admin_joined", label: "Active" },
  { key: "", label: "All" },
];
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  waiting_admin: { label: "Waiting", color: colors.warning, bg: colors.warningSoft },
  admin_joined: { label: "Live", color: colors.success, bg: colors.successSoft },
  bot: { label: "Bot", color: colors.textSecondary, bg: colors.surfaceAlt },
  closed: { label: "Closed", color: colors.textMuted, bg: colors.surfaceAlt },
};

export default function AdminSupport() {
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const [filter, setFilter] = useState("waiting_admin");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [waiting, setWaiting] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const selectedIdRef = useRef<string | null>(null);
  const idsRef = useRef<Set<string>>(new Set());

  const loadSessions = useCallback(async () => {
    try {
      const r: any = await Api.adminChatSessions(filter || undefined);
      setSessions(r.sessions || []);
      setWaiting(r.waiting || 0);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => { setLoading(true); loadSessions(); }, [loadSessions]));

  // Poll + realtime lobby refresh
  useEffect(() => {
    const t = setInterval(loadSessions, 6000);
    joinRoom("admin_support");
    const s = getSocket();
    if (s) {
      s.off("support_event");
      s.on("support_event", () => loadSessions());
    }
    return () => clearInterval(t);
  }, [loadSessions]);

  const mergeMessages = useCallback((incoming: Msg[]) => {
    setMessages((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) map.set(m.id, m);
      const arr = Array.from(map.values()).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      idsRef.current = new Set(arr.map((m) => m.id));
      return arr;
    });
  }, []);

  const openSession = useCallback(async (s: Session) => {
    setSelected(s);
    selectedIdRef.current = s.id;
    setMsgLoading(true);
    idsRef.current = new Set();
    setMessages([]);
    try {
      const r: any = await Api.adminChatMessages(s.id);
      setSelected(r.session);
      mergeMessages(r.messages || []);
      joinRoom(`chat:${s.id}`);
      const sock = getSocket();
      if (sock) {
        sock.off("chat_message");
        sock.off("chat_status");
        sock.on("chat_message", (m: any) => {
          if (m.session_id === selectedIdRef.current && !idsRef.current.has(m.id)) mergeMessages([m]);
        });
        sock.on("chat_status", (p: any) => {
          if (p.session_id === selectedIdRef.current) setSelected((prev) => (prev ? { ...prev, status: p.status } : prev));
        });
      }
    } finally {
      setMsgLoading(false);
    }
  }, [mergeMessages]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages]);

  const join = async () => {
    if (!selected) return;
    const r: any = await Api.adminJoinChat(selected.id);
    setSelected(r.session);
    mergeMessages(r.messages || []);
    loadSessions();
  };

  const send = async () => {
    const text = input.trim();
    if (!text || !selected || sending) return;
    setInput("");
    setSending(true);
    try {
      const r: any = await Api.adminChatSend(selected.id, text);
      mergeMessages(r.messages || []);
      loadSessions();
    } finally {
      setSending(false);
    }
  };

  const closeChat = async () => {
    if (!selected) return;
    await Api.adminCloseChat(selected.id);
    setSelected((p) => (p ? { ...p, status: "closed" } : p));
    loadSessions();
  };

  const List = (
    <View style={[styles.listCol, isWide && { width: 340, borderRightWidth: 1, borderRightColor: colors.border }]}>
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f.key || "all"} testID={`support-filter-${f.label.toLowerCase()}`} onPress={() => { setFilter(f.key); setLoading(true); }} style={[styles.filterPill, filter === f.key && styles.filterActive]}>
            <Text style={[styles.filterText, filter === f.key && { color: colors.onPrimary }]}>{f.label}</Text>
            {f.key === "waiting_admin" && waiting > 0 ? <View style={styles.waitDot}><Text style={styles.waitDotText}>{waiting}</Text></View> : null}
          </TouchableOpacity>
        ))}
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : sessions.length === 0 ? (
        <Empty icon="chatbubbles" title="No chats" subtitle="No support conversations in this view." />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {sessions.map((s) => {
            const meta = STATUS_META[s.status] || STATUS_META.bot;
            const active = selected?.id === s.id;
            return (
              <TouchableOpacity key={s.id} testID={`support-session-${s.id}`} onPress={() => openSession(s)} activeOpacity={0.85} style={[styles.sessionRow, active && { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}>
                <View style={styles.sessionAvatar}><Text style={styles.sessionAvatarText}>{(s.user_name || "U")[0].toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={styles.sessionName} numberOfLines={1}>{s.user_name}</Text>
                    <View style={[styles.statusPill, { backgroundColor: meta.bg }]}><Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text></View>
                  </View>
                  <Text style={styles.sessionRole}>{s.role}</Text>
                  <Text style={styles.sessionLast} numberOfLines={1}>{s.last_message || "—"}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  const Detail = (
    <View style={styles.detailCol}>
      {!selected ? (
        <Empty icon="chatbox-ellipses" title="Select a chat" subtitle="Pick a conversation to view and reply live." />
      ) : (
        <>
          <View style={styles.detailHead}>
            {!isWide ? (
              <TouchableOpacity testID="support-back-list" onPress={() => setSelected(null)} style={styles.backMini}><Ionicons name="arrow-back" size={20} color={colors.textPrimary} /></TouchableOpacity>
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.detailName}>{selected.user_name} <Text style={styles.detailRole}>· {selected.role}</Text></Text>
              <Text style={styles.detailSub}>{selected.user_phone || ""} · {STATUS_META[selected.status]?.label}</Text>
            </View>
            {selected.status !== "closed" ? (
              <TouchableOpacity testID="support-close-chat" onPress={closeChat} style={styles.closeChatBtn}><Ionicons name="checkmark-done" size={16} color={colors.textSecondary} /><Text style={styles.closeChatText}>Close</Text></TouchableOpacity>
            ) : null}
          </View>

          {msgLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
          ) : (
            <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, gap: 10 }}>
              {messages.map((m, i) => <AdminBubble key={m.id || i} msg={m} />)}
            </ScrollView>
          )}

          {selected.status === "closed" ? (
            <View style={styles.closedBar}><Text style={styles.closedText}>This chat is closed.</Text></View>
          ) : selected.status !== "admin_joined" ? (
            <TouchableOpacity testID="support-join" onPress={join} style={styles.joinBtn} activeOpacity={0.9}>
              <Ionicons name="enter" size={18} color={colors.onPrimary} />
              <Text style={styles.joinText}>Join chat & reply</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.composer}>
              <TextInput testID="support-admin-input" value={input} onChangeText={setInput} placeholder="Reply to customer…" placeholderTextColor={colors.textMuted} style={styles.composerInput} multiline onSubmitEditing={send} blurOnSubmit={false} />
              <TouchableOpacity testID="support-admin-send" onPress={send} disabled={sending || !input.trim()} style={[styles.sendBtn, { opacity: input.trim() && !sending ? 1 : 0.5 }]}><Ionicons name="send" size={18} color={colors.onPrimary} /></TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );

  return (
    <Screen>
      <ScreenHeader title="Support Chat" subtitle="Live conversations with customers, owners & riders" />
      <View style={{ flex: 1, flexDirection: isWide ? "row" : "column" }}>
        {isWide ? (<>{List}{Detail}</>) : (selected ? Detail : List)}
      </View>
    </Screen>
  );
}

function AdminBubble({ msg }: { msg: Msg }) {
  if (msg.sender === "system") {
    return <View style={{ alignItems: "center" }}><Text style={styles.systemText}>{msg.text}</Text></View>;
  }
  const isUser = msg.sender === "user";
  const isBot = msg.sender === "bot";
  // From the admin's view, the customer's messages are on the LEFT, agent/bot on RIGHT.
  return (
    <View style={{ alignItems: isUser ? "flex-start" : "flex-end" }}>
      <Text style={styles.senderName}>{isUser ? msg.sender_name : isBot ? "AI Assistant" : `${msg.sender_name} (you)`}</Text>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : isBot ? styles.bubbleBot : styles.bubbleAdmin]}>
        <Text style={[styles.bubbleText, !isUser && !isBot && { color: colors.onPrimary }]}>{msg.text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  listCol: { flex: 1, backgroundColor: colors.background },
  filterRow: { flexDirection: "row", gap: 8, padding: spacing.md },
  filterPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 13, fontWeight: font.bold, color: colors.textSecondary },
  waitDot: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: colors.error, alignItems: "center", justifyContent: "center" },
  waitDotText: { color: "#fff", fontSize: 10, fontWeight: font.black },
  sessionRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: spacing.md, marginHorizontal: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  sessionAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  sessionAvatarText: { color: colors.primary, fontWeight: font.black, fontSize: 16 },
  sessionName: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary, flex: 1, marginRight: 6 },
  sessionRole: { fontSize: 11, color: colors.textSecondary, textTransform: "capitalize", marginTop: 1 },
  sessionLast: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  statusPillText: { fontSize: 10, fontWeight: font.black, textTransform: "uppercase", letterSpacing: 0.3 },

  detailCol: { flex: 1, backgroundColor: colors.surface },
  detailHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  backMini: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  detailName: { fontSize: 16, fontWeight: font.black, color: colors.textPrimary },
  detailRole: { fontSize: 13, fontWeight: font.semi, color: colors.textSecondary, textTransform: "capitalize" },
  detailSub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  closeChatBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  closeChatText: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary },

  bubble: { maxWidth: "82%", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14 },
  bubbleUser: { backgroundColor: colors.surfaceAlt, borderBottomLeftRadius: 4 },
  bubbleBot: { backgroundColor: colors.primarySoft, borderBottomRightRadius: 4 },
  bubbleAdmin: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  senderName: { fontSize: 10, color: colors.textMuted, marginBottom: 2, marginHorizontal: 4, fontWeight: font.semi },
  systemText: { fontSize: 11.5, color: colors.textSecondary, textAlign: "center", backgroundColor: colors.surfaceAlt, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, overflow: "hidden" },

  joinBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, margin: spacing.md, borderRadius: radius.lg, backgroundColor: colors.primary, ...shadow.card },
  joinText: { color: colors.onPrimary, fontWeight: font.black, fontSize: 15 },
  closedBar: { padding: spacing.md, alignItems: "center", borderTopWidth: 1, borderTopColor: colors.border },
  closedText: { color: colors.textSecondary, fontSize: 13, fontWeight: font.semi },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border },
  composerInput: { flex: 1, maxHeight: 110, minHeight: 44, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.textPrimary },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
});
