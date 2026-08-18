#!/usr/bin/env python3
"""
patch_razorpay_module_name_fix.py

frontend/src/utils/razorpay.native.ts

CONFIRMED root cause (verified by reading react-native-razorpay's own
RazorpayCheckout.js): the installed library registers/looks up its native
module as NativeModules.RNRazorpayCheckout (old architecture path, which is
what this app uses since newArchEnabled is false) — NOT
NativeModules.RazorpayCheckout.

razorpay.native.ts's razorpayLinked() check was looking for the wrong key
(NativeModules.RazorpayCheckout), so it always returned false regardless of
whether the native module was properly linked and built — which is exactly
why the "works only in the installed app" error kept showing even in a
correctly built, freshly-submitted TestFlight build. The earlier
EMBEDDED_CONTENT_CONTAINS_SWIFT fix was harmless but was never the actual
problem.

Usage:
    cd ~/original_version
    python3 patch_razorpay_module_name_fix.py

This is a pure JS change — no native rebuild needed in principle, but since
Razorpay checkout only exists in native builds anyway (not Expo Go), you'll
still need to get this into your next TestFlight build to test it (a
JS-only / OTA update would also work if EAS Update is configured).
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TARGET = ROOT / "frontend" / "src" / "utils" / "razorpay.native.ts"


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


OLD = '''/** True only when the react-native-razorpay native module is actually linked. */
function razorpayLinked(): boolean {
  try {
    return !!NativeModules.RazorpayCheckout;
  } catch {
    return false;
  }
}'''

NEW = '''/** True only when the react-native-razorpay native module is actually linked.
 * The library itself looks up NativeModules.RNRazorpayCheckout (see its own
 * RazorpayCheckout.js) — NOT NativeModules.RazorpayCheckout — so we check the
 * same key it actually uses. */
function razorpayLinked(): boolean {
  try {
    return !!NativeModules.RNRazorpayCheckout;
  } catch {
    return false;
  }
}'''


def main() -> int:
    ok = apply_patch(TARGET, OLD, NEW, "check the correct native module key")
    print()
    if ok:
        print("Patch applied (or already present). Rebuild + resubmit to TestFlight,")
        print("install the update, and retest Razorpay checkout.")
        return 0
    print("Patch did NOT apply — see [FAIL]/[SKIP] above.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
