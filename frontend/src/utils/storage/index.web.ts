// Web storage — backed directly by window.localStorage (synchronous, reliable).
// We intentionally avoid @react-native-async-storage/async-storage on web because
// its async web shim can hang in static production exports, blocking app bootstrap.
// Helpers never throw: reads return `fallback`, writes return `false`.
// Values supported: string | number | boolean | null (JSON-serialized).
// No Keychain on web — secure* helpers reuse localStorage.

import { AssertNoExtras, StorageBase, StorageItemValue } from "./storage-base";

function ls(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* access may throw in some privacy modes */
  }
  return null;
}

export class Storage extends StorageBase {
  async getItem<Fallback extends StorageItemValue>(
    key: string,
    fallback: Fallback,
  ): Promise<Fallback | null> {
    try {
      const store = ls();
      const raw = store ? store.getItem(key) : null;
      return this.retrieve(raw, fallback);
    } catch (e) {
      this.warn("getItem", key, e);
      return fallback;
    }
  }

  async setItem<Value extends StorageItemValue>(
    key: string,
    value: Value,
  ): Promise<boolean> {
    try {
      const store = ls();
      if (store) store.setItem(key, JSON.stringify(value));
      return !!store;
    } catch (e) {
      this.warn("setItem", key, e);
      return false;
    }
  }

  async removeItem(key: string): Promise<boolean> {
    try {
      const store = ls();
      if (store) store.removeItem(key);
      return !!store;
    } catch (e) {
      this.warn("removeItem", key, e);
      return false;
    }
  }

  // Browsers have no Keychain — secure* helpers fall through to localStorage.
  async secureGet<Fallback extends StorageItemValue>(
    key: string,
    fallback: Fallback,
  ): Promise<Fallback | null> {
    return this.getItem(key, fallback);
  }

  async secureSet<Value extends StorageItemValue>(
    key: string,
    value: Value,
  ): Promise<boolean> {
    return this.setItem(key, value);
  }

  async secureRemove(key: string): Promise<boolean> {
    return this.removeItem(key);
  }
}

export const storage = new Storage();

// Compile-time guard: any new method must be declared in storage-base.ts first.
type _NoExtras = AssertNoExtras<Exclude<keyof Storage, keyof StorageBase>>;
