import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { colors, radius, spacing, font } from "@/src/theme";

// Lightweight, fully in-app confirmation overlay (works on web + native; testable).
export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!visible) return null;
  return (
    <View style={styles.overlay} testID="confirm-modal">
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onCancel} />
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        {!!message && <Text style={styles.message}>{message}</Text>}
        <View style={styles.row}>
          <TouchableOpacity testID="confirm-cancel" style={[styles.btn, styles.cancel]} activeOpacity={0.85} onPress={onCancel}>
            <Text style={styles.cancelTxt}>{cancelLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="confirm-ok"
            style={[styles.btn, { backgroundColor: destructive ? colors.error : colors.primary }]}
            activeOpacity={0.85}
            onPress={onConfirm}
          >
            <Text style={[styles.okTxt, { color: destructive ? "#fff" : colors.onPrimary }]}>{confirmLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...(Platform.OS === "web" ? ({ position: "fixed" } as object) : {}),
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    zIndex: 9999,
  } as any,
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: 8,
  },
  title: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary },
  message: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  row: { flexDirection: "row", gap: 10, marginTop: spacing.lg },
  btn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: radius.md },
  cancel: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderStrong },
  cancelTxt: { fontWeight: font.bold, color: colors.textPrimary, fontSize: 14 },
  okTxt: { fontWeight: font.black, fontSize: 14 },
});
