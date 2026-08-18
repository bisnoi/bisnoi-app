import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { useAuth } from "@/src/auth";
import { registerForPush } from "@/src/utils/nativePush";

/**
 * HEADLESS native push manager (renders nothing).
 *
 * Registers the device's FCM/APNs token with the backend on login and whenever
 * the app returns to the foreground (tokens rotate). Web is a no-op — the PWA
 * uses Web Push (VAPID) via <PushPrompt />.
 */
export default function NativePushManager() {
  const { user } = useAuth();

  useEffect(() => {
    if (Platform.OS === "web" || !user?.id) return;

    registerForPush(user.id);

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && user?.id) registerForPush(user.id);
    });
    return () => sub.remove();
  }, [user?.id]);

  return null;
}
