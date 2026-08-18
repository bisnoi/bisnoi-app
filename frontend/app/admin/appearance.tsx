import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Api } from "@/src/api";
import {
  colors, spacing, radius, font, shadow,
  THEME_PALETTE, getAccentColor, setAccentColor, isValidHex,
} from "@/src/theme";
import { ScreenHeader, Screen } from "@/src/components/ScreenHeader";

// ---- local color helpers (preview only) ----
function clampByte(n: number) { return Math.max(0, Math.min(255, Math.round(n))); }
function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((x) => clampByte(x).toString(16).padStart(2, "0")).join("");
}
function shade(hex: string, amt: number) {
  const { r, g, b } = hexToRgb(hex);
  if (amt < 0) { const f = 1 + amt; return rgbToHex(r * f, g * f, b * f); }
  const f = amt; return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
}
function lum(hex: string) { const { r, g, b } = hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
function onColor(hex: string) { return lum(hex) > 0.62 ? "#0B0F0C" : "#FFFFFF"; }

export default function AdminAppearance() {
  const current = getAccentColor();
  const [selected, setSelected] = useState<string>(current);
  const [customHex, setCustomHex] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [serverColor, setServerColor] = useState<string>(current);

  useEffect(() => {
    Api.getTheme()
      .then((r: any) => { if (r?.color) { setServerColor(r.color); setSelected(r.color); } })
      .catch(() => {});
  }, []);

  const dirty = selected.toLowerCase() !== serverColor.toLowerCase();
  const on = onColor(selected);
  const dark = shade(selected, -0.18);
  const soft = shade(selected, 0.86);

  const pick = (hex: string) => { setError(""); setSelected(hex); };

  const applyCustom = () => {
    const v = customHex.trim();
    if (!isValidHex(v)) { setError("Enter a valid hex like #FF6B00"); return; }
    setError("");
    setSelected(v.length === 4
      ? "#" + v.slice(1).split("").map((c) => c + c).join("")
      : v);
  };

  const apply = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError("");
    try {
      await Api.adminSetTheme(selected);
      // Persist locally + reload so the entire app re-themes with the new accent.
      setAccentColor(selected);
      if (Platform.OS !== "web") { setServerColor(selected); setSaving(false); }
    } catch (e: any) {
      setError(e?.message || "Could not save theme");
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Theme Color" subtitle="Pick the app's accent color" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        {/* Live preview */}
        <Text style={styles.sectionLabel}>LIVE PREVIEW</Text>
        <View style={styles.previewCard}>
          <LinearGradient colors={[selected, dark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.previewHero}>
            <View style={[styles.previewAvatar, { backgroundColor: "rgba(255,255,255,0.25)" }]}>
              <Text style={{ color: "#fff", fontWeight: font.black, fontSize: 18 }}>B</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.previewKicker}>ADMIN CONSOLE</Text>
              <Text style={styles.previewTitle}>Bisnoi</Text>
            </View>
            <View style={[styles.previewPill, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
              <Ionicons name="flash" size={13} color="#fff" />
              <Text style={styles.previewPillTxt}>5 active</Text>
            </View>
          </LinearGradient>
          <View style={styles.previewBody}>
            <View style={[styles.previewIcBox, { backgroundColor: soft }]}>
              <Ionicons name="color-palette" size={20} color={selected} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.previewItemTitle}>Accent applied across the app</Text>
              <Text style={styles.previewItemSub}>Buttons, highlights, icons & headers</Text>
            </View>
            <View style={[styles.previewBtn, { backgroundColor: selected }]}>
              <Text style={{ color: on, fontWeight: font.black, fontSize: 13 }}>Button</Text>
            </View>
          </View>
        </View>

        {/* Palette grid */}
        <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>COLOR PALETTE</Text>
        <View style={styles.grid}>
          {THEME_PALETTE.map((p) => {
            const active = selected.toLowerCase() === p.color.toLowerCase();
            return (
              <TouchableOpacity
                key={p.color}
                testID={`theme-swatch-${p.color.replace("#", "")}`}
                activeOpacity={0.85}
                onPress={() => pick(p.color)}
                style={[styles.swatchCard, active && { borderColor: p.color, borderWidth: 2 }]}
              >
                <View style={[styles.swatchDot, { backgroundColor: p.color }]}>
                  {active ? <Ionicons name="checkmark" size={18} color={onColor(p.color)} /> : null}
                </View>
                <Text style={styles.swatchName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.swatchHex}>{p.color.toUpperCase()}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom hex */}
        <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>CUSTOM COLOR</Text>
        <View style={styles.customRow}>
          <View style={[styles.customPreview, { backgroundColor: isValidHex(customHex.trim()) ? customHex.trim() : colors.surfaceAlt }]} />
          <TextInput
            testID="theme-custom-input"
            value={customHex}
            onChangeText={setCustomHex}
            placeholder="#FF6B00"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            style={styles.customInput}
          />
          <TouchableOpacity testID="theme-custom-apply" onPress={applyCustom} activeOpacity={0.85} style={styles.customBtn}>
            <Text style={{ color: colors.onPrimary, fontWeight: font.bold }}>Use</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Apply */}
        <TouchableOpacity
          testID="theme-apply"
          activeOpacity={0.9}
          disabled={!dirty || saving}
          onPress={apply}
          style={[styles.applyBtn, { backgroundColor: selected, opacity: !dirty || saving ? 0.5 : 1 }]}
        >
          {saving ? (
            <ActivityIndicator color={on} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color={on} />
              <Text style={[styles.applyTxt, { color: on }]}>
                {dirty ? "Apply Theme to App" : "Current Theme Applied"}
              </Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.note}>
          This sets the accent color for everyone using Bisnoi. The app reloads to apply the new look.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.6, marginBottom: spacing.sm },

  previewCard: { borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.card },
  previewHero: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  previewAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  previewKicker: { color: "rgba(255,255,255,0.85)", fontSize: 10, fontWeight: font.black, letterSpacing: 1 },
  previewTitle: { color: "#fff", fontSize: 18, fontWeight: font.black, marginTop: 2 },
  previewPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  previewPillTxt: { color: "#fff", fontSize: 11, fontWeight: font.bold },
  previewBody: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  previewIcBox: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  previewItemTitle: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary },
  previewItemSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  previewBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.md },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  swatchCard: { width: "47%", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.card },
  swatchDot: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  swatchName: { fontSize: 14, fontWeight: font.bold, color: colors.textPrimary, marginTop: 10 },
  swatchHex: { fontSize: 11, color: colors.textMuted, marginTop: 2, fontWeight: font.semi },

  customRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  customPreview: { width: 46, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong },
  customInput: { flex: 1, height: 46, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, color: colors.textPrimary, fontWeight: font.bold, fontSize: 15 },
  customBtn: { height: 46, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },

  error: { color: colors.error, fontSize: 13, fontWeight: font.semi, marginTop: spacing.md },

  applyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54, borderRadius: radius.lg, marginTop: spacing.xl, ...shadow.lifted },
  applyTxt: { fontSize: 16, fontWeight: font.black },
  note: { fontSize: 12, color: colors.textMuted, textAlign: "center", marginTop: spacing.md, lineHeight: 18 },
});
