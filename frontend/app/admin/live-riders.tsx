// Admin -> Live Riders
// -----------------------------------------------------------------------------
// A real-time bird's-eye view of every currently ONLINE rider. Uses the
// existing `/admin/riders?status=online` endpoint (each row already carries
// `last_lat`, `last_lng`, `last_heartbeat_at`) and re-polls every 5 seconds.
// The map (GoogleMapView) smoothly interpolates each rider marker between
// polls thanks to its per-key animateTo() helper — so the pins visibly glide
// as riders move.
// -----------------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { AdminHeader } from "@/src/components/AdminHeader";
import { GoogleMapView, type MarkerInput } from "@/src/components/GoogleMapView";

type Rider = {
  id: string;
  name?: string;
  phone?: string;
  account_id?: string;
  vehicle_number?: string;
  vehicle_type?: string;
  rider_verified?: boolean | null;
  is_online_live?: boolean;
  toggled_online?: boolean;
  last_heartbeat_at?: string;
  last_lat?: number;
  last_lng?: number;
  stats?: { total?: number; delivered?: number; active?: number; avg_rating?: number | null };
};

const POLL_MS = 5000;

// Distinct pin colours so multiple riders don't blur into one blob on the map.
// Cycled by index — we assign a stable colour to each rider id.
const PIN_PALETTE = ["16A34A", "2563EB", "D97706", "DB2777", "9333EA", "0891B2", "DC2626", "059669"];
function colorFor(id: string, idx: number): string {
  // Prefer stable hash of id so same rider always gets same colour across polls.
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PIN_PALETTE[h % PIN_PALETTE.length] || PIN_PALETTE[idx % PIN_PALETTE.length];
}

// "3m ago" style relative-time formatter for last-heartbeat.
function agoLabel(iso?: string): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const secs = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export default function AdminLiveRiders() {
  const router = useRouter();
  const [rows, setRows] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // re-render every second so "3m ago" ticks
  const pollTimer = useRef<any>(null);
  const clockTimer = useRef<any>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setError("");
      const data = await Api.adminRiders({ status: "online" });
      const list = Array.isArray(data) ? (data as Rider[]) : [];
      // Only keep riders that ACTUALLY have live coordinates (a heartbeat
      // without GPS isn't useful on the map).
      setRows(list);
    } catch (e: any) {
      if (!silent) setError(e?.message || "Failed to load online riders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Focus effect: kick off the first load + start / stop the polling timer.
  useFocusEffect(useCallback(() => {
    setLoading(true);
    load();
    if (autoRefresh) {
      pollTimer.current = setInterval(() => load(true), POLL_MS);
    }
    // Tick every second for "N s ago" freshness UI.
    clockTimer.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (clockTimer.current) clearInterval(clockTimer.current);
      pollTimer.current = null;
      clockTimer.current = null;
    };
  }, [load, autoRefresh]));

  const onRefresh = () => { setRefreshing(true); load(); };
  const toggleAuto = () => {
    setAutoRefresh((v) => {
      const next = !v;
      if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
      if (next) pollTimer.current = setInterval(() => load(true), POLL_MS);
      return next;
    });
  };

  // Riders WITH live GPS -> map markers.
  const gpsRiders = useMemo(
    () => rows.filter((r) => typeof r.last_lat === "number" && typeof r.last_lng === "number"),
    [rows],
  );
  // Everything else -> "online but no GPS yet" list.
  const noGpsRiders = useMemo(
    () => rows.filter((r) => !(typeof r.last_lat === "number" && typeof r.last_lng === "number")),
    [rows],
  );

  const markers: MarkerInput[] = useMemo(() => (
    gpsRiders.map((r, idx) => {
      // Prefer BIKE / VEHICLE NUMBER as the pin label so admin instantly knows
      // which vehicle is where. Fall back to phone → generic id when a rider
      // hasn't filled the KYC number yet.
      const veh = (r.vehicle_number || "").trim();
      const label = veh
        ? veh.toUpperCase()
        : (r.phone || r.name || `Rider ${idx + 1}`);
      return {
        key: `rider-${r.id}`,
        lat: r.last_lat as number,
        lng: r.last_lng as number,
        label,
        color: colorFor(r.id, idx),
        icon: "rider" as const,
      };
    })
  ), [gpsRiders]);

  // KPIs
  const kpi = {
    total: rows.length,
    withGps: gpsRiders.length,
    stale: rows.filter((r) => {
      const t = r.last_heartbeat_at ? Date.parse(r.last_heartbeat_at) : NaN;
      return Number.isFinite(t) && (Date.now() - t) / 1000 > 90;
    }).length,
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AdminHeader
        title="Live Riders"
        subtitle={`${kpi.withGps} on map • ${kpi.total} online • auto-refresh ${autoRefresh ? "ON" : "OFF"}`}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* ---------- MAP FIRST (top-of-page, tall) ---------- */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
          {markers.length > 0 ? (
            <GoogleMapView
              height={460}
              markers={markers}
              showPath={false}
              interactive
            />
          ) : (
            <View style={styles.emptyMap}>
              <Ionicons name="location-outline" size={36} color={colors.textSecondary} />
              <Text style={styles.emptyTxt}>
                {loading ? "Loading online riders…" : "No online rider has shared their GPS yet."}
              </Text>
              <Text style={styles.emptySub}>
                Riders start sharing their location every 30s once they toggle{" "}
                <Text style={{ fontWeight: font.black, color: colors.primary }}>ONLINE</Text> in the rider app.
              </Text>
            </View>
          )}
          {!!error && (
            <View style={styles.errBar}>
              <Ionicons name="alert-circle" size={14} color={colors.error} />
              <Text style={styles.errTxt}>{error}</Text>
            </View>
          )}
        </View>

        {/* ---------- Controls (below map) ---------- */}
        <View style={styles.controls}>
          <View style={styles.kpiRow}>
            <View style={[styles.kpiChip, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}>
              <Ionicons name="bicycle" size={14} color={colors.primary} />
              <Text style={[styles.kpiTxt, { color: colors.primary }]}>{kpi.total} ONLINE</Text>
            </View>
            <View style={[styles.kpiChip, { backgroundColor: "#EFF6FF", borderColor: "#3B82F6" }]}>
              <Ionicons name="locate" size={14} color="#2563EB" />
              <Text style={[styles.kpiTxt, { color: "#1D4ED8" }]}>{kpi.withGps} WITH GPS</Text>
            </View>
            {kpi.stale > 0 ? (
              <View style={[styles.kpiChip, { backgroundColor: "#FFF7ED", borderColor: "#F97316" }]}>
                <Ionicons name="time-outline" size={14} color="#C2410C" />
                <Text style={[styles.kpiTxt, { color: "#C2410C" }]}>{kpi.stale} STALE</Text>
              </View>
            ) : null}
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              testID="live-riders-toggle-auto"
              onPress={toggleAuto}
              activeOpacity={0.85}
              style={[styles.autoBtn, { backgroundColor: autoRefresh ? colors.primary : colors.surface, borderColor: autoRefresh ? colors.primary : colors.border }]}
            >
              <Ionicons name={autoRefresh ? "pause" : "play"} size={14} color={autoRefresh ? colors.onPrimary : colors.textPrimary} />
              <Text style={{ color: autoRefresh ? colors.onPrimary : colors.textPrimary, fontWeight: font.bold, fontSize: 12 }}>
                {autoRefresh ? "PAUSE" : "RESUME"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity testID="live-riders-manual-refresh" onPress={() => load()} activeOpacity={0.85} style={styles.iconBtn}>
              <Ionicons name="refresh" size={16} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ---------- LIVE LIST (below map + controls) ---------- */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <View style={styles.sectionHead}>
            <Ionicons name="pulse" size={14} color={colors.primary} />
            <Text style={styles.sectionTitle}>ONLINE RIDERS</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.sectionCount}>{rows.length}</Text>
          </View>

          {loading && rows.length === 0 ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
          ) : rows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="cafe-outline" size={26} color={colors.textSecondary} />
              <Text style={styles.emptyTxt}>No riders are online right now.</Text>
            </View>
          ) : (
            rows.map((r, idx) => {
              const veh = (r.vehicle_number || "").trim().toUpperCase();
              return (
                <TouchableOpacity
                  key={r.id}
                  testID={`live-rider-${r.id}`}
                  activeOpacity={0.85}
                  style={[
                    styles.card,
                    selected === r.id && { borderColor: colors.primary, backgroundColor: colors.primarySoft },
                  ]}
                  onPress={() => {
                    setSelected(r.id);
                    router.push({ pathname: "/admin/riders", params: { rid: r.id } } as any);
                  }}
                >
                  <View style={[styles.avatar, { backgroundColor: `#${colorFor(r.id, idx)}` }]}>
                    <Ionicons name="bicycle" size={18} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Text style={styles.rName} numberOfLines={1}>{r.name || r.phone || "Rider"}</Text>
                      {r.rider_verified ? (
                        <Ionicons name="checkmark-circle" size={13} color={colors.primary} />
                      ) : null}
                      {veh ? (
                        <View style={styles.vehChip}>
                          <Ionicons name="car-sport" size={11} color={colors.onPrimary} />
                          <Text style={styles.vehChipTxt}>{veh}</Text>
                        </View>
                      ) : (
                        <View style={[styles.vehChip, { backgroundColor: "#E5E7EB" }]}>
                          <Text style={[styles.vehChipTxt, { color: "#6B7280" }]}>NO BIKE №</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.rMeta} numberOfLines={1}>
                      {r.phone || r.account_id || r.id.slice(0, 8)} • last ping {agoLabel(r.last_heartbeat_at)}
                      {tick ? "" : ""}
                    </Text>
                    <Text style={styles.rGps} numberOfLines={1}>
                      {typeof r.last_lat === "number" && typeof r.last_lng === "number"
                        ? `GPS ${r.last_lat.toFixed(5)}, ${r.last_lng.toFixed(5)}`
                        : "GPS not shared yet"}
                    </Text>
                  </View>
                  <View style={styles.trailing}>
                    {r.stats?.active ? (
                      <View style={styles.activePill}>
                        <Text style={styles.activePillTxt}>{r.stats.active} ACTIVE</Text>
                      </View>
                    ) : null}
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          {noGpsRiders.length > 0 && (
            <Text style={styles.hint}>
              <Ionicons name="information-circle" size={12} color={colors.textSecondary} />{" "}
              {noGpsRiders.length} online rider(s) have not shared GPS yet — they show in the list but
              not on the map.
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  controls: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
  kpiRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  kpiChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1,
  },
  kpiTxt: { fontSize: 11, fontWeight: font.black, letterSpacing: 0.3 },
  autoBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.md, borderWidth: 1,
  },
  iconBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },

  emptyMap: {
    height: 260, borderRadius: radius.lg,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: 6,
  },
  emptyBox: {
    padding: spacing.lg, alignItems: "center", gap: 6,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  emptyTxt: { color: colors.textSecondary, fontSize: 13, textAlign: "center" },
  emptySub: { color: colors.textSecondary, fontSize: 11, textAlign: "center" },

  errBar: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 6, paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: "#FEF2F2", borderColor: "#FCA5A5", borderWidth: 1,
    borderRadius: radius.sm,
  },
  errTxt: { color: colors.error, fontSize: 12, fontWeight: font.semi },

  sectionHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  sectionTitle: { fontSize: 12, fontWeight: font.black, color: colors.textPrimary, letterSpacing: 0.4 },
  sectionCount: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary },

  card: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 12, marginBottom: 8,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, ...shadow.card,
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center",
  },
  rName: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary, flexShrink: 1 },
  rMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  rGps: { fontSize: 11, color: colors.textSecondary, marginTop: 1, fontFamily: Platform.OS === "web" ? "monospace" : undefined },
  vehChip: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: colors.primary,
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 6,
  },
  vehChipTxt: {
    color: colors.onPrimary,
    fontSize: 10, fontWeight: font.black, letterSpacing: 0.5,
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  trailing: { alignItems: "flex-end", gap: 4 },
  activePill: {
    backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 999,
  },
  activePillTxt: { color: colors.onPrimary, fontSize: 10, fontWeight: font.black, letterSpacing: 0.4 },

  hint: { fontSize: 11, color: colors.textSecondary, marginTop: 8, textAlign: "center" },
});
