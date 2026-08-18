import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch,
  ActivityIndicator, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ScreenHeader, Screen } from "@/src/components/ScreenHeader";
import { StaffModal } from "@/app/owner/staff";

type ModuleDef = { key: string; label: string; description: string; icon: any };
type Preset = { label: string; permissions: string[] };
type StaffRow = {
  id: string; name: string; phone: string;
  staff_label?: string; permissions: string[];
  active: boolean; created_at: string;
};

export default function AdminStaff() {
  const [list, setList] = useState<StaffRow[]>([]);
  const [modules, setModules] = useState<ModuleDef[]>([]);
  const [presets, setPresets] = useState<Record<string, Preset>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r: any = await Api.adminListStaff();
      setList((r?.staff as StaffRow[]) || []);
      setModules((r?.modules as ModuleDef[]) || []);
      setPresets((r?.presets as Record<string, Preset>) || {});
    } catch (e: any) {
      if ((e?.message || "").includes("Only the account owner")) {
        Alert.alert("Access denied", "Only a super-admin can manage admin staff.");
        router.back();
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (s: StaffRow) => { setEditing(s); setModalOpen(true); };

  const deleteStaff = (s: StaffRow) => {
    Alert.alert("Remove admin staff?", `${s.name} will lose all admin access immediately.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          try { await Api.adminDeleteStaff(s.id); load(); }
          catch (e: any) { Alert.alert("Failed", e?.message || "Could not remove"); }
        },
      },
    ]);
  };

  const toggleActive = async (s: StaffRow) => {
    try { await Api.adminUpdateStaff(s.id, { active: !s.active }); load(); }
    catch (e: any) { Alert.alert("Failed", e?.message || "Could not update"); }
  };

  return (
    <Screen>
      <ScreenHeader
        title="Admin Staff"
        subtitle="Delegate admin panel access with per-module permissions"
        right={
          <TouchableOpacity onPress={openCreate} style={styles.addBtn} activeOpacity={0.85} testID="admin-staff-add">
            <Ionicons name="add" size={18} color={colors.onPrimary} />
            <Text style={styles.addBtnTxt}>Add Admin</Text>
          </TouchableOpacity>
        }
      />

      {loading ? (
        <View style={{ padding: 40, alignItems: "center" }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          {!list.length ? (
            <View style={styles.emptyBox}>
              <Ionicons name="shield-checkmark-outline" size={38} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No admin staff yet</Text>
              <Text style={styles.emptySub}>
                Add support agents, content managers, finance staff, or operations. Each gets scoped access — only the
                modules you grant, everything else stays hidden and locked at the backend.
              </Text>
              <TouchableOpacity onPress={openCreate} style={[styles.addBtn, { marginTop: 14 }]} activeOpacity={0.85}>
                <Ionicons name="add" size={18} color={colors.onPrimary} />
                <Text style={styles.addBtnTxt}>Add First Admin</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {list.map((s) => (
                <View key={s.id} style={[styles.card, !s.active && { opacity: 0.55 }]} testID={`admin-staff-row-${s.id}`}>
                  <View style={styles.cardTop}>
                    <View style={styles.avatar}><Text style={styles.avatarTxt}>{(s.name || "?").charAt(0).toUpperCase()}</Text></View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={styles.name}>{s.name}</Text>
                        {s.staff_label ? <View style={styles.roleBadge}><Text style={styles.roleBadgeTxt}>{s.staff_label}</Text></View> : null}
                        {!s.active ? <View style={styles.inactiveBadge}><Text style={styles.inactiveTxt}>DISABLED</Text></View> : null}
                      </View>
                      <Text style={styles.phone}>{s.phone}</Text>
                    </View>
                    <Switch value={s.active} onValueChange={() => toggleActive(s)}
                      trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor="#fff"
                      testID={`admin-staff-toggle-${s.id}`} />
                  </View>
                  <View style={styles.permsRow}>
                    {s.permissions.length ? s.permissions.map((p) => {
                      const m = modules.find((x) => x.key === p);
                      return (
                        <View key={p} style={styles.permChip}>
                          <Ionicons name={(m?.icon as any) || "checkmark-circle-outline"} size={12} color={colors.primary} />
                          <Text style={styles.permChipTxt}>{m?.label || p}</Text>
                        </View>
                      );
                    }) : <Text style={styles.emptyPerms}>No modules granted</Text>}
                  </View>
                  <View style={styles.cardActions}>
                    <TouchableOpacity onPress={() => openEdit(s)} style={styles.actionBtn} testID={`admin-staff-edit-${s.id}`}>
                      <Ionicons name="create-outline" size={16} color={colors.textPrimary} />
                      <Text style={styles.actionTxt}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteStaff(s)} style={[styles.actionBtn, { borderColor: colors.error + "44" }]} testID={`admin-staff-delete-${s.id}`}>
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                      <Text style={[styles.actionTxt, { color: colors.error }]}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <StaffModal
        visible={modalOpen}
        editing={editing as any}
        modules={modules}
        presets={presets}
        panel="admin"
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); load(); }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, ...shadow.card },
  addBtnTxt: { fontSize: 13, fontWeight: font.black, color: colors.onPrimary },
  emptyBox: { alignItems: "center", padding: 32, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: font.black, color: colors.textPrimary, marginTop: 8 },
  emptySub: { fontSize: 13, color: colors.textSecondary, textAlign: "center", lineHeight: 19 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 12, ...shadow.card, gap: 10 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: colors.primary, fontWeight: font.black, fontSize: 16 },
  name: { fontSize: 15, fontWeight: font.bold, color: colors.textPrimary },
  phone: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  roleBadge: { backgroundColor: colors.primarySoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  roleBadgeTxt: { fontSize: 10, fontWeight: font.black, color: colors.primary, letterSpacing: 0.4 },
  inactiveBadge: { backgroundColor: colors.error + "22", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  inactiveTxt: { fontSize: 10, fontWeight: font.black, color: colors.error, letterSpacing: 0.4 },
  permsRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  permChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.primarySoft, borderRadius: 999 },
  permChipTxt: { fontSize: 11, fontWeight: font.semi, color: colors.primary },
  emptyPerms: { fontSize: 12, color: colors.textMuted, fontStyle: "italic" },
  cardActions: { flexDirection: "row", gap: 8 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.background },
  actionTxt: { fontSize: 12, fontWeight: font.bold, color: colors.textPrimary },
});
