#!/usr/bin/env python3
"""
Patches:
  backend/backend/server.py
  backend/backend/platform_ext.py

Adds:
  1. qr_token on dine_tables (generate on create / set-count)
  2. Signed dine-in session JWT (make_dinein_token / decode_dinein_token) reusing JWT_SECRET/JWT_ALGO
  3. /dinein/context now verifies the QR token and issues the dine-in session JWT
  4. /dinein/order now trusts ONLY the X-Dinein-Token header (no more raw table_number fraud path)
  5. GET /restaurants/nearby (haversine_km based GPS match)

Run from ~/original_version. Makes .bak copies before touching anything.
"""
import shutil
import sys

SERVER = "backend/backend/server.py"
PLATFORM = "backend/backend/platform_ext.py"


def patch(path, replacements):
    shutil.copy(path, path + ".bak")
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    for label, old, new in replacements:
        count = src.count(old)
        if count != 1:
            print(f"[ABORT] '{label}' expected 1 match in {path}, found {count}. "
                  f"No changes written. Restore not needed (nothing changed yet).")
            sys.exit(1)
        src = src.replace(old, new, 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
    print(f"[OK] Patched {path} ({len(replacements)} edits). Backup at {path}.bak")


# ---------------------------------------------------------------- server.py
server_edits = [
(
"dinein token helpers",
'''def make_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRES_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)
''',
'''def make_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRES_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


DINEIN_JWT_EXPIRES_MIN = 240  # 4 hours — must re-scan QR after this


def make_dinein_token(restaurant_id: str, table_id: str) -> str:
    payload = {
        "typ": "dinein",
        "rid": restaurant_id,
        "tid": table_id,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=DINEIN_JWT_EXPIRES_MIN),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_dinein_token(token: str) -> dict:
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        raise HTTPException(401, "Dine-in session expired or invalid — please scan the table QR again")
    if data.get("typ") != "dinein":
        raise HTTPException(401, "Invalid dine-in session")
    return data
''',
),
(
"owner_create_table qr_token",
'''    t = {
        "id": str(uuid.uuid4()),
        "restaurant_id": rest["id"],
        "label": label,
        "sort_order": count + 1,
        "created_at": _now_iso(),
    }
    await db.dine_tables.insert_one(dict(t))
    return await _tables_payload(rest)


@api.post("/owner/tables/set-count")''',
'''    t = {
        "id": str(uuid.uuid4()),
        "restaurant_id": rest["id"],
        "label": label,
        "sort_order": count + 1,
        "created_at": _now_iso(),
        "qr_token": secrets.token_urlsafe(16),
    }
    await db.dine_tables.insert_one(dict(t))
    return await _tables_payload(rest)


@api.post("/owner/tables/set-count")''',
),
(
"owner_set_table_count qr_token",
'''    if count > cur:
        for i in range(cur, count):
            t = {
                "id": str(uuid.uuid4()),
                "restaurant_id": rest["id"],
                "label": f"Table {i + 1}",
                "sort_order": i + 1,
                "created_at": _now_iso(),
            }
            await db.dine_tables.insert_one(dict(t))''',
'''    if count > cur:
        for i in range(cur, count):
            t = {
                "id": str(uuid.uuid4()),
                "restaurant_id": rest["id"],
                "label": f"Table {i + 1}",
                "sort_order": i + 1,
                "created_at": _now_iso(),
                "qr_token": secrets.token_urlsafe(16),
            }
            await db.dine_tables.insert_one(dict(t))''',
),
(
"restaurants/nearby endpoint",
'''class TableCreate(BaseModel):
    label: Optional[str] = None
    restaurant_id: Optional[str] = None''',
'''@api.get("/restaurants/nearby")
async def restaurants_nearby(lat: float, lng: float, radius_km: float = 0.15):
    """GPS auto-match: which restaurant is the customer physically sitting at."""
    rests = await db.restaurants.find(
        {"is_active": True, "status": "active"},
        {"_id": 0, "id": 1, "name": 1, "image": 1, "lat": 1, "lng": 1,
         "cuisines": 1, "address": 1, "is_open": 1},
    ).to_list(5000)
    matches = []
    for r in rests:
        rlat, rlng = r.get("lat"), r.get("lng")
        if rlat is None or rlng is None:
            continue
        d = haversine_km(float(lat), float(lng), float(rlat), float(rlng))
        if d <= radius_km:
            r["distance_km"] = round(d, 3)
            matches.append(r)
    matches.sort(key=lambda x: x["distance_km"])
    return matches


class TableCreate(BaseModel):
    label: Optional[str] = None
    restaurant_id: Optional[str] = None''',
),
(
"wire dinein token helpers into platform router",
'''api.include_router(make_platform_router(db, get_current_user, require_role, {
    "enrich_items": _enrich_items,
    "create_notification": _create_notification,
    "now_iso": _now_iso,
    "next_seq": _next_seq,
}))''',
'''api.include_router(make_platform_router(db, get_current_user, require_role, {
    "enrich_items": _enrich_items,
    "create_notification": _create_notification,
    "now_iso": _now_iso,
    "next_seq": _next_seq,
    "make_dinein_token": make_dinein_token,
    "decode_dinein_token": decode_dinein_token,
}))''',
),
]

# ------------------------------------------------------------ platform_ext.py
platform_edits = [
(
"Header import",
'''class DineinItemIn(BaseModel):
    menu_item_id: str
    quantity: int''',
'''from fastapi import Header


class DineinItemIn(BaseModel):
    menu_item_id: str
    quantity: int''',
),
(
"extract srv helpers",
'''    enrich_items = srv["enrich_items"]
    create_notification = srv["create_notification"]
    now_iso = srv["now_iso"]
    next_seq = srv["next_seq"]''',
'''    enrich_items = srv["enrich_items"]
    create_notification = srv["create_notification"]
    now_iso = srv["now_iso"]
    next_seq = srv["next_seq"]
    make_dinein_token = srv["make_dinein_token"]
    decode_dinein_token = srv["decode_dinein_token"]''',
),
(
"dinein_context verifies QR token + issues session JWT",
'''    @router.get("/dinein/context")
    async def dinein_context(restaurant_id: str, table_id: str):
        rest = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
        if not rest:
            raise HTTPException(404, "Restaurant not found")
        t = await db.dine_tables.find_one({"id": table_id, "restaurant_id": restaurant_id}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Table not found for this restaurant")
        return {
            "restaurant": {
                "id": rest["id"], "name": rest.get("name"), "image": rest.get("image"),
                "cuisines": rest.get("cuisines", []), "is_active": rest.get("is_active", True),
                "address": rest.get("address"),
            },
            "table": {"id": t["id"], "label": t["label"]},
        }''',
'''    @router.get("/dinein/context")
    async def dinein_context(restaurant_id: str, table_id: str, token: str):
        rest = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
        if not rest:
            raise HTTPException(404, "Restaurant not found")
        t = await db.dine_tables.find_one({"id": table_id, "restaurant_id": restaurant_id}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Table not found for this restaurant")
        if not t.get("qr_token") or token != t["qr_token"]:
            raise HTTPException(403, "Invalid table QR — please rescan the code on your table")
        dinein_token = make_dinein_token(restaurant_id, table_id)
        return {
            "restaurant": {
                "id": rest["id"], "name": rest.get("name"), "image": rest.get("image"),
                "cuisines": rest.get("cuisines", []), "is_active": rest.get("is_active", True),
                "address": rest.get("address"),
            },
            "table": {"id": t["id"], "label": t["label"]},
            "dinein_token": dinein_token,
        }''',
),
(
"remove insecure _resolve_table (raw table_number/auto-create fraud path)",
'''    async def _resolve_table(rest_id: str, body: "DineinOrderReq") -> dict:
        """Resolve (or auto-create) the dine_table for a customer dine-in order.
        Priority: explicit table_id (QR) > table_number > table_label."""
        # 1) Legacy QR path: explicit table_id
        if body.table_id:
            t = await db.dine_tables.find_one(
                {"id": body.table_id, "restaurant_id": rest_id}, {"_id": 0}
            )
            if not t:
                raise HTTPException(404, "Table not found for this restaurant")
            return t
        # 2) Customer-entered number/label
        num = body.table_number
        label = (body.table_label or "").strip()
        if num is None and not label:
            raise HTTPException(400, "Please enter your table number")
        if num is not None and (num < 1 or num > 500):
            raise HTTPException(400, "Enter a valid table number")
        want_label = label or f"Table {num}"
        # match existing table by label (case-insensitive) or by sort_order == num
        query: Dict[str, Any] = {"restaurant_id": rest_id}
        if num is not None:
            existing = await db.dine_tables.find_one(
                {"restaurant_id": rest_id,
                 "$or": [{"sort_order": num}, {"label": want_label}]},
                {"_id": 0},
            )
        else:
            existing = await db.dine_tables.find_one(
                {"restaurant_id": rest_id,
                 "label": {"$regex": f"^{re.escape(want_label)}$", "$options": "i"}},
                {"_id": 0},
            )
        if existing:
            return existing
        # auto-create so the owner sees the order at that table
        count = await db.dine_tables.count_documents({"restaurant_id": rest_id})
        t = {
            "id": str(uuid.uuid4()),
            "restaurant_id": rest_id,
            "label": want_label,
            "sort_order": num if num is not None else count + 1,
            "created_at": now_iso(),
            "auto_created": True,
        }
        await db.dine_tables.insert_one(dict(t))
        t.pop("_id", None)
        return t''',
'''    # NOTE: raw table_number / auto-create fallback removed on purpose.
    # Customer dine-in orders are now resolved ONLY from a verified
    # X-Dinein-Token (issued by /dinein/context after QR-token check).''',
),
(
"create_dinein_order trusts only the verified dine-in session token",
'''    @router.post("/dinein/order")
    async def create_dinein_order(body: DineinOrderReq, user: dict = Depends(get_current_user)):
        rest = await db.restaurants.find_one({"id": body.restaurant_id}, {"_id": 0})
        if not rest:
            raise HTTPException(404, "Restaurant not found")
        if rest.get("pos_enabled", True) is False:
            raise HTTPException(403, "Dine-in is currently unavailable at this restaurant.")
        t = await _resolve_table(body.restaurant_id, body)
        if not body.items:
            raise HTTPException(400, "Add at least one item")''',
'''    @router.post("/dinein/order")
    async def create_dinein_order(
        body: DineinOrderReq,
        user: dict = Depends(get_current_user),
        x_dinein_token: str = Header(..., alias="X-Dinein-Token"),
    ):
        tok = decode_dinein_token(x_dinein_token)
        if tok["rid"] != body.restaurant_id:
            raise HTTPException(401, "Dine-in session does not match this restaurant — please rescan the table QR")
        rest = await db.restaurants.find_one({"id": tok["rid"]}, {"_id": 0})
        if not rest:
            raise HTTPException(404, "Restaurant not found")
        if rest.get("pos_enabled", True) is False:
            raise HTTPException(403, "Dine-in is currently unavailable at this restaurant.")
        t = await db.dine_tables.find_one({"id": tok["tid"], "restaurant_id": tok["rid"]}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Table not found — please rescan the table QR")
        if not body.items:
            raise HTTPException(400, "Add at least one item")''',
),
]

patch(SERVER, server_edits)
patch(PLATFORM, platform_edits)
print("\nAll patches applied. Next: run the qr_token backfill for existing tables (separate step), then restart the backend.")
