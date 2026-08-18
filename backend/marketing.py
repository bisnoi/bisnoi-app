"""
Marketing module — WhatsApp campaigns funded by a per-restaurant prepaid wallet.

Owner side:
  GET  /marketing/overview          -> wallet + settings + customer count for a restaurant
  GET  /marketing/customers         -> unique customers (dine-in + delivery) with name/phone
  GET  /marketing/wallet            -> balance + transaction ledger
  GET  /marketing/campaigns         -> campaign history
  POST /marketing/campaigns         -> send a WhatsApp campaign (debits wallet per sent msg)

Admin side (charges are operated here):
  GET  /admin/marketing/settings            -> per-message rate + template config
  PUT  /admin/marketing/settings
  GET  /admin/marketing/wallets             -> every restaurant wallet + spend
  POST /admin/marketing/wallets/{rid}/credit-> manual credit / adjustment
  GET  /admin/marketing/usage               -> platform-wide usage + revenue

Wallet top-up itself reuses the existing Razorpay flow (purpose="wallet_topup").
"""
import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from wallet import get_wallet, credit_wallet, debit_wallet, wallet_txns
from whatsapp import send_whatsapp_marketing, wa_link

MAX_RECIPIENTS = 1000
DEFAULT_SETTINGS = {
    "per_message_rate": 0.85,      # INR charged per successfully-sent WhatsApp message
    "currency": "INR",
    "marketing_template": "",       # approved MARKETING template name (single {{1}} body param)
    "marketing_template_lang": "en",
    "enabled": True,
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CampaignReq(BaseModel):
    restaurant_id: Optional[str] = None
    message: str
    phones: Optional[List[str]] = None       # explicit recipient phones
    segment: Optional[str] = None            # "all" | "dinein" | "delivery" (used when phones empty)


class MkSettingsUpdate(BaseModel):
    per_message_rate: Optional[float] = None
    currency: Optional[str] = None
    marketing_template: Optional[str] = None
    marketing_template_lang: Optional[str] = None
    enabled: Optional[bool] = None


class WalletCreditReq(BaseModel):
    amount: float                            # +ve credits, -ve adjusts down
    note: Optional[str] = None


class CustomerRow(BaseModel):
    phone: str
    name: Optional[str] = None
    tag: Optional[bool] = False


class CustomerUploadReq(BaseModel):
    restaurant_id: Optional[str] = None
    customers: List[CustomerRow]
    replace: Optional[bool] = False          # if True, wipe uploaded list first


TEMPLATE_KINDS = ("marketing", "loyalty", "return_customer", "custom")
TEMPLATE_STATUSES = ("draft", "pending_approval", "approved", "rejected")

DEFAULT_TEMPLATES: List[Dict[str, Any]] = [
    # ---- MARKETING (offers / new-menu / festival) ----
    {"kind": "marketing", "name": "Weekend Special",
     "body": "Hi {name}! 🎉 This weekend only — get 20% OFF on all thalis at {restaurant}. Order online or visit us. Use code WKND20. Offer ends Sunday!"},
    {"kind": "marketing", "name": "Festival Offer",
     "body": "Hi {name}! Celebrate the festival with us at {restaurant} 🎊 Flat ₹100 OFF on orders above ₹499. Limited time — book your table or order now."},
    {"kind": "marketing", "name": "New Menu Launch",
     "body": "Hi {name}! We just launched a brand new menu at {restaurant} 🍛 Fresh dishes, new flavours. Come try it out — first 50 customers get a free dessert!"},
    # ---- LOYALTY (rewards for regulars) ----
    {"kind": "loyalty", "name": "Thank You Regular",
     "body": "Hi {name}! You're one of our favourite regulars at {restaurant} ❤️ As a thank you — enjoy a complimentary starter on your next visit. See you soon!"},
    {"kind": "loyalty", "name": "Loyalty Reward Unlocked",
     "body": "Hi {name}! You've unlocked our Loyalty Reward at {restaurant} 🏆 Show this message on your next visit for a free dessert. Valid for 30 days."},
    {"kind": "loyalty", "name": "VIP Early Access",
     "body": "Hi {name}! You've been upgraded to VIP status at {restaurant} ⭐ Get early access to new dishes, exclusive discounts and priority reservations. Thanks for your loyalty!"},
    # ---- RETURN CUSTOMER (win-back) ----
    {"kind": "return_customer", "name": "We Miss You",
     "body": "Hi {name}, we haven't seen you at {restaurant} in a while — we miss you! 🙁 Come back this week and enjoy 15% OFF your next order. We'd love to have you back."},
    {"kind": "return_customer", "name": "Come Back Discount",
     "body": "Hi {name}! It's been a while 🙏 Here's a special ₹150 OFF at {restaurant} — just for you. Valid on orders above ₹399. Redeem before Sunday."},
    {"kind": "return_customer", "name": "New Menu — Come Try",
     "body": "Hi {name}! We've refreshed our menu at {restaurant} 🍽️ Come rediscover us — flat 20% OFF on your comeback order. We'd love to have you back."},
]


class TemplateReq(BaseModel):
    restaurant_id: Optional[str] = None
    kind: str                          # marketing / loyalty / return_customer / custom
    name: str
    body: str
    submit_for_approval: Optional[bool] = True


class TemplatePatchReq(BaseModel):
    name: Optional[str] = None
    body: Optional[str] = None
    kind: Optional[str] = None
    status: Optional[str] = None      # admin can transition to approved / rejected
    reject_reason: Optional[str] = None


def _normalize_phone(p: str) -> str:
    """Strip non-digits, drop a leading 91 country code, keep the last 10 digits."""
    digits = "".join(ch for ch in (p or "") if ch.isdigit())
    if len(digits) > 10 and digits.startswith("91"):
        digits = digits[2:]
    return digits[-10:] if len(digits) >= 10 else digits


def make_marketing_router(db, get_current_user, require_role, deps: Dict[str, Any]) -> APIRouter:
    router = APIRouter()
    get_whatsapp_config = deps["get_whatsapp_config"]      # async (secret=bool) -> cfg
    create_notification = deps.get("create_notification")

    # ---------------------------------------------------------------- settings
    async def _settings() -> dict:
        doc = await db.settings.find_one({"key": "marketing_settings"}, {"_id": 0}) or {}
        out = dict(DEFAULT_SETTINGS)
        for k, v in doc.items():
            if k != "key" and v is not None:
                out[k] = v
        out["per_message_rate"] = round(float(out.get("per_message_rate", 0) or 0), 2)
        return out

    # ------------------------------------------------------------- restaurants
    async def _owner_restaurant(user: dict, restaurant_id: Optional[str] = None) -> dict:
        if restaurant_id:
            q = {"id": restaurant_id, "owner_id": user["id"]}
            rest = await db.restaurants.find_one(q, {"_id": 0})
            if not rest and user.get("role") == "admin":
                rest = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
            if not rest:
                raise HTTPException(404, "Restaurant not found for your account")
            return rest
        rest = await db.restaurants.find_one({"owner_id": user["id"]}, {"_id": 0})
        if not rest:
            raise HTTPException(404, "No restaurant found for your account")
        return rest

    async def _collect_customers(restaurant_id: str) -> List[dict]:
        """Unique customers (keyed by phone) gathered from delivery orders, POS bills,
        dine-in orders AND the owner-uploaded / manually added list. Each entry
        carries the sources it was seen in and whether it is tagged (favourite)."""
        seen: Dict[str, dict] = {}

        def _add(phone, name, source, when, tag=False):
            phone = (phone or "").strip()
            if not phone or len(phone) < 7:
                return
            rec = seen.get(phone)
            if not rec:
                rec = {"phone": phone, "name": name or "Customer", "sources": [source],
                       "orders": 1 if source != "uploaded" else 0, "last_order": when,
                       "uploaded": source == "uploaded", "tag": bool(tag)}
                seen[phone] = rec
            else:
                if source != "uploaded":
                    rec["orders"] += 1
                if source not in rec["sources"]:
                    rec["sources"].append(source)
                if name and (not rec.get("name") or rec["name"] == "Customer"):
                    rec["name"] = name
                if when and (not rec.get("last_order") or when > rec["last_order"]):
                    rec["last_order"] = when
                if source == "uploaded":
                    rec["uploaded"] = True
                if tag:
                    rec["tag"] = True

        async for o in db.orders.find(
            {"restaurant_id": restaurant_id, "customer_phone": {"$nin": [None, ""]}},
            {"_id": 0, "customer_name": 1, "customer_phone": 1, "placed_at": 1},
        ):
            _add(o.get("customer_phone"), o.get("customer_name"), "delivery", o.get("placed_at"))

        async for p in db.pos_orders.find(
            {"restaurant_id": restaurant_id, "customer_phone": {"$nin": [None, ""]}},
            {"_id": 0, "customer_name": 1, "customer_phone": 1, "order_type": 1, "created_at": 1},
        ):
            src = "dinein" if p.get("order_type") == "dine_in" else (p.get("order_type") or "pos")
            _add(p.get("customer_phone"), p.get("customer_name"), src, p.get("created_at"))

        async for d in db.dinein_orders.find(
            {"restaurant_id": restaurant_id, "customer_phone": {"$nin": [None, ""]}},
            {"_id": 0, "customer_name": 1, "customer_phone": 1, "created_at": 1},
        ):
            _add(d.get("customer_phone"), d.get("customer_name"), "dinein", d.get("created_at"))

        async for m in db.owner_customers.find(
            {"restaurant_id": restaurant_id, "phone": {"$nin": [None, ""]}},
            {"_id": 0, "name": 1, "phone": 1, "created_at": 1, "tag": 1},
        ):
            _add(m.get("phone"), m.get("name"), "uploaded", m.get("created_at"), tag=bool(m.get("tag")))

        return sorted(seen.values(), key=lambda c: c.get("last_order") or "", reverse=True)

    # ================================================================ OWNER API
    @router.get("/marketing/overview")
    async def marketing_overview(restaurant_id: Optional[str] = None,
                                 user: dict = Depends(require_role("restaurant_owner", "admin"))):
        rest = await _owner_restaurant(user, restaurant_id)
        wallet = await get_wallet(db, rest["id"])
        settings = await _settings()
        wa = await get_whatsapp_config(secret=False)
        customers = await _collect_customers(rest["id"])
        dinein = sum(1 for c in customers if "dinein" in c["sources"])
        configured = bool(wa.get("configured")) and bool(settings.get("marketing_template"))
        return {
            "restaurant": {"id": rest["id"], "name": rest.get("name")},
            "wallet": {"balance": wallet["balance"], "currency": settings["currency"]},
            "rate": settings["per_message_rate"],
            "currency": settings["currency"],
            "whatsapp_configured": configured,
            "customer_count": len(customers),
            "dinein_count": dinein,
        }

    @router.get("/marketing/customers")
    async def marketing_customers(restaurant_id: Optional[str] = None,
                                  segment: Optional[str] = None,
                                  q: Optional[str] = None,
                                  user: dict = Depends(require_role("restaurant_owner", "admin"))):
        rest = await _owner_restaurant(user, restaurant_id)
        customers = await _collect_customers(rest["id"])
        if segment and segment != "all":
            if segment == "uploaded":
                customers = [c for c in customers if c.get("uploaded")]
            else:
                customers = [c for c in customers if segment in c["sources"]]
        if q:
            ql = q.lower()
            customers = [c for c in customers if ql in (c["name"] or "").lower() or ql in c["phone"]]
        return {
            "restaurant_id": rest["id"],
            "restaurant_name": rest.get("name"),
            "count": len(customers),
            "customers": customers,
        }

    # ---- Owner customer directory (upload / template / delete) -----------
    from fastapi import Response

    @router.get("/owner/customers/template")
    async def customers_template(_: dict = Depends(require_role("restaurant_owner", "admin"))):
        """Download a CSV template that owners can fill and upload."""
        rows = [
            "name,phone",
            "Ravi Kumar,9111100001",
            "Ananya Sharma,9111100002",
            "Priya Iyer,9111100003",
        ]
        csv = "\n".join(rows) + "\n"
        return Response(
            content=csv,
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="bisnoi_customers_template.csv"'},
        )

    @router.post("/owner/customers/upload")
    async def customers_upload(body: CustomerUploadReq,
                               user: dict = Depends(require_role("restaurant_owner", "admin"))):
        rest = await _owner_restaurant(user, body.restaurant_id)
        rid = rest["id"]
        if body.replace:
            await db.owner_customers.delete_many({"restaurant_id": rid})
        added, skipped, updated = 0, 0, 0
        seen_now = set()
        for row in (body.customers or []):
            phone = _normalize_phone(row.phone)
            if len(phone) < 10:
                skipped += 1
                continue
            if phone in seen_now:
                continue
            seen_now.add(phone)
            name = (row.name or "").strip() or "Customer"
            now = _now_iso()
            res = await db.owner_customers.update_one(
                {"restaurant_id": rid, "phone": phone},
                {"$setOnInsert": {
                    "id": str(uuid.uuid4()),
                    "restaurant_id": rid,
                    "phone": phone,
                    "created_at": now,
                    "created_by": user["id"],
                },
                "$set": {
                    "name": name,
                    "tag": bool(row.tag),
                    "updated_at": now,
                }},
                upsert=True,
            )
            if res.upserted_id is not None:
                added += 1
            else:
                updated += 1
        total = await db.owner_customers.count_documents({"restaurant_id": rid})
        return {"added": added, "updated": updated, "skipped": skipped, "total": total}

    @router.delete("/owner/customers/{phone}")
    async def customers_delete(phone: str,
                               restaurant_id: Optional[str] = None,
                               user: dict = Depends(require_role("restaurant_owner", "admin"))):
        rest = await _owner_restaurant(user, restaurant_id)
        phone = _normalize_phone(phone)
        res = await db.owner_customers.delete_one({"restaurant_id": rest["id"], "phone": phone})
        if res.deleted_count == 0:
            raise HTTPException(404, "Customer not in your uploaded list (dine-in/delivery customers can't be removed)")
        return {"ok": True, "phone": phone}

    # ---- Marketing template library (pre-approved + owner-submitted) ------
    async def _ensure_platform_templates():
        """Seed the platform-approved marketing / loyalty / return-customer
        templates on first access. Idempotent."""
        existing = await db.marketing_templates.count_documents({"is_platform": True})
        if existing >= len(DEFAULT_TEMPLATES):
            return
        now = _now_iso()
        for t in DEFAULT_TEMPLATES:
            await db.marketing_templates.update_one(
                {"is_platform": True, "kind": t["kind"], "name": t["name"]},
                {"$setOnInsert": {
                    "id": str(uuid.uuid4()),
                    "is_platform": True,
                    "restaurant_id": None,
                    "owner_id": None,
                    "kind": t["kind"],
                    "name": t["name"],
                    "body": t["body"],
                    "status": "approved",
                    "created_at": now,
                    "updated_at": now,
                    "approved_at": now,
                    "approved_by": "system",
                }},
                upsert=True,
            )

    def _clean_template(doc: dict) -> dict:
        doc = dict(doc)
        doc.pop("_id", None)
        return doc

    @router.get("/marketing/templates")
    async def owner_templates(restaurant_id: Optional[str] = None,
                              kind: Optional[str] = None,
                              user: dict = Depends(require_role("restaurant_owner", "admin"))):
        """Owner-visible template list: platform-approved templates + this
        restaurant's own templates (approved / pending / rejected).
        """
        await _ensure_platform_templates()
        rest = await _owner_restaurant(user, restaurant_id)
        q: Dict[str, Any] = {"$or": [
            {"is_platform": True, "status": "approved"},
            {"restaurant_id": rest["id"]},
        ]}
        if kind and kind in TEMPLATE_KINDS:
            q["kind"] = kind
        docs = await db.marketing_templates.find(q, {"_id": 0}).sort([
            ("is_platform", -1),
            ("kind", 1),
            ("created_at", -1),
        ]).to_list(500)
        return {"templates": docs}

    @router.post("/marketing/templates")
    async def owner_submit_template(body: TemplateReq,
                                    user: dict = Depends(require_role("restaurant_owner", "admin"))):
        rest = await _owner_restaurant(user, body.restaurant_id)
        kind = (body.kind or "custom").strip().lower()
        if kind not in TEMPLATE_KINDS:
            raise HTTPException(400, f"Invalid kind. Must be one of: {TEMPLATE_KINDS}")
        name = (body.name or "").strip()
        text = (body.body or "").strip()
        if len(name) < 2: raise HTTPException(400, "Template name is too short")
        if len(text) < 5: raise HTTPException(400, "Template body is too short")
        now = _now_iso()
        doc = {
            "id": str(uuid.uuid4()),
            "is_platform": False,
            "restaurant_id": rest["id"],
            "owner_id": user["id"],
            "kind": kind,
            "name": name,
            "body": text,
            "status": "pending_approval" if body.submit_for_approval else "draft",
            "created_at": now,
            "updated_at": now,
        }
        await db.marketing_templates.insert_one(dict(doc))
        return _clean_template(doc)

    @router.delete("/marketing/templates/{tid}")
    async def owner_delete_template(tid: str,
                                    user: dict = Depends(require_role("restaurant_owner", "admin"))):
        doc = await db.marketing_templates.find_one({"id": tid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Template not found")
        if doc.get("is_platform") and user.get("role") != "admin":
            raise HTTPException(403, "Platform templates can only be removed by admin")
        if not doc.get("is_platform") and doc.get("owner_id") != user["id"] and user.get("role") != "admin":
            raise HTTPException(403, "You can only delete your own templates")
        await db.marketing_templates.delete_one({"id": tid})
        return {"ok": True, "id": tid}


    @router.get("/marketing/wallet")
    async def marketing_wallet(restaurant_id: Optional[str] = None,
                               user: dict = Depends(require_role("restaurant_owner", "admin"))):
        rest = await _owner_restaurant(user, restaurant_id)
        wallet = await get_wallet(db, rest["id"])
        settings = await _settings()
        txns = await wallet_txns(db, rest["id"], 60)
        return {
            "restaurant_id": rest["id"],
            "balance": wallet["balance"],
            "currency": settings["currency"],
            "rate": settings["per_message_rate"],
            "total_credited": round(float(wallet.get("total_credited", 0)), 2),
            "total_spent": round(float(wallet.get("total_spent", 0)), 2),
            "messages_sent": int(wallet.get("messages_sent", 0)),
            "transactions": txns,
        }

    @router.get("/marketing/campaigns")
    async def marketing_campaign_history(restaurant_id: Optional[str] = None,
                                         user: dict = Depends(require_role("restaurant_owner", "admin"))):
        rest = await _owner_restaurant(user, restaurant_id)
        items = await db.marketing_campaigns.find(
            {"restaurant_id": rest["id"]}, {"_id": 0, "results": 0}
        ).sort("created_at", -1).to_list(50)
        return {"campaigns": items}

    @router.post("/marketing/campaigns")
    async def send_campaign(body: CampaignReq,
                            user: dict = Depends(require_role("restaurant_owner", "admin"))):
        rest = await _owner_restaurant(user, body.restaurant_id)
        rid = rest["id"]
        message = (body.message or "").strip()
        if len(message) < 3:
            raise HTTPException(400, "Message is too short")

        # Resolve recipients (explicit selection wins; else a segment of known customers)
        all_customers = await _collect_customers(rid)
        name_map = {c["phone"]: c["name"] for c in all_customers}
        if body.phones:
            recipients = [p.strip() for p in body.phones if p and p.strip()]
        else:
            seg = body.segment or "all"
            pool = all_customers if seg == "all" else [c for c in all_customers if seg in c["sources"]]
            recipients = [c["phone"] for c in pool]
        recipients = list(dict.fromkeys(recipients))  # de-dup, keep order
        if not recipients:
            raise HTTPException(400, "No recipients selected")
        if len(recipients) > MAX_RECIPIENTS:
            raise HTTPException(400, f"Too many recipients (max {MAX_RECIPIENTS} per campaign)")

        settings = await _settings()
        rate = float(settings["per_message_rate"])
        template = settings.get("marketing_template") or ""
        lang = settings.get("marketing_template_lang") or "en"
        wa_cfg = await get_whatsapp_config(secret=True)

        wallet = await get_wallet(db, rid)
        balance = wallet["balance"]

        # Cap the send to what the wallet can afford (only when a rate is charged).
        if rate > 0:
            affordable = int(balance // rate)
            if affordable <= 0:
                raise HTTPException(402, "Insufficient wallet balance. Please top up to run this campaign.")
        else:
            affordable = len(recipients)
        to_send = recipients[:affordable]
        skipped = recipients[affordable:]

        campaign_id = str(uuid.uuid4())

        async def _one(ph):
            res = await send_whatsapp_marketing(ph, message, wa_cfg, template, lang,
                                                customer_name=name_map.get(ph))
            return {
                "phone": ph,
                "sent": bool(res.get("sent")),
                "channel": res.get("channel"),
                "error": res.get("error"),
                "error_code": res.get("error_code"),
                "wa_link": res.get("wa_link"),
            }

        results = await asyncio.gather(*[_one(p) for p in to_send]) if to_send else []
        results = list(results)
        for ph in skipped:
            results.append({"phone": ph, "sent": False, "channel": "skipped",
                            "error": "Skipped — insufficient balance", "wa_link": wa_link(ph, message)})

        sent = sum(1 for r in results if r["sent"])
        failed = len(results) - sent
        cost = round(sent * rate, 2)

        new_balance = balance
        if cost > 0:
            try:
                new_balance = await debit_wallet(db, rid, cost, "campaign",
                                                 ref=campaign_id, by=user["id"], messages=sent)
            except ValueError:
                # Shouldn't happen (we capped by affordable) — record without debit.
                new_balance = (await get_wallet(db, rid))["balance"]

        configured = bool(wa_cfg.get("access_token") and wa_cfg.get("phone_number_id") and template)
        campaign = {
            "id": campaign_id,
            "restaurant_id": rid,
            "restaurant_name": rest.get("name"),
            "message": message,
            "segment": body.segment or ("custom" if body.phones else "all"),
            "recipients": len(recipients),
            "sent": sent,
            "failed": failed,
            "cost": cost,
            "rate": rate,
            "configured": configured,
            "created_by": user["id"],
            "created_at": _now_iso(),
            "results": results,
        }
        await db.marketing_campaigns.insert_one(dict(campaign))

        return {
            "campaign_id": campaign_id,
            "recipients": len(recipients),
            "sent": sent,
            "failed": failed,
            "cost": cost,
            "currency": settings["currency"],
            "balance": new_balance,
            "configured": configured,
            "results": results,
        }

    # ================================================================ ADMIN API
    @router.get("/admin/marketing/settings")
    async def admin_get_settings(_: dict = Depends(require_role("admin"))):
        s = await _settings()
        wa = await get_whatsapp_config(secret=False)
        s["whatsapp_configured"] = bool(wa.get("configured"))
        return s

    @router.put("/admin/marketing/settings")
    async def admin_update_settings(body: MkSettingsUpdate, user: dict = Depends(require_role("admin"))):
        upd = {"key": "marketing_settings", "updated_at": _now_iso(), "updated_by": user["id"]}
        if body.per_message_rate is not None:
            if body.per_message_rate < 0:
                raise HTTPException(400, "Rate cannot be negative")
            upd["per_message_rate"] = round(float(body.per_message_rate), 2)
        if body.currency is not None:
            upd["currency"] = body.currency.strip() or "INR"
        if body.marketing_template is not None:
            upd["marketing_template"] = body.marketing_template.strip()
        if body.marketing_template_lang is not None:
            upd["marketing_template_lang"] = body.marketing_template_lang.strip() or "en"
        if body.enabled is not None:
            upd["enabled"] = bool(body.enabled)
        await db.settings.update_one({"key": "marketing_settings"}, {"$set": upd}, upsert=True)
        return await _settings()

    @router.get("/admin/marketing/wallets")
    async def admin_wallets(_: dict = Depends(require_role("admin"))):
        wallets = await db.wallets.find({}, {"_id": 0}).sort("total_spent", -1).to_list(1000)
        # Attach restaurant + owner names.
        rest_ids = [w["restaurant_id"] for w in wallets]
        rests = {r["id"]: r async for r in db.restaurants.find({"id": {"$in": rest_ids}},
                                                               {"_id": 0, "id": 1, "name": 1, "owner_id": 1})}
        owner_ids = list({r.get("owner_id") for r in rests.values() if r.get("owner_id")})
        owners = {u["id"]: u async for u in db.users.find({"id": {"$in": owner_ids}},
                                                          {"_id": 0, "id": 1, "name": 1, "phone": 1})}
        out = []
        for w in wallets:
            r = rests.get(w["restaurant_id"], {})
            o = owners.get(r.get("owner_id"), {})
            out.append({
                "restaurant_id": w["restaurant_id"],
                "restaurant_name": r.get("name") or "—",
                "owner_name": o.get("name"),
                "owner_phone": o.get("phone"),
                "balance": round(float(w.get("balance", 0)), 2),
                "total_credited": round(float(w.get("total_credited", 0)), 2),
                "total_spent": round(float(w.get("total_spent", 0)), 2),
                "messages_sent": int(w.get("messages_sent", 0)),
            })
        return {"wallets": out}

    @router.post("/admin/marketing/wallets/{restaurant_id}/credit")
    async def admin_credit_wallet(restaurant_id: str, body: WalletCreditReq,
                                  user: dict = Depends(require_role("admin"))):
        rest = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0, "id": 1, "name": 1, "owner_id": 1})
        if not rest:
            raise HTTPException(404, "Restaurant not found")
        amount = round(float(body.amount), 2)
        if amount == 0:
            raise HTTPException(400, "Amount cannot be zero")
        reason = "topup_admin" if amount > 0 else "admin_adjust"
        note = (body.note or "").strip()
        if amount > 0:
            balance = await credit_wallet(db, restaurant_id, amount, reason,
                                          ref=f"admin_{uuid.uuid4().hex[:10]}", by=user["id"])
        else:
            try:
                balance = await debit_wallet(db, restaurant_id, abs(amount), reason,
                                             ref=f"admin_{uuid.uuid4().hex[:10]}", by=user["id"])
            except ValueError as e:
                raise HTTPException(400, str(e))
        if create_notification and rest.get("owner_id") and amount > 0:
            try:
                await create_notification(
                    rest["owner_id"], "wallet_credit", "Marketing wallet credited",
                    f"\u20B9{amount:.2f} added to your marketing wallet by admin.",
                    restaurant_id=restaurant_id,
                )
            except Exception:
                pass
        return {"restaurant_id": restaurant_id, "balance": balance}

    @router.get("/admin/marketing/usage")
    async def admin_usage(_: dict = Depends(require_role("admin"))):
        campaigns = await db.marketing_campaigns.find({}, {"_id": 0, "results": 0}) \
            .sort("created_at", -1).to_list(200)
        total_sent = sum(int(c.get("sent", 0)) for c in campaigns)
        total_revenue = round(sum(float(c.get("cost", 0)) for c in campaigns), 2)
        settings = await _settings()
        wallets = await db.wallets.find({}, {"_id": 0}).to_list(1000)
        wallet_balance_total = round(sum(float(w.get("balance", 0)) for w in wallets), 2)
        return {
            "total_campaigns": len(campaigns),
            "total_messages_sent": total_sent,
            "total_revenue": total_revenue,
            "wallet_balance_total": wallet_balance_total,
            "currency": settings["currency"],
            "rate": settings["per_message_rate"],
            "recent_campaigns": campaigns[:30],
        }

    # ---- Admin template library management --------------------------------
    @router.get("/admin/marketing/templates")
    async def admin_list_templates(status: Optional[str] = None,
                                   kind: Optional[str] = None,
                                   _: dict = Depends(require_role("admin"))):
        await _ensure_platform_templates()
        q: Dict[str, Any] = {}
        if status: q["status"] = status
        if kind:   q["kind"]   = kind
        docs = await db.marketing_templates.find(q, {"_id": 0}).sort([
            ("status", 1),
            ("is_platform", -1),
            ("created_at", -1),
        ]).to_list(1000)
        # Attach owner + restaurant names for the pending-approval queue
        rid_ids  = list({d["restaurant_id"] for d in docs if d.get("restaurant_id")})
        own_ids  = list({d["owner_id"] for d in docs if d.get("owner_id")})
        rests = {r["id"]: r async for r in db.restaurants.find({"id": {"$in": rid_ids}}, {"_id": 0, "id": 1, "name": 1})} if rid_ids else {}
        owners = {u["id"]: u async for u in db.users.find({"id": {"$in": own_ids}}, {"_id": 0, "id": 1, "name": 1, "phone": 1})} if own_ids else {}
        for d in docs:
            d["restaurant_name"] = rests.get(d.get("restaurant_id"), {}).get("name")
            o = owners.get(d.get("owner_id"), {})
            d["owner_name"] = o.get("name")
            d["owner_phone"] = o.get("phone")
        return {"templates": docs}

    @router.post("/admin/marketing/templates")
    async def admin_create_template(body: TemplateReq,
                                    user: dict = Depends(require_role("admin"))):
        kind = (body.kind or "custom").strip().lower()
        if kind not in TEMPLATE_KINDS:
            raise HTTPException(400, f"Invalid kind. Must be one of: {TEMPLATE_KINDS}")
        name = (body.name or "").strip()
        text = (body.body or "").strip()
        if len(name) < 2: raise HTTPException(400, "Template name is too short")
        if len(text) < 5: raise HTTPException(400, "Template body is too short")
        now = _now_iso()
        doc = {
            "id": str(uuid.uuid4()),
            "is_platform": True,
            "restaurant_id": None,
            "owner_id": None,
            "kind": kind,
            "name": name,
            "body": text,
            "status": "approved",
            "created_at": now,
            "updated_at": now,
            "approved_at": now,
            "approved_by": user["id"],
        }
        await db.marketing_templates.insert_one(dict(doc))
        return _clean_template(doc)

    @router.patch("/admin/marketing/templates/{tid}")
    async def admin_update_template(tid: str, body: TemplatePatchReq,
                                    user: dict = Depends(require_role("admin"))):
        doc = await db.marketing_templates.find_one({"id": tid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Template not found")
        upd: Dict[str, Any] = {"updated_at": _now_iso()}
        if body.name is not None:
            n = body.name.strip()
            if len(n) < 2: raise HTTPException(400, "Template name is too short")
            upd["name"] = n
        if body.body is not None:
            t = body.body.strip()
            if len(t) < 5: raise HTTPException(400, "Template body is too short")
            upd["body"] = t
        if body.kind is not None:
            k = body.kind.strip().lower()
            if k not in TEMPLATE_KINDS:
                raise HTTPException(400, f"Invalid kind. Must be one of: {TEMPLATE_KINDS}")
            upd["kind"] = k
        if body.status is not None:
            s = body.status.strip().lower()
            if s not in TEMPLATE_STATUSES:
                raise HTTPException(400, f"Invalid status. Must be one of: {TEMPLATE_STATUSES}")
            upd["status"] = s
            if s == "approved":
                upd["approved_at"] = _now_iso()
                upd["approved_by"] = user["id"]
                upd["reject_reason"] = None
            elif s == "rejected":
                upd["reject_reason"] = (body.reject_reason or "").strip() or "Not approved"
        await db.marketing_templates.update_one({"id": tid}, {"$set": upd})
        new_doc = await db.marketing_templates.find_one({"id": tid}, {"_id": 0})
        # Notify owner on approve / reject transitions
        if body.status in ("approved", "rejected") and new_doc and new_doc.get("owner_id") and create_notification:
            try:
                pretty = "approved" if body.status == "approved" else "rejected"
                await create_notification(
                    new_doc["owner_id"],
                    "marketing_template",
                    f"Marketing template {pretty}",
                    f"Your template '{new_doc.get('name')}' was {pretty} by admin." + (f"\nReason: {new_doc.get('reject_reason')}" if body.status == "rejected" and new_doc.get("reject_reason") else ""),
                    restaurant_id=new_doc.get("restaurant_id"),
                )
            except Exception:
                pass
        return new_doc

    @router.delete("/admin/marketing/templates/{tid}")
    async def admin_delete_template(tid: str,
                                    _: dict = Depends(require_role("admin"))):
        res = await db.marketing_templates.delete_one({"id": tid})
        if res.deleted_count == 0:
            raise HTTPException(404, "Template not found")
        return {"ok": True, "id": tid}

    return router
