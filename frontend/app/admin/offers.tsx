import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal, ActivityIndicator, Switch, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Card, Empty, Button } from "@/src/components/ui";
import { AdminHeader } from "@/src/components/AdminHeader";

export default function AdminOffers() {
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<any>({ title: "", type: "percent", value: "", max_discount: "", min_order: "", code: "", description: "" });

  const load = useCallback(async () => {
    try { setOffers(((await Api.adminOffers()) as any[]) || []); } catch (e: any) { console.warn(e?.message); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const set = (k: string) => (v: string) => setF((p: any) => ({ ...p, [k]: v }));

  const create = async () => {
    if (!f.title.trim() || !f.value) { if (Platform.OS === "web") window.alert("Title and value required"); return; }
    setBusy(true);
    try {
      await Api.adminCreateOffer({
        title: f.title.trim(), type: f.type, value: parseFloat(f.value),
        max_discount: f.max_discount ? parseFloat(f.max_discount) : null,
        min_order: f.min_order ? parseFloat(f.min_order) : 0,
        code: f.code.trim() || null, description: f.description.trim() || null, active: true,
      });
      setModal(false); setF({ title: "", type: "percent", value: "", max_discount: "", min_order: "", code: "", description: "" });
      await load();
    } catch (e: any) { if (Platform.OS === "web") window.alert(e?.message); }
    finally { setBusy(false); }
  };

  const toggleActive = async (o: any) => { try { await Api.adminUpdateOffer(o.id, { active: !o.active }); await load(); } catch (e: any) {} };
  const del = async (o: any) => { if (Platform.OS === "web" && !window.confirm(`Delete "${o.title}"?`)) return; try { await Api.adminDeleteOffer(o.id); await load(); } catch (e: any) {} };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <AdminHeader title="Offers" subtitle="Create offers for restaurants to apply" />
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
        <Button title="Create Offer" icon="add" onPress={() => setModal(true)} full />
      </View>
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
          {offers.length === 0 ? <Empty icon="pricetag-outline" title="No offers yet" subtitle="Create your first offer." /> : offers.map((o) => (
            <Card key={o.id} style={{ marginBottom: spacing.sm, opacity: o.active ? 1 : 0.6 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                <View style={styles.tagIc}><Ionicons name="pricetag" size={16} color={colors.onPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{o.title}</Text>
                  <Text style={styles.sub}>{o.code} • {o.type === "percent" ? `${o.value}%${o.max_discount ? ` up to ₹${o.max_discount}` : ""}` : `₹${o.value} off`}{o.min_order ? ` • Min ₹${o.min_order}` : ""}</Text>
                </View>
                <Switch value={!!o.active} onValueChange={() => toggleActive(o)} trackColor={{ true: colors.primary, false: colors.borderStrong }} />
              </View>
              <View style={styles.rowBtns}>
                <TouchableOpacity onPress={() => del(o)} style={styles.delBtn}><Ionicons name="trash" size={15} color={colors.error} /><Text style={styles.delTxt}>Delete</Text></TouchableOpacity>
              </View>
            </Card>
          ))}
        </ScrollView>
      )}

      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
              <Text style={styles.mTitle}>Create Offer</Text>
              <Text style={styles.label}>Title</Text>
              <TextInput value={f.title} onChangeText={set("title")} placeholder="60% OFF up to ₹120" placeholderTextColor={colors.textMuted} style={styles.input} />
              <Text style={styles.label}>Type</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm }}>
                {["percent", "flat"].map((t) => (
                  <TouchableOpacity key={t} onPress={() => set("type")(t)} style={[styles.seg, f.type === t && styles.segOn]}>
                    <Text style={[styles.segTxt, f.type === t && styles.segTxtOn]}>{t === "percent" ? "% Percent" : "₹ Flat"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>{f.type === "percent" ? "Discount %" : "Flat amount ₹"}</Text>
              <TextInput value={f.value} onChangeText={set("value")} keyboardType="numeric" placeholder="60" placeholderTextColor={colors.textMuted} style={styles.input} />
              {f.type === "percent" ? (<><Text style={styles.label}>Max discount ₹ (optional)</Text><TextInput value={f.max_discount} onChangeText={set("max_discount")} keyboardType="numeric" placeholder="120" placeholderTextColor={colors.textMuted} style={styles.input} /></>) : null}
              <Text style={styles.label}>Min order ₹ (optional)</Text>
              <TextInput value={f.min_order} onChangeText={set("min_order")} keyboardType="numeric" placeholder="199" placeholderTextColor={colors.textMuted} style={styles.input} />
              <Text style={styles.label}>Code (optional)</Text>
              <TextInput value={f.code} onChangeText={set("code")} autoCapitalize="characters" placeholder="WELCOME60" placeholderTextColor={colors.textMuted} style={styles.input} />
              <Text style={styles.label}>Description (optional)</Text>
              <TextInput value={f.description} onChangeText={set("description")} placeholder="Short description" placeholderTextColor={colors.textMuted} style={styles.input} />
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                <View style={{ flex: 1 }}><Button title="Cancel" variant="ghost" onPress={() => setModal(false)} full /></View>
                <View style={{ flex: 1 }}><Button title="Create" icon="checkmark" onPress={create} loading={busy} full /></View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tagIc: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontWeight: font.black, color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  rowBtns: { flexDirection: "row", justifyContent: "flex-end", marginTop: spacing.sm },
  delBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  delTxt: { fontSize: 12, fontWeight: font.bold, color: colors.error },
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: { width: "100%", maxWidth: 460, maxHeight: "88%", backgroundColor: colors.surface, borderRadius: radius.xl },
  mTitle: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary, marginBottom: spacing.md },
  label: { fontSize: 12, fontWeight: font.semi, color: colors.textSecondary, marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, height: 46, fontSize: 14, color: colors.textPrimary },
  seg: { flex: 1, height: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  segOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  segTxt: { fontSize: 13, fontWeight: font.bold, color: colors.textSecondary },
  segTxtOn: { color: colors.onPrimary },
});
