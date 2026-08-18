import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch,
  ActivityIndicator, Alert, Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ScreenHeader, Screen } from "@/src/components/ScreenHeader";

type ModuleDef = { key: string; label: string; description: string; icon: any };
type Preset = { label: string; permissions: string[] };
type StaffRow = {
  id: string; name: string; phone: string;
  staff_label?: string; permissions: string[];
  active: boolean; created_at: string;
  restaurant_name?: string;
};

export default function OwnerStaff() {
  const [list, setList] = useState<StaffRow[]>([]);
  const [modules, setModules] = useState<ModuleDef[]>([]);
  const [presets, setPresets] = useState<Record<string, Preset>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r: any = await Api.ownerListStaff();
      setList((r?.staff as StaffRow[]) || []);
      setModules((r?.modules as ModuleDef[]) || []);
      setPresets((r?.presets as Record<string, Preset>) || {});
    } catch (e: any) {
      // If we get a permission error, redirect back
      if ((e?.message || "").includes("Only the account owner")) {
        Alert.alert("Access denied", "Only the account owner can manage staff.");
        router.back();
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (s: StaffRow) => { setEditing(s); setModalOpen(true); };

  const deleteStaff = (s: StaffRow) => {
    Alert.alert("Remove staff?", `${s.name} will lose all access immediately.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          try { await Api.ownerDeleteStaff(s.id); load(); }
          catch (e: any) { Alert.alert("Failed", e?.message || "Could not remove"); }
        },
      },
    ]);
  };

  const toggleActive = async (s: StaffRow) => {
    try { await Api.ownerUpdateStaff(s.id, { active: !s.active }); load(); }
    catch (e: any) { Alert.alert("Failed", e?.message || "Could not update"); }
  };

  return (
    <Screen>
      <ScreenHeader title="Staff & Roles" subtitle="Add managers, cashiers, kitchen — with granular access"
        right={
          <TouchableOpacity onPress={openCreate} style={styles.addBtn} activeOpacity={0.85} testID="staff-add">
            <Ionicons name="add" size={18} color={colors.onPrimary} />
            <Text style={styles.addBtnTxt}>Add Staff</Text>
          </TouchableOpacity>
        }
      />

      {loading ? (
        <View style={{ padding: 40, alignItems: "center" }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          {!list.length ? (
            <View style={styles.emptyBox}>
              <Ionicons name="people-outline" size={38} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No staff yet</Text>
              <Text style={styles.emptySub}>
                Add managers, cashiers, kitchen, or waiters. Each gets their own login (phone + OTP) and only sees the
                modules you allow.
              </Text>
              <TouchableOpacity onPress={openCreate} style={[styles.addBtn, { marginTop: 14 }]} activeOpacity={0.85}>
                <Ionicons name="add" size={18} color={colors.onPrimary} />
                <Text style={styles.addBtnTxt}>Add First Staff</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {list.map((s) => (
                <View key={s.id} style={[styles.card, !s.active && { opacity: 0.55 }]} testID={`staff-row-${s.id}`}>
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
                    <Switch
                      value={s.active}
                      onValueChange={() => toggleActive(s)}
                      trackColor={{ true: colors.primary, false: colors.borderStrong }}
                      thumbColor="#fff"
                      testID={`staff-toggle-${s.id}`}
                    />
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
                    }) : <Text style={styles.emptyPerms}>No modules granted yet</Text>}
                  </View>
                  <View style={styles.cardActions}>
                    <TouchableOpacity onPress={() => openEdit(s)} style={styles.actionBtn} testID={`staff-edit-${s.id}`}>
                      <Ionicons name="create-outline" size={16} color={colors.textPrimary} />
                      <Text style={styles.actionTxt}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteStaff(s)} style={[styles.actionBtn, { borderColor: colors.error + "44" }]} testID={`staff-delete-${s.id}`}>
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
        editing={editing}
        modules={modules}
        presets={presets}
        panel="owner"
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); load(); }}
      />
    </Screen>
  );
}

/** Reusable modal used by both /owner/staff and /admin/staff. Kept in this file
 *  and re-exported for the admin page (see /admin/staff.tsx). */
export function StaffModal({ visible, editing, modules, presets, panel, onClose, onSaved }: {
  visible: boolean;
  editing: StaffRow | null;
  modules: ModuleDef[];
  presets: Record<string, Preset>;
  panel: "owner" | "admin";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setName(editing.name || ""); setPhone(editing.phone || "");
      setLabel(editing.staff_label || ""); setPermissions(editing.permissions || []);
    } else {
      setName(""); setPhone(""); setLabel(""); setPermissions([]);
    }
  }, [visible, editing]);

  const applyPreset = (key: string) => {
    const p = presets[key]; if (!p) return;
    setLabel(p.label); setPermissions(p.permissions);
  };

  const togglePerm = (k: string) => {
    setPermissions((prev) => prev.includes(k) ? prev.filter((p) => p !== k) : [...prev, k]);
  };

  const submit = async () => {
    if (saving) return;
    if (!name.trim()) { Alert.alert("Missing", "Enter a name"); return; }
    if (!editing && !/^\+?\d{7,15}$/.test(phone.trim())) { Alert.alert("Invalid phone", "Enter a valid mobile number"); return; }
    setSaving(true);
    try {
      if (editing) {
        const fn = panel === "owner" ? Api.ownerUpdateStaff : Api.adminUpdateStaff;
        await fn(editing.id, { name: name.trim(), staff_label: label.trim(), permissions });
      } else {
        const fn = panel === "owner" ? Api.ownerCreateStaff : Api.adminCreateStaff;
        await fn({ name: name.trim(), phone: phone.trim(), staff_label: label.trim() || "Staff", permissions });
      }
      onSaved();
    } catch (e: any) {
      Alert.alert("Save failed", e?.message || "Something went wrong");
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={mstyles.overlay}>
        <View style={mstyles.sheet}>
          <View style={mstyles.head}>
            <Text style={mstyles.headTitle}>{editing ? "Edit staff" : "Add staff member"}</Text>
            <TouchableOpacity onPress={onClose} testID="staff-modal-close" style={mstyles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
            {!editing && Object.keys(presets).length > 0 ? (
              <>
                <Text style={mstyles.sectionLabel}>QUICK PRESETS</Text>
                <View style={mstyles.presetRow}>
                  {Object.entries(presets).map(([k, p]) => (
                    <TouchableOpacity key={k} onPress={() => applyPreset(k)} activeOpacity={0.85}
                      style={mstyles.presetChip} testID={`preset-${k}`}>
                      <Ionicons name="flash-outline" size={14} color={colors.primary} />
                      <Text style={mstyles.presetTxt}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={mstyles.sectionLabel}>DETAILS</Text>
            <View style={{ gap: 10 }}>
              <View>
                <Text style={mstyles.label}>Full name</Text>
                <TextInput value={name} onChangeText={setName} style={mstyles.input}
                  placeholder="e.g. Ravi Kumar" placeholderTextColor={colors.textMuted}
                  testID="staff-name" />
              </View>
              <View>
                <Text style={mstyles.label}>Mobile number</Text>
                <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad"
                  editable={!editing}
                  style={[mstyles.input, editing ? { opacity: 0.5 } : null]}
                  placeholder="10-digit mobile" placeholderTextColor={colors.textMuted}
                  testID="staff-phone" />
                {editing ? <Text style={mstyles.help}>Phone can't be changed after creation.</Text> : null}
              </View>
              <View>
                <Text style={mstyles.label}>Job title (visible label)</Text>
                <TextInput value={label} onChangeText={setLabel} style={mstyles.input}
                  placeholder="Manager / Cashier / Support Agent" placeholderTextColor={colors.textMuted}
                  testID="staff-label" />
              </View>
            </View>

            <Text style={[mstyles.sectionLabel, { marginTop: spacing.lg }]}>PERMISSIONS</Text>
            <Text style={mstyles.help}>
              Tap to toggle. Staff will only see the modules you enable, and any attempt to access other endpoints will
              be blocked by the server.
            </Text>
            <View style={{ gap: 8, marginTop: 10 }}>
              {modules.map((m) => {
                const on = permissions.includes(m.key);
                return (
                  <TouchableOpacity key={m.key} onPress={() => togglePerm(m.key)} activeOpacity={0.85}
                    style={[mstyles.modCard, on && mstyles.modCardOn]} testID={`perm-${m.key}`}>
                    <View style={[mstyles.modIcon, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                      <Ionicons name={m.icon as any} size={16} color={on ? colors.onPrimary : colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={mstyles.modTitle}>{m.label}</Text>
                      <Text style={mstyles.modDesc}>{m.description}</Text>
                    </View>
                    <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={22} color={on ? colors.success : colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <View style={mstyles.footer}>
            <TouchableOpacity onPress={onClose} style={mstyles.footerCancel}>
              <Text style={mstyles.footerCancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={submit} disabled={saving} style={mstyles.footerSave} testID="staff-save">
              {saving ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name={editing ? "save-outline" : "person-add-outline"} size={18} color="#fff" />
                  <Text style={mstyles.footerSaveTxt}>{editing ? "Save changes" : "Create staff"}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
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

const mstyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.background, maxHeight: "94%", borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  headTitle: { flex: 1, fontSize: 17, fontWeight: font.black, color: colors.textPrimary },
  closeBtn: { padding: 6, borderRadius: 999, backgroundColor: colors.surface },
  sectionLabel: { fontSize: 11, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.6, marginTop: 4 },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8, marginBottom: 4 },
  presetChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  presetTxt: { fontSize: 12, fontWeight: font.bold, color: colors.primary },
  label: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary, letterSpacing: 0.4, marginBottom: 4 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.textPrimary },
  help: { fontSize: 11, color: colors.textSecondary, marginTop: 4, lineHeight: 16 },
  modCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  modCardOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  modIcon: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.primary, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  modTitle: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary },
  modDesc: { fontSize: 11, color: colors.textSecondary, marginTop: 1, lineHeight: 15 },
  footer: { flexDirection: "row", gap: 10, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  footerCancel: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  footerCancelTxt: { fontSize: 13, fontWeight: font.bold, color: colors.textSecondary },
  footerSave: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.primary },
  footerSaveTxt: { fontSize: 14, fontWeight: font.black, color: colors.onPrimary },
});
