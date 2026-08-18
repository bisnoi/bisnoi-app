"""
Feature router for Desi Bhojan: Offers, Complaints, Finance, Outlet info.

Included into the main /api router from server.py via make_features_router(db, get_current_user, require_role).
- Offers: ADMIN creates a master catalog; OWNER applies/removes offers to their restaurant.
          Applied offers actually discount the customer's cart at checkout (handled in server.create_order).
- Complaints: customer raises (optionally tied to an order); owner/admin/rider view relevant ones,
              reply in a thread and update status (open -> in_progress -> resolved).
- Finance: computed from REAL delivered orders + POS bills. Platform commission 20% on restaurant
           sales, rider earns a flat fee per delivered order, GST 5% on sales; weekly payout cycle.
- Outlet: owner updates their restaurant's outlet information (image, contact, timings, smart link...).
"""
from datetime import datetime, timezone, timedelta, date
from typing import Optional, List, Literal
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from account_ids import _account_id_for_rest


# ---- Finance model constants (fallback defaults; live values come from platform config) ----
COMMISSION_RATE = 0.20      # platform commission on restaurant sales (fallback)
RIDER_FEE_PER_ORDER = 40    # flat rider earning per delivered order (fallback)
GST_RATE = 0.05             # 5% GST


async def _live_rates(db):
    """Read admin-configured commission % from platform config (fallback to constants)."""
    try:
        from platform_ext import get_platform_config
        cfg = await get_platform_config(db)
        return {
            "commission_rate": float(cfg.get("owner_commission_percent", 20)) / 100.0,
            "gst_rate": float(cfg.get("gst_percent", 0)) / 100.0,
            "rider_fee": float(cfg.get("rider_base_payout", RIDER_FEE_PER_ORDER)),
        }
    except Exception:
        return {"commission_rate": COMMISSION_RATE, "gst_rate": GST_RATE, "rider_fee": RIDER_FEE_PER_ORDER}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _r2(x) -> float:
    return round(float(x or 0) + 1e-9, 2)


def _week_monday(dstr: str) -> date:
    d = date.fromisoformat((dstr or _now())[:10])
    return d - timedelta(days=d.weekday())


def _week_label(monday: date) -> str:
    sunday = monday + timedelta(days=6)
    return f"{monday.strftime('%d %b')} - {sunday.strftime('%d %b %Y')}"


def make_features_router(db, get_current_user, require_role):
    router = APIRouter()

    # =====================================================================
    # OFFERS
    # =====================================================================
    class OfferIn(BaseModel):
        title: str
        code: Optional[str] = None
        type: Literal["percent", "flat"] = "percent"
        value: float
        max_discount: Optional[float] = None
        min_order: float = 0
        description: Optional[str] = None
        active: bool = True

    class OfferUpdate(BaseModel):
        title: Optional[str] = None
        code: Optional[str] = None
        type: Optional[Literal["percent", "flat"]] = None
        value: Optional[float] = None
        max_discount: Optional[float] = None
        min_order: Optional[float] = None
        description: Optional[str] = None
        active: Optional[bool] = None

    @router.get("/admin/offers")
    async def admin_offers(user: dict = Depends(require_role("admin"))):
        return await db.offers.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)

    @router.post("/admin/offers")
    async def admin_create_offer(body: OfferIn, user: dict = Depends(require_role("admin"))):
        code = (body.code or "").strip().upper() or f"OFFER{uuid.uuid4().hex[:5].upper()}"
        doc = {
            "id": str(uuid.uuid4()),
            "title": body.title,
            "code": code,
            "type": body.type,
            "value": body.value,
            "max_discount": body.max_discount,
            "min_order": body.min_order,
            "description": body.description,
            "active": body.active,
            "created_at": _now(),
        }
        await db.offers.insert_one(dict(doc))
        return doc

    @router.patch("/admin/offers/{oid}")
    async def admin_update_offer(oid: str, body: OfferUpdate, user: dict = Depends(require_role("admin"))):
        upd = {k: v for k, v in body.dict().items() if v is not None}
        if "code" in upd:
            upd["code"] = upd["code"].strip().upper()
        if not upd:
            raise HTTPException(400, "No fields to update")
        res = await db.offers.update_one({"id": oid}, {"$set": upd})
        if res.matched_count == 0:
            raise HTTPException(404, "Offer not found")
        return await db.offers.find_one({"id": oid}, {"_id": 0})

    @router.delete("/admin/offers/{oid}")
    async def admin_delete_offer(oid: str, user: dict = Depends(require_role("admin"))):
        await db.offers.delete_one({"id": oid})
        # Remove from any restaurant that applied it
        await db.restaurants.update_many({"offer_ids": oid}, {"$pull": {"offer_ids": oid}})
        return {"ok": True}

    @router.get("/owner/offers")
    async def owner_offers(user: dict = Depends(require_role("restaurant_owner"))):
        rest = await db.restaurants.find_one({"owner_id": user["id"]}, {"_id": 0})
        applied = set((rest or {}).get("offer_ids") or [])
        offers = await db.offers.find({"active": True}, {"_id": 0}).sort("created_at", -1).to_list(500)
        for o in offers:
            o["applied"] = o["id"] in applied
        return {"restaurant_id": rest["id"] if rest else None, "offers": offers, "applied_count": len(applied)}

    @router.post("/owner/offers/{oid}/apply")
    async def owner_apply_offer(oid: str, user: dict = Depends(require_role("restaurant_owner"))):
        rest = await db.restaurants.find_one({"owner_id": user["id"]}, {"_id": 0})
        if not rest:
            raise HTTPException(404, "No restaurant found for your account")
        offer = await db.offers.find_one({"id": oid, "active": True}, {"_id": 0})
        if not offer:
            raise HTTPException(404, "Offer not found")
        # Restriction: a restaurant can run only ONE offer at a time.
        current = [x for x in (rest.get("offer_ids") or []) if x != oid]
        if current:
            raise HTTPException(
                400,
                "You can run only one offer at a time. Remove your active offer before applying a new one.",
            )
        # Set (not add) so exactly one offer is ever applied.
        await db.restaurants.update_one({"id": rest["id"]}, {"$set": {"offer_ids": [oid]}})
        # Reflect the offer text as the restaurant badge
        await db.restaurants.update_one({"id": rest["id"]}, {"$set": {"offer_text": offer.get("title")}})
        return {"ok": True, "applied": True}

    @router.post("/owner/offers/{oid}/remove")
    async def owner_remove_offer(oid: str, user: dict = Depends(require_role("restaurant_owner"))):
        rest = await db.restaurants.find_one({"owner_id": user["id"]}, {"_id": 0})
        if not rest:
            raise HTTPException(404, "No restaurant found for your account")
        await db.restaurants.update_one({"id": rest["id"]}, {"$pull": {"offer_ids": oid}})
        # Recompute badge text from remaining applied offers
        fresh = await db.restaurants.find_one({"id": rest["id"]}, {"_id": 0})
        remaining = fresh.get("offer_ids") or []
        badge = None
        if remaining:
            o = await db.offers.find_one({"id": remaining[0]}, {"_id": 0})
            badge = o.get("title") if o else None
        await db.restaurants.update_one({"id": rest["id"]}, {"$set": {"offer_text": badge}})
        return {"ok": True, "applied": False}

    # =====================================================================
    # COMPLAINTS
    # =====================================================================
    class ComplaintIn(BaseModel):
        order_id: Optional[str] = None
        restaurant_id: Optional[str] = None
        subject: str
        message: str

    class ReplyIn(BaseModel):
        message: str

    class StatusIn(BaseModel):
        status: Literal["open", "in_progress", "resolved"]

    async def _owner_rest_ids(uid: str) -> List[str]:
        rests = await db.restaurants.find({"owner_id": uid}, {"_id": 0, "id": 1}).to_list(50)
        return [r["id"] for r in rests]

    @router.post("/complaints")
    async def create_complaint(body: ComplaintIn, user: dict = Depends(require_role("customer"))):
        restaurant_id = body.restaurant_id
        restaurant_name = None
        rider_id = None
        order_no = None
        if body.order_id:
            order = await db.orders.find_one({"id": body.order_id, "customer_id": user["id"]}, {"_id": 0})
            if not order:
                raise HTTPException(404, "Order not found")
            restaurant_id = order.get("restaurant_id")
            restaurant_name = order.get("restaurant_name")
            rider_id = order.get("rider_id")
            order_no = order["id"][:8].upper()
        if restaurant_id and not restaurant_name:
            r = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0, "name": 1})
            restaurant_name = r.get("name") if r else None
        doc = {
            "id": str(uuid.uuid4()),
            "order_id": body.order_id,
            "order_no": order_no,
            "restaurant_id": restaurant_id,
            "restaurant_name": restaurant_name,
            "rider_id": rider_id,
            "customer_id": user["id"],
            "customer_name": user.get("name"),
            "customer_phone": user.get("phone"),
            "subject": body.subject,
            "message": body.message,
            "status": "open",
            "replies": [],
            "created_at": _now(),
            "updated_at": _now(),
        }
        await db.complaints.insert_one(dict(doc))
        return doc

    @router.get("/complaints/mine")
    async def my_complaints(user: dict = Depends(require_role("customer"))):
        return await db.complaints.find({"customer_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)

    @router.get("/owner/complaints")
    async def owner_complaints(user: dict = Depends(require_role("restaurant_owner"))):
        rids = await _owner_rest_ids(user["id"])
        if not rids:
            return []
        return await db.complaints.find({"restaurant_id": {"$in": rids}}, {"_id": 0}).sort("created_at", -1).to_list(1000)

    @router.get("/admin/complaints")
    async def admin_complaints(user: dict = Depends(require_role("admin"))):
        return await db.complaints.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)

    @router.get("/rider/complaints")
    async def rider_complaints(user: dict = Depends(require_role("rider"))):
        return await db.complaints.find({"rider_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)

    async def _can_access_complaint(c: dict, user: dict) -> bool:
        role = user["role"]
        if role == "admin":
            return True
        if role == "customer":
            return c.get("customer_id") == user["id"]
        if role == "rider":
            return c.get("rider_id") == user["id"]
        if role == "restaurant_owner":
            return c.get("restaurant_id") in await _owner_rest_ids(user["id"])
        return False

    @router.post("/complaints/{cid}/reply")
    async def reply_complaint(cid: str, body: ReplyIn, user: dict = Depends(get_current_user)):
        c = await db.complaints.find_one({"id": cid}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Complaint not found")
        if not await _can_access_complaint(c, user):
            raise HTTPException(403, "Not allowed")
        reply = {
            "id": str(uuid.uuid4()),
            "by_role": user["role"],
            "by_name": user.get("name") or user["role"].title(),
            "message": body.message,
            "at": _now(),
        }
        new_status = c.get("status")
        if user["role"] in ("restaurant_owner", "admin", "rider") and new_status == "open":
            new_status = "in_progress"
        await db.complaints.update_one({"id": cid}, {"$push": {"replies": reply}, "$set": {"updated_at": _now(), "status": new_status}})
        return await db.complaints.find_one({"id": cid}, {"_id": 0})

    @router.patch("/complaints/{cid}/status")
    async def set_complaint_status(cid: str, body: StatusIn, user: dict = Depends(get_current_user)):
        if user["role"] not in ("restaurant_owner", "admin", "rider"):
            raise HTTPException(403, "Not allowed")
        c = await db.complaints.find_one({"id": cid}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Complaint not found")
        if not await _can_access_complaint(c, user):
            raise HTTPException(403, "Not allowed")
        await db.complaints.update_one({"id": cid}, {"$set": {"status": body.status, "updated_at": _now()}})
        return await db.complaints.find_one({"id": cid}, {"_id": 0})

    # =====================================================================
    # FINANCE  (computed from real delivered orders + POS bills)
    # =====================================================================
    def _payout_from_weeks(records, current_monday):
        """records: list of {date, sales, count}. Returns (history[], next_payout)."""
        buckets = {}
        for rec in records:
            m = _week_monday(rec["date"])
            b = buckets.setdefault(m, {"sales": 0.0, "count": 0})
            b["sales"] += rec.get("sales", 0)
            b["count"] += rec.get("count", 0)
        weeks = []
        for m in sorted(buckets.keys(), reverse=True):
            weeks.append((m, buckets[m]))
        return weeks

    async def _restaurant_sales_records(rids):
        """Sales records (date, sales, count) from delivered orders + POS for given restaurants."""
        records = []
        if not rids:
            return records
        orders = await db.orders.find({"restaurant_id": {"$in": rids}, "status": "delivered"}, {"_id": 0}).to_list(5000)
        for o in orders:
            records.append({"date": o.get("placed_at", _now()), "sales": float(o.get("subtotal", 0)), "count": 1})
        pos = await db.pos_orders.find({"restaurant_id": {"$in": rids}}, {"_id": 0}).to_list(5000)
        for p in pos:
            records.append({"date": p.get("created_at", _now()), "sales": float(p.get("subtotal", 0)), "count": 1})
        return records

    @router.get("/owner/finance")
    async def owner_finance(user: dict = Depends(require_role("restaurant_owner"))):
        rids = await _owner_rest_ids(user["id"])
        records = await _restaurant_sales_records(rids)
        current_monday = _week_monday(_now())
        weeks = _payout_from_weeks(records, current_monday)

        rates = await _live_rates(db)
        commission_rate = rates["commission_rate"]
        gst_rate = rates["gst_rate"]
        gross = _r2(sum(r["sales"] for r in records))
        commission = _r2(gross * commission_rate)
        gst = _r2(gross * gst_rate)
        net = _r2(gross - commission)

        history = []
        next_payout = {"amount": 0.0, "date": (current_monday + timedelta(days=7)).isoformat(), "period": _week_label(current_monday), "orders": 0}
        invoices = []
        inv_n = len(weeks)
        for (m, b) in weeks:
            w_gross = _r2(b["sales"])
            w_comm = _r2(w_gross * commission_rate)
            w_gst = _r2(w_gross * gst_rate)
            w_net = _r2(w_gross - w_comm)
            pay_date = (m + timedelta(days=7)).isoformat()
            if m >= current_monday:
                next_payout = {"amount": w_net, "date": pay_date, "period": _week_label(m), "orders": b["count"]}
            else:
                history.append({"period": _week_label(m), "gross": w_gross, "commission": w_comm, "net": w_net, "orders": b["count"], "date": pay_date, "status": "paid"})
            invoices.append({"invoice_no": f"INV-{inv_n:04d}", "period": _week_label(m), "gross": w_gross, "commission": w_comm, "gst": w_gst, "net": w_net, "date": m.isoformat()})
            inv_n -= 1

        return {
            "currency": "INR",
            "commission_rate": commission_rate,
            "gst_rate": gst_rate,
            "summary": {
                "gross_sales": gross,
                "commission": commission,
                "gst": gst,
                "net_earnings": net,
                "total_orders": sum(r["count"] for r in records),
            },
            "next_payout": next_payout,
            "payout_history": history,
            "invoices": invoices,
        }

    @router.get("/rider/finance")
    async def rider_finance(user: dict = Depends(require_role("rider"))):
        orders = await db.orders.find({"rider_id": user["id"], "status": "delivered"}, {"_id": 0}).to_list(5000)
        rates = await _live_rates(db)
        default_fee = rates["rider_fee"]
        # Per-km payout: use the payout snapshotted on each order; fall back to base fee.
        def _fee(o):
            return float(o.get("rider_payout_net", o.get("rider_payout", default_fee)) or default_fee)
        records = [{"date": o.get("placed_at", _now()), "sales": _fee(o), "count": 1} for o in orders]
        current_monday = _week_monday(_now())
        weeks = _payout_from_weeks(records, current_monday)

        total_deliveries = len(orders)
        total_earnings = _r2(sum(_fee(o) for o in orders))
        avg_per = _r2(total_earnings / total_deliveries) if total_deliveries else 0.0

        history = []
        next_payout = {"amount": 0.0, "date": (current_monday + timedelta(days=7)).isoformat(), "period": _week_label(current_monday), "deliveries": 0}
        for (m, b) in weeks:
            amt = _r2(b["sales"])
            pay_date = (m + timedelta(days=7)).isoformat()
            if m >= current_monday:
                next_payout = {"amount": amt, "date": pay_date, "period": _week_label(m), "deliveries": b["count"]}
            else:
                history.append({"period": _week_label(m), "deliveries": b["count"], "amount": amt, "date": pay_date, "status": "paid"})

        return {
            "currency": "INR",
            "fee_per_order": default_fee,
            "summary": {
                "total_deliveries": total_deliveries,
                "total_earnings": total_earnings,
                "avg_per_delivery": avg_per,
            },
            "next_payout": next_payout,
            "payout_history": history,
        }

    @router.get("/admin/finance")
    async def admin_finance(user: dict = Depends(require_role("admin"))):
        orders = await db.orders.find({"status": "delivered"}, {"_id": 0}).to_list(10000)
        pos = await db.pos_orders.find({}, {"_id": 0}).to_list(10000)
        records = [{"date": o.get("placed_at", _now()), "sales": float(o.get("subtotal", 0)), "count": 1} for o in orders]
        records += [{"date": p.get("created_at", _now()), "sales": float(p.get("subtotal", 0)), "count": 1} for p in pos]

        rates = await _live_rates(db)
        commission_rate = rates["commission_rate"]
        gross = _r2(sum(r["sales"] for r in records))
        commission_earned = _r2(gross * commission_rate)
        owner_payouts_due = _r2(gross - commission_earned)
        total_deliveries = len(orders)
        rider_payouts = _r2(sum(float(o.get("rider_payout_net", o.get("rider_payout", rates["rider_fee"])) or 0) for o in orders))
        platform_revenue = _r2(commission_earned - rider_payouts)

        current_monday = _week_monday(_now())
        weeks = _payout_from_weeks(records, current_monday)
        history = []
        for (m, b) in weeks:
            w_gross = _r2(b["sales"])
            w_comm = _r2(w_gross * commission_rate)
            history.append({"period": _week_label(m), "gross": w_gross, "commission": w_comm, "orders": b["count"],
                            "status": "pending" if m >= current_monday else "settled"})

        return {
            "currency": "INR",
            "commission_rate": commission_rate,
            "summary": {
                "gross_sales": gross,
                "commission_earned": commission_earned,
                "owner_payouts_due": owner_payouts_due,
                "rider_payouts": rider_payouts,
                "platform_revenue": platform_revenue,
                "total_orders": len(records),
            },
            "weekly": history,
        }

    # =====================================================================
    # OUTLET INFO
    # =====================================================================
    class OutletUpdate(BaseModel):
        name: Optional[str] = None
        image: Optional[str] = None
        description: Optional[str] = None
        cuisines: Optional[List[str]] = None
        address: Optional[str] = None
        city: Optional[str] = None
        pincode: Optional[str] = None
        lat: Optional[float] = None
        lng: Optional[float] = None
        contact_phone: Optional[str] = None
        contact_email: Optional[str] = None
        contact_numbers: Optional[List[str]] = None
        operating_hours: Optional[str] = None
        opening_time: Optional[str] = None
        closing_time: Optional[str] = None
        pickup_instructions: Optional[str] = None
        smart_link: Optional[str] = None
        # Order management toggles
        auto_accept_orders: Optional[bool] = None

    @router.get("/owner/outlet")
    async def get_outlet(user: dict = Depends(require_role("restaurant_owner"))):
        rest = await db.restaurants.find_one({"owner_id": user["id"]}, {"_id": 0})
        if not rest:
            raise HTTPException(404, "No restaurant found for your account")
        # Backfill admin-searchable account_id so owners can quote it to support.
        if not rest.get("account_id"):
            rest["account_id"] = _account_id_for_rest(rest)
            await db.restaurants.update_one({"id": rest["id"]}, {"$set": {"account_id": rest["account_id"]}})
        return rest

    @router.patch("/owner/outlet")
    async def update_outlet(body: OutletUpdate, user: dict = Depends(require_role("restaurant_owner"))):
        rest = await db.restaurants.find_one({"owner_id": user["id"]}, {"_id": 0})
        if not rest:
            raise HTTPException(404, "No restaurant found for your account")
        upd = {k: v for k, v in body.dict().items() if v is not None}
        if not upd:
            raise HTTPException(400, "No fields to update")
        await db.restaurants.update_one({"id": rest["id"]}, {"$set": upd})
        return await db.restaurants.find_one({"id": rest["id"]}, {"_id": 0})

    # =====================================================================
    # REPORTS  (sales / earnings — summary + detailed breakdown, date filtered)
    # =====================================================================
    def _in_range(dstr: Optional[str], frm: Optional[str], to: Optional[str]) -> bool:
        d = (dstr or "")[:10]
        if not d:
            return False
        if frm and d < frm:
            return False
        if to and d > to:
            return False
        return True

    def _period_label(frm: Optional[str], to: Optional[str]) -> str:
        if not frm and not to:
            return "All time"
        if frm and to:
            return f"{frm} to {to}"
        if frm:
            return f"From {frm}"
        return f"Up to {to}"

    def _bump(daily: dict, d: str, sales: float, orders: int):
        b = daily.setdefault(d, {"date": d, "sales": 0.0, "orders": 0})
        b["sales"] = _r2(b["sales"] + sales)
        b["orders"] += orders

    @router.get("/owner/reports")
    async def owner_reports(
        frm: Optional[str] = Query(None, alias="from"),
        to: Optional[str] = Query(None, alias="to"),
        user: dict = Depends(require_role("restaurant_owner")),
    ):
        rids = await _owner_rest_ids(user["id"])
        rows = []
        daily: dict = {}
        online_sales = 0.0
        online_orders = 0
        pos_sales = 0.0
        pos_count = 0

        if rids:
            orders = await db.orders.find({"restaurant_id": {"$in": rids}, "status": "delivered"}, {"_id": 0}).to_list(20000)
            for o in orders:
                d = o.get("placed_at") or _now()
                if not _in_range(d, frm, to):
                    continue
                amt = float(o.get("subtotal", 0))
                online_sales += amt
                online_orders += 1
                rows.append({"date": d[:10], "type": "Online", "ref": o["id"][:8].upper(),
                             "restaurant": o.get("restaurant_name"), "amount": _r2(amt), "status": o.get("status", "delivered")})
                _bump(daily, d[:10], amt, 1)
            pos = await db.pos_orders.find({"restaurant_id": {"$in": rids}}, {"_id": 0}).to_list(20000)
            for p in pos:
                d = p.get("created_at") or _now()
                if not _in_range(d, frm, to):
                    continue
                amt = float(p.get("subtotal", 0))
                pos_sales += amt
                pos_count += 1
                rows.append({"date": d[:10], "type": "POS", "ref": p.get("bill_number") or p["id"][:8].upper(),
                             "restaurant": p.get("restaurant_name"), "amount": _r2(amt), "status": (p.get("payment_method") or "paid").upper()})
                _bump(daily, d[:10], amt, 1)

        gross = _r2(online_sales + pos_sales)
        orders_total = online_orders + pos_count
        commission = _r2(gross * COMMISSION_RATE)
        gst = _r2(gross * GST_RATE)
        net = _r2(gross - commission)
        rows.sort(key=lambda r: r["date"], reverse=True)
        daily_list = sorted(daily.values(), key=lambda x: x["date"])

        return {
            "currency": "INR",
            "commission_rate": COMMISSION_RATE,
            "gst_rate": GST_RATE,
            "period": {"from": frm, "to": to, "label": _period_label(frm, to)},
            "summary": {
                "gross_sales": gross,
                "orders": orders_total,
                "online_sales": _r2(online_sales),
                "online_orders": online_orders,
                "pos_sales": _r2(pos_sales),
                "pos_orders": pos_count,
                "commission": commission,
                "gst": gst,
                "net_earnings": net,
                "avg_order_value": _r2(gross / orders_total) if orders_total else 0.0,
            },
            "daily": daily_list,
            "rows": rows[:1000],
        }

    @router.get("/rider/reports")
    async def rider_reports(
        frm: Optional[str] = Query(None, alias="from"),
        to: Optional[str] = Query(None, alias="to"),
        user: dict = Depends(require_role("rider")),
    ):
        orders = await db.orders.find({"rider_id": user["id"], "status": "delivered"}, {"_id": 0}).to_list(20000)
        rows = []
        daily: dict = {}
        deliveries = 0
        for o in orders:
            d = o.get("placed_at") or _now()
            if not _in_range(d, frm, to):
                continue
            deliveries += 1
            fee = float(RIDER_FEE_PER_ORDER)
            rows.append({"date": d[:10], "type": "Delivery", "ref": o["id"][:8].upper(),
                         "restaurant": o.get("restaurant_name"), "amount": _r2(fee), "status": "earned"})
            _bump(daily, d[:10], fee, 1)
        total_earnings = _r2(deliveries * RIDER_FEE_PER_ORDER)
        rows.sort(key=lambda r: r["date"], reverse=True)
        daily_list = sorted(daily.values(), key=lambda x: x["date"])
        return {
            "currency": "INR",
            "fee_per_order": RIDER_FEE_PER_ORDER,
            "period": {"from": frm, "to": to, "label": _period_label(frm, to)},
            "summary": {
                "total_deliveries": deliveries,
                "total_earnings": total_earnings,
                "avg_per_delivery": RIDER_FEE_PER_ORDER if deliveries else 0.0,
            },
            "daily": daily_list,
            "rows": rows[:1000],
        }

    @router.get("/admin/reports")
    async def admin_reports(
        frm: Optional[str] = Query(None, alias="from"),
        to: Optional[str] = Query(None, alias="to"),
        user: dict = Depends(require_role("admin")),
    ):
        rows = []
        daily: dict = {}
        by_rest: dict = {}
        online_sales = 0.0
        online_orders = 0
        pos_sales = 0.0
        pos_count = 0

        orders = await db.orders.find({"status": "delivered"}, {"_id": 0}).to_list(50000)
        for o in orders:
            d = o.get("placed_at") or _now()
            if not _in_range(d, frm, to):
                continue
            amt = float(o.get("subtotal", 0))
            online_sales += amt
            online_orders += 1
            rname = o.get("restaurant_name") or "—"
            br = by_rest.setdefault(rname, {"restaurant": rname, "sales": 0.0, "orders": 0})
            br["sales"] = _r2(br["sales"] + amt); br["orders"] += 1
            rows.append({"date": d[:10], "type": "Online", "ref": o["id"][:8].upper(),
                         "restaurant": rname, "amount": _r2(amt), "status": o.get("status", "delivered")})
            _bump(daily, d[:10], amt, 1)

        pos = await db.pos_orders.find({}, {"_id": 0}).to_list(50000)
        for p in pos:
            d = p.get("created_at") or _now()
            if not _in_range(d, frm, to):
                continue
            amt = float(p.get("subtotal", 0))
            pos_sales += amt
            pos_count += 1
            rname = p.get("restaurant_name") or "—"
            br = by_rest.setdefault(rname, {"restaurant": rname, "sales": 0.0, "orders": 0})
            br["sales"] = _r2(br["sales"] + amt); br["orders"] += 1
            rows.append({"date": d[:10], "type": "POS", "ref": p.get("bill_number") or p["id"][:8].upper(),
                         "restaurant": rname, "amount": _r2(amt), "status": (p.get("payment_method") or "paid").upper()})
            _bump(daily, d[:10], amt, 1)

        gross = _r2(online_sales + pos_sales)
        orders_total = online_orders + pos_count
        commission_earned = _r2(gross * COMMISSION_RATE)
        rider_payouts = _r2(online_orders * RIDER_FEE_PER_ORDER)
        owner_payouts_due = _r2(gross - commission_earned)
        platform_revenue = _r2(commission_earned - rider_payouts)
        rows.sort(key=lambda r: r["date"], reverse=True)
        daily_list = sorted(daily.values(), key=lambda x: x["date"])
        by_rest_list = sorted(by_rest.values(), key=lambda x: x["sales"], reverse=True)
        for b in by_rest_list:
            b["commission"] = _r2(b["sales"] * COMMISSION_RATE)

        return {
            "currency": "INR",
            "commission_rate": COMMISSION_RATE,
            "period": {"from": frm, "to": to, "label": _period_label(frm, to)},
            "summary": {
                "gross_sales": gross,
                "total_orders": orders_total,
                "online_sales": _r2(online_sales),
                "online_orders": online_orders,
                "pos_sales": _r2(pos_sales),
                "pos_orders": pos_count,
                "commission_earned": commission_earned,
                "rider_payouts": rider_payouts,
                "owner_payouts_due": owner_payouts_due,
                "platform_revenue": platform_revenue,
                "avg_order_value": _r2(gross / orders_total) if orders_total else 0.0,
            },
            "by_restaurant": by_rest_list,
            "daily": daily_list,
            "rows": rows[:1000],
        }

    return router
