import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Modal, Platform, useWindowDimensions, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Button, Empty } from "@/src/components/ui";
import { inr } from "@/src/components/ReceiptModal";

type T = { id: string; label: string; status: string; session: any; restaurant_id?: string; qr_token?: string };

const DINE_BASE = process.env.EXPO_PUBLIC_DINEIN_BASE_URL || "https://bisnoi.com";

function dineUrl(t: T): string {
  return `${DINE_BASE}/dinein?rid=${encodeURIComponent(t.restaurant_id || "")}&tid=${encodeURIComponent(t.id)}&t=${encodeURIComponent(t.qr_token || "")}`;
}
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
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

// Pulsing card for tables with a pending (not-yet-accepted) KOT — draws the
// eye without needing sound. Plain TouchableOpacity otherwise.
const AnimatedCard = Animated.createAnimatedComponent(TouchableOpacity);

const STATUS: Record<string, { label: string; dot: string; bg: string; border: string; dashed?: boolean }> = {
  blank:       { label: "Blank Table",       dot: "#D1D5DB", bg: "#F9FAFB", border: "#E5E7EB", dashed: true },
  running:     { label: "Running Table",     dot: "#38BDF8", bg: "#EFF8FF", border: "#7DD3FC" },
  printed:     { label: "Printed Table",     dot: "#22C55E", bg: "#F0FDF4", border: "#86EFAC" },
  paid:        { label: "Paid Table",        dot: "#FDE68A", bg: "#FFFBEB", border: "#FDE68A" },
  running_kot: { label: "Running KOT Table", dot: "#F59E0B", bg: "#FFF7ED", border: "#FDBA74" },
};
const STATUS_ORDER = ["blank", "running", "printed", "paid", "running_kot"];

function normalizeStatus(raw?: string): string {
  const s = (raw || "").toLowerCase();
  if (s === "free" || s === "blank") return "blank";
  if (s === "printed") return "printed";
  if (s === "paid") return "paid";
  if (s === "running_kot" || s === "kot") return "running_kot";
  if (s === "occupied" || s === "running") return "running";
  return "blank";
}

export function TablesView({
  rid, reloadSignal, onOpenTable,
}: {
  rid?: string;
  reloadSignal: number;
  onOpenTable: (t: { id: string; label: string }) => void;
}) {
  const { width } = useWindowDimensions();
  const [restaurantName, setRestaurantName] = useState<string>("");
  useEffect(() => {
    if (!rid) { setRestaurantName(""); return; }
    let alive = true;
    Api.restaurant(rid)
      .then((data: any) => { if (alive) setRestaurantName(data?.restaurant?.name || ""); })
      .catch(() => { if (alive) setRestaurantName(""); });
    return () => { alive = false; };
  }, [rid]);
  const isDesktop = width >= 768;
  const [tables, setTables] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [managing, setManaging] = useState(false);
  const [countInput, setCountInput] = useState("");
  const [busy, setBusy] = useState(false);

  const [qrTable, setQrTable] = useState<T | null>(null);
  const [sharing, setSharing] = useState(false);
  const qrRef = useRef<any>(null);

  // Pulse animation driver for tables with a pending KOT.
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);
  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });

  const load = useCallback(async () => {
    try {
      const res: any = await Api.ownerTables(rid);
      setTables(res || []);
    } catch (e: any) {
      console.warn(e?.message);
    } finally {
      setLoading(false);
    }
  }, [rid]);
  useEffect(() => { load(); }, [load, reloadSignal]);

  const applyCount = async () => {
    const n = parseInt(countInput, 10);
    if (isNaN(n) || n < 0) return;
    setBusy(true);
    try { const res: any = await Api.ownerSetTableCount(n, rid); setTables(res || []); }
    catch (e: any) { if (Platform.OS === "web") window.alert(e?.message || "Failed"); }
    finally { setBusy(false); }
  };
  const addOne = async () => {
    setBusy(true);
    try { const res: any = await Api.ownerCreateTable(undefined, rid); setTables(res || []); }
    catch (e: any) { if (Platform.OS === "web") window.alert(e?.message || "Failed"); }
    finally { setBusy(false); }
  };
  const removeTable = async (t: T) => {
    if (t.status === "occupied") { if (Platform.OS === "web") window.alert("Table is occupied — settle the bill first."); return; }
    setBusy(true);
    try { const res: any = await Api.ownerDeleteTable(t.id); setTables(res || []); }
    catch (e: any) { if (Platform.OS === "web") window.alert(e?.message || "Failed"); }
    finally { setBusy(false); }
  };

  const shareQr = async (t: T) => {
    if (!qrRef.current) return;
    setSharing(true);
    qrRef.current.toDataURL(async (dataURL: string) => {
      try {
        const fileSafeLabel = t.label.replace(/[^a-z0-9]+/gi, "-");
        if (Platform.OS === "web") {
          const qrImg = await loadImage(`data:image/png;base64,${dataURL}`);
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
          ctx.drawImage(qrImg, (W - qrBoxSize) / 2 + qrPad, qrBoxY + qrPad, qrBoxSize - qrPad * 2, qrBoxSize - qrPad * 2);

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
          ctx.fillText(t.label || "-", W / 2, labelY + 50);

          ctx.fillStyle = "#CFE0D6";
          ctx.font = "18px sans-serif";
          wrapCanvasText(ctx, "Scan this code to view the menu and place your order.", W / 2, labelY + 100, W - 160, 24);

          const outUrl = canvas.toDataURL("image/png");
          const link = document.createElement("a");
          link.href = outUrl;
          link.download = `table-${fileSafeLabel}-qr.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          const fileUri = `${FileSystem.cacheDirectory}table-${fileSafeLabel}-qr.png`;
          await FileSystem.writeAsStringAsync(fileUri, dataURL, { encoding: FileSystem.EncodingType.Base64 });
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(fileUri, { mimeType: "image/png", dialogTitle: `${t.label} QR code` });
          }
        }
      } catch (e: any) {
        if (Platform.OS === "web") window.alert(e?.message || "Failed to share QR");
      } finally {
        setSharing(false);
      }
    });
  };

  const occupied = tables.filter((t) => t.status === "occupied").length;

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 50 }} />;

  return (
    <>
      <View style={styles.bar}>
        <Text style={styles.barText}>{tables.length} tables • {occupied} occupied</Text>
        <Button testID="tables-manage-btn" title="Manage" icon="settings-outline" variant="primary" style={{ backgroundColor: colors.primaryDark, borderColor: colors.primaryDark, paddingVertical: 6, paddingHorizontal: 12 }} onPress={() => { setCountInput(String(tables.length)); setManaging(true); }} />
      </View>

      <View style={{ minWidth: 0 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={[styles.legendRow, { paddingRight: spacing.xl }]}>
          {STATUS_ORDER.map((k) => (
            <View key={k} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: STATUS[k].dot }]} />
              <Text style={styles.legendText}>{STATUS[k].label}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        {tables.length === 0 ? (
          <View style={{ marginTop: 10 }}>
            <Empty icon="grid-outline" title="No tables yet" subtitle="Set up your dine-in tables to start taking orders." />
            <View style={{ alignItems: "center", marginTop: 8 }}>
              <Button testID="tables-setup-btn" title="Set up tables" icon="add" onPress={() => { setCountInput("5"); setManaging(true); }} />
            </View>
          </View>
        ) : (
          <View style={styles.grid}>
            {tables.map((t) => {
              const occ = t.status === "occupied" || normalizeStatus(t.status) !== "blank";
              const st = STATUS[normalizeStatus(t.status)];
              const s = t.session || {};
              const hasPendingKot = occ && s.pending_kots > 0;
              return (
                <AnimatedCard
                  key={t.id}
                  testID={`table-card-${t.id}`}
                  activeOpacity={0.85}
                  onPress={() => onOpenTable({ id: t.id, label: t.label })}
                  style={[
                    styles.card,
                    isDesktop && styles.cardDesktop,
                    { backgroundColor: st.bg, borderColor: st.border },
                    st.dashed && styles.cardDashed,
                    hasPendingKot && styles.cardPending,
                    hasPendingKot && { transform: [{ scale: pulseScale }] },
                  ]}
                >
                  <View style={styles.cardTop}>
                    <Ionicons name="restaurant" size={16} color={st.dot} />
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      {occ && s.pending_kots > 0 ? (
                        <View style={styles.kotBadge}><Text style={styles.kotBadgeTxt}>{s.pending_kots} KOT</Text></View>
                      ) : null}
                      <TouchableOpacity
                        testID={`table-qr-${t.id}`}
                        hitSlop={8}
                        onPress={(e: any) => { e?.stopPropagation?.(); setQrTable(t); }}
                        style={styles.qrIconBtn}
                      >
                        <Ionicons name="qr-code-outline" size={15} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={styles.cardLabel} numberOfLines={1}>{t.label}</Text>
                  {occ ? (
                    <>
                      <Text style={styles.cardTotal}>{inr(s.running_total || 0)}</Text>
                      <Text style={styles.cardMeta}>{s.item_count || 0} items • {s.kot_count || 0} KOT</Text>
                    </>
                  ) : (
                    <Text style={styles.cardFreeTxt}>Tap to open</Text>
                  )}
                </AnimatedCard>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Manage tables modal */}
      <Modal visible={managing} transparent animationType="fade" onRequestClose={() => setManaging(false)}>
        <View style={styles.backdrop}>
          <View style={styles.mCard}>
            <View style={styles.mHead}>
              <Text style={styles.mTitle}>Manage Tables</Text>
              <TouchableOpacity testID="tables-manage-close" onPress={() => setManaging(false)} hitSlop={10}><Ionicons name="close" size={22} color={colors.textPrimary} /></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
              <Text style={styles.mLabel}>Number of tables</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  testID="tables-count-input"
                  value={countInput}
                  onChangeText={(t) => setCountInput(t.replace(/[^0-9]/g, "").slice(0, 3))}
                  keyboardType="number-pad"
                  placeholder="e.g. 5"
                  placeholderTextColor={colors.textMuted}
                  style={styles.mInput}
                />
                <Button testID="tables-apply-count" title="Apply" onPress={applyCount} loading={busy} />
              </View>
              <Text style={styles.mHint}>Increase to add more tables, decrease to remove free tables (occupied tables are kept).</Text>

              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <Text style={styles.mLabel}>Tables ({tables.length})</Text>
                <Button testID="tables-add-one" title="Add table" icon="add" variant="secondary" onPress={addOne} loading={busy} />
              </View>
              {tables.map((t) => (
                <View key={t.id} style={styles.mRow}>
                  <Ionicons name="restaurant" size={15} color={t.status === "occupied" ? colors.warning : colors.primary} />
                  <Text style={styles.mRowLabel}>{t.label}</Text>
                  <Text style={[styles.mRowStatus, { color: t.status === "occupied" ? colors.warning : colors.success }]}>{t.status === "occupied" ? "Occupied" : "Free"}</Text>
                  <TouchableOpacity testID={`tables-qr-${t.id}`} onPress={() => setQrTable(t)} style={styles.mQrBtn} hitSlop={8}>
                    <Ionicons name="qr-code-outline" size={15} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID={`tables-remove-${t.id}`}
                    disabled={t.status === "occupied"}
                    onPress={() => removeTable(t)}
                    style={[styles.mDel, t.status === "occupied" && { opacity: 0.3 }]}
                  >
                    <Ionicons name="trash" size={15} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            <View style={{ padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Button testID="tables-manage-done" title="Done" onPress={() => setManaging(false)} full />
            </View>
          </View>
        </View>
      </Modal>

      {/* QR modal */}
      <Modal visible={!!qrTable} transparent animationType="fade" onRequestClose={() => setQrTable(null)}>
        <View style={styles.backdrop}>
          <View style={styles.qrCard}>
            <TouchableOpacity testID="qr-modal-close" onPress={() => setQrTable(null)} hitSlop={10} style={styles.qrCloseBtn}>
              <Ionicons name="close" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={{ padding: spacing.lg, alignItems: "center", gap: spacing.sm }}>
              {!!restaurantName && <Text style={styles.qrCardBrand}>{restaurantName}</Text>}
              {qrTable?.qr_token ? (
                <>
                  <View style={styles.scanBadge}>
                    <Ionicons name="qr-code-outline" size={14} color="#123524" />
                    <Text style={styles.scanBadgeText}>Scan to Order</Text>
                  </View>
                  <View style={styles.qrFrame}>
                    <View style={styles.qrBox}>
                      <QRCode
                        value={dineUrl(qrTable)}
                        size={200}
                        ecl="H"
                        getRef={(c: any) => (qrRef.current = c)}
                      />
                      {!!restaurantName && (
                        <View style={styles.qrLogoBadge} pointerEvents="none">
                          <Text style={styles.qrLogoBadgeText}>{restaurantName.trim().charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={styles.qrTableLabel}>
                    <Text style={styles.qrTableLabelSmall}>TABLE</Text>
                    <Text style={styles.qrTableLabelBig}>{qrTable?.label || "-"}</Text>
                  </View>
                  <Text style={styles.qrHintDark}>
                    Print this and place it on the table. Customers scan it to order — this is the only way a dine-in order can be placed at this table.
                  </Text>
                  <Text selectable style={styles.qrLinkDark} numberOfLines={2}>{dineUrl(qrTable)}</Text>
                  <Button
                    testID="qr-share-btn"
                    title={sharing ? "Preparing…" : (Platform.OS === "web" ? "Download QR" : "Share QR")}
                    icon={Platform.OS === "web" ? "download-outline" : "share-outline"}
                    onPress={() => qrTable && shareQr(qrTable)}
                    loading={sharing}
                    full
                  />
                </>
              ) : (
                <Text style={styles.qrHintDark}>QR not available for this table yet — try reopening Manage Tables.</Text>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  barText: { fontSize: 13, color: colors.textSecondary, fontWeight: font.semi },
  legendRow: { flexDirection: "row", gap: 18, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, alignItems: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 13, fontWeight: font.bold, color: colors.textSecondary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  card: { width: "47%", minWidth: 150, flexGrow: 1, borderRadius: radius.lg, borderWidth: 1.5, padding: spacing.md, minHeight: 110, ...shadow.card },
  cardDesktop: { width: 150, minWidth: 150, flexGrow: 0, aspectRatio: 1, minHeight: undefined },
  cardDashed: { borderStyle: "dashed" },
  cardFree: { backgroundColor: colors.surface, borderColor: colors.border },
  cardOcc: { backgroundColor: colors.primary, borderColor: colors.primary },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kotBadge: { backgroundColor: colors.warning, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  kotBadgeTxt: { fontSize: 10, fontWeight: font.black, color: "#1a1300" },
  cardPending: { borderColor: colors.warning, borderWidth: 2, ...shadow.lifted },
  qrIconBtn: { width: 24, height: 24, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  cardLabel: { fontSize: 16, fontWeight: font.black, color: colors.textPrimary, marginTop: 8 },
  cardTotal: { fontSize: 16, fontWeight: font.black, color: colors.textPrimary, marginTop: 4 },
  cardMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  cardFreeTxt: { fontSize: 12, color: colors.textMuted, marginTop: 6 },

  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  mCard: { width: "100%", maxWidth: 460, backgroundColor: colors.surface, borderRadius: radius.xl, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  mHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  mTitle: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary },
  mLabel: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.4 },
  mInput: { flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, height: 46, fontSize: 15, color: colors.textPrimary },
  mHint: { fontSize: 11.5, color: colors.textMuted, lineHeight: 16 },
  mRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  mRowLabel: { flex: 1, fontSize: 14, fontWeight: font.semi, color: colors.textPrimary },
  mRowStatus: { fontSize: 11, fontWeight: font.black, marginRight: 6 },
  mQrBtn: { width: 30, height: 30, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  mDel: { width: 30, height: 30, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.error, alignItems: "center", justifyContent: "center" },

  qrBox: { padding: spacing.lg, backgroundColor: "#fff", borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", position: "relative" },
  qrHint: { fontSize: 12, color: colors.textSecondary, textAlign: "center", lineHeight: 17 },
  qrLink: { fontSize: 11, color: colors.textMuted, textAlign: "center" },
  qrBrand: { fontSize: 12, fontWeight: font.black, color: colors.primary, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  qrFrame: { padding: 8, borderRadius: radius.lg + 8, backgroundColor: "#123524", borderWidth: 2, borderColor: "#D9A94A" },
  qrCaption: { fontSize: 14, fontWeight: font.semi, color: colors.textPrimary, textAlign: "center" },
  qrCard: { width: "100%", maxWidth: 460, backgroundColor: "#123524", borderRadius: radius.xl, overflow: "hidden", borderWidth: 3, borderColor: "#D9A94A" },
  qrCloseBtn: { position: "absolute", top: spacing.md, right: spacing.md, zIndex: 10, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.25)" },
  qrCardBrand: { fontSize: 22, fontWeight: font.black, color: "#fff", textAlign: "center", textTransform: "uppercase", letterSpacing: 1, marginTop: spacing.lg },
  qrTableLabel: { alignItems: "center", marginTop: 4 },
  qrTableLabelSmall: { fontSize: 12, fontWeight: font.black, color: "#D9A94A", letterSpacing: 1 },
  qrTableLabelBig: { fontSize: 28, fontWeight: font.black, color: "#fff" },
  qrLogoBadge: { position: "absolute", top: "50%", left: "50%", marginTop: -30, marginLeft: -30, width: 60, height: 60, borderRadius: 30, backgroundColor: "#123524", borderWidth: 2, borderColor: "#D9A94A", alignItems: "center", justifyContent: "center" },
  qrLogoBadgeText: { fontSize: 22, fontWeight: font.black, color: "#fff" },
  qrHintDark: { fontSize: 12, color: "#CFE0D6", textAlign: "center", lineHeight: 17, paddingHorizontal: spacing.sm },
  qrLinkDark: { fontSize: 11, color: "#8FAE9C", textAlign: "center" },
  scanBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#D9A94A", paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.xl },
  scanBadgeText: { fontSize: 12, fontWeight: font.black, color: "#123524", textTransform: "uppercase", letterSpacing: 0.5 },
});
