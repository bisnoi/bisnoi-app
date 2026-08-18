import React, { useEffect, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { enableScreens } from "react-native-screens";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/auth";
import { CartProvider } from "@/src/cart";
import { colors, applyServerTheme, bisnoiNavTheme } from "@/src/theme";
import { ThemeProvider } from "@react-navigation/native";
import { Api } from "@/src/api";
import { WebShell } from "@/src/components/WebShell";
import OrderAlerts from "@/src/components/OrderAlerts";
import SupportChat from "@/src/components/SupportChat";
import PushPrompt from "@/src/components/PushPrompt";
import LocationPrompt from "@/src/components/LocationPrompt";
import PullToRefresh from "@/src/components/PullToRefresh";
import SplashOverlay from "@/src/components/SplashOverlay";
import NativePushManager from "@/src/components/NativePushManager";
import { ErrorBoundary } from "@/src/components/ErrorBoundary";
import { installGlobalHandlers } from "@/src/utils/crashLog";
import { storage } from "@/src/utils/storage";
import { confirmDialog } from "@/src/utils/confirm";

SplashScreen.preventAutoHideAsync();
installGlobalHandlers();

// iOS 26 + react-native-screens 4.16 use-after-free workaround
if (Platform.OS === "ios") {
  enableScreens(false);
}

// --- Native push (FCM / APNs via the Emergent relay). Web is guarded out so
// the PWA keeps using Web Push (VAPID). These MUST live at module scope so the
// handler + channel exist before any notification arrives. ---
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

// Only show the intro splash once per browser session (so navigating between
// pages doesn't re-flash it).
function useOneShotSplash(): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const key = "__bisnoi_splash_shown";
      const shown = window.sessionStorage.getItem(key);
      if (!shown) {
        window.sessionStorage.setItem(key, "1");
        setShow(true);
      }
    } catch {
      /* ignore */
    }
  }, []);
  return show;
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const showSplash = useOneShotSplash();
  const router = useRouter();

  // Native push: tap handling (warm + cold-start) + weekly denied-permission
  // nudge. Web early-returns (PWA uses Web Push).
  useEffect(() => {
    if (Platform.OS === "web") return;

    const openTarget = (data: any) => {
      const url = data?.deeplink || data?.action_url;
      if (!url || typeof url !== "string") return;
      if (url.startsWith("http")) Linking.openURL(url);
      else router.push(url as any);
    };

    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      openTarget(response.notification.request.content.data || {});
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openTarget(response.notification.request.content.data || {});
    });

    (async () => {
      try {
        const { status, canAskAgain } = await Notifications.getPermissionsAsync();
        if (status !== "denied" || canAskAgain) return;
        const last = await storage.getItem<string>("pushNudgeAt", "");
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        if (last && Date.now() - Number(last) <= oneWeek) return;
        const go = await confirmDialog(
          "Turn on notifications",
          "Get order updates, delivery alerts and offers.",
          "Open Settings",
        );
        await storage.setItem("pushNudgeAt", String(Date.now()));
        if (go) Linking.openSettings();
      } catch {
        /* ignore */
      }
    })();

    return () => {
      tapSub.remove();
    };
  }, [router]);

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  // Sync the admin-chosen global accent color on boot (reloads once if changed).
  useEffect(() => {
    Api.getTheme()
      .then((r: any) => applyServerTheme(r?.color))
      .catch(() => {});
  }, []);

  if (!loaded && !error) return null;

  return (
    <ErrorBoundary>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
      <SafeAreaProvider>
        <AuthProvider>
          <CartProvider>
            <ThemeProvider value={bisnoiNavTheme}>
            <StatusBar style="dark" />
            <WebShell>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: "transparent" },
                  animation: "none",
                }}
              />
              <OrderAlerts />
              <PushPrompt />
              <NativePushManager />
              <LocationPrompt />
              <SupportChat />
              <PullToRefresh />
            </WebShell>
            {showSplash ? <SplashOverlay durationMs={1800} /> : null}
            </ThemeProvider>
          </CartProvider>
        </AuthProvider>
      </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
