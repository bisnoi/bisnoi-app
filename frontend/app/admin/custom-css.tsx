import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ScreenHeader, Screen } from "@/src/components/ScreenHeader";

const MONO = Platform.select({
  web: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  default: "monospace",
});

const EXAMPLE = `/* Example: hide an element */
.grecaptcha-badge { display: none !important; }

/* Example: fix a clipped label */
[role="tablist"] [role="tab"] { overflow: visible !important; }`;

// Apply CSS to the live document (web only). The <style id="admin-custom-css">
// tag is created at boot by the injected bootstrap; create it if missing.
function applyCssToPage(css: string) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  let el = document.getElementById("admin-custom-css") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "admin-custom-css";
    document.head.appendChild(el);
  }
  el.textContent = css;
}

function cacheCss(css: string) {
  if (Platform.OS !== "web") return;
  try { window.localStorage.setItem("custom_css_cache", css); } catch {}
}

export default function AdminCustomCss() {
  const [css, setCss] = useState("");
  const [serverCss, setServerCss] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");
  const [savedTick, setSavedTick] = useState(false);

  useEffect(() => {
    Api.getCustomCss()
      .then((r: any) => {
        const v = typeof r?.css === "string" ? r.css : "";
        setCss(v);
        setServerCss(v);
        setUpdatedAt(r?.updated_at || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const dirty = css !== serverCss;

  const preview = useCallback(() => {
    setError("");
    applyCssToPage(css);
    setPreviewing(true);
  }, [css]);

  const resetPreview = useCallback(() => {
    applyCssToPage(serverCss);
    setPreviewing(false);
  }, [serverCss]);

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const r: any = await Api.adminSetCustomCss(css);
      const v = typeof r?.css === "string" ? r.css : css;
      setCss(v);
      setServerCss(v);
      setUpdatedAt(r?.updated_at || new Date().toISOString());
      applyCssToPage(v);
      cacheCss(v);
      setPreviewing(false);
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 2500);
    } catch (e: any) {
      setError(e?.message || "Could not save CSS");
    } finally {
      setSaving(false);
    }
  }, [css, saving]);

  const clearAll = useCallback(() => {
    setError("");
    setCss("");
  }, []);

  return (
    <Screen>
      <ScreenHeader title="Custom CSS" subtitle="Hotfix styles applied app-wide (web)" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        {/* Info */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color={colors.primary} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Fix CSS issues without a new release</Text>
            <Text style={styles.infoText}>
              CSS saved here loads on every page of the app (customer, owner, rider, admin & login) for all
              users on the web/PWA. Use it to patch layout glitches instantly. Native mobile apps are not affected.
            </Text>
          </View>
        </View>

        {/* Editor */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: spacing.sm }}>
          <Text style={styles.sectionLabel}>CSS EDITOR</Text>
          <Text style={styles.charCount}>{css.length.toLocaleString()} chars</Text>
        </View>

        {loading ? (
          <View style={[styles.editorBox, { alignItems: "center", justifyContent: "center", minHeight: 320 }]}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <TextInput
            testID="custom-css-input"
            value={css}
            onChangeText={(v) => { setCss(v); setError(""); }}
            multiline
            placeholder={EXAMPLE}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textAlignVertical="top"
            style={[styles.editorBox, styles.editorInput]}
          />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            testID="custom-css-preview"
            activeOpacity={0.85}
            onPress={previewing ? resetPreview : preview}
            disabled={Platform.OS !== "web"}
            style={[styles.secondaryBtn, previewing && { borderColor: colors.warning, backgroundColor: colors.warningSoft }]}
          >
            <Ionicons name={previewing ? "refresh" : "eye-outline"} size={16} color={colors.textPrimary} />
            <Text style={styles.secondaryTxt}>{previewing ? "Reset preview" : "Preview on this page"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="custom-css-clear"
            activeOpacity={0.85}
            onPress={clearAll}
            disabled={!css.length}
            style={[styles.secondaryBtn, { opacity: css.length ? 1 : 0.5 }]}
          >
            <Ionicons name="trash-outline" size={16} color={colors.error} />
            <Text style={[styles.secondaryTxt, { color: colors.error }]}>Clear</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          testID="custom-css-save"
          activeOpacity={0.9}
          disabled={!dirty || saving}
          onPress={save}
          style={[styles.saveBtn, { opacity: !dirty || saving ? 0.5 : 1 }]}
        >
          {saving ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <>
              <Ionicons name={savedTick ? "checkmark-circle" : "cloud-upload-outline"} size={18} color={colors.onPrimary} />
              <Text style={styles.saveTxt}>
                {savedTick ? "Saved & applied" : dirty ? "Save & Apply to App" : "No changes to save"}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {updatedAt ? (
          <Text style={styles.note}>Last updated: {new Date(updatedAt).toLocaleString()}</Text>
        ) : (
          <Text style={styles.note}>No custom CSS saved yet.</Text>
        )}

        {/* Tips */}
        <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>TIPS</Text>
        <View style={styles.tipCard}>
          <Text style={styles.tipLine}>{"\u2022"} Prefer targeted selectors and add !important to override app styles.</Text>
          <Text style={styles.tipLine}>{"\u2022"} Use "Preview on this page" to test safely before saving.</Text>
          <Text style={styles.tipLine}>{"\u2022"} Saved CSS reaches users on their next page load / refresh.</Text>
          <Text style={styles.tipLine}>{"\u2022"} To undo everything, Clear the editor and save.</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.6 },
  charCount: { fontSize: 11, color: colors.textMuted, fontWeight: font.semi },

  infoCard: {
    flexDirection: "row", gap: spacing.sm, backgroundColor: colors.surface,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, ...shadow.card,
  },
  infoTitle: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary },
  infoText: { fontSize: 12, color: colors.textSecondary, marginTop: 3, lineHeight: 18 },

  editorBox: {
    backgroundColor: "#0F172A", borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.borderStrong, padding: spacing.md,
  },
  editorInput: {
    minHeight: 320, color: "#E2E8F0", fontSize: 13, lineHeight: 20,
    fontFamily: MONO as any,
  },

  error: { color: colors.error, fontSize: 13, fontWeight: font.semi, marginTop: spacing.md },

  actionsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  secondaryBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14,
    height: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryTxt: { fontSize: 13, fontWeight: font.bold, color: colors.textPrimary },

  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 54, borderRadius: radius.lg, marginTop: spacing.md,
    backgroundColor: colors.primary, ...shadow.lifted,
  },
  saveTxt: { fontSize: 16, fontWeight: font.black, color: colors.onPrimary },

  note: { fontSize: 12, color: colors.textMuted, textAlign: "center", marginTop: spacing.md },

  tipCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.md, marginTop: spacing.sm, gap: 6,
  },
  tipLine: { fontSize: 12.5, color: colors.textSecondary, lineHeight: 19 },
});
