import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, TextInput, Modal, Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";
import { Button, Empty } from "@/src/components/ui";

export type Variation = { id: string; name: string; price: number; is_available: boolean };

export type VariationApi = {
  list: () => Promise<Variation[]>;
  create: (body: { name: string; price: number; is_available: boolean }) => Promise<any>;
  update: (vid: string, body: Partial<{ name: string; price: number; is_available: boolean }>) => Promise<any>;
  remove: (vid: string) => Promise<any>;
};

const PRESETS = ["Small", "Medium", "Large", "Half", "Full", "Regular"];

export function VariationsEditor({
  visible, itemName, api, onClose,
}: { visible: boolean; itemName: string; api: VariationApi | null; onClose: () => void }) {
  const [vars, setVars] = useState<Variation[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try {
      const list = await api.list();
      setVars(list || []);
    } catch (e: any) {
      setError(e?.message || "Could not load variations");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (visible) { setName(""); setPrice(""); setError(""); load(); }
  }, [visible, load]);

  const add = async () => {
    if (!api) return;
    if (!name.trim()) return setError("Enter a variation name (e.g. Large)");
    const p = parseInt(price, 10);
    if (isNaN(p) || p < 0) return setError("Enter a valid price");
    setSaving(true);
    setError("");
    try {
      await api.create({ name: name.trim(), price: p, is_available: true });
      setName(""); setPrice("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not add");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (v: Variation, val: boolean) => {
    if (!api) return;
    setVars((p) => p.map((x) => (x.id === v.id ? { ...x, is_available: val } : x)));
    try { await api.update(v.id, { is_available: val }); } catch { load(); }
  };

  const remove = async (v: Variation) => {
    if (!api) return;
    setVars((p) => p.filter((x) => x.id !== v.id));
    try { await api.remove(v.id); } catch { load(); }
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Variations</Text>
            <Text style={styles.sub} numberOfLines={1}>{itemName}</Text>
          </View>
          <TouchableOpacity testID="variations-close-btn" onPress={onClose}>
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
          {/* Add form */}
          <View style={styles.addCard}>
            <Text style={styles.label}>ADD VARIATION</Text>
            <View style={styles.presetRow}>
              {PRESETS.map((p) => (
                <TouchableOpacity key={p} testID={`variation-preset-${p.toLowerCase()}`} onPress={() => setName(p)} style={styles.preset}>
                  <Text style={styles.presetText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
              <TextInput
                testID="variation-name-input"
                value={name}
                onChangeText={(t) => { setName(t); setError(""); }}
                placeholder="Name e.g. Large"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { flex: 1.4 }]}
              />
              <TextInput
                testID="variation-price-input"
                value={price}
                onChangeText={(t) => { setPrice(t.replace(/[^0-9]/g, "")); setError(""); }}
                placeholder="₹ Price"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                style={[styles.input, { flex: 1 }]}
              />
            </View>
            {error ? <Text style={styles.err} testID="variation-error">{error}</Text> : null}
            <Button title="Add Variation" icon="add" onPress={add} loading={saving} full style={{ marginTop: spacing.md }} />
          </View>

          <Text style={[styles.label, { marginTop: spacing.lg }]}>CURRENT VARIATIONS ({vars.length})</Text>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
          ) : vars.length === 0 ? (
            <Empty icon="pricetags" title="No variations" subtitle="Add sizes like Small / Medium / Large with their own prices" />
          ) : (
            vars.map((v) => (
              <View key={v.id} style={styles.varRow} testID={`variation-row-${v.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.varName, !v.is_available && { color: colors.textMuted, textDecorationLine: "line-through" }]}>{v.name}</Text>
                  <Text style={styles.varPrice}>₹{v.price}</Text>
                </View>
                <Switch
                  testID={`variation-toggle-${v.id}`}
                  value={v.is_available}
                  onValueChange={(val) => toggle(v, val)}
                  trackColor={{ true: colors.success, false: colors.borderStrong }}
                />
                <TouchableOpacity testID={`variation-delete-${v.id}`} onPress={() => remove(v)} style={styles.delBtn}>
                  <Ionicons name="trash" size={16} color={colors.error} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md },
  title: { fontSize: 20, fontWeight: font.black, color: colors.textPrimary },
  sub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  addCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  label: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preset: { backgroundColor: colors.surfaceAlt, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  presetText: { fontSize: 12, fontWeight: font.semi, color: colors.textSecondary },
  input: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, fontSize: 14, color: colors.textPrimary },
  err: { color: colors.error, fontSize: 12, marginTop: 8 },
  varRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  varName: { fontSize: 15, fontWeight: font.bold, color: colors.textPrimary },
  varPrice: { fontSize: 13, fontWeight: font.semi, color: colors.success, marginTop: 2 },
  delBtn: { width: 34, height: 34, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.error, alignItems: "center", justifyContent: "center" },
});
