#!/usr/bin/env python3
"""
patch_test_rider_otp_fix.py

backend/server.py

Changes the 7777777777 test rider's fixed OTP from 123456 to 989898, so it
matches the pattern of the other test accounts. Safe to run whether or not
patch_test_rider.py already ran — it only touches the OTP value.

Usage:
    cd ~/original_version
    python3 patch_test_rider_otp_fix.py
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


OLD = '''    "7777777777": "123456",  # fixed test rider — see self-heal block in verify_otp'''
NEW = '''    "7777777777": "989898",  # fixed test rider — see self-heal block in verify_otp'''


def main() -> int:
    ok = apply_patch(TARGET, OLD, NEW, "change test rider OTP to 989898")
    print()
    if ok:
        print("Patch applied (or already present). Redeploy backend, then log in with:")
        print("  phone: 7777777777")
        print("  OTP:   989898")
        return 0
    print("Patch did NOT apply. If patch_test_rider.py hasn't been run yet, run that")
    print("first, or paste `grep -n 7777777777 backend/server.py` output.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
