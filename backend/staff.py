"""
Staff / sub-user management.

Two flavours of staff:
  * admin_staff     — created by an admin, permission-scoped to admin panel modules
  * restaurant_staff — created by a restaurant owner, permission-scoped to owner
                       panel modules; inherits their parent owner's restaurant

Storage
-------
Staff are stored in the same `users` collection as regular users. Additional fields:
  * role              : "admin_staff" | "restaurant_staff"
  * parent_id         : id of the admin (for admin_staff) or owner (for restaurant_staff)
  * restaurant_id     : denormalised for restaurant_staff (looked up from parent owner)
  * permissions       : List[str] — module keys they can access
  * staff_label       : short display title ("Manager", "Cashier", "Support Agent", ...)
  * created_by        : id of the creating admin/owner (for audit)
  * active            : True/False — soft-disable a staff without deleting

Authentication
--------------
Staff log in with their phone via the exact same OTP flow. The verify-otp endpoint
transparently picks up their existing role from the DB (see server.py). Their
JWT `role` claim is `admin_staff` or `restaurant_staff` accordingly.

Authorisation
-------------
`require_role` (patched in server.py) treats a staff role as its "parent" role
provided the URL-prefix middleware has already validated the module permission.
For restaurant_staff, `user["id"]` is transparently swapped for the parent
owner's id so every existing endpoint that filters by `owner_id=user["id"]`
continues to work unchanged.
"""
from __future__ import annotations

import re
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

log = logging.getLogger("staff")


# ---------------------------------------------------------------------------
# Module registries
# ---------------------------------------------------------------------------
# NOTE: Each module is a coarse-grained permission bucket. The `paths` list is
# used by the URL-prefix middleware to decide which module governs an incoming
# request. Keep the list of prefixes in sync with server.py route names.

OWNER_MODULES: List[Dict[str, Any]] = [
    {"key": "dashboard",  "label": "Dashboard & Stats",   "description": "Home dashboard, revenue widgets, quick stats.",
     "icon": "grid-outline", "paths": ["/owner/stats", "/owner/dashboard", "/owner/notifications"]},
    {"key": "orders",     "label": "Delivery Orders",     "description": "View, accept, and update delivery orders.",
     "icon": "receipt-outline", "paths": ["/owner/orders", "/owner/recent-orders"]},
    {"key": "pos",        "label": "POS / Dine-in",       "description": "Table POS, dine-in orders, KOT, e-bill.",
     "icon": "calculator-outline", "paths": ["/owner/pos", "/owner/dinein", "/owner/tables", "/owner/kitchen"]},
    {"key": "menu",       "label": "Menu & Categories",   "description": "Add/edit menu items, categories, variations.",
     "icon": "fast-food-outline", "paths": ["/owner/menu", "/owner/categories", "/owner/restaurants/"]},
    {"key": "reports",    "label": "Reports & Analytics", "description": "Sales reports, item analytics, exports.",
     "icon": "stats-chart-outline", "paths": ["/owner/reports"]},
    {"key": "finance",    "label": "Finance & Payouts",   "description": "Payouts, invoices, banking details.",
     "icon": "wallet-outline", "paths": ["/owner/finance"]},
    {"key": "reviews",    "label": "Reviews & Complaints","description": "Read/respond to reviews and customer complaints.",
     "icon": "star-outline", "paths": ["/owner/reviews", "/owner/complaints"]},
    {"key": "settings",   "label": "Outlet Settings",     "description": "Timing, offers, restaurant profile, banners.",
     "icon": "options-outline", "paths": ["/owner/hours", "/owner/offers", "/owner/outlet", "/owner/my-restaurant",
                                          "/owner/rests", "/owner/availability"]},
]

ADMIN_MODULES: List[Dict[str, Any]] = [
    {"key": "dashboard",     "label": "Dashboard",       "description": "Overview stats.",
     "icon": "grid-outline", "paths": ["/admin/dashboard", "/admin/stats"]},
    {"key": "restaurants",   "label": "Restaurants",     "description": "Manage restaurant listings, approvals.",
     "icon": "storefront-outline", "paths": ["/admin/restaurants", "/admin/menu"]},
    {"key": "orders",        "label": "Orders",          "description": "All orders across the platform.",
     "icon": "receipt-outline", "paths": ["/admin/orders", "/admin/pos"]},
    {"key": "users",         "label": "Users",           "description": "Manage customers, riders, owners.",
     "icon": "people-outline", "paths": ["/admin/users"]},
    {"key": "applications",  "label": "Applications",    "description": "Owner/rider signup applications.",
     "icon": "document-text-outline", "paths": ["/admin/applications", "/admin/applications-legacy"]},
    {"key": "reviews",       "label": "Reviews",         "description": "Moderate reviews.",
     "icon": "star-outline", "paths": ["/admin/reviews"]},
    {"key": "support",       "label": "Support & Complaints", "description": "Customer support, chat, complaints.",
     "icon": "chatbubble-ellipses-outline", "paths": ["/admin/support", "/admin/complaints", "/admin/whatsapp"]},
    {"key": "finance",       "label": "Finance & Reports","description": "Financial reports, payouts.",
     "icon": "wallet-outline", "paths": ["/admin/finance", "/admin/reports"]},
    {"key": "notifications", "label": "Notifications",   "description": "Auto triggers + manual push broadcasts.",
     "icon": "notifications-outline", "paths": ["/admin/settings/notifications", "/admin/push"]},
    {"key": "price_policy",  "label": "Price Policy",    "description": "Owner price hike/drop caps.",
     "icon": "pricetag-outline", "paths": ["/admin/settings/price-policy"]},
    {"key": "commission",    "label": "Commission & Pricing", "description": "Commission, delivery fees.",
     "icon": "trending-up-outline", "paths": ["/admin/commission", "/admin/charges", "/admin/checkout-settings"]},
    {"key": "banners",       "label": "Ads & Banners",   "description": "Homepage banners, ads, offers.",
     "icon": "megaphone-outline", "paths": ["/admin/ads", "/admin/offers", "/admin/banners"]},
    {"key": "settings",      "label": "Site Settings",   "description": "Theme, custom CSS, misc site settings.",
     "icon": "color-palette-outline", "paths": ["/admin/appearance", "/admin/theme", "/admin/custom-css", "/admin/settings"]},
]

_OWNER_MODULE_KEYS = {m["key"] for m in OWNER_MODULES}
_ADMIN_MODULE_KEYS = {m["key"] for m in ADMIN_MODULES}

# The "staff" module keys are intentionally NOT in the registries — only the
# owner/admin (their creators) can access `/owner/staff` or `/admin/staff`.
_STAFF_MGMT_PATHS = ["/owner/staff", "/admin/staff"]


# ---------------------------------------------------------------------------
# Path → module resolution helpers (used by permission middleware)
# ---------------------------------------------------------------------------

def _match_module(path: str, modules: List[Dict[str, Any]]) -> Optional[str]:
    """Return the module key that governs `path`, or None if the path is not
    under any known module."""
    for mod in modules:
        for pref in mod["paths"]:
            if path.startswith(pref):
                return mod["key"]
    return None


def resolve_required_module(role: str, path: str) -> Dict[str, Any]:
    """Given a staff role and an API path (already stripped of `/api` prefix),
    return a dict describing what's needed:
        { "module": "<key>" }              → module permission required
        { "denied": True, "reason": "..."} → staff never allowed here
        { "unmapped": True }               → not a scoped path, allow through
    """
    for p in _STAFF_MGMT_PATHS:
        if path.startswith(p):
            return {"denied": True, "reason": "Only the account owner can manage staff."}
    if role == "restaurant_staff":
        # Only /owner/... is even reachable by restaurant_staff.
        if not path.startswith("/owner/"):
            return {"denied": True, "reason": "This area is not available for restaurant staff."}
        mod = _match_module(path, OWNER_MODULES)
        if mod:
            return {"module": mod}
        # Unmapped owner-panel routes → require a base "settings" perm as a
        # conservative default so brand-new endpoints don't leak.
        return {"module": "settings"}
    if role == "admin_staff":
        if not path.startswith("/admin/"):
            return {"denied": True, "reason": "This area is not available for admin staff."}
        mod = _match_module(path, ADMIN_MODULES)
        if mod:
            return {"module": mod}
        return {"module": "settings"}
    return {"unmapped": True}


# ---------------------------------------------------------------------------
# Permission middleware (attached to the FastAPI app in server.py)
# ---------------------------------------------------------------------------

async def enforce_staff_permissions(request: Request, call_next):
    """ASGI middleware — inspect the JWT, and if the caller is a staff user,
    consult their `permissions` list against the route-derived module."""
    from starlette.responses import JSONResponse

    # Only inspect API calls; static/asset requests are irrelevant.
    path = request.url.path
    if not path.startswith("/api/"):
        return await call_next(request)

    # Cheap short-circuit for public endpoints so we don't decode JWT for each.
    _PUBLIC_PREFIXES = ("/api/auth/", "/api/health", "/api/restaurants", "/api/menu",
                        "/api/socket.io", "/api/support/", "/api/subscribers/",
                        "/api/me/", "/api/staff/modules",
                        # Notifications endpoints are per-user, not per-module — the
                        # backend already scopes them by JWT `sub`. Push subscription
                        # register/unregister is also user-scoped.
                        "/api/notifications", "/api/push/",
                        # Cart, orders (customer own), profile, addresses, wallet,
                        # payments callbacks — all scoped by JWT already.
                        "/api/orders", "/api/profile", "/api/addresses",
                        "/api/cart", "/api/wallet", "/api/payments/",
                        "/api/user/", "/api/settings/", "/api/reviews",
                        )
    if any(path.startswith(p) for p in _PUBLIC_PREFIXES):
        return await call_next(request)

    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return await call_next(request)

    # Decode JWT locally — same secret/algo as server.py. We only need the sub+role.
    import os, jwt
    try:
        token = auth.split(" ", 1)[1]
        data = jwt.decode(token, os.environ.get("JWT_SECRET", "desi-bhojan-prod-secret-2026"),
                          algorithms=["HS256"])
    except Exception:  # noqa: BLE001
        return await call_next(request)

    role = data.get("role")
    if role not in ("admin_staff", "restaurant_staff"):
        return await call_next(request)

    # We know it's a staff user — pull their record for permissions.
    db = request.app.state._staff_db  # attached in server.py bootstrap
    user = await db.users.find_one({"id": data.get("sub")}, {"_id": 0})
    if not user:
        return JSONResponse({"detail": "Staff user missing"}, status_code=401)
    if user.get("active") is False:
        return JSONResponse({"detail": "Staff account disabled by owner/admin."}, status_code=403)

    api_path = path[4:]  # strip "/api"
    check = resolve_required_module(role, api_path)
    if check.get("denied"):
        return JSONResponse({"detail": check.get("reason") or "Not allowed"}, status_code=403)
    if check.get("unmapped"):
        return await call_next(request)

    perms = set(user.get("permissions") or [])
    needed = check["module"]
    if needed not in perms:
        return JSONResponse(
            {"detail": f"Missing permission: {needed}. Ask your admin/owner to grant '{needed}' access."},
            status_code=403,
        )
    return await call_next(request)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

_PHONE_RE = re.compile(r"^\+?\d{7,15}$")


def _valid_phone(p: str) -> bool:
    return bool(_PHONE_RE.match((p or "").strip()))


class StaffCreate(BaseModel):
    phone: str
    name: str = Field(..., min_length=1, max_length=80)
    staff_label: Optional[str] = Field(None, max_length=40)
    permissions: List[str] = Field(default_factory=list)


class StaffUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    staff_label: Optional[str] = Field(None, max_length=40)
    permissions: Optional[List[str]] = None
    active: Optional[bool] = None


class PresetApply(BaseModel):
    preset: str  # e.g. "manager", "cashier", "kitchen", "waiter", "support"


# Preset shortcuts for restaurant staff
OWNER_PRESETS: Dict[str, Dict[str, Any]] = {
    "manager":  {"label": "Manager",  "permissions": ["orders", "pos", "reports", "reviews", "menu", "dashboard"]},
    "cashier":  {"label": "Cashier",  "permissions": ["pos", "orders", "dashboard"]},
    "kitchen":  {"label": "Kitchen",  "permissions": ["pos", "orders"]},
    "waiter":   {"label": "Waiter",   "permissions": ["pos"]},
    "reports":  {"label": "Reports Only", "permissions": ["reports", "finance", "dashboard"]},
}

# Preset shortcuts for admin staff
ADMIN_PRESETS: Dict[str, Dict[str, Any]] = {
    "support":  {"label": "Support Agent", "permissions": ["support", "orders", "users", "dashboard"]},
    "content":  {"label": "Content Manager", "permissions": ["restaurants", "banners", "reviews", "dashboard"]},
    "finance":  {"label": "Finance Manager", "permissions": ["finance", "commission", "orders", "dashboard"]},
    "marketing":{"label": "Marketing", "permissions": ["notifications", "banners", "dashboard"]},
    "operations":{"label": "Operations", "permissions": ["restaurants", "orders", "applications", "support", "dashboard"]},
}


# ---------------------------------------------------------------------------
# Router factory
# ---------------------------------------------------------------------------

def make_staff_router(db, require_role):
    router = APIRouter()

    # =============== Owner-side staff ===============

    @router.get("/owner/staff")
    async def owner_list_staff(user: dict = Depends(require_role("restaurant_owner"))):
        rows = await db.users.find(
            {"role": "restaurant_staff", "parent_id": user["id"]},
            {"_id": 0},
        ).sort("created_at", -1).to_list(500)
        return {"staff": rows, "modules": OWNER_MODULES, "presets": OWNER_PRESETS}

    @router.post("/owner/staff")
    async def owner_create_staff(body: StaffCreate, user: dict = Depends(require_role("restaurant_owner"))):
        phone = (body.phone or "").strip()
        if not _valid_phone(phone):
            raise HTTPException(400, "Invalid phone number")
        # No duplicate phone
        existing = await db.users.find_one({"phone": phone}, {"_id": 0})
        if existing:
            raise HTTPException(400, "A user with this phone already exists")
        # Validate permissions
        perms = [p for p in (body.permissions or []) if p in _OWNER_MODULE_KEYS]
        # Look up parent owner's restaurant (denormalise for convenience)
        rest = await db.restaurants.find_one({"owner_id": user["id"]}, {"_id": 0, "id": 1, "name": 1})
        doc = {
            "id": str(uuid.uuid4()),
            "phone": phone,
            "name": body.name.strip(),
            "role": "restaurant_staff",
            "parent_id": user["id"],
            "restaurant_id": rest["id"] if rest else None,
            "restaurant_name": rest["name"] if rest else None,
            "permissions": perms,
            "staff_label": (body.staff_label or "Staff").strip(),
            "created_by": user["id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "active": True,
        }
        await db.users.insert_one(dict(doc))
        return doc

    @router.post("/owner/staff/preset")
    async def owner_create_from_preset(body: dict, user: dict = Depends(require_role("restaurant_owner"))):
        preset_key = (body.get("preset") or "").strip().lower()
        preset = OWNER_PRESETS.get(preset_key)
        if not preset:
            raise HTTPException(400, f"Unknown preset. Options: {list(OWNER_PRESETS.keys())}")
        payload = StaffCreate(
            phone=body.get("phone"),
            name=body.get("name") or "Staff",
            staff_label=preset["label"],
            permissions=preset["permissions"],
        )
        return await owner_create_staff(payload, user)  # type: ignore[arg-type]

    @router.patch("/owner/staff/{sid}")
    async def owner_update_staff(sid: str, body: StaffUpdate, user: dict = Depends(require_role("restaurant_owner"))):
        s = await db.users.find_one({"id": sid, "parent_id": user["id"], "role": "restaurant_staff"}, {"_id": 0})
        if not s:
            raise HTTPException(404, "Staff not found")
        patch: Dict[str, Any] = {}
        if body.name is not None:
            patch["name"] = body.name.strip()
        if body.staff_label is not None:
            patch["staff_label"] = body.staff_label.strip()
        if body.permissions is not None:
            patch["permissions"] = [p for p in body.permissions if p in _OWNER_MODULE_KEYS]
        if body.active is not None:
            patch["active"] = bool(body.active)
        if patch:
            await db.users.update_one({"id": sid}, {"$set": patch})
        return await db.users.find_one({"id": sid}, {"_id": 0})

    @router.delete("/owner/staff/{sid}")
    async def owner_delete_staff(sid: str, user: dict = Depends(require_role("restaurant_owner"))):
        s = await db.users.find_one({"id": sid, "parent_id": user["id"], "role": "restaurant_staff"}, {"_id": 0})
        if not s:
            raise HTTPException(404, "Staff not found")
        await db.users.delete_one({"id": sid})
        return {"ok": True}

    # =============== Admin-side staff ===============

    @router.get("/admin/staff")
    async def admin_list_staff(user: dict = Depends(require_role("admin"))):
        rows = await db.users.find(
            {"role": "admin_staff"},
            {"_id": 0},
        ).sort("created_at", -1).to_list(500)
        return {"staff": rows, "modules": ADMIN_MODULES, "presets": ADMIN_PRESETS}

    @router.post("/admin/staff")
    async def admin_create_staff(body: StaffCreate, user: dict = Depends(require_role("admin"))):
        phone = (body.phone or "").strip()
        if not _valid_phone(phone):
            raise HTTPException(400, "Invalid phone number")
        existing = await db.users.find_one({"phone": phone}, {"_id": 0})
        if existing:
            raise HTTPException(400, "A user with this phone already exists")
        perms = [p for p in (body.permissions or []) if p in _ADMIN_MODULE_KEYS]
        doc = {
            "id": str(uuid.uuid4()),
            "phone": phone,
            "name": body.name.strip(),
            "role": "admin_staff",
            "parent_id": user["id"],
            "permissions": perms,
            "staff_label": (body.staff_label or "Admin Staff").strip(),
            "created_by": user["id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "active": True,
        }
        await db.users.insert_one(dict(doc))
        return doc

    @router.post("/admin/staff/preset")
    async def admin_create_from_preset(body: dict, user: dict = Depends(require_role("admin"))):
        preset_key = (body.get("preset") or "").strip().lower()
        preset = ADMIN_PRESETS.get(preset_key)
        if not preset:
            raise HTTPException(400, f"Unknown preset. Options: {list(ADMIN_PRESETS.keys())}")
        payload = StaffCreate(
            phone=body.get("phone"),
            name=body.get("name") or "Staff",
            staff_label=preset["label"],
            permissions=preset["permissions"],
        )
        return await admin_create_staff(payload, user)  # type: ignore[arg-type]

    @router.patch("/admin/staff/{sid}")
    async def admin_update_staff(sid: str, body: StaffUpdate, user: dict = Depends(require_role("admin"))):
        s = await db.users.find_one({"id": sid, "role": "admin_staff"}, {"_id": 0})
        if not s:
            raise HTTPException(404, "Staff not found")
        patch: Dict[str, Any] = {}
        if body.name is not None:
            patch["name"] = body.name.strip()
        if body.staff_label is not None:
            patch["staff_label"] = body.staff_label.strip()
        if body.permissions is not None:
            patch["permissions"] = [p for p in body.permissions if p in _ADMIN_MODULE_KEYS]
        if body.active is not None:
            patch["active"] = bool(body.active)
        if patch:
            await db.users.update_one({"id": sid}, {"$set": patch})
        return await db.users.find_one({"id": sid}, {"_id": 0})

    @router.delete("/admin/staff/{sid}")
    async def admin_delete_staff(sid: str, user: dict = Depends(require_role("admin"))):
        s = await db.users.find_one({"id": sid, "role": "admin_staff"}, {"_id": 0})
        if not s:
            raise HTTPException(404, "Staff not found")
        await db.users.delete_one({"id": sid})
        return {"ok": True}

    # =============== Public / shared ===============

    @router.get("/staff/modules")
    async def staff_modules_catalog():
        """Public catalog — used by the login screen to show 'Sign in as staff'
        UI and by the frontend to know which modules exist."""
        return {
            "owner_modules": OWNER_MODULES,
            "admin_modules": ADMIN_MODULES,
            "owner_presets": OWNER_PRESETS,
            "admin_presets": ADMIN_PRESETS,
        }

    @router.get("/me/staff")
    async def my_staff_info(request: Request):
        """Any authenticated staff calls this to learn their own permission set."""
        auth = request.headers.get("authorization") or ""
        if not auth.lower().startswith("bearer "):
            raise HTTPException(401, "Missing token")
        import os, jwt
        try:
            data = jwt.decode(auth.split(" ", 1)[1],
                              os.environ.get("JWT_SECRET", "desi-bhojan-prod-secret-2026"),
                              algorithms=["HS256"])
        except Exception:
            raise HTTPException(401, "Invalid token")
        u = await db.users.find_one({"id": data.get("sub")}, {"_id": 0})
        if not u:
            raise HTTPException(404, "User not found")
        return {
            "id": u["id"],
            "name": u.get("name"),
            "phone": u.get("phone"),
            "role": u.get("role"),
            "staff_label": u.get("staff_label"),
            "permissions": u.get("permissions") or [],
            "restaurant_id": u.get("restaurant_id"),
            "restaurant_name": u.get("restaurant_name"),
            "active": u.get("active", True),
        }

    return router
