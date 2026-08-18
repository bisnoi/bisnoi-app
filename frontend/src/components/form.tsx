import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ViewStyle,
} from "react-native";
import { notify } from "@/src/utils/confirm";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPickerLib from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { compressDataUrl, compressDataUrls } from "@/src/utils/imageCompress";
import { colors, radius, spacing, font } from "@/src/theme";

export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  required,
  multiline,
  keyboardType,
  autoCapitalize = "sentences",
  maxLength,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  keyboardType?: "default" | "numeric" | "phone-pad" | "email-address";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  maxLength?: number;
  hint?: string;
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={{ color: colors.primary }}> *</Text>}
      </Text>
      <TextInput
        style={[styles.input, multiline && { minHeight: 80, textAlignVertical: "top" }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || label}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function FormSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  required,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: keyof typeof Ionicons.glyphMap }[];
  onChange: (v: T) => void;
  required?: boolean;
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={{ color: colors.primary }}> *</Text>}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <TouchableOpacity
              key={o.value}
              onPress={() => onChange(o.value)}
              activeOpacity={0.85}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderColor: active ? colors.primary : colors.borderStrong,
                },
              ]}
            >
              {o.icon ? (
                <Ionicons name={o.icon} size={14} color={active ? "#fff" : colors.textSecondary} />
              ) : null}
              <Text
                style={{
                  color: active ? "#fff" : colors.textSecondary,
                  fontWeight: font.semi,
                  fontSize: 13,
                }}
              >
                {o.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function DocumentPicker({
  label,
  value,
  onChange,
  required,
  hint,
}: {
  label: string;
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  required?: boolean;
  hint?: string;
}) {
  const [busy, setBusy] = useState(false);
  const isPdf = !!value && value.startsWith("data:application/pdf");

  const pick = async () => {
    try {
      setBusy(true);
      const res = await DocumentPickerLib.getDocumentAsync({
        type: ["image/*", "application/pdf"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const mime =
        a.mimeType ||
        (a.name?.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");

      let dataUrl: string;
      if (Platform.OS === "web") {
        const resp = await fetch(a.uri);
        const blob = await resp.blob();
        const b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(",")[1] || "");
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        dataUrl = `data:${mime};base64,${b64}`;
      } else {
        const b64 = await FileSystem.readAsStringAsync(a.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        dataUrl = `data:${mime};base64,${b64}`;
      }

      if (mime.startsWith("image/")) {
        dataUrl = (await compressDataUrl(dataUrl)) as string;
      }
      onChange(dataUrl);
    } catch (e: any) {
      notify("Upload failed", e?.message || "Could not pick the file");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={{ color: colors.primary }}> *</Text>}
      </Text>
      <TouchableOpacity
        onPress={pick}
        activeOpacity={0.85}
        style={styles.docBox}
        disabled={busy}
      >
        {value ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
            {isPdf ? (
              <View style={styles.docIcon}>
                <Ionicons name="document-text" size={22} color={colors.primary} />
              </View>
            ) : (
              <Image source={{ uri: value }} style={styles.thumb} contentFit="cover" />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: font.bold, color: colors.textPrimary, fontSize: 13 }}>
                {isPdf ? "PDF attached" : "Document attached"}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                Tap to replace
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => onChange(null)}
              hitSlop={10}
              style={{ padding: 4 }}
            >
              <Ionicons name="close-circle" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={styles.docIcon}>
              <Ionicons
                name={busy ? "hourglass" : "cloud-upload"}
                size={20}
                color={colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: font.bold, color: colors.textPrimary, fontSize: 13 }}>
                {busy ? "Selecting…" : "Upload document"}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                JPG / PNG / PDF · max 5MB · stored as base64 demo
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        )}
      </TouchableOpacity>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function MultiImagePicker({
  label,
  values,
  onChange,
  max = 6,
  required,
  hint,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  max?: number;
  required?: boolean;
  hint?: string;
}) {
  const [busy, setBusy] = useState(false);

  const add = async () => {
    try {
      setBusy(true);
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        base64: true,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: Math.max(1, max - values.length),
      });
      if (res.canceled || !res.assets?.length) return;
      const picked = res.assets
        .map((a) => (a.base64 ? `data:${a.mimeType || "image/jpeg"};base64,${a.base64}` : a.uri))
        .filter(Boolean) as string[];
      const compressed = await compressDataUrls(picked);
      onChange([...values, ...compressed].slice(0, max));
    } catch (e: any) {
      notify("Upload failed", e?.message || "Could not pick the image");
    } finally {
      setBusy(false);
    }
  };

  const removeAt = (i: number) => onChange(values.filter((_, idx) => idx !== i));

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={{ color: colors.primary }}> *</Text>}
        {values.length > 0 ? <Text style={{ color: colors.textMuted }}>{`  (${values.length}/${max})`}</Text> : null}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {values.map((uri, i) => (
          <View key={`${i}-${uri.slice(-12)}`} style={styles.galThumbWrap}>
            <Image source={{ uri }} style={styles.galThumb} contentFit="cover" />
            <TouchableOpacity onPress={() => removeAt(i)} style={styles.galRemove} hitSlop={8} accessibilityLabel="Remove image">
              <Ionicons name="close" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        ))}
        {values.length < max ? (
          <TouchableOpacity onPress={add} activeOpacity={0.85} style={styles.galAdd} disabled={busy} testID="add-more-photo">
            <Ionicons name={busy ? "hourglass" : "add"} size={24} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: font.bold, fontSize: 11, marginTop: 2 }}>
              {busy ? "Adding…" : values.length ? "Add more" : "Add photo"}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function FormSection({
  title,
  icon,
  children,
  style,
}: {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.sectionHead}>
        {icon ? <Ionicons name={icon} size={16} color={colors.primary} /> : null}
        <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      </View>
      {children}
    </View>
  );
}

// -----------------------------------------------------------------------------
// DobInput — masked "DD-MMM-YYYY" date-of-birth input.
//
// The user types freely; the hyphens are auto-inserted at the correct positions
// so they never have to type "-" themselves. Segments:
//   - DD    : 2 digits (01..31)
//   - MMM   : 3 letters (Jan..Dec) — auto-capitalised (first upper, rest lower)
//   - YYYY  : 4 digits (1900..current year)
// The exported value is always the raw string ("12-Jan-1990" once complete).
// -----------------------------------------------------------------------------
const _MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function _formatDob(raw: string): string {
  // Strip all separators, keep only alphanumerics.
  const clean = (raw || "").replace(/[^A-Za-z0-9]/g, "");
  const day = clean.slice(0, 2).replace(/\D/g, "");
  const monRaw = clean.slice(2, 5).replace(/[^A-Za-z]/g, "");
  const year = clean.slice(5, 9).replace(/\D/g, "");
  const mon = monRaw
    ? monRaw.charAt(0).toUpperCase() + monRaw.slice(1).toLowerCase()
    : "";
  let out = day;
  if (day.length === 2) out += "-" + mon;
  else if (mon) out += "-" + mon; // user pasted; keep together
  if (mon.length === 3) out += "-" + year;
  else if (year) out += "-" + year;
  return out;
}

export function isValidDob(v: string): boolean {
  const m = /^(\d{2})-([A-Z][a-z]{2})-(\d{4})$/.exec(v || "");
  if (!m) return false;
  const d = parseInt(m[1], 10);
  const mi = _MONTHS_SHORT.indexOf(m[2]);
  const y = parseInt(m[3], 10);
  if (mi < 0) return false;
  const now = new Date();
  if (y < 1900 || y > now.getFullYear()) return false;
  const dt = new Date(y, mi, d);
  return dt.getDate() === d && dt.getMonth() === mi && dt.getFullYear() === y;
}

/** Convert "DD-MMM-YYYY" -> "YYYY-MM-DD" for storage/API. */
export function dobToIso(v: string): string {
  const m = /^(\d{2})-([A-Z][a-z]{2})-(\d{4})$/.exec(v || "");
  if (!m) return "";
  const mi = _MONTHS_SHORT.indexOf(m[2]);
  if (mi < 0) return "";
  const mm = String(mi + 1).padStart(2, "0");
  return `${m[3]}-${mm}-${m[1]}`;
}

/** Convert "YYYY-MM-DD" -> "DD-MMM-YYYY" for pre-fill. */
export function dobFromIso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return "";
  const mi = parseInt(m[2], 10) - 1;
  if (mi < 0 || mi > 11) return "";
  return `${m[3]}-${_MONTHS_SHORT[mi]}-${m[1]}`;
}

export function DobInput({
  label,
  value,
  onChangeText,
  required,
  hint,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  required?: boolean;
  hint?: string;
  testID?: string;
}) {
  const handle = (raw: string) => onChangeText(_formatDob(raw));
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={{ color: colors.primary }}> *</Text>}
      </Text>
      <TextInput
        testID={testID || "dob-input"}
        style={styles.input}
        value={value}
        onChangeText={handle}
        placeholder="DD-MMM-YYYY  (e.g. 12-Jan-1990)"
        placeholderTextColor={colors.textMuted}
        maxLength={11}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <Text style={styles.hint}>
        {hint || "Type day, month name (Jan-Dec) and year — dashes auto-fill."}
      </Text>
    </View>
  );
}

// -----------------------------------------------------------------------------
// TimeInput — masked "HH:MM" input in 12-hour format with AM/PM chips.
//
// The colon is auto-inserted after the 2nd digit; hours are clamped to 1..12
// and minutes to 00..59. The exported value is always "HH:MM AM" or "HH:MM PM".
// -----------------------------------------------------------------------------
function _formatTime12(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "").slice(0, 4);
  const h = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  if (!h) return "";
  if (h.length < 2) return h;
  return m ? `${h}:${m}` : `${h}:`;
}

function _splitTime(v: string): { hhmm: string; ap: "AM" | "PM" } {
  const trimmed = (v || "").trim();
  const upper = trimmed.toUpperCase();
  const ap: "AM" | "PM" = upper.endsWith("PM") ? "PM" : "AM";
  const hhmm = upper.replace(/\s*(AM|PM)$/, "").trim();
  return { hhmm, ap };
}

export function isValidTime12(v: string): boolean {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((v || "").trim());
  if (!m) return false;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  return h >= 1 && h <= 12 && mm >= 0 && mm <= 59;
}

/** Convert "hh:mm AM/PM" -> "HH:MM" (24-hour) for storage. */
export function time12To24(v: string): string {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((v || "").trim());
  if (!m) return "";
  let h = parseInt(m[1], 10);
  const mm = m[2];
  const ap = m[3].toUpperCase();
  if (ap === "AM") h = h === 12 ? 0 : h;
  else h = h === 12 ? 12 : h + 12;
  return `${String(h).padStart(2, "0")}:${mm}`;
}

/** Convert "HH:MM" (24-hour) -> "hh:mm AM/PM" for pre-fill / display. */
export function time24To12(v: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec((v || "").trim());
  if (!m) return "";
  const h24 = parseInt(m[1], 10);
  const mm = m[2];
  if (h24 < 0 || h24 > 23) return "";
  const ap = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${String(h12).padStart(2, "0")}:${mm} ${ap}`;
}

export function TimeInput({
  label,
  value,
  onChangeText,
  testID,
}: {
  label?: string;
  /** "hh:mm AM/PM" — kept as this exact shape at all times. */
  value: string;
  onChangeText: (v: string) => void;
  testID?: string;
}) {
  const { hhmm, ap } = _splitTime(value);
  const commit = (nextHhmm: string, nextAp: "AM" | "PM") => {
    onChangeText(nextHhmm ? `${nextHhmm} ${nextAp}` : "");
  };
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TextInput
          testID={testID || "time-input"}
          style={[styles.input, { flex: 1 }]}
          value={hhmm}
          onChangeText={(raw) => commit(_formatTime12(raw), ap)}
          placeholder="HH:MM"
          placeholderTextColor={colors.textMuted}
          maxLength={5}
          keyboardType="numeric"
          autoCorrect={false}
        />
        <View style={{ flexDirection: "row", gap: 6 }}>
          {(["AM", "PM"] as const).map((k) => (
            <TouchableOpacity
              key={k}
              testID={`${testID || "time-input"}-${k.toLowerCase()}`}
              onPress={() => commit(hhmm, k)}
              activeOpacity={0.85}
              style={[
                styles.chip,
                {
                  borderColor: ap === k ? colors.primary : colors.borderStrong,
                  backgroundColor: ap === k ? colors.primarySoft : colors.surface,
                },
              ]}
            >
              <Text
                style={{
                  color: ap === k ? colors.primary : colors.textSecondary,
                  fontWeight: font.black,
                  fontSize: 12,
                  letterSpacing: 0.5,
                }}
              >
                {k}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: font.bold,
    color: colors.textSecondary,
    marginBottom: 6,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    minHeight: 48,
  },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  docBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: 14,
    backgroundColor: colors.surfaceAlt,
    minHeight: 64,
  },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.surface },
  galThumbWrap: { width: 84, height: 84, borderRadius: radius.md, overflow: "hidden", position: "relative", borderWidth: 1, borderColor: colors.borderStrong },
  galThumb: { width: "100%", height: "100%", backgroundColor: colors.surfaceAlt },
  galRemove: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  galAdd: { width: 84, height: 84, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.primary, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: font.black,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
});
