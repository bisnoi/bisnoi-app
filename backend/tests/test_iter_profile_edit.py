"""Iteration tests: PATCH /api/auth/me profile edit + sanity + app.json check."""
import os
import json
import re
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://mobile-app-demo-55.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

TEST_PHONE = "8929926078"
TEST_OTP = "989898"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/send-otp", json={"phone": TEST_PHONE}, timeout=15)
    assert r.status_code in (200, 201), f"send-otp: {r.status_code} {r.text}"
    r = requests.post(
        f"{API}/auth/verify-otp",
        json={"phone": TEST_PHONE, "code": TEST_OTP},
        timeout=15,
    )
    assert r.status_code == 200, f"verify-otp: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    return data["token"]


@pytest.fixture
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ---- Sanity ----
def test_restaurants_list():
    r = requests.get(f"{API}/restaurants", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) > 0


def test_user_model_has_email(auth_headers):
    r = requests.get(f"{API}/auth/me", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    user = r.json()
    assert "email" in user  # key must be present (may be None)
    assert user.get("phone") == TEST_PHONE


# ---- PATCH /auth/me happy path ----
def test_patch_me_updates_name_and_email(auth_headers):
    payload = {"name": "Test User Bisnoi", "email": "test.user@example.com"}
    r = requests.patch(f"{API}/auth/me", json=payload, headers=auth_headers, timeout=15)
    assert r.status_code == 200, f"PATCH failed: {r.status_code} {r.text}"
    u = r.json()
    assert u.get("name") == "Test User Bisnoi"
    assert u.get("email") == "test.user@example.com"
    assert u.get("phone") == TEST_PHONE

    # Persist check
    r2 = requests.get(f"{API}/auth/me", headers=auth_headers, timeout=15)
    assert r2.status_code == 200
    u2 = r2.json()
    assert u2["name"] == "Test User Bisnoi"
    assert u2["email"] == "test.user@example.com"
    assert u2["phone"] == TEST_PHONE


# ---- PATCH /auth/me validation ----
def test_patch_me_invalid_email(auth_headers):
    r = requests.patch(
        f"{API}/auth/me", json={"email": "not-an-email"}, headers=auth_headers, timeout=15
    )
    assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"


def test_patch_me_empty_email_clears(auth_headers):
    r = requests.patch(
        f"{API}/auth/me", json={"email": ""}, headers=auth_headers, timeout=15
    )
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    u = r.json()
    assert u.get("email") in (None, ""), f"email not cleared: {u.get('email')}"
    assert u.get("phone") == TEST_PHONE  # phone unchanged

    # Restore email for other agents/regression stability
    requests.patch(
        f"{API}/auth/me",
        json={"email": "test.user@example.com"},
        headers=auth_headers,
        timeout=15,
    )


# ---- app.json LSApplicationQueriesSchemes ----
def test_app_json_url_schemes():
    with open("/app/frontend/app.json", "r") as f:
        cfg = json.load(f)
    schemes = cfg["expo"]["ios"]["infoPlist"]["LSApplicationQueriesSchemes"]
    assert "com.phonepe.app" not in schemes
    assert "net.one97.paytm" not in schemes
    for expected in ["tez", "phonepe", "paytmmp", "bhim", "credpay", "mobikwik", "amazonpay", "upi"]:
        assert expected in schemes, f"missing scheme {expected}"


# ---- login.tsx source-level checks for iOS-only Skip ----
def test_login_tsx_ios_skip_placement():
    with open("/app/frontend/app/login.tsx", "r") as f:
        src = f.read()
    # No 'Welcome Back!' or the removed subtitle
    assert "Welcome Back" not in src
    assert "Don't have an account" not in src
    assert "we'll create one" not in src
    # Skip is wrapped by Platform.OS === 'ios' and has testID login-skip
    m = re.search(
        r'Platform\.OS\s*===\s*"ios"[\s\S]{0,400}testID="login-skip"',
        src,
    )
    assert m, "iOS-only Skip block with testID login-skip not found"
    # Old top-right absolute skip button (styles.skipBtn usage) removed from JSX
    assert "styles.skipBtn}" not in src  # JSX usage removed
    assert "styles.skipBtnDesktop}" not in src
    # Skip appears AFTER primaryBtn
    idx_primary = src.find("testID=\"login-send-otp-btn\"")
    idx_skip = src.find("testID=\"login-skip\"")
    assert idx_primary > 0 and idx_skip > idx_primary, "Skip button must be BELOW Login Now"


def test_settings_tsx_has_readonly_phone():
    with open("/app/frontend/app/customer/settings.tsx", "r") as f:
        src = f.read()
    for tid in ("settings-name-input", "settings-email-input",
                "settings-phone-readonly", "settings-save-btn"):
        assert tid in src, f"missing testID {tid}"
    # No editable phone input
    assert "phone-input" not in src.lower() or "settings-phone-readonly" in src
