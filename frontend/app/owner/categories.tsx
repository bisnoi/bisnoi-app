import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal, ActivityIndicator, Switch, Platform, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Card, Empty, Button } from "@/src/components/ui";
import { Screen, ScreenHeader } from "@/src/components/ScreenHeader";

type Cat = { id: string; name: string; parent_id?: string | null; is_enabled?: boolean };

export default function OwnerCategories() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; parent?: Cat | null }>({ open: false });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setCats(((await Api.ownerCategories()) as Cat[]) || []); }
    catch (e: any) { console.warn(e?.message); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const parents = cats.filter((c) => !c.parent_id);
  const childrenOf = (pid: string) => cats.filter((c) => c.parent_id === pid);

  const openAdd = (parent?: Cat | null) => { setModal({ open: true, parent: parent || null }); setName(""); };

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await Api.ownerCreateCategory({ name: name.trim(), parent_id: modal.parent?.id || null });
      setModal({ open: false }); setName("");
      await load();
    } catch (e: any) { if (Platform.OS === "web") window.alert(e?.message); }
    finally { setBusy(false); }
  };

  const toggle = async (c: Cat) => { try { await Api.ownerUpdateCategory(c.id, { is_enabled: !(c.is_enabled !== false) }); await load(); } catch (e: any) {} };

  const del = (c: Cat) => {
    const isParent = !c.parent_id;
    const doDelete = async () => { try { await Api.ownerDeleteCategory(c.id); await load(); } catch (e: any) { if (Platform.OS === "web") window.alert(e?.message); } };
    if (Platform.OS === "web") { if (window.confirm(`Delete "${c.name}"?${isParent ? " Its subcategories will also be removed." : ""}`)) doDelete(); }
    else Alert.alert("Delete category?", `Delete "${c.name}"?${isParent ? " Its subcategories will also be removed." : ""}`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: doDelete }]);
  };

  return (
    <Screen>
      <ScreenHeader title="Categories" subtitle="Organise your menu with categories & subcategories"
        right={<TouchableOpacity testID="add-category" onPress={() => openAdd(null)} style={styles.addBtn}><Ionicons name="add" size={20} color={colors.onPrimary} /></TouchableOpacity>} />
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
          {parents.length === 0 ? (
            <Empty icon="albums-outline" title="No categories yet" subtitle="Create a category, then add subcategories and menu items under it." />
          ) : parents.map((p) => (
            <Card key={p.id} style={{ marginBottom: spacing.md }}>
              <View style={styles.catHead}>
                <View style={[styles.catIc, { backgroundColor: colors.primarySoft }]}><Ionicons name="albums" size={18} color={colors.primary} /></View>
                <Text style={styles.catName}>{p.name}</Text>
                <Switch value={p.is_enabled !== false} onValueChange={() => toggle(p)} trackColor={{ true: colors.primary, false: colors.borderStrong }} />
                <TouchableOpacity onPress={() => del(p)} hitSlop={8} style={{ marginLeft: 6 }}><Ionicons name="trash" size={18} color={colors.error} /></TouchableOpacity>
              </View>
              {childrenOf(p.id).map((s) => (
                <View key={s.id} style={styles.subRow}>
                  <Ionicons name="return-down-forward" size={15} color={colors.textMuted} />
                  <Text style={styles.subName}>{s.name}</Text>
                  <TouchableOpacity onPress={() => del(s)} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity testID={`add-sub-${p.id}`} onPress={() => openAdd(p)} style={styles.addSub}>
                <Ionicons name="add" size={15} color={colors.primary} />
                <Text style={styles.addSubTxt}>Add subcategory</Text>
              </TouchableOpacity>
            </Card>
          ))}
        </ScrollView>
      )}

      <Modal visible={modal.open} transparent animationType="fade" onRequestClose={() => setModal({ open: false })}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.mTitle}>{modal.parent ? `Add subcategory in "${modal.parent.name}"` : "Add Category"}</Text>
            <TextInput testID="category-name" value={name} onChangeText={setName} placeholder={modal.parent ? "Subcategory name" : "Category name"} placeholderTextColor={colors.textMuted} style={styles.input} autoFocus />
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <View style={{ flex: 1 }}><Button title="Cancel" variant="ghost" onPress={() => setModal({ open: false })} full /></View>
              <View style={{ flex: 1 }}><Button title="Save" icon="checkmark" onPress={save} loading={busy} full /></View>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  catHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  catIc: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  catName: { flex: 1, fontSize: 16, fontWeight: font.black, color: colors.textPrimary },
  subRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingLeft: 8, marginTop: 6, borderTopWidth: 1, borderTopColor: colors.border },
  subName: { flex: 1, fontSize: 14, color: colors.textPrimary, fontWeight: font.semi },
  addSub: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10, alignSelf: "flex-start" },
  addSubTxt: { fontSize: 13, fontWeight: font.bold, color: colors.primary },
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: { width: "100%", maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg },
  mTitle: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary, marginBottom: spacing.md },
  input: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, height: 48, fontSize: 15, color: colors.textPrimary },
});
