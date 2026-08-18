#!/usr/bin/env python3
"""
patch_auto_share.py

frontend/app/rider/index.tsx
  - Imports useRiderLocationShare (was never imported here).
  - Calls the hook at component top-level.
  - accept(oid): right after Api.assignRider(oid) succeeds, calls
    startShare(oid) so GPS sharing begins immediately — the rider no longer
    has to separately find and tap "Share live location" on the orders tab.

Usage:
    cd ~/original_version
    python3 patch_auto_share.py

Safe to re-run: skips if already applied. Writes a .bak before changing.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TARGET = ROOT / "frontend" / "app" / "rider" / "index.tsx"


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
# 1. add the import
# ---------------------------------------------------------------------------

IMPORT_OLD = '''import { getSocket, joinRoom, leaveRoom } from "@/src/socket";
import { playPickup, primeAudio } from "@/src/utils/ring";'''

IMPORT_NEW = '''import { getSocket, joinRoom, leaveRoom } from "@/src/socket";
import { playPickup, primeAudio } from "@/src/utils/ring";
import { useRiderLocationShare } from "@/src/utils/useRiderLocationShare";'''


# ---------------------------------------------------------------------------
# 2. call the hook at component top-level
# ---------------------------------------------------------------------------

HOOK_OLD = '''export default function RiderHome() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [feed, setFeed] = useState<any[]>([]);'''

HOOK_NEW = '''export default function RiderHome() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const { start: startShare } = useRiderLocationShare();
  const [feed, setFeed] = useState<any[]>([]);'''


# ---------------------------------------------------------------------------
# 3. start sharing right after a successful accept
# ---------------------------------------------------------------------------

ACCEPT_OLD = '''  const accept = async (oid: string) => {
    setAccepting(oid);
    try {
      await Api.assignRider(oid);
      notify("Accepted", "Order assigned. Find it under My Deliveries.");
      load();
      setTimeout(() => router.push("/rider/orders" as any), 250);
    } catch (e: any) {
      notify("Cannot accept", e.message);
    } finally {
      setAccepting(null);
    }
  };'''

ACCEPT_NEW = '''  const accept = async (oid: string) => {
    setAccepting(oid);
    try {
      await Api.assignRider(oid);
      // Start pushing this rider's live GPS the moment they take the order —
      // no separate manual "share location" step needed.
      try { startShare(oid); } catch { /* ignore — user can still share manually */ }
      notify("Accepted", "Order assigned. Find it under My Deliveries.");
      load();
      setTimeout(() => router.push("/rider/orders" as any), 250);
    } catch (e: any) {
      notify("Cannot accept", e.message);
    } finally {
      setAccepting(null);
    }
  };'''


def main() -> int:
    ok1 = apply_patch(TARGET, IMPORT_OLD, IMPORT_NEW, "add useRiderLocationShare import")
    ok2 = apply_patch(TARGET, HOOK_OLD, HOOK_NEW, "call hook at component top-level")
    ok3 = apply_patch(TARGET, ACCEPT_OLD, ACCEPT_NEW, "auto-start sharing on accept")

    print()
    if ok1 and ok2 and ok3:
        print("Patch applied (or already present). Rebuild/redeploy frontend and test.")
        return 0
    print("One or more steps did NOT apply — see [FAIL]/[SKIP] above. Nothing partial was written.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
