"""
Backend tests for owner, rider, admin role endpoints (iteration 2).
Reuses public EXPO_PUBLIC_BACKEND_URL from frontend/.env.
"""
import os
import uuid
import time
import pytest
import requests
from pathlib import Path

FRONT_ENV = Path("/app/frontend/.env")
BASE_URL = None
for line in FRONT_ENV.read_text().splitlines():
    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
        BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
        break
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not found"
API = f"{BASE_URL}/api"
MASTER = "123456"


# ------------------------------------------------------------------
# Auth helpers
# ------------------------------------------------------------------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(session, phone, role, name=None):
    session.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    body = {"phone": phone, "code": MASTER, "role": role}
    if name:
        body["name"] = name
    r = session.post(f"{API}/auth/verify-otp", json=body, timeout=15)
    assert r.status_code == 200, f"login failed: {r.text}"
    return r.json()["token"], r.json()["user"]


@pytest.fixture(scope="session")
def admin_auth(session):
    return _login(session, "9999999999", "admin", "Admin Demo")


@pytest.fixture(scope="session")
def owner_auth(session):
    return _login(session, "8888888888", "restaurant_owner", "Owner Demo")


@pytest.fixture(scope="session")
def rider_auth(session):
    return _login(session, "7777777777", "rider", "Rider Demo")


@pytest.fixture(scope="session")
def customer_auth(session):
    phone = "9" + str(uuid.uuid4().int)[:9]
    return _login(session, phone, "customer", "TEST_Customer_R2")


def H(token):
    return {"Authorization": f"Bearer {token}"}


# ------------------------------------------------------------------
# OWNER
# ------------------------------------------------------------------
class TestOwner:
    def test_owner_list_restaurants(self, session, owner_auth):
        token, _ = owner_auth
        r = session.get(f"{API}/owner/restaurants", headers=H(token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # Seeded restaurants are owned by demo owner
        assert len(data) >= 1
        for d in data:
            assert "_id" not in d
            assert d.get("owner_id")

    def test_owner_stats(self, session, owner_auth):
        token, _ = owner_auth
        r = session.get(f"{API}/owner/stats", headers=H(token), timeout=15)
        assert r.status_code == 200
        b = r.json()
        for k in ("restaurants", "orders_today", "revenue", "active_orders"):
            assert k in b

    def test_owner_create_restaurant_and_menu_crud(self, session, owner_auth):
        token, _ = owner_auth
        payload = {
            "name": f"TEST_Owner_Rest_{uuid.uuid4().hex[:6]}",
            "image": "https://example.com/i.jpg",
            "cuisines": ["Indian", "Chinese"],
            "delivery_time": 25,
            "price_for_two": 350,
            "lat": 12.97,
            "lng": 77.59,
            "address": "TEST_Address",
        }
        rc = session.post(f"{API}/owner/restaurants", json=payload, headers=H(token), timeout=15)
        assert rc.status_code == 200, rc.text
        rest = rc.json()
        rid = rest["id"]
        assert rest["name"] == payload["name"]
        assert rest["status"] == "active"

        # Confirm via owner listing
        rl = session.get(f"{API}/owner/restaurants", headers=H(token), timeout=15).json()
        assert any(x["id"] == rid for x in rl)

        # Add menu item
        item_body = {
            "name": "TEST_Item",
            "description": "TEST desc",
            "price": 199,
            "image": "https://example.com/x.jpg",
            "category": "Main",
            "veg": True,
            "available": True,
        }
        ai = session.post(f"{API}/owner/restaurants/{rid}/menu", json=item_body, headers=H(token), timeout=15)
        assert ai.status_code == 200, ai.text
        item = ai.json()
        mid = item["id"]
        assert item["name"] == "TEST_Item"
        assert item["price"] == 199

        # Verify it appears in public restaurant detail (menu)
        det = session.get(f"{API}/restaurants/{rid}", timeout=15).json()
        assert any(m["id"] == mid for m in det["menu"])

        # Update item
        up = session.patch(f"{API}/owner/menu/{mid}", json={"price": 249, "name": "TEST_Item_Updated"},
                            headers=H(token), timeout=15)
        assert up.status_code == 200, up.text
        upj = up.json()
        assert upj["price"] == 249
        assert upj["name"] == "TEST_Item_Updated"

        # Delete item
        d = session.delete(f"{API}/owner/menu/{mid}", headers=H(token), timeout=15)
        assert d.status_code == 200
        assert d.json().get("ok") is True

        # Verify deletion
        det2 = session.get(f"{API}/restaurants/{rid}", timeout=15).json()
        assert not any(m["id"] == mid for m in det2["menu"])

    def test_owner_endpoints_require_owner_role(self, session, customer_auth):
        token, _ = customer_auth
        r = session.get(f"{API}/owner/restaurants", headers=H(token), timeout=15)
        assert r.status_code == 403

    def test_owner_cannot_edit_other_owner_item(self, session, owner_auth, customer_auth):
        # Use customer token to PATCH menu item of seeded restaurant
        token_c, _ = customer_auth
        # find seeded menu item
        rests = session.get(f"{API}/restaurants", timeout=15).json()
        det = session.get(f"{API}/restaurants/{rests[0]['id']}", timeout=15).json()
        mid = det["menu"][0]["id"]
        r = session.patch(f"{API}/owner/menu/{mid}", json={"price": 1}, headers=H(token_c), timeout=15)
        assert r.status_code == 403


# ------------------------------------------------------------------
# RIDER
# ------------------------------------------------------------------
class TestRider:
    @pytest.fixture(scope="class")
    def staged_order(self, session, customer_auth, owner_auth):
        """Create an order as customer, then move it to status=ready as owner."""
        token_c, _ = customer_auth
        token_o, _ = owner_auth
        rests = session.get(f"{API}/restaurants", timeout=15).json()
        rid = rests[0]["id"]
        det = session.get(f"{API}/restaurants/{rid}", timeout=15).json()
        items = [{"menu_item_id": det["menu"][0]["id"], "quantity": 1}]
        payload = {
            "restaurant_id": rid,
            "items": items,
            "address": {"label": "Home", "line1": "Rider Test St", "city": "Bengaluru", "lat": 12.97, "lng": 77.59},
            "payment_method": "cod",
        }
        o = session.post(f"{API}/orders", json=payload, headers=H(token_c), timeout=15)
        assert o.status_code == 200, o.text
        order = o.json()

        # Owner advances to ready
        for status in ("accepted", "preparing", "ready"):
            up = session.patch(f"{API}/orders/{order['id']}/status",
                               json={"status": status}, headers=H(token_o), timeout=15)
            assert up.status_code == 200, up.text
        return order

    def test_available_feed_lists_ready_orders(self, session, rider_auth, staged_order):
        token, _ = rider_auth
        r = session.get(f"{API}/orders/available/feed", headers=H(token), timeout=15)
        assert r.status_code == 200
        feed = r.json()
        assert isinstance(feed, list)
        ids = [o["id"] for o in feed]
        assert staged_order["id"] in ids
        for o in feed:
            assert o["rider_id"] is None

    def test_available_feed_requires_rider_role(self, session, customer_auth):
        token, _ = customer_auth
        r = session.get(f"{API}/orders/available/feed", headers=H(token), timeout=15)
        assert r.status_code == 403

    def test_assign_rider_and_pickup_deliver(self, session, rider_auth, staged_order):
        token, rider = rider_auth
        oid = staged_order["id"]
        # Accept
        a = session.post(f"{API}/orders/{oid}/assign-rider", headers=H(token), timeout=15)
        assert a.status_code == 200, a.text
        assert a.json()["rider_id"] == rider["id"]

        # Can't re-assign
        a2 = session.post(f"{API}/orders/{oid}/assign-rider", headers=H(token), timeout=15)
        assert a2.status_code == 400

        # Mark picked up
        p = session.patch(f"{API}/orders/{oid}/status", json={"status": "picked"},
                          headers=H(token), timeout=15)
        assert p.status_code == 200
        assert p.json()["status"] == "picked"

        # Simulate step (no auth required)
        s = session.post(f"{API}/orders/{oid}/simulate-rider-step", timeout=15)
        assert s.status_code == 200
        sb = s.json()
        assert "rider_lat" in sb and "rider_lng" in sb

        # Deliver
        d = session.patch(f"{API}/orders/{oid}/status", json={"status": "delivered"},
                          headers=H(token), timeout=15)
        assert d.status_code == 200
        assert d.json()["status"] == "delivered"

    def test_rider_cannot_set_accepted(self, session, rider_auth, customer_auth, owner_auth):
        # New order that is still 'placed' - rider trying to set "accepted" should be rejected
        token_c, _ = customer_auth
        token_r, _ = rider_auth
        rests = session.get(f"{API}/restaurants", timeout=15).json()
        rid = rests[0]["id"]
        det = session.get(f"{API}/restaurants/{rid}", timeout=15).json()
        items = [{"menu_item_id": det["menu"][0]["id"], "quantity": 1}]
        o = session.post(f"{API}/orders", json={
            "restaurant_id": rid, "items": items,
            "address": {"label": "Home", "line1": "x", "city": "Bengaluru", "lat": 12.97, "lng": 77.59},
            "payment_method": "cod",
        }, headers=H(token_c), timeout=15).json()
        r = session.patch(f"{API}/orders/{o['id']}/status", json={"status": "accepted"},
                          headers=H(token_r), timeout=15)
        assert r.status_code == 403


# ------------------------------------------------------------------
# ADMIN
# ------------------------------------------------------------------
class TestAdmin:
    def test_admin_stats(self, session, admin_auth):
        token, _ = admin_auth
        r = session.get(f"{API}/admin/stats", headers=H(token), timeout=15)
        assert r.status_code == 200
        b = r.json()
        for k in ("users", "restaurants", "orders", "revenue", "active_orders", "riders"):
            assert k in b
        assert b["users"] >= 1
        assert b["restaurants"] >= 1

    def test_admin_users_list(self, session, admin_auth):
        token, _ = admin_auth
        r = session.get(f"{API}/admin/users", headers=H(token), timeout=15)
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list)
        roles = {u["role"] for u in users}
        assert "admin" in roles
        # _id excluded
        for u in users:
            assert "_id" not in u
            assert "phone" in u and "role" in u

    def test_admin_orders_list(self, session, admin_auth):
        token, _ = admin_auth
        r = session.get(f"{API}/admin/orders", headers=H(token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_restaurants_list(self, session, admin_auth):
        token, _ = admin_auth
        r = session.get(f"{API}/admin/restaurants", headers=H(token), timeout=15)
        assert r.status_code == 200
        rests = r.json()
        assert isinstance(rests, list) and len(rests) >= 1
        for r0 in rests:
            assert "_id" not in r0
            assert "id" in r0

    def test_admin_toggle_restaurant_status_promote_offer(self, session, admin_auth):
        token, _ = admin_auth
        rests = session.get(f"{API}/admin/restaurants", headers=H(token), timeout=15).json()
        rid = rests[0]["id"]
        original_status = rests[0].get("status", "active")

        # Suspend
        r1 = session.patch(f"{API}/admin/restaurants/{rid}", json={"status": "suspended"},
                            headers=H(token), timeout=15)
        assert r1.status_code == 200
        assert r1.json()["status"] == "suspended"

        # Promote + offer
        r2 = session.patch(f"{API}/admin/restaurants/{rid}",
                            json={"is_promoted": True, "offer_text": "TEST_50% OFF"},
                            headers=H(token), timeout=15)
        assert r2.status_code == 200
        b = r2.json()
        assert b["is_promoted"] is True
        assert b["offer_text"] == "TEST_50% OFF"

        # Restore (cleanup)
        session.patch(f"{API}/admin/restaurants/{rid}",
                       json={"status": original_status, "is_promoted": False, "offer_text": None},
                       headers=H(token), timeout=15)

    def test_admin_endpoints_require_admin_role(self, session, customer_auth):
        token, _ = customer_auth
        r = session.get(f"{API}/admin/stats", headers=H(token), timeout=15)
        assert r.status_code == 403
        r2 = session.get(f"{API}/admin/users", headers=H(token), timeout=15)
        assert r2.status_code == 403
