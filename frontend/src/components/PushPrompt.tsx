import { useEffect } from "react";
import { Platform } from "react-native";
import { useAuth } from "@/src/auth";
import { enablePush, autoSubscribeIfGranted, pushSupported, pushPermission } from "@/src/utils/push";

const ATTEMPT_KEY = "push_prompt_attempted_v1";

/**
 * HEADLESS push manager (renders nothing).
 *
 * - Silently re-syncs an existing subscription if permission is already granted
 *   (covers new devices / fresh logins).
 * - Otherwise, on the FIRST user gesture after login (pointerdown/keydown) it
 *   calls enablePush(), which triggers the browser's native notification popup.
 *   A one-shot flag (push_prompt_attempted_v1) ensures it fires only once per
 *   browser so the user isn't nagged repeatedly.
 */
export default function PushPrompt() {
  const { user } = useAuth();

  useEffect(() => {
    if (Platform.OS !== "web" || !user) return;
    // Re-sync silently if already granted.
    autoSubscribeIfGranted();

    if (!pushSupported() || pushPermission() !== "default") return;
    try {
      if (typeof localStorage !== "undefined" && localStorage.getItem(ATTEMPT_KEY) === "1") return;
    } catch {
      /* ignore */
    }

    let done = false;
    const cleanup = () => {
      if (typeof window === "undefined") return;
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
    const handler = async () => {
      if (done) return;
      done = true;
      try {
        localStorage.setItem(ATTEMPT_KEY, "1");
      } catch {
        /* ignore */
      }
      cleanup();
      try {
        await enablePush();
      } catch {
        /* ignore */
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("pointerdown", handler);
      window.addEventListener("keydown", handler);
    }
    return cleanup;
  }, [user]);

  return null;
}
