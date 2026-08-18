"""
Iteration 5 backend tests — Phase 1 & 2 of Admin Restaurant CRUD & Owner Lockdown.

Covers:
 - POST /api/admin/restaurants with all extended fields
 - GET  /api/admin/restaurants
 - PATCH /api/admin/restaurants/{rid}
 - DELETE /api/admin/restaurants/{rid}
 - POST /api/admin/restaurants/{rid}/assign-owner (by phone + unassign)
 - 403 for non-admin tokens
 - 403 for owner POST /api/owner/restaurants
 - Owner GET /api/owner/restaurants still works
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _login(phone: str, role: str = None):
    requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    body = {"phone": phone, "code": "123456"}
    if role:
        body["role"] = role
    r = requests.post(f"{API}/auth/verify-otp", json=body, timeout=15)
    r.raise_for_status()
    return r.json()["token"], r.json()["user"]


@pytest.fixture(scope="module")
def admin_token():
    token, _ = _login("9999999999")
    return token


@pytest.fixture(scope="module")
def owner_token():
    token, _ = _login("8888888888")
    return token


@pytest.fixture(scope="module")
def customer_token():
    # New ephemeral customer
    phone = f"99{uuid.uuid4().int % 10**8:08d}"
    token, _ = _login(phone, role="customer")
    return token


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------------- Admin restaurant CRUD ----------------
class TestAdminRestaurantCRUD:
    created_id = None

    def test_a_create_with_all_fields(self, admin_token):
        body = {
            "name": "TEST_Spice Junction",
            "image": "https://example.com/img.jpg",
            "cuisines": ["North Indian", "Chinese"],
            "delivery_time": 35,
            "price_for_two": 550,
            "lat": 12.97,
            "lng": 77.59,
            "address": "TEST 12 MG Road",
            "description": "Hot & spicy",
            "contact_phone": "9000000001",
            "contact_email": "spice@example.com",
            "fssai_license": "12345678901234",
            "gst_number": "29ABCDE1234F1Z5",
            "bank_account_name": "Spice Junction Pvt Ltd",
            "bank_account_number": "1234567890",
            "bank_ifsc": "HDFC0001234",
            "delivery_radius_km": 7.5,
            "operating_hours": [
                {"day": "mon", "open": "09:00", "close": "23:00", "closed": True},
                {"day": "tue", "open": "09:00", "close": "23:00", "closed": False},
                {"day": "wed", "open": "09:00", "close": "23:00", "closed": False},
                {"day": "thu", "open": "09:00", "close": "23:00", "closed": False},
                {"day": "fri", "open": "09:00", "close": "23:00", "closed": False},
                {"day": "sat", "open": "10:00", "close": "23:30", "closed": False},
                {"day": "sun", "open": "10:00", "close": "22:00", "closed": False},
            ],
            "city": "Bengaluru",
            "pincode": "560001",
            "is_active": True,
        }
        r = requests.post(f"{API}/admin/restaurants", json=body, headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "TEST_Spice Junction"
        assert data["fssai_license"] == "12345678901234"
        assert data["gst_number"] == "29ABCDE1234F1Z5"
        assert data["bank_ifsc"] == "HDFC0001234"
        assert data["delivery_radius_km"] == 7.5
        assert len(data["operating_hours"]) == 7
        assert data["operating_hours"][0]["closed"] is True
        assert data["pincode"] == "560001"
        assert data["status"] == "active"
        assert data["is_promoted"] is False
        TestAdminRestaurantCRUD.created_id = data["id"]

    def test_b_get_persisted(self, admin_token):
        rid = TestAdminRestaurantCRUD.created_id
        assert rid
        r = requests.get(f"{API}/admin/restaurants", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert rid in ids

    def test_c_patch_partial_update(self, admin_token):
        rid = TestAdminRestaurantCRUD.created_id
        r = requests.patch(
            f"{API}/admin/restaurants/{rid}",
            json={"description": "Updated desc", "delivery_radius_km": 10.0, "is_promoted": True, "offer_text": "Flat 30% off"},
            headers=_h(admin_token), timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["description"] == "Updated desc"
        assert data["delivery_radius_km"] == 10.0
        assert data["is_promoted"] is True
        assert data["offer_text"] == "Flat 30% off"

    def test_d_patch_status_suspend(self, admin_token):
        rid = TestAdminRestaurantCRUD.created_id
        r = requests.patch(f"{API}/admin/restaurants/{rid}", json={"status": "suspended"},
                           headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "suspended"

    def test_e_assign_owner_by_phone(self, admin_token):
        rid = TestAdminRestaurantCRUD.created_id
        r = requests.post(f"{API}/admin/restaurants/{rid}/assign-owner",
                          json={"owner_phone": "8888888888"},
                          headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["owner_id"] is not None

    def test_f_unassign_owner(self, admin_token):
        rid = TestAdminRestaurantCRUD.created_id
        r = requests.post(f"{API}/admin/restaurants/{rid}/assign-owner",
                          json={"owner_id": None},
                          headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["owner_id"] is None

    def test_g_assign_owner_bad_phone(self, admin_token):
        rid = TestAdminRestaurantCRUD.created_id
        r = requests.post(f"{API}/admin/restaurants/{rid}/assign-owner",
                          json={"owner_phone": "0000000000"},
                          headers=_h(admin_token), timeout=15)
        assert r.status_code == 404

    def test_h_delete(self, admin_token):
        rid = TestAdminRestaurantCRUD.created_id
        r = requests.delete(f"{API}/admin/restaurants/{rid}", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        # Verify gone
        r2 = requests.get(f"{API}/admin/restaurants", headers=_h(admin_token), timeout=15)
        ids = [x["id"] for x in r2.json()]
        assert rid not in ids


# ---------------- Role enforcement ----------------
class TestRoleEnforcement:
    def test_admin_create_with_owner_token_forbidden(self, owner_token):
        r = requests.post(f"{API}/admin/restaurants",
                          json={"name": "TEST_BlockedOwner", "address": "x"},
                          headers=_h(owner_token), timeout=15)
        assert r.status_code == 403

    def test_admin_create_with_customer_token_forbidden(self, customer_token):
        r = requests.post(f"{API}/admin/restaurants",
                          json={"name": "TEST_BlockedCust", "address": "x"},
                          headers=_h(customer_token), timeout=15)
        assert r.status_code == 403

    def test_admin_create_without_token_unauth(self):
        r = requests.post(f"{API}/admin/restaurants",
                          json={"name": "TEST_NoAuth", "address": "x"}, timeout=15)
        assert r.status_code == 401

    def test_admin_list_with_owner_token_forbidden(self, owner_token):
        r = requests.get(f"{API}/admin/restaurants", headers=_h(owner_token), timeout=15)
        assert r.status_code == 403

    def test_admin_assign_owner_with_customer_token_forbidden(self, customer_token):
        # any rid; permission check happens first
        r = requests.post(f"{API}/admin/restaurants/anyid/assign-owner",
                          json={"owner_phone": "8888888888"},
                          headers=_h(customer_token), timeout=15)
        assert r.status_code == 403


# ---------------- Owner restriction & menu still works ----------------
class TestOwnerRestrictions:
    def test_owner_cannot_create_restaurant(self, owner_token):
        r = requests.post(f"{API}/owner/restaurants",
                          json={"name": "TEST_OwnerCreate"},
                          headers=_h(owner_token), timeout=15)
        # By design — owner_create_restaurant_forbidden returns 403
        assert r.status_code == 403

    def test_owner_can_list_own_restaurants(self, owner_token):
        r = requests.get(f"{API}/owner/restaurants", headers=_h(owner_token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_owner_menu_crud(self, owner_token):
        # Find a restaurant owned by demo owner
        r = requests.get(f"{API}/owner/restaurants", headers=_h(owner_token), timeout=15)
        assert r.status_code == 200
        rests = r.json()
        if not rests:
            pytest.skip("Owner has no assigned restaurant — re-run after admin assigns one")
        rid = rests[0]["id"]
        # Create
        create_body = {"name": "TEST_Owner_Item", "price": 99, "description": "x", "category": "Test"}
        rc = requests.post(f"{API}/owner/menu", json=create_body, headers=_h(owner_token), timeout=15)
        assert rc.status_code == 200, rc.text
        item = rc.json()
        mid = item["id"]
        assert item["name"] == "TEST_Owner_Item"
        assert item["restaurant_id"] == rid
        # Update
        ru = requests.patch(f"{API}/owner/menu/{mid}", json={"price": 149},
                            headers=_h(owner_token), timeout=15)
        assert ru.status_code == 200
        assert ru.json()["price"] == 149
        # Delete
        rd = requests.delete(f"{API}/owner/menu/{mid}", headers=_h(owner_token), timeout=15)
        assert rd.status_code == 200
