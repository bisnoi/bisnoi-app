"""
Price policy: admin-controlled restrictions on how much a restaurant owner can
hike/drop menu item prices, plus optional per-restaurant overrides.

Persistence
-----------
Global default lives in `settings` collection:
    { key: "price_policy", ...policy_fields }

Per-restaurant override lives on the restaurant document itself:
    restaurants[<id>].price_policy = { ...same shape... }

Baseline
--------
Each menu item stores `baseline_price` — the reference price the policy compares
against. It is set on:
  * item creation (admin-created / bulk / approved)
  * admin approval of a pending item (locks in the approved price)
  * admin edit of an item's price (admin edits reset the baseline)

Policy shape
------------
    {
        "allow_owner_price_edit": True/False,   # master gate for owner edits
        "hike_max_percent": 20,                  # 0..N (0 = no hike allowed)
        "drop_max_percent": 30,                  # 0..N (0 = no drop allowed)
        "require_admin_approval_on_change": False,
        # (future: whitelist/blacklist categories, minimum price floor, etc.)
    }
"""
from __future__ import annotations

import logging
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

log = logging.getLogger("price_policy")

DEFAULT_POLICY: Dict[str, Any] = {
    "allow_owner_price_edit": True,
    "hike_max_percent": 20,
    "drop_max_percent": 30,
    "require_admin_approval_on_change": False,
}

POLICY_KEYS = set(DEFAULT_POLICY.keys())


def _clean(policy: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    out = dict(DEFAULT_POLICY)
    if not policy:
        return out
    for k in POLICY_KEYS:
        if k in policy and policy[k] is not None:
            out[k] = policy[k]
    # Coerce types & bounds
    out["allow_owner_price_edit"] = bool(out["allow_owner_price_edit"])
    out["require_admin_approval_on_change"] = bool(out["require_admin_approval_on_change"])
    try:
        out["hike_max_percent"] = max(0, min(500, int(out["hike_max_percent"])))
    except Exception:  # noqa: BLE001
        out["hike_max_percent"] = DEFAULT_POLICY["hike_max_percent"]
    try:
        out["drop_max_percent"] = max(0, min(100, int(out["drop_max_percent"])))
    except Exception:  # noqa: BLE001
        out["drop_max_percent"] = DEFAULT_POLICY["drop_max_percent"]
    return out


async def get_global_policy(db) -> Dict[str, Any]:
    doc = await db.settings.find_one({"key": "price_policy"}, {"_id": 0}) or {}
    return _clean({k: doc.get(k) for k in POLICY_KEYS})


async def get_effective_policy(db, restaurant: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Merge per-restaurant override (if any) on top of the global default.
    Restaurant field: `price_policy` — same shape; unspecified keys fall back."""
    base = await get_global_policy(db)
    rp = (restaurant or {}).get("price_policy") if restaurant else None
    if not rp:
        return base
    merged = dict(base)
    for k in POLICY_KEYS:
        if k in rp and rp[k] is not None:
            merged[k] = rp[k]
    return _clean(merged)


def compute_allowed_range(policy: Dict[str, Any], baseline: int) -> Dict[str, int]:
    """Given a baseline price and a policy, compute [min, max] allowed prices."""
    try:
        b = max(0, int(baseline or 0))
    except Exception:  # noqa: BLE001
        b = 0
    hike = int(policy.get("hike_max_percent", 0) or 0)
    drop = int(policy.get("drop_max_percent", 0) or 0)
    max_p = b + int(round(b * hike / 100.0)) if b > 0 else 0
    min_p = b - int(round(b * drop / 100.0)) if b > 0 else 0
    min_p = max(0, min_p)
    return {"min_price": min_p, "max_price": max_p, "baseline_price": b}


async def enforce_price_change(
    db,
    restaurant: Dict[str, Any],
    item: Dict[str, Any],
    new_price: int,
) -> Dict[str, Any]:
    """Raise HTTPException(400) if the new price violates policy. Return the
    effective policy + computed range for logging/response usage."""
    policy = await get_effective_policy(db, restaurant)
    if not policy["allow_owner_price_edit"]:
        raise HTTPException(
            status_code=403,
            detail="Price edits are disabled by admin. Contact admin to change prices.",
        )
    baseline = int(item.get("baseline_price") or item.get("price") or 0)
    if baseline <= 0:
        # No baseline recorded (legacy item) — set the current price as baseline
        # so future edits are bounded, but allow this change through.
        return {"policy": policy, "baseline_price": int(item.get("price") or new_price),
                "min_price": 0, "max_price": 0, "note": "baseline_initialized"}
    rng = compute_allowed_range(policy, baseline)
    if new_price > rng["max_price"] and policy["hike_max_percent"] >= 0:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Price hike blocked. Baseline ₹{baseline}, "
                f"max allowed ₹{rng['max_price']} ({policy['hike_max_percent']}% hike cap). "
                f"Contact admin to raise cap."
            ),
        )
    if new_price < rng["min_price"] and policy["drop_max_percent"] >= 0:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Price drop blocked. Baseline ₹{baseline}, "
                f"min allowed ₹{rng['min_price']} ({policy['drop_max_percent']}% drop cap)."
            ),
        )
    out = {"policy": policy, **rng}
    return out


# ---------------------------- Pydantic models -------------------------------
class PricePolicyBody(BaseModel):
    allow_owner_price_edit: Optional[bool] = None
    hike_max_percent: Optional[int] = Field(None, ge=0, le=500)
    drop_max_percent: Optional[int] = Field(None, ge=0, le=100)
    require_admin_approval_on_change: Optional[bool] = None


# ---------------------------- Router ----------------------------------------
def make_price_policy_router(db, require_role):
    router = APIRouter()

    @router.get("/admin/settings/price-policy")
    async def admin_get_global_price_policy(user: dict = Depends(require_role("admin"))):
        return await get_global_policy(db)

    @router.patch("/admin/settings/price-policy")
    async def admin_update_global_price_policy(
        body: PricePolicyBody,
        user: dict = Depends(require_role("admin")),
    ):
        current = await get_global_policy(db)
        patch = {k: v for k, v in body.dict().items() if v is not None}
        merged = _clean({**current, **patch})
        await db.settings.update_one(
            {"key": "price_policy"},
            {"$set": {"key": "price_policy", **merged}},
            upsert=True,
        )
        return merged

    @router.get("/admin/restaurants/{rid}/price-policy")
    async def admin_get_restaurant_policy(rid: str, user: dict = Depends(require_role("admin"))):
        rest = await db.restaurants.find_one({"id": rid}, {"_id": 0})
        if not rest:
            raise HTTPException(404, "Restaurant not found")
        override = rest.get("price_policy") or None
        effective = await get_effective_policy(db, rest)
        return {
            "restaurant_id": rid,
            "override": override,
            "effective": effective,
            "global": await get_global_policy(db),
        }

    @router.patch("/admin/restaurants/{rid}/price-policy")
    async def admin_update_restaurant_policy(
        rid: str,
        body: PricePolicyBody,
        user: dict = Depends(require_role("admin")),
    ):
        rest = await db.restaurants.find_one({"id": rid}, {"_id": 0})
        if not rest:
            raise HTTPException(404, "Restaurant not found")
        patch = {k: v for k, v in body.dict().items() if v is not None}
        if not patch:
            # Clear override
            await db.restaurants.update_one({"id": rid}, {"$unset": {"price_policy": ""}})
            rest.pop("price_policy", None)
        else:
            current = rest.get("price_policy") or {}
            merged = _clean({**current, **patch})
            await db.restaurants.update_one({"id": rid}, {"$set": {"price_policy": merged}})
            rest["price_policy"] = merged
        return {
            "restaurant_id": rid,
            "override": rest.get("price_policy") or None,
            "effective": await get_effective_policy(db, rest),
            "global": await get_global_policy(db),
        }

    @router.delete("/admin/restaurants/{rid}/price-policy")
    async def admin_delete_restaurant_policy(rid: str, user: dict = Depends(require_role("admin"))):
        rest = await db.restaurants.find_one({"id": rid}, {"_id": 0})
        if not rest:
            raise HTTPException(404, "Restaurant not found")
        await db.restaurants.update_one({"id": rid}, {"$unset": {"price_policy": ""}})
        rest.pop("price_policy", None)
        return {
            "restaurant_id": rid,
            "override": None,
            "effective": await get_effective_policy(db, rest),
            "global": await get_global_policy(db),
        }

    @router.get("/owner/menu/price-policy")
    async def owner_price_policy_snapshot(user: dict = Depends(require_role("restaurant_owner"))):
        """Owner-facing peek at the policy that governs their menu edits."""
        rest = await db.restaurants.find_one({"owner_id": user["id"]}, {"_id": 0})
        if not rest:
            raise HTTPException(404, "No restaurant assigned to you yet.")
        effective = await get_effective_policy(db, rest)
        return {
            "restaurant_id": rest["id"],
            "policy": effective,
        }

    return router
