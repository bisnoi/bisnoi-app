import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, shadow } from "@/src/theme";

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
  "Ladakh", "Lakshadweep", "Puducherry",
];

export function StatePicker({
  visible, value, onClose, onSelect,
}: {
  visible: boolean;
  value: string;
  onClose: () => void;
  onSelect: (state: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return INDIAN_STATES;
    return INDIAN_STATES.filter((st) => st.toLowerCase().includes(s));
  }, [q]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="chevron-down" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Select state</Text>
            <View style={{ width: 36 }} />
          </View>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search state..."
            placeholderTextColor={colors.textMuted}
            style={styles.search}
            autoFocus
          />
          <FlatList
            data={filtered}
            keyExtractor={(s) => s}
            style={{ maxHeight: 420 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const active = item === value;
              return (
                <TouchableOpacity
                  style={[styles.row, active && { backgroundColor: colors.primarySoft }]}
                  onPress={() => { onSelect(item); onClose(); }}
                >
                  <Text style={[styles.rowTxt, active && { color: colors.primary, fontWeight: font.black }]}>{item}</Text>
                  {active && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={<Text style={styles.empty}>No states match "{q}"</Text>}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, maxHeight: "80%",
    alignSelf: "center", width: "100%", maxWidth: 560,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: spacing.sm },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: font.black, color: colors.textPrimary },
  search: {
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: colors.textPrimary,
    backgroundColor: colors.surface, marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 13, paddingHorizontal: spacing.sm, borderRadius: radius.md,
  },
  rowTxt: { fontSize: 14, color: colors.textPrimary, fontWeight: font.semi },
  empty: { textAlign: "center", color: colors.textMuted, padding: spacing.lg, fontSize: 13 },
});
