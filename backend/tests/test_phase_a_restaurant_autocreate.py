"""
Phase A — Restaurant Management System: auto-create on partner approval.

Verifies:
 1) Submitting a `restaurant_partner` application then approving it auto-creates
    a placeholder restaurant with:
        status='pending_assignment', is_active=False,
        owner_id == applicant user id, source_application_id == application id,
        pre-filled name/address/cuisines/contact_phone/fssai_license/gst_number/
        bank_*/lat/lng/city.
 2) A default "Menu" category is auto-created for the new restaurant
    (verified via the owner /api/owner/categories endpoint after the applicant
    re-logins, which now issues a restaurant_owner JWT).
 3) Idempotency — duplicate review on the same application does NOT create a
    second restaurant.
 4) Regression: rider approval still upgrades role to 'rider'.
"""
import os
import uuid
import pytest
import requests


# -------------------- BASE URL --------------------
BASE_URL = os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
if not BASE_URL:
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
        json={"phone": phone, "code": "123456", "role": role, "name": name or f"TEST_{phone[-4:]}"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _partner_payload(prefix: str = "TEST_AUTO") -> dict:
    return {
        "type": "restaurant_partner",
        "partner": {
            "owner_name": f"{prefix} Owner",
            "business_name": f"{prefix} Biz",
            "contact_phone": "9000000333",
            "contact_email": "auto@test.com",
            "restaurant_name": f"{prefix} Diner",
            "cuisines": ["Indian", "Chinese"],
            "address": "100 Phase-A Road",
            "city": "Bengaluru",
            "pincode": "560001",
            "lat": 12.95,
            "lng": 77.61,
            "gst_number": "22AAAAA0000A1Z5",
            "fssai_number": "FSSAI99887766",
            "bank_account_name": f"{prefix} Owner",
            "bank_account_number": "1111222233334444",
            "bank_ifsc": "HDFC0009999",
        },
    }


# -------------------- fixtures --------------------
@pytest.fixture(scope="module")
def admin_auth():
    return _login("9999999999", "admin", "Admin")


@pytest.fixture(scope="module")
def partner_applicant():
    """A FRESH customer who will submit a restaurant_partner application."""
    phone = f"91{uuid.uuid4().int % 10**8:08d}"
    return {"phone": phone, **_login(phone, "customer", "TEST_PartnerAuto")}


@pytest.fixture(scope="module")
def rider_applicant():
    """A FRESH customer who will submit a rider application (regression)."""
    phone = f"92{uuid.uuid4().int % 10**8:08d}"
    return {"phone": phone, **_login(phone, "customer", "TEST_RiderRegression")}


# -------------------- 1. Partner approval auto-creates restaurant --------------------
class TestPartnerApprovalAutoCreate:
    aid: str | None = None
    rest_id: str | None = None

    def test_a_submit_partner_application(self, partner_applicant):
        r = requests.post(
            f"{API}/applications/submit",
            headers=_h(partner_applicant["token"]),
            json=_partner_payload(),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "pending"
        assert body["type"] == "restaurant_partner"
        TestPartnerApprovalAutoCreate.aid = body["id"]

    def test_b_admin_approves(self, admin_auth):
        assert TestPartnerApprovalAutoCreate.aid
        r = requests.post(
            f"{API}/admin/applications/{TestPartnerApprovalAutoCreate.aid}/review",
            headers=_h(admin_auth["token"]),
            json={"action": "approve", "admin_notes": "Welcome"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved"

    def test_c_role_upgraded_to_restaurant_owner(self, admin_auth, partner_applicant):
        r = requests.get(f"{API}/admin/users", headers=_h(admin_auth["token"]), timeout=15)
        assert r.status_code == 200
        users = r.json()
        uid = partner_applicant["user"]["id"]
        match = [u for u in users if u["id"] == uid]
        assert match, "applicant user disappeared"
        assert match[0]["role"] == "restaurant_owner", f"role not upgraded: {match[0]['role']}"

    def test_d_restaurant_auto_created_with_correct_fields(self, admin_auth, partner_applicant):
        r = requests.get(f"{API}/admin/restaurants", headers=_h(admin_auth["token"]), timeout=15)
        assert r.status_code == 200
        rests = r.json()
        match = [x for x in rests if x.get("source_application_id") == TestPartnerApprovalAutoCreate.aid]
        assert len(match) == 1, f"expected exactly 1 auto-created restaurant, got {len(match)}"
        rest = match[0]
        TestPartnerApprovalAutoCreate.rest_id = rest["id"]

        # Pending-assignment status
        assert rest["status"] == "pending_assignment", f"status={rest['status']}"
        assert rest["is_active"] is False, f"is_active={rest['is_active']}"

        # Owner linkage
        assert rest["owner_id"] == partner_applicant["user"]["id"]

        # Pre-fill from payload
        assert rest["name"] == "TEST_AUTO Diner"
        assert rest["address"] == "100 Phase-A Road"
        assert rest["city"] == "Bengaluru"
        assert rest["cuisines"] == ["Indian", "Chinese"]
        assert rest["contact_phone"] == "9000000333"
        assert rest["fssai_license"] == "FSSAI99887766"
        assert rest["gst_number"] == "22AAAAA0000A1Z5"
        assert rest["bank_account_name"] == "TEST_AUTO Owner"
        assert rest["bank_account_number"] == "1111222233334444"
        assert rest["bank_ifsc"] == "HDFC0009999"
        assert abs(float(rest["lat"]) - 12.95) < 1e-6
        assert abs(float(rest["lng"]) - 77.61) < 1e-6
        # MongoDB _id must be excluded
        assert "_id" not in rest

    def test_e_default_menu_category_created(self, partner_applicant):
        """
        Re-login the applicant (role is now restaurant_owner) and verify the auto-created
        'Menu' category exists for the new restaurant.
        """
        owner_auth = _login(partner_applicant["phone"], "restaurant_owner", "TEST_PartnerAuto")
        assert owner_auth["user"]["role"] == "restaurant_owner"
        r = requests.get(f"{API}/owner/categories", headers=_h(owner_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        cats = r.json()
        # Find categories belonging to our restaurant
        rest_cats = [c for c in cats if c["restaurant_id"] == TestPartnerApprovalAutoCreate.rest_id]
        assert len(rest_cats) >= 1, f"no default category for restaurant {TestPartnerApprovalAutoCreate.rest_id}: {cats}"
        names = [c["name"] for c in rest_cats]
        assert "Menu" in names, f"default 'Menu' category missing; got {names}"

    def test_f_idempotency_no_duplicate_on_repeat_approval(self, admin_auth):
        """
        Try to approve again — endpoint should reject (status already 'approved'),
        and no duplicate restaurant must be created.
        """
        r = requests.post(
            f"{API}/admin/applications/{TestPartnerApprovalAutoCreate.aid}/review",
            headers=_h(admin_auth["token"]),
            json={"action": "approve"},
            timeout=15,
        )
        # API guards against re-review of approved/rejected with 400
        assert r.status_code == 400, f"expected 400 on re-approve, got {r.status_code}: {r.text}"

        # Sanity: still exactly one restaurant for this source_application_id
        r2 = requests.get(f"{API}/admin/restaurants", headers=_h(admin_auth["token"]), timeout=15)
        assert r2.status_code == 200
        match = [x for x in r2.json() if x.get("source_application_id") == TestPartnerApprovalAutoCreate.aid]
        assert len(match) == 1, f"duplicate created! count={len(match)}"

    # ---- Teardown: clean up auto-created restaurant + application ----
    @classmethod
    def teardown_class(cls):
        try:
            admin = _login("9999999999", "admin", "Admin")
            if cls.rest_id:
                requests.delete(f"{API}/admin/restaurants/{cls.rest_id}", headers=_h(admin["token"]), timeout=10)
        except Exception as e:
            print(f"teardown warning: {e}")


# -------------------- 2. Regression: rider approval upgrades role --------------------
class TestRiderApprovalRegression:
    aid: str | None = None

    def test_a_submit_rider_application(self, rider_applicant):
        payload = {
            "type": "rider",
            "rider": {
                "full_name": "TEST_RIDER_REG",
                "contact_phone": "9000000444",
                "date_of_birth": "1990-01-01",
                "city": "Bengaluru",
                "address": "Koramangala",
                "pincode": "560034",
                "vehicle_type": "bike",
                "vehicle_number": "KA02CD9999",
                "rc_number": "RC999999",
                "license_number": "DL999999",
                "aadhaar_number": "444455556666",
                "bank_account_name": "TEST Rider",
                "bank_account_number": "5555666677778888",
                "bank_ifsc": "ICIC0009999",
            },
        }
        r = requests.post(
            f"{API}/applications/submit",
            headers=_h(rider_applicant["token"]),
            json=payload,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        TestRiderApprovalRegression.aid = r.json()["id"]

    def test_b_approve_and_role_upgrades(self, admin_auth, rider_applicant):
        assert TestRiderApprovalRegression.aid
        r = requests.post(
            f"{API}/admin/applications/{TestRiderApprovalRegression.aid}/review",
            headers=_h(admin_auth["token"]),
            json={"action": "approve"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved"

        # Verify role upgrade
        r2 = requests.get(f"{API}/admin/users", headers=_h(admin_auth["token"]), timeout=15)
        users = r2.json()
        uid = rider_applicant["user"]["id"]
        match = [u for u in users if u["id"] == uid]
        assert match and match[0]["role"] == "rider", f"rider role not upgraded; {match}"

    def test_c_no_restaurant_created_for_rider(self, admin_auth):
        r = requests.get(f"{API}/admin/restaurants", headers=_h(admin_auth["token"]), timeout=15)
        assert r.status_code == 200
        match = [x for x in r.json() if x.get("source_application_id") == TestRiderApprovalRegression.aid]
        assert len(match) == 0, f"rider approval must NOT create a restaurant, got {len(match)}"
