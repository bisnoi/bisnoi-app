#!/usr/bin/env python3
"""
patch_live_tracking.py

Two fixes, run from ~/original_version:

  1. backend/server.py
     PATCH /orders/{oid}/rider-location now emits a `rider_location` socket
     event to room `order:{oid}` right after saving the rider's GPS point,
     so anyone watching that order (customer tracking screen, owner
     dashboard) gets it pushed live instead of waiting on their next poll.

  2. frontend/app/order/[id].tsx
     Removes the fake "Auto progression" block that called
     Api.simulateProgress() every 3s and silently advanced the order status
     + rider position on its own. Replaced with a plain safety-net poll of
     the REAL order (Api.order). Status now only moves when something real
     happens on the backend (restaurant marks ready, rider accepts/picks up/
     delivers, etc).

This does NOT yet:
  - join the `order:{oid}` socket room on the tracking screen and listen for
    the new `rider_location` event (needs the file's current import block —
    next patch)
  - auto-start rider location sharing the moment a rider accepts a pickup
    (needs the accept-handler code in app/rider/orders.tsx — next patch)
  - fix the restaurant map on the customer side (image 1 — separate file,
    not yet identified)

Usage:
    cd ~/original_version
    python3 patch_live_tracking.py

Safe to re-run: each patch checks whether it was already applied and skips
if so. A .bak copy of each touched file is written next to the original
before any change.
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
        print("       The file has probably changed since this script was written.")
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
# Patch 1 — backend: push live rider location over socket.io
# ---------------------------------------------------------------------------

BACKEND_OLD = '''@api.patch("/orders/{oid}/rider-location")
async def rider_loc(oid: str, body: RiderLocation, user: dict = Depends(require_role("rider"))):
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"id": oid},
        {
            "$set": {
                "rider_lat": body.lat,
                "rider_lng": body.lng,
                "rider_location_updated_at": now_iso,
            }
        },
    )
    return {"ok": True, "updated_at": now_iso}'''

BACKEND_NEW = '''@api.patch("/orders/{oid}/rider-location")
async def rider_loc(oid: str, body: RiderLocation, user: dict = Depends(require_role("rider"))):
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"id": oid},
        {
            "$set": {
                "rider_lat": body.lat,
                "rider_lng": body.lng,
                "rider_location_updated_at": now_iso,
            }
        },
    )
    # Push the live position straight to anyone watching this order (customer
    # tracking screen, owner dashboard) so the map moves without waiting on
    # the client's next poll cycle.
    try:
        await sio.emit(
            "rider_location",
            {
                "order_id": oid,
                "rider_id": user["id"],
                "lat": body.lat,
                "lng": body.lng,
                "updated_at": now_iso,
            },
            room=f"order:{oid}",
        )
    except Exception as e:  # noqa: BLE001
        log.warning("socket rider_location emit failed: %s", e)
    return {"ok": True, "updated_at": now_iso}'''


# ---------------------------------------------------------------------------
# Patch 2 — frontend: kill the fake auto-progression polling
# ---------------------------------------------------------------------------

TRACKING_OLD = '''  // Auto progression: drives status forward and steps rider toward customer.
  // Runs every 3s for snappy demo feel; stops when terminal.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res: any = await Api.simulateProgress(String(id));
        if (!cancelled && res?.order) setOrder(res.order);
      } catch {
        // Fall back to plain reload if the simulate endpoint fails
        try {
          const o = await Api.order(String(id));
          if (!cancelled) setOrder(o);
        } catch {}
      }
    };
    // Kick once immediately, then poll
    tick();
    const t = setInterval(tick, 3000);
    pollTimer.current = t;
    return () => { cancelled = true; clearInterval(t); };
  }, [id]);'''

TRACKING_NEW = '''  // Safety-net poll of the REAL order. Live movement now comes from the
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


def main() -> int:
    ok1 = apply_patch(BACKEND_FILE, BACKEND_OLD, BACKEND_NEW, "backend rider-location socket emit")
    ok2 = apply_patch(TRACKING_FILE, TRACKING_OLD, TRACKING_NEW, "frontend remove fake auto-progression")

    print()
    if ok1 and ok2:
        print("Both patches applied (or already present). Next: redeploy backend + frontend and test.")
        return 0
    print("One or more patches did NOT apply — see [FAIL]/[SKIP] lines above. Nothing partial was written.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
