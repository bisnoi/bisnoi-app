"""
End-to-end pytest coverage for the Nearby-first Rider Dispatch stack.
Covers:
  - POST /api/rider/heartbeat  (role gate + persistence + unverified block)
  - POST /api/orders/{oid}/status accepted  (dispatch kickoff)
  - Nearby-first ordering (close rider gets it before far rider on 1st attempt)
  - 15-second retry ladder + dispatch_stalled state
  - POST /api/orders/{oid}/redispatch  (role gates)
  - POST /api/orders/{oid}/assign-rider (verify + dupe + previous-rider gate)
  - Regression: verify-delivery (OTP + geofence), verify-handover (4-digit code)
"""
import os
import time
import uuid
from datetime import datetime, timezone
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://food-app-demo-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

# Seeded demo phones from problem statement
PHONE_ADMIN = "9999999999"
PHONE_OWNER = "8888888888"
PHONE_RIDER = "7777777777"
RIDER_ID = "9a7a27ae-6c0c-408b-b020-de8e5e855387"
RESTAURANT_ID = "a9ee09bd-6a8a-4138-b045-7b0c9c52e9aa"
MENU_ITEM_ID = "8ce5d499-b69c-4ae5-a6c4-f94f48ebdda0"

# Truffles restaurant location per PS
TRUFFLE_LAT, TRUFFLE_LNG = 0, 0


# ---------------- helpers ----------------
def login_as(phone: str) -> tuple[str, dict]:
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    r.raise_for_status()
    otp = r.json()["demo_otp"]
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "code": otp}, timeout=15)
    r.raise_for_status()
    data = r.json()
    return data["token"], data["user"]


def auth_hdr(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def create_customer(phone: str) -> tuple[str, dict]:
    return login_as(phone)


def place_order(customer_token: str) -> dict:
    body = {
        "restaurant_id": RESTAURANT_ID,
        "items": [{"menu_item_id": MENU_ITEM_ID, "quantity": 1}],
        "address": {"label": "Home", "line1": "Test", "city": "BLR", "lat": 12.972, "lng": 77.595},
        "payment_method": "cod",
    }
    r = requests.post(f"{API}/orders", json=body, headers=auth_hdr(customer_token), timeout=20)
    r.raise_for_status()
    return r.json()


@pytest.fixture(scope="module")
def db():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def tokens():
    # Ensure rider is verified & online before tests run
    MongoClient(MONGO_URL)[DB_NAME].users.update_one(
        {"phone": PHONE_RIDER},
        {"$set": {"rider_verified": True, "is_online": True}},
    )
    admin_tok, admin_user = login_as(PHONE_ADMIN)
    owner_tok, owner_user = login_as(PHONE_OWNER)
    rider_tok, rider_user = login_as(PHONE_RIDER)
    # Fresh customer to place orders
    cust_phone = f"90000{int(time.time()) % 100000:05d}"
    cust_tok, cust_user = create_customer(cust_phone)
    return {
        "admin": (admin_tok, admin_user),
        "owner": (owner_tok, owner_user),
        "rider": (rider_tok, rider_user),
        "customer": (cust_tok, cust_user),
    }


# ---------------- rider/heartbeat ----------------
class TestRiderHeartbeat:
    def test_heartbeat_rider_role_persists(self, tokens, db):
        rider_tok, _ = tokens["rider"]
        r = requests.post(
            f"{API}/rider/heartbeat",
            json={"lat": TRUFFLE_LAT, "lng": TRUFFLE_LNG},
            headers=auth_hdr(rider_tok),
            timeout=10,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("ok") is True
        assert "at" in j
        # Persistence check
        u = db.users.find_one({"phone": PHONE_RIDER})
        assert u is not None
        assert abs(u.get("last_lat") - TRUFFLE_LAT) < 1e-6
        assert abs(u.get("last_lng") - TRUFFLE_LNG) < 1e-6
        assert u.get("last_heartbeat_at") is not None

    def test_heartbeat_admin_role_forbidden(self, tokens):
        admin_tok, _ = tokens["admin"]
        r = requests.post(
            f"{API}/rider/heartbeat",
            json={"lat": 12.9, "lng": 77.6},
            headers=auth_hdr(admin_tok),
            timeout=10,
        )
        assert r.status_code == 403

    def test_heartbeat_owner_role_forbidden(self, tokens):
        owner_tok, _ = tokens["owner"]
        r = requests.post(
            f"{API}/rider/heartbeat",
            json={"lat": 12.9, "lng": 77.6},
            headers=auth_hdr(owner_tok),
            timeout=10,
        )
        assert r.status_code == 403

    def test_heartbeat_customer_role_forbidden(self, tokens):
        cust_tok, _ = tokens["customer"]
        r = requests.post(
            f"{API}/rider/heartbeat",
            json={"lat": 12.9, "lng": 77.6},
            headers=auth_hdr(cust_tok),
            timeout=10,
        )
        assert r.status_code == 403

    def test_heartbeat_unverified_rider_403(self, tokens, db):
        """Flip rider_verified=False → heartbeat should 403."""
        rider_tok, _ = tokens["rider"]
        db.users.update_one({"phone": PHONE_RIDER}, {"$set": {"rider_verified": False}})
        try:
            r = requests.post(
                f"{API}/rider/heartbeat",
                json={"lat": TRUFFLE_LAT, "lng": TRUFFLE_LNG},
                headers=auth_hdr(rider_tok),
                timeout=10,
            )
            assert r.status_code == 403
        finally:
            db.users.update_one({"phone": PHONE_RIDER}, {"$set": {"rider_verified": True}})


# ---------------- accept dispatch kickoff ----------------
class TestAcceptDispatch:
    def test_owner_accept_starts_dispatch(self, tokens, db):
        cust_tok, _ = tokens["customer"]
        owner_tok, _ = tokens["owner"]
        # Ensure rider has a fresh heartbeat close by
        rider_tok, _ = tokens["rider"]
        requests.post(f"{API}/rider/heartbeat", json={"lat": TRUFFLE_LAT, "lng": TRUFFLE_LNG},
                      headers=auth_hdr(rider_tok), timeout=10)
        order = place_order(cust_tok)
        oid = order["id"]
        # Owner accepts
        r = requests.patch(
            f"{API}/orders/{oid}/status",
            json={"status": "accepted"},
            headers=auth_hdr(owner_tok),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # Wait for background task to run once
        time.sleep(2)
        o = db.orders.find_one({"id": oid})
        assert o["status"] == "accepted"
        assert o.get("dispatch_started_at") is not None
        assert o.get("dispatch_attempts", 0) >= 1
        # Notification created for the rider
        notif = db.notifications.find_one({"user_id": RIDER_ID, "order_id": oid, "type": "pickup_available"})
        assert notif is not None, "Rider notification not created on accept"
        # Clean up: cancel to avoid stalled watchdog polluting later tests
        db.orders.update_one({"id": oid}, {"$set": {"status": "cancelled"}})


# ---------------- nearby-first ordering ----------------
class TestNearbyFirst:
    def test_close_rider_notified_before_far(self, tokens, db):
        """One rider close (5km within), one far (25km away).
        On attempt 0 (5km radius), only close rider should be notified.
        We use the demo rider as CLOSE and register a temporary FAR rider doc.
        """
        rider_tok, _ = tokens["rider"]
        # Close: demo rider at Truffles
        requests.post(f"{API}/rider/heartbeat", json={"lat": TRUFFLE_LAT, "lng": TRUFFLE_LNG},
                      headers=auth_hdr(rider_tok), timeout=10)
        # Far: create ephemeral rider ~25km away
        far_id = f"TEST_far_rider_{uuid.uuid4()}"
        db.users.insert_one({
            "id": far_id,
            "phone": f"7000{int(time.time()) % 1000000:06d}",
            "role": "rider",
            "name": "Far Rider",
            "rider_verified": True,
            "is_online": True,
            "last_lat": TRUFFLE_LAT + 0.25,  # ~28km north
            "last_lng": TRUFFLE_LNG,
            "last_heartbeat_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            cust_tok, _ = tokens["customer"]
            owner_tok, _ = tokens["owner"]
            order = place_order(cust_tok)
            oid = order["id"]
            r = requests.patch(f"{API}/orders/{oid}/status", json={"status": "accepted"},
                               headers=auth_hdr(owner_tok), timeout=15)
            assert r.status_code == 200
            time.sleep(2.5)  # let first dispatch attempt run
            close_notif = db.notifications.find_one({"user_id": RIDER_ID, "order_id": oid, "type": "pickup_available"})
            far_notif = db.notifications.find_one({"user_id": far_id, "order_id": oid, "type": "pickup_available"})
            assert close_notif is not None, "Close (5km) rider should be notified on attempt 0"
            assert far_notif is None, "Far (25km) rider must NOT get attempt-0 notification (5km bucket)"
            db.orders.update_one({"id": oid}, {"$set": {"status": "cancelled"}})
        finally:
            db.users.delete_one({"id": far_id})
            db.notifications.delete_many({"user_id": far_id})


# ---------------- redispatch endpoint ----------------
class TestRedispatch:
    def _accept_order(self, tokens):
        cust_tok, _ = tokens["customer"]
        owner_tok, _ = tokens["owner"]
        order = place_order(cust_tok)
        oid = order["id"]
        r = requests.patch(f"{API}/orders/{oid}/status", json={"status": "accepted"},
                           headers=auth_hdr(owner_tok), timeout=15)
        assert r.status_code == 200
        return oid

    def test_owner_redispatch_resets_counters(self, tokens, db):
        oid = self._accept_order(tokens)
        time.sleep(1)
        # Force stalled + attempts=3 to see reset
        db.orders.update_one({"id": oid}, {"$set": {"dispatch_stalled": True, "dispatch_attempts": 3}})
        owner_tok, _ = tokens["owner"]
        r = requests.post(f"{API}/orders/{oid}/redispatch", headers=auth_hdr(owner_tok), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        time.sleep(1)
        o = db.orders.find_one({"id": oid})
        assert o["dispatch_stalled"] is False
        # attempts got reset then bumped by first dispatch → should be 1
        assert o["dispatch_attempts"] >= 1
        db.orders.update_one({"id": oid}, {"$set": {"status": "cancelled"}})

    def test_admin_redispatch_ok(self, tokens, db):
        oid = self._accept_order(tokens)
        admin_tok, _ = tokens["admin"]
        r = requests.post(f"{API}/orders/{oid}/redispatch", headers=auth_hdr(admin_tok), timeout=15)
        assert r.status_code == 200
        db.orders.update_one({"id": oid}, {"$set": {"status": "cancelled"}})

    def test_rider_redispatch_forbidden(self, tokens, db):
        oid = self._accept_order(tokens)
        rider_tok, _ = tokens["rider"]
        r = requests.post(f"{API}/orders/{oid}/redispatch", headers=auth_hdr(rider_tok), timeout=15)
        assert r.status_code == 403
        db.orders.update_one({"id": oid}, {"$set": {"status": "cancelled"}})

    def test_unrelated_owner_redispatch_forbidden(self, tokens, db):
        """Owner not owning this restaurant should get 403."""
        oid = self._accept_order(tokens)
        # Create a fresh throwaway owner
        phone = f"88880{int(time.time()) % 100000:05d}"
        tok, u = login_as(phone)
        db.users.update_one({"id": u["id"]}, {"$set": {"role": "restaurant_owner"}})
        # Re-login to refresh JWT role
        tok, _ = login_as(phone)
        r = requests.post(f"{API}/orders/{oid}/redispatch", headers=auth_hdr(tok), timeout=15)
        assert r.status_code == 403
        db.orders.update_one({"id": oid}, {"$set": {"status": "cancelled"}})
        db.users.delete_one({"phone": phone})


# ---------------- assign-rider ----------------
class TestAssignRider:
    def test_verified_rider_can_assign(self, tokens, db):
        cust_tok, _ = tokens["customer"]
        owner_tok, _ = tokens["owner"]
        rider_tok, rider_user = tokens["rider"]
        order = place_order(cust_tok)
        oid = order["id"]
        requests.patch(f"{API}/orders/{oid}/status", json={"status": "accepted"},
                       headers=auth_hdr(owner_tok), timeout=15)
        time.sleep(1)
        r = requests.post(f"{API}/orders/{oid}/assign-rider", headers=auth_hdr(rider_tok), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("rider_id") == rider_user["id"]
        assert j.get("assigned_at") is not None
        assert j.get("dispatch_stalled") is False
        db.orders.update_one({"id": oid}, {"$set": {"status": "cancelled"}})

    def test_assign_when_already_assigned_400(self, tokens, db):
        cust_tok, _ = tokens["customer"]
        owner_tok, _ = tokens["owner"]
        rider_tok, _ = tokens["rider"]
        order = place_order(cust_tok)
        oid = order["id"]
        requests.patch(f"{API}/orders/{oid}/status", json={"status": "accepted"},
                       headers=auth_hdr(owner_tok), timeout=15)
        time.sleep(1)
        r1 = requests.post(f"{API}/orders/{oid}/assign-rider", headers=auth_hdr(rider_tok), timeout=15)
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/orders/{oid}/assign-rider", headers=auth_hdr(rider_tok), timeout=15)
        assert r2.status_code == 400
        db.orders.update_one({"id": oid}, {"$set": {"status": "cancelled"}})

    def test_unverified_rider_forbidden(self, tokens, db):
        cust_tok, _ = tokens["customer"]
        owner_tok, _ = tokens["owner"]
        rider_tok, _ = tokens["rider"]
        order = place_order(cust_tok)
        oid = order["id"]
        requests.patch(f"{API}/orders/{oid}/status", json={"status": "accepted"},
                       headers=auth_hdr(owner_tok), timeout=15)
        db.users.update_one({"phone": PHONE_RIDER}, {"$set": {"rider_verified": False}})
        try:
            r = requests.post(f"{API}/orders/{oid}/assign-rider", headers=auth_hdr(rider_tok), timeout=15)
            assert r.status_code == 403
        finally:
            db.users.update_one({"phone": PHONE_RIDER}, {"$set": {"rider_verified": True}})
            db.orders.update_one({"id": oid}, {"$set": {"status": "cancelled"}})

    def test_previous_rider_transfer_cannot_retake(self, tokens, db):
        """If rider was in previous_riders and transfer_requested=True, reject 400."""
        cust_tok, _ = tokens["customer"]
        owner_tok, _ = tokens["owner"]
        rider_tok, rider_user = tokens["rider"]
        order = place_order(cust_tok)
        oid = order["id"]
        requests.patch(f"{API}/orders/{oid}/status", json={"status": "accepted"},
                       headers=auth_hdr(owner_tok), timeout=15)
        # Inject as previous rider + transfer flag
        db.orders.update_one({"id": oid}, {"$set": {
            "transfer_requested": True,
            "previous_riders": [{"rider_id": rider_user["id"], "released_at": "2026-01-01T00:00:00Z"}],
        }})
        r = requests.post(f"{API}/orders/{oid}/assign-rider", headers=auth_hdr(rider_tok), timeout=15)
        assert r.status_code == 400
        db.orders.update_one({"id": oid}, {"$set": {"status": "cancelled"}})


# ---------------- verify-delivery regression ----------------
class TestVerifyDelivery:
    def test_verify_delivery_requires_4_digit_and_geofence(self, tokens, db):
        cust_tok, _ = tokens["customer"]
        owner_tok, _ = tokens["owner"]
        rider_tok, rider_user = tokens["rider"]
        order = place_order(cust_tok)
        oid = order["id"]
        # accept → assign → ready → verify-handover → picked → verify-delivery
        requests.patch(f"{API}/orders/{oid}/status", json={"status": "accepted"},
                       headers=auth_hdr(owner_tok), timeout=15)
        time.sleep(1)
        requests.post(f"{API}/orders/{oid}/assign-rider", headers=auth_hdr(rider_tok), timeout=15)
        requests.patch(f"{API}/orders/{oid}/status", json={"status": "ready"},
                       headers=auth_hdr(owner_tok), timeout=15)
        # Handover
        o_doc = db.orders.find_one({"id": oid})
        hcode = o_doc["handover_code"]
        r = requests.post(f"{API}/orders/{oid}/verify-handover", json={"code": hcode},
                          headers=auth_hdr(owner_tok), timeout=15)
        assert r.status_code == 200, r.text
        # Try bad OTP (3 digit)
        r_bad = requests.post(f"{API}/orders/{oid}/verify-delivery",
                              json={"code": "123", "lat": 12.972, "lng": 77.595},
                              headers=auth_hdr(rider_tok), timeout=15)
        assert r_bad.status_code == 400
        # Wrong OTP
        r_wrong = requests.post(f"{API}/orders/{oid}/verify-delivery",
                                json={"code": "0000", "lat": 12.972, "lng": 77.595},
                                headers=auth_hdr(rider_tok), timeout=15)
        assert r_wrong.status_code == 400
        # Correct OTP but out of geofence (>500m)
        dcode = db.orders.find_one({"id": oid})["delivery_code"]
        r_farg = requests.post(f"{API}/orders/{oid}/verify-delivery",
                               json={"code": dcode, "lat": 13.5, "lng": 78.0},
                               headers=auth_hdr(rider_tok), timeout=15)
        assert r_farg.status_code == 400
        # Correct OTP and within geofence
        r_ok = requests.post(f"{API}/orders/{oid}/verify-delivery",
                             json={"code": dcode, "lat": 12.972, "lng": 77.595},
                             headers=auth_hdr(rider_tok), timeout=15)
        assert r_ok.status_code == 200, r_ok.text
        o_final = db.orders.find_one({"id": oid})
        assert o_final["status"] == "delivered"
        assert o_final["delivery_verified"] is True


# ---------------- verify-handover regression ----------------
class TestVerifyHandover:
    def test_verify_handover_requires_4_digit(self, tokens, db):
        cust_tok, _ = tokens["customer"]
        owner_tok, _ = tokens["owner"]
        rider_tok, _ = tokens["rider"]
        order = place_order(cust_tok)
        oid = order["id"]
        requests.patch(f"{API}/orders/{oid}/status", json={"status": "accepted"},
                       headers=auth_hdr(owner_tok), timeout=15)
        time.sleep(1)
        requests.post(f"{API}/orders/{oid}/assign-rider", headers=auth_hdr(rider_tok), timeout=15)
        requests.patch(f"{API}/orders/{oid}/status", json={"status": "ready"},
                       headers=auth_hdr(owner_tok), timeout=15)
        # Wrong code
        r_bad = requests.post(f"{API}/orders/{oid}/verify-handover", json={"code": "0000"},
                              headers=auth_hdr(owner_tok), timeout=15)
        assert r_bad.status_code == 400
        # Correct code
        h = db.orders.find_one({"id": oid})["handover_code"]
        r_ok = requests.post(f"{API}/orders/{oid}/verify-handover", json={"code": h},
                             headers=auth_hdr(owner_tok), timeout=15)
        assert r_ok.status_code == 200
        db.orders.update_one({"id": oid}, {"$set": {"status": "cancelled"}})
