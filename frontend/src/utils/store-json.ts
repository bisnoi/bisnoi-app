// Small JSON persistence helpers on top of the primitive `storage` wrapper.
// The underlying storage only supports string|number|boolean|null, so we store
// JSON strings and parse on read.
import { storage } from "@/src/utils/storage";

export async function loadJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const s = await storage.getItem<string>(key, "");
    if (!s) return fallback;
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export async function saveJson(key: string, value: unknown): Promise<void> {
  try {
    await storage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
