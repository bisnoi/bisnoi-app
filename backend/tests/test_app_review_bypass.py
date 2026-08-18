"""App Store review demo credential bypass tests.

Tests that phone 8929926078 + OTP 989898 hardcoded bypass:
  - Skips real OTP generation on send-otp
  - Always returns role=customer on verify-otp (fresh + existing user)
  - Rejects wrong OTP
  - Does not affect other phone numbers (normal flow still works)
  - Does not grant admin access (security regression)
"""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://bisnoi-live.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")

DEMO_PHONE = "8929926078"
DEMO_OTP = "989898"
OTHER_PHONE = "9876543210"

# Direct Mongo access to seed / clean users (backend .env)
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


@pytest.fixture(scope="module")
def db():
    # Read backend/.env to make sure we hit the same DB the backend uses
    env_path = "/app/backend/.env"
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("MONGO_URL="):
                    os.environ["MONGO_URL"] = line.split("=", 1)[1].strip().strip('"')
                elif line.startswith("DB_NAME="):
                    os.environ["DB_NAME"] = line.split("=", 1)[1].strip().strip('"')
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    client = MongoClient(mongo_url)
    return client[db_name]


@pytest.fixture
def clean_demo_user(db):
    """Ensure demo phone user is deleted before test."""
    db.users.delete_many({"phone": DEMO_PHONE})
    db.otps.delete_many({"phone": DEMO_PHONE})
    yield
    # cleanup after
    db.users.delete_many({"phone": DEMO_PHONE})
    db.otps.delete_many({"phone": DEMO_PHONE})


# ---- send-otp ----
def test_send_otp_demo_phone_short_circuits(clean_demo_user, db):
    r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": DEMO_PHONE}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("sent") is True
    # No demo_otp field (bypass path stores nothing)
    # And no OTP record should have been created in DB for this phone
    rec = db.otps.find_one({"phone": DEMO_PHONE})
    assert rec is None, f"send-otp should NOT store an OTP for demo phone but got: {rec}"


# ---- verify-otp — fresh user ----
def test_verify_otp_demo_creates_customer_when_no_user(clean_demo_user, db):
    r = requests.post(
        f"{BASE_URL}/api/auth/verify-otp",
        json={"phone": DEMO_PHONE, "code": DEMO_OTP},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and data["token"]
    assert "user" in data
    u = data["user"]
    assert u["phone"] == DEMO_PHONE
    assert u["role"] == "customer", f"expected customer, got {u['role']}"
    # Verify it was persisted
    persisted = db.users.find_one({"phone": DEMO_PHONE})
    assert persisted is not None
    assert persisted["role"] == "customer"


# ---- verify-otp — existing user with elevated role (admin) forced back to customer ----
def test_verify_otp_demo_downgrades_admin_to_customer(clean_demo_user, db):
    # Seed a pre-existing admin with this phone
    uid = str(uuid.uuid4())
    db.users.insert_one({
        "id": uid,
        "phone": DEMO_PHONE,
        "name": "Fake Admin",
        "role": "admin",
        "created_at": "2024-01-01T00:00:00+00:00",
        "permissions": ["all"],
    })
    r = requests.post(
        f"{BASE_URL}/api/auth/verify-otp",
        json={"phone": DEMO_PHONE, "code": DEMO_OTP},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    u = data["user"]
    assert u["role"] == "customer", f"SECURITY: demo phone must force customer role, got {u['role']}"
    # Persisted role must also be customer
    persisted = db.users.find_one({"phone": DEMO_PHONE})
    assert persisted["role"] == "customer"
    assert "permissions" not in persisted or not persisted.get("permissions")


# ---- verify-otp — wrong OTP rejected ----
def test_verify_otp_demo_wrong_code_rejected(clean_demo_user):
    r = requests.post(
        f"{BASE_URL}/api/auth/verify-otp",
        json={"phone": DEMO_PHONE, "code": "111111"},
        timeout=15,
    )
    assert r.status_code == 400, f"wrong OTP should be 400, got {r.status_code}: {r.text}"


def test_verify_otp_demo_empty_code_rejected(clean_demo_user):
    r = requests.post(
        f"{BASE_URL}/api/auth/verify-otp",
        json={"phone": DEMO_PHONE, "code": ""},
        timeout=15,
    )
    assert r.status_code == 400


# ---- Normal OTP flow for a non-demo phone must still work ----
@pytest.fixture
def clean_other_user(db):
    db.users.delete_many({"phone": OTHER_PHONE})
    db.otps.delete_many({"phone": OTHER_PHONE})
    yield
    db.users.delete_many({"phone": OTHER_PHONE})
    db.otps.delete_many({"phone": OTHER_PHONE})


def test_normal_otp_flow_end_to_end(clean_other_user, db):
    # 1) Send OTP for a non-demo phone
    r = requests.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": OTHER_PHONE}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("sent") is True

    # A real OTP MUST be stored in DB now (since we skipped Firebase and used backend OTP)
    rec = db.otps.find_one({"phone": OTHER_PHONE})
    assert rec is not None, "backend OTP flow must persist an OTP for non-demo phones"
    stored_code = rec.get("code")
    assert stored_code and len(stored_code) == 6 and stored_code.isdigit()

    # 2) Wrong code should be 400
    r2 = requests.post(
        f"{BASE_URL}/api/auth/verify-otp",
        json={"phone": OTHER_PHONE, "code": "000000" if stored_code != "000000" else "111111"},
        timeout=15,
    )
    assert r2.status_code == 400

    # 3) Correct code succeeds and creates customer
    r3 = requests.post(
        f"{BASE_URL}/api/auth/verify-otp",
        json={"phone": OTHER_PHONE, "code": stored_code},
        timeout=15,
    )
    assert r3.status_code == 200, r3.text
    data3 = r3.json()
    assert "token" in data3
    assert data3["user"]["role"] == "customer"

    # 4) Demo OTP (989898) MUST NOT work for a non-demo phone
    r4 = requests.post(
        f"{BASE_URL}/api/auth/verify-otp",
        json={"phone": OTHER_PHONE, "code": DEMO_OTP},
        timeout=15,
    )
    # Either the OTP was already consumed (400) or bad code (400) - never 200
    assert r4.status_code != 200, "demo OTP must not bypass verification for other phones"


# ---- SECURITY REGRESSION: demo token cannot access admin endpoints ----
def test_demo_token_cannot_access_admin_endpoints(clean_demo_user, db):
    # Seed an admin user with the demo phone (worst-case scenario)
    uid = str(uuid.uuid4())
    db.users.insert_one({
        "id": uid,
        "phone": DEMO_PHONE,
        "name": "Would-be Admin",
        "role": "admin",
        "created_at": "2024-01-01T00:00:00+00:00",
    })
    r = requests.post(
        f"{BASE_URL}/api/auth/verify-otp",
        json={"phone": DEMO_PHONE, "code": DEMO_OTP},
        timeout=15,
    )
    assert r.status_code == 200
    token = r.json()["token"]
    assert r.json()["user"]["role"] == "customer"

    # Try to hit admin-only endpoints. Should be 403.
    for endpoint in ("/api/admin/orders", "/api/admin/users", "/api/admin/stats"):
        rr = requests.get(
            f"{BASE_URL}{endpoint}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        assert rr.status_code == 403, (
            f"SECURITY LEAK: demo token accessed {endpoint} with {rr.status_code}"
        )
