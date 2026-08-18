// Native push registration (FCM / APNs) via the Emergent managed relay.
// Web is a no-op — the PWA keeps using Web Push (VAPID) from `push.ts`.
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

/**
 * Request notification permission, grab the NATIVE device token
 * (getDevicePushTokenAsync — NOT an Expo push token) and register it with the
 * backend so `send_push([user_id], …)` can resolve it. Safe to call on every
 * app open; tokens rotate and the backend upserts.
 */
export async function registerForPush(userId: string): Promise<void> {
  if (Platform.OS === "web" || !userId) return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;

    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await fetch(`${BASE}/api/register-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        platform: Platform.OS,
        device_token: tokenResp.data,
      }),
    });
  } catch {
    /* non-blocking: push is best-effort */
  }
}
