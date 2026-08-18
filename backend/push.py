"""
Web Push (VAPID) notifications for the Bisnoi PWA.

- VAPID keypair is generated once and persisted in `db.settings` (key="vapid_keys")
  so it survives restarts. The private key is also written to a PEM file on disk
  because pywebpush wants a key file path.
- Browser subscriptions are stored in `db.push_subscriptions` keyed by `endpoint`.
- `send_push_to_user(db, user_id, payload)` fans a push out to every device a
  user has subscribed; dead subscriptions (404/410) are pruned automatically.

The public application-server key is exposed at GET /api/push/public-key so the
frontend never needs it baked into the build.
"""
import os
import json
import base64
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from pywebpush import webpush, WebPushException

log = logging.getLogger("push")

SECRETS_DIR = Path(__file__).parent / "secrets"
PRIV_PEM_PATH = SECRETS_DIR / "vapid_private.pem"
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:support@bisnoi.app")

_state = {"public_key": None, "priv_path": None, "ready": False}


def _gen_keypair():
    priv = ec.generate_private_key(ec.SECP256R1())
    pem = priv.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    pub_point = priv.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    public_key = base64.urlsafe_b64encode(pub_point).rstrip(b"=").decode()
    return pem, public_key


async def ensure_vapid(db) -> dict:
    """Load the VAPID keypair from DB (or generate+persist once). Cached in-process."""
    if _state["ready"]:
        return {"public_key": _state["public_key"]}
    doc = await db.settings.find_one({"key": "vapid_keys"}, {"_id": 0})
    if not doc or not doc.get("private_pem") or not doc.get("public_key"):
        priv_pem, public_key = _gen_keypair()
        await db.settings.update_one(
            {"key": "vapid_keys"},
            {"$set": {"key": "vapid_keys", "private_pem": priv_pem, "public_key": public_key,
                      "created_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
        doc = {"private_pem": priv_pem, "public_key": public_key}
        log.info("Generated new VAPID keypair")
    SECRETS_DIR.mkdir(parents=True, exist_ok=True)
    PRIV_PEM_PATH.write_text(doc["private_pem"])
    _state["public_key"] = doc["public_key"]
    _state["priv_path"] = str(PRIV_PEM_PATH)
    _state["ready"] = True
    return {"public_key": _state["public_key"]}


def _send_one(subscription: dict, payload: dict, priv_path: str):
    webpush(
        subscription_info=subscription,
        data=json.dumps(payload),
        vapid_private_key=priv_path,
        vapid_claims={"sub": VAPID_SUBJECT},
        timeout=10,
    )


async def send_push_to_user(db, user_id, payload: dict) -> int:
    """Fan a push notification out to all of a user's subscribed devices."""
    if not user_id:
        return 0
    try:
        await ensure_vapid(db)
    except Exception as e:  # noqa: BLE001
        log.warning("VAPID init failed: %s", e)
        return 0
    priv_path = _state["priv_path"]
    sent = 0
    async for row in db.push_subscriptions.find({"user_id": user_id}, {"_id": 0}):
        sub = row.get("subscription")
        if not sub:
            continue
        try:
            await asyncio.to_thread(_send_one, sub, payload, priv_path)
            sent += 1
        except WebPushException as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in (404, 410):
                await db.push_subscriptions.delete_one({"endpoint": row.get("endpoint")})
            else:
                log.warning("web push failed: %s", exc)
        except Exception as e:  # noqa: BLE001
            log.warning("web push error: %s", e)
    return sent


class SubscribeBody(BaseModel):
    subscription: dict


def make_push_router(db, get_current_user):
    router = APIRouter()

    @router.get("/push/public-key")
    async def public_key():
        info = await ensure_vapid(db)
        return {"publicKey": info["public_key"]}

    @router.post("/push/subscribe")
    async def subscribe(body: SubscribeBody, user: dict = Depends(get_current_user)):
        sub = body.subscription or {}
        endpoint = sub.get("endpoint")
        if not endpoint:
            raise HTTPException(400, "Missing subscription endpoint")
        now = datetime.now(timezone.utc).isoformat()
        await db.push_subscriptions.update_one(
            {"endpoint": endpoint},
            {"$set": {"endpoint": endpoint, "subscription": sub, "user_id": user["id"],
                      "role": user.get("role"), "updated_at": now},
             "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        return {"ok": True}

    @router.post("/push/unsubscribe")
    async def unsubscribe(body: SubscribeBody, user: dict = Depends(get_current_user)):
        endpoint = (body.subscription or {}).get("endpoint")
        if endpoint:
            await db.push_subscriptions.delete_one({"endpoint": endpoint, "user_id": user["id"]})
        return {"ok": True}

    @router.get("/push/status")
    async def status(user: dict = Depends(get_current_user)):
        n = await db.push_subscriptions.count_documents({"user_id": user["id"]})
        return {"subscribed": n > 0, "devices": n}

    return router
