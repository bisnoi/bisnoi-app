import AsyncStorage from "@react-native-async-storage/async-storage";

const LOG_KEY = "debug_crash_logs_v1";
const MAX_LOGS = 50;

export type LogEntry = {
  at: string;
  type: "error" | "warn" | "info";
  message: string;
  stack?: string;
};

export async function addLog(type: LogEntry["type"], message: string, stack?: string) {
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    const logs: LogEntry[] = raw ? JSON.parse(raw) : [];
    logs.push({ at: new Date().toISOString(), type, message, stack });
    while (logs.length > MAX_LOGS) logs.shift();
    await AsyncStorage.setItem(LOG_KEY, JSON.stringify(logs));
  } catch {
    /* ignore */
  }
}

export async function getLogs(): Promise<LogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearLogs() {
  try {
    await AsyncStorage.removeItem(LOG_KEY);
  } catch {
    /* ignore */
  }
}

let installed = false;
export function installGlobalHandlers() {
  if (installed) return;
  installed = true;

  try {
    const g: any = global as any;
    const defaultHandler = g.ErrorUtils?.getGlobalHandler?.();
    g.ErrorUtils?.setGlobalHandler?.((error: any, isFatal?: boolean) => {
      addLog(
        isFatal ? "error" : "warn",
        `${isFatal ? "[FATAL] " : "[JS] "}${error?.message || String(error)}`,
        error?.stack
      );
      if (defaultHandler) defaultHandler(error, isFatal);
    });
  } catch {
    /* ignore */
  }

  try {
    const tracking = require("promise/setimmediate/rejection-tracking");
    tracking.enable({
      allRejections: true,
      onUnhandled: (_id: any, error: any) => {
        addLog("error", `[Unhandled Promise] ${error?.message || String(error)}`, error?.stack);
      },
    });
  } catch {
    /* ignore — polyfill not present, safe to skip */
  }
}
