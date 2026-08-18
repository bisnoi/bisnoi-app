"""
Production OTP fallback flow tests against https://bisnoi.com.

This exercises the exact path Expo Go clients now take after the
firebase.native.ts fix: firebaseConfigured() returns false in Expo Go,
so login.tsx routes to Api.sendOtp -> Api.verifyOtp.

DO NOT change target base URL; production is deliberate per review request.
"""
import pytest
import requests

BASE_URL = "https://bisnoi.com"
TEST_PHONE = "9876501234"


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


class TestExpoGoOtpFallback:
    """The exact backend path Expo Go users hit after firebase.native.ts fix."""

    def test_send_otp_returns_demo_otp(self, api):
        r = api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": TEST_PHONE}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("sent") is True
        assert "demo_otp" in body
        assert isinstance(body["demo_otp"], str)
        assert len(body["demo_otp"]) == 6
        # stash for the next test in the class
        pytest.demo_otp = body["demo_otp"]

    def test_verify_otp_returns_token_and_user(self, api):
        # Get a fresh OTP so this test can run independently.
        s = api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": TEST_PHONE}, timeout=15).json()
        code = s.get("demo_otp")
        assert code, "send-otp did not return demo_otp"

        r = api.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"phone": TEST_PHONE, "code": code},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body and isinstance(body["token"], str) and body["token"]
        assert "user" in body
        user = body["user"]
        assert user.get("phone") == TEST_PHONE
        assert user.get("role") in {"customer", "admin", "restaurant_owner", "restaurant_staff", "rider", "admin_staff"}
        assert "id" in user

    def test_verify_otp_rejects_wrong_code(self, api):
        # Prime OTP
        api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": TEST_PHONE}, timeout=15)
        r = api.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"phone": TEST_PHONE, "code": "000000"},
            timeout=15,
        )
        assert r.status_code in (400, 401), r.text
