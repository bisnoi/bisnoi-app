// Web Push (VAPID) subscription helpers for the PWA.
import { Platform } from "react-native";
import { Api } from "@/src/api";

export function pushSupported(): boolean {
  return (
    Platform.OS === "web" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushPermission(): "granted" | "denied" | "default" | "unsupported" {
  if (!pushSupported()) return "unsupported";
  return (window as any).Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) return reg;
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

async function subscribeAndSync(): Promise<boolean> {
  const reg = await getRegistration();
  if (!reg) return false;
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await Api.pushPublicKey();
    if (!publicKey) return false;
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  await Api.pushSubscribe(JSON.parse(JSON.stringify(sub)));
  return true;
}

// Called from a user gesture (button). Requests permission then subscribes.
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  try {
    const perm = await (window as any).Notification.requestPermission();
    if (perm !== "granted") return { ok: false, reason: perm };
    const ok = await subscribeAndSync();
    return { ok, reason: ok ? undefined : "subscribe_failed" };
  } catch (e: any) {
    return { ok: false, reason: e?.message || "error" };
  }
}

// Silent: only re-syncs if the user already granted permission (no prompt).
export async function autoSubscribeIfGranted(): Promise<void> {
  try {
    if (pushPermission() === "granted") await subscribeAndSync();
  } catch {
    /* ignore */
  }
}
