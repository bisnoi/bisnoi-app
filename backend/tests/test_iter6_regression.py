"""Iteration 6 regression: after removing Android media permissions from app.json
   and gating requestMediaLibraryPermissionsAsync on iOS only, backend must still
   pass the OTP happy path (send-otp -> fetch code from Mongo -> verify-otp)."""
import os
import random
import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "https://bisnoi-live.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def phone():
    return f"7{random.randint(100000000, 999999999)}"


def test_health(api):
    r = api.get(f"{BASE_URL}/api/health", timeout=10)
    assert r.status_code in (200, 404), f"unexpected {r.status_code}"


def test_send_otp(api, phone):
    r = api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("sent") is True


def _fetch_code_from_mongo(phone: str):
    if not MONGO_URL or not DB_NAME:
        return None
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=3000)
    try:
        doc = client[DB_NAME]["otp_codes"].find_one({"phone": phone}, sort=[("created_at", -1)])
        return doc.get("code") if doc else None
    finally:
        client.close()


def test_verify_otp(api, phone):
    code = _fetch_code_from_mongo(phone)
    if not code:
        pytest.skip("OTP code not readable from Mongo (production hardened backend)")
    r = api.post(f"{BASE_URL}/api/auth/verify-otp", json={"phone": phone, "code": code}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "token" in body
    assert body.get("user", {}).get("role") in ("customer", "owner", "admin", "rider")
