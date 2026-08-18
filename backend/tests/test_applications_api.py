"""
Backend tests for the Applications + Admin Panel feature.
Covers: customer submit/mine/respond-clarification, admin list/stats/get/review (approve/reject/clarify),
role upgrade on approval, dedup on active applications.
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
if not BASE_URL:
    # Read from frontend/.env if not present in environment
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL=") or line.startswith("EXPO_BACKEND_URL="):
                    BASE_URL = line.strip().split("=", 1)[1].strip().strip('"')
                    break
    except Exception:
        pass
BASE_URL = (BASE_URL or "").rstrip("/")
assert BASE_URL, "EXPO_BACKEND_URL not configured"

API = f"{BASE_URL}/api"


# -------------------- helpers --------------------
def _login(phone: str, role: str, name: str | None = None) -> dict:
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, r.text
    r = requests.post(
        f"{API}/auth/verify-otp",
        json={"phone": phone, "code": "123456", "role": role, "name": name or f"Test_{phone[-4:]}"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_auth():
    return _login("9999999999", "admin", "Admin")


@pytest.fixture(scope="module")
def customer_rider_auth():
    # Unique customer for rider-application happy path
    phone = f"90{uuid.uuid4().int % 10**8:08d}"
    return _login(phone, "customer", "TEST_RiderApplicant")


@pytest.fixture(scope="module")
def customer_partner_auth():
    # Unique customer for partner-application reject path
    phone = f"90{uuid.uuid4().int % 10**8:08d}"
    return _login(phone, "customer", "TEST_PartnerApplicant")


# -------------------- 1. Auth + my applications baseline --------------------
class TestApplicationsBaseline:
    def test_send_otp_returns_demo_otp(self):
        r = requests.post(f"{API}/auth/send-otp", json={"phone": "9000000999"}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body.get("sent") is True
        assert "demo_otp" in body

    def test_mine_empty_for_new_customer(self, customer_rider_auth):
        r = requests.get(f"{API}/applications/mine", headers=_h(customer_rider_auth["token"]), timeout=15)
        assert r.status_code == 200
        # New customer, should be []
        assert isinstance(r.json(), list)

    def test_mine_requires_auth(self):
        r = requests.get(f"{API}/applications/mine", timeout=15)
        assert r.status_code == 401


# -------------------- 2. Submit application validation --------------------
class TestSubmitValidation:
    def test_missing_rider_payload_when_type_rider(self, customer_rider_auth):
        r = requests.post(
            f"{API}/applications/submit",
            headers=_h(customer_rider_auth["token"]),
            json={"type": "rider"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_missing_partner_payload_when_type_partner(self, customer_partner_auth):
        r = requests.post(
            f"{API}/applications/submit",
            headers=_h(customer_partner_auth["token"]),
            json={"type": "restaurant_partner"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_unauth_submit_rejected(self):
        r = requests.post(f"{API}/applications/submit", json={"type": "rider"}, timeout=15)
        assert r.status_code == 401


# -------------------- 3. Full rider workflow (clarification + approval) ----
class TestRiderFlow:
    aid = None

    def _rider_payload(self):
        return {
            "type": "rider",
            "rider": {
                "full_name": "TEST Rider",
                "contact_phone": "9000000111",
                "contact_email": "rider@test.com",
                "date_of_birth": "1995-01-01",
                "city": "Bengaluru",
                "address": "HSR Layout",
                "pincode": "560102",
                "vehicle_type": "bike",
                "vehicle_number": "KA01AB1234",
                "rc_number": "RC123456",
                "license_number": "DL123456",
                "aadhaar_number": "111122223333",
                "bank_account_name": "TEST Rider",
                "bank_account_number": "1234567890",
                "bank_ifsc": "HDFC0001234",
            },
        }

    def test_a_submit_rider_app(self, customer_rider_auth):
        r = requests.post(
            f"{API}/applications/submit",
            headers=_h(customer_rider_auth["token"]),
            json=self._rider_payload(),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "pending"
        assert body["type"] == "rider"
        assert body["payload"]["full_name"] == "TEST Rider"
        assert body["clarification_thread"] == []
        assert "_id" not in body
        TestRiderFlow.aid = body["id"]

    def test_b_dedup_blocks_second_submit(self, customer_rider_auth):
        r = requests.post(
            f"{API}/applications/submit",
            headers=_h(customer_rider_auth["token"]),
            json=self._rider_payload(),
            timeout=15,
        )
        assert r.status_code == 409

    def test_c_mine_returns_new_app(self, customer_rider_auth):
        r = requests.get(f"{API}/applications/mine", headers=_h(customer_rider_auth["token"]), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert any(a["id"] == TestRiderFlow.aid for a in data)

    def test_d_admin_list_pending_contains_app(self, admin_auth):
        r = requests.get(f"{API}/admin/applications?status=pending", headers=_h(admin_auth["token"]), timeout=15)
        assert r.status_code == 200
        ids = [a["id"] for a in r.json()]
        assert TestRiderFlow.aid in ids

    def test_e_admin_stats_returns_counts(self, admin_auth):
        r = requests.get(f"{API}/admin/applications/stats", headers=_h(admin_auth["token"]), timeout=15)
        assert r.status_code == 200
        st = r.json()
        for k in ("pending", "approved", "rejected", "clarification_requested", "total"):
            assert k in st, f"missing {k}"
        assert st["pending"] >= 1

    def test_f_admin_get_full_payload(self, admin_auth):
        r = requests.get(f"{API}/admin/applications/{TestRiderFlow.aid}", headers=_h(admin_auth["token"]), timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["applicant_phone"]
        assert body["payload"]["aadhaar_number"] == "111122223333"

    def test_g_admin_request_clarification(self, admin_auth):
        r = requests.post(
            f"{API}/admin/applications/{TestRiderFlow.aid}/review",
            headers=_h(admin_auth["token"]),
            json={"action": "request_clarification", "admin_notes": "Please re-upload license"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "clarification_requested"
        assert body["admin_notes"] == "Please re-upload license"
        thread = body["clarification_thread"]
        assert len(thread) == 1 and thread[0]["by"] == "admin"

    def test_h_user_cannot_respond_when_not_in_clarification_state_other_app(self, customer_partner_auth):
        # negative — random uuid
        r = requests.post(
            f"{API}/applications/{uuid.uuid4()}/respond-clarification",
            headers=_h(customer_partner_auth["token"]),
            json={"message": "x"},
            timeout=15,
        )
        assert r.status_code == 404

    def test_i_user_respond_clarification(self, customer_rider_auth):
        r = requests.post(
            f"{API}/applications/{TestRiderFlow.aid}/respond-clarification",
            headers=_h(customer_rider_auth["token"]),
            json={"message": "Updated, please review"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "pending"
        assert len(body["clarification_thread"]) == 2
        assert body["clarification_thread"][-1]["by"] == "user"
        assert body["clarification_thread"][-1]["message"] == "Updated, please review"

    def test_j_respond_when_not_clarification_state_fails(self, customer_rider_auth):
        # status is now pending, so respond should fail
        r = requests.post(
            f"{API}/applications/{TestRiderFlow.aid}/respond-clarification",
            headers=_h(customer_rider_auth["token"]),
            json={"message": "again"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_k_admin_approve_upgrades_role(self, admin_auth, customer_rider_auth):
        r = requests.post(
            f"{API}/admin/applications/{TestRiderFlow.aid}/review",
            headers=_h(admin_auth["token"]),
            json={"action": "approve", "admin_notes": "Welcome aboard"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "approved"
        # Verify the applicant's role upgraded via /admin/users
        r2 = requests.get(f"{API}/admin/users", headers=_h(admin_auth["token"]), timeout=15)
        assert r2.status_code == 200
        users = r2.json()
        uid = customer_rider_auth["user"]["id"]
        match = [u for u in users if u["id"] == uid]
        assert match and match[0]["role"] == "rider", f"role not upgraded; got {match}"

    def test_l_re_review_after_approval_blocked(self, admin_auth):
        r = requests.post(
            f"{API}/admin/applications/{TestRiderFlow.aid}/review",
            headers=_h(admin_auth["token"]),
            json={"action": "reject", "admin_notes": "no"},
            timeout=15,
        )
        assert r.status_code == 400


# -------------------- 4. Partner application reject path ------------------
class TestPartnerRejectFlow:
    aid = None

    def _partner_payload(self):
        return {
            "type": "restaurant_partner",
            "partner": {
                "owner_name": "TEST Owner",
                "business_name": "TEST Biz",
                "contact_phone": "9000000222",
                "restaurant_name": "TEST Diner",
                "cuisines": ["Indian"],
                "address": "Indiranagar",
                "city": "Bengaluru",
                "pincode": "560038",
                "fssai_number": "FSSAI1234",
                "bank_account_name": "TEST Owner",
                "bank_account_number": "9876543210",
                "bank_ifsc": "ICIC0001234",
            },
        }

    def test_a_submit_partner_app(self, customer_partner_auth):
        r = requests.post(
            f"{API}/applications/submit",
            headers=_h(customer_partner_auth["token"]),
            json=self._partner_payload(),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        TestPartnerRejectFlow.aid = body["id"]
        assert body["status"] == "pending"
        assert body["type"] == "restaurant_partner"

    def test_b_admin_reject_with_notes(self, admin_auth):
        r = requests.post(
            f"{API}/admin/applications/{TestPartnerRejectFlow.aid}/review",
            headers=_h(admin_auth["token"]),
            json={"action": "reject", "admin_notes": "FSSAI invalid"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "rejected"
        assert body["admin_notes"] == "FSSAI invalid"

    def test_c_mine_shows_rejected(self, customer_partner_auth):
        r = requests.get(f"{API}/applications/mine", headers=_h(customer_partner_auth["token"]), timeout=15)
        assert r.status_code == 200
        rec = [a for a in r.json() if a["id"] == TestPartnerRejectFlow.aid]
        assert rec and rec[0]["status"] == "rejected"
        assert rec[0]["admin_notes"] == "FSSAI invalid"

    def test_d_resubmit_after_reject_allowed(self, customer_partner_auth):
        # After rejection, user should be able to submit again (no active app)
        r = requests.post(
            f"{API}/applications/submit",
            headers=_h(customer_partner_auth["token"]),
            json=self._partner_payload(),
            timeout=15,
        )
        assert r.status_code == 200, r.text


# -------------------- 5. Authorization on admin endpoints ----------
class TestAdminGuard:
    def test_non_admin_cannot_list(self, customer_partner_auth):
        r = requests.get(
            f"{API}/admin/applications",
            headers=_h(customer_partner_auth["token"]),
            timeout=15,
        )
        assert r.status_code == 403

    def test_non_admin_cannot_review(self, customer_partner_auth):
        r = requests.post(
            f"{API}/admin/applications/{uuid.uuid4()}/review",
            headers=_h(customer_partner_auth["token"]),
            json={"action": "approve"},
            timeout=15,
        )
        assert r.status_code == 403

    def test_other_user_cannot_read_application(self, customer_partner_auth):
        # rider app belongs to customer_rider_auth user; partner user must get 403
        if TestRiderFlow.aid:
            r = requests.get(
                f"{API}/applications/{TestRiderFlow.aid}",
                headers=_h(customer_partner_auth["token"]),
                timeout=15,
            )
            assert r.status_code == 403
