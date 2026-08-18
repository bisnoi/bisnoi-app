"""Smoke tests after zip restore - Bisnoi food delivery app."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://bisnoi-live.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Restaurants ----------
class TestRestaurants:
    def test_list_restaurants(self, api):
        r = api.get(f"{BASE_URL}/api/restaurants", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        assert len(data) > 0, "No restaurants seeded"
        # First restaurant sanity checks
        r0 = data[0]
        assert "id" in r0 or "_id" in r0 or "restaurant_id" in r0
        assert "name" in r0
        print(f"Restaurants count: {len(data)}; first: {r0.get('name')}")

    def test_restaurant_detail(self, api):
        lst = api.get(f"{BASE_URL}/api/restaurants", timeout=15).json()
        rid = lst[0].get("id") or lst[0].get("_id") or lst[0].get("restaurant_id")
        if not rid:
            pytest.skip("No id field on restaurant")
        r = api.get(f"{BASE_URL}/api/restaurants/{rid}", timeout=15)
        assert r.status_code == 200, r.text
        payload = r.json()
        detail = payload.get("restaurant", payload)
        assert detail.get("name")
        assert isinstance(payload.get("menu", []), list)


# ---------- Auth OTP demo mode ----------
class TestAuthOtp:
    def test_send_otp_returns_demo(self, api):
        r = api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": "8888888888"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("sent") is True
        assert "demo_otp" in data and len(str(data["demo_otp"])) == 6

    def test_verify_otp_login_owner(self, api):
        phone = "8888888888"
        r1 = api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=15)
        otp = r1.json()["demo_otp"]
        r2 = api.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": phone, "code": otp}, timeout=15)
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data.get("token") or data.get("access_token"), f"No token in response: {data}"
        user = data.get("user") or {}
        assert user.get("phone") == phone or data.get("phone") == phone
        print(f"Owner login user role: {user.get('role')}")

    def test_verify_otp_new_customer(self, api):
        # Use a random unseeded phone to trigger customer auto-create
        import random
        phone = f"98{random.randint(10000000, 99999999)}"
        r1 = api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=15)
        assert r1.status_code == 200
        otp = r1.json()["demo_otp"]
        r2 = api.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": phone, "code": otp}, timeout=15)
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data.get("token") or data.get("access_token")
        user = data.get("user") or {}
        assert user.get("role") == "customer", f"Expected customer, got role={user.get('role')}"

    def test_verify_otp_wrong(self, api):
        phone = "8888888888"
        api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=15)
        r = api.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": phone, "code": "000000"}, timeout=15)
        assert r.status_code in (400, 401, 403), f"Expected reject, got {r.status_code}"
