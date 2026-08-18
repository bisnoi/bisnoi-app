#!/usr/bin/env python3
"""
patch_test_rider.py

backend/server.py

1. Adds phone "7777777777" -> fixed OTP "123456" to TEST_ACCOUNTS. Logging in
   with this number never sends a real SMS and never requires the Message
   Central provider — same as the existing 8929926078 / 9000000001 test
   accounts.

2. In verify_otp(), right before token issuance: if the phone is
   7777777777, force-set role="rider", rider_verified=True, is_online=True
   on every single login. This makes it self-healing — even if that phone
   was previously created as a plain "customer" (e.g. from an earlier test)
   or its rider application was never approved, logging in again always
   yields a fully working, dispatch-eligible rider account.

Usage:
    cd ~/original_version
    python3 patch_test_rider.py

After patching + redeploying the backend:
    Login with phone 7777777777, OTP 123456 -> lands as a verified rider.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TARGET = ROOT / "backend" / "server.py"


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
        print("       No changes made to this file for this step.")
        return False
    if count > 1:
        print(f"[FAIL] {label}: found {count} matches, expected exactly 1 — refusing to guess.")
        print("       No changes made to this file for this step.")
        return False

    backup = path.with_suffix(path.suffix + ".bak")
    if not backup.exists():
        backup.write_text(text, encoding="utf-8")
        print(f"       backup written: {backup}")

    path.write_text(text.replace(old, new), encoding="utf-8")
    print(f"[DONE] {label}: patched {path}")
    return True


# ---------------------------------------------------------------------------
# 1. add the fixed-OTP test rider number
# ---------------------------------------------------------------------------

ACCOUNTS_OLD = '''TEST_ACCOUNTS = {
    "8929926078": "989898",
    "9000000001": "989898",
}'''

ACCOUNTS_NEW = '''TEST_ACCOUNTS = {
    "8929926078": "989898",
    "9000000001": "989898",
    "7777777777": "123456",  # fixed test rider — see self-heal block in verify_otp
}'''


# ---------------------------------------------------------------------------
# 2. self-heal this number to a verified, online rider on every login
# ---------------------------------------------------------------------------

VERIFY_OLD = '''    await db.otps.delete_one({"phone": body.phone})
    token = make_token(user["id"], user["role"])
    return AuthResponse(token=token, user=User(**user))'''

VERIFY_NEW = '''    # Fixed test rider (phone 7777777777, OTP 123456 — see TEST_ACCOUNTS) is
    # force-set to an approved, verified, online rider on every login, so it
    # keeps working for testing even if it was previously created as a plain
    # customer or its rider application was never approved.
    if body.phone == "7777777777":
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"role": "rider", "rider_verified": True, "is_online": True}},
        )
        user = await db.users.find_one({"id": user["id"]}, {"_id": 0})

    await db.otps.delete_one({"phone": body.phone})
    token = make_token(user["id"], user["role"])
    return AuthResponse(token=token, user=User(**user))'''


def main() -> int:
    ok1 = apply_patch(TARGET, ACCOUNTS_OLD, ACCOUNTS_NEW, "add 7777777777 fixed OTP")
    ok2 = apply_patch(TARGET, VERIFY_OLD, VERIFY_NEW, "self-heal test rider on login")

    print()
    if ok1 and ok2:
        print("Patch applied (or already present). Redeploy backend, then log in with:")
        print("  phone: 7777777777")
        print("  OTP:   123456")
        print("This always lands as a verified, online, dispatch-eligible rider.")
        return 0
    print("One or more steps did NOT apply — see [FAIL]/[SKIP] above.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
