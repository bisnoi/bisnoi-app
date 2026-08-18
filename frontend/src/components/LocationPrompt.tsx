import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import * as Location from "expo-location";
import { useAuth } from "@/src/auth";
import { storage } from "@/src/utils/storage";

const CACHE_KEY = "last_geo_v1";
const NATIVE_TIMEOUT = 12000;

export type CachedGeo = { lat: number; lng: number; accuracy?: number; at: number };

// In-memory mirror of the persisted position, so a position is available
// synchronously even though native storage is async. Hydrated once on boot and
// kept in step by writeCache; React consumers should prefer useCachedLocation.
let memoryCache: CachedGeo | null = null;
let hydration: Promise<CachedGeo | null> | null = null;

type Listener = (c: CachedGeo | null) => void;
const listeners = new Set<Listener>();

/** Read the last-known cached position (or null). Synchronous by design. */
export function readCachedLocation(): CachedGeo | null {
  return memoryCache;
}

/** Load the persisted position into the in-memory mirror. Runs at most once. */
export function hydrateCachedLocation(): Promise<CachedGeo | null> {
  if (!hydration) {
    hydration = (async () => {
      try {
        const raw = await storage.getItem<string>(CACHE_KEY, "");
        if (raw) memoryCache = JSON.parse(raw) as CachedGeo;
      } catch {
        /* corrupt or absent cache -> stay null */
      }
      return memoryCache;
    })();
  }
  return hydration;
}

function writeCache(c: CachedGeo) {
  memoryCache = c;
  storage.setItem(CACHE_KEY, JSON.stringify(c)).catch(() => {});
  listeners.forEach((l) => {
    try {
      l(c);
    } catch {
      /* a bad subscriber must not break the others */
    }
  });
}

/**
 * Subscribe to the cached position. Returns the current value and re-renders
 * when a fresh fix arrives — needed because the first fix lands well after
 * mount (permission prompt + GPS lock).
 */
export function useCachedLocation(): CachedGeo | null {
  const [geo, setGeo] = useState<CachedGeo | null>(memoryCache);
  useEffect(() => {
    let alive = true;
    const listener: Listener = (c) => { if (alive) setGeo(c); };
    listeners.add(listener);
    hydrateCachedLocation().then((c) => { if (alive && c) setGeo(c); });
    return () => { alive = false; listeners.delete(listener); };
  }, []);
  return geo;
}

type PermState = "granted" | "denied" | "prompt" | "unsupported";

async function permissionState(): Promise<PermState> {
  if (Platform.OS !== "web") {
    try {
      const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
      if (status === "granted") return "granted";
      if (status === "denied" && !canAskAgain) return "denied";
      return "prompt";
    } catch {
      return "unsupported";
    }
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) return "unsupported";
  // Chromium exposes navigator.permissions.query; Safari/older fall back to "prompt".
  try {
    const p: any = (navigator as any).permissions;
    if (p && typeof p.query === "function") {
      const r = await p.query({ name: "geolocation" as PermissionName });
      return (r?.state as any) || "prompt";
    }
  } catch {
    /* ignore */
  }
  return "prompt";
}

function fetchWeb(highAccuracy: boolean): Promise<CachedGeo | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          at: Date.now(),
        }),
      () => resolve(null),
      { enableHighAccuracy: highAccuracy, maximumAge: 60_000, timeout: NATIVE_TIMEOUT },
    );
  });
}

async function fetchNative(highAccuracy: boolean): Promise<CachedGeo | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;

    // getCurrentPositionAsync can hang indefinitely when GPS is off, so race it
    // against a timeout and fall back to the OS's last known fix.
    const fresh = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: highAccuracy ? Location.Accuracy.High : Location.Accuracy.Balanced,
      }),
      new Promise<null>((r) => setTimeout(() => r(null), NATIVE_TIMEOUT)),
    ]);
    const pos = fresh || (await Location.getLastKnownPositionAsync());
    if (!pos) return null;
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? undefined,
      at: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch a fresh position and cache it. Resolves to the cached record (or null).
 * Safe to call anytime — if permission has not been decided yet the OS shows
 * its native prompt; if already granted it resolves silently.
 */
export async function refreshCachedLocation(highAccuracy = false): Promise<CachedGeo | null> {
  const geo = Platform.OS === "web" ? await fetchWeb(highAccuracy) : await fetchNative(highAccuracy);
  if (geo) writeCache(geo);
  return geo;
}

/**
 * HEADLESS location manager (renders nothing).
 *
 * On mount after login it hydrates the cached position, then — unless the user
 * has permanently denied access — asks the OS for a fix, which surfaces the
 * native permission prompt the first time. It refreshes again whenever the app
 * comes back to the foreground so the cache stays warm for readCachedLocation()
 * and useCachedLocation() consumers.
 */
export default function LocationPrompt() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      await hydrateCachedLocation();
      if (cancelled) return;
      const state = await permissionState();
      if (cancelled || state === "denied" || state === "unsupported") return;
      // `prompt` -> native popup appears; `granted` -> silent refresh.
      refreshCachedLocation(false);
    })();

    const refreshIfGranted = () => {
      permissionState().then((s) => {
        if (s === "granted") refreshCachedLocation(false);
      });
    };

    if (Platform.OS === "web") {
      const onVisible = () => {
        if (typeof document !== "undefined" && document.visibilityState === "visible") refreshIfGranted();
      };
      if (typeof window !== "undefined") window.addEventListener("focus", refreshIfGranted);
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
      return () => {
        cancelled = true;
        if (typeof window !== "undefined") window.removeEventListener("focus", refreshIfGranted);
        if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
      };
    }

    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refreshIfGranted();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [user]);

  return null;
}
