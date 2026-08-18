"""
Iteration 8 — Admin Menu & Catalog backend tests
Covers:
 * Admin can create/list/update/delete categories per restaurant
 * Admin can create/list/update/delete menu items per restaurant
 * Admin can create/list/update/delete item variations
 * Owner can no longer POST /api/owner/categories (must get 403)
 * Owner can still POST variations on his menu items
 * Role guards: owner/customer cannot hit /api/admin/* category|menu|variations
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ["EXPO_BACKEND_URL"]
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_PHONE = "9999999999"
OWNER_PHONE = "8888888888"
MASTER_OTP = "123456"


# ---------- helpers ----------
def _login(phone: str, role: str, name: str | None = None) -> str:
    requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    body = {"phone": phone, "code": MASTER_OTP, "role": role}
    if name:
        body["name"] = name
    r = requests.post(f"{API}/auth/verify-otp", json=body, timeout=15)
    assert r.status_code == 200, f"login {role} failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _auth(t: str):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_PHONE, "admin", "TestAdmin")


@pytest.fixture(scope="module")
def owner_token():
    return _login(OWNER_PHONE, "restaurant_owner", "TestOwner")


@pytest.fixture(scope="module")
def customer_token():
    phone = "9" + str(uuid.uuid4().int)[:9]
    return _login(phone, "customer", "TestCustomer")


@pytest.fixture(scope="module")
def restaurant_id(admin_token):
    """Use an existing admin restaurant (first one), or create a fresh one."""
    r = requests.get(f"{API}/admin/restaurants", headers=_auth(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    items = r.json()
    if items:
        return items[0]["id"]
    body = {
        "name": "TEST_ITER8_REST",
        "cuisines": ["Indian"],
        "image": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400",
        "address": "1 Test Lane",
        "city": "TestCity",
    }
    cr = requests.post(f"{API}/admin/restaurants", headers=_auth(admin_token), json=body, timeout=15)
    assert cr.status_code in (200, 201), cr.text
    return cr.json()["id"]


# ---------- admin: categories ----------
class TestAdminCategories:
    def test_create_list_update_delete_category(self, admin_token, restaurant_id):
        # CREATE
        cat_name = f"TEST_CAT_{uuid.uuid4().hex[:6]}"
        cr = requests.post(
            f"{API}/admin/restaurants/{restaurant_id}/categories",
            headers=_auth(admin_token),
            json={"name": cat_name, "is_enabled": True},
            timeout=15,
        )
        assert cr.status_code in (200, 201), cr.text
        cat = cr.json()
        assert cat["name"] == cat_name
        assert cat["restaurant_id"] == restaurant_id
        cid = cat["id"]

        # LIST -> contains it
        lr = requests.get(
            f"{API}/admin/restaurants/{restaurant_id}/categories",
            headers=_auth(admin_token),
            timeout=15,
        )
        assert lr.status_code == 200
        ids = [c["id"] for c in lr.json()]
        assert cid in ids

        # PATCH
        ur = requests.patch(
            f"{API}/admin/categories/{cid}",
            headers=_auth(admin_token),
            json={"name": cat_name + "_U", "is_enabled": False},
            timeout=15,
        )
        assert ur.status_code == 200, ur.text
        assert ur.json()["name"] == cat_name + "_U"
        assert ur.json()["is_enabled"] is False

        # DELETE
        dr = requests.delete(
            f"{API}/admin/categories/{cid}",
            headers=_auth(admin_token),
            timeout=15,
        )
        assert dr.status_code in (200, 204)

        # VERIFY gone
        lr2 = requests.get(
            f"{API}/admin/restaurants/{restaurant_id}/categories",
            headers=_auth(admin_token),
            timeout=15,
        )
        assert cid not in [c["id"] for c in lr2.json()]


# ---------- admin: menu items + variations ----------
class TestAdminMenuAndVariations:
    def test_full_item_lifecycle_with_variations(self, admin_token, restaurant_id):
        # Need at least one category to assign
        cat = requests.post(
            f"{API}/admin/restaurants/{restaurant_id}/categories",
            headers=_auth(admin_token),
            json={"name": f"TEST_CAT_VAR_{uuid.uuid4().hex[:6]}"},
            timeout=15,
        ).json()
        cid = cat["id"]

        # CREATE item
        item_body = {
            "name": f"TEST_ITEM_{uuid.uuid4().hex[:6]}",
            "description": "test",
            "price": 250,
            "category_id": cid,
            "veg": True,
            "is_available": True,
            "image": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400",
        }
        cr = requests.post(
            f"{API}/admin/restaurants/{restaurant_id}/menu",
            headers=_auth(admin_token),
            json=item_body,
            timeout=15,
        )
        assert cr.status_code in (200, 201), cr.text
        item = cr.json()
        assert item["name"] == item_body["name"]
        assert item["category_id"] == cid
        mid = item["id"]

        # PATCH item price
        ur = requests.patch(
            f"{API}/admin/menu/{mid}",
            headers=_auth(admin_token),
            json={"price": 299},
            timeout=15,
        )
        assert ur.status_code == 200, ur.text
        assert ur.json()["price"] == 299

        # CREATE variations Small/Medium/Large
        created_vids = []
        for nm, pr in [("Small", 150), ("Medium", 250), ("Large", 350)]:
            vr = requests.post(
                f"{API}/admin/menu/{mid}/variations",
                headers=_auth(admin_token),
                json={"name": nm, "price": pr},
                timeout=15,
            )
            assert vr.status_code in (200, 201), vr.text
            v = vr.json()
            assert v["name"] == nm
            assert v["price"] == pr
            created_vids.append(v["id"])

        # LIST variations
        lr = requests.get(
            f"{API}/admin/menu/{mid}/variations",
            headers=_auth(admin_token),
            timeout=15,
        )
        assert lr.status_code == 200
        names = sorted([v["name"] for v in lr.json()])
        assert names == ["Large", "Medium", "Small"]

        # PATCH variation
        pr = requests.patch(
            f"{API}/admin/variations/{created_vids[0]}",
            headers=_auth(admin_token),
            json={"price": 160},
            timeout=15,
        )
        assert pr.status_code == 200, pr.text
        assert pr.json()["price"] == 160

        # DELETE variations + item + cat
        for vid in created_vids:
            requests.delete(f"{API}/admin/variations/{vid}", headers=_auth(admin_token), timeout=15)
        requests.delete(f"{API}/admin/menu/{mid}", headers=_auth(admin_token), timeout=15)
        requests.delete(f"{API}/admin/categories/{cid}", headers=_auth(admin_token), timeout=15)

        # Verify item gone -> 404 on PATCH
        gone = requests.patch(
            f"{API}/admin/menu/{mid}",
            headers=_auth(admin_token),
            json={"price": 100},
            timeout=15,
        )
        assert gone.status_code in (404, 400)


# ---------- owner lockdown ----------
class TestOwnerCategoryLockdown:
    def test_owner_post_categories_returns_403(self, owner_token):
        r = requests.post(
            f"{API}/owner/categories",
            headers=_auth(owner_token),
            json={"name": "OWNER_TRY", "is_enabled": True},
            timeout=15,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_owner_can_still_list_categories(self, owner_token):
        r = requests.get(f"{API}/owner/categories", headers=_auth(owner_token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- owner variations still allowed ----------
class TestOwnerVariations:
    def test_owner_can_create_variation_on_own_item(self, owner_token):
        # find owner's first menu item
        mi = requests.get(f"{API}/owner/menu", headers=_auth(owner_token), timeout=15)
        assert mi.status_code == 200
        items = mi.json()
        if not items:
            pytest.skip("Owner has no menu items in seed DB")
        mid = items[0]["id"]

        vr = requests.post(
            f"{API}/owner/menu/{mid}/variations",
            headers=_auth(owner_token),
            json={"name": f"TEST_VAR_{uuid.uuid4().hex[:5]}", "price": 99},
            timeout=15,
        )
        assert vr.status_code in (200, 201), vr.text
        vid = vr.json()["id"]
        # cleanup
        requests.delete(
            f"{API}/owner/menu/{mid}/variations/{vid}",
            headers=_auth(owner_token),
            timeout=15,
        )


# ---------- role guards on admin endpoints ----------
class TestAdminEndpointsRoleGuards:
    def test_owner_cannot_create_admin_category(self, owner_token, restaurant_id):
        r = requests.post(
            f"{API}/admin/restaurants/{restaurant_id}/categories",
            headers=_auth(owner_token),
            json={"name": "X"},
            timeout=15,
        )
        assert r.status_code == 403

    def test_owner_cannot_create_admin_item(self, owner_token, restaurant_id):
        r = requests.post(
            f"{API}/admin/restaurants/{restaurant_id}/menu",
            headers=_auth(owner_token),
            json={"name": "X", "price": 10, "veg": True, "category_id": None},
            timeout=15,
        )
        assert r.status_code == 403

    def test_customer_cannot_create_admin_category(self, customer_token, restaurant_id):
        r = requests.post(
            f"{API}/admin/restaurants/{restaurant_id}/categories",
            headers=_auth(customer_token),
            json={"name": "X"},
            timeout=15,
        )
        assert r.status_code == 403

    def test_owner_cannot_create_admin_variation(self, owner_token, admin_token, restaurant_id):
        # admin creates item, then owner tries to create variation on /admin/ path
        cat = requests.post(
            f"{API}/admin/restaurants/{restaurant_id}/categories",
            headers=_auth(admin_token),
            json={"name": f"TEST_GUARD_{uuid.uuid4().hex[:5]}"},
            timeout=15,
        ).json()
        item = requests.post(
            f"{API}/admin/restaurants/{restaurant_id}/menu",
            headers=_auth(admin_token),
            json={"name": "TEST_GUARD_ITEM", "price": 10, "veg": True, "category_id": cat["id"]},
            timeout=15,
        ).json()
        mid = item["id"]
        try:
            r = requests.post(
                f"{API}/admin/menu/{mid}/variations",
                headers=_auth(owner_token),
                json={"name": "X", "price": 10},
                timeout=15,
            )
            assert r.status_code == 403
        finally:
            requests.delete(f"{API}/admin/menu/{mid}", headers=_auth(admin_token), timeout=15)
            requests.delete(f"{API}/admin/categories/{cat['id']}", headers=_auth(admin_token), timeout=15)
