import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://iska-preview-ready.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(phone: str) -> dict:
    s = requests.Session()
    r = s.post(f"{API}/auth/send-otp", json={"phone": phone}, timeout=20)
    assert r.status_code == 200, f"send-otp {phone} -> {r.status_code} {r.text}"
    otp = r.json()["demo_otp"]
    r = s.post(f"{API}/auth/verify-otp", json={"phone": phone, "code": otp}, timeout=20)
    assert r.status_code == 200, f"verify-otp {phone} -> {r.status_code} {r.text}"
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"})
    return {"session": s, "user": data["user"], "token": data["token"]}


@pytest.fixture(scope="session")
def api_base():
    return API


@pytest.fixture(scope="session")
def admin():
    return _login("9999999999")


@pytest.fixture(scope="session")
def customer():
    return _login("5550001111")


@pytest.fixture(scope="session")
def customer_chat():
    # dedicated customer used by AI chat tests to avoid races with admin handoff tests
    return _login("5550002222")


@pytest.fixture(scope="session")
def owner():
    return _login("8888888888")


@pytest.fixture(scope="session")
def rider():
    return _login("7777777777")
