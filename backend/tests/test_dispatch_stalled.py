"""
Long-running test for the 15-second retry ladder + dispatch_stalled state.
Kept SEPARATE from the main flow file because it waits ~65s for the watchdog to
exhaust all 4 attempts and set dispatch_stalled=True.
Run with:  pytest backend/tests/test_dispatch_stalled.py -v -n 0
"""
import os
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://food-app-demo-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

PHONE_OWNER = "8888888888"
PHONE_RIDER = "7777777777"
RESTAURANT_ID = "a9ee09bd-6a8a-4138-b045-7b0c9c52e9aa"
MENU_ITEM_ID = "8ce5d499-b69c-4ae5-a6c4-f94f48ebdda0"


def login_as(phone):
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    otp = r.json()["demo_otp"]
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "code": otp}, timeout=15)
    j = r.json()
    return j["token"], j["user"]


def auth_hdr(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def test_retry_ladder_stalls_when_no_riders():
    """With NO online verified riders in DB, watchdog should exhaust all 4
    attempts in ~60s, set dispatch_stalled=True and send owner a notification.
    """
    db = MongoClient(MONGO_URL)[DB_NAME]

    # Snapshot rider state and go OFFLINE + unverified to force zero eligible riders.
    orig = db.users.find_one({"phone": PHONE_RIDER}, {"_id": 0, "is_online": 1, "rider_verified": 1}) or {}
    db.users.update_one({"phone": PHONE_RIDER}, {"$set": {"is_online": False, "rider_verified": False}})

    # Also disable any OTHER online riders in the db that might grab this.
    other_riders = list(db.users.find({"role": "rider", "is_online": {"$ne": False}, "phone": {"$ne": PHONE_RIDER}}))
    disabled_ids = [r["id"] for r in other_riders]
    if disabled_ids:
        db.users.update_many({"id": {"$in": disabled_ids}}, {"$set": {"is_online": False}})

    try:
        # Fresh customer for isolation
        cust_phone = f"90001{int(time.time()) % 100000:05d}"
        cust_tok, _ = login_as(cust_phone)
        owner_tok, owner_user = login_as(PHONE_OWNER)

        body = {
            "restaurant_id": RESTAURANT_ID,
            "items": [{"menu_item_id": MENU_ITEM_ID, "quantity": 1}],
            "address": {"label": "Home", "line1": "Test", "city": "BLR", "lat": 12.972, "lng": 77.595},
            "payment_method": "cod",
        }
        r = requests.post(f"{API}/orders", json=body, headers=auth_hdr(cust_tok), timeout=20)
        assert r.status_code == 200
        oid = r.json()["id"]

        r = requests.patch(f"{API}/orders/{oid}/status", json={"status": "accepted"},
                           headers=auth_hdr(owner_tok), timeout=15)
        assert r.status_code == 200

        # After ~16s, attempts should be at least 2 (initial + first retry)
        time.sleep(17)
        o = db.orders.find_one({"id": oid})
        assert o["dispatch_attempts"] >= 2, f"Expected attempts >= 2 after 17s, got {o['dispatch_attempts']}"
        assert o.get("dispatch_stalled") is not True, "Should not be stalled after 17s"

        # After ~65s total wait since accept, should be stalled (4 attempts done)
        time.sleep(65 - 17 + 5)  # extra buffer
        o2 = db.orders.find_one({"id": oid})
        assert o2["dispatch_attempts"] >= 4, f"Expected attempts >= 4 after 70s, got {o2['dispatch_attempts']}"
        assert o2.get("dispatch_stalled") is True, "Order should be marked dispatch_stalled after ladder exhaustion"

        # Owner should have received a dispatch_stalled notification
        notif = db.notifications.find_one({
            "user_id": owner_user["id"],
            "order_id": oid,
            "type": "dispatch_stalled",
        })
        assert notif is not None, "Owner missing dispatch_stalled notification"

        # Cleanup
        db.orders.update_one({"id": oid}, {"$set": {"status": "cancelled"}})

    finally:
        # Restore rider state
        db.users.update_one({"phone": PHONE_RIDER}, {"$set": {
            "is_online": orig.get("is_online", True),
            "rider_verified": True,
        }})
        if disabled_ids:
            db.users.update_many({"id": {"$in": disabled_ids}}, {"$set": {"is_online": True}})
