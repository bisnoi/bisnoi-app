import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Image, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/src/auth";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ConfirmModal } from "@/src/components/ConfirmModal";
import { notify } from "@/src/utils/confirm";
import { compressDataUrl } from "@/src/utils/imageCompress";

type Gender = "male" | "female" | "other" | "prefer_not_to_say";
const GENDER_OPTIONS: { key: Gender; label: string }[] = [
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
  { key: "other", label: "Other" },
  { key: "prefer_not_to_say", label: "Rather not say" },
];

export default function CustomerSettings() {
  const router = useRouter();
  const { user, signOut, refresh } = useAuth();

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [dob, setDob] = useState(user?.dob || "");
  const [gender, setGender] = useState<Gender | "">(((user?.gender as Gender) || ""));
  const [avatar, setAvatar] = useState<string | null>(user?.avatar || null);
  const [saving, setSaving] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [permBlocked, setPermBlocked] = useState(false);

  // Sync form when the auth user finishes loading or gets refreshed
  useEffect(() => {
    if (!user) return;
    setName(user.name || "");
    setEmail(user.email || "");
    setDob(user.dob || "");
    setGender(((user.gender as Gender) || ""));
    setAvatar(user.avatar || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.name, user?.email, user?.dob, user?.gender, user?.avatar]);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  const isValidDob = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v.trim());

  const pickAvatar = async () => {
    if (pickingImage) return;
    setPickingImage(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });
      if (!res.canceled && res.assets?.[0]?.base64) {
        const raw = `data:image/jpeg;base64,${res.assets[0].base64}`;
        const compressed = (await compressDataUrl(raw)) as string;
        setAvatar(compressed);
        setPermBlocked(false);
      }
    } catch (e: any) {
      notify("Image error", e?.message || "Could not pick image");
    } finally {
      setPickingImage(false);
    }
  };

  const saveProfile = async () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedDob = dob.trim();
    if (!trimmedName) {
      notify("Name required", "Please enter a valid display name.");
      return;
    }
    if (trimmedEmail && !isValidEmail(trimmedEmail)) {
      notify("Invalid email", "Please enter a valid email address, or leave it blank.");
      return;
    }
    if (trimmedDob && !isValidDob(trimmedDob)) {
      notify("Invalid date", "Use YYYY-MM-DD format (e.g. 1998-05-24), or leave it blank.");
      return;
    }
    setSaving(true);
    try {
      await Api.updateProfile?.({
        name: trimmedName,
        email: trimmedEmail ? trimmedEmail.toLowerCase() : null,
        dob: trimmedDob || null,
        gender: gender || null,
        avatar: avatar || null,
      });
      await refresh();
      notify("Saved", "Your profile has been updated.");
    } catch (e: any) {
      notify("Could not save", e?.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await Api.deleteAccount();
      setConfirmDelete(false);
      await signOut();
      router.replace("/login" as any);
    } catch (e: any) {
      notify("Could not delete account", e?.message || "Please try again or contact support.");
    } finally {
      setDeleting(false);
    }
  };

  const avatarInitial = (name || user?.name || "U")[0]?.toUpperCase() || "U";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="settings-back">
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {/* Avatar */}
        <View style={styles.avatarRow}>
          <View style={styles.avatarWrap}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatarImg} />
            ) : (
              <View style={[styles.avatarImg, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackTxt}>{avatarInitial}</Text>
              </View>
            )}
            {pickingImage && (
              <View style={styles.avatarLoading}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <TouchableOpacity onPress={pickAvatar} style={styles.avatarBtn} testID="settings-avatar-btn" disabled={pickingImage}>
              <Ionicons name="camera" size={14} color={colors.primary} />
              <Text style={styles.avatarBtnTxt}>{avatar ? "Change photo" : "Add photo"}</Text>
            </TouchableOpacity>
            {avatar && (
              <TouchableOpacity onPress={() => setAvatar(null)} style={styles.avatarRemoveBtn} testID="settings-avatar-remove-btn">
                <Ionicons name="close-circle" size={14} color={colors.error} />
                <Text style={styles.avatarRemoveTxt}>Remove</Text>
              </TouchableOpacity>
            )}
            {permBlocked && (
              <Text style={styles.permHint}>Photos permission is blocked. Enable it from device Settings.</Text>
            )}
          </View>
        </View>

        <Text style={styles.sectionLabel}>EDIT PROFILE</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            testID="settings-name-input"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <Text style={[styles.label, { marginTop: spacing.md }]}>Email</Text>
          <TextInput
            testID="settings-email-input"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            returnKeyType="next"
          />

          <Text style={[styles.label, { marginTop: spacing.md }]}>Date of birth</Text>
          <TextInput
            testID="settings-dob-input"
            value={dob}
            onChangeText={setDob}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            autoCapitalize="none"
            keyboardType={Platform.OS === "web" ? "default" : "numbers-and-punctuation"}
            autoCorrect={false}
            maxLength={10}
            returnKeyType="done"
          />
          <Text style={styles.hint}>Example: 1998-05-24 (leave blank to skip)</Text>

          <Text style={[styles.label, { marginTop: spacing.md }]}>Gender</Text>
          <View style={styles.pillRow}>
            {GENDER_OPTIONS.map((opt) => {
              const active = gender === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  testID={`settings-gender-${opt.key}`}
                  onPress={() => setGender(active ? "" : opt.key)}
                  activeOpacity={0.85}
                  style={[styles.pill, active && styles.pillActive]}
                >
                  <Text style={[styles.pillTxt, active && styles.pillTxtActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.label, { marginTop: spacing.md }]}>Phone number</Text>
          <View style={styles.phoneLocked}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
              <Ionicons name="call" size={16} color={colors.textSecondary} />
              <Text style={styles.phoneLockedTxt} testID="settings-phone-readonly">+91 {user?.phone || "----------"}</Text>
            </View>
            <View style={styles.lockPill}>
              <Ionicons name="lock-closed" size={11} color={colors.textSecondary} />
              <Text style={styles.lockPillTxt}>Locked</Text>
            </View>
          </View>
          <Text style={styles.hint}>Phone number cannot be changed here. Contact support to update it.</Text>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={saveProfile}
            disabled={saving}
            testID="settings-save-btn"
          >
            {saving ? <ActivityIndicator color={colors.onPrimary} size="small" /> : (
              <Text style={styles.saveBtnTxt}>Save changes</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>DANGER ZONE</Text>
        <View style={[styles.card, { borderColor: colors.error }]}>
          <Text style={styles.dangerTitle}>Delete account</Text>
          <Text style={styles.dangerBody}>
            This permanently deletes your Bisnoi account, saved addresses, payment methods and
            notifications. This cannot be undone. Your past orders are retained for record-keeping
            but are no longer linked to your account.
          </Text>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => { setDeleteTyped(""); setConfirmDelete(true); }}
            testID="delete-account-btn"
          >
            <Ionicons name="trash" size={16} color="#fff" />
            <Text style={styles.deleteBtnTxt}>Delete my account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ConfirmModal
        visible={confirmDelete}
        title="Delete your account?"
        message="Type DELETE below to confirm. This action is permanent and cannot be undone."
        confirmLabel={deleting ? "Deleting..." : "Delete permanently"}
        cancelLabel="Cancel"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => { if (deleteTyped.trim().toUpperCase() === "DELETE" && !deleting) doDelete(); }}
      />
      {confirmDelete && (
        <View style={styles.typeBoxWrap} pointerEvents="box-none">
          <View style={styles.typeBox}>
            <TextInput
              value={deleteTyped}
              onChangeText={setDeleteTyped}
              placeholder='Type "DELETE" to confirm'
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              style={styles.typeInput}
              testID="delete-confirm-input"
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary },
  sectionLabel: { fontSize: 12, fontWeight: font.black, color: colors.textMuted, letterSpacing: 0.5, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, ...shadow.card,
  },
  avatarRow: {
    flexDirection: "row", alignItems: "center", marginBottom: spacing.lg,
    padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, ...shadow.card,
  },
  avatarWrap: { position: "relative" },
  avatarImg: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.surfaceAlt },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  avatarFallbackTxt: { color: colors.onPrimary, fontWeight: font.black, fontSize: 32 },
  avatarLoading: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 38, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center",
  },
  avatarBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  avatarBtnTxt: { color: colors.primary, fontWeight: font.black, fontSize: 12 },
  avatarRemoveBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    alignSelf: "flex-start", marginTop: 6,
    paddingVertical: 4, paddingHorizontal: 6,
  },
  avatarRemoveTxt: { color: colors.error, fontWeight: font.bold, fontSize: 11 },
  permHint: { fontSize: 11, color: colors.error, marginTop: 6 },
  label: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary, marginBottom: 6, textTransform: "uppercase" },
  input: {
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 14, color: colors.textPrimary, backgroundColor: colors.background, minHeight: 48,
  },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: 6, lineHeight: 15 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.background,
  },
  pillActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  pillTxt: { color: colors.textSecondary, fontWeight: font.bold, fontSize: 13 },
  pillTxtActive: { color: colors.primary },
  phoneLocked: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surfaceAlt, minHeight: 48,
  },
  phoneLockedTxt: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary },
  lockPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill,
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
  },
  lockPillTxt: { fontSize: 10, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.5 },
  saveBtn: { marginTop: spacing.lg, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, alignItems: "center" },
  saveBtnTxt: { color: colors.onPrimary, fontWeight: font.black, fontSize: 14 },
  dangerTitle: { fontSize: 15, fontWeight: font.black, color: colors.error, marginBottom: 6 },
  dangerBody: { fontSize: 12, color: colors.textSecondary, lineHeight: 18, marginBottom: spacing.md },
  deleteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.error, borderRadius: radius.md, paddingVertical: 12,
  },
  deleteBtnTxt: { color: "#fff", fontWeight: font.black, fontSize: 14 },
  typeBoxWrap: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center", zIndex: 10000,
  },
  typeBox: { width: "100%", maxWidth: 360, paddingHorizontal: spacing.xl, marginTop: 120 },
  typeInput: {
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 14, color: colors.textPrimary, backgroundColor: colors.surface,
  },
});
