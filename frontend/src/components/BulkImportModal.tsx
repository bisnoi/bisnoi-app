import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Platform, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";
import { Button } from "@/src/components/ui";
import { parseCsv, rowsToMenuItems, CSV_SAMPLE, CSV_TEMPLATE, downloadCsv } from "@/src/utils/csv";

function pickCsvFileWeb(): Promise<string | null> {
  return new Promise((resolve) => {
    if (Platform.OS !== "web" || typeof document === "undefined") return resolve(null);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv,text/plain";
    input.onchange = () => {
      const file = (input.files && input.files[0]) || null;
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}

export function BulkImportModal({
  visible,
  subtitle,
  onClose,
  onImport,
}: {
  visible: boolean;
  subtitle?: string;
  onClose: () => void;
  onImport: (items: any[]) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const parsed = useMemo(() => {
    if (!text.trim()) return { items: [], errors: [] as string[] };
    try {
      const rows = parseCsv(text);
      return rowsToMenuItems(rows);
    } catch (e: any) {
      return { items: [], errors: [String(e?.message || e)] };
    }
  }, [text]);

  if (!visible) return null;

  const doImport = async () => {
    if (parsed.items.length === 0) return;
    setBusy(true);
    setDone(null);
    try {
      await onImport(parsed.items);
      setDone(`Imported ${parsed.items.length} item(s) successfully.`);
      setText("");
    } catch (e: any) {
      setDone(`Error: ${e?.message || "Import failed"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.overlay} testID="bulk-import-modal">
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      <View style={styles.card}>
        <View style={styles.head}>
          <Text style={styles.title}>Bulk Import Menu (CSV)</Text>
          <TouchableOpacity testID="bulk-close" onPress={onClose} hitSlop={10}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
        </View>
        {!!subtitle && <Text style={styles.sub}>{subtitle}</Text>}
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 10 }}>
          <Text style={styles.help}>Columns: <Text style={styles.code}>name, price, category, veg, description, image</Text>. Header row required. veg = true/false. image = a public URL (optional).</Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {Platform.OS === "web" && (
              <TouchableOpacity testID="bulk-download-template" style={styles.miniBtn} onPress={() => downloadCsv("bisnoi_menu_template.csv", CSV_TEMPLATE)}>
                <Ionicons name="download-outline" size={15} color={colors.primary} />
                <Text style={styles.miniTxt}>Download template</Text>
              </TouchableOpacity>
            )}
            {Platform.OS === "web" && (
              <TouchableOpacity testID="bulk-upload-file" style={styles.miniBtn} onPress={async () => { const t = await pickCsvFileWeb(); if (t) setText(t); }}>
                <Ionicons name="cloud-upload-outline" size={15} color={colors.primary} />
                <Text style={styles.miniTxt}>Upload .csv</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity testID="bulk-sample" style={styles.miniBtn} onPress={() => setText(CSV_SAMPLE)}>
              <Ionicons name="document-text-outline" size={15} color={colors.primary} />
              <Text style={styles.miniTxt}>Insert sample</Text>
            </TouchableOpacity>
            {!!text && (
              <TouchableOpacity testID="bulk-clear" style={styles.miniBtn} onPress={() => { setText(""); setDone(null); }}>
                <Ionicons name="trash-outline" size={15} color={colors.error} />
                <Text style={[styles.miniTxt, { color: colors.error }]}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <TextInput
            testID="bulk-csv-input"
            value={text}
            onChangeText={setText}
            placeholder={"Paste CSV here...\n" + CSV_SAMPLE}
            placeholderTextColor={colors.textMuted}
            multiline
            style={styles.input}
          />
          {text.trim() ? (
            <View style={styles.previewBox}>
              <Text style={styles.previewTitle}>{parsed.items.length} item(s) ready to import</Text>
              {parsed.items.slice(0, 6).map((it, i) => (
                <Text key={i} style={styles.previewLine} numberOfLines={1}>• {it.name} — ₹{it.price} {it.category ? `(${it.category})` : ""}</Text>
              ))}
              {parsed.items.length > 6 && <Text style={styles.previewLine}>…and {parsed.items.length - 6} more</Text>}
              {parsed.errors.slice(0, 5).map((er, i) => (
                <Text key={"e" + i} style={styles.errLine}>{er}</Text>
              ))}
            </View>
          ) : null}
          {done && <Text style={[styles.done, done.startsWith("Error") ? { color: colors.error } : { color: colors.success }]}>{done}</Text>}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
          <View style={{ flex: 1 }}><Button title="Close" variant="secondary" onPress={onClose} full /></View>
          <View style={{ flex: 1.4 }}>
            <Button testID="bulk-import-btn" title={busy ? "Importing..." : `Import ${parsed.items.length || ""} items`} icon="cloud-upload" onPress={doImport} disabled={busy || parsed.items.length === 0} full />
          </View>
        </View>
        {busy && <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...(Platform.OS === "web" ? ({ position: "fixed" } as object) : {}), position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: spacing.lg, zIndex: 9999 } as any,
  card: { width: "100%", maxWidth: 480, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 17, fontWeight: font.black, color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textSecondary, marginTop: 2, marginBottom: 6 },
  help: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  code: { color: colors.primary, fontWeight: font.bold },
  miniBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.background },
  miniTxt: { fontSize: 12, fontWeight: font.bold, color: colors.primary },
  input: { minHeight: 140, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, padding: 12, fontSize: 13, color: colors.textPrimary, textAlignVertical: "top", fontFamily: Platform.OS === "web" ? "monospace" : undefined } as any,
  previewBox: { backgroundColor: colors.background, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 3 },
  previewTitle: { fontSize: 13, fontWeight: font.black, color: colors.textPrimary, marginBottom: 2 },
  previewLine: { fontSize: 12, color: colors.textSecondary },
  errLine: { fontSize: 12, color: colors.error },
  done: { fontSize: 13, fontWeight: font.bold, marginTop: 4 },
});
