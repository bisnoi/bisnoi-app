path = "server.py"
with open(path) as f:
    c = f.read()

# --- 1. Replace MENU_EXTRACT_PROMPT ---
old_prompt = '''MENU_EXTRACT_PROMPT = (
    "You are a menu digitization assistant for a food delivery app. "
    "Carefully read the ENTIRE attached menu (it may be a photo or a multi-page PDF) and extract every dish. "
    "Return ONLY valid minified JSON (no markdown fences, no commentary) using EXACTLY this schema:\\n"
    '{"categories":[{"name":"string","items":[{"name":"string","price":number,"description":"string","veg":true}]}]}\\n'
    "Rules:\\n"
    "- price: integer in rupees only (strip any currency symbol/decimals; if a range, use the lowest).\\n"
    "- veg: true for vegetarian, false for non-vegetarian. Use common cues (green dot/[V]=veg, red dot/[N]/chicken/mutton/fish/egg/prawn=non-veg). Default true if unclear.\\n"
    "- description: short item description if visible, else an empty string.\\n"
    "- Group items under their printed category/section headings. If no category is printed, use \\"Menu\\".\\n"
    "- Include EVERY item from ALL pages. Do not invent items that are not on the menu.\\n"
    "- If the file has no readable menu, return {\\"categories\\":[]}."
)'''

new_prompt = '''MENU_EXTRACT_PROMPT = (
    "You are a menu digitization assistant for a food delivery app. "
    "Carefully read the ENTIRE attached menu (it may be a photo or a multi-page PDF) and extract every dish, "
    "including any printed sub-sections under a category (e.g. a 'Pizza' category with 'Single Topping' / "
    "'Double Topping' sub-groups) and any size/portion variations with their own prices "
    "(e.g. Small/Medium/Large, Half/Full). "
    "Return ONLY valid minified JSON (no markdown fences, no commentary) using EXACTLY this schema:\\n"
    '{"categories":[{"name":"string","items":[ITEM],"subcategories":[{"name":"string","items":[ITEM]}]}]}\\n'
    'where ITEM is {"name":"string","price":number,"description":"string","veg":true,"variations":[{"name":"string","price":number}]}\\n'
    "Rules:\\n"
    "- If a dish has multiple sizes with different prices, set the item's own \\"price\\" to the lowest variation "
    "price and list ALL sizes in \\"variations\\" (e.g. [{\\"name\\":\\"Small\\",\\"price\\":150},{\\"name\\":\\"Medium\\",\\"price\\":220}]). "
    "If there is only one price, leave \\"variations\\" as an empty list.\\n"
    "- price: integer in rupees only (strip any currency symbol/decimals; if a range, use the lowest).\\n"
    "- veg: true for vegetarian, false for non-vegetarian. Use common cues (green dot/[V]=veg, red dot/[N]/chicken/mutton/fish/egg/prawn=non-veg). Default true if unclear.\\n"
    "- description: short item description if visible, else an empty string.\\n"
    "- Group items under their printed category/section headings. If a category has printed sub-headings "
    "(like 'Single Topping' / 'Double Topping' under 'Pizza'), put those items under \\"subcategories\\" with the "
    "sub-heading as its name; put items with no sub-heading directly in the category's own \\"items\\". "
    "If no category is printed, use \\"Menu\\".\\n"
    "- Include EVERY item from ALL pages. Do not invent items that are not on the menu.\\n"
    "- If the file has no readable menu, return {\\"categories\\":[]}."
)'''

assert old_prompt in c, "PROMPT ANCHOR NOT FOUND"
c = c.replace(old_prompt, new_prompt, 1)

# --- 2. Replace _sanitize_extracted with expanded version (+ 2 helper funcs before it) ---
old_sanitize = '''def _sanitize_extracted(data: dict) -> List[dict]:
    """Normalize the model output into clean categories[] with items[]."""
    out: List[dict] = []
    seen_cat = {}
    for cat in (data.get("categories") or []):
        cname = str(cat.get("name") or "Menu").strip() or "Menu"
        key = cname.lower()
        if key in seen_cat:
            bucket = seen_cat[key]
        else:
            bucket = {"name": cname, "items": []}
            seen_cat[key] = bucket
            out.append(bucket)
        for it in (cat.get("items") or []):
            name = str(it.get("name") or "").strip()
            if not name:
                continue
            # coerce price -> int
            raw_price = it.get("price", 0)
            try:
                if isinstance(raw_price, str):
                    digits = re.sub(r"[^0-9.]", "", raw_price)
                    price = int(float(digits)) if digits else 0
                else:
                    price = int(round(float(raw_price)))
            except Exception:
                price = 0
            veg = it.get("veg")
            veg = True if veg is None else bool(veg)
            bucket["items"].append({
                "name": name[:120],
                "price": max(0, price),
                "description": str(it.get("description") or "").strip()[:300],
                "veg": veg,
            })
    # drop empty categories
    return [c for c in out if c["items"]]'''

new_sanitize = '''def _coerce_price(raw) -> int:
    try:
        if isinstance(raw, str):
            digits = re.sub(r"[^0-9.]", "", raw)
            return max(0, int(float(digits)) if digits else 0)
        return max(0, int(round(float(raw))))
    except Exception:
        return 0


def _sanitize_item(it: dict) -> Optional[dict]:
    name = str(it.get("name") or "").strip()
    if not name:
        return None
    veg = it.get("veg")
    veg = True if veg is None else bool(veg)
    variations = []
    for v in (it.get("variations") or []):
        vname = str(v.get("name") or "").strip()
        if not vname:
            continue
        variations.append({"name": vname[:60], "price": _coerce_price(v.get("price", 0))})
    price = _coerce_price(it.get("price", 0))
    if not price and variations:
        price = min(v["price"] for v in variations)
    return {
        "name": name[:120],
        "price": price,
        "description": str(it.get("description") or "").strip()[:300],
        "veg": veg,
        "variations": variations,
    }


def _sanitize_extracted(data: dict) -> List[dict]:
    """Normalize the model output into clean categories[] with items[] and subcategories[]."""
    out: List[dict] = []
    seen_cat = {}
    for cat in (data.get("categories") or []):
        cname = str(cat.get("name") or "Menu").strip() or "Menu"
        key = cname.lower()
        if key in seen_cat:
            bucket = seen_cat[key]
        else:
            bucket = {"name": cname, "items": [], "subcategories": []}
            seen_cat[key] = bucket
            out.append(bucket)
        for it in (cat.get("items") or []):
            sanitized = _sanitize_item(it)
            if sanitized:
                bucket["items"].append(sanitized)
        seen_sub = {str(s.get("name") or "").strip().lower(): s for s in bucket["subcategories"]}
        for sub in (cat.get("subcategories") or []):
            sname = str(sub.get("name") or "").strip()
            if not sname:
                continue
            skey = sname.lower()
            if skey in seen_sub:
                sub_bucket = seen_sub[skey]
            else:
                sub_bucket = {"name": sname, "items": []}
                seen_sub[skey] = sub_bucket
                bucket["subcategories"].append(sub_bucket)
            for it in (sub.get("items") or []):
                sanitized = _sanitize_item(it)
                if sanitized:
                    sub_bucket["items"].append(sanitized)
    def _cat_has_items(c):
        if c["items"]:
            return True
        return any(s["items"] for s in c["subcategories"])
    cleaned = []
    for c in out:
        c["subcategories"] = [s for s in c["subcategories"] if s["items"]]
        if _cat_has_items(c):
            cleaned.append(c)
    return cleaned'''

assert old_sanitize in c, "SANITIZE ANCHOR NOT FOUND"
c = c.replace(old_sanitize, new_sanitize, 1)

# --- 3. Insert new Pydantic models + new endpoint right after owner_bulk_menu, before the AI extraction comment ---
anchor = '''    return {"created": len(created), "items": created, "images_generating": 0}


# ----------------------------- AI Menu Extraction (Gemini 2.5 Flash) -----------------------------'''

insertion = '''    return {"created": len(created), "items": created, "images_generating": 0}


class StructuredVariation(BaseModel):
    name: str
    price: int = 0


class StructuredItem(BaseModel):
    name: str
    price: int = 0
    description: str = ""
    veg: bool = True
    variations: List[StructuredVariation] = []


class StructuredSubcategory(BaseModel):
    name: str
    items: List[StructuredItem] = []


class StructuredCategory(BaseModel):
    name: str
    items: List[StructuredItem] = []
    subcategories: List[StructuredSubcategory] = []


class StructuredMenuImport(BaseModel):
    categories: List[StructuredCategory]


@api.post("/owner/menu/import-structured")
async def owner_import_structured_menu(body: StructuredMenuImport, user: dict = Depends(require_role("restaurant_owner"))):
    """Import extracted menu data preserving categories, subcategories and per-item
    size/portion variations (used by the AI Menu Scan review screen)."""
    rest = await db.restaurants.find_one({"owner_id": user["id"]}, {"_id": 0})
    if not rest:
        raise HTTPException(404, "No restaurant assigned to you yet. Contact admin.")
    rid = rest["id"]
    created_items = 0
    created_variations = 0

    async def _ensure_category(name: str, parent_id: Optional[str]) -> str:
        name = (name or "Menu").strip() or "Menu"
        q = {"restaurant_id": rid, "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}, "parent_id": parent_id}
        existing = await db.categories.find_one(q, {"_id": 0})
        if existing:
            return existing["id"]
        cid = str(uuid.uuid4())
        await db.categories.insert_one({
            "id": cid, "restaurant_id": rid, "name": name,
            "parent_id": parent_id, "sort_order": 0, "is_enabled": True,
        })
        return cid

    async def _save_item(it: StructuredItem, category_name: str, category_id: str, subcategory_id: Optional[str]):
        nonlocal created_items, created_variations
        nm = (it.name or "").strip()
        if not nm:
            return
        fake_body = MenuItemCreate(
            name=nm, description=it.description, price=max(0, it.price),
            category=category_name, category_id=category_id, subcategory_id=subcategory_id,
            veg=it.veg, available=True, is_available=True,
        )
        doc = _build_item_doc(rid, fake_body, category_name, "pending")
        doc["category_id"] = category_id
        doc["subcategory_id"] = subcategory_id
        await db.menu_items.insert_one(dict(doc))
        created_items += 1
        for v in it.variations:
            vname = (v.name or "").strip()
            if not vname:
                continue
            await db.item_variations.insert_one({
                "id": str(uuid.uuid4()), "menu_item_id": doc["id"],
                "name": vname, "price": max(0, v.price),
                "is_available": True,
            })
            created_variations += 1

    for cat in body.categories:
        cat_id = await _ensure_category(cat.name, None)
        for it in cat.items:
            await _save_item(it, cat.name, cat_id, None)
        for sub in cat.subcategories:
            sub_id = await _ensure_category(sub.name, cat_id)
            for it in sub.items:
                await _save_item(it, cat.name, cat_id, sub_id)

    return {"created": created_items, "variations": created_variations}


# ----------------------------- AI Menu Extraction (Gemini 2.5 Flash) -----------------------------'''

assert anchor in c, "INSERTION ANCHOR NOT FOUND"
c = c.replace(anchor, insertion, 1)

with open(path, "w") as f:
    f.write(c)
print("ALL 3 BACKEND PATCHES APPLIED SUCCESSFULLY")
