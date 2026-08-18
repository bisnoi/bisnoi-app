import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Image, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

const BASE = process.env.EXPO_PUBLIC_DINEIN_BASE_URL || "https://bisnoi.com";

function tableLink(rid: string, tableId: string, token: string) {
  return `${BASE}/dinein?rid=${encodeURIComponent(rid)}&tid=${encodeURIComponent(tableId)}&t=${encodeURIComponent(token)}`;
}
function qrImg(data: string, size = 220) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(data)}`;
}
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new (window as any).Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(" ");
  let line = "";
  let curY = y;
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + " ";
    if (ctx.measureText(testLine).width > maxWidth && line !== "") {
      ctx.fillText(line.trim(), cx, curY);
      line = words[i] + " ";
      curY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), cx, curY);
}

/** Draws the branded poster on a canvas and returns its PNG data URL (web only). */
async function renderBrandedQr(restaurantName: string, tableLabel: string, link: string): Promise<string> {
  const loadedQr = await loadImage(qrImg(link, 480));
  const W = 800, H = 1000;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported on this browser");

  const DARK = "#123524";
  const DARK2 = "#0B2A1C";
  const GOLD = "#D9A94A";

  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, DARK);
  bgGrad.addColorStop(1, DARK2);
  ctx.fillStyle = bgGrad;
  drawRoundedRect(ctx, 0, 0, W, H, 40);
  ctx.fill();

  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 6;
  drawRoundedRect(ctx, 12, 12, W - 24, H - 24, 34);
  ctx.stroke();

  ctx.textAlign = "center";
  if (restaurantName) {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 52px sans-serif";
    ctx.fillText(restaurantName.toUpperCase(), W / 2, 130);
  }

  const badgeW = 260, badgeH = 56, badgeY = 175;
  ctx.fillStyle = GOLD;
  drawRoundedRect(ctx, (W - badgeW) / 2, badgeY, badgeW, badgeH, 28);
  ctx.fill();
  ctx.fillStyle = DARK;
  ctx.font = "bold 24px sans-serif";
  ctx.fillText("SCAN TO ORDER", W / 2, badgeY + 37);

  const qrBoxSize = 480, qrBoxY = 270;
  ctx.fillStyle = "#FFFFFF";
  drawRoundedRect(ctx, (W - qrBoxSize) / 2, qrBoxY, qrBoxSize, qrBoxSize, 24);
  ctx.fill();
  const qrPad = 30;
  ctx.drawImage(loadedQr, (W - qrBoxSize) / 2 + qrPad, qrBoxY + qrPad, qrBoxSize - qrPad * 2, qrBoxSize - qrPad * 2);

  if (restaurantName) {
    const logoR = 44;
    const logoX = W / 2, logoY = qrBoxY + qrBoxSize / 2;
    ctx.fillStyle = DARK;
    ctx.beginPath();
    ctx.arc(logoX, logoY, logoR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 40px sans-serif";
    ctx.fillText(restaurantName.trim().charAt(0).toUpperCase(), logoX, logoY + 14);
  }

  const labelY = qrBoxY + qrBoxSize + 70;
  ctx.fillStyle = GOLD;
  ctx.font = "bold 20px sans-serif";
  ctx.fillText("TABLE", W / 2, labelY);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 44px sans-serif";
  ctx.fillText(tableLabel || "-", W / 2, labelY + 50);

  ctx.fillStyle = "#CFE0D6";
  ctx.font = "18px sans-serif";
  wrapCanvasText(ctx, "Scan this code to view the menu and place your order.", W / 2, labelY + 100, W - 160, 24);

  return canvas.toDataURL("image/png");
}

function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function OwnerTableQr() {
  const router = useRouter();
  const [rest, setRest] = useState<any>(null);
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);

  const load = useCallback(async () => {
    try {
      const r: any = await Api.ownerMyRestaurant();
      setRest(r);
      if (r?.id) {
        const t: any = await Api.ownerTables(r.id);
        const list = Array.isArray(t) ? t : (t?.tables || []);
        setTables(list);
        setCount(String(list.length || ""));
      }
    } catch (e: any) {
      setMsg(e?.message || "Could not load tables");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const applyCount = async () => {
    const n = parseInt(count || "0", 10);
    if (!Number.isFinite(n) || n < 0 || saving || !rest?.id) return;
    setSaving(true); setMsg("");
    try {
      const t: any = await Api.ownerSetTableCount(n, rest.id);
      const list = Array.isArray(t) ? t : (t?.tables || []);
      setTables(list);
      setMsg(`${list.length} table${list.length === 1 ? "" : "s"} ready. QR codes updated.`);
    } catch (e: any) {
      setMsg(e?.message || "Could not update tables");
    } finally {
      setSaving(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => (prev.size === tables.length ? new Set() : new Set(tables.map((t: any) => t.id))));
  };

  const downloadOne = async (tb: any) => {
    const link = tableLink(rest.id, tb.id, tb.qr_token || "");
    const fileSafeLabel = (tb.label || "table").replace(/[^a-z0-9]+/gi, "-");
    if (Platform.OS === "web") {
      const dataUrl = await renderBrandedQr(rest?.name || "", tb.label, link);
      triggerDownload(dataUrl, `table-${fileSafeLabel}-qr.png`);
    } else {
      const qrPngUrl = qrImg(link, 800);
      const fileUri = `${FileSystem.cacheDirectory}table-${fileSafeLabel}-qr.png`;
      const dl = await FileSystem.downloadAsync(qrPngUrl, fileUri);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(dl.uri, { mimeType: "image/png", dialogTitle: `${tb.label} QR code` });
      }
    }
  };

  const downloadQr = async (tb: any) => {
    setDownloadingId(tb.id);
    try {
      await downloadOne(tb);
    } catch (e: any) {
      if (Platform.OS === "web" && typeof window !== "undefined") window.alert(e?.message || "Could not download QR");
    } finally {
      setDownloadingId(null);
    }
  };

  const downloadSelected = async () => {
    const chosen = tables.filter((t: any) => selected.has(t.id));
    if (chosen.length === 0) return;
    setBulkDownloading(true);
    try {
      for (const tb of chosen) {
        await downloadOne(tb);
        // Small gap so the browser doesn't block rapid-fire downloads.
        await sleep(350);
      }
    } catch (e: any) {
      if (Platform.OS === "web" && typeof window !== "undefined") window.alert(e?.message || "Could not download all QR codes");
    } finally {
      setBulkDownloading(false);
    }
  };

  const allSelected = tables.length > 0 && selected.size === tables.length;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={22} color={colors.textPrimary} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.hTitle}>Dine-in QR Codes</Text>
          <Text style={styles.hSub}>One QR per table — print & place on each</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={18} color={colors.primary} />
              <Text style={styles.infoTxt}>
                Print a QR for <Text style={{ fontWeight: font.black }}>each</Text> table and place it there. Guests scan their table's QR → download the Bisnoi app → land straight on the menu for that exact table → order. It lands in your Dine-in & Kitchen (KDS) instantly. Payment is collected at the counter.
              </Text>
            </View>

            <Text style={styles.sectionLabel}>NUMBER OF TABLES</Text>
            <Text style={styles.tblHint}>Sets how many tables — and QR codes — exist for this restaurant.</Text>
            <View style={styles.countRow}>
              <TextInput
                testID="qr-table-count"
                value={count}
                onChangeText={(v) => setCount(v.replace(/[^0-9]/g, ""))}
                keyboardType="numeric"
                placeholder="e.g. 10"
                placeholderTextColor={colors.textMuted}
                style={styles.countInput}
              />
              <TouchableOpacity testID="qr-apply-count" onPress={applyCount} disabled={saving} style={[styles.applyBtn, { opacity: saving ? 0.6 : 1 }]}>
                {saving ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.applyTxt}>Apply</Text>}
              </TouchableOpacity>
            </View>
            {msg ? <Text style={styles.msg}>{msg}</Text> : null}

            {/* Per-table QR list */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: 4 }}>
              <Text style={[styles.sectionLabel, { marginTop: 0 }]}>TABLE QR CODES</Text>
              {tables.length > 0 && (
                <TouchableOpacity testID="qr-select-all" onPress={toggleSelectAll} style={styles.selectAllBtn}>
                  <Ionicons name={allSelected ? "checkbox" : "square-outline"} size={16} color={colors.primary} />
                  <Text style={styles.selectAllTxt}>{allSelected ? "Deselect all" : "Select all"}</Text>
                </TouchableOpacity>
              )}
            </View>

            {rest?.id && tables.length > 0 ? (
              <>
                <View style={styles.qrGrid}>
                  {tables.map((tb: any) => {
                    const link = tableLink(rest.id, tb.id, tb.qr_token || "");
                    const isSel = selected.has(tb.id);
                    return (
                      <View key={tb.id} style={[styles.qrCard, isSel && { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}>
                        <TouchableOpacity
                          testID={`qr-select-${tb.id}`}
                          onPress={() => toggleSelect(tb.id)}
                          style={styles.checkboxRow}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name={isSel ? "checkbox" : "square-outline"} size={18} color={colors.primary} />
                        </TouchableOpacity>
                        <Text style={styles.qrLabel}>{tb.label}</Text>
                        <Image source={{ uri: qrImg(link, 220) }} style={styles.qrImg} resizeMode="contain" />
                        <TouchableOpacity
                          testID={`qr-download-${tb.id}`}
                          onPress={() => downloadQr(tb)}
                          disabled={downloadingId === tb.id}
                          style={[styles.qrBtn, { opacity: downloadingId === tb.id ? 0.6 : 1 }]}
                        >
                          {downloadingId === tb.id ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                          ) : (
                            <Ionicons name="download-outline" size={14} color={colors.primary} />
                          )}
                          <Text style={styles.qrBtnTxt}>Download QR</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>

                {selected.size > 0 && (
                  <TouchableOpacity
                    testID="qr-download-selected"
                    onPress={downloadSelected}
                    disabled={bulkDownloading}
                    style={[styles.bulkBtn, { opacity: bulkDownloading ? 0.6 : 1 }]}
                  >
                    {bulkDownloading ? (
                      <ActivityIndicator color={colors.onPrimary} />
                    ) : (
                      <Ionicons name="download-outline" size={18} color={colors.onPrimary} />
                    )}
                    <Text style={styles.bulkBtnTxt}>
                      {bulkDownloading ? "Downloading…" : `Download Selected (${selected.size})`}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <Text style={styles.tblHint}>No tables yet — set a table count above to generate QR codes.</Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  backBtn: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  hTitle: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary },
  hSub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  infoTxt: { flex: 1, fontSize: 12, color: colors.textPrimary, lineHeight: 18 },
  sectionLabel: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.6, marginBottom: 4, marginTop: spacing.lg },
  tblHint: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm, lineHeight: 17 },
  countRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  countInput: { flex: 1, height: 50, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 16, fontWeight: font.bold, color: colors.textPrimary, backgroundColor: colors.surface },
  applyBtn: { height: 50, paddingHorizontal: 24, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  applyTxt: { color: colors.onPrimary, fontWeight: font.black, fontSize: 15 },
  msg: { color: colors.success, fontSize: 13, fontWeight: font.semi, marginTop: spacing.sm },
  selectAllBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  selectAllTxt: { color: colors.primary, fontWeight: font.bold, fontSize: 12 },
  qrGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  qrCard: { width: "47%", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, alignItems: "center", ...shadow.card },
  checkboxRow: { alignSelf: "flex-end", marginBottom: -6 },
  qrImg: { width: 160, height: 160, backgroundColor: "#fff", borderRadius: radius.md, marginTop: 8 },
  qrLabel: { fontSize: 14, fontWeight: font.black, color: colors.textPrimary, textAlign: "center" },
  qrBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  qrBtnTxt: { color: colors.primary, fontWeight: font.black, fontSize: 12 },
  bulkBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: spacing.lg, height: 52, borderRadius: radius.lg, backgroundColor: colors.primary, ...shadow.lifted },
  bulkBtnTxt: { color: colors.onPrimary, fontWeight: font.black, fontSize: 15 },
});
