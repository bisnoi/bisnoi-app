"""Iter 9 — Menu-item approval workflow & owner variations."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://edit-preview-22.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(phone: str, role: str) -> str:
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "code": "123456", "role": role}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login("9999999999", "admin")


@pytest.fixture(scope="module")
def owner_token():
    return _login("8888888888", "restaurant_owner")


@pytest.fixture(scope="module")
def customer_token():
    return _login("5550001111", "customer")


@pytest.fixture(scope="module")
def owner_restaurant_id(owner_token):
    r = requests.get(f"{API}/owner/restaurant", headers={"Authorization": f"Bearer {owner_token}"}, timeout=15)
    assert r.status_code == 200, r.text
    rest = r.json()
    assert rest, "owner has no restaurant"
    return rest["id"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------------- Owner item creation defaults to pending ----------------
class TestOwnerCreatesPendingItem:
    def test_owner_menu_post_starts_pending(self, owner_token, customer_token, owner_restaurant_id):
        name = f"TEST_PEND_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/owner/menu",
                          headers=_h(owner_token),
                          json={"name": name, "description": "x", "price": 123, "veg": True},
                          timeout=15)
        assert r.status_code == 200, r.text
        item = r.json()
        assert item["approval_status"] == "pending"
        assert item["reject_reason"] is None
        # Customer cannot see it
        r2 = requests.get(f"{API}/restaurants/{owner_restaurant_id}", timeout=15)
        assert r2.status_code == 200
        menu_ids = [m["id"] for m in r2.json()["menu"]]
        assert item["id"] not in menu_ids, "pending item leaked to customer"
        # cleanup happens via approve/reject in next tests; delete here if not used
        requests.delete(f"{API}/owner/menu/{item['id']}", headers=_h(owner_token), timeout=15)

    def test_owner_legacy_path_starts_pending(self, owner_token, owner_restaurant_id):
        name = f"TEST_LEG_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/owner/restaurants/{owner_restaurant_id}/menu",
                          headers=_h(owner_token),
                          json={"name": name, "description": "x", "price": 99, "veg": True},
                          timeout=15)
        assert r.status_code == 200, r.text
        item = r.json()
        assert item["approval_status"] == "pending"
        requests.delete(f"{API}/owner/menu/{item['id']}", headers=_h(owner_token), timeout=15)


# ---------------- Pending counts ----------------
class TestPendingCounts:
    def test_admin_can_get_pending_counts(self, admin_token, owner_token, owner_restaurant_id):
        # Create a pending item
        name = f"TEST_CNT_{uuid.uuid4().hex[:6]}"
        rc = requests.post(f"{API}/owner/menu", headers=_h(owner_token),
                           json={"name": name, "description": "x", "price": 100, "veg": True},
                           timeout=15)
        assert rc.status_code == 200
        item_id = rc.json()["id"]
        try:
            r = requests.get(f"{API}/admin/menu/pending-counts", headers=_h(admin_token), timeout=15)
            assert r.status_code == 200, r.text
            counts = r.json()
            assert isinstance(counts, dict)
            assert counts.get(owner_restaurant_id, 0) >= 1
        finally:
            requests.delete(f"{API}/admin/menu/{item_id}", headers=_h(admin_token), timeout=15)

    def test_owner_forbidden_pending_counts(self, owner_token):
        r = requests.get(f"{API}/admin/menu/pending-counts", headers=_h(owner_token), timeout=15)
        assert r.status_code == 403

    def test_customer_forbidden_pending_counts(self, customer_token):
        r = requests.get(f"{API}/admin/menu/pending-counts", headers=_h(customer_token), timeout=15)
        assert r.status_code == 403


# ---------------- Approve ----------------
class TestApproveFlow:
    def test_approve_makes_visible_to_customer(self, admin_token, owner_token, owner_restaurant_id):
        name = f"TEST_APPROVE_{uuid.uuid4().hex[:6]}"
        rc = requests.post(f"{API}/owner/menu", headers=_h(owner_token),
                           json={"name": name, "description": "x", "price": 150, "veg": True},
                           timeout=15)
        assert rc.status_code == 200
        item_id = rc.json()["id"]
        try:
            # not visible
            menu = requests.get(f"{API}/restaurants/{owner_restaurant_id}", timeout=15).json()["menu"]
            assert item_id not in [m["id"] for m in menu]
            # approve
            ra = requests.patch(f"{API}/admin/menu/{item_id}/approve", headers=_h(admin_token), timeout=15)
            assert ra.status_code == 200, ra.text
            assert ra.json()["approval_status"] == "approved"
            # now visible
            menu2 = requests.get(f"{API}/restaurants/{owner_restaurant_id}", timeout=15).json()["menu"]
            assert item_id in [m["id"] for m in menu2]
        finally:
            requests.delete(f"{API}/admin/menu/{item_id}", headers=_h(admin_token), timeout=15)

    def test_approve_role_guards(self, owner_token, customer_token, owner_restaurant_id):
        # create an item we'll try to approve as non-admin
        rc = requests.post(f"{API}/owner/menu", headers=_h(owner_token),
                           json={"name": f"TEST_X_{uuid.uuid4().hex[:6]}", "description": "x",
                                 "price": 10, "veg": True}, timeout=15)
        item_id = rc.json()["id"]
        try:
            assert requests.patch(f"{API}/admin/menu/{item_id}/approve",
                                  headers=_h(owner_token), timeout=15).status_code == 403
            assert requests.patch(f"{API}/admin/menu/{item_id}/approve",
                                  headers=_h(customer_token), timeout=15).status_code == 403
        finally:
            requests.delete(f"{API}/owner/menu/{item_id}", headers=_h(owner_token), timeout=15)


# ---------------- Reject ----------------
class TestRejectFlow:
    def test_reject_stores_reason_and_hides(self, admin_token, owner_token, owner_restaurant_id):
        rc = requests.post(f"{API}/owner/menu", headers=_h(owner_token),
                           json={"name": f"TEST_REJ_{uuid.uuid4().hex[:6]}", "description": "x",
                                 "price": 99, "veg": True}, timeout=15)
        item_id = rc.json()["id"]
        try:
            reason = "Image quality too low"
            rr = requests.patch(f"{API}/admin/menu/{item_id}/reject",
                                headers=_h(admin_token),
                                json={"reason": reason}, timeout=15)
            assert rr.status_code == 200, rr.text
            body = rr.json()
            assert body["approval_status"] == "rejected"
            assert body["reject_reason"] == reason
            # still hidden
            menu = requests.get(f"{API}/restaurants/{owner_restaurant_id}", timeout=15).json()["menu"]
            assert item_id not in [m["id"] for m in menu]
        finally:
            requests.delete(f"{API}/admin/menu/{item_id}", headers=_h(admin_token), timeout=15)

    def test_reject_role_guards(self, owner_token, customer_token):
        rc = requests.post(f"{API}/owner/menu", headers=_h(owner_token),
                           json={"name": f"TEST_RG_{uuid.uuid4().hex[:6]}", "description": "x",
                                 "price": 10, "veg": True}, timeout=15)
        item_id = rc.json()["id"]
        try:
            assert requests.patch(f"{API}/admin/menu/{item_id}/reject",
                                  headers=_h(owner_token), json={"reason": "x"},
                                  timeout=15).status_code == 403
            assert requests.patch(f"{API}/admin/menu/{item_id}/reject",
                                  headers=_h(customer_token), json={"reason": "x"},
                                  timeout=15).status_code == 403
        finally:
            requests.delete(f"{API}/owner/menu/{item_id}", headers=_h(owner_token), timeout=15)


# ---------------- Owner variations + listing ----------------
class TestOwnerVariations:
    def test_owner_menu_get_returns_variations_and_approval(self, owner_token):
        # Create item
        rc = requests.post(f"{API}/owner/menu", headers=_h(owner_token),
                           json={"name": f"TEST_VAR_{uuid.uuid4().hex[:6]}",
                                 "description": "x", "price": 200, "veg": True}, timeout=15)
        assert rc.status_code == 200
        item_id = rc.json()["id"]
        try:
            # Add Small/Medium/Large variations
            for n, p in [("Small", 200), ("Medium", 250), ("Large", 300)]:
                rv = requests.post(f"{API}/owner/menu/{item_id}/variations",
                                   headers=_h(owner_token),
                                   json={"name": n, "price": p}, timeout=15)
                assert rv.status_code == 200, rv.text
            # List
            rl = requests.get(f"{API}/owner/menu", headers=_h(owner_token), timeout=15)
            assert rl.status_code == 200
            items = rl.json()
            ours = [i for i in items if i["id"] == item_id]
            assert ours, "created item missing from owner list"
            it = ours[0]
            assert "approval_status" in it and it["approval_status"] == "pending"
            assert "variations" in it
            names = sorted([v["name"] for v in it["variations"]])
            assert names == ["Large", "Medium", "Small"]
        finally:
            requests.delete(f"{API}/owner/menu/{item_id}", headers=_h(owner_token), timeout=15)


# ---------------- Owner category lockdown ----------------
class TestOwnerCategoryLockdown:
    def test_owner_post_categories_forbidden(self, owner_token):
        r = requests.post(f"{API}/owner/categories",
                          headers=_h(owner_token),
                          json={"name": "X", "sort_order": 0, "is_enabled": True},
                          timeout=15)
        assert r.status_code == 403
