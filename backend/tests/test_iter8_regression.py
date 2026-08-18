"""Iteration 8 regression — OTP send/verify happy path against emergent preview host.
Static app.json / package.json verifications happen in the runner, this file covers backend."""
import os
import random
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "https://bisnoi-live.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _random_phone():
    return "+91" + str(random.randint(6000000000, 9999999999))


# --- OTP send happy path ---
class TestOtpFlow:
    def test_send_otp_returns_200(self, api):
        phone = _random_phone()
        r = api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=20)
        assert r.status_code == 200, f"send-otp failed {r.status_code}: {r.text[:200]}"
        data = r.json()
        assert data.get("sent") is True, f"unexpected body: {data}"

    def test_send_otp_rejects_bad_phone(self, api):
        r = api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": "abc"}, timeout=20)
        # Either 400 or 422 — validation must reject
        assert r.status_code in (400, 422), f"bad-phone should be rejected, got {r.status_code}"


# --- Verify OTP path (dev/preview backdoor via mongo) ---
class TestVerifyOtp:
    def test_verify_otp_flow(self, api):
        phone = _random_phone()
        send = api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=20)
        assert send.status_code == 200
        # In preview environment, verify a wrong code returns 400/401
        r = api.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"phone": phone, "code": "000000"},
            timeout=20,
        )
        assert r.status_code in (400, 401, 403, 422), f"wrong OTP must not succeed, got {r.status_code}"
