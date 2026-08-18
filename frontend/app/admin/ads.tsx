import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Switch, ActivityIndicator, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Api, mediaUrl } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { Button, Empty } from "@/src/components/ui";

type Ad = { id: string; title: string; subtitle?: string; image: string; media_type?: string; link_restaurant_id?: string | null; active: boolean; sort_order: number };
type Rest = { id: string; name: string };

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|mpe?g|ogg)(\?|$)/i;

/** Web-only inline <video> preview. */
function VideoPreview({ uri, height }: { uri: string; height: number }) {
  if (Platform.OS !== "web") return <View style={{ height, backgroundColor: "#111", borderRadius: radius.md }} />;
  return React.createElement("video", {
    src: uri, muted: true, autoPlay: true, loop: true, playsInline: true, controls: true,
    style: { width: "100%", height, objectFit: "cover", borderRadius: 10, display: "block", backgroundColor: "#111" },
  });
}

export default function AdminAds() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [rests, setRests] = useState<Rest[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Ad | null>(null);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [image, setImage] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [linkId, setLinkId] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, r] = await Promise.all([Api.adminAds(), Api.adminRests()]);
      setAds(a as Ad[]);
      setRests((r as Rest[]).map((x) => ({ id: x.id, name: x.name })));
    } catch (e) {
      setAds([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const startNew = () => { setEditing(null); setTitle(""); setSubtitle(""); setImage(""); setMediaType("image"); setLinkId(null); setActive(true); setError(""); setOpen(true); };
  const startEdit = (ad: Ad) => { setEditing(ad); setTitle(ad.title); setSubtitle(ad.subtitle || ""); setImage(ad.image); setMediaType((ad.media_type as any) || (VIDEO_EXT_RE.test(ad.image) ? "video" : "image")); setLinkId(ad.link_restaurant_id || null); setActive(ad.active); setError(""); setOpen(true); };

  // Pick a file from the device (image / GIF / video, any supported format) and upload it.
  const pickAndUpload = async () => {
    setError("");
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"] as any,
        allowsEditing: false,
        quality: 0.9,
        allowsMultipleSelection: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      setUploading(true);
      const up = await Api.adminUploadMedia(a.uri, (a as any).fileName || undefined, (a as any).mimeType || undefined);
      setImage(up.url);
      setMediaType(up.media_type === "video" ? "video" : "image");
    } catch (e: any) {
      setError(e?.message || "Upload failed. Try a JPG, PNG, GIF, WEBP, MP4 or WEBM file.");
    } finally {
      setUploading(false);
    }
  };

  const onUrlChange = (t: string) => {
    setImage(t);
    setMediaType(VIDEO_EXT_RE.test(t) ? "video" : "image");
  };

  const save = async () => {
    if (!title.trim() || !image.trim()) return;
    setSaving(true);
    setError("");
    try {
      const body = { title: title.trim(), subtitle: subtitle.trim(), image: image.trim(), media_type: mediaType, link_restaurant_id: linkId, active };
      if (editing) await Api.adminUpdateAd(editing.id, body);
      else await Api.adminCreateAd(body);
      setOpen(false);
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not save banner");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (ad: Ad) => { await Api.adminUpdateAd(ad.id, { active: !ad.active }); load(); };
  const remove = async (ad: Ad) => { await Api.adminDeleteAd(ad.id); setAds((p) => p.filter((x) => x.id !== ad.id)); };
  const restName = (id?: string | null) => rests.find((r) => r.id === id)?.name;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScreenHeader title="Banners & Ads" subtitle="Hero banners on customer home (images, GIFs & videos)" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 80 }}>
        {!open && <Button title="Create Banner" icon="add" onPress={startNew} full testID="create-ad" />}

        {open && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>{editing ? "Edit Banner" : "New Banner"}</Text>

            {/* Preview */}
            {!!image && (
              mediaType === "video"
                ? <VideoPreview uri={mediaUrl(image)} height={160} />
                : <Image source={{ uri: mediaUrl(image) }} style={styles.preview} />
            )}

            {/* Upload from device */}
            <TouchableOpacity style={styles.uploadBtn} onPress={pickAndUpload} disabled={uploading} activeOpacity={0.85} testID="upload-media">
              {uploading ? <ActivityIndicator color={colors.primary} size="small" /> : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
                  <Text style={styles.uploadTxt}>Upload image / GIF / video (MP4, JPEG, GIF, PNG, WEBP...)</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.orTxt}>— or paste a URL —</Text>
            <TextInput testID="ad-image" value={image} onChangeText={onUrlChange} placeholder="https://...jpg / .mp4 / .gif" placeholderTextColor={colors.textMuted} style={styles.input} autoCapitalize="none" />

            {/* Media type chips */}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              {(["image", "video"] as const).map((t) => (
                <TouchableOpacity key={t} onPress={() => setMediaType(t)} style={[styles.chip, mediaType === t && styles.chipActive]}>
                  <Ionicons name={t === "video" ? "videocam" : "image"} size={13} color={mediaType === t ? colors.onPrimary : colors.textSecondary} />
                  <Text style={{ color: mediaType === t ? colors.onPrimary : colors.textSecondary, fontWeight: font.semi, fontSize: 12 }}>{t === "video" ? "Video" : "Image / GIF"}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.lbl}>Title</Text>
            <TextInput testID="ad-title" value={title} onChangeText={setTitle} placeholder="e.g. Flat 60% OFF" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Text style={styles.lbl}>Subtitle</Text>
            <TextInput testID="ad-subtitle" value={subtitle} onChangeText={setSubtitle} placeholder="e.g. On your first order" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Text style={styles.lbl}>Link to restaurant (optional — adds an {'"Order now"'} button)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              <TouchableOpacity onPress={() => setLinkId(null)} style={[styles.chip, !linkId && styles.chipActive]}>
                <Text style={{ color: !linkId ? colors.onPrimary : colors.textSecondary, fontWeight: font.semi, fontSize: 12 }}>None</Text>
              </TouchableOpacity>
              {rests.map((r) => (
                <TouchableOpacity key={r.id} onPress={() => setLinkId(r.id)} style={[styles.chip, linkId === r.id && styles.chipActive]}>
                  <Text style={{ color: linkId === r.id ? colors.onPrimary : colors.textSecondary, fontWeight: font.semi, fontSize: 12 }} numberOfLines={1}>{r.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.switchRow}>
              <Text style={styles.lbl}>Active</Text>
              <Switch value={active} onValueChange={setActive} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor="#fff" />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <View style={{ flex: 1 }}><Button title="Cancel" variant="secondary" onPress={() => setOpen(false)} full /></View>
              <View style={{ flex: 1 }}><Button title={saving ? "Saving..." : "Save"} icon="checkmark" onPress={save} disabled={saving || !title.trim() || !image.trim()} full testID="save-ad" /></View>
            </View>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
        ) : ads.length === 0 && !open ? (
          <Empty icon="megaphone-outline" title="No banners yet" subtitle="Create your first promotional banner" />
        ) : (
          ads.map((ad) => (
            <View key={ad.id} style={styles.adCard}>
              {ad.media_type === "video" || VIDEO_EXT_RE.test(ad.image) ? (
                <View style={styles.adImgWrap}>
                  <View style={styles.videoBadgeBox}><Ionicons name="videocam" size={22} color="#fff" /></View>
                </View>
              ) : (
                <Image source={{ uri: mediaUrl(ad.image) }} style={styles.adImg} />
              )}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.adTitle} numberOfLines={1}>{ad.title}</Text>
                  {(ad.media_type === "video" || VIDEO_EXT_RE.test(ad.image)) && (
                    <View style={styles.videoPill}><Text style={styles.videoPillTxt}>VIDEO</Text></View>
                  )}
                </View>
                {!!ad.subtitle && <Text style={styles.adSub} numberOfLines={1}>{ad.subtitle}</Text>}
                {!!restName(ad.link_restaurant_id) && <Text style={styles.adLink} numberOfLines={1}>{"\u2192"} {restName(ad.link_restaurant_id)}</Text>}
                <View style={{ flexDirection: "row", gap: 16, marginTop: 8, alignItems: "center" }}>
                  <View style={[styles.badge, { backgroundColor: ad.active ? colors.successSoft : colors.surfaceAlt }]}>
                    <Text style={{ fontSize: 10, fontWeight: font.black, color: ad.active ? colors.success : colors.textMuted }}>{ad.active ? "ACTIVE" : "HIDDEN"}</Text>
                  </View>
                  <TouchableOpacity onPress={() => toggleActive(ad)}><Text style={styles.link}>{ad.active ? "Hide" : "Show"}</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => startEdit(ad)}><Text style={styles.link}>Edit</Text></TouchableOpacity>
                  <TouchableOpacity testID={`del-ad-${ad.id}`} onPress={() => remove(ad)}><Text style={[styles.link, { color: colors.error }]}>Delete</Text></TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  form: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: 6, ...shadow.card },
  formTitle: { fontSize: 16, fontWeight: font.black, color: colors.textPrimary, marginBottom: 4 },
  lbl: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary, marginTop: 6 },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, padding: 11, fontSize: 14, color: colors.textPrimary },
  preview: { width: "100%", height: 160, borderRadius: radius.md, marginBottom: 4 },
  uploadBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1.5, borderColor: colors.primary, borderStyle: "dashed", borderRadius: radius.md,
    paddingVertical: 14, backgroundColor: colors.primarySoft, marginTop: 4,
  },
  uploadTxt: { color: colors.primary, fontWeight: font.bold, fontSize: 13, flexShrink: 1 },
  orTxt: { textAlign: "center", color: colors.textMuted, fontSize: 11, marginVertical: 4 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.background, maxWidth: 180 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  error: { color: colors.error, fontSize: 13, fontWeight: font.semi, marginTop: 6 },
  adCard: { flexDirection: "row", gap: 12, padding: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  adImg: { width: 90, height: 90, borderRadius: radius.md },
  adImgWrap: { width: 90, height: 90, borderRadius: radius.md, backgroundColor: "#111", alignItems: "center", justifyContent: "center" },
  videoBadgeBox: { alignItems: "center", justifyContent: "center" },
  adTitle: { fontSize: 15, fontWeight: font.black, color: colors.textPrimary, flexShrink: 1 },
  videoPill: { backgroundColor: "#111", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  videoPillTxt: { color: "#fff", fontSize: 8, fontWeight: font.black, letterSpacing: 0.5 },
  adSub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  adLink: { fontSize: 11, color: colors.primary, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  link: { fontSize: 13, fontWeight: font.bold, color: colors.primary },
});
