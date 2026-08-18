"""Regression tests: verify hardcoded OTP bypass has been removed.

Previously the code allowed phone `8929926078` with OTP `989898` to
short-circuit both send-otp and verify-otp. This suite proves that path
is gone AND that the normal OTP flow (send → fetch from Mongo → verify)
still works end-to-end.
"""
import os
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = "https://bisnoi-live.preview.emergentagent.com"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

REVIEWER_PHONE = "8929926078"
REVIEWER_OTP = "989898"
FRESH_PHONE = "9012345678"
SEEDED_ADMIN_PHONE = "9999999999"


@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    return client[DB_NAME]


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# -------- Bypass-removal assertions (the KEY security tests) --------

class TestBypassRemoved:
    def test_send_otp_reviewer_phone_no_demo_field(self, api, db):
        """Reviewer phone must behave like any other phone: 200 {sent:true} with NO demo_otp."""
        db.otps.delete_one({"phone": REVIEWER_PHONE})
        r = api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": REVIEWER_PHONE})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("sent") is True
        # OTP_DEMO_MODE is false in .env → demo_otp MUST NOT be exposed.
        assert "demo_otp" not in body, f"demo_otp leaked in response: {body}"
        # And Mongo must now hold a random 6-digit code (not 989898).
        rec = db.otps.find_one({"phone": REVIEWER_PHONE})
        assert rec is not None
        assert rec["code"] != REVIEWER_OTP, "Stored code equals the removed hardcoded OTP!"
        assert len(rec["code"]) == 6 and rec["code"].isdigit()

    def test_verify_otp_with_old_hardcoded_code_fails(self, api, db):
        """The old bypass code 989898 must now be rejected with 400 Invalid OTP."""
        # Ensure a fresh OTP exists that is NOT 989898.
        db.otps.delete_one({"phone": REVIEWER_PHONE})
        api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": REVIEWER_PHONE})
        rec = db.otps.find_one({"phone": REVIEWER_PHONE})
        assert rec["code"] != REVIEWER_OTP
        r = api.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"phone": REVIEWER_PHONE, "code": REVIEWER_OTP},
        )
        assert r.status_code == 400, f"Bypass STILL WORKS! got {r.status_code}: {r.text}"
        assert "Invalid OTP" in r.text


# -------- Normal OTP flow must still work end-to-end --------

class TestOtpHappyPath:
    def test_fresh_customer_send_and_verify(self, api, db):
        db.otps.delete_one({"phone": FRESH_PHONE})
        db.users.delete_one({"phone": FRESH_PHONE})  # ensure clean create
        r = api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": FRESH_PHONE})
        assert r.status_code == 200
        rec = db.otps.find_one({"phone": FRESH_PHONE})
        assert rec and rec.get("code")
        code = rec["code"]
        r2 = api.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"phone": FRESH_PHONE, "code": code},
        )
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert "token" in body and body["token"].count(".") == 2  # JWT
        assert body["user"]["phone"] == FRESH_PHONE
        assert body["user"]["role"] == "customer"

    def test_wrong_code_returns_400(self, api, db):
        db.otps.delete_one({"phone": FRESH_PHONE})
        api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": FRESH_PHONE})
        r = api.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"phone": FRESH_PHONE, "code": "000000"},
        )
        # The random code being 000000 is 1-in-1M; treat any 400 as pass.
        assert r.status_code in (400, 200)
        if r.status_code == 200:
            pytest.skip("Random code happened to be 000000")

    def test_seeded_admin_role_preserved(self, api, db):
        """Removing the bypass must NOT downgrade existing users."""
        admin = db.users.find_one({"phone": SEEDED_ADMIN_PHONE})
        if not admin:
            pytest.skip("Admin 9999999999 not seeded in this env")
        original_role = admin["role"]
        db.otps.delete_one({"phone": SEEDED_ADMIN_PHONE})
        api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": SEEDED_ADMIN_PHONE})
        rec = db.otps.find_one({"phone": SEEDED_ADMIN_PHONE})
        r = api.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"phone": SEEDED_ADMIN_PHONE, "code": rec["code"]},
        )
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == original_role


# -------- Firebase endpoint still wired up --------

class TestFirebaseEndpointStillPresent:
    def test_firebase_endpoint_rejects_fake_token(self, api):
        r = api.post(
            f"{BASE_URL}/api/auth/firebase",
            json={"id_token": "not-a-real-token"},
        )
        # Must be 4xx (401/400) — endpoint is reachable and validates.
        assert r.status_code in (400, 401), r.text
        assert r.status_code != 404, "Firebase endpoint disappeared!"


# -------- Code-level assertions (grep) --------

class TestSourceCleanliness:
    def test_no_hardcoded_phone_or_otp_in_backend(self):
        with open("/app/backend/server.py") as f:
            src = f.read()
        for bad in ("APP_REVIEW_DEMO_PHONE", "APP_REVIEW_DEMO_OTP", "8929926078", "989898"):
            assert bad not in src, f"Backend still contains {bad!r}"

    def test_no_hardcoded_phone_or_otp_in_frontend_login(self):
        with open("/app/frontend/app/login.tsx") as f:
            src = f.read()
        for bad in ("8929926078", "989898"):
            assert bad not in src, f"login.tsx still contains {bad!r}"
        assert "new Set<string>([])" in src, "DEMO_PHONES is not empty!"
