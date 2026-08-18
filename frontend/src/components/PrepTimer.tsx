import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, font } from "@/src/theme";
import { playPrepTimeout, primeAudio } from "@/src/utils/ring";

type Props = {
  /** ISO timestamp when preparation started (e.g. status → preparing). */
  startedAt?: string | null;
  /** Estimated preparation time in minutes. */
  prepMin?: number | null;
  /** Optional testID for the outer container. */
  testID?: string;
  /** Optional compact variant (single-line). Defaults to false. */
  compact?: boolean;
};

const DEFAULT_PREP = 15;

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/**
 * Restaurant-side preparation countdown timer.
 *
 * - Runs GREEN while the order is within its allotted prep time — shows the
 *   remaining time (MM:SS) counting down.
 * - The moment the window expires, a short beep sound plays (once) and the
 *   timer flips to RED, counting up (+MM:SS) to indicate how late the order is.
 */
export default function PrepTimer({ startedAt, prepMin, testID, compact }: Props) {
  const started = startedAt ? new Date(startedAt).getTime() : Date.now();
  const targetMin = Math.max(1, Math.round(prepMin || DEFAULT_PREP));
  const totalSec = targetMin * 60;
  const [now, setNow] = useState<number>(Date.now());
  const beepedRef = useRef<boolean>(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSec = Math.max(0, Math.floor((now - started) / 1000));
  const overdue = elapsedSec >= totalSec;

  useEffect(() => {
    if (overdue && !beepedRef.current) {
      beepedRef.current = true;
      // Prime once (audio contexts on the web often need a user gesture; the
      // owner-alert engine primes on first interaction). This is a no-op if
      // already unlocked, and completely silent on unsupported platforms.
      try { primeAudio(); } catch { /* ignore */ }
      try { playPrepTimeout(); } catch { /* ignore */ }
    }
  }, [overdue]);

  const remaining = totalSec - elapsedSec;
  const over = elapsedSec - totalSec;

  const bg = overdue ? "#FEE2E2" : "#DCFCE7";      // soft red vs soft green
  const fg = overdue ? "#B91C1C" : "#15803D";      // deep red vs deep green
  const border = overdue ? "#FCA5A5" : "#86EFAC";
  const icon = overdue ? "alarm" : "hourglass";
  const label = overdue ? "OVERDUE" : "PREP TIME";
  const value = overdue ? `+${fmt(over)}` : fmt(remaining);

  return (
    <View
      testID={testID || "prep-timer"}
      style={[
        styles.wrap,
        { backgroundColor: bg, borderColor: border },
        compact && styles.wrapCompact,
      ]}
    >
      <Ionicons name={icon as any} size={compact ? 13 : 15} color={fg} />
      <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.value, { color: fg }]}
        numberOfLines={1}
        testID={`${testID || "prep-timer"}-value`}
      >
        {value}
      </Text>
      {!compact ? (
        <Text style={[styles.hint, { color: fg }]} numberOfLines={1}>
          / {targetMin}m
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  wrapCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: font.black,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  value: {
    fontSize: 13,
    fontWeight: font.black,
    letterSpacing: 0.5,
    fontVariant: ["tabular-nums"],
  } as any,
  hint: {
    fontSize: 11,
    fontWeight: font.bold,
    opacity: 0.75,
  },
});
