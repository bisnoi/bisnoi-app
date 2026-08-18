import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Empty, Pill, Button } from "@/src/components/ui";
import { AdminHeader } from "@/src/components/AdminHeader";

type RoleKey = "customer" | "restaurant_owner" | "rider" | "admin";
const ROLES = ["all", "customer", "restaurant_owner", "rider", "admin"];
const ROLE_OPTS: { key: RoleKey; label: string }[] = [
  { key: "customer", label: "Customer" },
  { key: "restaurant_owner", label: "Owner" },
  { key: "rider", label: "Rider" },
  { key: "admin", label: "Admin" },
];
const roleColor: Record<string, string> = {
  customer: colors.primary,
  restaurant_owner: colors.secondary,
  rider: colors.warning,
  admin: colors.textPrimary,
};
const roleLabel = (r: string) => (r === "all" ? "ALL" : r.replace("_", " ").toUpperCase());

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [formModal, setFormModal] = useState<{ open: boolean; editing?: any | null }>({ open: false });
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const u = (await Api.adminUsers()) as any[];
      setUsers(u);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter !== "all" && u.role !== filter) return false;
      if (!q) return true;
      return (u.name || "").toLowerCase().includes(q)
        || (u.phone || "").includes(q)
        || (u.account_id || "").toLowerCase().includes(q);
    });
  }, [users, filter, search]);

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await Api.adminDeleteUser(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e: any) {
      setConfirmDelete((c: any) => (c ? { ...c, error: e.message || "Could not delete" } : c));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AdminHeader
        title="Users"
        subtitle={`${filtered.length} of ${users.length} users`}
        right={
          <TouchableOpacity testID="admin-add-user-btn" style={styles.addBtn} onPress={() => setFormModal({ open: true, editing: null })} activeOpacity={0.85}>
            <Ionicons name="person-add" size={15} color="#fff" />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          testID="admin-user-search"
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, phone or account ID"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {ROLES.map((r) => (
          <Pill key={r} label={roleLabel(r)} active={filter === r} onPress={() => setFilter(r)} />
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <Empty icon="people" title="No users" subtitle="Try changing filters or tap “Add”" />
        ) : (
          filtered.map((u) => {
            const accent = roleColor[u.role] || colors.textPrimary;
            const isSelf = me?.id === u.id;
            return (
              <View key={u.id} style={styles.card} testID={`admin-user-card-${u.id}`}>
                <View style={[styles.avatar, { backgroundColor: accent }]}>
                  <Text style={{ color: "#fff", fontWeight: font.black, fontSize: 18 }}>{(u.name || "U")[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Text style={styles.name} numberOfLines={1}>{u.name || "Unnamed"}</Text>
                    {isSelf ? <View style={styles.youTag}><Text style={styles.youTagText}>YOU</Text></View> : null}
                  </View>
                  <Text style={styles.phone}>+91 {u.phone}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                    <View style={[styles.roleTag, { backgroundColor: accent + "22" }]}>
                      <Text style={{ color: accent, fontSize: 10, fontWeight: font.black, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {u.role.replace("_", " ")}
                      </Text>
                    </View>
                    {u.account_id ? (
                      <View style={styles.acctTag} testID={`admin-user-acct-${u.id}`}>
                        <Ionicons name="id-card" size={10} color={colors.textSecondary} />
                        <Text style={styles.acctTagText} selectable>{u.account_id}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={{ gap: 8 }}>
                  <TouchableOpacity testID={`admin-edit-user-${u.id}`} onPress={() => setFormModal({ open: true, editing: u })} style={styles.iconBtn} activeOpacity={0.85}>
                    <Ionicons name="create" size={16} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID={`admin-delete-user-${u.id}`}
                    onPress={() => setConfirmDelete(u)}
                    disabled={isSelf}
                    activeOpacity={0.85}
                    style={[styles.iconBtn, { borderColor: isSelf ? colors.border : colors.error, opacity: isSelf ? 0.4 : 1 }]}
                  >
                    <Ionicons name="trash" size={16} color={isSelf ? colors.textMuted : colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <UserFormModal
        visible={formModal.open}
        editing={formModal.editing}
        onClose={() => setFormModal({ open: false })}
        onDone={() => { setFormModal({ open: false }); load(); }}
      />

      {/* Delete confirmation */}
      <Modal visible={!!confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(null)}>
        <View style={styles.backdrop}>
          <View style={styles.confirmCard} testID="admin-delete-user-modal">
            <View style={styles.confirmIc}><Ionicons name="trash" size={26} color={colors.error} /></View>
            <Text style={styles.confirmTitle}>Delete user?</Text>
            <Text style={styles.confirmSub}>
              “{confirmDelete?.name || "This user"}” (+91 {confirmDelete?.phone}) will be permanently removed. This can’t be undone.
            </Text>
            {confirmDelete?.error ? <Text style={styles.errText}>{confirmDelete.error}</Text> : null}
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, alignSelf: "stretch" }}>
              <View style={{ flex: 1 }}><Button title="Cancel" variant="ghost" onPress={() => setConfirmDelete(null)} full /></View>
              <View style={{ flex: 1 }}><Button testID="admin-confirm-delete-user" title="Delete" variant="danger" icon="trash" onPress={doDelete} loading={deleting} full /></View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function UserFormModal({ visible, editing, onClose, onDone }: { visible: boolean; editing?: any | null; onClose: () => void; onDone: () => void }) {
  const isEdit = !!editing;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<RoleKey>("customer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    setError("");
    if (editing) {
      setName(editing.name || "");
      setPhone(editing.phone || "");
      setRole((editing.role as RoleKey) || "customer");
    } else {
      setName(""); setPhone(""); setRole("customer");
    }
  }, [visible, editing]);

  const submit = async () => {
    const p = phone.trim();
    if (!/^\d{10}$/.test(p)) return setError("Enter a valid 10-digit phone number");
    setSaving(true);
    try {
      if (isEdit) {
        await Api.adminUpdateUser(editing.id, { name: name.trim(), phone: p, role });
      } else {
        await Api.adminCreateUser({ name: name.trim(), phone: p, role });
      }
      onDone();
    } catch (e: any) {
      setError(e.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
        <View style={styles.mHead}>
          <Text style={styles.mTitle}>{isEdit ? "Edit User" : "Add User"}</Text>
          <TouchableOpacity testID="user-modal-close" onPress={onClose} hitSlop={8}><Ionicons name="close" size={26} color={colors.textPrimary} /></TouchableOpacity>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
            <View>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                testID="user-name-input"
                value={name}
                onChangeText={(t) => { setName(t); setError(""); }}
                placeholder="e.g. Riya Sharma"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </View>
            <View>
              <Text style={styles.label}>Phone Number</Text>
              <View style={styles.phoneWrap}>
                <Text style={styles.cc}>+91</Text>
                <TextInput
                  testID="user-phone-input"
                  value={phone}
                  onChangeText={(t) => { setPhone(t.replace(/[^0-9]/g, "").slice(0, 10)); setError(""); }}
                  placeholder="10-digit mobile"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  style={styles.phoneInput}
                />
              </View>
            </View>
            <View>
              <Text style={styles.label}>Role</Text>
              <View style={styles.roleGrid}>
                {ROLE_OPTS.map((r) => {
                  const on = role === r.key;
                  const accent = roleColor[r.key];
                  return (
                    <TouchableOpacity
                      key={r.key}
                      testID={`user-role-${r.key}`}
                      onPress={() => setRole(r.key)}
                      style={[styles.roleOpt, on && { backgroundColor: accent, borderColor: accent }]}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.roleOptText, on && { color: "#fff" }]}>{r.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            {error ? <Text style={styles.errText} testID="user-form-error">{error}</Text> : null}
            <Button testID="user-save-btn" title={isEdit ? "Save Changes" : "Create User"} icon="checkmark" onPress={submit} loading={saving} full />
            {!isEdit ? (
              <Text style={styles.hint}>The user can sign in immediately using this phone number and the demo OTP.</Text>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.primary, paddingHorizontal: 14, height: 38, borderRadius: radius.pill },
  addBtnText: { color: "#fff", fontWeight: font.bold, fontSize: 13 },

  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: spacing.lg, marginTop: spacing.xs, paddingHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, paddingVertical: Platform.OS === "ios" ? 12 : 8, fontSize: 14, color: colors.textPrimary },
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 8, alignItems: "center" },

  card: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 15, fontWeight: font.bold, color: colors.textPrimary, flexShrink: 1 },
  phone: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  roleTag: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  acctTag: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
  },
  acctTagText: { fontSize: 10, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.6, fontVariant: ["tabular-nums"] } as any,
  youTag: { backgroundColor: colors.successSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  youTagText: { fontSize: 9, fontWeight: font.black, color: colors.success, letterSpacing: 0.4 },
  iconBtn: { width: 36, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary, alignItems: "center", justifyContent: "center" },

  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  confirmCard: { width: "100%", maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, alignItems: "center" },
  confirmIc: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.errorSoft, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  confirmTitle: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary },
  confirmSub: { fontSize: 13, color: colors.textSecondary, textAlign: "center", marginTop: 6, lineHeight: 19 },

  mHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  mTitle: { fontSize: 20, fontWeight: font.black, color: colors.textPrimary },
  label: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, fontSize: 14, color: colors.textPrimary },
  phoneWrap: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingLeft: 12 },
  cc: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary, marginRight: 8 },
  phoneInput: { flex: 1, padding: 12, fontSize: 14, color: colors.textPrimary },
  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roleOpt: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  roleOptText: { fontSize: 13, fontWeight: font.bold, color: colors.textSecondary },
  errText: { color: colors.error, fontSize: 13, marginTop: 4, textAlign: "center" },
  hint: { fontSize: 12, color: colors.textMuted, textAlign: "center", lineHeight: 17 },
});
