"""Iteration 10 — Admin user CRUD tests (POST/PATCH/DELETE /api/admin/users)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "https://zipp-editor.preview.emergentagent.com").rstrip("/")


def _login(phone: str, role: str = "admin") -> str:
    requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=20)
    r = requests.post(
        f"{BASE_URL}/api/auth/verify-otp",
        json={"phone": phone, "code": "123456", "role": role},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login("9999999999", "admin")


@pytest.fixture(scope="module")
def admin_id(admin_token):
    r = requests.get(
        f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {admin_token}"}, timeout=20
    )
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="module")
def H(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def _rand_phone() -> str:
    # 10-digit phone unlikely to collide
    return "9" + str(uuid.uuid4().int)[:9]


# -------- Create user --------
class TestAdminCreateUser:
    def test_create_success(self, H):
        phone = _rand_phone()
        body = {"phone": phone, "name": "TEST_Iter10_Create", "role": "customer"}
        r = requests.post(f"{BASE_URL}/api/admin/users", json=body, headers=H, timeout=20)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["phone"] == phone
        assert u["name"] == "TEST_Iter10_Create"
        assert u["role"] == "customer"
        assert "id" in u and u["id"]
        # cleanup
        requests.delete(f"{BASE_URL}/api/admin/users/{u['id']}", headers=H, timeout=20)

    def test_create_duplicate_phone_400(self, H):
        phone = _rand_phone()
        a = requests.post(
            f"{BASE_URL}/api/admin/users",
            json={"phone": phone, "name": "TEST_Dup_A", "role": "rider"},
            headers=H, timeout=20,
        )
        assert a.status_code == 200, a.text
        uid = a.json()["id"]
        try:
            b = requests.post(
                f"{BASE_URL}/api/admin/users",
                json={"phone": phone, "name": "TEST_Dup_B", "role": "customer"},
                headers=H, timeout=20,
            )
            assert b.status_code == 400
            assert "already" in b.text.lower() or "exists" in b.text.lower()
        finally:
            requests.delete(f"{BASE_URL}/api/admin/users/{uid}", headers=H, timeout=20)

    def test_create_invalid_phone_400(self, H):
        for bad in ["12345", "abcdefghij", "12345678901"]:
            r = requests.post(
                f"{BASE_URL}/api/admin/users",
                json={"phone": bad, "name": "TEST_Bad", "role": "customer"},
                headers=H, timeout=20,
            )
            assert r.status_code == 400, f"phone={bad} expected 400 got {r.status_code}"

    def test_create_requires_admin(self):
        # No token
        r = requests.post(
            f"{BASE_URL}/api/admin/users",
            json={"phone": _rand_phone(), "name": "x", "role": "customer"}, timeout=20,
        )
        assert r.status_code == 401


# -------- Update user --------
class TestAdminUpdateUser:
    def test_update_name_phone_role_and_verify_persistence(self, H):
        phone1 = _rand_phone()
        r = requests.post(
            f"{BASE_URL}/api/admin/users",
            json={"phone": phone1, "name": "TEST_U_Orig", "role": "customer"},
            headers=H, timeout=20,
        )
        uid = r.json()["id"]
        try:
            phone2 = _rand_phone()
            up = requests.patch(
                f"{BASE_URL}/api/admin/users/{uid}",
                json={"name": "TEST_U_Updated", "phone": phone2, "role": "rider"},
                headers=H, timeout=20,
            )
            assert up.status_code == 200, up.text
            d = up.json()
            assert d["name"] == "TEST_U_Updated"
            assert d["phone"] == phone2
            assert d["role"] == "rider"

            # Verify via GET list
            listed = requests.get(f"{BASE_URL}/api/admin/users", headers=H, timeout=20).json()
            match = next((u for u in listed if u["id"] == uid), None)
            assert match is not None
            assert match["phone"] == phone2
            assert match["role"] == "rider"
        finally:
            requests.delete(f"{BASE_URL}/api/admin/users/{uid}", headers=H, timeout=20)

    def test_update_self_demote_blocked(self, H, admin_id):
        r = requests.patch(
            f"{BASE_URL}/api/admin/users/{admin_id}",
            json={"role": "customer"}, headers=H, timeout=20,
        )
        assert r.status_code == 400
        # ensure admin still admin
        me = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": H["Authorization"]}, timeout=20,
        ).json()
        assert me["role"] == "admin"

    def test_update_duplicate_phone_400(self, H):
        pA = _rand_phone(); pB = _rand_phone()
        a = requests.post(
            f"{BASE_URL}/api/admin/users",
            json={"phone": pA, "name": "TEST_DupU_A", "role": "customer"}, headers=H, timeout=20,
        ).json()
        b = requests.post(
            f"{BASE_URL}/api/admin/users",
            json={"phone": pB, "name": "TEST_DupU_B", "role": "customer"}, headers=H, timeout=20,
        ).json()
        try:
            r = requests.patch(
                f"{BASE_URL}/api/admin/users/{b['id']}",
                json={"phone": pA}, headers=H, timeout=20,
            )
            assert r.status_code == 400
        finally:
            requests.delete(f"{BASE_URL}/api/admin/users/{a['id']}", headers=H, timeout=20)
            requests.delete(f"{BASE_URL}/api/admin/users/{b['id']}", headers=H, timeout=20)

    def test_update_invalid_phone_400(self, H):
        u = requests.post(
            f"{BASE_URL}/api/admin/users",
            json={"phone": _rand_phone(), "name": "TEST_BadP", "role": "customer"},
            headers=H, timeout=20,
        ).json()
        try:
            r = requests.patch(
                f"{BASE_URL}/api/admin/users/{u['id']}",
                json={"phone": "abc123"}, headers=H, timeout=20,
            )
            assert r.status_code == 400
        finally:
            requests.delete(f"{BASE_URL}/api/admin/users/{u['id']}", headers=H, timeout=20)

    def test_update_nonexistent_404(self, H):
        r = requests.patch(
            f"{BASE_URL}/api/admin/users/does-not-exist-xyz",
            json={"name": "x"}, headers=H, timeout=20,
        )
        assert r.status_code == 404


# -------- Delete user --------
class TestAdminDeleteUser:
    def test_delete_self_blocked(self, H, admin_id):
        r = requests.delete(f"{BASE_URL}/api/admin/users/{admin_id}", headers=H, timeout=20)
        assert r.status_code == 400

    def test_delete_user_and_verify_gone(self, H):
        u = requests.post(
            f"{BASE_URL}/api/admin/users",
            json={"phone": _rand_phone(), "name": "TEST_Del", "role": "customer"},
            headers=H, timeout=20,
        ).json()
        r = requests.delete(f"{BASE_URL}/api/admin/users/{u['id']}", headers=H, timeout=20)
        assert r.status_code == 200
        # confirm gone from list
        listed = requests.get(f"{BASE_URL}/api/admin/users", headers=H, timeout=20).json()
        assert not any(x["id"] == u["id"] for x in listed)

    def test_delete_nonexistent_404(self, H):
        r = requests.delete(f"{BASE_URL}/api/admin/users/no-such-id", headers=H, timeout=20)
        assert r.status_code == 404

    def test_delete_unassigns_owned_restaurants(self, H):
        # Create owner user
        owner = requests.post(
            f"{BASE_URL}/api/admin/users",
            json={"phone": _rand_phone(), "name": "TEST_Owner_Del", "role": "restaurant_owner"},
            headers=H, timeout=20,
        ).json()
        # Create restaurant owned by them
        rest = requests.post(
            f"{BASE_URL}/api/admin/restaurants",
            json={"name": "TEST_RestDel", "owner_id": owner["id"], "cuisines": ["Test"]},
            headers=H, timeout=20,
        )
        if rest.status_code != 200:
            requests.delete(f"{BASE_URL}/api/admin/users/{owner['id']}", headers=H, timeout=20)
            pytest.skip(f"could not create restaurant: {rest.status_code} {rest.text}")
        rid = rest.json()["id"]
        try:
            # Delete owner user
            d = requests.delete(f"{BASE_URL}/api/admin/users/{owner['id']}", headers=H, timeout=20)
            assert d.status_code == 200
            # Restaurant owner_id should be None now
            rests = requests.get(f"{BASE_URL}/api/admin/restaurants", headers=H, timeout=20).json()
            r = next((x for x in rests if x["id"] == rid), None)
            assert r is not None
            assert r.get("owner_id") in (None, ""), f"owner_id not cleared: {r.get('owner_id')}"
        finally:
            requests.delete(f"{BASE_URL}/api/admin/restaurants/{rid}", headers=H, timeout=20)


# -------- Non-admin role guards --------
class TestAdminRoleGuard:
    def test_customer_cannot_create_user(self):
        token = _login("9988776655", "customer")
        h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        r = requests.post(
            f"{BASE_URL}/api/admin/users",
            json={"phone": _rand_phone(), "name": "x", "role": "customer"},
            headers=h, timeout=20,
        )
        assert r.status_code == 403
