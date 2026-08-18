"""Backend tests for iteration 3 — profile edit: dob, gender, avatar, phone lock."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://mobile-app-demo-55.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
TEST_PHONE = "8929926078"
TEST_OTP = "989898"

# 1x1 transparent PNG data URL
TINY_PNG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/send-otp", json={"phone": TEST_PHONE}, timeout=15)
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/auth/verify-otp", json={"phone": TEST_PHONE, "code": TEST_OTP}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------- User model / GET /auth/me ----------------
def test_me_has_new_fields(hdr):
    r = requests.get(f"{API}/auth/me", headers=hdr, timeout=15)
    assert r.status_code == 200, r.text
    u = r.json()
    for k in ("dob", "gender", "avatar", "name", "email", "phone"):
        assert k in u, f"missing key: {k}"


# ---------------- DOB validation ----------------
@pytest.mark.parametrize("dob,expected_status", [
    ("1998-05-24", 200),
    ("", 200),
    ("24-05-1998", 400),
    ("2099-01-01", 400),
    ("2024-01-01", 400),
    ("1800-01-01", 400),
    ("1998-02-31", 400),
])
def test_dob_validation(hdr, dob, expected_status):
    r = requests.patch(f"{API}/auth/me", headers=hdr, json={"dob": dob}, timeout=15)
    assert r.status_code == expected_status, f"dob={dob!r} → {r.status_code}: {r.text}"
    if expected_status == 200:
        if dob == "":
            assert r.json().get("dob") in (None, "")
        else:
            assert r.json().get("dob") == dob


# ---------------- Gender validation ----------------
@pytest.mark.parametrize("gender,expected,final", [
    ("male", 200, "male"),
    ("female", 200, "female"),
    ("other", 200, "other"),
    ("prefer_not_to_say", 200, "prefer_not_to_say"),
    ("MALE", 200, "male"),
    ("", 200, None),
    ("potato", 400, None),
])
def test_gender_validation(hdr, gender, expected, final):
    r = requests.patch(f"{API}/auth/me", headers=hdr, json={"gender": gender}, timeout=15)
    assert r.status_code == expected, f"gender={gender!r} → {r.status_code}: {r.text}"
    if expected == 200:
        assert r.json().get("gender") == final


# ---------------- Avatar validation ----------------
def test_avatar_valid(hdr):
    r = requests.patch(f"{API}/auth/me", headers=hdr, json={"avatar": TINY_PNG}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("avatar") == TINY_PNG
    # Verify persistence
    r2 = requests.get(f"{API}/auth/me", headers=hdr, timeout=15)
    assert r2.json().get("avatar") == TINY_PNG


def test_avatar_http_rejected(hdr):
    r = requests.patch(f"{API}/auth/me", headers=hdr, json={"avatar": "http://example.com/x.jpg"}, timeout=15)
    assert r.status_code == 400
    assert "base64 data URL" in r.text or "data url" in r.text.lower()


def test_avatar_clear(hdr):
    r = requests.patch(f"{API}/auth/me", headers=hdr, json={"avatar": ""}, timeout=15)
    assert r.status_code == 200
    assert r.json().get("avatar") in (None, "")


def test_avatar_oversized(hdr):
    big = "data:image/png;base64," + ("A" * 3_000_001)
    r = requests.patch(f"{API}/auth/me", headers=hdr, json={"avatar": big}, timeout=15)
    assert r.status_code == 400
    assert "too large" in r.text.lower()


# ---------------- Combined PATCH & phone-lock ----------------
def test_combined_patch_phone_ignored(hdr):
    # Snapshot original phone
    me = requests.get(f"{API}/auth/me", headers=hdr, timeout=15).json()
    original_phone = me["phone"]

    payload = {
        "name": "Test Customer 3",
        "email": "test_iter3@example.com",
        "dob": "1990-06-15",
        "gender": "female",
        "avatar": TINY_PNG,
        "phone": "9999999999",  # should be silently ignored
    }
    r = requests.patch(f"{API}/auth/me", headers=hdr, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "Test Customer 3"
    assert body["email"] == "test_iter3@example.com"
    assert body["dob"] == "1990-06-15"
    assert body["gender"] == "female"
    assert body["avatar"] == TINY_PNG
    assert body["phone"] == original_phone, "Phone must not change via PATCH /auth/me"


# ---------------- Sanity: /restaurants still works ----------------
def test_restaurants_public():
    r = requests.get(f"{API}/restaurants", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
