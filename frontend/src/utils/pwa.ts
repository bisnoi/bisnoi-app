// PWA install helpers (web only). The `beforeinstallprompt` event is captured
// early in index.html (see scripts/inject-pwa.js) and stashed on window.__bip.
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

export function isStandalone(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true
    );
  } catch {
    return false;
  }
}

export function isIOS(): boolean {
  if (Platform.OS !== "web" || typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
}

export function isAndroid(): boolean {
  if (Platform.OS !== "web" || typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const update = () => setCanInstall(!!(window as any).__bip);
    update();
    window.addEventListener("bipchange", update);
    return () => window.removeEventListener("bipchange", update);
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    if (Platform.OS !== "web" || typeof window === "undefined") return "unavailable";
    const bip = (window as any).__bip;
    if (bip && typeof bip.prompt === "function") {
      try {
        bip.prompt();
        const choice = await bip.userChoice;
        (window as any).__bip = null;
        window.dispatchEvent(new Event("bipchange"));
        return choice && choice.outcome === "accepted" ? "accepted" : "dismissed";
      } catch {
        return "dismissed";
      }
    }
    return "unavailable";
  }, []);

  return { canInstall, promptInstall, standalone: isStandalone(), ios: isIOS(), android: isAndroid() };
}
