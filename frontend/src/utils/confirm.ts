// Cross-platform confirm. React Native Web's Alert.alert does NOT render an
// interactive dialog (callbacks never fire), so on web we use window.confirm.
import { Alert, Platform } from "react-native";

export function confirmDialog(
  title: string,
  message?: string,
  confirmLabel = "OK",
  destructive = false,
): Promise<boolean> {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined" && typeof window.confirm === "function") {
        return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
      }
    } catch {
      /* ignore */
    }
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
    ]);
  });
}

// Cross-platform one-way notification. On web, Alert.alert renders nothing and any
// button callback (e.g. navigation onPress) never fires — so we use window.alert and
// then run onOk ourselves. On native we use Alert.alert with an OK button.
export function notify(title: string, message?: string, onOk?: () => void) {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(message ? `${title}\n\n${message}` : title);
      }
    } catch {
      /* ignore */
    }
    onOk?.();
    return;
  }
  Alert.alert(title, message, onOk ? [{ text: "OK", onPress: onOk }] : undefined);
}
