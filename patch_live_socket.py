#!/usr/bin/env python3
"""
patch_live_socket.py

1) backend/server.py — assign_rider()
   Adds f"order:{oid}" to the set of rooms the `rider_assigned` event is
   emitted to (it already went to the restaurant + admin rooms). The
   customer's tracking screen can now react the instant a rider accepts,
   instead of waiting for its next poll.

2) frontend/app/order/[id].tsx
   - imports getSocket / joinRoom / leaveRoom (same helpers already used on
     the rider home screen)
   - joins room `order:{id}` while this screen is mounted
   - on `rider_location` (pushed by patch_live_tracking.py's backend change),
     merges the new lat/lng straight into local state — the map marker moves
     immediately, no 5s wait
   - on `rider_assigned`, immediately re-fetches the real order so the
     status/rider name update without waiting for the poll tick

Requires patch_live_tracking.py to already be applied (this depends on the
`rider_location` socket event it adds).

Usage:
    cd ~/original_version
    python3 patch_live_socket.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND_FILE = ROOT / "backend" / "server.py"
TRACKING_FILE = ROOT / "frontend" / "app" / "order" / "[id].tsx"


def apply_patch(path: Path, old: str, new: str, label: str) -> bool:
    if not path.exists():
        print(f"[SKIP] {label}: file not found at {path}")
        return False
    text = path.read_text(encoding="utf-8")

    if new.strip() and new in text:
        print(f"[OK]   {label}: already patched, nothing to do")
        return True

    count = text.count(old)
    if count == 0:
        print(f"[FAIL] {label}: could not find the expected original code.")
        print("       No changes made to this file.")
        return False
    if count > 1:
        print(f"[FAIL] {label}: found {count} matches, expected exactly 1 — refusing to guess.")
        print("       No changes made to this file.")
        return False

    backup = path.with_suffix(path.suffix + ".bak")
    if not backup.exists():
        backup.write_text(text, encoding="utf-8")
        print(f"       backup written: {backup}")

    path.write_text(text.replace(old, new), encoding="utf-8")
    print(f"[DONE] {label}: patched {path}")
    return True


# ---------------------------------------------------------------------------
# 1. backend — also emit rider_assigned to the order's own room
# ---------------------------------------------------------------------------

BACKEND_OLD = '''    for room in (f"restaurant:{o.get('restaurant_id')}", "admin"):
        try:
            await sio.emit(
                "rider_assigned",
                {
                    "order_id": oid,
                    "rider_id": user["id"],
                    "rider_name": user.get("name"),
                    "restaurant_id": o.get("restaurant_id"),
                    "order_number": o.get("order_number"),
                    "is_transfer": is_transfer,
                },
                room=room,
            )
        except Exception:  # noqa: BLE001
            pass
    return _ensure_order_number(o)'''

BACKEND_NEW = '''    for room in (f"restaurant:{o.get('restaurant_id')}", "admin", f"order:{oid}"):
        try:
            await sio.emit(
                "rider_assigned",
                {
                    "order_id": oid,
                    "rider_id": user["id"],
                    "rider_name": user.get("name"),
                    "restaurant_id": o.get("restaurant_id"),
                    "order_number": o.get("order_number"),
                    "is_transfer": is_transfer,
                },
                room=room,
            )
        except Exception:  # noqa: BLE001
            pass
    return _ensure_order_number(o)'''


# ---------------------------------------------------------------------------
# 2a. frontend — add the socket import
# ---------------------------------------------------------------------------

IMPORT_OLD = '''import { CancelOrderModal } from "@/src/components/CancelOrderModal";
type Order = any;'''

IMPORT_NEW = '''import { CancelOrderModal } from "@/src/components/CancelOrderModal";
import { getSocket, joinRoom, leaveRoom } from "@/src/socket";
type Order = any;'''


# ---------------------------------------------------------------------------
# 2b. frontend — join the order room, listen for live events
#     (anchor = the safety-net poll block from patch_live_tracking.py)
# ---------------------------------------------------------------------------

EFFECT_OLD = '''  // Safety-net poll of the REAL order. Live movement now comes from the
  // backend's real status changes (restaurant ready, rider accept/pickup/
  // deliver) — no more fake auto-advance. Socket-pushed instant updates
  // (rider_location / rider_assigned) land in a follow-up patch.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const o = await Api.order(String(id));
        if (!cancelled) setOrder(o);
      } catch {}
    };
    tick();
    const t = setInterval(tick, 5000);
    pollTimer.current = t;
    return () => { cancelled = true; clearInterval(t); };
  }, [id]);'''

EFFECT_NEW = '''  // Safety-net poll of the REAL order (catches anything the socket misses,
  // e.g. restaurant marking ready, rider picking up / delivering).
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const o = await Api.order(String(id));
        if (!cancelled) setOrder(o);
      } catch {}
    };
    tick();
    const t = setInterval(tick, 5000);
    pollTimer.current = t;
    return () => { cancelled = true; clearInterval(t); };
  }, [id]);

  // Live push: join this order's room so the rider marker moves the instant
  // a new GPS point arrives, and we hear about a rider being assigned right
  // away instead of waiting on the poll tick.
  useEffect(() => {
    if (!id) return;
    const s = getSocket();
    if (!s) return;
    const room = `order:${id}`;
    joinRoom(room);
    const onRiderLocation = (payload: any) => {
      if (!payload || String(payload.order_id) !== String(id)) return;
      setOrder((prev: any) => (prev ? { ...prev, rider_lat: payload.lat, rider_lng: payload.lng } : prev));
    };
    const onRiderAssigned = (payload: any) => {
      if (!payload || String(payload.order_id) !== String(id)) return;
      Api.order(String(id)).then((o: any) => setOrder(o)).catch(() => {});
    };
    s.on("rider_location", onRiderLocation);
    s.on("rider_assigned", onRiderAssigned);
    return () => {
      s.off("rider_location", onRiderLocation);
      s.off("rider_assigned", onRiderAssigned);
      leaveRoom(room);
    };
  }, [id]);'''


def main() -> int:
    ok1 = apply_patch(BACKEND_FILE, BACKEND_OLD, BACKEND_NEW, "backend: emit rider_assigned to order room")
    ok2 = apply_patch(TRACKING_FILE, IMPORT_OLD, IMPORT_NEW, "frontend: add socket import")
    ok3 = apply_patch(TRACKING_FILE, EFFECT_OLD, EFFECT_NEW, "frontend: join order room + live listeners")

    print()
    if ok1 and ok2 and ok3:
        print("Patch applied (or already present). Redeploy backend + frontend and test.")
        return 0
    print("One or more steps did NOT apply — see [FAIL]/[SKIP] above. Nothing partial was written.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
