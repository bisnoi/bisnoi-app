import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { useInstallPrompt } from "@/src/utils/pwa";

const APP_STORE_URL = "https://apps.apple.com/in/app/bisnoi/id6788636323";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.bisnoi.app&hl=en_IN";

/**
 * QR / barcode landing page.
 * Carries the table's tid + t (qr_token) through to the ordering screen so
 * the customer never has to type a table number — the QR is the identity.
 */
export default function DineInQrLanding() {
  const router = useRouter();
  const { rid, tid, t } = useLocalSearchParams<{ rid?: string; tid?: string; t?: string; table?: string }>();
  const { canInstall, promptInstall, ios } = useInstallPrompt();
  const [restName, setRestName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (rid) {
        try {
          const det: any = await Api.restaurant(String(rid));
          setRestName((det.restaurant || det)?.name || "");
        } catch { /* ignore */ }
      }
      setLoading(false);
    })();
  }, [rid]);

  const doInstall = () => {
    Linking.openURL(ios ? APP_STORE_URL : PLAY_STORE_URL);
  };

  const orderParams: Record<string, string> = {};
  if (rid) orderParams.rid = String(rid);
  if (tid) orderParams.tid = String(tid);
  if (t) orderParams.t = String(t);

  // Universal/App Links route by path, so a tapped https://bisnoi.com/dinein
  // link lands right here even inside the native app. If we're already
  // native, there's no "install the app" card to show — jump straight in.
  useEffect(() => {
    if (Platform.OS !== "web" && tid && t) {
      router.replace({ pathname: "/dinein-order", params: orderParams } as any);
    }
  }, [tid, t]);

  const openApp = () => {
    if (Platform.OS !== "web") {
      if (tid && t) router.replace({ pathname: "/dinein-order", params: orderParams } as any);
      else router.replace("/customer/dinein" as any);
      return;
    }
    // On web: try handing off to the native app via its custom URL scheme
    // (a direct user tap/gesture, so it works even where silent JS redirects
    // to universal/app links get blocked). If the app isn't installed, the
    // scheme open silently does nothing and the page stays visible/focused —
    // so after a short delay, fall back to the same ordering flow on the web
    // (dine-in orders are pay-at-counter, no native-only payment needed).
    const qs = new URLSearchParams(orderParams).toString();
    const target = tid && t ? `bisnoi://dinein-order${qs ? `?${qs}` : ""}` : `bisnoi://customer/dinein`;
    let fellBack = false;
    const fallbackToWeb = () => {
      if (fellBack || document.hidden) return; // page went to background — app opened
      fellBack = true;
      if (tid && t) router.push({ pathname: "/dinein-order", params: orderParams } as any);
      else router.push("/customer/dinein" as any);
    };
    Linking.openURL(target).catch(() => { /* ignore — fallback timer below handles it */ });
    setTimeout(fallbackToWeb, 1500);
  };

  if (loading) {
    return <SafeAreaView style={styles.safe} edges={["top"]}><View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View></SafeAreaView>;
  }

  if (Platform.OS !== "web" && tid && t) {
    // Redirecting to /dinein-order (see useEffect above) — render nothing to avoid a flash.
    return null;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <View style={styles.hero}>
          <View style={styles.brandMark}><Text style={styles.brandLetter}>B</Text></View>
          <Text style={styles.brandName}>Bisnoi</Text>
          {!!restName && (
            <View style={styles.tablePill}>
              <Ionicons name="restaurant" size={13} color={colors.onPrimary} />
              <Text style={styles.tablePillTxt}>{restName}</Text>
            </View>
          )}
        </View>

        <View style={styles.installCard}>
          <View style={styles.installIcon}><Ionicons name="phone-portrait" size={26} color={colors.primary} /></View>
          <Text style={styles.h2}>Get the Bisnoi app</Text>
          <Text style={styles.installSub}>
            Install the Bisnoi app for dine-in ordering, order tracking and exclusive offers.
          </Text>

          <TouchableOpacity testID="dinein-install" activeOpacity={0.9} onPress={doInstall} style={styles.primaryBtn}>
            <Ionicons name={ios ? "logo-apple" : "logo-google-playstore"} size={18} color={colors.onPrimary} />
            <Text style={styles.primaryTxt}>{ios ? "Download on the App Store" : "Get it on Google Play"}</Text>
          </TouchableOpacity>

          {/* How to order after install */}
          <View style={styles.stepsBox}>
            <Text style={styles.stepsTitle}>How to order</Text>
            <Step n={1} text={`Open the Bisnoi app`} />
            <Step n={2} text={restName ? `You'll land straight on ${restName}'s menu` : "You'll land straight on the menu"} />
            <Step n={3} text="Add items and place your order — no typing needed" />
          </View>

          <TouchableOpacity testID="dinein-open-app" activeOpacity={0.85} onPress={openApp} style={styles.ghostBtn}>
            <Text style={styles.ghostTxt}>Open Bisnoi app →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepNum}><Text style={styles.stepNumTxt}>{n}</Text></View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  h2: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary },
  hero: { alignItems: "center", paddingVertical: spacing.xl },
  brandMark: { width: 64, height: 64, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", ...shadow.lifted },
  brandLetter: { color: colors.onPrimary, fontSize: 34, fontWeight: font.black },
  brandName: { fontSize: 24, fontWeight: font.black, color: colors.textPrimary, marginTop: 10 },
  tablePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, marginTop: 10 },
  tablePillTxt: { color: colors.onPrimary, fontSize: 12, fontWeight: font.bold },
  installCard: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, alignItems: "center", ...shadow.card },
  installIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  installSub: { color: colors.textSecondary, fontSize: 14, textAlign: "center", marginTop: 8, lineHeight: 20 },
  iosBox: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg, alignSelf: "stretch" },
  iosTxt: { color: colors.textPrimary, fontSize: 13, lineHeight: 19, textAlign: "center" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, borderRadius: radius.lg, backgroundColor: colors.primary, alignSelf: "stretch", marginTop: spacing.lg, ...shadow.lifted },
  primaryTxt: { color: colors.onPrimary, fontSize: 16, fontWeight: font.black },
  ghostBtn: { alignItems: "center", justifyContent: "center", height: 46, marginTop: 10 },
  ghostTxt: { color: colors.primary, fontSize: 15, fontWeight: font.bold },
  stepsBox: { alignSelf: "stretch", marginTop: spacing.lg, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: 10 },
  stepsTitle: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.4, marginBottom: 2 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  stepNumTxt: { color: colors.onPrimary, fontSize: 12, fontWeight: font.black },
  stepText: { flex: 1, fontSize: 13.5, color: colors.textPrimary, fontWeight: font.semi },
});
