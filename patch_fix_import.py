#!/usr/bin/env python3
"""
patch_fix_import.py

The previous patch (patch_live_socket.py) added code that uses getSocket /
joinRoom / leaveRoom in app/order/[id].tsx but its import-insertion step
failed to match (likely a whitespace/line-ending difference), so that
import is currently MISSING — the file will not compile as-is until this
runs.

This version matches on a single line only (the CancelOrderModal import)
instead of a two-line block, which is more resilient to that kind of
mismatch.

Usage:
    cd ~/original_version
    python3 patch_fix_import.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TARGET = ROOT / "frontend" / "app" / "order" / "[id].tsx"

NEEDLE = 'import { CancelOrderModal } from "@/src/components/CancelOrderModal";'
NEW_IMPORT = 'import { getSocket, joinRoom, leaveRoom } from "@/src/socket";'


def main() -> int:
    if not TARGET.exists():
        print(f"[FAIL] file not found: {TARGET}")
        return 1

    text = TARGET.read_text(encoding="utf-8")

    if "@/src/socket" in text and NEW_IMPORT.split(" from ")[0] in text and "getSocket" in text.split("\n")[0:30].__str__():
        pass  # fall through to more precise check below

    # Already has the import line itself?
    if NEW_IMPORT in text:
        print("[OK] import already present, nothing to do.")
        return 0

    lines = text.splitlines(keepends=True)
    idx = None
    for i, line in enumerate(lines):
        if line.strip() == NEEDLE:
            idx = i
            break

    if idx is None:
        print("[FAIL] could not find the CancelOrderModal import line at all.")
        print("       Paste `grep -n \"CancelOrderModal\" \"frontend/app/order/[id].tsx\"` output.")
        return 1

    # Preserve whatever line ending style this file actually uses.
    line_ending = "\r\n" if lines[idx].endswith("\r\n") else "\n"
    lines.insert(idx + 1, NEW_IMPORT + line_ending)

    backup = TARGET.with_suffix(TARGET.suffix + ".bak2")
    if not backup.exists():
        backup.write_text(text, encoding="utf-8")
        print(f"       backup written: {backup}")

    TARGET.write_text("".join(lines), encoding="utf-8")
    print(f"[DONE] inserted missing import after line {idx + 1} in {TARGET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
