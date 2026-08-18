import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, RefreshControl, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { Empty, Pill } from "@/src/components/ui";
import { AdminHeader } from "@/src/components/AdminHeader";

// ---- Types ----
type LogRow = {
  id: string; ts: string;
  actor_id?: string; actor_name?: string; actor_role?: string; actor_phone?: string;
  method: string; path: string; action: string; status?: number;
  ip?: string; ua?: string;
};

const ROLE_FILTERS = [
  { key: "all", label: "All" },
  { key: "admin", label: "Admin" },
  { key: "restaurant_owner", label: "Owner" },
  { key: "rider", label: "Rider" },
  { key: "customer", label: "Customer" },
  { key: "admin_staff", label: "Admin Staff" },
  { key: "restaurant_staff", label: "Restaurant Staff" },
  { key: "guest", label: "Guest" },
];

const METHOD_FILTERS = [
  { key: "all", label: "All" },
  { key: "POST", label: "POST" },
  { key: "PATCH", label: "PATCH" },
  { key: "PUT", label: "PUT" },
  { key: "DELETE", label: "DELETE" },
];

const RANGE_OPTS = [
  { key: 0, label: "All time" },
  { key: 1, label: "Last 1h" },
  { key: 6, label: "Last 6h" },
  { key: 24, label: "Last 24h" },
  { key: 168, label: "Last 7d" },
];

// -----------------------------------------------------------------------

export default function AdminActivityLogs() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [role, setRole] = useState("all");
  const [method, setMethod] = useState("all");
  const [range, setRange] = useState(24);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const data = (await Api.adminLogs({
        role, method, q,
        since_hours: range || undefined,
        limit: 300,
      })) as LogRow[];
      setLogs(data || []);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [role, method, q, range]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const grouped = useMemo(() => {
    // Group by date string (today, yesterday, older-YYYY-MM-DD)
    const g: Record<string, LogRow[]> = {};
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    logs.forEach((l) => {
      const d = new Date(l.ts).toDateString();
      const key = d === today ? "Today" : d === yesterday ? "Yesterday" : d;
      (g[key] ||= []).push(l);
    });
    return g;
  }, [logs]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AdminHeader title="Activity Logs" subtitle={`${logs.length} entries`} />

      {/* Search */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          testID="admin-logs-search"
          value={q}
          onChangeText={setQ}
          onSubmitEditing={load}
          placeholder="Search actor, phone, path or action"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {q.length > 0 && (
          <TouchableOpacity onPress={() => { setQ(""); load(); }} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter rows */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {ROLE_FILTERS.map((f) => (
          <Pill key={f.key} label={f.label} active={role === f.key} onPress={() => setRole(f.key)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {METHOD_FILTERS.map((f) => (
          <Pill key={f.key} label={f.label} active={method === f.key} onPress={() => setMethod(f.key)} />
        ))}
        <View style={{ width: 8 }} />
        {RANGE_OPTS.map((f) => (
          <Pill key={f.key} label={f.label} active={range === f.key} onPress={() => setRange(f.key)} />
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : logs.length === 0 ? (
          <Empty icon="reader-outline" title="No activity yet" subtitle="Try changing filters or wait for new actions" />
        ) : (
          Object.entries(grouped).map(([day, items]) => (
            <View key={day} style={{ marginBottom: spacing.lg }}>
              <Text style={styles.dayHead}>{day}  ·  {items.length} events</Text>
              {items.map((l) => <LogRowCard key={l.id} l={l} />)}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function LogRowCard({ l }: { l: LogRow }) {
  const [expanded, setExpanded] = useState(false);
  const roleAccent = roleColor(l.actor_role);
  const status = l.status || 0;
  const ok = status >= 200 && status < 300;
  const time = new Date(l.ts);
  const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <TouchableOpacity
      testID={`admin-log-${l.id}`}
      activeOpacity={0.85}
      onPress={() => setExpanded(!expanded)}
      style={styles.logCard}
    >
      <View style={styles.logHeader}>
        <View style={[styles.methodPill, { backgroundColor: methodColor(l.method) + "22" }]}>
          <Text style={{ color: methodColor(l.method), fontSize: 10, fontWeight: font.black }}>{l.method}</Text>
        </View>
        <Text style={styles.logPath} numberOfLines={1}>{l.path}</Text>
        <View style={[styles.statusPill, { backgroundColor: (ok ? colors.success : colors.error) + "22" }]}>
          <Text style={{ color: ok ? colors.success : colors.error, fontSize: 10, fontWeight: font.black }}>{status || "—"}</Text>
        </View>
      </View>
      <View style={styles.logBody}>
        <View style={[styles.actorDot, { backgroundColor: roleAccent }]}>
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: font.black }}>{(l.actor_name || "?")[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.actor}>
            {l.actor_name || "Anonymous"}
            <Text style={{ color: colors.textMuted, fontWeight: font.med }}>  ·  </Text>
            <Text style={{ color: roleAccent, fontWeight: font.black }}>
              {(l.actor_role || "guest").toUpperCase()}
            </Text>
            {l.actor_phone ? <Text style={{ color: colors.textMuted }}>  ·  +91 {l.actor_phone}</Text> : null}
          </Text>
          <Text style={styles.timeStr}>{timeStr}</Text>
        </View>
      </View>
      {expanded ? (
        <View style={styles.logDetails}>
          <DetailKV k="Action" v={l.action} />
          <DetailKV k="Status" v={String(l.status)} />
          <DetailKV k="Actor ID" v={l.actor_id || "—"} />
          <DetailKV k="IP" v={l.ip || "—"} />
          <DetailKV k="User Agent" v={(l.ua || "").slice(0, 80) + ((l.ua || "").length > 80 ? "…" : "")} />
          <DetailKV k="Time (UTC)" v={l.ts} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function DetailKV({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvK}>{k}</Text>
      <Text style={styles.kvV} selectable>{v}</Text>
    </View>
  );
}

function roleColor(role?: string) {
  switch (role) {
    case "admin":
    case "admin_staff":
      return colors.error;
    case "restaurant_owner":
    case "restaurant_staff":
      return colors.primary;
    case "rider":
      return colors.warning;
    case "customer":
      return colors.info || colors.primary;
    default:
      return colors.textMuted;
  }
}

function methodColor(m: string) {
  if (m === "POST") return colors.success;
  if (m === "PATCH" || m === "PUT") return colors.warning;
  if (m === "DELETE") return colors.error;
  return colors.textSecondary;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: spacing.lg, marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, paddingVertical: Platform.OS === "ios" ? 12 : 8, fontSize: 14, color: colors.textPrimary },
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, gap: 8, alignItems: "center" },

  dayHead: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: spacing.sm },

  logCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 8,
    padding: 10,
  },
  logHeader: {
    flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6,
  },
  methodPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, minWidth: 55, alignItems: "center" },
  logPath: { flex: 1, fontSize: 12, color: colors.textPrimary, fontWeight: font.semi, fontFamily: Platform.OS === "web" ? "ui-monospace, Menlo, monospace" : undefined },
  statusPill: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999, minWidth: 38, alignItems: "center" },

  logBody: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  actorDot: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  actor: { fontSize: 12, color: colors.textPrimary, fontWeight: font.semi },
  timeStr: { fontSize: 10, color: colors.textMuted, marginTop: 1 },

  logDetails: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 4 },
  kv: { flexDirection: "row", gap: 8 },
  kvK: { width: 90, fontSize: 11, color: colors.textSecondary, fontWeight: font.bold },
  kvV: { flex: 1, fontSize: 11, color: colors.textPrimary, fontFamily: Platform.OS === "web" ? "ui-monospace, Menlo, monospace" : undefined },
});
