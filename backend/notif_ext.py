"""
Notification extension: admin-configurable auto-triggers + manual broadcast.

- `notification_settings` (settings collection): { events: { <event_key>: { enabled, roles } } }
  - `enabled` (bool)         : master on/off for this auto trigger
  - `roles`   (dict)         : per-role delivery toggle (customer/restaurant_owner/rider/admin)
- Known events registry: catalogued below so the admin UI can render toggles even
  if a setting was never written yet.
- `push_broadcasts` collection stores manual marketing pushes (audit + admin list).
"""
from __future__ import annotations

import uuid
import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

log = logging.getLogger("notif_ext")

# ---- Catalogue: all auto-triggered notification event keys -----------------
# Each key describes an internal call site of `_create_notification(...)`. The
# same catalogue is returned by GET /admin/settings/notifications so the admin
# UI can list every switch without hard-coding it.
EVENT_CATALOG: List[Dict[str, Any]] = [
    # ---- Order flow (customer facing) ----
    {"key": "order_placed",       "label": "Order Placed",                 "default_roles": ["customer", "restaurant_owner"]},
    {"key": "order_accepted",     "label": "Order Accepted",               "default_roles": ["customer"]},
    {"key": "order_preparing",    "label": "Order Preparing / Cooking",    "default_roles": ["customer"]},
    {"key": "order_ready",        "label": "Order Ready for Pickup",       "default_roles": ["customer", "rider"]},
    {"key": "order_out_for_delivery", "label": "Out for Delivery",         "default_roles": ["customer"]},
    {"key": "order_delivered",    "label": "Order Delivered",              "default_roles": ["customer"]},
    {"key": "order_cancelled",    "label": "Order Cancelled",              "default_roles": ["customer", "restaurant_owner"]},
    # ---- Owner facing ----
    {"key": "new_order_owner",    "label": "New Order (for Owner)",        "default_roles": ["restaurant_owner"]},
    {"key": "item_approved",      "label": "Menu Item Approved",           "default_roles": ["restaurant_owner"]},
    {"key": "item_rejected",      "label": "Menu Item Rejected",           "default_roles": ["restaurant_owner"]},
    {"key": "restaurant_approved", "label": "Restaurant Approved",         "default_roles": ["restaurant_owner"]},
    {"key": "restaurant_rejected", "label": "Restaurant Rejected",         "default_roles": ["restaurant_owner"]},
    {"key": "payout_processed",   "label": "Payout Processed",             "default_roles": ["restaurant_owner"]},
    {"key": "complaint_reply",    "label": "Complaint / Support Reply",    "default_roles": ["customer", "restaurant_owner", "rider"]},
    # ---- Rider facing ----
    {"key": "rider_assigned",     "label": "Rider Assignment",             "default_roles": ["rider"]},
    {"key": "rider_new_job",      "label": "New Delivery Job Available",   "default_roles": ["rider"]},
    {"key": "rider_payout",       "label": "Rider Payout Processed",       "default_roles": ["rider"]},
    # ---- Dine-in ----
    {"key": "dinein_placed",      "label": "Dine-in Order Placed",         "default_roles": ["restaurant_owner"]},
    {"key": "dinein_accepted",    "label": "Dine-in Order Accepted",       "default_roles": ["customer"]},
    # ---- Marketing / promotional (manual only) ----
    {"key": "marketing",          "label": "Marketing / Promotional",      "default_roles": ["customer", "restaurant_owner", "rider"]},
    # ---- Fallback ----
    {"key": "generic",            "label": "Generic / Uncategorized",      "default_roles": ["customer", "restaurant_owner", "rider", "admin"]},
]

ALL_ROLES = ["customer", "restaurant_owner", "rider", "admin"]
EVENT_KEYS = {e["key"] for e in EVENT_CATALOG}


def _default_event_setting(evt: Dict[str, Any]) -> Dict[str, Any]:
    """Sensible default: enabled=True, roles=map of default_roles."""
    return {
        "enabled": True,
        "roles": {r: (r in evt["default_roles"]) for r in ALL_ROLES},
    }


def _default_settings() -> Dict[str, Any]:
    return {"events": {e["key"]: _default_event_setting(e) for e in EVENT_CATALOG}}


async def get_notification_settings(db) -> Dict[str, Any]:
    """Load stored settings; merge defaults for any missing events (so newly-added
    events show up automatically instead of getting silently disabled)."""
    doc = await db.settings.find_one({"key": "notification_settings"}, {"_id": 0}) or {}
    stored = doc.get("events") or {}
    events: Dict[str, Any] = {}
    for e in EVENT_CATALOG:
        base = _default_event_setting(e)
        s = stored.get(e["key"]) or {}
        events[e["key"]] = {
            "enabled": bool(s.get("enabled", base["enabled"])),
            "roles": {r: bool((s.get("roles") or {}).get(r, base["roles"][r])) for r in ALL_ROLES},
        }
    return {"events": events, "updated_at": doc.get("updated_at")}


async def is_event_allowed_for_role(db, event_key: Optional[str], role: Optional[str]) -> bool:
    """Central gate used by `_create_notification`. Any unknown event key falls
    back to the `generic` bucket so opt-out is still possible."""
    key = event_key if event_key in EVENT_KEYS else "generic"
    settings = await get_notification_settings(db)
    ev = settings["events"].get(key) or {}
    if not ev.get("enabled", True):
        return False
    if not role:
        return True  # can't filter unknown role — allow (matches legacy behaviour)
    return bool((ev.get("roles") or {}).get(role, True))


# ---------------------------- Pydantic models -------------------------------
class EventSettingBody(BaseModel):
    enabled: Optional[bool] = None
    roles: Optional[Dict[str, bool]] = None


class NotifSettingsUpdate(BaseModel):
    # { event_key: { enabled?, roles? } }
    events: Dict[str, EventSettingBody]


class BroadcastBody(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    body: str = Field(..., min_length=1, max_length=500)
    url: Optional[str] = None
    roles: List[str] = Field(default_factory=list, description="One or more of customer/restaurant_owner/rider")


# ---------------------------- Router ----------------------------------------
def make_notif_router(db, get_current_user, require_role, send_push_to_user):
    """Factory so main server.py can register endpoints with existing deps."""
    router = APIRouter()

    @router.get("/admin/settings/notifications")
    async def admin_get_notif_settings(user: dict = Depends(require_role("admin"))):
        settings = await get_notification_settings(db)
        return {
            "catalog": EVENT_CATALOG,
            "roles": ALL_ROLES,
            "events": settings["events"],
            "updated_at": settings["updated_at"],
        }

    @router.patch("/admin/settings/notifications")
    async def admin_update_notif_settings(
        body: NotifSettingsUpdate,
        user: dict = Depends(require_role("admin")),
    ):
        current = await get_notification_settings(db)
        events = dict(current["events"])
        for k, patch in body.events.items():
            key = k if k in EVENT_KEYS else None
            if not key:
                continue
            cur = dict(events[key])
            if patch.enabled is not None:
                cur["enabled"] = bool(patch.enabled)
            if patch.roles is not None:
                merged = dict(cur.get("roles") or {})
                for r, v in patch.roles.items():
                    if r in ALL_ROLES:
                        merged[r] = bool(v)
                cur["roles"] = merged
            events[key] = cur
        await db.settings.update_one(
            {"key": "notification_settings"},
            {"$set": {"key": "notification_settings", "events": events,
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
        return await admin_get_notif_settings(user)  # type: ignore[arg-type]

    @router.post("/admin/push/broadcast")
    async def admin_push_broadcast(
        body: BroadcastBody,
        user: dict = Depends(require_role("admin")),
    ):
        # Validate roles
        target_roles = [r for r in (body.roles or []) if r in ("customer", "restaurant_owner", "rider")]
        if not target_roles:
            raise HTTPException(400, "Select at least one target role")
        title = body.title.strip()[:120]
        body_txt = body.body.strip()[:500]
        url = (body.url or "").strip() or "/"

        # Fetch target users
        cursor = db.users.find({"role": {"$in": target_roles}}, {"_id": 0, "id": 1, "role": 1})
        users = await cursor.to_list(20000)
        recipients = [u for u in users if u.get("id")]

        # Insert broadcast log
        bid = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        broadcast_doc = {
            "id": bid,
            "title": title,
            "body": body_txt,
            "url": url,
            "roles": target_roles,
            "created_by": user["id"],
            "created_at": now,
            "recipients": len(recipients),
            "sent_push": 0,
            "sent_inapp": 0,
        }
        await db.push_broadcasts.insert_one(dict(broadcast_doc))

        sent_push = 0
        sent_inapp = 0
        # Fire in parallel per user (fan-out). Uses `send_push_to_user` provided
        # by server.py so we share the same VAPID pipeline & pruning logic.
        async def _fanout(u: dict):
            nonlocal sent_push, sent_inapp
            uid = u["id"]
            # In-app notification (always created for marketing)
            try:
                notif = {
                    "id": str(uuid.uuid4()),
                    "user_id": uid,
                    "type": "marketing",
                    "title": title,
                    "body": body_txt,
                    "url": url,
                    "read": False,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "broadcast_id": bid,
                }
                await db.notifications.insert_one(dict(notif))
                sent_inapp += 1
            except Exception as e:  # noqa: BLE001
                log.warning("inapp notif failed: %s", e)
            # Web-push (best effort)
            try:
                n = await send_push_to_user(db, uid, {
                    "title": title,
                    "body": body_txt,
                    "url": url,
                    "type": "marketing",
                    "broadcast_id": bid,
                })
                sent_push += n
            except Exception as e:  # noqa: BLE001
                log.warning("push fanout failed for %s: %s", uid, e)
            # Native push (FCM / APNs) for installed-app users (best effort).
            try:
                from native_push import send_push as _send_native_push
                await _send_native_push(db, [uid], {"title": title, "message": body_txt, "action_url": url})
            except Exception as e:  # noqa: BLE001
                log.warning("native push fanout failed for %s: %s", uid, e)

        # Cap concurrency so a huge audience doesn't overwhelm us
        sem = asyncio.Semaphore(20)

        async def _bounded(u):
            async with sem:
                await _fanout(u)

        await asyncio.gather(*[_bounded(u) for u in recipients], return_exceptions=True)

        # Update tallies
        await db.push_broadcasts.update_one(
            {"id": bid},
            {"$set": {"sent_push": sent_push, "sent_inapp": sent_inapp,
                      "completed_at": datetime.now(timezone.utc).isoformat()}},
        )
        return {
            "ok": True,
            "broadcast_id": bid,
            "recipients": len(recipients),
            "sent_inapp": sent_inapp,
            "sent_push": sent_push,
            "roles": target_roles,
        }

    @router.get("/admin/push/broadcasts")
    async def admin_list_broadcasts(user: dict = Depends(require_role("admin"))):
        rows = await db.push_broadcasts.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
        return rows

    return router
