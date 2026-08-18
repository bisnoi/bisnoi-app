"""E2E tests for the Marketing Template Library flow (owner + admin)."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://react-fastapi-live-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_PHONE = "9999999999"
OWNER_PHONE = "8888888888"


def _login(phone: str) -> str:
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=30)
    assert r.status_code == 200, f"send-otp failed: {r.status_code} {r.text}"
    otp = r.json().get("demo_otp")
    assert otp, f"No demo_otp in response: {r.text}"
    r2 = requests.post(f"{API}/auth/verify-otp", json={"phone": phone, "code": otp}, timeout=30)
    assert r2.status_code == 200, f"verify-otp failed: {r2.status_code} {r2.text}"
    token = r2.json().get("token") or r2.json().get("access_token")
    assert token, f"No token in response: {r2.text}"
    return token


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_PHONE)


@pytest.fixture(scope="module")
def owner_token():
    return _login(OWNER_PHONE)


@pytest.fixture(scope="module")
def owner_headers(owner_token):
    return {"Authorization": f"Bearer {owner_token}"}


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---- Track created ids for teardown ----
_created = {"owner": [], "admin": []}


@pytest.fixture(scope="module", autouse=True)
def cleanup(owner_headers, admin_headers):
    yield
    for tid in _created["owner"]:
        try:
            requests.delete(f"{API}/marketing/templates/{tid}", headers=owner_headers, timeout=15)
        except Exception:
            pass
    for tid in _created["admin"]:
        try:
            requests.delete(f"{API}/admin/marketing/templates/{tid}", headers=admin_headers, timeout=15)
        except Exception:
            pass


# ---- Owner-side tests ----

class TestOwnerTemplates:
    def test_platform_templates_seeded(self, owner_headers):
        r = requests.get(f"{API}/marketing/templates", headers=owner_headers, timeout=30)
        assert r.status_code == 200, r.text
        tpls = r.json().get("templates", [])
        platform = [t for t in tpls if t.get("is_platform")]
        assert len(platform) >= 9, f"Expected >=9 platform templates, got {len(platform)}"
        by_kind = {}
        for t in platform:
            by_kind.setdefault(t["kind"], []).append(t)
        for k in ("marketing", "loyalty", "return_customer"):
            assert len(by_kind.get(k, [])) >= 3, f"Expected >=3 {k} templates, got {len(by_kind.get(k, []))}"

    def test_filter_by_kind(self, owner_headers):
        r = requests.get(f"{API}/marketing/templates?kind=loyalty", headers=owner_headers, timeout=30)
        assert r.status_code == 200
        tpls = r.json().get("templates", [])
        assert all(t["kind"] == "loyalty" for t in tpls)
        assert len(tpls) >= 3

    def test_owner_submit_template(self, owner_headers):
        payload = {
            "kind": "marketing",
            "name": "TEST_Owner_Submitted_E2E",
            "body": "Hi {name}! Testing owner submission flow. Enjoy 5% off at {restaurant}.",
            "submit_for_approval": True,
        }
        r = requests.post(f"{API}/marketing/templates", json=payload, headers=owner_headers, timeout=30)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["status"] == "pending_approval"
        assert doc["is_platform"] is False
        assert doc["name"] == payload["name"]
        _created["owner"].append(doc["id"])
        # Verify it appears in owner's list
        r2 = requests.get(f"{API}/marketing/templates", headers=owner_headers, timeout=30)
        ids = [t["id"] for t in r2.json().get("templates", [])]
        assert doc["id"] in ids

    def test_owner_submit_validation(self, owner_headers):
        r = requests.post(f"{API}/marketing/templates",
                          json={"kind": "marketing", "name": "x", "body": "short"},
                          headers=owner_headers, timeout=30)
        assert r.status_code == 400
        r2 = requests.post(f"{API}/marketing/templates",
                           json={"kind": "invalid_kind", "name": "TEST_Bad", "body": "long enough body"},
                           headers=owner_headers, timeout=30)
        assert r2.status_code == 400


# ---- Admin-side tests ----

class TestAdminTemplates:
    def test_admin_list_templates(self, admin_headers):
        r = requests.get(f"{API}/admin/marketing/templates", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        tpls = r.json().get("templates", [])
        assert len(tpls) >= 9

    def test_admin_filter_by_status(self, admin_headers):
        r = requests.get(f"{API}/admin/marketing/templates?status=approved", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert all(t["status"] == "approved" for t in r.json().get("templates", []))

    def test_admin_create_platform_template(self, admin_headers):
        payload = {"kind": "marketing", "name": "TEST_Admin_E2E", "body": "Test body from admin flow"}
        r = requests.post(f"{API}/admin/marketing/templates", json=payload, headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["status"] == "approved"
        assert doc["is_platform"] is True
        _created["admin"].append(doc["id"])

    def test_admin_settings(self, admin_headers):
        r = requests.get(f"{API}/admin/marketing/settings", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("per_message_rate", "currency", "marketing_template", "marketing_template_lang", "enabled"):
            assert k in data


# ---- Full approve / reject flow ----

class TestApproveRejectFlow:
    def test_approve_flow(self, owner_headers, admin_headers):
        payload = {"kind": "loyalty", "name": "TEST_Approve_Flow",
                   "body": "Hi {name}! This is a test approval body."}
        r = requests.post(f"{API}/marketing/templates", json=payload, headers=owner_headers, timeout=30)
        assert r.status_code == 200
        tid = r.json()["id"]
        _created["owner"].append(tid)

        # Admin sees it as pending with owner_name attached
        r2 = requests.get(f"{API}/admin/marketing/templates?status=pending_approval",
                          headers=admin_headers, timeout=30)
        assert r2.status_code == 200
        matched = [t for t in r2.json()["templates"] if t["id"] == tid]
        assert matched, "Owner-submitted template not visible in admin pending list"
        tpl = matched[0]
        assert tpl.get("owner_name") is not None
        assert tpl.get("restaurant_name") is not None

        # Approve
        r3 = requests.patch(f"{API}/admin/marketing/templates/{tid}",
                            json={"status": "approved"}, headers=admin_headers, timeout=30)
        assert r3.status_code == 200, r3.text
        assert r3.json()["status"] == "approved"
        assert r3.json().get("approved_by") is not None

        # Owner should now see it in list (still shows regardless — it's their own)
        r4 = requests.get(f"{API}/marketing/templates", headers=owner_headers, timeout=30)
        found = [t for t in r4.json()["templates"] if t["id"] == tid]
        assert found and found[0]["status"] == "approved"

    def test_reject_flow(self, owner_headers, admin_headers):
        payload = {"kind": "return_customer", "name": "TEST_Reject_Flow",
                   "body": "Hi {name}! Testing rejection flow please."}
        r = requests.post(f"{API}/marketing/templates", json=payload, headers=owner_headers, timeout=30)
        assert r.status_code == 200
        tid = r.json()["id"]
        _created["owner"].append(tid)

        reason = "TEST reject reason - contains spam-like language"
        r2 = requests.patch(f"{API}/admin/marketing/templates/{tid}",
                            json={"status": "rejected", "reject_reason": reason},
                            headers=admin_headers, timeout=30)
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "rejected"
        assert r2.json().get("reject_reason") == reason

        # Owner sees it with reason
        r3 = requests.get(f"{API}/marketing/templates", headers=owner_headers, timeout=30)
        found = [t for t in r3.json()["templates"] if t["id"] == tid]
        assert found
        assert found[0]["status"] == "rejected"
        assert found[0].get("reject_reason") == reason


# ---- Delete permissions ----

class TestDelete:
    def test_owner_cannot_delete_platform(self, owner_headers):
        r = requests.get(f"{API}/marketing/templates", headers=owner_headers, timeout=30)
        platform = [t for t in r.json()["templates"] if t.get("is_platform")]
        assert platform
        tid = platform[0]["id"]
        r2 = requests.delete(f"{API}/marketing/templates/{tid}", headers=owner_headers, timeout=30)
        assert r2.status_code == 403

    def test_owner_delete_own(self, owner_headers):
        payload = {"kind": "custom", "name": "TEST_Owner_Delete",
                   "body": "Hi {name}! Delete me please."}
        r = requests.post(f"{API}/marketing/templates", json=payload, headers=owner_headers, timeout=30)
        assert r.status_code == 200
        tid = r.json()["id"]
        r2 = requests.delete(f"{API}/marketing/templates/{tid}", headers=owner_headers, timeout=30)
        assert r2.status_code == 200
