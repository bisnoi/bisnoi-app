import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, TextInput, Modal, Switch, Image, Platform, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { File as FsFile } from "expo-file-system";
import { Api } from "@/src/api";
import { compressDataUrl, convertToJpeg } from "@/src/utils/imageCompress";
import { colors, spacing, radius, font } from "@/src/theme";
import { Button, VegDot } from "@/src/components/ui";

type RVariation = { _id: string; name: string; price: string };
type RItem = { _id: string; name: string; price: string; description: string; veg: boolean; variations: RVariation[] };
type RSubcat = { _id: string; name: string; items: RItem[] };
type RCat = { _id: string; name: string; items: RItem[]; subcategories: RSubcat[] };

type Picked = { base64: string; mime: string; name: string; isImage: boolean };

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const mapExtractedItem = (i: any): RItem => ({
  _id: uid(),
  name: String(i.name || ""),
  price: String(i.price ?? ""),
  description: String(i.description || ""),
  veg: i.veg !== false,
  variations: (i.variations || []).map((v: any) => ({
    _id: uid(),
    name: String(v.name || ""),
    price: String(v.price ?? ""),
  })),
});

/** Exactly what /owner/menu/ai-extract accepts. Anything else must be converted first. */
const ACCEPTED_MIMES = [
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "image/avif", "image/bmp", "image/gif", "application/pdf",
];
/** Not accepted by the backend (nor by Gemini) — converted to JPEG before upload. */
const HEIC_MIMES = ["image/heic", "image/heif"];

const WEB_ACCEPT = [...ACCEPTED_MIMES, ...HEIC_MIMES, ".heic", ".heif"].join(",");

/** Matches the backend's own cap — see "File too large. Max 20 MB." */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function base64Bytes(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
}

/** Browsers often report an empty type for HEIC, so fall back to the extension. */
function mimeOfFile(name: string, type?: string): string {
  if (type) return type.toLowerCase();
  const ext = name.toLowerCase().split(".").pop() || "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

/** Web-only: open a file dialog accepting images + PDF, resolve to base64 + mime. */
function pickFileWeb(): Promise<Picked | null> {
  return new Promise((resolve) => {
    if (Platform.OS !== "web" || typeof document === "undefined") return resolve(null);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = WEB_ACCEPT;
    // Safari and iOS WebViews ignore .click() on a detached input, so it has to
    // be in the document for the file dialog to open at all.
    input.style.display = "none";
    document.body.appendChild(input);
    const cleanup = () => { try { input.remove(); } catch { /* ignore */ } };

    input.onchange = () => {
      const file = (input.files && input.files[0]) || null;
      cleanup();
      if (!file) return resolve(null);
      const mime = mimeOfFile(file.name, file.type);
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve({ base64, mime, name: file.name, isImage: mime.startsWith("image/") });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    // Fired when the dialog is dismissed without a selection (no-op in older browsers).
    (input as any).oncancel = () => { cleanup(); resolve(null); };
    input.click();
  });
}

/**
 * Bring a freshly picked file into a shape the backend accepts: HEIC/HEIF are
 * re-encoded to JPEG, and oversized photos are compressed so the base64 JSON
 * payload stays small enough to upload.
 */
async function normalizePicked(p: Picked): Promise<Picked> {
  if (!p.isImage) {
    // PDFs can't be compressed client-side, so fail early with a clear message
    // instead of letting the backend reject the upload.
    if (base64Bytes(p.base64) > MAX_UPLOAD_BYTES) {
      throw new Error("This PDF is larger than 20 MB. Please upload a smaller file.");
    }
    return p;
  }
  let dataUrl = `data:${p.mime};base64,${p.base64}`;
  let mime = p.mime;
  let name = p.name;

  if (HEIC_MIMES.includes(mime)) {
    const jpeg = await convertToJpeg(dataUrl);
    if (!jpeg) {
      throw new Error(
        "This browser can’t read HEIC photos. Open the photo and save it as JPEG, or use Safari.",
      );
    }
    dataUrl = jpeg;
    mime = "image/jpeg";
    name = name.replace(/\.(heic|heif)$/i, ".jpg");
  } else if (!ACCEPTED_MIMES.includes(mime)) {
    throw new Error(`${mime} files aren’t supported. Use a JPG, PNG, WEBP or PDF.`);
  }

  const compressed = (await compressDataUrl(dataUrl)) as string;
  const comma = compressed.indexOf(",");
  const outMime = compressed.slice(5, compressed.indexOf(";")) || mime;
  return { base64: compressed.slice(comma + 1), mime: outMime, name, isImage: true };
}

export function AiMenuImportModal({
  visible, restaurantName, onClose, onDone,
}: {
  visible: boolean;
  restaurantName?: string | null;
  onClose: () => void;
  onDone: (createdCount: number) => void;
}) {
  const [phase, setPhase] = useState<"upload" | "extracting" | "review">("upload");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cats, setCats] = useState<RCat[]>([]);
  const [saving, setSaving] = useState(false);
  const [extractMode, setExtractMode] = useState<"ai" | "ocr">("ai");
  const [source, setSource] = useState<"ai" | "ocr" | null>(null);
  const [wasFallback, setWasFallback] = useState(false);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const reset = useCallback(() => {
    setPhase("upload"); setPicked(null); setPicking(false); setError(null); setCats([]); setSaving(false);
    setSource(null); setWasFallback(false); setExtractMode("ai");
  }, []);

  useEffect(() => { if (visible) reset(); }, [visible, reset]);

  const runPick = async (pick: () => Promise<Picked | null>) => {
    setError(null);
    setPicking(true);
    try {
      const raw = await pick();
      if (!raw) return; // dialog dismissed
      setPicked(await normalizePicked(raw));
    } catch (e: any) {
      setError(e?.message || "Could not select file");
    } finally {
      setPicking(false);
    }
  };

  /** Native gallery — photos only; the OS picker cannot list PDFs. */
  const pickPhotoNative = async (): Promise<Picked | null> => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.7,
      base64: true,
    });
    const a = !res.canceled ? res.assets?.[0] : null;
    if (!a?.base64) return null;
    const name = a.fileName || "menu-photo.jpg";
    return { base64: a.base64, mime: mimeOfFile(name, a.mimeType), name, isImage: true };
  };

  /** Native Files/Documents browser — the only way to reach a PDF on device. */
  const pickDocumentNative = async (): Promise<Picked | null> => {
    const res = await DocumentPicker.getDocumentAsync({
      type: [...ACCEPTED_MIMES, ...HEIC_MIMES],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled) return null;
    const a = res.assets?.[0];
    if (!a) return null;
    // expo-file-system v19 replaced readAsStringAsync with File#base64().
    const base64 = await new FsFile(a.uri).base64();
    const mime = mimeOfFile(a.name, a.mimeType ?? undefined);
    return { base64, mime, name: a.name, isImage: mime.startsWith("image/") };
  };

  const choose = () => runPick(Platform.OS === "web" ? pickFileWeb : pickPhotoNative);
  const chooseDocument = () => runPick(pickDocumentNative);

  const extract = async (mode: "ai" | "ocr") => {
    if (!picked) return;
    if (mode === "ocr" && !picked.isImage) {
      setError("Free scan works with photos only. For PDFs, use “Scan with AI”.");
      return;
    }
    setError(null);
    setExtractMode(mode);
    setPhase("extracting");
    try {
      const res: any = mode === "ocr"
        ? await Api.ownerOcrExtractMenu(picked.base64, picked.mime, picked.name)
        : await Api.ownerAiExtractMenu(picked.base64, picked.mime, picked.name);
      const incoming: RCat[] = (res?.categories || []).map((c: any) => ({
        _id: uid(),
        name: String(c.name || "Menu"),
        items: (c.items || []).map(mapExtractedItem),
        subcategories: (c.subcategories || [])
          .map((s: any) => ({
            _id: uid(),
            name: String(s.name || ""),
            items: (s.items || []).map(mapExtractedItem),
          }))
          .filter((s: RSubcat) => s.name.length > 0 && s.items.length > 0),
      })).filter((c: RCat) => c.items.length > 0 || c.subcategories.length > 0);
      if (!mounted.current) return;
      if (incoming.length === 0) {
        setError(
          mode === "ocr"
            ? "Couldn’t read items from this photo. Try a sharper, well-lit photo — or use “Scan with AI”."
            : "No menu items were detected. Try a clearer photo or a different file."
        );
        setPhase("upload");
        return;
      }
      setSource((res?.source as "ai" | "ocr") || mode);
      setWasFallback(!!res?.fallback);
      setCats(incoming);
      setPhase("review");
    } catch (e: any) {
      if (!mounted.current) return;
      setError(e?.message || (mode === "ocr" ? "Free scan failed. Please try again." : "AI extraction failed. Please try again."));
      setPhase("upload");
    }
  };

  // ---- review editing helpers ----
  const totalItems = cats.reduce(
    (n, c) => n + c.items.length + c.subcategories.reduce((sn, s) => sn + s.items.length, 0),
    0,
  );

  const mapItemInCats = (prev: RCat[], cid: string, sid: string | null, iid: string, fn: (it: RItem) => RItem): RCat[] =>
    prev.map((c) => {
      if (c._id !== cid) return c;
      if (sid === null) {
        return { ...c, items: c.items.map((it) => (it._id === iid ? fn(it) : it)) };
      }
      return {
        ...c,
        subcategories: c.subcategories.map((s) => (s._id === sid
          ? { ...s, items: s.items.map((it) => (it._id === iid ? fn(it) : it)) }
          : s)),
      };
    });

  const updateCatName = (cid: string, name: string) =>
    setCats((prev) => prev.map((c) => (c._id === cid ? { ...c, name } : c)));
  const removeCat = (cid: string) =>
    setCats((prev) => prev.filter((c) => c._id !== cid));

  const addSubcat = (cid: string) =>
    setCats((prev) => prev.map((c) => (c._id === cid
      ? { ...c, subcategories: [...c.subcategories, { _id: uid(), name: "", items: [] }] }
      : c)));
  const updateSubcatName = (cid: string, sid: string, name: string) =>
    setCats((prev) => prev.map((c) => (c._id === cid
      ? { ...c, subcategories: c.subcategories.map((s) => (s._id === sid ? { ...s, name } : s)) }
      : c)));
  const removeSubcat = (cid: string, sid: string) =>
    setCats((prev) => prev.map((c) => (c._id === cid
      ? { ...c, subcategories: c.subcategories.filter((s) => s._id !== sid) }
      : c)));

  const updateItem = (cid: string, sid: string | null, iid: string, patch: Partial<RItem>) =>
    setCats((prev) => mapItemInCats(prev, cid, sid, iid, (it) => ({ ...it, ...patch })));
  const removeItem = (cid: string, sid: string | null, iid: string) =>
    setCats((prev) => prev.map((c) => {
      if (c._id !== cid) return c;
      if (sid === null) return { ...c, items: c.items.filter((it) => it._id !== iid) };
      return { ...c, subcategories: c.subcategories.map((s) => (s._id === sid ? { ...s, items: s.items.filter((it) => it._id !== iid) } : s)) };
    }));
  const addItem = (cid: string, sid: string | null) =>
    setCats((prev) => prev.map((c) => {
      if (c._id !== cid) return c;
      const blank: RItem = { _id: uid(), name: "", price: "", description: "", veg: true, variations: [] };
      if (sid === null) return { ...c, items: [...c.items, blank] };
      return { ...c, subcategories: c.subcategories.map((s) => (s._id === sid ? { ...s, items: [...s.items, blank] } : s)) };
    }));

  const addVariation = (cid: string, sid: string | null, iid: string) =>
    setCats((prev) => mapItemInCats(prev, cid, sid, iid, (it) => ({
      ...it, variations: [...it.variations, { _id: uid(), name: "", price: "" }],
    })));
  const updateVariation = (cid: string, sid: string | null, iid: string, vid: string, patch: Partial<RVariation>) =>
    setCats((prev) => mapItemInCats(prev, cid, sid, iid, (it) => ({
      ...it, variations: it.variations.map((v) => (v._id === vid ? { ...v, ...patch } : v)),
    })));
  const removeVariation = (cid: string, sid: string | null, iid: string, vid: string) =>
    setCats((prev) => mapItemInCats(prev, cid, sid, iid, (it) => ({
      ...it, variations: it.variations.filter((v) => v._id !== vid),
    })));

  const addAll = async () => {
    const cleanItem = (i: RItem) => ({
      name: i.name.trim(),
      price: parseInt(i.price || "0", 10) || 0,
      description: i.description,
      veg: i.veg,
      variations: i.variations
        .map((v) => ({ name: v.name.trim(), price: parseInt(v.price || "0", 10) || 0 }))
        .filter((v) => v.name.length > 0),
    });
    const clean = cats
      .map((c) => ({
        name: c.name.trim() || "Menu",
        items: c.items.map(cleanItem).filter((i) => i.name.length > 0),
        subcategories: c.subcategories
          .map((s) => ({
            name: s.name.trim(),
            items: s.items.map(cleanItem).filter((i) => i.name.length > 0),
          }))
          .filter((s) => s.name.length > 0 && s.items.length > 0),
      }))
      .filter((c) => c.items.length > 0 || c.subcategories.length > 0);

    const count = clean.reduce(
      (n, c) => n + c.items.length + c.subcategories.reduce((sn, s) => sn + s.items.length, 0),
      0,
    );
    if (count === 0) { setError("Add at least one item with a name."); return; }
    setSaving(true);
    setError(null);
    try {
      const res: any = await Api.ownerImportStructuredMenu({ categories: clean });
      const created = res?.created ?? count;
      if (!mounted.current) return;
      onDone(created);
    } catch (e: any) {
      if (!mounted.current) return;
      setError(e?.message || "Could not add items. Please try again.");
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
        {/* Header */}
        <View style={styles.head}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            <View style={styles.aiBadge}><Ionicons name="sparkles" size={16} color={colors.onPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {phase === "review" ? "Review Menu" : "Scan Menu"}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {phase === "review"
                  ? `${totalItems} item${totalItems === 1 ? "" : "s"} • ${cats.length} categor${cats.length === 1 ? "y" : "ies"}`
                  : restaurantName || "Upload a photo or PDF"}
              </Text>
            </View>
          </View>
          <TouchableOpacity testID="ai-import-close" onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* UPLOAD PHASE */}
        {phase === "upload" && (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
            <View style={styles.hero}>
              <View style={styles.heroIcon}><Ionicons name="restaurant" size={30} color={colors.primary} /></View>
              <Text style={styles.heroTitle}>Turn your menu into items, instantly</Text>
              <Text style={styles.heroText}>
                Upload a clear photo or a PDF of your menu. Pick <Text style={{ fontWeight: font.bold, color: colors.textPrimary }}>Scan with AI</Text> for the best accuracy, or <Text style={{ fontWeight: font.bold, color: colors.textPrimary }}>Scan Free</Text> to read photos with no AI cost. You review and edit before adding.
              </Text>
            </View>

            <TouchableOpacity testID="ai-import-pick" activeOpacity={0.85} onPress={choose} disabled={picking} style={styles.dropZone}>
              {picking ? (
                <View style={{ alignItems: "center", gap: 10 }}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.dropHint}>Preparing your file…</Text>
                </View>
              ) : picked ? (
                <View style={{ alignItems: "center", gap: 8 }}>
                  {picked.isImage ? (
                    <Image source={{ uri: `data:${picked.mime};base64,${picked.base64}` }} style={styles.preview} />
                  ) : (
                    <View style={styles.pdfBox}><Ionicons name="document-text" size={34} color={colors.primary} /></View>
                  )}
                  <Text style={styles.fileName} numberOfLines={1}>{picked.name}</Text>
                  <Text style={styles.changeLink}>Tap to choose a different file</Text>
                </View>
              ) : (
                <View style={{ alignItems: "center", gap: 10 }}>
                  <Ionicons name="cloud-upload-outline" size={40} color={colors.primary} />
                  <Text style={styles.dropTitle}>{Platform.OS === "web" ? "Choose photo or PDF" : "Choose a photo"}</Text>
                  <Text style={styles.dropHint}>JPG, PNG, HEIC, WEBP, or PDF (single or multi-page)</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* The OS gallery picker can't list PDFs, so native needs a second
                entry point into the Files/Documents browser. */}
            {Platform.OS !== "web" && (
              <TouchableOpacity
                testID="ai-import-pick-doc"
                activeOpacity={0.8}
                onPress={chooseDocument}
                disabled={picking}
                style={styles.docLinkRow}
              >
                <Ionicons name="document-text-outline" size={16} color={colors.primary} />
                <Text style={styles.docLinkTxt}>Upload a PDF instead</Text>
              </TouchableOpacity>
            )}

            {error ? (
              <View style={styles.errBox}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errText}>{error}</Text>
              </View>
            ) : null}

            <Button
              testID="ai-import-extract"
              title="Scan with AI"
              icon="sparkles"
              onPress={() => extract("ai")}
              disabled={!picked}
              full
            />
            <Button
              testID="ai-import-extract-ocr"
              title="Scan Free (no AI cost)"
              icon="scan"
              variant="secondary"
              onPress={() => extract("ocr")}
              disabled={!picked || !picked.isImage}
              full
            />
            <View style={styles.freeHintRow}>
              <Ionicons name="pricetag-outline" size={13} color={colors.textMuted} />
              <Text style={styles.freeHintText}>
                Free scan reads photos on-device (no AI balance needed). Best for clear photos — you can fix any misreads before adding.
              </Text>
            </View>
            <View style={styles.noteRow}>
              <Ionicons name="shield-checkmark" size={14} color={colors.textMuted} />
              <Text style={styles.noteText}>Extracted items are submitted for admin approval after you add them.</Text>
            </View>
          </ScrollView>
        )}

        {/* EXTRACTING PHASE */}
        {phase === "extracting" && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.extractTitle}>Reading your menu…</Text>
            <Text style={styles.extractSub}>
              {extractMode === "ocr"
                ? "Reading dishes, prices and categories on-device (free). This can take a few seconds."
                : "AI is extracting dishes, prices and categories. This can take a few seconds."}
            </Text>
          </View>
        )}

        {/* REVIEW PHASE */}
        {phase === "review" && (
          <>
            <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 24, gap: spacing.md }}>
              {source === "ocr" ? (
                <View style={styles.ocrBanner} testID="ai-ocr-source-banner">
                  <Ionicons name={wasFallback ? "flash-off" : "scan"} size={16} color={colors.warning} />
                  <Text style={styles.ocrBannerText}>
                    {wasFallback
                      ? "AI was unavailable, so we read this with the free scanner. Please double-check names & prices before adding."
                      : "Read with the free scanner. Please double-check names & prices — OCR can misread some text."}
                  </Text>
                </View>
              ) : null}
              <View style={styles.reviewBanner}>
                <Ionicons name="create-outline" size={16} color={colors.primary} />
                <Text style={styles.reviewBannerText}>Edit names, prices or veg type. Remove anything you don’t want, then tap “Add all”.</Text>
              </View>

              {cats.map((c) => (
                <View key={c._id} style={styles.catCard} testID={`ai-cat-${c._id}`}>
                  <View style={styles.catHeader}>
                    <Ionicons name="pricetag" size={15} color={colors.primary} />
                    <TextInput
                      testID={`ai-cat-name-${c._id}`}
                      value={c.name}
                      onChangeText={(t) => updateCatName(c._id, t)}
                      placeholder="Category name"
                      placeholderTextColor={colors.textMuted}
                      style={styles.catNameInput}
                    />
                    <TouchableOpacity testID={`ai-cat-remove-${c._id}`} onPress={() => removeCat(c._id)} hitSlop={8} style={styles.catRemove}>
                      <Ionicons name="trash" size={16} color={colors.error} />
                    </TouchableOpacity>
                  </View>

                  {c.items.map((it) => (
                    <View key={it._id} style={styles.itemRow} testID={`ai-item-${it._id}`}>
                      <TouchableOpacity onPress={() => updateItem(c._id, null, it._id, { veg: !it.veg })} hitSlop={6} testID={`ai-item-veg-${it._id}`}>
                        <VegDot veg={it.veg} />
                      </TouchableOpacity>
                      <View style={{ flex: 1, gap: 6 }}>
                        <TextInput
                          testID={`ai-item-name-${it._id}`}
                          value={it.name}
                          onChangeText={(t) => updateItem(c._id, null, it._id, { name: t })}
                          placeholder="Item name"
                          placeholderTextColor={colors.textMuted}
                          style={styles.itemName}
                        />
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <View style={styles.priceWrap}>
                            <Text style={styles.rupee}>₹</Text>
                            <TextInput
                              testID={`ai-item-price-${it._id}`}
                              value={it.price}
                              onChangeText={(t) => updateItem(c._id, null, it._id, { price: t.replace(/[^0-9]/g, "") })}
                              keyboardType="number-pad"
                              placeholder="0"
                              placeholderTextColor={colors.textMuted}
                              style={styles.priceInput}
                            />
                          </View>
                          <Text style={styles.vegLabel}>{it.veg ? "Veg" : "Non-veg"}</Text>
                        </View>
                        {it.variations.map((v) => (
                          <View key={v._id} style={styles.varRow} testID={`ai-var-${v._id}`}>
                            <TextInput
                              testID={`ai-var-name-${v._id}`}
                              value={v.name}
                              onChangeText={(t) => updateVariation(c._id, null, it._id, v._id, { name: t })}
                              placeholder="Size (e.g. Small)"
                              placeholderTextColor={colors.textMuted}
                              style={styles.varNameInput}
                            />
                            <View style={styles.priceWrap}>
                              <Text style={styles.rupee}>₹</Text>
                              <TextInput
                                testID={`ai-var-price-${v._id}`}
                                value={v.price}
                                onChangeText={(t) => updateVariation(c._id, null, it._id, v._id, { price: t.replace(/[^0-9]/g, "") })}
                                keyboardType="number-pad"
                                placeholder="0"
                                placeholderTextColor={colors.textMuted}
                                style={styles.priceInput}
                              />
                            </View>
                            <TouchableOpacity testID={`ai-var-remove-${v._id}`} onPress={() => removeVariation(c._id, null, it._id, v._id)} hitSlop={8}>
                              <Ionicons name="close" size={16} color={colors.error} />
                            </TouchableOpacity>
                          </View>
                        ))}
                        <TouchableOpacity testID={`ai-item-addvar-${it._id}`} onPress={() => addVariation(c._id, null, it._id)} style={styles.addVarBtn}>
                          <Ionicons name="add" size={13} color={colors.primary} />
                          <Text style={styles.addVarText}>Add size/variation</Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity testID={`ai-item-remove-${it._id}`} onPress={() => removeItem(c._id, null, it._id)} hitSlop={8} style={styles.itemRemove}>
                        <Ionicons name="close" size={18} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity testID={`ai-cat-additem-${c._id}`} onPress={() => addItem(c._id, null)} style={styles.addItemBtn}>
                    <Ionicons name="add" size={16} color={colors.primary} />
                    <Text style={styles.addItemText}>Add item</Text>
                  </TouchableOpacity>

                  {c.subcategories.map((s) => (
                    <View key={s._id} style={styles.subCard} testID={`ai-subcat-${s._id}`}>
                      <View style={styles.subHeader}>
                        <Ionicons name="folder-outline" size={13} color={colors.textSecondary} />
                        <TextInput
                          testID={`ai-subcat-name-${s._id}`}
                          value={s.name}
                          onChangeText={(t) => updateSubcatName(c._id, s._id, t)}
                          placeholder="Sub-category name (e.g. Single Topping)"
                          placeholderTextColor={colors.textMuted}
                          style={styles.subNameInput}
                        />
                        <TouchableOpacity testID={`ai-subcat-remove-${s._id}`} onPress={() => removeSubcat(c._id, s._id)} hitSlop={8}>
                          <Ionicons name="trash" size={14} color={colors.error} />
                        </TouchableOpacity>
                      </View>

                      {s.items.map((it) => (
                        <View key={it._id} style={styles.itemRow} testID={`ai-item-${it._id}`}>
                          <TouchableOpacity onPress={() => updateItem(c._id, s._id, it._id, { veg: !it.veg })} hitSlop={6} testID={`ai-item-veg-${it._id}`}>
                            <VegDot veg={it.veg} />
                          </TouchableOpacity>
                          <View style={{ flex: 1, gap: 6 }}>
                            <TextInput
                              testID={`ai-item-name-${it._id}`}
                              value={it.name}
                              onChangeText={(t) => updateItem(c._id, s._id, it._id, { name: t })}
                              placeholder="Item name"
                              placeholderTextColor={colors.textMuted}
                              style={styles.itemName}
                            />
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                              <View style={styles.priceWrap}>
                                <Text style={styles.rupee}>₹</Text>
                                <TextInput
                                  testID={`ai-item-price-${it._id}`}
                                  value={it.price}
                                  onChangeText={(t) => updateItem(c._id, s._id, it._id, { price: t.replace(/[^0-9]/g, "") })}
                                  keyboardType="number-pad"
                                  placeholder="0"
                                  placeholderTextColor={colors.textMuted}
                                  style={styles.priceInput}
                                />
                              </View>
                              <Text style={styles.vegLabel}>{it.veg ? "Veg" : "Non-veg"}</Text>
                            </View>
                            {it.variations.map((v) => (
                              <View key={v._id} style={styles.varRow} testID={`ai-var-${v._id}`}>
                                <TextInput
                                  testID={`ai-var-name-${v._id}`}
                                  value={v.name}
                                  onChangeText={(t) => updateVariation(c._id, s._id, it._id, v._id, { name: t })}
                                  placeholder="Size (e.g. Small)"
                                  placeholderTextColor={colors.textMuted}
                                  style={styles.varNameInput}
                                />
                                <View style={styles.priceWrap}>
                                  <Text style={styles.rupee}>₹</Text>
                                  <TextInput
                                    testID={`ai-var-price-${v._id}`}
                                    value={v.price}
                                    onChangeText={(t) => updateVariation(c._id, s._id, it._id, v._id, { price: t.replace(/[^0-9]/g, "") })}
                                    keyboardType="number-pad"
                                    placeholder="0"
                                    placeholderTextColor={colors.textMuted}
                                    style={styles.priceInput}
                                  />
                                </View>
                                <TouchableOpacity testID={`ai-var-remove-${v._id}`} onPress={() => removeVariation(c._id, s._id, it._id, v._id)} hitSlop={8}>
                                  <Ionicons name="close" size={16} color={colors.error} />
                                </TouchableOpacity>
                              </View>
                            ))}
                            <TouchableOpacity testID={`ai-item-addvar-${it._id}`} onPress={() => addVariation(c._id, s._id, it._id)} style={styles.addVarBtn}>
                              <Ionicons name="add" size={13} color={colors.primary} />
                              <Text style={styles.addVarText}>Add size/variation</Text>
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity testID={`ai-item-remove-${it._id}`} onPress={() => removeItem(c._id, s._id, it._id)} hitSlop={8} style={styles.itemRemove}>
                            <Ionicons name="close" size={18} color={colors.error} />
                          </TouchableOpacity>
                        </View>
                      ))}

                      <TouchableOpacity testID={`ai-subcat-additem-${s._id}`} onPress={() => addItem(c._id, s._id)} style={styles.addItemBtn}>
                        <Ionicons name="add" size={16} color={colors.primary} />
                        <Text style={styles.addItemText}>Add item</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity testID={`ai-cat-addsubcat-${c._id}`} onPress={() => addSubcat(c._id)} style={styles.addSubcatBtn}>
                    <Ionicons name="add-circle-outline" size={15} color={colors.textSecondary} />
                    <Text style={styles.addSubcatText}>Add sub-category</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {cats.length === 0 ? (
                <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 20 }}>
                  All items removed. Go back and try another file.
                </Text>
              ) : null}
            </ScrollView>

            <View style={styles.footer}>
              {error ? (
                <View style={[styles.errBox, { marginBottom: 8 }]}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <Text style={styles.errText}>{error}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button testID="ai-review-back" title="Back" variant="ghost" icon="arrow-back" onPress={reset} full />
                </View>
                <View style={{ flex: 1.6 }}>
                  <Button
                    testID="ai-review-addall"
                    title={`Add all (${totalItems})`}
                    icon="checkmark-done"
                    onPress={addAll}
                    loading={saving}
                    disabled={totalItems === 0}
                    full
                  />
                </View>
              </View>
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md },
  aiBadge: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 19, fontWeight: font.black, color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  hero: { alignItems: "center", gap: 10, paddingVertical: spacing.sm },
  heroIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary, textAlign: "center" },
  heroText: { fontSize: 13, color: colors.textSecondary, textAlign: "center", lineHeight: 19, paddingHorizontal: 10 },

  dropZone: { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.borderStrong, borderRadius: radius.lg, backgroundColor: colors.surface, paddingVertical: 32, paddingHorizontal: spacing.lg, alignItems: "center" },
  dropTitle: { fontSize: 16, fontWeight: font.bold, color: colors.textPrimary },
  dropHint: { fontSize: 12, color: colors.textMuted },
  preview: { width: 160, height: 120, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  pdfBox: { width: 80, height: 80, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  fileName: { fontSize: 13, fontWeight: font.semi, color: colors.textPrimary, maxWidth: 260 },
  changeLink: { fontSize: 12, color: colors.primary, fontWeight: font.semi },

  docLinkRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: spacing.sm },
  docLinkTxt: { fontSize: 13, fontWeight: font.bold, color: colors.primary },
  errBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.errorSoft, borderRadius: radius.md, padding: spacing.md },
  errText: { flex: 1, fontSize: 12.5, color: colors.error, lineHeight: 17, fontWeight: font.semi },

  noteRow: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" },
  noteText: { fontSize: 11.5, color: colors.textMuted, textAlign: "center" },

  freeHintRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 4 },
  freeHintText: { flex: 1, fontSize: 11.5, color: colors.textMuted, lineHeight: 16 },

  ocrBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md },
  ocrBannerText: { flex: 1, fontSize: 12, color: colors.warning, lineHeight: 17, fontWeight: font.semi },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: 12 },
  extractTitle: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary, marginTop: 6 },
  extractSub: { fontSize: 13, color: colors.textSecondary, textAlign: "center", lineHeight: 19, maxWidth: 320 },

  reviewBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md },
  reviewBannerText: { flex: 1, fontSize: 12, color: colors.textPrimary, lineHeight: 17 },

  catCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  catHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm },
  catNameInput: { flex: 1, fontSize: 15, fontWeight: font.black, color: colors.textPrimary, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8 },
  catRemove: { width: 34, height: 34, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.error, alignItems: "center", justifyContent: "center" },

  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 10, marginBottom: 8 },
  itemName: { fontSize: 14, fontWeight: font.semi, color: colors.textPrimary, backgroundColor: colors.surface, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  priceWrap: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8 },
  rupee: { fontSize: 14, color: colors.textSecondary, fontWeight: font.bold },
  priceInput: { minWidth: 56, fontSize: 14, fontWeight: font.bold, color: colors.textPrimary, paddingVertical: 7, paddingHorizontal: 4 },
  vegLabel: { fontSize: 11, color: colors.textMuted, fontWeight: font.semi },
  itemRemove: { width: 30, height: 30, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },

  addItemBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.primary, marginTop: 2 },
  addItemText: { fontSize: 13, fontWeight: font.bold, color: colors.primary },

  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },

  varRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  varNameInput: { flex: 1, fontSize: 12.5, fontWeight: font.semi, color: colors.textPrimary, backgroundColor: colors.surface, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  addVarBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, alignSelf: "flex-start" },
  addVarText: { fontSize: 11.5, fontWeight: font.bold, color: colors.primary },

  subCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", padding: spacing.sm, marginTop: spacing.sm },
  subHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  subNameInput: { flex: 1, fontSize: 13, fontWeight: font.bold, color: colors.textPrimary, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 7 },

  addSubcatBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: radius.md, marginTop: 6 },
  addSubcatText: { fontSize: 12.5, fontWeight: font.bold, color: colors.textSecondary },
});
