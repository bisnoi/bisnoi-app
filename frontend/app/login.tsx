import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ImageBackground,
  Animated,
  Easing,
  useWindowDimensions,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { Api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, spacing, radius, font } from "@/src/theme";
import { Button } from "@/src/components/ui";
import { BrandMark } from "@/src/components/BrandMark";

// OTP is now handled entirely server-side (Message Central SMS provider).
// Test/seeded numbers fall back to a demo OTP returned by the backend.

// Cinematic full-screen hero photos — a mini carousel that cross-fades every
// ~6s so the login screen feels alive and appetizing. PURE-VEG imagery only
// (this is a pure vegetarian brand — no non-veg photos anywhere).
const HERO_IMAGES = [
  "https://images.unsplash.com/photo-1630383249896-424e482df921?w=1600&q=80&auto=format&fit=crop",   // Masala dosa spread (veg)
  "https://images.unsplash.com/photo-1596797038530-2c107229654b?w=1600&q=80&auto=format&fit=crop",   // Paneer / veg biryani (veg)
  "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=1600&q=80&auto=format&fit=crop",   // Fresh healthy veg bowl (veg)
];

// Desktop breakpoint — above this we render the SaleSkip-style split panel
// (colorful hero LEFT, clean white form RIGHT). Below, we render the mobile
// full-screen hero with a bottom sheet.
const DESKTOP_BP = 900;

export default function Login() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { signIn } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BP;

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Rotate the hero image every 6 seconds with a soft cross-fade so the
  // login screen doesn't feel static. Preloads next image via <ImageBackground>.
  const [heroIdx, setHeroIdx] = useState(0);
  const heroFade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let mounted = true;
    let currentAnim: Animated.CompositeAnimation | null = null;

    const runCycle = () => {
      if (!mounted) return;
      currentAnim = Animated.timing(heroFade, {
        toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease),
        useNativeDriver: Platform.OS !== "web",
      });
      currentAnim.start(({ finished }) => {
        if (!mounted || !finished) return;
        setHeroIdx((i) => (i + 1) % HERO_IMAGES.length);
        currentAnim = Animated.timing(heroFade, {
          toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        });
        currentAnim.start();
      });
    };

    const id = setInterval(runCycle, 6000);
    return () => {
      mounted = false;
      clearInterval(id);
      if (currentAnim) currentAnim.stop();
      heroFade.stopAnimation();
    };
  }, [heroFade]);

  // Demo restaurant owner shortcut: phone 8888888888 + OTP 989898 skips the
  // server SMS flow entirely and signs the user in as a mock restaurant_owner
  // so the /owner UI can be demoed without a live backend token.
  const DEMO_OWNER_PHONE = "8888888888";
  const DEMO_OWNER_OTP = "989898";
  const isDemoOwner = phone === DEMO_OWNER_PHONE;

  const sendOtp = async () => {
    setError("");
    if (phone.length !== 10) {
      setError("Enter a valid 10-digit phone number");
      return;
    }
    setLoading(true);
    try {
      if (isDemoOwner) {
        // Skip real SMS for the demo owner number.
        setOtp("");
        setStep("otp");
      } else {
        // All OTP delivery is server-side via Message Central (real SMS).
        await Api.sendOtp(phone);
        setOtp("");
        setStep("otp");
      }
    } catch (e: any) {
      setError(e?.message || "Could not send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    setError("");
    if (otp.length < 4) {
      setError("Enter the OTP code");
      return;
    }
    setLoading(true);
    try {
      if (isDemoOwner && otp === DEMO_OWNER_OTP) {
        const demoUser: any = {
          id: "demo-owner-" + DEMO_OWNER_PHONE,
          phone: DEMO_OWNER_PHONE,
          name: name || "Demo Restaurant Owner",
          role: "restaurant_owner",
          created_at: new Date().toISOString(),
          account_id: "OWN-DEMO01",
        };
        await signIn("demo-owner-token", demoUser);
        router.replace("/owner" as any);
        return;
      }
      const res: any = await Api.verifyOtp(phone, otp, undefined, name || undefined);
      await signIn(res.token, res.user);
      const nextParam = typeof next === "string" && next.startsWith("/") ? next : "";
      if (nextParam && res.user.role === "customer") {
        router.replace(nextParam as any);
        return;
      }
      const target =
        res.user.role === "customer" ? "/customer" :
        res.user.role === "restaurant_owner" || res.user.role === "restaurant_staff" ? "/owner" :
        res.user.role === "rider" ? "/rider" :
        res.user.role === "admin" || res.user.role === "admin_staff" ? "/admin" : "/customer";
      router.replace(target as any);
    } catch (e: any) {
      setError(e?.message || "Incorrect OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // The form fields (phone/OTP inputs + button) are shared across mobile & desktop.
  const FormBody = (
    <>
      {step === "phone" && (
        <>
          <Text style={[styles.label, { marginTop: 4 }]}>MOBILE NUMBER</Text>
          <View style={styles.phoneRow}>
            <View style={styles.cc}><Text style={styles.ccText}>+91</Text></View>
            <TextInput
              testID="login-phone-input"
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, "").slice(0, 10))}
              placeholder="10-digit mobile"
              keyboardType="phone-pad"
              placeholderTextColor={colors.textMuted}
              style={styles.phoneInput}
            />
          </View>

          <Text style={[styles.label, { marginTop: spacing.md }]}>NAME (OPTIONAL)</Text>
          <TextInput
            testID="login-name-input"
            value={name}
            onChangeText={setName}
            placeholder="What should we call you?"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          <TouchableOpacity
            testID="login-send-otp-btn"
            onPress={sendOtp}
            disabled={loading}
            activeOpacity={0.9}
            style={[styles.primaryBtn, loading && { opacity: 0.7 }]}
          >
            <Text style={styles.primaryBtnTxt}>{loading ? "Sending…" : "Login Now"}</Text>
          </TouchableOpacity>

          {Platform.OS === "ios" && (
            <TouchableOpacity
              testID="login-skip"
              onPress={() => router.replace("/customer/profile" as any)}
              activeOpacity={0.85}
              style={styles.skipBelowBtn}
            >
              <Text style={styles.skipBelowBtnTxt}>Skip for now</Text>
            </TouchableOpacity>
          )}

          {error ? <Text style={styles.errorText} testID="login-error">{error}</Text> : null}
          <Text style={styles.legal}>By continuing you agree to Bisnoi's Terms & Privacy</Text>
        </>
      )}

      {step === "otp" && (
        <>
          <TouchableOpacity
            testID="login-back-to-phone"
            onPress={() => setStep("phone")}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
            <Text style={{ color: colors.textPrimary, fontWeight: font.semi }}>Back</Text>
          </TouchableOpacity>

          <Text style={styles.formTitle}>Verify OTP 🔐</Text>
          <Text style={styles.formSubtitle}>Sent to +91 {phone}</Text>

          <View style={styles.smsBox}>
            <Ionicons name="chatbubble-ellipses" size={16} color={colors.primary} />
            <Text style={styles.demoText}>We sent a 4-digit code via SMS. Enter it below.</Text>
          </View>

          <TextInput
            testID="login-otp-input"
            value={otp}
            onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, "").slice(0, 6))}
            placeholder="• • • •"
            keyboardType="number-pad"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              { letterSpacing: 10, textAlign: "center", fontSize: 22, fontWeight: font.black, marginTop: spacing.md },
            ]}
          />

          <TouchableOpacity
            testID="login-verify-btn"
            onPress={verify}
            disabled={loading}
            activeOpacity={0.9}
            style={[styles.primaryBtn, loading && { opacity: 0.7 }]}
          >
            <Text style={styles.primaryBtnTxt}>{loading ? "Verifying…" : "Verify & Continue"}</Text>
          </TouchableOpacity>

          {error ? <Text style={styles.errorText} testID="login-error">{error}</Text> : null}

          <TouchableOpacity
            testID="login-resend-otp"
            onPress={sendOtp}
            style={{ marginTop: spacing.md, alignItems: "center" }}
          >
            <Text style={{ color: colors.primary, fontWeight: font.bold }}>Resend OTP</Text>
          </TouchableOpacity>
        </>
      )}
    </>
  );

  // -------------------- DESKTOP SPLIT-SCREEN --------------------
  if (isDesktop) {
    return (
      <View style={styles.desktopRoot} testID="login-screen">
        {/* LEFT — hero image with dark overlay + brand + welcome copy */}
        <View style={styles.leftPanel}>
          <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: heroFade }]} pointerEvents="none">
            <ImageBackground
              source={{ uri: HERO_IMAGES[heroIdx] }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            >
              <LinearGradient
                colors={["rgba(11,15,12,0.62)", "rgba(11,15,12,0.42)", "rgba(11,15,12,0.85)"]}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFillObject}
              />
            </ImageBackground>
          </Animated.View>

          {/* Top brand */}
          <View style={styles.leftBrand}>
            <BrandMark size={64} radius={16} />
          </View>

          {/* Middle hero copy */}
          <View style={styles.leftMiddle}>
            <Text style={styles.leftHi}>Hello Foodie 👋</Text>
            <Text style={styles.leftHiBrand}>Welcome to Bisnoi.</Text>
            <Text style={styles.leftDesc}>
              Authentic Indian food, ghar jaisa taste, delivered piping hot to your doorstep in 30 minutes flat. Skip the queues — order in a tap.
            </Text>
            <View style={styles.pillsRow}>
              <PillTag icon="flame" text="Hot & fresh" />
              <PillTag icon="flash" text="30-min delivery" />
              <PillTag icon="restaurant" text="500+ dishes" />
            </View>
          </View>

          {/* Bottom copyright */}
          <View style={styles.leftBottom}>
            <Text style={styles.footerTxt}>© 2026 Bisnoi. All rights reserved.</Text>
          </View>
        </View>

        {/* RIGHT — clean white form panel */}
        <View style={styles.rightPanel}>
          <View style={styles.rightHeader}>
            <BrandMark size={32} radius={8} />
            <Text style={styles.rightBrand}>Bisnoi</Text>
          </View>

          <ScrollView
            contentContainerStyle={styles.rightForm}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {FormBody}
          </ScrollView>
        </View>
      </View>
    );
  }

  // -------------------- MOBILE FULL-SCREEN HERO --------------------
  return (
    <View style={styles.root} testID="login-screen">
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: heroFade }]} pointerEvents="none">
        <ImageBackground
          source={{ uri: HERO_IMAGES[heroIdx] }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        >
          <LinearGradient
            colors={["rgba(11,15,12,0.72)", "rgba(11,15,12,0.28)", "rgba(11,15,12,0.86)", "rgba(11,15,12,0.98)"]}
            locations={[0, 0.32, 0.72, 1]}
            style={StyleSheet.absoluteFillObject}
          />
        </ImageBackground>
      </Animated.View>

      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.topBrand} pointerEvents="none">
          <BrandMark size={64} radius={18} />
          <Text style={styles.brand}>Bisnoi</Text>
          <Text style={styles.brandTag}>Authentic Indian food, delivered hot</Text>
        </View>

        <View style={styles.middleTags} pointerEvents="none">
          <Text style={styles.bigTag}>Ghar jaisa{"\n"}<Text style={{ color: colors.primary }}>khaana</Text>, ab door nahi.</Text>
          <View style={styles.pillsRow}>
            <PillTag icon="flame" text="Hot & fresh" />
            <PillTag icon="flash" text="30-min delivery" />
            <PillTag icon="restaurant" text="500+ dishes" />
          </View>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.card}>
            <ScrollView
              contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.lg }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.grabber} />
              {FormBody}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function PillTag({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.pill}>
      <Ionicons name={icon} size={12} color="#FFF" />
      <Text style={styles.pillTxt}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // ---------- DESKTOP SPLIT-SCREEN ----------
  desktopRoot: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    minHeight: 720,
  },
  leftPanel: {
    flex: 1.15,
    minWidth: 480,
    padding: 56,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  leftBrand: {
    zIndex: 2,
  },
  leftMiddle: {
    zIndex: 2,
    maxWidth: 520,
    gap: spacing.md,
  },
  leftHi: {
    color: "#FFFFFF",
    fontSize: 52,
    fontWeight: font.black,
    lineHeight: 60,
    letterSpacing: -1,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowRadius: 12,
  },
  leftHiBrand: {
    color: "#FFFFFF",
    fontSize: 52,
    fontWeight: font.black,
    lineHeight: 60,
    letterSpacing: -1,
    marginTop: -12,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowRadius: 12,
  },
  leftDesc: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: font.med,
    marginTop: 12,
    maxWidth: 480,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowRadius: 8,
  },
  leftBottom: {
    zIndex: 2,
  },
  footerTxt: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontWeight: font.med,
  },
  rightPanel: {
    flex: 1,
    minWidth: 420,
    maxWidth: 620,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 60,
    paddingVertical: 48,
    justifyContent: "center",
  },
  rightHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 48,
  },
  rightBrand: {
    fontSize: 22,
    fontWeight: font.black,
    color: colors.textPrimary,
    letterSpacing: -0.4,
  },
  rightForm: {
    paddingBottom: 32,
  },

  // ---------- MOBILE FULL-SCREEN HERO ----------
  root: { flex: 1, backgroundColor: "#0B0F0C" },
  safe: { flex: 1, justifyContent: "space-between" },
  topBrand: {
    alignItems: "center",
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  brand: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: font.black,
    letterSpacing: -0.5,
    marginTop: 10,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  brandTag: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 13,
    fontWeight: font.med,
    marginTop: 4,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowRadius: 6,
  },
  middleTags: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  bigTag: {
    color: "#FFFFFF",
    fontSize: 22,
    lineHeight: 28,
    fontWeight: font.black,
    textShadowColor: "rgba(0,0,0,0.65)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.28)",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  pillTxt: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: font.bold,
    letterSpacing: 0.3,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: 640,
    boxShadow: "0px -8px 28px rgba(0,0,0,0.22)",
    elevation: 22,
  },
  grabber: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D4DADF",
    marginBottom: spacing.md,
  },

  // ---------- SHARED FORM ----------
  formTitle: {
    fontSize: 30,
    fontWeight: font.black,
    color: colors.textPrimary,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  formSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  formLink: {
    color: colors.textPrimary,
    textDecorationLine: "underline",
    fontWeight: font.bold,
  },
  label: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: font.black,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: radius.md,
    fontSize: 16,
    color: colors.textPrimary,
  },
  phoneRow: { flexDirection: "row", gap: 10 },
  cc: {
    paddingHorizontal: 14,
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  ccText: { fontWeight: font.black, color: colors.textPrimary, fontSize: 16 },
  phoneInput: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: radius.md,
    fontSize: 16,
    color: colors.textPrimary,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
  },
  primaryBtnTxt: {
    color: colors.onPrimary,
    fontWeight: font.black,
    fontSize: 15,
    letterSpacing: 0.5,
  },
  skipBelowBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceAlt,
  },
  skipBelowBtnTxt: {
    color: colors.textSecondary,
    fontWeight: font.bold,
    fontSize: 14,
    letterSpacing: 0.3,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
    alignSelf: "flex-start",
  },
  demoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.warningSoft,
    padding: 12,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  smsBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primarySoft,
    padding: 12,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  demoText: { color: colors.textPrimary, fontSize: 13, flex: 1 },
  errorText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: font.semi,
    marginTop: spacing.md,
    textAlign: "center",
  },
  legal: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.md,
  },
});
