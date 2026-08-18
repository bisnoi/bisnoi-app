"""
Backend tests for Zomato clone (auth, restaurants, coupons, orders, rider sim).
Uses public EXPO_PUBLIC_BACKEND_URL from frontend/.env (no localhost).
"""
import os
import time
import uuid
import pytest
import requests
from pathlib import Path

# Read public URL from frontend/.env
FRONT_ENV = Path("/app/frontend/.env")
BASE_URL = None
for line in FRONT_ENV.read_text().splitlines():
    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
        BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
        break
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not found in frontend/.env"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def customer_auth(session):
    """Create a unique customer via demo OTP and return (token, user, phone)."""
    phone = "9" + str(uuid.uuid4().int)[:9]
    r = session.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("sent") is True
    code = data.get("demo_otp")
    assert code and len(code) == 6

    r2 = session.post(f"{API}/auth/verify-otp",
                      json={"phone": phone, "code": code, "role": "customer", "name": "TEST_Customer"},
                      timeout=15)
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert "token" in body and "user" in body
    assert body["user"]["role"] == "customer"
    assert body["user"]["phone"] == phone
    return body["token"], body["user"], phone


# ----------------------- Auth -----------------------
class TestAuth:
    def test_send_otp_returns_demo_code(self, session):
        phone = "9" + str(uuid.uuid4().int)[:9]
        r = session.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
        assert r.status_code == 200
        b = r.json()
        assert b["sent"] is True
        assert isinstance(b.get("demo_otp"), str) and len(b["demo_otp"]) == 6

    def test_verify_otp_master_code_works(self, session):
        phone = "9" + str(uuid.uuid4().int)[:9]
        # don't even send otp - master 123456 should work
        session.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
        r = session.post(f"{API}/auth/verify-otp",
                         json={"phone": phone, "code": "123456", "role": "customer"}, timeout=15)
        assert r.status_code == 200, r.text
        assert "token" in r.json()

    def test_verify_otp_invalid_code(self, session):
        phone = "9" + str(uuid.uuid4().int)[:9]
        session.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
        r = session.post(f"{API}/auth/verify-otp",
                         json={"phone": phone, "code": "000000", "role": "customer"}, timeout=15)
        assert r.status_code == 400

    def test_me_requires_token(self, session):
        r = session.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_returns_profile(self, session, customer_auth):
        token, user, _ = customer_auth
        r = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["id"] == user["id"]
        assert body["role"] == "customer"


# ----------------------- Public listing -----------------------
class TestPublicData:
    def test_categories(self, session):
        r = session.get(f"{API}/categories", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 4
        assert "name" in data[0] and "image" in data[0]

    def test_restaurants_list(self, session):
        r = session.get(f"{API}/restaurants", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 1
        # ensure no _id leaked
        assert all("_id" not in d for d in data)
        # validate fields
        first = data[0]
        for k in ("id", "name", "cuisines", "rating", "delivery_time", "price_for_two"):
            assert k in first

    def test_restaurants_search_q(self, session):
        r = session.get(f"{API}/restaurants", params={"q": "Truffles"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert any("Truffles" in d["name"] for d in data)

    def test_restaurants_cuisine_filter(self, session):
        r = session.get(f"{API}/restaurants", params={"cuisine": "Pizza"}, timeout=15)
        assert r.status_code == 200
        for d in r.json():
            assert "Pizza" in d["cuisines"]

    def test_restaurants_sort_rating(self, session):
        r = session.get(f"{API}/restaurants", params={"sort": "rating"}, timeout=15)
        assert r.status_code == 200
        ratings = [d["rating"] for d in r.json()]
        assert ratings == sorted(ratings, reverse=True)

    def test_restaurant_detail(self, session):
        r = session.get(f"{API}/restaurants", timeout=15).json()
        rid = r[0]["id"]
        r2 = session.get(f"{API}/restaurants/{rid}", timeout=15)
        assert r2.status_code == 200
        body = r2.json()
        assert "restaurant" in body and "menu" in body and "reviews" in body
        assert body["restaurant"]["id"] == rid
        assert isinstance(body["menu"], list) and len(body["menu"]) >= 1

    def test_restaurant_detail_404(self, session):
        r = session.get(f"{API}/restaurants/does-not-exist", timeout=15)
        assert r.status_code == 404

    def test_coupons(self, session):
        r = session.get(f"{API}/coupons", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 1
        codes = [c["code"] for c in data]
        assert "WELCOME50" in codes


# ----------------------- Orders -----------------------
class TestOrders:
    @pytest.fixture(scope="class")
    def order_id_and_token(self, session, customer_auth):
        token, user, phone = customer_auth
        rests = session.get(f"{API}/restaurants", timeout=15).json()
        rid = rests[0]["id"]
        detail = session.get(f"{API}/restaurants/{rid}", timeout=15).json()
        menu = detail["menu"]
        items = [{"menu_item_id": menu[0]["id"], "quantity": 2}]
        payload = {
            "restaurant_id": rid,
            "items": items,
            "address": {"label": "Home", "line1": "123 Test St", "city": "Bengaluru", "lat": 12.97, "lng": 77.59},
            "payment_method": "cod",
            "coupon_code": "WELCOME50",
        }
        r = session.post(f"{API}/orders", json=payload,
                         headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r.status_code == 200, r.text
        order = r.json()
        return order, token

    def test_create_order_requires_auth(self, session):
        r = session.post(f"{API}/orders", json={"restaurant_id": "x", "items": [],
                          "address": {"line1": "x"}}, timeout=15)
        assert r.status_code == 401

    def test_create_order_persists(self, session, order_id_and_token):
        order, token = order_id_and_token
        assert order["status"] == "placed"
        assert order["payment_method"] == "cod"
        assert order["payment_status"] == "pending"
        assert order["subtotal"] > 0
        assert order["total"] >= 0
        # GET to verify persistence
        r = session.get(f"{API}/orders/{order['id']}",
                        headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == order["id"]

    def test_my_orders(self, session, order_id_and_token):
        order, token = order_id_and_token
        r = session.get(f"{API}/orders/mine",
                        headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r.status_code == 200
        ids = [o["id"] for o in r.json()]
        assert order["id"] in ids

    def test_simulate_rider_step(self, session, order_id_and_token):
        order, _ = order_id_and_token
        r = session.post(f"{API}/orders/{order['id']}/simulate-rider-step", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "rider_lat" in body and "rider_lng" in body
        # lat should move toward 12.97
        assert isinstance(body["rider_lat"], (int, float))

    def test_create_order_invalid_restaurant(self, session, customer_auth):
        token, _, _ = customer_auth
        r = session.post(f"{API}/orders",
                         json={"restaurant_id": "missing", "items": [],
                               "address": {"line1": "x"}, "payment_method": "cod"},
                         headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r.status_code == 404

    def test_non_customer_cannot_create_order(self, session):
        # create rider user
        phone = "9" + str(uuid.uuid4().int)[:9]
        session.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
        login = session.post(f"{API}/auth/verify-otp",
                             json={"phone": phone, "code": "123456", "role": "rider"}, timeout=15).json()
        rid = session.get(f"{API}/restaurants", timeout=15).json()[0]["id"]
        r = session.post(f"{API}/orders",
                         json={"restaurant_id": rid, "items": [], "address": {"line1": "x"},
                               "payment_method": "cod"},
                         headers={"Authorization": f"Bearer {login['token']}"}, timeout=15)
        assert r.status_code == 403
