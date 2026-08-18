"""Regression: after adding @react-native-firebase/auth captchaOpenUrlFix
plugin config, backend OTP happy-path must still work."""
import os
import pytest
import requests

BASE_URL = os.environ.get("BISNOI_TEST_URL", "https://bisnoi-live.preview.emergentagent.com").rstrip("/")


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


class TestOtpHappyPath:
    """Send-OTP -> Verify-OTP -> token & customer user."""

    def test_send_and_verify_otp_new_phone(self, api):
        # Fresh phone (last 4 randomised)
        import random
        phone = f"98765{random.randint(10000, 99999)}"

        r = api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("sent") is True

        # Fetch OTP from Mongo directly (since OTP_DEMO_MODE may be off in prod-like)
        code = body.get("demo_otp")
        if not code:
            # If demo mode disabled, we can't get the code — skip verify assertion
            pytest.skip("OTP_DEMO_MODE off — cannot obtain code from response")

        r2 = api.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"phone": phone, "code": code, "name": "TEST_Regression"},
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert "token" in data
        assert data["user"]["role"] == "customer"
        assert data["user"]["phone"] == phone

    def test_verify_otp_invalid_code_rejected(self, api):
        import random
        phone = f"98765{random.randint(10000, 99999)}"
        api.post(f"{BASE_URL}/api/auth/send-otp", json={"phone": phone}, timeout=15)
        r = api.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"phone": phone, "code": "000000"},
            timeout=15,
        )
        assert r.status_code == 400, r.text
