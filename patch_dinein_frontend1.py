#!/usr/bin/env python3
import shutil, sys

def patch(path, replacements):
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    for label, old, new in replacements:
        n = src.count(old)
        if n != 1:
            print(f"[ABORT] '{label}' in {path}: expected 1 match, found {n}")
            sys.exit(1)
        src = src.replace(old, new, 1)
    shutil.copy(path, path + ".bak")
    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
    print(f"[OK] Patched {path}")

# ---- TablesView.tsx: fix QR URL to match the real app route pattern ----
patch("frontend/src/components/TablesView.tsx", [
(
"fix dineUrl to use real /dinein?rid=&tid=&t= route",
'''const DINE_BASE_URL = "https://bisnoi.com/dine";

function dineUrl(t: T): string {
  return `${DINE_BASE_URL}/${t.restaurant_id || ""}/${t.id}?t=${t.qr_token || ""}`;
}''',
'''const DINE_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

function dineUrl(t: T): string {
  return `${DINE_BASE}/dinein?rid=${encodeURIComponent(t.restaurant_id || "")}&tid=${encodeURIComponent(t.id)}&t=${encodeURIComponent(t.qr_token || "")}`;
}''',
),
])

# ---- api.ts: headers support + token-aware dinein calls ----
patch("frontend/src/api.ts", [
(
"api() accepts custom headers",
'''export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: any; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };''',
'''export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: any; auth?: boolean; headers?: Record<string, string> } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(opts.headers || {}) };''',
),
(
"dineinContext requires token",
'''  dineinContext: (restaurant_id: string, table_id: string) =>
    api(`/dinein/context?restaurant_id=${encodeURIComponent(restaurant_id)}&table_id=${encodeURIComponent(table_id)}`, { auth: false }),''',
'''  dineinContext: (restaurant_id: string, table_id: string, token: string) =>
    api(`/dinein/context?restaurant_id=${encodeURIComponent(restaurant_id)}&table_id=${encodeURIComponent(table_id)}&token=${encodeURIComponent(token)}`, { auth: false }),''',
),
(
"createDineinOrder sends X-Dinein-Token, drops raw table fields",
'''  createDineinOrder: (body: {
    restaurant_id: string;
    table_id?: string;
    table_number?: number;
    table_label?: string;
    items: { menu_item_id: string; quantity: number }[];
    note?: string;
  }) => api("/dinein/order", { method: "POST", body }),''',
'''  createDineinOrder: (body: {
    restaurant_id: string;
    items: { menu_item_id: string; quantity: number }[];
    note?: string;
  }, dineinToken: string) =>
    api("/dinein/order", { method: "POST", body, headers: { "X-Dinein-Token": dineinToken } }),''',
),
])
