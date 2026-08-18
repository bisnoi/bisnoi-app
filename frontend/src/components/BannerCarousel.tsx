import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  useWindowDimensions, Platform, NativeSyntheticEvent, NativeScrollEvent,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { mediaUrl } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";

export type Banner = {
  id: string;
  title: string;
  subtitle?: string;
  image: string;
  media_type?: string; // "image" | "video"
  link_restaurant_id?: string | null;
};

const AUTO_MS = 4500;

/** Web-only <video> renderer (RN-web renders raw DOM elements fine). */
function VideoMedia({ uri }: { uri: string }) {
  if (Platform.OS !== "web") {
    return <View style={{ flex: 1, backgroundColor: "#111" }} />;
  }
  return React.createElement("video", {
    src: uri,
    autoPlay: true,
    muted: true,
    loop: true,
    playsInline: true,
    style: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  });
}

export default function BannerCarousel({ banners }: { banners: Banner[] }) {
  const router = useRouter();
  const { width: winW } = useWindowDimensions();
  const cardW = Math.min(winW, 700) - spacing.lg * 2;
  const cardH = Math.round(Math.min(Math.max(cardW * 0.52, 150), 260));
  const listRef = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);
  const interacting = useRef(false);

  // Auto-advance (paused while the user is dragging; skipped when a video is showing)
  useEffect(() => {
    if (banners.length <= 1) return;
    const t = setInterval(() => {
      if (interacting.current) return;
      const current = banners[index % banners.length];
      if (current?.media_type === "video") return; // let videos play
      const next = (index + 1) % banners.length;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setIndex(next);
    }, AUTO_MS);
    return () => clearInterval(t);
  }, [banners, index]);

  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / (cardW + 12));
    setIndex(Math.max(0, Math.min(i, banners.length - 1)));
    interacting.current = false;
  }, [banners.length, cardW]);

  if (!banners.length) return null;

  return (
    <View style={{ marginTop: spacing.md }} testID="hero-banner-carousel">
      <FlatList
        ref={listRef}
        data={banners}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(b) => b.id}
        snapToInterval={cardW + 12}
        decelerationRate="fast"
        onScrollBeginDrag={() => { interacting.current = true; }}
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, i) => ({ length: cardW + 12, offset: (cardW + 12) * i, index: i })}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 12 }}
        renderItem={({ item }) => {
          const uri = mediaUrl(item.image);
          const clickable = !!item.link_restaurant_id;
          return (
            <TouchableOpacity
              activeOpacity={clickable ? 0.92 : 1}
              testID={`hero-banner-${item.id}`}
              onPress={() => { if (clickable) router.push(`/restaurant/${item.link_restaurant_id}` as any); }}
              style={[styles.card, { width: cardW, height: cardH }]}
            >
              {item.media_type === "video" ? (
                <VideoMedia uri={uri} />
              ) : (
                <Image source={{ uri }} style={StyleSheet.absoluteFillObject as any} resizeMode="cover" />
              )}
              {/* bottom scrim + copy */}
              <View style={styles.scrim} pointerEvents="none" />
              <View style={styles.copy} pointerEvents="none">
                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                {!!item.subtitle && <Text style={styles.sub} numberOfLines={1}>{item.subtitle}</Text>}
                {clickable && (
                  <View style={styles.cta}>
                    <Text style={styles.ctaTxt}>Order now</Text>
                    <Ionicons name="chevron-forward" size={13} color="#111" />
                  </View>
                )}
              </View>
              {item.media_type === "video" && (
                <View style={styles.videoTag} pointerEvents="none">
                  <Ionicons name="play" size={10} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />
      {banners.length > 1 && (
        <View style={styles.dots}>
          {banners.map((b, i) => (
            <View key={b.id} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl, overflow: "hidden", backgroundColor: colors.surfaceAlt,
    ...shadow.card,
  },
  scrim: {
    position: "absolute", left: 0, right: 0, bottom: 0, height: "55%",
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  copy: { position: "absolute", left: 14, right: 14, bottom: 12 },
  title: { color: "#fff", fontSize: 20, fontWeight: font.black },
  sub: { color: "rgba(255,255,255,0.92)", fontSize: 13, fontWeight: font.semi, marginTop: 2 },
  cta: {
    flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start",
    backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.pill, marginTop: 8,
  },
  ctaTxt: { color: "#111", fontSize: 12, fontWeight: font.black },
  videoTag: {
    position: "absolute", top: 10, right: 10, width: 24, height: 24, borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center",
  },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.borderStrong },
  dotActive: { width: 18, backgroundColor: colors.primary },
});
