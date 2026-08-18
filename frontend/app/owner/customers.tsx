import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, Platform, Linking, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { Api } from "@/src/api";
import { Screen, ScreenHeader } from "@/src/components/ScreenHeader";
import { colors, spacing, radius, font, shadow } from "@/src/theme";

type SegKey = "dinein" | "uploaded";
const SEGS: { key: SegKey; label: string; icon: any }[] = [
  { key: "dinein",   label: "Dine-in",   icon: "restaurant" },
  { key: "uploaded", label: "Uploaded",  icon: "cloud-upload" },
];

// Parse CSV / newline-separated / comma-separated text into rows.
// Accepts "name,phone" per line; header "name,phone" is skipped if present.
function parseCsv(text: string): { name: string; phone: string }[] {
  const out: { name: string; phone: string }[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    // simple 2-column split — tolerate commas or tabs
    const parts = line.split(/[,\t]/).map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length < 2) continue;
    const [c0, c1] = parts;
    // Skip a header row
    if (/^name$/i.test(c0) && /^phone$/i.test(c1)) continue;
    // Support "phone,name" as well as "name,phone" — detect by digits
    const looksPhone = (s: string) => /\d{7,}/.test(s.replace(/\D/g, ""));
    const phone = looksPhone(c1) ? c1 : looksPhone(c0) ? c0 : "";
    const name  = phone === c1 ? c0 : phone === c0 ? c1 : "";
    if (!phone) continue;
    out.push({ name, phone });
  }
  return out;
}

export default function OwnerCustomers() {
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState<SegKey>("dinein");
  const [search, setSearch]   = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [error, setError]     = useState("");

  // Upload modal state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadText, setUploadText] = useState("");
  const [replace, setReplace]       = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [uploadErr, setUploadErr]   = useState("");
  const [uploadResult, setUploadResult] = useState<any>(null);

  // Campaign modal state
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaignMsg, setCampaignMsg]   = useState("");
  const [sending, setSending]           = useState(false);
  const [campErr, setCampErr]           = useState("");
  const [campResult, setCampResult]     = useState<any>(null);

  const load = useCallback(async (seg: SegKey, q: string) => {
    setLoading(true); setError("");
    try {
      const r: any = await Api.marketingCustomers({ segment: seg, q: q || undefined });
      setRows(r?.customers || []);
    } catch (e: any) {
      setError(e?.message || "Could not load customers");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(segment, search); /* eslint-disable-next-line */ }, [load]));

  const onSeg = (k: SegKey) => { setSegment(k); load(k, search); };
  const onSearch = () => load(segment, search);

  const toggleAll = () => {
    if (Object.keys(selected).length === rows.length) {
      setSelected({});
    } else {
      const m: Record<string, boolean> = {};
      rows.forEach((r) => { m[r.phone] = true; });
      setSelected(m);
    }
  };
  const toggle = (phone: string) => setSelected((p) => ({ ...p, [phone]: !p[phone] }));
  const selectedPhones = useMemo(() => rows.map((r) => r.phone).filter((p) => selected[p]), [rows, selected]);

  const startUpload = () => {
    setUploadText(""); setReplace(false); setUploadErr(""); setUploadResult(null); setUploadOpen(true);
  };

  const pickFile = async () => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      Alert.alert("Web only", "File picker is web-only right now. You can paste CSV text in the box below instead.");
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.txt,text/csv,text/plain";
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => setUploadText(String(reader.result || ""));
      reader.readAsText(f);
    };
    input.click();
  };

  const submitUpload = async () => {
    setUploadErr(""); setUploadResult(null);
    const parsed = parseCsv(uploadText);
    if (parsed.length === 0) { setUploadErr("No valid rows found. Format: name,phone per line."); return; }
    setUploading(true);
    try {
      const r: any = await Api.ownerCustomersUpload({ customers: parsed, replace });
      setUploadResult(r);
      await load(segment, search);
    } catch (e: any) {
      setUploadErr(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    const url = Api.ownerCustomersTemplateUrl();
    if (Platform.OS === "web" && typeof document !== "undefined") {
      // Attach auth via fetch → blob → programmatic download (backend requires bearer token)
      (async () => {
        try {
          const token = (await import("@/src/utils/storage")).storage;
          const t = await token.getItem<string>("auth_token", "");
          const res = await fetch(url, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const objUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = objUrl;
          a.download = "bisnoi_customers_template.csv";
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
        } catch (e: any) {
          Alert.alert("Download failed", e?.message || String(e));
        }
      })();
    } else {
      Linking.openURL(url);
    }
  };

  const deleteOne = async (row: any) => {
    if (!row.uploaded) { Alert.alert("Not deletable", "Only manually uploaded customers can be deleted."); return; }
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      const ok = window.confirm(`Delete ${row.name || row.phone}?`); if (!ok) return;
    }
    try {
      await Api.ownerCustomersDelete(row.phone);
      setSelected((p) => { const n = { ...p }; delete n[row.phone]; return n; });
      await load(segment, search);
    } catch (e: any) {
      Alert.alert("Delete failed", e?.message || String(e));
    }
  };

  const waLink = (row: any) => {
    const digits = String(row.phone).replace(/\D/g, "");
    const full = digits.length === 10 ? `91${digits}` : digits;
    const url = `https://wa.me/${full}?text=${encodeURIComponent(`Hello ${row.name || ""}!`.trim())}`;
    if (Platform.OS === "web") window.open(url, "_blank");
    else Linking.openURL(url);
  };

  const openCampaign = () => {
    if (selectedPhones.length === 0) {
      Alert.alert("Select recipients", "Pick at least one customer with the checkbox first.");
      return;
    }
    setCampaignMsg(""); setCampErr(""); setCampResult(null); setCampaignOpen(true);
  };
  const sendCampaign = async () => {
    setCampErr(""); setCampResult(null);
    const msg = campaignMsg.trim();
    if (msg.length < 3) { setCampErr("Message is too short"); return; }
    if (selectedPhones.length === 0) { setCampErr("No recipients selected"); return; }
    setSending(true);
    try {
      const r: any = await Api.marketingSendCampaign({ message: msg, phones: selectedPhones });
      setCampResult(r);
    } catch (e: any) {
      setCampErr(e?.message || "Send failed");
    } finally {
      setSending(false);
    }
  };

  const allSelected = rows.length > 0 && Object.keys(selected).filter((k) => selected[k]).length === rows.length;

  const counts = useMemo(() => {
    const c = { total: rows.length, dinein: 0, uploaded: 0 };
    rows.forEach((r) => {
      if ((r.sources || []).includes("dinein")) c.dinein++;
      if (r.uploaded) c.uploaded++;
    });
    return c;
  }, [rows]);

  return (
    <Screen>
      <ScreenHeader
        title="Customers"
        subtitle="Dine-in & uploaded contacts"
        right={
          <TouchableOpacity onPress={() => router.push("/owner/marketing" as any)} testID="customers-goto-marketing" style={styles.smallBtn}>
            <Ionicons name="megaphone" size={14} color={colors.onPrimary} />
            <Text style={styles.smallBtnTxt}>Marketing</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {/* Stat pills */}
        <View style={styles.statsRow} testID="customers-stats">
          <Stat label="Shown"   value={counts.total} color={colors.primary} icon="people" />
          <Stat label="Dine-in" value={counts.dinein} color="#F59E0B" icon="restaurant" />
          <Stat label="Uploaded" value={counts.uploaded} color="#8B5CF6" icon="cloud-upload" />
        </View>

        {/* Actions row */}
        <View style={styles.actionRow}>
          <TouchableOpacity onPress={startUpload} testID="customers-upload-btn" style={[styles.actBtn, { backgroundColor: colors.primary }]}>
            <Ionicons name="cloud-upload" size={16} color={colors.onPrimary} />
            <Text style={styles.actTxt}>Upload Customers</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={downloadTemplate} testID="customers-download-template" style={[styles.actBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary }]}>
            <Ionicons name="download" size={16} color={colors.primary} />
            <Text style={[styles.actTxt, { color: colors.primary }]}>Download Template (CSV)</Text>
          </TouchableOpacity>
        </View>

        {/* Filters */}
        <View style={styles.segRow}>
          {SEGS.map((s) => {
            const active = segment === s.key;
            return (
              <TouchableOpacity
                key={s.key}
                testID={`customers-seg-${s.key}`}
                onPress={() => onSeg(s.key)}
                activeOpacity={0.85}
                style={[styles.seg, active && styles.segActive]}
              >
                <Ionicons name={s.icon} size={13} color={active ? colors.onPrimary : colors.textPrimary} />
                <Text style={[styles.segTxt, active && { color: colors.onPrimary }]}>{s.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <TextInput
            testID="customers-search"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={onSearch}
            placeholder="Search by name or phone"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { flex: 1 }]}
          />
          <TouchableOpacity onPress={onSearch} style={styles.searchBtn}>
            <Ionicons name="search" size={18} color={colors.onPrimary} />
          </TouchableOpacity>
        </View>

        {/* Bulk toolbar */}
        <View style={styles.bulkBar}>
          <TouchableOpacity onPress={toggleAll} testID="customers-toggle-all" style={styles.checkboxOuter}>
            <View style={[styles.checkbox, allSelected && styles.checkboxOn]}>
              {allSelected ? <Ionicons name="checkmark" size={13} color={colors.onPrimary} /> : null}
            </View>
            <Text style={styles.bulkTxt}>{selectedPhones.length}/{rows.length} selected</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openCampaign}
            disabled={selectedPhones.length === 0}
            testID="customers-send-campaign"
            style={[styles.campBtn, selectedPhones.length === 0 && { opacity: 0.5 }]}
            activeOpacity={0.9}
          >
            <Ionicons name="paper-plane" size={14} color={colors.onPrimary} />
            <Text style={styles.campBtnTxt}>WhatsApp Campaign</Text>
          </TouchableOpacity>
        </View>

        {/* List */}
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
        ) : error ? (
          <Text style={styles.err}>{error}</Text>
        ) : rows.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="people-outline" size={26} color={colors.textMuted} />
            <Text style={styles.emptyTxt}>
              No customers yet in this view. Dine-in bills and delivery orders will populate here automatically, or upload a CSV.
            </Text>
          </View>
        ) : rows.map((r) => (
          <View key={r.phone} style={styles.row} testID={`customer-row-${r.phone}`}>
            <TouchableOpacity onPress={() => toggle(r.phone)} style={styles.checkboxOuter}>
              <View style={[styles.checkbox, selected[r.phone] && styles.checkboxOn]}>
                {selected[r.phone] ? <Ionicons name="checkmark" size={13} color={colors.onPrimary} /> : null}
              </View>
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <Text style={styles.rowName} numberOfLines={1}>{r.name || "Customer"}</Text>
              <Text style={styles.rowMeta}>+91 {r.phone}{r.orders ? ` • ${r.orders} order${r.orders !== 1 ? "s" : ""}` : ""}</Text>
              <View style={styles.sourceRow}>
                {(r.sources || []).map((s: string) => (
                  <View key={s} style={[styles.tag, tagBg(s)]}>
                    <Text style={styles.tagTxt}>{prettySource(s)}</Text>
                  </View>
                ))}
                {r.uploaded && !(r.sources || []).includes("uploaded") ? (
                  <View style={[styles.tag, tagBg("uploaded")]}><Text style={styles.tagTxt}>UPLOADED</Text></View>
                ) : null}
              </View>
            </View>

            <TouchableOpacity onPress={() => waLink(r)} testID={`customer-wa-${r.phone}`} style={styles.waBtn}>
              <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
            </TouchableOpacity>
            {r.uploaded ? (
              <TouchableOpacity onPress={() => deleteOne(r)} testID={`customer-delete-${r.phone}`} style={styles.delBtn}>
                <Ionicons name="trash" size={14} color={colors.error} />
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </ScrollView>

      {/* Upload modal */}
      <Modal visible={uploadOpen} transparent animationType="fade" onRequestClose={() => setUploadOpen(false)}>
        <View style={styles.mBg}>
          <View style={styles.mCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="cloud-upload" size={20} color={colors.primary} />
              <Text style={styles.mTitle}>Upload customers</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => setUploadOpen(false)}><Ionicons name="close" size={22} color={colors.textSecondary} /></TouchableOpacity>
            </View>
            <Text style={styles.mHint}>
              Paste rows as <Text style={{ fontWeight: font.black }}>name,phone</Text> (one per line) or click "Choose file" to pick a CSV. Header row is optional.
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: spacing.sm }}>
              <TouchableOpacity onPress={pickFile} testID="upload-pick-file" style={styles.pickBtn}>
                <Ionicons name="document" size={14} color={colors.primary} />
                <Text style={styles.pickTxt}>Choose CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={downloadTemplate} testID="upload-download-template" style={styles.pickBtn}>
                <Ionicons name="download" size={14} color={colors.primary} />
                <Text style={styles.pickTxt}>Get template</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              testID="upload-text"
              value={uploadText}
              onChangeText={setUploadText}
              placeholder={"name,phone\nRavi Kumar,9111100001\nAnanya Sharma,9111100002"}
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.input, { minHeight: 140, textAlignVertical: "top", fontFamily: Platform.OS === "web" ? "monospace" : undefined }]}
            />

            <TouchableOpacity onPress={() => setReplace((v) => !v)} testID="upload-replace-toggle" style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
              <View style={[styles.checkbox, replace && styles.checkboxOn]}>
                {replace ? <Ionicons name="checkmark" size={13} color={colors.onPrimary} /> : null}
              </View>
              <Text style={styles.rowMeta}>Replace existing uploaded list (dine-in/delivery are never touched)</Text>
            </TouchableOpacity>

            {uploadErr ? <Text style={styles.err}>{uploadErr}</Text> : null}
            {uploadResult ? (
              <View style={styles.okBox}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={styles.okTxt}>
                  Added {uploadResult.added} • Updated {uploadResult.updated} • Skipped {uploadResult.skipped} • Total uploaded {uploadResult.total}
                </Text>
              </View>
            ) : null}

            <TouchableOpacity
              testID="upload-submit"
              disabled={uploading}
              onPress={submitUpload}
              style={[styles.saveBtn, uploading && { opacity: 0.6 }]}
              activeOpacity={0.9}
            >
              {uploading ? <ActivityIndicator color={colors.onPrimary} /> : (
                <>
                  <Ionicons name="checkmark" size={18} color={colors.onPrimary} />
                  <Text style={styles.saveTxt}>Upload</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Campaign modal */}
      <Modal visible={campaignOpen} transparent animationType="fade" onRequestClose={() => setCampaignOpen(false)}>
        <View style={styles.mBg}>
          <View style={styles.mCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="paper-plane" size={20} color={colors.primary} />
              <Text style={styles.mTitle}>WhatsApp campaign</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => setCampaignOpen(false)}><Ionicons name="close" size={22} color={colors.textSecondary} /></TouchableOpacity>
            </View>
            <Text style={styles.mHint}>Sending to {selectedPhones.length} selected customers. Message text will be delivered via WhatsApp (or a wa.me link if the template isn't configured yet).</Text>
            <TextInput
              testID="campaign-message"
              value={campaignMsg}
              onChangeText={setCampaignMsg}
              placeholder="Weekend special — 20% off all thalis until Sunday!"
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.input, { minHeight: 110, textAlignVertical: "top" }]}
            />
            {campErr ? <Text style={styles.err}>{campErr}</Text> : null}
            {campResult ? (
              <View style={styles.okBox}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={styles.okTxt}>
                  Sent {campResult.sent}/{campResult.recipients} • Cost {"\u20B9"}{Number(campResult.cost || 0).toFixed(2)} • Balance {"\u20B9"}{Number(campResult.balance || 0).toFixed(2)}
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              testID="campaign-send"
              disabled={sending}
              onPress={sendCampaign}
              style={[styles.saveBtn, sending && { opacity: 0.6 }]}
              activeOpacity={0.9}
            >
              {sending ? <ActivityIndicator color={colors.onPrimary} /> : (
                <>
                  <Ionicons name="paper-plane" size={18} color={colors.onPrimary} />
                  <Text style={styles.saveTxt}>Send</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function Stat({ label, value, color, icon }: { label: string; value: number; color: string; icon: any }) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIc, { backgroundColor: color + "22" }]}><Ionicons name={icon} size={14} color={color} /></View>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

function prettySource(s: string) {
  if (s === "dinein") return "DINE-IN";
  if (s === "delivery") return "DELIVERY";
  if (s === "uploaded") return "UPLOADED";
  return String(s || "").toUpperCase();
}
function tagBg(s: string) {
  if (s === "dinein") return { backgroundColor: "#F59E0B22" };
  if (s === "delivery") return { backgroundColor: "#0EA5E922" };
  if (s === "uploaded") return { backgroundColor: "#8B5CF622" };
  return { backgroundColor: colors.surfaceAlt };
}

const styles = StyleSheet.create({
  smallBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  smallBtnTxt: { color: colors.onPrimary, fontSize: 12, fontWeight: font.black },

  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  stat: { flexGrow: 1, minWidth: 100, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, ...shadow.card },
  statIc: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary, marginTop: 6 },
  statLbl: { fontSize: 11, fontWeight: font.semi, color: colors.textSecondary, marginTop: 1 },

  actionRow: { flexDirection: "row", gap: 8, marginTop: spacing.sm },
  actBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.md, paddingVertical: 12 },
  actTxt: { fontSize: 13, fontWeight: font.black, color: colors.onPrimary },

  segRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.md },
  seg: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, paddingHorizontal: 10, paddingVertical: 6 },
  segActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segTxt: { fontSize: 12, fontWeight: font.bold, color: colors.textPrimary },

  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.textPrimary },
  searchBtn: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },

  bulkBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: spacing.md, marginBottom: spacing.sm },
  bulkTxt: { fontSize: 13, color: colors.textSecondary, fontWeight: font.semi },
  campBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  campBtnTxt: { color: colors.onPrimary, fontSize: 12.5, fontWeight: font.black },

  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 10, marginBottom: 6 },
  checkboxOuter: { flexDirection: "row", alignItems: "center", gap: 6 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  rowName: { fontSize: 14, fontWeight: font.black, color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  sourceRow: { flexDirection: "row", gap: 4, marginTop: 5 },
  tag: { borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  tagTxt: { fontSize: 9.5, fontWeight: font.black, color: colors.textPrimary, letterSpacing: 0.3 },

  waBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#25D36622" },
  delBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },

  emptyBox: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginTop: spacing.md },
  emptyTxt: { flex: 1, color: colors.textSecondary, fontSize: 13, fontWeight: font.semi, lineHeight: 18 },
  err: { color: colors.error, fontSize: 13, fontWeight: font.semi, marginTop: spacing.sm },
  okBox: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: colors.successSoft, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  okTxt: { flex: 1, color: colors.success, fontSize: 12.5, fontWeight: font.semi },

  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, borderRadius: radius.lg, height: 50, marginTop: spacing.md, ...shadow.lifted },
  saveTxt: { fontSize: 15, fontWeight: font.black, color: colors.onPrimary },

  pickBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, paddingHorizontal: 12, paddingVertical: 8 },
  pickTxt: { fontSize: 12, fontWeight: font.black, color: colors.primary },

  mBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: spacing.lg },
  mCard: { width: "100%", maxWidth: 560, backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, ...shadow.lifted },
  mTitle: { fontSize: 17, fontWeight: font.black, color: colors.textPrimary },
  mHint: { fontSize: 12, color: colors.textSecondary, marginTop: 6, marginBottom: spacing.md, lineHeight: 18 },
});
