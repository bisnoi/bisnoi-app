"""
Native push notifications (Android FCM / iOS via FCM) using the official
Firebase Admin SDK directly — no third-party relay.

- POST /api/register-push  : an installed app registers its native device token.
- send_push(db, recipients, data) : server-side fan-out helper used by the
  app's notification pipeline.

Setup: download a service-account key from Firebase Console -> Project
Settings -> Service Accounts -> "Generate new private key", then set ONE of:
  FIREBASE_CREDENTIALS_JSON = the full JSON content (as a single-line string)
  FIREBASE_CREDENTIALS_PATH = path to the downloaded .json file on disk
"""
import os
import json
import logging
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, messaging
from fastapi import APIRouter
from pydantic import BaseModel

log = logging.getLogger("native_push")

_app = None


def _ensure_firebase():
    global _app
    if _app is not None:
        return _app
    cred_json = os.environ.get("FIREBASE_CREDENTIALS_JSON")
    cred_path = os.environ.get("FIREBASE_CREDENTIALS_PATH")
    if cred_json:
        cred = credentials.Certificate(json.loads(cred_json))
    elif cred_path:
        cred = credentials.Certificate(cred_path)
    else:
        raise RuntimeError("FIREBASE_CREDENTIALS_JSON or FIREBASE_CREDENTIALS_PATH not set")
    _app = firebase_admin.initialize_app(cred)
    return _app


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str  # "android" | "ios"
    device_token: str


async def send_push(db, recipients, data: dict) -> None:
    """Fan a native push out to a list of user IDs.

    `data` MUST contain `title` and `message`. Callers should wrap this in
    try/except so a push failure never blocks the primary operation.
    """
    recipients = [r for r in (recipients or []) if r]
    if not recipients:
        return
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")
    try:
        _ensure_firebase()
    except Exception as e:  # noqa: BLE001
        log.warning("Firebase not configured: %s", e)
        return

    tokens = []
    async for row in db.push_tokens.find({"user_id": {"$in": recipients}}, {"_id": 0}):
        t = row.get("device_token")
        if t:
            tokens.append(t)
    if not tokens:
        return

    extra = {k: str(v) for k, v in data.items() if k not in ("title", "message") and v is not None}
    message = messaging.MulticastMessage(
        notification=messaging.Notification(title=data["title"], body=data["message"]),
        data=extra,
        tokens=tokens,
    )
    try:
        resp = messaging.send_multicast(message)
        if resp.failure_count:
            for idx, r in enumerate(resp.responses):
                if not r.success and r.exception and "not-registered" in str(r.exception).lower():
                    await db.push_tokens.delete_one({"device_token": tokens[idx]})
    except Exception as e:  # noqa: BLE001
        log.warning("FCM send failed: %s", e)


def make_native_push_router(db) -> APIRouter:
    router = APIRouter()

    @router.post("/register-push", status_code=201)
    async def register_push(body: RegisterPushBody):
        now = datetime.now(timezone.utc).isoformat()
        await db.push_tokens.update_one(
            {"device_token": body.device_token},
            {"$set": {"user_id": body.user_id, "platform": body.platform,
                      "device_token": body.device_token, "updated_at": now},
             "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        return {"status": "registered"}

    return router
