#!/usr/bin/env python3
import shutil, sys

PATH = "backend/backend/server.py"

OLD = '''    by_table = {s["table_id"]: s for s in sessions}
    out = []
    for t in tables:
        s = by_table.get(t["id"])
        out.append({
            "id": t["id"],
            "label": t["label"],
            "sort_order": t.get("sort_order", 0),
            "status": "occupied" if s else "free",
            "session": _session_summary(s) if s else None,
        })
    return out'''

NEW = '''    by_table = {s["table_id"]: s for s in sessions}
    out = []
    for t in tables:
        s = by_table.get(t["id"])
        out.append({
            "id": t["id"],
            "label": t["label"],
            "sort_order": t.get("sort_order", 0),
            "status": "occupied" if s else "free",
            "session": _session_summary(s) if s else None,
            "restaurant_id": rest["id"],
            "qr_token": t.get("qr_token"),
        })
    return out'''

with open(PATH) as f:
    src = f.read()
n = src.count(OLD)
if n != 1:
    print(f"[ABORT] expected 1 match, found {n}")
    sys.exit(1)
shutil.copy(PATH, PATH + ".bak2")
src = src.replace(OLD, NEW, 1)
with open(PATH, "w") as f:
    f.write(src)
print(f"[OK] Patched {PATH}. Backup at {PATH}.bak2")
