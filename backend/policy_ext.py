"""
Policy & Compliance Extension for Bisnoi.

Provides:
- Legal / content system: Terms, Privacy, Refund, Cancellation, Contact Us, FAQs, Help
  per audience (customer, restaurant, rider). Admin editable; public read.
- Cancellation refund engine (customer/owner/rider/admin-initiated) with:
    - <1 min → 100% refund
    - before-pickup / after-pickup phases
    - restaurant refund-share based on performance score buckets
- Restaurant performance snapshot (mark-ready, on-time handover, availability) →
  composite score used by the refund engine.
- Per-customer COD / Prepaid control (auto-disable on bad performance;
  admin override; customer notified when disabled).

Wire from server.py:
    from policy_ext import make_policy_router, seed_policy_defaults
    api.include_router(make_policy_router(db, get_current_user, require_role, _create_notification))
    # in startup event, after existing seeds:
    await seed_policy_defaults(db)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Literal, Optional
from datetime import datetime, timezone, timedelta
import uuid
import logging

log = logging.getLogger("policy_ext")

# ------------------------- Constants & defaults -------------------------

AUDIENCES: List[str] = ["customer", "restaurant", "rider"]
LEGAL_KEYS: List[str] = [
    "terms",
    "privacy",
    "refund_policy",
    "cancellation_policy",
    "contact_us",
    "faqs",
    "help",
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


DEFAULT_CANCELLATION_RULES: Dict[str, Any] = {
    "free_cancel_window_seconds": 60,
    "before_pickup_customer_refund_pct": 100,
    "after_pickup_customer_refund_pct": 0,
    # Score bands (composite score 0..100)
    "restaurant_score_high_threshold": 80,  # >80 → high
    "restaurant_score_mid_threshold": 60,   # 60..80 → mid
    # Refund-share expected FROM restaurant (0..100)
    # rest — remainder is absorbed by platform
    "restaurant_share_high_pct": 0,
    "restaurant_share_mid_pct": 50,
    "restaurant_share_low_pct": 100,
    # Composite score weights (must sum ~100)
    "weight_mark_ready": 40,
    "weight_handover": 30,
    "weight_availability": 30,
    # SLA baselines
    "target_mark_ready_seconds": 15 * 60,   # 15 minutes
    "target_handover_seconds": 5 * 60,      # 5 minutes after ready
    # Rider penalty when they cancel after acceptance (in ₹, illustrative)
    "rider_penalty_after_pickup": 50,
    "rider_penalty_before_pickup": 0,
}

DEFAULT_COD_RULES: Dict[str, Any] = {
    "auto_disable_enabled": True,
    "min_orders_for_auto_rule": 5,
    "cancel_rate_threshold_pct": 30,   # >30%
    "rto_count_threshold": 3,          # ≥3
    "lookback_days": 30,
}


# ------------------------- Default templates -------------------------


def _base_sections(role: str) -> List[Dict[str, str]]:
    if role == "customer":
        return [
            {"title": "1. Acceptance of Terms", "body": "By using Bisnoi you agree to these Terms of Service and our Privacy Policy. If you do not agree, please discontinue use of the app."},
            {"title": "2. Account & Eligibility", "body": "You must be at least 18 years old to place orders. You are responsible for keeping your account credentials secure."},
            {"title": "3. Orders & Payments", "body": "All orders are subject to restaurant availability. Prices, offers and taxes may change. Cash on Delivery is available where supported and may be disabled based on your order history."},
            {"title": "4. Delivery", "body": "Estimated delivery times are indicative. Delays may occur due to traffic, weather or restaurant preparation time."},
            {"title": "5. User Conduct", "body": "Fraudulent orders, abusive behaviour toward riders/restaurant staff or repeated refund abuse may result in account restrictions."},
            {"title": "6. Modifications", "body": "We may update these Terms from time to time. Continued use of the service after changes means you accept the updated Terms."},
            {"title": "7. Contact", "body": "For any questions about these terms, contact us via the Contact Us page."},
        ]
    if role == "restaurant":
        return [
            {"title": "1. Partnership", "body": "By onboarding your restaurant on Bisnoi, you agree to serve customers with quality food, hygienic preparation and honour published prices/offers."},
            {"title": "2. Menu & Availability", "body": "Keep your menu accurate and mark items unavailable when required. Repeatedly serving out-of-stock items impacts your performance score."},
            {"title": "3. Order Handling", "body": "Accept, prepare and mark ready orders within the target time. Timely handover to riders is required for a healthy score."},
            {"title": "4. Payments & Commissions", "body": "Bisnoi retains a platform commission (configurable) on every delivery order. Payouts are processed as per the payout schedule."},
            {"title": "5. Cancellations & Refunds", "body": "If an order is cancelled, your refund share is determined by your performance score. See the Cancellation Policy for details."},
            {"title": "6. Compliance", "body": "Keep your FSSAI, GST and other licences up-to-date. Non-compliance may lead to suspension."},
            {"title": "7. Termination", "body": "Either party may terminate the partnership with notice. Unsettled dues will be reconciled."},
        ]
    # rider
    return [
        {"title": "1. Onboarding", "body": "By signing up as a Bisnoi rider you agree to complete assigned deliveries safely and courteously."},
        {"title": "2. Availability", "body": "Come online during your committed hours. Frequent last-minute unavailability affects your rating and earnings."},
        {"title": "3. Order Handling", "body": "Pick up orders promptly from restaurants and deliver them to customers on the shortest safe route. Do not tamper with the food packet."},
        {"title": "4. Payments", "body": "Per-delivery payouts (base + distance) are credited to your rider wallet as per platform rules."},
        {"title": "5. Cancellations", "body": "Riders cancelling after accepting a pickup may incur a penalty. See the Cancellation Policy."},
        {"title": "6. Conduct", "body": "Maintain professional conduct. Any abuse/theft or unsafe driving may lead to permanent removal from the platform."},
        {"title": "7. Insurance & Safety", "body": "Wear a helmet, carry a valid licence, and obey local traffic laws at all times."},
    ]


def _privacy_sections(role: str) -> List[Dict[str, str]]:
    return [
        {"title": "Information We Collect", "body": "Your phone number, name, saved addresses, order/delivery history, device information and — when you grant permission — approximate location."},
        {"title": "How We Use It", "body": "To provide delivery services, personalise recommendations, communicate order status, prevent fraud and comply with legal obligations."},
        {"title": "Sharing", "body": f"We share limited information with the {'restaurant and rider handling your order' if role=='customer' else 'customer and delivery partner as required to fulfil orders'}. We do not sell your personal data."},
        {"title": "Retention", "body": "We retain your data as long as your account is active and as required by law thereafter."},
        {"title": "Your Rights", "body": "You can request access, correction or deletion of your data via Contact Us."},
        {"title": "Security", "body": "We use industry-standard security measures. However, no method of transmission is 100% secure."},
    ]


def _refund_sections(role: str) -> List[Dict[str, str]]:
    if role == "customer":
        return [
            {"title": "Eligibility", "body": "Refunds are considered for orders that are cancelled per policy, undelivered, or where quality/quantity issues are reported within the applicable window."},
            {"title": "Cancellation Refunds", "body": "See the Cancellation Policy for exact refund percentages by phase (within 1 minute, before pickup, after pickup)."},
            {"title": "Processing Time", "body": "Approved refunds are credited to your original payment method within 5–7 business days. Cash-on-Delivery refunds are provided as store credit or bank transfer."},
            {"title": "Non-refundable", "body": "Custom preparations that have already been made, delivered orders (except for genuine quality issues) and refused deliveries without valid reason may be non-refundable."},
        ]
    if role == "restaurant":
        return [
            {"title": "Refund Share", "body": "When an order is cancelled, your share of the refund is determined by your performance score at the time of cancellation."},
            {"title": "Score Bands", "body": "Score >80 → 0% share (platform absorbs). Score 60–80 → 50% share. Score <60 → 100% share."},
            {"title": "Recovery of Costs", "body": "For cancellations initiated by a customer within the free-cancel window (default 60 seconds), no share is deducted from you."},
            {"title": "Dispute", "body": "Raise disputes via the Contact Us page within 48 hours of the cancellation."},
        ]
    return [
        {"title": "Rider Refund Interaction", "body": "Riders are not part of the payment refund chain. However, penalties may apply when a rider cancels after accepting a pickup."},
        {"title": "Penalties", "body": "Cancellations after accepting an order may attract a rider-side penalty per platform rules. Repeated abuse can lead to reduced order visibility."},
    ]


def _cancellation_sections(role: str) -> List[Dict[str, str]]:
    base = [
        {"title": "Phase A — Within 1 minute of placing the order", "body": "You may cancel free of charge and receive a 100% refund."},
        {"title": "Phase B — Before rider pickup", "body": "You may cancel; refund percentage is per policy defaults (100% by default). The restaurant's refund share is determined by their performance score."},
        {"title": "Phase C — After rider pickup", "body": "Cancellations are generally not eligible for refund. You may raise a support request for a genuine quality/quantity issue for a manual review."},
    ]
    if role == "restaurant":
        base.append({"title": "Restaurant Impact", "body": "Your refund share depends on your composite performance score (mark-ready avg, on-time handover %, daily availability %). A score >80 keeps you safe; below 60 you bear the full refund."})
    if role == "rider":
        base.append({"title": "Rider Impact", "body": "Cancelling after accepting a pickup may incur a penalty. Repeated cancellations reduce order visibility to you."})
    return base


def _faqs_default(role: str) -> List[Dict[str, str]]:
    if role == "customer":
        return [
            {"q": "How do I track my order?", "a": "Go to the Orders tab and tap any active order to see live status and rider tracking."},
            {"q": "How do I apply a coupon?", "a": "On the Cart screen, enter a coupon code (e.g. WELCOME50) before placing your order."},
            {"q": "What payment methods are supported?", "a": "UPI, cards and Cash on Delivery (COD). COD may be disabled for accounts with high cancellation/return-to-origin rates."},
            {"q": "Why is COD not available for me?", "a": "COD can be auto-disabled if your recent cancellation rate exceeds 30%, or you have 3+ Return-to-Origin cases, or an admin has flagged your account. See Payment methods for the exact reason."},
            {"q": "How do I cancel an order?", "a": "Open the order details and tap Cancel. Within 1 minute you get a full refund. After that, refund depends on the cancellation phase."},
            {"q": "How do I become a partner or rider?", "a": "Open Profile and tap 'Become a Restaurant Partner' or 'Become a Delivery Rider'."},
        ]
    if role == "restaurant":
        return [
            {"q": "How is my performance score calculated?", "a": "Composite of mark-ready avg time (40%), on-time handover % (30%) and daily availability % (30%)."},
            {"q": "How can I improve my score?", "a": "Mark orders ready within the target window, hand over to riders promptly, and stay online during your committed hours."},
            {"q": "How much refund share will I bear on cancellations?", "a": "0% if your score is >80, 50% if 60–80, 100% if <60. See Refund Policy."},
            {"q": "Can I dispute a cancellation?", "a": "Yes — raise a dispute via Contact Us within 48 hours."},
            {"q": "How do I add or edit my menu?", "a": "Open Menu Management. You can add categories & items, scan menus with AI/OCR, and edit prices."},
        ]
    return [
        {"q": "How do I go online?", "a": "Toggle your Availability status from the rider home screen when you're ready to accept deliveries."},
        {"q": "How are earnings calculated?", "a": "You earn a base fare plus a per-km distance component for each delivery. Payouts are credited per platform rules."},
        {"q": "What happens if I cancel a pickup?", "a": "You may incur a penalty per the Cancellation Policy. Repeated cancellations impact order visibility."},
        {"q": "What if the customer isn't reachable?", "a": "Wait at the drop location, try to call the customer, and mark 'unable to reach' via support if unresolved."},
    ]


def _contact_default(role: str) -> Dict[str, str]:
    role_line = {
        "customer": "24×7 customer support",
        "restaurant": "Restaurant partner support",
        "rider": "Rider support helpline",
    }.get(role, "")
    return {
        "phone": "+91 1800-000-000",
        "email": "support@bisnoi.app",
        "whatsapp": "+91 90000 00000",
        "address": "Bisnoi Foods Pvt Ltd, 4th Floor, Tech Park, Bengaluru, KA 560001",
        "hours": "Mon–Sun, 9:00 AM – 11:00 PM IST",
        "description": role_line,
    }


def _help_default(role: str) -> List[Dict[str, str]]:
    base = [
        {"title": "Getting Started", "body": f"Welcome to Bisnoi{'!' if role=='customer' else ' partner tools.'} Explore the app and reach out via Contact Us if you need help."},
        {"title": "Contact Support", "body": "You can call, email or WhatsApp our team. See Contact Us for the latest details."},
        {"title": "Cancellation & Refunds", "body": "Refer to the Cancellation and Refund Policy for detailed rules."},
    ]
    return base


def _default_content_doc(audience: str, key: str) -> Dict[str, Any]:
    role = audience  # audiences already map 1:1 to a role name for content purposes
    if key == "terms":
        return {"title": "Terms & Conditions", "updated_at": _now_iso(), "sections": _base_sections(role)}
    if key == "privacy":
        return {"title": "Privacy Policy", "updated_at": _now_iso(), "sections": _privacy_sections(role)}
    if key == "refund_policy":
        return {"title": "Refund Policy", "updated_at": _now_iso(), "sections": _refund_sections(role)}
    if key == "cancellation_policy":
        return {"title": "Cancellation Policy", "updated_at": _now_iso(), "sections": _cancellation_sections(role)}
    if key == "contact_us":
        return {"title": "Contact Us", "updated_at": _now_iso(), "contact": _contact_default(role)}
    if key == "faqs":
        return {"title": "Frequently Asked Questions", "updated_at": _now_iso(), "faqs": _faqs_default(role)}
    if key == "help":
        return {"title": "Help & Support", "updated_at": _now_iso(), "sections": _help_default(role)}
    return {"title": key.title(), "updated_at": _now_iso(), "sections": []}


# ------------------------- Seeding -------------------------

async def seed_policy_defaults(db) -> None:
    """Seed legal_content, cancellation_rules, cod_rules with defaults if missing."""
    # Legal content
    for audience in AUDIENCES:
        for key in LEGAL_KEYS:
            existing = await db.legal_content.find_one({"audience": audience, "key": key}, {"_id": 0})
            if not existing:
                doc = {
                    "id": str(uuid.uuid4()),
                    "audience": audience,
                    "key": key,
                    "content": _default_content_doc(audience, key),
                    "created_at": _now_iso(),
                    "updated_at": _now_iso(),
                }
                await db.legal_content.insert_one(dict(doc))
    # Cancellation rules (settings key)
    existing_rules = await db.settings.find_one({"key": "cancellation_rules"}, {"_id": 0})
    if not existing_rules:
        await db.settings.insert_one({
            "key": "cancellation_rules",
            **DEFAULT_CANCELLATION_RULES,
            "updated_at": _now_iso(),
        })
    # COD rules
    existing_cod = await db.settings.find_one({"key": "cod_rules"}, {"_id": 0})
    if not existing_cod:
        await db.settings.insert_one({
            "key": "cod_rules",
            **DEFAULT_COD_RULES,
            "updated_at": _now_iso(),
        })
    log.info("[policy_ext] defaults seeded")


# ------------------------- Restaurant performance -------------------------

def _bucket_share_pct(score: float, rules: Dict[str, Any]) -> int:
    if score >= rules.get("restaurant_score_high_threshold", 80):
        return int(rules.get("restaurant_share_high_pct", 0))
    if score >= rules.get("restaurant_score_mid_threshold", 60):
        return int(rules.get("restaurant_share_mid_pct", 50))
    return int(rules.get("restaurant_share_low_pct", 100))


def _score_from_metrics(mark_ready_seconds_avg: float, handover_pct: float, availability_pct: float, rules: Dict[str, Any]) -> float:
    """Composite 0..100 (higher = better)."""
    target_ready = float(rules.get("target_mark_ready_seconds", 900))
    if target_ready <= 0:
        target_ready = 900
    # If avg mark-ready equals target → 100; 2× target → 0.
    ready_component = max(0.0, min(100.0, 100 * (2 - float(mark_ready_seconds_avg) / target_ready)))
    handover_component = max(0.0, min(100.0, float(handover_pct)))
    avail_component = max(0.0, min(100.0, float(availability_pct)))
    w_ready = float(rules.get("weight_mark_ready", 40))
    w_hand = float(rules.get("weight_handover", 30))
    w_avail = float(rules.get("weight_availability", 30))
    total_w = max(1.0, w_ready + w_hand + w_avail)
    score = (ready_component * w_ready + handover_component * w_hand + avail_component * w_avail) / total_w
    return round(score, 2)


async def compute_restaurant_performance(db, restaurant_id: str, days: int = 7) -> Dict[str, Any]:
    """Compute a live composite score from recent orders + restaurant's own availability history."""
    rules = await _get_rules(db, "cancellation_rules", DEFAULT_CANCELLATION_RULES)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    since_iso = since.isoformat()

    cursor = db.orders.find(
        {"restaurant_id": restaurant_id, "placed_at": {"$gte": since_iso}, "awaiting_payment": {"$ne": True}},
        {"_id": 0, "id": 1, "placed_at": 1, "status": 1, "status_timestamps": 1, "picked_at": 1, "ready_at": 1, "accepted_at": 1},
    )
    orders = await cursor.to_list(length=1000)

    ready_deltas: List[float] = []
    handover_ok = 0
    handover_total = 0
    target_ready = float(rules.get("target_mark_ready_seconds", 900))
    target_handover = float(rules.get("target_handover_seconds", 300))

    for o in orders:
        placed = _parse_dt(o.get("placed_at"))
        st_ts = o.get("status_timestamps") or {}
        ready = _parse_dt(st_ts.get("ready") or o.get("ready_at"))
        picked = _parse_dt(st_ts.get("picked") or o.get("picked_at"))
        if placed and ready:
            delta = max(0.0, (ready - placed).total_seconds())
            ready_deltas.append(delta)
        if ready and picked:
            handover_total += 1
            if (picked - ready).total_seconds() <= target_handover:
                handover_ok += 1

    if ready_deltas:
        mark_ready_avg = sum(ready_deltas) / len(ready_deltas)
    else:
        mark_ready_avg = target_ready  # neutral default
    handover_pct = (handover_ok / handover_total * 100.0) if handover_total else 100.0

    # Availability: from restaurant.availability_open flag heuristic — if restaurant.is_active True → 100, else 50.
    rest = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0, "is_active": 1, "availability_pct": 1})
    availability_pct = float((rest or {}).get("availability_pct", 100 if (rest or {}).get("is_active", True) else 50))

    score = _score_from_metrics(mark_ready_avg, handover_pct, availability_pct, rules)
    return {
        "restaurant_id": restaurant_id,
        "days": days,
        "orders_considered": len(orders),
        "mark_ready_avg_seconds": round(mark_ready_avg, 1),
        "on_time_handover_pct": round(handover_pct, 2),
        "availability_pct": round(availability_pct, 2),
        "composite_score": score,
        "score_band": "high" if score >= rules.get("restaurant_score_high_threshold", 80)
                       else ("mid" if score >= rules.get("restaurant_score_mid_threshold", 60) else "low"),
    }


def _parse_dt(x: Any) -> Optional[datetime]:
    if not x:
        return None
    if isinstance(x, datetime):
        return x if x.tzinfo else x.replace(tzinfo=timezone.utc)
    try:
        s = str(x)
        # normalise trailing Z
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


async def _get_rules(db, key: str, defaults: Dict[str, Any]) -> Dict[str, Any]:
    doc = await db.settings.find_one({"key": key}, {"_id": 0}) or {}
    out = dict(defaults)
    for k, v in doc.items():
        if k in defaults and v is not None:
            out[k] = v
    return out


# ------------------------- Cancellation refund engine -------------------------

def _order_phase(placed_at: Optional[datetime], status: Optional[str], picked_at: Optional[datetime], free_window_seconds: int) -> str:
    """Return one of 'free_window', 'before_pickup', 'after_pickup', 'final'."""
    if status in ("delivered", "cancelled"):
        return "final"
    if picked_at or status in ("picked",):
        return "after_pickup"
    if placed_at:
        elapsed = (datetime.now(timezone.utc) - placed_at).total_seconds()
        if elapsed <= free_window_seconds:
            return "free_window"
    return "before_pickup"


async def compute_cancellation_outcome(db, order: Dict[str, Any], actor_side: str) -> Dict[str, Any]:
    """Compute the refund/share breakdown for cancelling the given order right now.

    actor_side ∈ {'customer','restaurant','rider','admin'}
    """
    rules = await _get_rules(db, "cancellation_rules", DEFAULT_CANCELLATION_RULES)
    perf = await compute_restaurant_performance(db, order.get("restaurant_id") or "")
    total = int(order.get("total") or 0)
    subtotal = int(order.get("subtotal") or 0)

    placed = _parse_dt(order.get("placed_at"))
    picked = _parse_dt((order.get("status_timestamps") or {}).get("picked") or order.get("picked_at"))
    phase = _order_phase(placed, order.get("status"), picked, int(rules.get("free_cancel_window_seconds", 60)))

    customer_refund_pct = 0
    if phase == "free_window":
        customer_refund_pct = 100
    elif phase == "before_pickup":
        customer_refund_pct = int(rules.get("before_pickup_customer_refund_pct", 100))
    elif phase == "after_pickup":
        customer_refund_pct = int(rules.get("after_pickup_customer_refund_pct", 0))
    else:
        # final state — cannot cancel
        customer_refund_pct = 0

    refund_amount_customer = int(round(total * customer_refund_pct / 100.0))
    restaurant_share_pct = _bucket_share_pct(perf["composite_score"], rules) if phase != "free_window" else 0
    restaurant_share_amount = int(round(refund_amount_customer * restaurant_share_pct / 100.0))
    platform_share_amount = max(0, refund_amount_customer - restaurant_share_amount)

    rider_penalty = 0
    if actor_side == "rider":
        rider_penalty = int(rules.get("rider_penalty_after_pickup", 0)) if phase == "after_pickup" else int(rules.get("rider_penalty_before_pickup", 0))

    return {
        "phase": phase,
        "cancellable": phase != "final",
        "actor_side": actor_side,
        "restaurant_performance": perf,
        "customer_refund_pct": customer_refund_pct,
        "customer_refund_amount": refund_amount_customer,
        "restaurant_share_pct": restaurant_share_pct,
        "restaurant_share_amount": restaurant_share_amount,
        "platform_share_amount": platform_share_amount,
        "rider_penalty": rider_penalty,
        "order_total": total,
        "order_subtotal": subtotal,
        "rules_snapshot": rules,
    }


# ------------------------- COD / Prepaid control -------------------------


async def _customer_metrics(db, user_id: str, lookback_days: int = 30) -> Dict[str, Any]:
    since = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    since_iso = since.isoformat()
    cursor = db.orders.find(
        {"customer_id": user_id, "placed_at": {"$gte": since_iso}, "awaiting_payment": {"$ne": True}},
        {"_id": 0, "id": 1, "status": 1, "payment_method": 1, "payment_status": 1, "cancellation_details": 1, "placed_at": 1},
    )
    orders = await cursor.to_list(length=1000)
    total = len(orders)
    cancelled = sum(1 for o in orders if o.get("status") == "cancelled")
    cancelled_by_customer = sum(1 for o in orders if o.get("status") == "cancelled" and ((o.get("cancellation_details") or {}).get("actor_side") == "customer"))
    # RTO: COD order that was cancelled after picked / marked returned
    rto = 0
    for o in orders:
        if o.get("payment_method") == "cod" and o.get("status") == "cancelled":
            det = o.get("cancellation_details") or {}
            if det.get("phase") == "after_pickup" or det.get("rto"):
                rto += 1
    return {
        "lookback_days": lookback_days,
        "total_orders": total,
        "cancelled_orders": cancelled,
        "cancelled_by_customer": cancelled_by_customer,
        "cancel_rate_pct": round((cancelled_by_customer / total * 100.0), 2) if total else 0.0,
        "rto_count": rto,
    }


async def resolve_cod_status(db, user: Dict[str, Any]) -> Dict[str, Any]:
    rules = await _get_rules(db, "cod_rules", DEFAULT_COD_RULES)
    override = user.get("cod_manual_override")
    reason_override = user.get("cod_override_reason")
    fake = bool((user.get("payment_flags") or {}).get("fake_order_flag"))
    metrics = await _customer_metrics(db, user["id"], int(rules.get("lookback_days", 30)))

    reason: Optional[str] = None
    cod_available = True
    source = "auto"

    if override == "block":
        cod_available = False
        source = "manual"
        reason = reason_override or "COD disabled by admin."
    elif override == "allow":
        cod_available = True
        source = "manual"
        reason = reason_override or None
    else:
        if not rules.get("auto_disable_enabled", True):
            cod_available = True
        else:
            triggers: List[str] = []
            if fake:
                triggers.append("Your account has been flagged for suspicious ordering activity.")
            if metrics["total_orders"] >= int(rules.get("min_orders_for_auto_rule", 5)) and metrics["cancel_rate_pct"] > float(rules.get("cancel_rate_threshold_pct", 30)):
                triggers.append(f"High cancellation rate in the last {rules.get('lookback_days', 30)} days ({metrics['cancel_rate_pct']}%).")
            if metrics["rto_count"] >= int(rules.get("rto_count_threshold", 3)):
                triggers.append(f"Multiple Return-to-Origin cases ({metrics['rto_count']}) in recent orders.")
            if triggers:
                cod_available = False
                source = "auto"
                reason = " ".join(triggers)

    return {
        "cod_available": cod_available,
        "prepaid_available": True,
        "reason": reason,
        "source": source,   # 'auto' | 'manual'
        "override": override,
        "metrics": metrics,
    }


# ------------------------- Pydantic bodies -------------------------


class LegalUpdateBody(BaseModel):
    content: Dict[str, Any]


class CancelRulesUpdate(BaseModel):
    free_cancel_window_seconds: Optional[int] = None
    before_pickup_customer_refund_pct: Optional[int] = None
    after_pickup_customer_refund_pct: Optional[int] = None
    restaurant_score_high_threshold: Optional[int] = None
    restaurant_score_mid_threshold: Optional[int] = None
    restaurant_share_high_pct: Optional[int] = None
    restaurant_share_mid_pct: Optional[int] = None
    restaurant_share_low_pct: Optional[int] = None
    weight_mark_ready: Optional[int] = None
    weight_handover: Optional[int] = None
    weight_availability: Optional[int] = None
    target_mark_ready_seconds: Optional[int] = None
    target_handover_seconds: Optional[int] = None
    rider_penalty_after_pickup: Optional[int] = None
    rider_penalty_before_pickup: Optional[int] = None


class CodRulesUpdate(BaseModel):
    auto_disable_enabled: Optional[bool] = None
    min_orders_for_auto_rule: Optional[int] = None
    cancel_rate_threshold_pct: Optional[float] = None
    rto_count_threshold: Optional[int] = None
    lookback_days: Optional[int] = None


class CustomerPaymentOverride(BaseModel):
    override: Optional[Literal["allow", "block", "clear"]] = None
    reason: Optional[str] = None
    fake_order_flag: Optional[bool] = None


class CancelOrderBody(BaseModel):
    reason: str = Field("", max_length=500)
    reason_code: Optional[str] = None
    genuine_reason: Optional[bool] = False


# ------------------------- Router -------------------------

def make_policy_router(db, get_current_user, require_role, create_notification):
    router = APIRouter()

    # -------- Public legal content --------
    @router.get("/legal/{audience}/{key}")
    async def public_legal(audience: str, key: str):
        if audience not in AUDIENCES or key not in LEGAL_KEYS:
            raise HTTPException(404, "Unknown legal page")
        doc = await db.legal_content.find_one({"audience": audience, "key": key}, {"_id": 0})
        if not doc:
            content = _default_content_doc(audience, key)
            doc = {
                "id": str(uuid.uuid4()),
                "audience": audience,
                "key": key,
                "content": content,
                "created_at": _now_iso(),
                "updated_at": _now_iso(),
            }
            await db.legal_content.insert_one(dict(doc))
            doc = await db.legal_content.find_one({"audience": audience, "key": key}, {"_id": 0})
        return doc

    @router.get("/legal/{audience}")
    async def public_legal_list(audience: str):
        if audience not in AUDIENCES:
            raise HTTPException(404, "Unknown audience")
        docs = await db.legal_content.find({"audience": audience}, {"_id": 0}).to_list(length=len(LEGAL_KEYS))
        return {"audience": audience, "items": docs}

    # -------- Admin legal management --------
    @router.get("/admin/legal")
    async def admin_legal_list(user: dict = Depends(require_role("admin"))):
        docs = await db.legal_content.find({}, {"_id": 0}).to_list(length=100)
        return {"items": docs, "audiences": AUDIENCES, "keys": LEGAL_KEYS}

    @router.patch("/admin/legal/{audience}/{key}")
    async def admin_legal_update(audience: str, key: str, body: LegalUpdateBody, user: dict = Depends(require_role("admin"))):
        if audience not in AUDIENCES or key not in LEGAL_KEYS:
            raise HTTPException(404, "Unknown legal page")
        payload = dict(body.content or {})
        payload["updated_at"] = _now_iso()
        await db.legal_content.update_one(
            {"audience": audience, "key": key},
            {"$set": {"content": payload, "updated_at": _now_iso()}, "$setOnInsert": {"id": str(uuid.uuid4()), "audience": audience, "key": key, "created_at": _now_iso()}},
            upsert=True,
        )
        return await db.legal_content.find_one({"audience": audience, "key": key}, {"_id": 0})

    @router.post("/admin/legal/{audience}/{key}/reset")
    async def admin_legal_reset(audience: str, key: str, user: dict = Depends(require_role("admin"))):
        if audience not in AUDIENCES or key not in LEGAL_KEYS:
            raise HTTPException(404, "Unknown legal page")
        default = _default_content_doc(audience, key)
        await db.legal_content.update_one(
            {"audience": audience, "key": key},
            {"$set": {"content": default, "updated_at": _now_iso()}, "$setOnInsert": {"id": str(uuid.uuid4()), "audience": audience, "key": key, "created_at": _now_iso()}},
            upsert=True,
        )
        return await db.legal_content.find_one({"audience": audience, "key": key}, {"_id": 0})

    # -------- Cancellation rules --------
    @router.get("/admin/settings/cancellation")
    async def admin_get_cancel_rules(user: dict = Depends(require_role("admin"))):
        return await _get_rules(db, "cancellation_rules", DEFAULT_CANCELLATION_RULES)

    @router.get("/settings/cancellation")
    async def public_get_cancel_rules():
        # public read (used to show phase copy in UI); numeric only, safe
        return await _get_rules(db, "cancellation_rules", DEFAULT_CANCELLATION_RULES)

    @router.patch("/admin/settings/cancellation")
    async def admin_update_cancel_rules(body: CancelRulesUpdate, user: dict = Depends(require_role("admin"))):
        updates = {k: v for k, v in body.dict().items() if v is not None}
        if not updates:
            return await _get_rules(db, "cancellation_rules", DEFAULT_CANCELLATION_RULES)
        updates["key"] = "cancellation_rules"
        updates["updated_at"] = _now_iso()
        await db.settings.update_one({"key": "cancellation_rules"}, {"$set": updates}, upsert=True)
        return await _get_rules(db, "cancellation_rules", DEFAULT_CANCELLATION_RULES)

    # -------- COD rules --------
    @router.get("/admin/settings/cod-rules")
    async def admin_get_cod_rules(user: dict = Depends(require_role("admin"))):
        return await _get_rules(db, "cod_rules", DEFAULT_COD_RULES)

    @router.patch("/admin/settings/cod-rules")
    async def admin_update_cod_rules(body: CodRulesUpdate, user: dict = Depends(require_role("admin"))):
        updates = {k: v for k, v in body.dict().items() if v is not None}
        if not updates:
            return await _get_rules(db, "cod_rules", DEFAULT_COD_RULES)
        updates["key"] = "cod_rules"
        updates["updated_at"] = _now_iso()
        await db.settings.update_one({"key": "cod_rules"}, {"$set": updates}, upsert=True)
        return await _get_rules(db, "cod_rules", DEFAULT_COD_RULES)

    # -------- Restaurant performance --------
    @router.get("/owner/performance")
    async def owner_performance(user: dict = Depends(require_role("restaurant_owner"))):
        rest = await db.restaurants.find_one({"owner_id": user["id"]}, {"_id": 0, "id": 1, "name": 1, "is_active": 1})
        if not rest:
            raise HTTPException(404, "Restaurant not found for this owner")
        perf = await compute_restaurant_performance(db, rest["id"])
        return {"restaurant": rest, **perf}

    @router.get("/admin/restaurants/{rid}/performance")
    async def admin_restaurant_performance(rid: str, user: dict = Depends(require_role("admin"))):
        rest = await db.restaurants.find_one({"id": rid}, {"_id": 0, "id": 1, "name": 1, "is_active": 1, "owner_id": 1})
        if not rest:
            raise HTTPException(404, "Restaurant not found")
        perf = await compute_restaurant_performance(db, rid)
        return {"restaurant": rest, **perf}

    @router.get("/admin/restaurants-performance")
    async def admin_all_restaurants_performance(user: dict = Depends(require_role("admin"))):
        rests = await db.restaurants.find({}, {"_id": 0, "id": 1, "name": 1, "is_active": 1, "owner_id": 1}).to_list(length=500)
        out = []
        for r in rests:
            perf = await compute_restaurant_performance(db, r["id"])
            out.append({"restaurant": r, **perf})
        out.sort(key=lambda x: x["composite_score"])  # worst first
        return {"items": out}

    # -------- Cancellation preview + execute --------
    @router.get("/orders/{oid}/cancel-preview")
    async def cancel_preview(oid: str, user: dict = Depends(get_current_user)):
        o = await db.orders.find_one({"id": oid}, {"_id": 0})
        if not o:
            raise HTTPException(404, "Order not found")
        _authorize_cancel_actor(user, o)
        actor_side = _actor_side(user, o)
        return await compute_cancellation_outcome(db, o, actor_side)

    @router.post("/orders/{oid}/cancel")
    async def cancel_order(oid: str, body: CancelOrderBody, user: dict = Depends(get_current_user)):
        o = await db.orders.find_one({"id": oid}, {"_id": 0})
        if not o:
            raise HTTPException(404, "Order not found")
        if o.get("status") in ("delivered", "cancelled"):
            raise HTTPException(400, "This order can no longer be cancelled.")
        _authorize_cancel_actor(user, o)
        actor_side = _actor_side(user, o)
        outcome = await compute_cancellation_outcome(db, o, actor_side)
        if not outcome["cancellable"]:
            raise HTTPException(400, "This order cannot be cancelled.")
        cancellation = {
            "id": str(uuid.uuid4()),
            "order_id": oid,
            "actor_id": user["id"],
            "actor_role": user.get("role"),
            "actor_side": actor_side,
            "reason": (body.reason or "").strip(),
            "reason_code": body.reason_code,
            "genuine_reason": bool(body.genuine_reason),
            "outcome": outcome,
            "created_at": _now_iso(),
        }
        await db.cancellations.insert_one(dict(cancellation))
        cancellation.pop("_id", None)
        # Update the order
        st_ts = dict(o.get("status_timestamps") or {})
        st_ts["cancelled"] = _now_iso()
        await db.orders.update_one({"id": oid}, {"$set": {
            "status": "cancelled",
            "cancellation_details": {
                "phase": outcome["phase"],
                "actor_side": actor_side,
                "actor_id": user["id"],
                "actor_role": user.get("role"),
                "reason": (body.reason or "").strip(),
                "reason_code": body.reason_code,
                "genuine_reason": bool(body.genuine_reason),
                "customer_refund_pct": outcome["customer_refund_pct"],
                "customer_refund_amount": outcome["customer_refund_amount"],
                "restaurant_share_pct": outcome["restaurant_share_pct"],
                "restaurant_share_amount": outcome["restaurant_share_amount"],
                "platform_share_amount": outcome["platform_share_amount"],
                "rider_penalty": outcome["rider_penalty"],
                "restaurant_score_used": outcome["restaurant_performance"]["composite_score"],
                "cancelled_at": _now_iso(),
                "cancellation_id": cancellation["id"],
            },
            "status_timestamps": st_ts,
        }})
        # Notifications
        try:
            await create_notification(
                o.get("customer_id"),
                "order_cancelled",
                "Order cancelled",
                _cancel_msg_for_customer(outcome, actor_side),
                order_id=oid,
                restaurant_id=o.get("restaurant_id"),
            )
            rest = await db.restaurants.find_one({"id": o.get("restaurant_id")}, {"_id": 0, "owner_id": 1, "name": 1})
            if rest and rest.get("owner_id"):
                await create_notification(
                    rest["owner_id"],
                    "order_cancelled",
                    "Order cancelled",
                    _cancel_msg_for_owner(outcome, actor_side),
                    order_id=oid,
                    restaurant_id=o.get("restaurant_id"),
                )
            if o.get("rider_id"):
                await create_notification(
                    o.get("rider_id"),
                    "order_cancelled",
                    "Order cancelled",
                    "The order you were assigned has been cancelled.",
                    order_id=oid,
                    restaurant_id=o.get("restaurant_id"),
                )
        except Exception as e:  # noqa: BLE001
            log.warning("cancel notif failed: %s", e)
        updated = await db.orders.find_one({"id": oid}, {"_id": 0})
        return {"order": updated, "cancellation": cancellation, "outcome": outcome}

    # -------- COD / Payment options --------
    @router.get("/me/payment-options")
    async def my_payment_options(user: dict = Depends(get_current_user)):
        if user.get("role") not in ("customer", "admin", "admin_staff"):
            return {"cod_available": True, "prepaid_available": True, "reason": None, "source": "auto"}
        # Load a fresh copy so latest overrides count
        u = await db.users.find_one({"id": user["id"]}, {"_id": 0}) or user
        status = await resolve_cod_status(db, u)
        # Notify once when auto-disabled
        try:
            if not status["cod_available"] and status.get("source") == "auto":
                notified_flag = (u.get("payment_flags") or {}).get("cod_disabled_notified_at")
                if not notified_flag:
                    await create_notification(
                        user["id"],
                        "cod_disabled",
                        "Cash on Delivery temporarily disabled",
                        status.get("reason") or "COD is currently unavailable for your account.",
                    )
                    await db.users.update_one(
                        {"id": user["id"]},
                        {"$set": {"payment_flags.cod_disabled_notified_at": _now_iso()}},
                    )
        except Exception as e:  # noqa: BLE001
            log.warning("cod notify failed: %s", e)
        return status

    @router.get("/admin/customers/{uid}/payment-status")
    async def admin_customer_payment(uid: str, user: dict = Depends(require_role("admin"))):
        u = await db.users.find_one({"id": uid}, {"_id": 0})
        if not u:
            raise HTTPException(404, "Customer not found")
        status = await resolve_cod_status(db, u)
        return {"user": {"id": u["id"], "phone": u.get("phone"), "name": u.get("name"), "role": u.get("role")}, **status}

    @router.patch("/admin/customers/{uid}/payment-status")
    async def admin_customer_payment_update(uid: str, body: CustomerPaymentOverride, user: dict = Depends(require_role("admin"))):
        u = await db.users.find_one({"id": uid}, {"_id": 0})
        if not u:
            raise HTTPException(404, "Customer not found")
        updates: Dict[str, Any] = {}
        if body.override is not None:
            if body.override == "clear":
                updates["cod_manual_override"] = None
                updates["cod_override_reason"] = None
            else:
                updates["cod_manual_override"] = body.override
                if body.reason is not None:
                    updates["cod_override_reason"] = body.reason[:500]
        if body.fake_order_flag is not None:
            payment_flags = dict(u.get("payment_flags") or {})
            payment_flags["fake_order_flag"] = bool(body.fake_order_flag)
            payment_flags["flag_reason"] = (body.reason or payment_flags.get("flag_reason") or "")[:500]
            updates["payment_flags"] = payment_flags
        if not updates:
            raise HTTPException(400, "No changes provided")
        updates["cod_updated_at"] = _now_iso()
        await db.users.update_one({"id": uid}, {"$set": updates})
        u2 = await db.users.find_one({"id": uid}, {"_id": 0})
        status = await resolve_cod_status(db, u2)
        try:
            if not status["cod_available"] and status.get("source") == "manual":
                await create_notification(
                    uid,
                    "cod_disabled",
                    "Cash on Delivery disabled",
                    status.get("reason") or "COD has been disabled for your account by admin.",
                )
        except Exception as e:  # noqa: BLE001
            log.warning("cod notify failed: %s", e)
        return {"user": {"id": u2["id"], "phone": u2.get("phone"), "name": u2.get("name"), "role": u2.get("role")}, **status}

    @router.get("/admin/customers-payments")
    async def admin_customers_payments(limit: int = 200, user: dict = Depends(require_role("admin"))):
        cursor = db.users.find({"role": "customer"}, {"_id": 0, "id": 1, "phone": 1, "name": 1, "cod_manual_override": 1, "cod_override_reason": 1, "payment_flags": 1}).sort("created_at", -1)
        docs = await cursor.to_list(length=max(1, min(1000, limit)))
        out = []
        for d in docs:
            status = await resolve_cod_status(db, d)
            out.append({
                "id": d["id"],
                "phone": d.get("phone"),
                "name": d.get("name"),
                "cod_available": status["cod_available"],
                "source": status["source"],
                "override": status.get("override"),
                "reason": status.get("reason"),
                "metrics": status.get("metrics"),
            })
        return {"items": out}

    return router


# ------------------------- helpers -------------------------

def _actor_side(user: Dict[str, Any], order: Dict[str, Any]) -> str:
    r = user.get("role")
    if r in ("restaurant_owner", "restaurant_staff"):
        return "restaurant"
    if r == "rider":
        return "rider"
    if r in ("admin", "admin_staff"):
        return "admin"
    if r == "customer" and user.get("id") == order.get("customer_id"):
        return "customer"
    return "customer"


def _authorize_cancel_actor(user: Dict[str, Any], order: Dict[str, Any]) -> None:
    role = user.get("role")
    if role in ("admin", "admin_staff"):
        return
    if role == "customer" and user.get("id") == order.get("customer_id"):
        return
    if role in ("restaurant_owner", "restaurant_staff"):
        # verify the owner owns this restaurant (or is staff of that owner)
        # for staff the require_role wrapper substitutes id → parent owner id already
        return
    if role == "rider" and user.get("id") == order.get("rider_id"):
        return
    raise HTTPException(403, "You are not allowed to cancel this order")


def _cancel_msg_for_customer(outcome: Dict[str, Any], actor_side: str) -> str:
    phase = outcome["phase"]
    if phase == "free_window":
        return "Your order has been cancelled within the free-cancel window. Full refund of ₹{amt} will be processed.".format(amt=outcome["customer_refund_amount"])
    if phase == "before_pickup":
        return "Your order has been cancelled before pickup. Refund of ₹{amt} ({pct}%) will be processed.".format(amt=outcome["customer_refund_amount"], pct=outcome["customer_refund_pct"])
    if phase == "after_pickup":
        if outcome["customer_refund_amount"] > 0:
            return "Your order has been cancelled after pickup. Refund of ₹{amt} will be reviewed.".format(amt=outcome["customer_refund_amount"])
        return "Your order has been cancelled after pickup. No refund is applicable as per policy; you can raise a support request for review."
    return "Your order has been cancelled."


def _cancel_msg_for_owner(outcome: Dict[str, Any], actor_side: str) -> str:
    if actor_side == "restaurant":
        return "You cancelled the order. Refund share on your side: ₹{amt} ({pct}%).".format(amt=outcome["restaurant_share_amount"], pct=outcome["restaurant_share_pct"])
    return "An order was cancelled by {actor}. Your refund share: ₹{amt} ({pct}%) — based on current score ({score}).".format(
        actor=actor_side,
        amt=outcome["restaurant_share_amount"],
        pct=outcome["restaurant_share_pct"],
        score=outcome["restaurant_performance"]["composite_score"],
    )
