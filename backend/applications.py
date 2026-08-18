"""
Partner (Restaurant) and Rider application module.
A customer submits an application from their profile. Admins review (approve / reject / request clarification).
On approval, the user's role is upgraded automatically — rider becomes 'rider', restaurant partner
becomes 'restaurant_owner'. For restaurant partners, an **ACTIVE restaurant is auto-created and owned
by the applicant** using their submitted details — there is NO separate admin "assign restaurant"
step. Whoever's application is approved immediately becomes the live owner of their restaurant.
Documents (FSSAI / RC / Aadhaar / photos) are stored as base64 strings to keep deployment simple.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

import re as _re

_PAN_RE = _re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")


def _validate_pan(v: str) -> str:
    v = (v or "").strip().upper()
    if not v:
        raise ValueError("PAN number is required")
    if not _PAN_RE.match(v):
        raise ValueError("Invalid PAN. Format: ABCDE1234F (5 letters, 4 digits, 1 letter)")
    return v


ApplicationType = Literal["restaurant_partner", "rider"]
ApplicationStatus = Literal["pending", "clarification_requested", "approved", "rejected"]


# ----------------------- Pydantic Schemas -----------------------
class RestaurantPartnerPayload(BaseModel):
    # Owner / business
    owner_name: str
    business_name: str
    contact_phone: str
    contact_email: Optional[str] = None
    # Restaurant
    restaurant_name: str
    cuisines: List[str] = Field(default_factory=list)
    address: str
    city: str = "Bengaluru"
    pincode: str = ""
    lat: float = 0
    lng: float = 0
    # Compliance
    gst_number: Optional[str] = None
    fssai_number: str
    pan_number: str
    # Bank
    bank_account_name: str
    bank_account_number: str
    bank_ifsc: str
    # Operating
    opening_time: str = "09:00"
    closing_time: str = "23:00"
    # Documents (base64 dataurls)
    fssai_doc: Optional[str] = None
    gst_doc: Optional[str] = None
    pan_doc: Optional[str] = None
    restaurant_photo: Optional[str] = None
    restaurant_photos: List[str] = Field(default_factory=list)
    menu_photo: Optional[str] = None
    # POS consent — owner agrees to use the Bisnoi POS / dine-in system.
    pos_consent: bool = False
    # Food type — Bisnoi is a pure-veg platform; non-veg is not allowed.
    food_type: Literal["veg", "non_veg"] = "veg"

    @field_validator("pan_number")
    @classmethod
    def _pan(cls, v: str) -> str:
        return _validate_pan(v)


class RiderPayload(BaseModel):
    full_name: str
    contact_phone: str
    contact_email: Optional[str] = None
    date_of_birth: str  # YYYY-MM-DD
    city: str = "Bengaluru"
    address: str
    pincode: str = ""
    # Vehicle
    vehicle_type: Literal["bike", "scooter", "bicycle", "ev"] = "bike"
    vehicle_number: str
    rc_number: str
    license_number: str
    # KYC
    aadhaar_number: str
    pan_number: str
    # Bank
    bank_account_name: str
    bank_account_number: str
    bank_ifsc: str
    # Documents
    aadhaar_doc: Optional[str] = None
    license_doc: Optional[str] = None
    rc_doc: Optional[str] = None
    profile_photo: Optional[str] = None

    @field_validator("pan_number")
    @classmethod
    def _pan(cls, v: str) -> str:
        return _validate_pan(v)


class ApplicationSubmit(BaseModel):
    type: ApplicationType
    partner: Optional[RestaurantPartnerPayload] = None
    rider: Optional[RiderPayload] = None


class ReviewAction(BaseModel):
    action: Literal["approve", "reject", "request_clarification"]
    admin_notes: Optional[str] = None


class ClarificationResponse(BaseModel):
    message: str
    # additional updated documents/fields user wants to send (free-form patch)
    patch: Dict[str, Any] = Field(default_factory=dict)


class AdminPayloadEdit(BaseModel):
    # Admin can edit any subset of the applicant's submitted payload fields
    # (e.g. correct typos in name/address/FSSAI/bank details before approving).
    # Document fields (base64 images) are NOT editable here — those must come
    # via clarification flow from the applicant. We strip them defensively below.
    patch: Dict[str, Any] = Field(default_factory=dict)
    note: Optional[str] = None  # optional reason to record in timeline


# ----------------------- Media compression -----------------------
# Applicants upload photos/documents as base64 data-URLs which are stored inside the
# application MongoDB document. A single MongoDB document is capped at 16 MB, and real
# phone photos (3-6 MB each) quickly blow past that -> the insert used to fail with a
# 500 (DocumentTooLarge). We downscale + re-encode large images server-side so the whole
# application stays small, and hard-cap the total payload with a clean 4xx error.

_IMG_FIELDS = (
    "fssai_doc", "gst_doc", "pan_doc", "restaurant_photo", "menu_photo",
    "aadhaar_doc", "license_doc", "rc_doc", "profile_photo",
)
_MAX_PAYLOAD_BYTES = 14 * 1024 * 1024  # keep well under Mongo's 16MB doc limit


def _shrink_data_url(val: Any, max_dim: int = 1400, quality: int = 72, passthrough_kb: int = 350) -> Any:
    """Downscale + JPEG-recompress a base64 image data-URL. Non-images / small files / bad
    data are returned unchanged (the global size guard still protects against huge files)."""
    if not isinstance(val, str) or not val.startswith("data:"):
        return val
    try:
        header, b64 = val.split(",", 1)
    except ValueError:
        return val
    import base64 as _b64
    try:
        raw = _b64.b64decode(b64)
    except Exception:
        return val
    if len(raw) <= passthrough_kb * 1024:
        return val  # already small enough
    if not header.startswith("data:image/"):
        return val  # PDFs / other -> leave to the global cap
    try:
        import io as _io
        from PIL import Image, ImageOps
        im = Image.open(_io.BytesIO(raw))
        im = ImageOps.exif_transpose(im)
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        w, h = im.size
        if max(w, h) > max_dim:
            s = max_dim / float(max(w, h))
            im = im.resize((max(1, int(w * s)), max(1, int(h * s))))
        out = _io.BytesIO()
        im.save(out, format="JPEG", quality=quality, optimize=True)
        newb = out.getvalue()
        if len(newb) < len(raw):
            return "data:image/jpeg;base64," + _b64.b64encode(newb).decode()
        return val
    except Exception:
        return val


def _compress_payload_media(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Compress every image field (and the restaurant_photos list) in an application payload."""
    if not isinstance(payload, dict):
        return payload
    for f in _IMG_FIELDS:
        if payload.get(f):
            payload[f] = _shrink_data_url(payload[f])
    photos = payload.get("restaurant_photos")
    if isinstance(photos, list):
        payload["restaurant_photos"] = [_shrink_data_url(x) for x in photos]
    return payload


def _guard_payload_size(payload: Dict[str, Any]) -> None:
    """Reject payloads that are still too large after compression with a clean 4xx error."""
    import json as _json
    try:
        approx = len(_json.dumps(payload, default=str).encode("utf-8"))
    except Exception:
        return
    if approx > _MAX_PAYLOAD_BYTES:
        raise HTTPException(
            413,
            "Your photos/documents are too large to upload. Please add fewer or smaller "
            "images (PDF documents should be under ~3 MB each) and try again.",
        )



# ----------------------- Router factory -----------------------
def make_applications_router(db, get_current_user, require_role) -> APIRouter:
    router = APIRouter(prefix="/applications", tags=["applications"])
    admin = APIRouter(prefix="/admin/applications", tags=["admin-applications"])

    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    async def _add_timeline(app_id: str, entry: Dict[str, Any]):
        entry = {"at": _now(), **entry}
        await db.applications.update_one({"id": app_id}, {"$push": {"timeline": entry}})

    # -------- Customer endpoints --------
    @router.post("/submit")
    async def submit_application(body: ApplicationSubmit, user: dict = Depends(get_current_user)):
        # Validate payload presence
        if body.type == "restaurant_partner" and not body.partner:
            raise HTTPException(400, "partner payload required")
        if body.type == "rider" and not body.rider:
            raise HTTPException(400, "rider payload required")

        # Bisnoi is a pure-veg platform — reject non-veg restaurant applications.
        if body.type == "restaurant_partner" and body.partner and body.partner.food_type == "non_veg":
            raise HTTPException(400, "Non-veg restaurants are not allowed on Bisnoi. Only pure-veg restaurants can register.")

        # Block if an active application of same type exists (pending / clarification / approved)
        existing = await db.applications.find_one(
            {"user_id": user["id"], "type": body.type, "status": {"$in": ["pending", "clarification_requested", "approved"]}},
            {"_id": 0},
        )
        if existing:
            raise HTTPException(409, f"You already have an active {body.type} application (status: {existing['status']}).")

        payload = (body.partner or body.rider).model_dump()  # type: ignore
        # Downscale/recompress large base64 images so the document stays under Mongo's 16MB limit,
        # then hard-cap the total size with a clean error (fixes the submit 500 on big photo uploads).
        payload = _compress_payload_media(payload)
        _guard_payload_size(payload)
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "applicant_name": user.get("name"),
            "applicant_phone": user.get("phone"),
            "type": body.type,
            "status": "pending",
            "payload": payload,
            "admin_notes": None,
            "clarification_thread": [],
            "is_resubmitted": False,
            "timeline": [{"at": _now(), "event": "submitted", "by": "user"}],
            "created_at": _now(),
            "updated_at": _now(),
        }
        await db.applications.insert_one(dict(doc))
        doc.pop("_id", None)
        return doc

    @router.get("/mine")
    async def my_applications(user: dict = Depends(get_current_user)):
        cur = db.applications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
        return await cur.to_list(length=100)

    @router.get("/{aid}")
    async def get_application(aid: str, user: dict = Depends(get_current_user)):
        doc = await db.applications.find_one({"id": aid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Not found")
        if doc["user_id"] != user["id"] and user["role"] != "admin":
            raise HTTPException(403, "Forbidden")
        return doc

    @router.post("/{aid}/respond-clarification")
    async def respond_clarification(aid: str, body: ClarificationResponse, user: dict = Depends(get_current_user)):
        doc = await db.applications.find_one({"id": aid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Not found")
        if doc["user_id"] != user["id"]:
            raise HTTPException(403, "Forbidden")
        if doc["status"] != "clarification_requested":
            raise HTTPException(400, "No clarification pending")

        update: Dict[str, Any] = {
            "status": "pending",
            "is_resubmitted": True,
            "updated_at": _now(),
        }
        # merge patch fields into payload (compress any re-uploaded images first)
        if body.patch:
            patch = _compress_payload_media(dict(body.patch))
            _guard_payload_size(patch)
            for k, v in patch.items():
                update[f"payload.{k}"] = v
        await db.applications.update_one({"id": aid}, {"$set": update, "$push": {
            "clarification_thread": {"by": "user", "message": body.message, "at": _now()},
        }})
        await _add_timeline(aid, {"event": "clarification_responded", "by": "user"})
        return await db.applications.find_one({"id": aid}, {"_id": 0})

    # -------- Admin endpoints --------
    @admin.get("")
    async def list_applications(status: Optional[str] = None, type: Optional[str] = None, _: dict = Depends(require_role("admin"))):
        q: Dict[str, Any] = {}
        if status:
            q["status"] = status
        if type:
            q["type"] = type
        cur = db.applications.find(q, {"_id": 0}).sort("created_at", -1)
        return await cur.to_list(length=500)

    @admin.get("/stats")
    async def application_stats(_: dict = Depends(require_role("admin"))):
        out: Dict[str, int] = {}
        for st in ("pending", "clarification_requested", "approved", "rejected"):
            out[st] = await db.applications.count_documents({"status": st})
        out["total"] = await db.applications.count_documents({})
        return out

    @admin.get("/{aid}")
    async def admin_get(aid: str, _: dict = Depends(require_role("admin"))):
        doc = await db.applications.find_one({"id": aid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Not found")
        return doc

    @admin.post("/{aid}/review")
    async def review_application(aid: str, body: ReviewAction, admin_user: dict = Depends(require_role("admin"))):
        doc = await db.applications.find_one({"id": aid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Not found")
        if doc["status"] in ("approved", "rejected"):
            raise HTTPException(400, f"Application already {doc['status']}")

        new_status: ApplicationStatus
        if body.action == "approve":
            new_status = "approved"
        elif body.action == "reject":
            new_status = "rejected"
        else:
            new_status = "clarification_requested"

        update = {
            "status": new_status,
            "admin_notes": body.admin_notes,
            "updated_at": _now(),
        }
        push: Dict[str, Any] = {}
        if body.action == "request_clarification":
            push["clarification_thread"] = {"by": "admin", "message": body.admin_notes or "", "at": _now()}
        await db.applications.update_one({"id": aid}, {"$set": update, **({"$push": push} if push else {})})
        await _add_timeline(aid, {"event": body.action, "by": "admin", "note": body.admin_notes})

        # Side effects on approval
        if new_status == "approved":
            await _on_approved(doc)

        return await db.applications.find_one({"id": aid}, {"_id": 0})

    async def _create_restaurant_from_application(app_doc: Dict[str, Any]):
        """Auto-create a customer-visible restaurant from an approved partner
        application. Idempotent (no-op if one already exists for this app).

        If the admin has configured a one-time joining fee, the restaurant is
        created INACTIVE (pending_payment) and goes live only after the owner
        pays via Razorpay.
        """
        user_id = app_doc["user_id"]
        existing = await db.restaurants.find_one({"source_application_id": app_doc["id"]}, {"_id": 0, "id": 1})
        if existing:
            return
        p = app_doc.get("payload", {}) or {}
        try:
            from platform_ext import get_platform_config
            cfg = await get_platform_config(db)
            onboarding_fee = int(cfg.get("onboarding_fee", 0) or 0)
        except Exception:
            onboarding_fee = 0
        fee_gated = onboarding_fee > 0
        rest_id = str(uuid.uuid4())
        rest_doc = {
            "id": rest_id,
            "name": p.get("restaurant_name") or p.get("business_name") or "New Restaurant",
            "image": (p.get("restaurant_photos") or [None])[0] or p.get("restaurant_photo") or "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800",
            "photos": p.get("restaurant_photos") or ([p["restaurant_photo"]] if p.get("restaurant_photo") else []),
            "food_type": p.get("food_type") or "veg",
            "is_veg": True,
            "cuisines": p.get("cuisines") or [],
            "rating": 0.0,
            "delivery_time": 30,
            "price_for_two": 400,
            "lat": float(p.get("lat") or 0),
            "lng": float(p.get("lng") or 0),
            "address": p.get("address") or "",
            "owner_id": user_id,
            "status": "pending_payment" if fee_gated else "active",
            "is_active": not fee_gated,
            "onboarding_fee": onboarding_fee,
            "onboarding_paid": not fee_gated,
            "is_promoted": False,
            "offer_text": None,
            "description": None,
            "contact_phone": p.get("contact_phone"),
            "contact_email": p.get("contact_email"),
            "fssai_license": p.get("fssai_number"),
            "gst_number": p.get("gst_number"),
            "bank_account_name": p.get("bank_account_name"),
            "bank_account_number": p.get("bank_account_number"),
            "bank_ifsc": p.get("bank_ifsc"),
            "delivery_radius_km": 5.0,
            "operating_hours": [],
            "documents": [],
            "city": p.get("city") or "Bengaluru",
            "pincode": p.get("pincode") or None,
            "pos_enabled": bool(p.get("pos_consent", False)),
            "pos_consent": bool(p.get("pos_consent", False)),
            "source_application_id": app_doc["id"],
            "created_at": _now(),
        }
        await db.restaurants.insert_one(dict(rest_doc))
        # Auto-create default "Menu" category so the owner can add items immediately
        default_cat = {
            "id": str(uuid.uuid4()),
            "restaurant_id": rest_id,
            "name": "Menu",
            "sort_order": 1,
            "is_enabled": True,
        }
        await db.categories.insert_one(dict(default_cat))

    async def _on_approved(app_doc: Dict[str, Any]):
        """Side-effects on approval.
        - Rider application -> upgrade role to 'rider'.
        - Restaurant partner -> upgrade role to 'restaurant_owner' AND auto-create
          a fully **ACTIVE** restaurant owned by the applicant (see
          _create_restaurant_from_application). Idempotent.
        """
        user_id = app_doc["user_id"]
        if app_doc["type"] == "rider":
            await db.users.update_one({"id": user_id}, {"$set": {"role": "rider"}})
        elif app_doc["type"] == "restaurant_partner":
            await db.users.update_one({"id": user_id}, {"$set": {"role": "restaurant_owner"}})
            await _create_restaurant_from_application(app_doc)

    @admin.delete("/{aid}")
    async def delete_application(aid: str, admin_user: dict = Depends(require_role("admin"))):
        """Delete an application (available for any status, incl. approved/rejected).
        If it was an APPROVED restaurant_partner application, this CASCADES: the auto-created
        restaurant (+ its menu items, variations, categories) is removed and the owner is
        reverted to a customer (unless they still own another restaurant). An approved rider
        is likewise reverted to customer."""
        doc = await db.applications.find_one({"id": aid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Not found")

        removed_restaurants = 0
        reverted_user = False
        if doc.get("status") == "approved":
            user_id = doc.get("user_id")
            if doc.get("type") == "restaurant_partner":
                rests = await db.restaurants.find({"source_application_id": aid}, {"_id": 0, "id": 1}).to_list(50)
                for r in rests:
                    rid = r["id"]
                    item_ids = [m["id"] async for m in db.menu_items.find({"restaurant_id": rid}, {"_id": 0, "id": 1})]
                    if item_ids:
                        await db.item_variations.delete_many({"menu_item_id": {"$in": item_ids}})
                    await db.menu_items.delete_many({"restaurant_id": rid})
                    await db.categories.delete_many({"restaurant_id": rid})
                    await db.restaurants.delete_one({"id": rid})
                    removed_restaurants += 1
                if user_id and await db.restaurants.count_documents({"owner_id": user_id}) == 0:
                    await db.users.update_one({"id": user_id}, {"$set": {"role": "customer"}})
                    reverted_user = True
            elif doc.get("type") == "rider":
                if user_id and await db.restaurants.count_documents({"owner_id": user_id}) == 0:
                    await db.users.update_one({"id": user_id}, {"$set": {"role": "customer"}})
                    reverted_user = True

        await db.applications.delete_one({"id": aid})
        return {"ok": True, "deleted": True, "removed_restaurants": removed_restaurants, "reverted_user": reverted_user}

    return router, admin
