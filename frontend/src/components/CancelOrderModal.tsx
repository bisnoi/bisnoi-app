import React, { useEffect, useState } from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, TextInput, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Api } from "@/src/api";

export type CancelActor = "customer" | "restaurant" | "rider" | "admin";

const REASON_CHOICES_BY_ACTOR: Record<CancelActor, string[]> = {
  customer: [
    "Changed my mind",
    "Ordered by mistake",
    "Delivery taking too long",
    "Restaurant not accepting call",
    "Duplicate order",
    "Other",
  ],
  restaurant: [
    "Out of stock",
    "Kitchen too busy",
    "Item unavailable",
    "Delivery area too far",
    "Address unreachable",
    "Other",
  ],
  rider: [
    "Unable to reach customer",
    "Restaurant closed",
    "Vehicle issue",
    "Wrong address",
    "Other",
  ],
  admin: ["Fraudulent order", "Duplicate", "Test order", "System error", "Other"],
};

function inr(n: number): string {
  return `\u20B9${(n || 0).toLocaleString("en-IN")}`;
}

export function CancelOrderModal({
  visible,
  orderId,
  actor,
  onClose,
  onCancelled,
}: {
  visible: boolean;
  orderId: string;
  actor: CancelActor;
  onClose: () => void;
  onCancelled?: (result: any) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<any>(null);
  const [reason, setReason] = useState<string>("");
  const [reasonNote, setReasonNote] = useState<string>("");
  const [genuine, setGenuine] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !orderId) return;
    setError(null);
    setReason("");
    setReasonNote("");
    setLoading(true);
    (async () => {
      try {
        const p: any = await Api.previewCancelOrder(orderId);
        setPreview(p);
      } catch (e: any) {
        setError(e?.message || "Could not load cancellation preview");
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, orderId]);

  const choices = REASON_CHOICES_BY_ACTOR[actor];
  const phase = preview?.phase;
  const rules = preview?.rules_snapshot || {};
  const perf = preview?.restaurant_performance || {};

  const phaseLabel =
    phase === "free_window"
      ? `Within Free-Cancel Window (\u2264${rules.free_cancel_window_seconds || 60}s)`
      : phase === "before_pickup"
      ? "Before Rider Pickup"
      : phase === "after_pickup"
      ? "After Rider Pickup"
      : "Order Finalised";

  const phaseColor =
    phase === "free_window" ? colors.success : phase === "before_pickup" ? colors.warning : colors.error;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const finalReason = [reason, reasonNote].filter(Boolean).join(" — ");
      const result: any = await Api.cancelOrder(orderId, {
        reason: finalReason,
        reason_code: reason || undefined,
        genuine_reason: genuine,
      });
      onCancelled?.(result);
      onClose();
    } catch (e: any) {
      setError(e?.message || "Could not cancel the order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Cancel Order</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : preview?.cancellable === false ? (
            <View style={{ padding: spacing.lg, gap: 8 }}>
              <Text style={{ color: colors.error, fontWeight: font.bold, fontSize: 14 }}>
                This order can no longer be cancelled.
              </Text>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onClose}>
                <Text style={styles.btnGhostTxt}>Close</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 500 }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
              {/* Phase & refund card */}
              <View style={[styles.card, { borderColor: phaseColor + "55" }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={[styles.phaseBadge, { backgroundColor: phaseColor + "22" }]}>
                    <Text style={{ color: phaseColor, fontWeight: font.black, fontSize: 11 }}>
                      {phaseLabel.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={styles.refundRow}>
                  <Text style={styles.refundLabel}>Your refund</Text>
                  <Text style={[styles.refundValue, { color: phaseColor }]}>
                    {inr(preview?.customer_refund_amount || 0)} ({preview?.customer_refund_pct || 0}%)
                  </Text>
                </View>
                {phase === "before_pickup" && (
                  <Text style={styles.refundHint}>
                    Restaurant bears {preview?.restaurant_share_pct || 0}% of the refund (score: {perf.composite_score ?? "—"}).
                  </Text>
                )}
                {phase === "after_pickup" && (
                  <Text style={styles.refundHint}>
                    Refund is not automatic after pickup. Tick "Genuine reason" if you have a valid quality/quantity concern; support will review.
                  </Text>
                )}
                {phase === "free_window" && (
                  <Text style={styles.refundHint}>
                    You are cancelling within the free-cancel window. You will receive a full refund and no penalty applies.
                  </Text>
                )}
              </View>

              {/* Reason chips */}
              <Text style={styles.sectionLabel}>Reason for cancelling</Text>
              <View style={styles.chipsWrap}>
                {choices.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.chip, reason === c && styles.chipActive]}
                    onPress={() => setReason(c)}
                  >
                    <Text style={[styles.chipTxt, reason === c && styles.chipTxtActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Additional notes (optional)</Text>
              <TextInput
                style={styles.textarea}
                multiline
                numberOfLines={3}
                placeholder="Anything else we should know?"
                placeholderTextColor={colors.textMuted}
                value={reasonNote}
                onChangeText={setReasonNote}
              />

              {phase === "after_pickup" && actor === "customer" && (
                <TouchableOpacity
                  style={styles.genuineRow}
                  onPress={() => setGenuine((v) => !v)}
                >
                  <Ionicons
                    name={genuine ? "checkbox" : "square-outline"}
                    size={20}
                    color={genuine ? colors.primary : colors.textMuted}
                  />
                  <Text style={{ color: colors.textPrimary, flex: 1 }}>
                    I have a genuine reason (quality issue, wrong item, etc.) — request refund review.
                  </Text>
                </TouchableOpacity>
              )}

              {!!error && <Text style={{ color: colors.error, fontSize: 13 }}>{error}</Text>}

              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <TouchableOpacity style={[styles.btn, styles.btnGhost, { flex: 1 }]} onPress={onClose}>
                  <Text style={styles.btnGhostTxt}>Keep Order</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={submitting || !reason}
                  style={[styles.btn, styles.btnDanger, { flex: 1, opacity: submitting || !reason ? 0.5 : 1 }]}
                  onPress={submit}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnDangerTxt}>Confirm Cancel</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: Platform.OS === "web" ? "center" : "flex-end" },
  sheet: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderRadius: Platform.OS === "web" ? radius.xl : undefined,
    overflow: "hidden",
    ...shadow.lifted,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 16, fontWeight: font.black, color: colors.textPrimary },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  phaseBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  refundRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 6 },
  refundLabel: { color: colors.textSecondary, fontSize: 13 },
  refundValue: { fontSize: 22, fontWeight: font.black },
  refundHint: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  sectionLabel: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.5, marginTop: spacing.sm },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primarySoft || (colors.primary + "22"), borderColor: colors.primary },
  chipTxt: { fontSize: 12, color: colors.textSecondary, fontWeight: font.bold },
  chipTxtActive: { color: colors.primary },
  textarea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 13,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceAlt,
    minHeight: 70,
    textAlignVertical: "top",
  },
  genuineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: spacing.md,
    backgroundColor: colors.warningSoft || "#FFF4DC",
    borderRadius: radius.md,
  },
  btn: {
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhost: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  btnGhostTxt: { color: colors.textPrimary, fontWeight: font.bold, fontSize: 14 },
  btnDanger: { backgroundColor: colors.error },
  btnDangerTxt: { color: "#fff", fontWeight: font.black, fontSize: 14 },
});
