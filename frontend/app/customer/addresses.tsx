import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { Button, Empty } from "@/src/components/ui";
import { Api } from "@/src/api";

type Address = { id: string; label: string; line1: string; city?: string; phone?: string; is_default?: boolean };
const LABELS = ["Home", "Work", "Other"] as const;

export default function Addresses() {
  const [list, setList] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState<string>("Home");
  const [line, setLine] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const l: any = await Api.myAddresses();
      setList(Array.isArray(l) ? l : []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const add = async () => {
    if (!line.trim()) return;
    setSaving(true);
    setError("");
    try {
      await Api.addAddress({ label, line1: line.trim(), city: city.trim(), phone: phone.trim() });
      setLine(""); setCity(""); setPhone(""); setLabel("Home"); setOpen(false);
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not save address");
    } finally {
      setSaving(false);
    }
  };
  const remove = async (id: string) => {
    try { await Api.deleteAddress(id); } catch {}
    setList((p) => p.filter((a) => a.id !== id));
  };
  const makeDefault = async (id: string) => {
    try { await Api.setDefaultAddress(id); } catch {}
    setList((p) => p.map((a) => ({ ...a, is_default: a.id === id })));
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScreenHeader title="Saved Addresses" subtitle="Synced to your account — select at checkout" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 112 }}>
        {!open && (
          <Button title="Add New Address" icon="add" onPress={() => setOpen(true)} full testID="add-address" />
        )}
        {open && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>New Address</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              {LABELS.map((l) => (
                <TouchableOpacity key={l} onPress={() => setLabel(l)} style={[styles.tag, label === l && styles.tagActive]}>
                  <Text style={{ color: label === l ? colors.onPrimary : colors.textSecondary, fontWeight: font.semi, fontSize: 13 }}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput testID="address-line" value={line} onChangeText={setLine} placeholder="Flat / House no, Street, Area" placeholderTextColor={colors.textMuted} style={styles.input} multiline />
            <TextInput value={city} onChangeText={setCity} placeholder="City" placeholderTextColor={colors.textMuted} style={styles.input} />
            <TextInput testID="address-phone" value={phone} onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, "").slice(0, 10))} placeholder="Contact phone (optional)" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" style={styles.input} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <View style={{ flex: 1 }}><Button title="Cancel" variant="secondary" onPress={() => setOpen(false)} full /></View>
              <View style={{ flex: 1 }}><Button title={saving ? "Saving..." : "Save"} icon="checkmark" onPress={add} disabled={saving} full testID="save-address" /></View>
            </View>
          </View>
        )}
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
        ) : list.length === 0 && !open ? (
          <Empty icon="location-outline" title="No saved addresses" subtitle="Add an address for faster checkout" />
        ) : (
          list.map((a) => (
            <View key={a.id} style={styles.row}>
              <View style={styles.icBox}><Ionicons name={a.label === "Work" ? "briefcase" : a.label === "Home" ? "home" : "location"} size={20} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={styles.label}>{a.label}</Text>
                  {a.is_default && <View style={styles.defaultPill}><Text style={styles.defaultTxt}>DEFAULT</Text></View>}
                </View>
                <Text style={styles.line} numberOfLines={2}>{a.line1}{a.city ? `, ${a.city}` : ""}</Text>
                {!!a.phone && <Text style={styles.phone}>+91 {a.phone}</Text>}
                <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
                  {!a.is_default && <TouchableOpacity onPress={() => makeDefault(a.id)}><Text style={styles.link}>Set default</Text></TouchableOpacity>}
                  <TouchableOpacity testID={`del-address-${a.id}`} onPress={() => remove(a.id)}><Text style={[styles.link, { color: colors.error }]}>Delete</Text></TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  form: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: 10, ...shadow.card },
  formTitle: { fontSize: 16, fontWeight: font.black, color: colors.textPrimary },
  tag: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  tagActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, padding: 12, fontSize: 14, color: colors.textPrimary },
  error: { color: colors.error, fontSize: 13, fontWeight: font.semi },
  row: { flexDirection: "row", gap: 12, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  icBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 15, fontWeight: font.bold, color: colors.textPrimary },
  line: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  phone: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  link: { fontSize: 13, fontWeight: font.bold, color: colors.primary },
  defaultPill: { backgroundColor: colors.successSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  defaultTxt: { color: colors.success, fontSize: 9, fontWeight: font.black, letterSpacing: 0.5 },
});
