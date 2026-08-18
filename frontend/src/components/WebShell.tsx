import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Platform, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";
import { useInstallPrompt } from "@/src/utils/pwa";
import { BrandMark } from "@/src/components/BrandMark";

const DESKTOP_BP = 1000;

// Web-only: track current pathname (patches history so client-side nav updates it).
function useWebPathname(): string {
  const [path, setPath] = useState<string>(() => (Platform.OS === "web" && typeof window !== "undefined" ? window.location.pathname : "/"));
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const handler = () => setPath(window.location.pathname);
    const w = window as any;
    if (!w.__locPatched) {
      w.__locPatched = true;
      const wrap = (fn: any) =>
        function (this: any) {
          const r = fn.apply(this, arguments as any);
          window.dispatchEvent(new Event("locationchange"));
          return r;
        };
      try {
        history.pushState = wrap(history.pushState);
        history.replaceState = wrap(history.replaceState);
      } catch {}
    }
    window.addEventListener("popstate", handler);
    window.addEventListener("locationchange", handler);
    return () => {
      window.removeEventListener("popstate", handler);
      window.removeEventListener("locationchange", handler);
    };
  }, []);
  return path;
}

function StoreBadge({ topLine, bottomLine, icon, onPress }: { topLine: string; bottomLine: string; icon: any; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.badge}>
      <Ionicons name={icon} size={22} color={colors.textPrimary} />
      <View>
        <Text style={styles.badgeTop}>{topLine}</Text>
        <Text style={styles.badgeBottom}>{bottomLine}</Text>
      </View>
    </TouchableOpacity>
  );
}

function InstallControls({ compact }: { compact?: boolean }) {
  const { canInstall, promptInstall, standalone, ios } = useInstallPrompt();
  const [tip, setTip] = useState(false);
  if (standalone) return null;

  const handleInstall = async () => {
    if (canInstall) {
      await promptInstall();
    } else if (ios) {
      setTip(true);
    } else {
      // Most desktop Chromium browsers expose the prompt; otherwise guide the user.
      setTip(true);
    }
  };

  return (
    <View style={{ alignItems: "flex-end", gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {!compact && (
          <>
            <StoreBadge icon="logo-apple" topLine="Download on the" bottomLine="App Store" onPress={handleInstall} />
            <StoreBadge icon="logo-google-playstore" topLine="GET IT ON" bottomLine="Google Play" onPress={handleInstall} />
          </>
        )}
        <TouchableOpacity testID="install-app" onPress={handleInstall} activeOpacity={0.9} style={styles.installBtn}>
          <Ionicons name="download-outline" size={16} color={colors.onPrimary} />
          <Text style={styles.installTxt}>Install App</Text>
        </TouchableOpacity>
      </View>
      {tip && (
        <Text style={styles.tip}>
          {ios
            ? "On iPhone: tap the Share icon, then 'Add to Home Screen'."
            : "Use your browser menu → 'Install app' / 'Add to Home screen'."}
        </Text>
      )}
    </View>
  );
}

function MobileInstallBanner({ path }: { path: string }) {
  const { canInstall, promptInstall, standalone, ios } = useInstallPrompt();
  const [hidden, setHidden] = useState(true);
  const [tip, setTip] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    try {
      setHidden(window.localStorage.getItem("hide_install_banner") === "1");
    } catch {}
  }, []);

  const onLanding = path === "/" || path === "/login";
  if (standalone || hidden || !onLanding || !(canInstall || ios)) return null;

  const dismiss = () => {
    setHidden(true);
    try { window.localStorage.setItem("hide_install_banner", "1"); } catch {}
  };
  const install = async () => {
    if (canInstall) await promptInstall();
    else setTip(true);
  };

  return (
    <View style={styles.mBanner}>
      <View style={styles.mIcon}><Ionicons name="fast-food" size={20} color={colors.onPrimary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.mTitle}>Get the Bisnoi app</Text>
        <Text style={styles.mSub}>{tip ? "Tap Share → Add to Home Screen" : "Faster ordering, installs like an app"}</Text>
      </View>
      <TouchableOpacity testID="mobile-install" onPress={install} style={styles.mBtn} activeOpacity={0.9}>
        <Text style={styles.mBtnTxt}>Install</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="mobile-install-dismiss" onPress={dismiss} hitSlop={10} style={{ padding: 4 }}>
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

export function WebShell({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const path = useWebPathname();

  if (Platform.OS !== "web") return <>{children}</>;

  // Admin console renders full-bleed (it provides its own sidebar + header chrome).
  if (path.startsWith("/admin")) {
    return <View style={{ flex: 1, backgroundColor: "#F4E9DD" }}>{children}</View>;
  }

  // Owner console (all sub-routes) renders full-bleed — owner/_layout provides
  // its own vertical sidebar + slim mobile header (admin-console look).
  if (path.startsWith("/owner")) {
    return <View style={{ flex: 1, backgroundColor: "#F6F8F7" }}>{children}</View>;
  }

  // Login page uses its own cinematic full-screen hero — no site chrome / top bar.
  if (path === "/login" || path.startsWith("/login")) {
    return <View style={{ flex: 1 }}>{children}</View>;
  }

  const isDesktop = width >= DESKTOP_BP;

  // Owner dashboard renders the full-bleed console (its own sidebar/header) on
  // desktop, exactly like the admin console. Mobile keeps the bottom-tab view.
  if (width >= 1024 && path === "/owner") {
    return <View style={{ flex: 1, backgroundColor: "#F4E9DD" }}>{children}</View>;
  }

  if (!isDesktop) {
    return (
      <View style={{ flex: 1 }}>
        {children}
        <MobileInstallBanner path={path} />
      </View>
    );
  }

  // Desktop: site chrome (top bar) + centered app column. Admin/Owner get full width.
  const isConsole = path.startsWith("/admin") || path.startsWith("/owner") || path.startsWith("/rider");
  const maxWidth = isConsole ? 1180 : 860;

  return (
    <View style={[styles.desktopRoot, { backgroundColor: colors.surfaceAlt }]}>
      <View style={styles.topBar}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <BrandMark size={40} />
          <View>
            <Text style={styles.brand}>Bisnoi</Text>
            <Text style={styles.brandSub}>Authentic Indian food, delivered hot</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <InstallControls />
        </View>
      </View>
      <View style={styles.contentRow}>
        <View style={[styles.appColumn, { width: maxWidth, borderColor: colors.border }]}>
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  desktopRoot: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    paddingVertical: 12,
    minHeight: 68,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexWrap: "wrap",
    gap: 12,
  },
  logoDot: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  logoDotTxt: { color: colors.onPrimary, fontWeight: font.black, fontSize: 16 },
  brand: { fontSize: 18, fontWeight: font.black, color: colors.primary, letterSpacing: -0.3 },
  brandSub: { fontSize: 11, color: colors.textSecondary },
  contentRow: { flex: 1, flexDirection: "row", justifyContent: "center" },
  appColumn: { maxWidth: "100%", backgroundColor: colors.background, borderLeftWidth: 1, borderRightWidth: 1, boxShadow: "0 0 40px rgba(0,0,0,0.08)" } as any,
  badge: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  badgeTop: { fontSize: 8, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  badgeBottom: { fontSize: 13, fontWeight: font.black, color: colors.textPrimary, marginTop: -1 },
  installBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.primary },
  installTxt: { color: colors.onPrimary, fontWeight: font.black, fontSize: 13 },
  tip: { fontSize: 11, color: colors.textSecondary, maxWidth: 320, textAlign: "right" },
  // mobile banner
  mBanner: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
  } as any,
  mIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  mTitle: { fontSize: 13, fontWeight: font.black, color: colors.textPrimary },
  mSub: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  mBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.primary },
  mBtnTxt: { color: colors.onPrimary, fontWeight: font.black, fontSize: 12 },
});
