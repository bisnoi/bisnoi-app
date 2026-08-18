"""
Platform extensions for Bisnoi:
  - Admin-configurable PLATFORM CONFIG (commission %, per-km rates, onboarding fee, delivery charge mode)
  - Pricing helpers (haversine distance, delivery fee, rider payout, commission split)
  - Commission LEDGER (admin revenue per order / dine-in / onboarding fee)
  - Razorpay LIVE payments (create-order + signature verify + webhook) for:
        customer_order | dinein_bill | onboarding_fee
  - Customer DINE-IN flow (scan table QR -> order -> KOT to kitchen -> pay online / at counter)

Design: NO dependency on server.py (avoids circular import). Pure helpers + a router
factory that receives db, auth deps, and a small dict of server helper callables (`srv`).
"""
from __future__ import annotations

import os
import math
import uuid
import re
import hmac
import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from dotenv import load_dotenv

from wallet import credit_wallet

log = logging.getLogger("platform_ext")

# Ensure env is loaded even if this module is imported before server.py runs load_dotenv.
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# --------------------------------------------------------------------------------------
# Razorpay client (LIVE keys from backend env only — never exposed to client except key_id)
# --------------------------------------------------------------------------------------
def _env(name: str) -> str:
    return (os.environ.get(name) or "").strip()


RAZORPAY_WEBHOOK_SECRET = _env("RAZORPAY_WEBHOOK_SECRET")

_rzp_client = None
_rzp_inited = False


def _get_rzp_client():
    """Lazily build the Razorpay client so env vars are read at call time (post load_dotenv)."""
    global _rzp_client, _rzp_inited
    if _rzp_inited:
        return _rzp_client
    _rzp_inited = True
    kid, ksec = _env("RAZORPAY_KEY_ID"), _env("RAZORPAY_KEY_SECRET")
    try:
        if kid and ksec:
            import razorpay  # noqa
            _rzp_client = razorpay.Client(auth=(kid, ksec))
    except Exception as e:  # pragma: no cover
        log.warning("Razorpay client init failed: %s", e)
        _rzp_client = None
    return _rzp_client


def razorpay_key_id() -> str:
    return _env("RAZORPAY_KEY_ID")


def razorpay_enabled() -> bool:
    return _get_rzp_client() is not None


# --------------------------------------------------------------------------------------
# Platform config (single source of truth in settings collection: key = "platform_config")
# --------------------------------------------------------------------------------------
DEFAULT_PLATFORM: Dict[str, Any] = {
    # ---- Customer delivery charge ----
    "delivery_mode": "per_km",       # "flat" | "per_km"
    "delivery_charge": 29,           # flat-mode fee (also legacy key)
    "per_km_charge": 8,              # ₹/km the customer pays (per_km mode)
    "base_delivery_fee": 15,         # fixed base added in per_km mode
    "min_delivery_fee": 20,          # floor for delivery fee
    "free_delivery_above": 0,        # subtotal >= this => free delivery (0 disables)
    "packing_charge": 0,             # flat ₹ packing per order
    "gst_percent": 0.0,              # GST % on (subtotal - discount)
    # ---- Commission (admin revenue) ----
    "owner_commission_percent": 15.0,  # % of order subtotal charged to the restaurant owner
    "rider_commission_percent": 0.0,   # % cut from the rider payout kept by admin
    # ---- Rider payout (admin PAYS rider) ----
    "rider_payout_per_km": 7,        # ₹/km paid to rider
    "rider_base_payout": 15,         # fixed base per delivery
    "rider_min_payout": 25,          # floor per delivery
    # ---- Owner onboarding ----
    "onboarding_fee": 1999,          # one-time joining fee (₹). 0 disables the fee gate.
}

_INT_KEYS = {
    "delivery_charge", "per_km_charge", "base_delivery_fee", "min_delivery_fee",
    "free_delivery_above", "packing_charge", "rider_payout_per_km",
    "rider_base_payout", "rider_min_payout", "onboarding_fee",
}
_FLOAT_KEYS = {"gst_percent", "owner_commission_percent", "rider_commission_percent"}
_STR_KEYS = {"delivery_mode"}


def _coerce(key: str, val: Any) -> Any:
    try:
        if key in _STR_KEYS:
            v = str(val).strip().lower()
            return v if v in ("flat", "per_km") else DEFAULT_PLATFORM[key]
        if key in _FLOAT_KEYS:
            f = float(val)
            return max(0.0, round(f, 2))
        if key in _INT_KEYS:
            return max(0, int(round(float(val))))
    except Exception:
        return DEFAULT_PLATFORM.get(key)
    return DEFAULT_PLATFORM.get(key)


async def get_platform_config(db) -> Dict[str, Any]:
    """Merge: DEFAULT <- legacy app_charges <- platform_config (authoritative)."""
    cfg = dict(DEFAULT_PLATFORM)
    try:
        legacy = await db.settings.find_one({"key": "app_charges"}, {"_id": 0}) or {}
    except Exception:
        legacy = {}
    for k in ("delivery_charge", "free_delivery_above", "packing_charge", "gst_percent"):
        if isinstance(legacy.get(k), (int, float)) and legacy[k] >= 0:
            cfg[k] = _coerce(k, legacy[k])
    try:
        doc = await db.settings.find_one({"key": "platform_config"}, {"_id": 0}) or {}
    except Exception:
        doc = {}
    for k in DEFAULT_PLATFORM:
        if k in doc and doc[k] is not None:
            cfg[k] = _coerce(k, doc[k])
    return cfg


async def save_platform_config(db, patch: Dict[str, Any], updated_by: str) -> Dict[str, Any]:
    cur = await get_platform_config(db)
    update: Dict[str, Any] = {}
    for k, v in (patch or {}).items():
        if k in DEFAULT_PLATFORM and v is not None:
            update[k] = _coerce(k, v)
    cur.update(update)
    cur["key"] = "platform_config"
    cur["updated_at"] = datetime.now(timezone.utc).isoformat()
    cur["updated_by"] = updated_by
    await db.settings.update_one({"key": "platform_config"}, {"$set": cur}, upsert=True)
    cur.pop("key", None)
    return cur


# --------------------------------------------------------------------------------------
# Pricing math (pure)
# --------------------------------------------------------------------------------------
def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def compute_distance_km(rest: dict, address: dict) -> float:
    try:
        rl, rg = float(rest.get("lat")), float(rest.get("lng"))
        al, ag = float(address.get("lat")), float(address.get("lng"))
        d = haversine_km(rl, rg, al, ag)
        if not math.isfinite(d):
            return 0.0
        return round(max(0.0, d), 2)
    except Exception:
        return 0.0


def compute_delivery_fee(subtotal: float, distance_km: float, cfg: dict) -> int:
    if subtotal <= 0:
        return 0
    fa = cfg.get("free_delivery_above", 0)
    if fa and subtotal >= fa:
        return 0
    if cfg.get("delivery_mode") == "per_km":
        fee = cfg["base_delivery_fee"] + cfg["per_km_charge"] * max(0.0, distance_km)
        fee = max(fee, cfg["min_delivery_fee"])
        return int(round(fee))
    return int(round(cfg["delivery_charge"]))


def compute_rider_payout(distance_km: float, cfg: dict) -> int:
    payout = cfg["rider_base_payout"] + cfg["rider_payout_per_km"] * max(0.0, distance_km)
    payout = max(payout, cfg["rider_min_payout"])
    return int(round(payout))


def compute_commission(subtotal: float, rider_payout: float, cfg: dict) -> Dict[str, float]:
    owner_commission = int(round(subtotal * cfg["owner_commission_percent"] / 100.0))
    rider_commission = int(round(rider_payout * cfg["rider_commission_percent"] / 100.0))
    admin_earnings = owner_commission + rider_commission
    return {
        "owner_commission": owner_commission,
        "owner_commission_percent": cfg["owner_commission_percent"],
        "owner_net": int(round(subtotal)) - owner_commission,
        "rider_commission": rider_commission,
        "rider_commission_percent": cfg["rider_commission_percent"],
        "rider_payout_gross": int(round(rider_payout)),
        "rider_payout_net": int(round(rider_payout)) - rider_commission,
        "admin_earnings": admin_earnings,
    }


async def create_ledger_entry(db, *, entry_type: str, restaurant_id: Optional[str], owner_id: Optional[str],
                              rider_id: Optional[str], gross: float, breakdown: Dict[str, Any],
                              ref_id: str, restaurant_name: Optional[str] = None) -> dict:
    """Idempotent per (entry_type, ref_id)."""
    existing = await db.ledger.find_one({"entry_type": entry_type, "ref_id": ref_id}, {"_id": 0})
    if existing:
        return existing
    doc = {
        "id": str(uuid.uuid4()),
        "entry_type": entry_type,           # delivery_order | dinein_order | onboarding_fee
        "ref_id": ref_id,
        "restaurant_id": restaurant_id,
        "restaurant_name": restaurant_name,
        "owner_id": owner_id,
        "rider_id": rider_id,
        "gross": int(round(gross)),
        "owner_commission": int(round(breakdown.get("owner_commission", 0))),
        "rider_commission": int(round(breakdown.get("rider_commission", 0))),
        "rider_payout_gross": int(round(breakdown.get("rider_payout_gross", 0))),
        "rider_payout_net": int(round(breakdown.get("rider_payout_net", 0))),
        "admin_earnings": int(round(breakdown.get("admin_earnings", 0))),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.ledger.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


# --------------------------------------------------------------------------------------
# Request schemas
# --------------------------------------------------------------------------------------
class PlatformPatch(BaseModel):
    delivery_mode: Optional[str] = None
    delivery_charge: Optional[float] = None
    per_km_charge: Optional[float] = None
    base_delivery_fee: Optional[float] = None
    min_delivery_fee: Optional[float] = None
    free_delivery_above: Optional[float] = None
    packing_charge: Optional[float] = None
    gst_percent: Optional[float] = None
    owner_commission_percent: Optional[float] = None
    rider_commission_percent: Optional[float] = None
    rider_payout_per_km: Optional[float] = None
    rider_base_payout: Optional[float] = None
    rider_min_payout: Optional[float] = None
    onboarding_fee: Optional[float] = None


class CreatePaymentReq(BaseModel):
    purpose: Literal["customer_order", "dinein_bill", "onboarding_fee", "wallet_topup"]
    order_id: Optional[str] = None          # for customer_order
    dinein_order_id: Optional[str] = None   # for dinein_bill
    restaurant_id: Optional[str] = None     # for wallet_topup
    amount: Optional[float] = None          # for wallet_topup (INR rupees)


class VerifyPaymentReq(BaseModel):
    payment_id: str                         # our internal payments doc id
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


from fastapi import Header


class DineinItemIn(BaseModel):
    menu_item_id: str
    quantity: int


class DineinOrderReq(BaseModel):
    restaurant_id: str
    table_id: Optional[str] = None          # legacy: exact table id (QR flow)
    table_number: Optional[int] = None      # new: customer-entered table number
    table_label: Optional[str] = None       # optional free-text table label
    items: List[DineinItemIn]
    note: Optional[str] = None


# --------------------------------------------------------------------------------------
# Router factory
# --------------------------------------------------------------------------------------
def make_platform_router(db, get_current_user, require_role, srv: Dict[str, Any]) -> APIRouter:
    """
    srv keys required:
      enrich_items(items)                 -> async, returns enriched item dicts
      create_notification(uid, ...)       -> async
      now_iso()                           -> str
      next_seq(key)                       -> async int
    """
    router = APIRouter()

    enrich_items = srv["enrich_items"]
    create_notification = srv["create_notification"]
    now_iso = srv["now_iso"]
    next_seq = srv["next_seq"]
    make_dinein_token = srv["make_dinein_token"]
    decode_dinein_token = srv["decode_dinein_token"]

    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    # ---------------- Public settings ----------------
    @router.get("/settings/payment")
    async def get_payment_settings():
        return {"provider": "razorpay", "key_id": razorpay_key_id(), "enabled": razorpay_enabled()}

    @router.get("/settings/platform-public")
    async def platform_public():
        cfg = await get_platform_config(db)
        # non-sensitive subset for display (customers/owners/riders)
        return {
            "delivery_mode": cfg["delivery_mode"],
            "delivery_charge": cfg["delivery_charge"],
            "per_km_charge": cfg["per_km_charge"],
            "base_delivery_fee": cfg["base_delivery_fee"],
            "min_delivery_fee": cfg["min_delivery_fee"],
            "free_delivery_above": cfg["free_delivery_above"],
            "packing_charge": cfg["packing_charge"],
            "gst_percent": cfg["gst_percent"],
            "rider_payout_per_km": cfg["rider_payout_per_km"],
            "rider_base_payout": cfg["rider_base_payout"],
            "rider_min_payout": cfg["rider_min_payout"],
            "onboarding_fee": cfg["onboarding_fee"],
        }

    # ---------------- Admin settings ----------------
    @router.get("/admin/settings/platform")
    async def admin_get_platform(_: dict = Depends(require_role("admin"))):
        return await get_platform_config(db)

    @router.patch("/admin/settings/platform")
    async def admin_patch_platform(body: PlatformPatch, user: dict = Depends(require_role("admin"))):
        patch = {k: v for k, v in body.model_dump().items() if v is not None}
        if body.delivery_mode is not None and str(body.delivery_mode).lower() not in ("flat", "per_km"):
            raise HTTPException(400, "delivery_mode must be 'flat' or 'per_km'")
        for k in ("owner_commission_percent", "rider_commission_percent"):
            if k in patch and (patch[k] < 0 or patch[k] > 100):
                raise HTTPException(400, f"{k} must be between 0 and 100")
        return await save_platform_config(db, patch, user["id"])

    # ---------------- Admin ledger / commission reporting ----------------
    @router.get("/admin/ledger")
    async def admin_ledger(limit: int = 500, _: dict = Depends(require_role("admin"))):
        cur = db.ledger.find({}, {"_id": 0}).sort("created_at", -1).limit(int(limit))
        return await cur.to_list(length=int(limit))

    @router.get("/admin/commission-summary")
    async def admin_commission_summary(_: dict = Depends(require_role("admin"))):
        rows = await db.ledger.find({}, {"_id": 0}).to_list(length=10000)
        out = {
            "admin_earnings": 0, "owner_commission": 0, "rider_commission": 0,
            "onboarding_fees": 0, "rider_payouts": 0, "gross": 0,
            "order_count": 0, "dinein_count": 0, "onboarding_count": 0,
        }
        for r in rows:
            out["admin_earnings"] += r.get("admin_earnings", 0)
            out["owner_commission"] += r.get("owner_commission", 0)
            out["rider_commission"] += r.get("rider_commission", 0)
            out["rider_payouts"] += r.get("rider_payout_net", 0)
            out["gross"] += r.get("gross", 0)
            et = r.get("entry_type")
            if et == "delivery_order":
                out["order_count"] += 1
            elif et == "dinein_order":
                out["dinein_count"] += 1
            elif et == "onboarding_fee":
                out["onboarding_count"] += 1
                out["onboarding_fees"] += r.get("admin_earnings", 0)
        return out

    # ---------------- Payments ----------------
    async def _amount_for_purpose(body: CreatePaymentReq, user: dict):
        cfg = await get_platform_config(db)
        if body.purpose == "customer_order":
            if not body.order_id:
                raise HTTPException(400, "order_id required")
            o = await db.orders.find_one({"id": body.order_id}, {"_id": 0})
            if not o:
                raise HTTPException(404, "Order not found")
            if o["customer_id"] != user["id"]:
                raise HTTPException(403, "Not your order")
            return int(round(o["total"])) * 100, o["id"], {"restaurant_id": o.get("restaurant_id")}
        if body.purpose == "dinein_bill":
            if not body.dinein_order_id:
                raise HTTPException(400, "dinein_order_id required")
            d = await db.dinein_orders.find_one({"id": body.dinein_order_id}, {"_id": 0})
            if not d:
                raise HTTPException(404, "Dine-in order not found")
            if d["customer_id"] != user["id"]:
                raise HTTPException(403, "Not your order")
            return int(round(d["total"])) * 100, d["id"], {"restaurant_id": d.get("restaurant_id")}
        if body.purpose == "onboarding_fee":
            fee = cfg.get("onboarding_fee", 0)
            if fee <= 0:
                raise HTTPException(400, "Onboarding fee is not enabled")
            rest = await db.restaurants.find_one({"owner_id": user["id"]}, {"_id": 0})
            if not rest:
                raise HTTPException(404, "No restaurant found for your account")
            return int(round(fee)) * 100, rest["id"], {"restaurant_id": rest["id"]}
        if body.purpose == "wallet_topup":
            amount = float(body.amount or 0)
            if amount < 1:
                raise HTTPException(400, "Minimum top-up amount is \u20B91")
            if amount > 100000:
                raise HTTPException(400, "Maximum top-up amount is \u20B91,00,000")
            # The restaurant must belong to the requesting owner.
            q = {"id": body.restaurant_id, "owner_id": user["id"]} if body.restaurant_id else {"owner_id": user["id"]}
            rest = await db.restaurants.find_one(q, {"_id": 0})
            if not rest:
                raise HTTPException(404, "No restaurant found for your account")
            return int(round(amount * 100)), rest["id"], {"restaurant_id": rest["id"], "topup_amount": round(amount, 2)}
        raise HTTPException(400, "Invalid purpose")

    @router.post("/payments/create-order")
    async def create_payment_order(body: CreatePaymentReq, user: dict = Depends(get_current_user)):
        if not razorpay_enabled():
            raise HTTPException(503, "Payment gateway not configured")
        amount_paise, ref_id, meta = await _amount_for_purpose(body, user)
        if amount_paise <= 0:
            raise HTTPException(400, "Nothing to pay")
        pay_id = str(uuid.uuid4())
        receipt = f"{body.purpose[:12]}_{pay_id[:8]}"[:40]
        try:
            rzp_order = _get_rzp_client().order.create({
                "amount": amount_paise,
                "currency": "INR",
                "payment_capture": 1,
                "receipt": receipt,
                "notes": {"purpose": body.purpose, "ref_id": ref_id, "user_id": user["id"]},
            })
        except Exception as e:
            log.exception("razorpay order create failed")
            raise HTTPException(502, f"Could not start payment: {str(e)[:180]}")
        doc = {
            "id": pay_id,
            "purpose": body.purpose,
            "ref_id": ref_id,
            "user_id": user["id"],
            "amount": amount_paise,
            "currency": "INR",
            "status": "created",
            "razorpay_order_id": rzp_order["id"],
            "razorpay_payment_id": None,
            "meta": meta,
            "created_at": _now(),
        }
        await db.payments.insert_one(dict(doc))
        return {
            "payment_id": pay_id,
            "razorpay_order_id": rzp_order["id"],
            "amount": amount_paise,
            "currency": "INR",
            "key_id": razorpay_key_id(),
            "purpose": body.purpose,
            "prefill": {"name": user.get("name") or "", "contact": user.get("phone") or ""},
        }

    async def _apply_payment_side_effects(pay: dict):
        purpose = pay["purpose"]
        ref_id = pay["ref_id"]
        cfg = await get_platform_config(db)
        if purpose == "customer_order":
            o = await db.orders.find_one({"id": ref_id}, {"_id": 0})
            if not o:
                return
            if o.get("payment_status") != "paid":
                await db.orders.update_one({"id": ref_id}, {"$set": {"payment_status": "paid", "awaiting_payment": False}})
                rest = await db.restaurants.find_one({"id": o.get("restaurant_id")}, {"_id": 0}) or {}
                await create_ledger_entry(
                    db, entry_type="delivery_order", restaurant_id=o.get("restaurant_id"),
                    owner_id=rest.get("owner_id"), rider_id=o.get("rider_id"),
                    gross=o.get("subtotal", 0),
                    breakdown={
                        "owner_commission": o.get("owner_commission", 0),
                        "rider_commission": o.get("rider_commission", 0),
                        "rider_payout_gross": o.get("rider_payout", 0),
                        "rider_payout_net": o.get("rider_payout_net", o.get("rider_payout", 0)),
                        "admin_earnings": o.get("admin_earnings", 0),
                    },
                    ref_id=ref_id, restaurant_name=o.get("restaurant_name"),
                )
                await create_notification(
                    rest.get("owner_id"), "new_order", "New paid order received",
                    f"{o.get('customer_name') or 'A customer'} paid online \u2022 \u20B9{o.get('total')}",
                    order_id=o["id"], restaurant_id=o.get("restaurant_id"),
                )
        elif purpose == "dinein_bill":
            d = await db.dinein_orders.find_one({"id": ref_id}, {"_id": 0})
            if not d:
                return
            if d.get("payment_status") != "paid":
                await db.dinein_orders.update_one(
                    {"id": ref_id}, {"$set": {"payment_status": "paid", "payment_method": "razorpay"}}
                )
                rest = await db.restaurants.find_one({"id": d.get("restaurant_id")}, {"_id": 0}) or {}
                bd = compute_commission(d.get("subtotal", 0), 0, cfg)
                await create_ledger_entry(
                    db, entry_type="dinein_order", restaurant_id=d.get("restaurant_id"),
                    owner_id=rest.get("owner_id"), rider_id=None,
                    gross=d.get("subtotal", 0), breakdown=bd, ref_id=ref_id,
                    restaurant_name=d.get("restaurant_name"),
                )
        elif purpose == "onboarding_fee":
            rest = await db.restaurants.find_one({"id": ref_id}, {"_id": 0})
            if not rest:
                return
            if not rest.get("onboarding_paid"):
                await db.restaurants.update_one(
                    {"id": ref_id},
                    {"$set": {"onboarding_paid": True, "is_active": True, "status": "active",
                              "onboarding_paid_at": _now()}},
                )
                fee = cfg.get("onboarding_fee", 0)
                await create_ledger_entry(
                    db, entry_type="onboarding_fee", restaurant_id=ref_id,
                    owner_id=rest.get("owner_id"), rider_id=None, gross=fee,
                    breakdown={"admin_earnings": int(round(fee))}, ref_id=pay["id"],
                    restaurant_name=rest.get("name"),
                )
                await create_notification(
                    rest.get("owner_id"), "onboarding_paid", "Onboarding fee paid",
                    f"Your restaurant '{rest.get('name')}' is now live on Bisnoi!",
                    restaurant_id=ref_id,
                )
        elif purpose == "wallet_topup":
            # Credit the restaurant marketing wallet exactly once (dedupe by payment id).
            amount = float((pay.get("meta") or {}).get("topup_amount") or (pay.get("amount", 0) / 100.0))
            if amount > 0:
                try:
                    await credit_wallet(db, ref_id, amount, "topup_razorpay", ref=pay["id"], by=pay.get("user_id"))
                except Exception:
                    log.exception("wallet top-up credit failed for payment %s", pay.get("id"))
                rest = await db.restaurants.find_one({"id": ref_id}, {"_id": 0}) or {}
                if rest.get("owner_id"):
                    await create_notification(
                        rest.get("owner_id"), "wallet_credit", "Marketing wallet topped up",
                        f"\u20B9{amount:.2f} added to your marketing wallet.",
                        restaurant_id=ref_id,
                    )

    @router.post("/payments/verify")
    async def verify_payment(body: VerifyPaymentReq, user: dict = Depends(get_current_user)):
        if not razorpay_enabled():
            raise HTTPException(503, "Payment gateway not configured")
        pay = await db.payments.find_one({"id": body.payment_id}, {"_id": 0})
        if not pay:
            raise HTTPException(404, "Payment not found")
        if pay["user_id"] != user["id"]:
            raise HTTPException(403, "Forbidden")
        if pay.get("razorpay_order_id") != body.razorpay_order_id:
            raise HTTPException(400, "Order id mismatch")
        try:
            _get_rzp_client().utility.verify_payment_signature({
                "razorpay_order_id": body.razorpay_order_id,
                "razorpay_payment_id": body.razorpay_payment_id,
                "razorpay_signature": body.razorpay_signature,
            })
        except Exception:
            await db.payments.update_one({"id": body.payment_id}, {"$set": {"status": "failed"}})
            raise HTTPException(400, "Payment verification failed")
        await db.payments.update_one(
            {"id": body.payment_id},
            {"$set": {"status": "paid", "razorpay_payment_id": body.razorpay_payment_id, "paid_at": _now()}},
        )
        pay["status"] = "paid"
        await _apply_payment_side_effects(pay)
        return {"ok": True, "purpose": pay["purpose"], "ref_id": pay["ref_id"]}

    @router.post("/payments/webhook")
    async def razorpay_webhook(request: Request):
        raw = await request.body()
        sig = request.headers.get("X-Razorpay-Signature", "")
        if RAZORPAY_WEBHOOK_SECRET:
            try:
                expected = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
                if not hmac.compare_digest(expected, sig):
                    raise HTTPException(400, "Invalid webhook signature")
            except HTTPException:
                raise
            except Exception:
                raise HTTPException(400, "Invalid webhook")
        try:
            import json
            payload = json.loads(raw.decode())
            entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
            rzp_order_id = entity.get("order_id")
            rzp_payment_id = entity.get("id")
            if rzp_order_id:
                pay = await db.payments.find_one({"razorpay_order_id": rzp_order_id}, {"_id": 0})
                if pay and pay.get("status") != "paid":
                    await db.payments.update_one(
                        {"id": pay["id"]},
                        {"$set": {"status": "paid", "razorpay_payment_id": rzp_payment_id, "paid_at": _now()}},
                    )
                    pay["status"] = "paid"
                    await _apply_payment_side_effects(pay)
        except Exception:
            log.exception("webhook processing error")
        return {"status": "ok"}

    # ---------------- Dine-in (customer) ----------------
    @router.get("/dinein/context")
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
        }

    async def _get_running_session(rest_id: str, t: dict, user: dict):
        s = await db.table_sessions.find_one(
            {"table_id": t["id"], "status": "running"}, {"_id": 0}
        )
        if not s:
            s = {
                "id": str(uuid.uuid4()),
                "restaurant_id": rest_id,
                "owner_id": None,
                "table_id": t["id"],
                "table_label": t["label"],
                "status": "running",
                "kots": [],
                "draft_items": [],
                "opened_at": now_iso(),
                "settled_at": None,
                "bill_id": None,
                "channel": "customer_dinein",
                "customer_name": user.get("name"),
                "customer_phone": user.get("phone"),
            }
            await db.table_sessions.insert_one(dict(s))
        return s

    # NOTE: raw table_number / auto-create fallback removed on purpose.
    # Customer dine-in orders are now resolved ONLY from a verified
    # X-Dinein-Token (issued by /dinein/context after QR-token check).

    @router.post("/dinein/order")
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
            raise HTTPException(400, "Add at least one item")

        # reuse server's item enrichment (validates + prices from menu)
        from types import SimpleNamespace
        raw_items = [SimpleNamespace(menu_item_id=i.menu_item_id, quantity=i.quantity) for i in body.items]
        enriched = await enrich_items(raw_items)
        if not enriched:
            raise HTTPException(400, "No valid items")
        subtotal = int(sum(i["price"] * i["quantity"] for i in enriched))
        cfg = await get_platform_config(db)
        gst_percent = float(cfg.get("gst_percent", 0))
        gst_amount = int(round(subtotal * gst_percent / 100.0))
        total = subtotal + gst_amount

        # push a KOT onto the table session so the kitchen KDS shows it immediately
        s = await _get_running_session(body.restaurant_id, t, user)
        kot_items = [
            {"menu_item_id": i["menu_item_id"], "name": i["name"], "price": i["price"],
             "qty": i["quantity"], "veg": i.get("veg")}
            for i in enriched
        ]
        seq = await next_seq(f"kot:{rest['id']}")
        kot = {
            "id": str(uuid.uuid4()),
            "kot_number": f"KOT-{seq:05d}",
            "items": kot_items,
            "status": "sent",
            "created_at": now_iso(),
            "ready_at": None,
            "source": "customer_dinein",
        }
        await db.table_sessions.update_one({"id": s["id"]}, {"$push": {"kots": kot}})

        oid = str(uuid.uuid4())
        order = {
            "id": oid,
            "restaurant_id": rest["id"],
            "restaurant_name": rest.get("name"),
            "table_id": t["id"],
            "table_label": t["label"],
            "session_id": s["id"],
            "customer_id": user["id"],
            "customer_name": user.get("name"),
            "customer_phone": user.get("phone"),
            "items": [{"menu_item_id": i["menu_item_id"], "name": i["name"], "price": i["price"],
                       "quantity": i["quantity"], "image": i.get("image", "")} for i in enriched],
            "subtotal": subtotal,
            "gst_percent": gst_percent,
            "gst_amount": gst_amount,
            "total": total,
            "status": "placed",
            "payment_status": "pay_at_counter",
            "payment_method": "counter",
            "kot_number": kot["kot_number"],
            "note": body.note,
            "created_at": now_iso(),
        }
        await db.dinein_orders.insert_one(dict(order))
        await create_notification(
            rest.get("owner_id"), "new_dinein", "New dine-in order",
            f"{t['label']} \u2022 {len(enriched)} item(s) \u2022 \u20B9{total} \u2022 sent to kitchen",
            restaurant_id=rest["id"],
        )
        return order

    @router.get("/dinein/order/{oid}")
    async def get_dinein_order(oid: str, user: dict = Depends(get_current_user)):
        d = await db.dinein_orders.find_one({"id": oid}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Not found")
        if d["customer_id"] != user["id"] and user["role"] not in ("admin", "restaurant_owner"):
            raise HTTPException(403, "Forbidden")
        return d

    @router.get("/dinein/mine")
    async def my_dinein_orders(user: dict = Depends(get_current_user)):
        cur = db.dinein_orders.find({"customer_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(50)
        return await cur.to_list(length=50)

    @router.post("/dinein/order/{oid}/pay-counter")
    async def dinein_pay_counter(oid: str, user: dict = Depends(get_current_user)):
        d = await db.dinein_orders.find_one({"id": oid}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Not found")
        if d["customer_id"] != user["id"]:
            raise HTTPException(403, "Forbidden")
        await db.dinein_orders.update_one(
            {"id": oid}, {"$set": {"payment_method": "counter", "payment_status": "pay_at_counter"}}
        )
        d["payment_method"] = "counter"
        d["payment_status"] = "pay_at_counter"
        return d

    # ---------------- Owner: incoming dine-in orders ----------------
    @router.get("/owner/dinein/orders")
    async def owner_dinein_orders(
        status: Optional[str] = None,
        limit: int = 100,
        user: dict = Depends(require_role("restaurant_owner")),
    ):
        rest_ids = [
            r["id"] async for r in db.restaurants.find({"owner_id": user["id"]}, {"id": 1, "_id": 0})
        ]
        if not rest_ids:
            return []
        q: Dict[str, Any] = {"restaurant_id": {"$in": rest_ids}}
        if status:
            q["status"] = status
        cur = db.dinein_orders.find(q, {"_id": 0}).sort("created_at", -1).limit(min(limit, 200))
        return await cur.to_list(length=min(limit, 200))

    @router.post("/owner/dinein/orders/{oid}/accept")
    async def owner_accept_dinein_order(oid: str, user: dict = Depends(require_role("restaurant_owner"))):
        d = await db.dinein_orders.find_one({"id": oid}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Not found")
        rest = await db.restaurants.find_one({"id": d["restaurant_id"], "owner_id": user["id"]}, {"_id": 0})
        if not rest:
            raise HTTPException(403, "Forbidden")
        await db.dinein_orders.update_one({"id": oid}, {"$set": {"status": "accepted"}})
        d["status"] = "accepted"
        return d

    return router
