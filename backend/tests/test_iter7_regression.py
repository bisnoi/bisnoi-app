"""Iter7 regression: backend health + OTP send/verify happy path via Mongo."""
import os
import random
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "https://bisnoi.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def test_health(api):
    r = api.get(f"{BASE_URL}/api/health", timeout=15)
    assert r.status_code == 200, r.text


def test_send_otp_fresh(api):
    phone = "9" + "".join(str(random.randint(0, 9)) for _ in range(9))
    r = api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("sent") is True or "demo_otp" in body


def test_verify_otp_via_mongo(api):
    """If OTP is stored in Mongo (demo mode), we can read + verify. In prod
    hardened mode the code is not exposed — skip cleanly."""
    if not MONGO_URL or not DB_NAME:
        pytest.skip("MONGO_URL/DB_NAME not set for this env")
    phone = "9" + "".join(str(random.randint(0, 9)) for _ in range(9))
    r = api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    db = client[DB_NAME]
    otp_doc = db.otps.find_one({"phone": phone})
    if not otp_doc or "code" not in otp_doc:
        pytest.skip("OTP code not stored/exposed in Mongo (prod hardened mode) — expected")
    code = otp_doc["code"]
    r2 = api.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": phone, "code": code}, timeout=15)
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert "token" in body and "user" in body
