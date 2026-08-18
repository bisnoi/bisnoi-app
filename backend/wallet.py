"""
Per-restaurant marketing wallet.

A wallet holds a prepaid INR balance that funds WhatsApp marketing campaigns.
Money enters via Razorpay top-up (owner) or a manual admin credit; it leaves as a
per-message debit set by the admin-configured rate.

Collections:
  wallets      -> {restaurant_id, balance, total_credited, total_spent, messages_sent, ...}
  wallet_txns  -> immutable ledger of every credit/debit
"""
import uuid
from datetime import datetime, timezone

from pymongo import ReturnDocument


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def get_wallet(db, restaurant_id: str) -> dict:
    """Return the wallet doc, creating an empty one on first access.

    Uses an atomic upsert ($setOnInsert) so concurrent first-time reads (e.g.
    overview + wallet + campaigns fetched in parallel on the client) can't create
    duplicate wallet documents for the same restaurant.
    """
    now = _now_iso()
    await db.wallets.update_one(
        {"restaurant_id": restaurant_id},
        {"$setOnInsert": {
            "restaurant_id": restaurant_id,
            "balance": 0.0,
            "total_credited": 0.0,
            "total_spent": 0.0,
            "messages_sent": 0,
            "created_at": now,
            "updated_at": now,
        }},
        upsert=True,
    )
    w = await db.wallets.find_one({"restaurant_id": restaurant_id}, {"_id": 0}) or {}
    w["balance"] = round(float(w.get("balance", 0.0)), 2)
    return w


async def _record_txn(db, restaurant_id, kind, amount, balance_after, reason, ref=None, by=None, meta=None) -> dict:
    doc = {
        "id": str(uuid.uuid4()),
        "restaurant_id": restaurant_id,
        "kind": kind,  # "credit" | "debit"
        "amount": round(float(amount), 2),
        "balance_after": round(float(balance_after), 2),
        "reason": reason,  # topup_razorpay | topup_admin | admin_adjust | campaign
        "ref": ref,
        "created_by": by,
        "meta": meta or {},
        "created_at": _now_iso(),
    }
    await db.wallet_txns.insert_one(dict(doc))
    return doc


async def credit_wallet(db, restaurant_id, amount, reason, ref=None, by=None, dedupe=True) -> float:
    """Add money to a wallet. When `dedupe` + `ref` are set, a repeated credit
    with the same ref is a no-op (protects against double Razorpay verify calls)."""
    amount = round(float(amount), 2)
    if amount <= 0:
        raise ValueError("Amount must be positive")
    if dedupe and ref:
        existing = await db.wallet_txns.find_one({"ref": ref, "kind": "credit"}, {"_id": 0, "id": 1})
        if existing:
            w = await get_wallet(db, restaurant_id)
            return w["balance"]
    await get_wallet(db, restaurant_id)  # ensure it exists
    res = await db.wallets.find_one_and_update(
        {"restaurant_id": restaurant_id},
        {"$inc": {"balance": amount, "total_credited": amount}, "$set": {"updated_at": _now_iso()}},
        return_document=ReturnDocument.AFTER,
    )
    bal = round(float((res or {}).get("balance", 0.0)), 2)
    await _record_txn(db, restaurant_id, "credit", amount, bal, reason, ref=ref, by=by)
    return bal


async def debit_wallet(db, restaurant_id, amount, reason, ref=None, by=None, messages=0) -> float:
    """Remove money from a wallet. Raises ValueError if the balance is too low.
    `messages` optionally increments the lifetime messages_sent counter."""
    amount = round(float(amount), 2)
    if amount <= 0:
        raise ValueError("Amount must be positive")
    await get_wallet(db, restaurant_id)
    res = await db.wallets.find_one_and_update(
        {"restaurant_id": restaurant_id, "balance": {"$gte": amount}},
        {"$inc": {"balance": -amount, "total_spent": amount, "messages_sent": int(messages)},
         "$set": {"updated_at": _now_iso()}},
        return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise ValueError("Insufficient wallet balance")
    bal = round(float(res.get("balance", 0.0)), 2)
    await _record_txn(db, restaurant_id, "debit", amount, bal, reason, ref=ref, by=by, meta={"messages": int(messages)})
    return bal


async def wallet_txns(db, restaurant_id: str, limit: int = 50) -> list:
    return await db.wallet_txns.find({"restaurant_id": restaurant_id}, {"_id": 0}) \
        .sort("created_at", -1).to_list(limit)
