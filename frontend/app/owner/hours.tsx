import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSmartBack } from "@/src/utils/nav";
import { Api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { Screen, ScreenHeader } from "@/src/components/ScreenHeader";
import { Button } from "@/src/components/ui";
import { TimeInput, isValidTime12, time12To24, time24To12 } from "@/src/components/form";

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

// State keeps values in the 12-hour "hh:mm AM/PM" shape so the input can render
// them directly. We convert to/from 24-hour "HH:MM" only at the storage boundary.
type Hour = { day: string; open: string; close: string; closed: boolean };

const DEFAULT: Hour[] = DAYS.map((d) => ({ day: d.key, open: "09:00 AM", close: "11:00 PM", closed: false }));

export default function OwnerHours() {
  const router = useRouter();
  const goBack = useSmartBack();
  const [hours, setHours] = useState<Hour[]>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const r: any = await Api.ownerMyRestaurant();
      const oh: Hour[] = (r?.operating_hours || []) as Hour[];
      const merged = DAYS.map((d) => {
        const found = oh.find((h) => (h.day || "").toLowerCase().startsWith(d.key));
        const openRaw = found?.open || "09:00";
        const closeRaw = found?.close || "23:00";
        // Server stores 24-hour; input renders 12-hour. Fall back to the raw
        // value if the string is already in 12-hour format (older records).
        return {
          day: d.key,
          open: /AM|PM/i.test(openRaw) ? openRaw : (time24To12(openRaw) || "09:00 AM"),
          close: /AM|PM/i.test(closeRaw) ? closeRaw : (time24To12(closeRaw) || "11:00 PM"),
          closed: !!found?.closed,
        };
      });
      setHours(merged);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const update = (idx: number, patch: Partial<Hour>) => {
    setHours((prev) => prev.map((h, i) => (i === idx ? { ...h, ...patch } : h)));
    setSaved(false);
  };

  const applyToAll = () => {
    const m = hours[0];
    setHours(hours.map((h) => ({ ...h, open: m.open, close: m.close, closed: m.closed })));
    setSaved(false);
  };

  const save = async () => {
    setError("");
    // validate
    for (const h of hours) {
      if (!h.closed && (!isValidTime12(h.open) || !isValidTime12(h.close))) {
        setError(`Enter valid times (HH:MM AM/PM) for ${h.day.toUpperCase()}`);
        return;
      }
    }
    setSaving(true);
    try {
      // Persist as 24-hour "HH:MM" so downstream consumers keep working.
      const payload = hours.map((h) => ({
        day: h.day,
        open: h.closed ? h.open : time12To24(h.open),
        close: h.closed ? h.close : time12To24(h.close),
        closed: h.closed,
      }));
      await Api.ownerSetAvailability({ operating_hours: payload });
      setSaved(true);
      setTimeout(goBack, 700);
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Opening Hours" subtitle="Set your weekly schedule" />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}>
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={18} color={colors.primary} />
            <Text style={styles.infoText}>
              Outside these hours your restaurant shows as “Closed” and customers can’t place orders (even when you’re Online).
            </Text>
          </View>

          <TouchableOpacity testID="apply-all-btn" onPress={applyToAll} style={styles.applyAll} activeOpacity={0.8}>
            <Ionicons name="copy-outline" size={15} color={colors.primary} />
            <Text style={styles.applyAllText}>Apply Monday’s timings to all days</Text>
          </TouchableOpacity>

          {hours.map((h, idx) => (
            <View key={h.day} style={styles.dayCard} testID={`day-row-${h.day}`}>
              <View style={styles.dayHead}>
                <Text style={styles.dayName}>{DAYS[idx].label}</Text>
                <TouchableOpacity
                  testID={`toggle-closed-${h.day}`}
                  onPress={() => update(idx, { closed: !h.closed })}
                  style={[styles.pill, { backgroundColor: h.closed ? colors.errorSoft : colors.successSoft, borderColor: h.closed ? colors.error : colors.success }]}
                  activeOpacity={0.8}
                >
                  <View style={[styles.pillDot, { backgroundColor: h.closed ? colors.error : colors.success }]} />
                  <Text style={[styles.pillText, { color: h.closed ? colors.error : colors.success }]}>
                    {h.closed ? "Closed" : "Open"}
                  </Text>
                </TouchableOpacity>
              </View>
              {!h.closed ? (
                <View style={styles.timeCol}>
                  <View>
                    <Text style={styles.timeLabel}>Opens</Text>
                    <TimeInput
                      testID={`open-${h.day}`}
                      value={h.open}
                      onChangeText={(v) => update(idx, { open: v })}
                    />
                  </View>
                  <View>
                    <Text style={styles.timeLabel}>Closes</Text>
                    <TimeInput
                      testID={`close-${h.day}`}
                      value={h.close}
                      onChangeText={(v) => update(idx, { close: v })}
                    />
                  </View>
                </View>
              ) : (
                <Text style={styles.closedHint}>Restaurant is closed all day</Text>
              )}
            </View>
          ))}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {saved ? <Text style={styles.savedMsg}>✓ Hours saved</Text> : null}
        </ScrollView>
      )}
      <View style={styles.footer}>
        <Button testID="save-hours-btn" title={saving ? "Saving..." : "Save Hours"} onPress={save} loading={saving} full />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  infoBox: { flexDirection: "row", gap: 8, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: 12, marginBottom: spacing.md },
  infoText: { flex: 1, fontSize: 12, color: colors.textSecondary, fontWeight: font.med, lineHeight: 17 },
  applyAll: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginBottom: spacing.md },
  applyAllText: { fontSize: 12, fontWeight: font.bold, color: colors.primary },
  dayCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  dayHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayName: { fontSize: 15, fontWeight: font.black, color: colors.textPrimary },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1 },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 12, fontWeight: font.bold },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: spacing.md },
  timeCol: { marginTop: spacing.md, gap: 2 },
  timeField: { flex: 1 },
  timeLabel: { fontSize: 11, fontWeight: font.semi, color: colors.textSecondary, marginBottom: 4 },
  timeInput: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, fontWeight: font.bold, color: colors.textPrimary, textAlign: "center" },
  closedHint: { fontSize: 12, color: colors.textMuted, marginTop: 10, fontStyle: "italic" },
  error: { color: colors.error, fontSize: 13, fontWeight: font.semi, marginTop: 10, textAlign: "center" },
  savedMsg: { color: colors.success, fontSize: 14, fontWeight: font.bold, marginTop: 10, textAlign: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
});
