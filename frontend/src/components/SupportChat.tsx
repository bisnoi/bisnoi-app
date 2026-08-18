import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  ActivityIndicator, Platform, useWindowDimensions, KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, font, shadow } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { Api } from "@/src/api";
import { getSocket, joinRoom, leaveRoom } from "@/src/socket";
import { subscribeOpenChat } from "@/src/chatControl";

type Msg = { id: string; session_id: string; sender: string; sender_name: string; text: string; created_at: string };
type Session = { id: string; status: string; admin_name?: string | null };

const STATUS_LABEL: Record<string, string> = {
  bot: "AI Assistant",
  waiting_admin: "Connecting to an agent…",
  admin_joined: "Live with a support agent",
  closed: "Chat closed",
};

export default function SupportChat() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1000;

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const idsRef = useRef<Set<string>>(new Set());
  const sessionIdRef = useRef<string | null>(null);

  const mergeMessages = useCallback((incoming: Msg[]) => {
    setMessages((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) map.set(m.id, m);
      const arr = Array.from(map.values()).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      idsRef.current = new Set(arr.map((m) => m.id));
      return arr;
    });
  }, []);

  const ensureSession = useCallback(async () => {
    setLoading(true);
    try {
      const res = await Api.chatSession();
      setSession(res.session);
      sessionIdRef.current = res.session.id;
      idsRef.current = new Set();
      mergeMessages(res.messages || []);
      // realtime
      joinRoom(`chat:${res.session.id}`);
      const s = getSocket();
      if (s) {
        s.off("chat_message");
        s.off("chat_status");
        s.on("chat_message", (msg: Msg) => {
          if (msg.session_id === sessionIdRef.current && !idsRef.current.has(msg.id)) {
            mergeMessages([msg]);
          }
        });
        s.on("chat_status", (p: any) => {
          if (p.session_id === sessionIdRef.current) {
            setSession((prev) => (prev ? { ...prev, status: p.status, admin_name: p.admin_name ?? prev.admin_name } : prev));
          }
        });
      }
    } catch (e) {
      // surface a friendly inline error
      mergeMessages([{ id: "err", session_id: "x", sender: "system", sender_name: "System", text: "Chat load nahi ho payi. Please dobara try karein.", created_at: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  }, [mergeMessages]);

  useEffect(() => {
    if (open && !session) ensureSession();
  }, [open, session, ensureSession]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages, open]);

  // The floating FAB was removed — the chat is now opened from a "Chat with us"
  // button inside the Profile / Help section. Subscribe to those open requests.
  useEffect(() => subscribeOpenChat(() => setOpen(true)), []);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    try {
      const res = await Api.chatSend(text, sessionIdRef.current || undefined);
      setSession(res.session);
      sessionIdRef.current = res.session.id;
      mergeMessages(res.messages || []);
    } catch (e: any) {
      mergeMessages([{ id: `e-${Date.now()}`, session_id: "x", sender: "system", sender_name: "System", text: "Message bhej nahi paye. Try again.", created_at: new Date().toISOString() }]);
    } finally {
      setSending(false);
    }
  };

  const talkToHuman = async () => {
    setSending(true);
    try {
      const res = await Api.chatEscalate(sessionIdRef.current || undefined);
      setSession(res.session);
      mergeMessages(res.messages || []);
    } finally {
      setSending(false);
    }
  };

  // ---- Closed state ----
  // The global floating chat button has been removed. The chat panel is now
  // launched from a "Chat with us" entry inside the Profile / Help section
  // (see openSupportChat()). When closed we render nothing.
  // Guard placed AFTER all hooks so the rules-of-hooks are never violated.
  if (!user || user.role === "admin") return null;
  if (!open) return null;

  // ---- Panel (open state) ----
  const panelWidth = isDesktop ? 380 : Math.min(width - 24, 420);
  const panelHeight = isDesktop ? 560 : Math.min(560, 600);
  const status = session?.status || "bot";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.panelWrap, { bottom: isDesktop ? 24 : 16, width: panelWidth, height: panelHeight }]}
    >
      <View testID="support-panel" style={styles.panel}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="sparkles" size={18} color={colors.onPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Bisnoi Support</Text>
            <Text style={styles.headerStatus} numberOfLines={1}>
              {status === "admin_joined" && session?.admin_name ? `Agent: ${session.admin_name}` : STATUS_LABEL[status] || ""}
            </Text>
          </View>
          <TouchableOpacity testID="support-close" onPress={() => setOpen(false)} hitSlop={10} style={styles.closeBtn}>
            <Ionicons name="chevron-down" size={22} color={colors.onPrimary} />
          </TouchableOpacity>
        </View>

        {/* Status strip when waiting */}
        {status === "waiting_admin" ? (
          <View style={[styles.strip, { backgroundColor: colors.warningSoft }]}>
            <ActivityIndicator size="small" color={colors.warning} />
            <Text style={[styles.stripText, { color: colors.warning }]}>Aapko ek support agent se connect kiya ja raha hai…</Text>
          </View>
        ) : null}

        {/* Messages */}
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, gap: 10 }}>
            {messages.map((m, i) => <Bubble key={m.id || i} msg={m} index={i} />)}
            {sending && status === "bot" ? (
              <View style={[styles.bubble, styles.bubbleBot]}>
                <Text style={styles.botTyping}>typing…</Text>
              </View>
            ) : null}
          </ScrollView>
        )}

        {/* Talk to human */}
        {status === "bot" ? (
          <TouchableOpacity testID="support-talk-human" onPress={talkToHuman} style={styles.humanBtn} activeOpacity={0.85}>
            <Ionicons name="headset" size={15} color={colors.primary} />
            <Text style={styles.humanBtnText}>Talk to a human</Text>
          </TouchableOpacity>
        ) : null}

        {/* Composer */}
        <View style={styles.composer}>
          <TextInput
            testID="support-input"
            value={input}
            onChangeText={setInput}
            placeholder={status === "closed" ? "Start a new message…" : "Type your message…"}
            placeholderTextColor={colors.textMuted}
            style={styles.composerInput}
            multiline
            onSubmitEditing={send}
            blurOnSubmit={false}
            editable={!sending}
          />
          <TouchableOpacity testID="support-send" onPress={send} disabled={sending || !input.trim()} style={[styles.sendBtn, { opacity: input.trim() && !sending ? 1 : 0.5 }]}>
            <Ionicons name="send" size={18} color={colors.onPrimary} />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ msg, index }: { msg: Msg; index: number }) {
  if (msg.sender === "system") {
    return (
      <View testID={`support-message-${index}`} style={styles.systemWrap}>
        <Text style={styles.systemText}>{msg.text}</Text>
      </View>
    );
  }
  const isUser = msg.sender === "user";
  const isAdmin = msg.sender === "admin";
  return (
    <View testID={`support-message-${index}`} style={{ alignItems: isUser ? "flex-end" : "flex-start" }}>
      {!isUser ? (
        <Text style={styles.senderName}>{isAdmin ? `${msg.sender_name} • Support` : "Bisnoi Assistant"}</Text>
      ) : null}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : isAdmin ? styles.bubbleAdmin : styles.bubbleBot]}>
        <Text style={[styles.bubbleText, isUser && { color: colors.onPrimary }]}>{msg.text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute", right: 16, width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
    ...shadow.card, zIndex: 9000,
  } as any,
  panelWrap: { position: "absolute", right: 16, zIndex: 9000 } as any,
  panel: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: "hidden",
    borderWidth: 1, borderColor: colors.border, ...shadow.card,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: 12 },
  headerIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.onPrimary, fontWeight: font.black, fontSize: 15 },
  headerStatus: { color: colors.onPrimary, opacity: 0.85, fontSize: 11, marginTop: 1 },
  closeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  strip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.md, paddingVertical: 8 },
  stripText: { fontSize: 12, fontWeight: font.semi, flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  bubble: { maxWidth: "86%", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14 },
  bubbleUser: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleBot: { backgroundColor: colors.surfaceAlt, borderBottomLeftRadius: 4 },
  bubbleAdmin: { backgroundColor: colors.successSoft, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.success },
  bubbleText: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  botTyping: { fontSize: 13, color: colors.textSecondary, fontStyle: "italic" },
  senderName: { fontSize: 10, color: colors.textMuted, marginBottom: 2, marginLeft: 4, fontWeight: font.semi },
  systemWrap: { alignItems: "center", paddingVertical: 4 },
  systemText: { fontSize: 11.5, color: colors.textSecondary, textAlign: "center", backgroundColor: colors.surfaceAlt, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, overflow: "hidden", maxWidth: "92%" },
  humanBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.primarySoft },
  humanBtnText: { color: colors.primary, fontWeight: font.bold, fontSize: 13 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  composerInput: { flex: 1, maxHeight: 100, minHeight: 42, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.textPrimary },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
});
