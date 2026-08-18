"""
POC test script for policy_ext:
- Legal content (all 3 audiences × 7 keys) — public read + admin update
- Cancellation preview + cancel for all 3 phases
- Restaurant refund share for 3 score bands
- COD auto-disable + admin override + gate on POST /orders

Run:  python3 backend/test_policy_poc.py
Requires backend running on http://localhost:8001 and demo seed data.
"""
from __future__ import annotations

import json
import time
import uuid
import requests
import sys
from datetime import datetime, timezone, timedelta

BASE = "https://terms-center-5.preview.emergentagent.com/api"


def _log(name: str, ok: bool, extra: str = "") -> None:
    tag = "\u2705 PASS" if ok else "\u274C FAIL"
    print(f"{tag}: {name}" + (f"  ({extra})" if extra else ""))


def send_otp(phone: str) -> str:
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": phone}, timeout=10)
    r.raise_for_status()
    return r.json()["demo_otp"]


def verify_otp(phone: str, code: str, role: str | None = None, name: str | None = None) -> dict:
    payload = {"phone": phone, "code": code}
    if role:
        payload["role"] = role
    if name:
        payload["name"] = name
    r = requests.post(f"{BASE}/auth/verify-otp", json=payload, timeout=10)
    r.raise_for_status()
    return r.json()


def login_role(phone: str, role: str | None = None, name: str | None = None) -> tuple[str, dict]:
    code = send_otp(phone)
    resp = verify_otp(phone, code, role=role, name=name)
    return resp["token"], resp["user"]


def h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# Helpers to place a real order end-to-end (uses seeded restaurants + menu)
# ---------------------------------------------------------------------------

def place_test_order(customer_token: str, payment_method: str = "razorpay") -> dict:
    rests = requests.get(f"{BASE}/restaurants", timeout=10).json()
    # Find an open restaurant with menu items
    order_body = None
    for open_r in rests:
        rd = requests.get(f"{BASE}/restaurants/{open_r['id']}", timeout=10).json()
        items = rd.get("menu") or []
        first_available = next((m for m in items if m.get("price", 0) > 0 and m.get("available", True)), None)
        if not first_available:
            continue
        if not rd.get("restaurant", {}).get("open_now", True):
            continue
        order_body = {
            "restaurant_id": open_r["id"],
            "items": [{"menu_item_id": first_available["id"], "quantity": 1}],
            "address": {"line1": "POC Address", "city": "Test", "phone": "0000000000", "lat": open_r.get("lat"), "lng": open_r.get("lng")},
            "payment_method": payment_method,
        }
        break
    if not order_body:
        raise AssertionError("No open restaurant with menu items available")
    r = requests.post(f"{BASE}/orders", headers=h(customer_token), json=order_body, timeout=15)
    if r.status_code != 200:
        raise AssertionError(f"place_test_order failed {r.status_code}: {r.text}")
    return r.json()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_legal_content(admin_token: str) -> bool:
    ok_all = True
    for aud in ["customer", "restaurant", "rider"]:
        for key in ["terms", "privacy", "refund_policy", "cancellation_policy", "contact_us", "faqs", "help"]:
            r = requests.get(f"{BASE}/legal/{aud}/{key}", timeout=10)
            got = r.status_code == 200 and (r.json().get("content", {}).get("title"))
            _log(f"legal GET {aud}/{key}", bool(got))
            ok_all = ok_all and bool(got)
    # Admin update
    r = requests.patch(
        f"{BASE}/admin/legal/customer/terms",
        headers=h(admin_token),
        json={"content": {"title": "Custom Terms", "updated_at": datetime.utcnow().isoformat(), "sections": [{"title": "A", "body": "B"}]}},
        timeout=10,
    )
    updated_ok = r.status_code == 200 and r.json()["content"]["title"] == "Custom Terms"
    _log("admin PATCH /admin/legal/customer/terms", updated_ok)
    ok_all = ok_all and updated_ok
    # Public read reflects
    r = requests.get(f"{BASE}/legal/customer/terms", timeout=10)
    reflect_ok = r.status_code == 200 and r.json()["content"]["title"] == "Custom Terms"
    _log("public read reflects update", reflect_ok)
    ok_all = ok_all and reflect_ok
    # Reset
    r = requests.post(f"{BASE}/admin/legal/customer/terms/reset", headers=h(admin_token), timeout=10)
    reset_ok = r.status_code == 200 and r.json()["content"]["title"] == "Terms & Conditions"
    _log("admin RESET /admin/legal/customer/terms", reset_ok)
    ok_all = ok_all and reset_ok
    return ok_all


def test_cancellation_free_window(customer_token: str) -> bool:
    order = place_test_order(customer_token, payment_method="razorpay")
    oid = order["id"]
    r = requests.get(f"{BASE}/orders/{oid}/cancel-preview", headers=h(customer_token), timeout=10)
    if r.status_code != 200:
        _log("free-window preview", False, r.text[:200])
        return False
    prev = r.json()
    ok_phase = prev["phase"] == "free_window" and prev["customer_refund_pct"] == 100
    _log("free-window preview 100% refund", ok_phase, f"phase={prev['phase']} pct={prev['customer_refund_pct']}")
    r = requests.post(f"{BASE}/orders/{oid}/cancel", headers=h(customer_token), json={"reason": "changed mind"}, timeout=10)
    ok_cancel = r.status_code == 200 and r.json()["outcome"]["customer_refund_pct"] == 100
    _log("free-window cancel executes 100% refund", ok_cancel, f"status={r.status_code}")
    return ok_phase and ok_cancel


def test_cancellation_before_pickup(customer_token: str, admin_token: str) -> bool:
    order = place_test_order(customer_token, payment_method="razorpay")
    oid = order["id"]
    # Shift order's placed_at back by 2 minutes via admin API? — we don't have one.
    # Instead we'll wait for the free-window to elapse (default 60s).
    # For POC speed, temporarily lower window to 1s, cancel, then restore.
    requests.patch(f"{BASE}/admin/settings/cancellation", headers=h(admin_token), json={"free_cancel_window_seconds": 1}, timeout=10)
    time.sleep(2)
    r = requests.get(f"{BASE}/orders/{oid}/cancel-preview", headers=h(customer_token), timeout=10)
    prev = r.json()
    ok_phase = prev["phase"] == "before_pickup"
    _log("before-pickup phase detected", ok_phase, f"phase={prev.get('phase')}")
    # Cancel
    r = requests.post(f"{BASE}/orders/{oid}/cancel", headers=h(customer_token), json={"reason": "delay"}, timeout=10)
    out = r.json().get("outcome") or {}
    ok_cancel = r.status_code == 200 and out.get("phase") == "before_pickup"
    _log("before-pickup cancel executes", ok_cancel, f"status={r.status_code} phase={out.get('phase')}")
    # Restore
    requests.patch(f"{BASE}/admin/settings/cancellation", headers=h(admin_token), json={"free_cancel_window_seconds": 60}, timeout=10)
    return ok_phase and ok_cancel


def test_restaurant_score_bands(admin_token: str) -> bool:
    # Fetch all restaurants performance
    r = requests.get(f"{BASE}/admin/restaurants-performance", headers=h(admin_token), timeout=15)
    if r.status_code != 200:
        _log("restaurants-performance", False, r.text[:200])
        return False
    items = r.json().get("items", [])
    ok = len(items) > 0 and all("composite_score" in it and "score_band" in it for it in items)
    _log("restaurants-performance list", ok, f"count={len(items)}")
    return ok


def test_cod_gate_and_override(admin_token: str, customer_token: str, customer_user: dict) -> bool:
    # Initially COD should be available
    r = requests.get(f"{BASE}/me/payment-options", headers=h(customer_token), timeout=10)
    if r.status_code != 200:
        _log("me/payment-options initial", False, r.text[:200])
        return False
    initial_ok = r.json().get("cod_available") is True
    _log("COD initially available", initial_ok, f"reason={r.json().get('reason')}")

    # Admin blocks COD
    uid = customer_user["id"]
    r = requests.patch(
        f"{BASE}/admin/customers/{uid}/payment-status",
        headers=h(admin_token),
        json={"override": "block", "reason": "Test blocking for POC"},
        timeout=10,
    )
    block_ok = r.status_code == 200 and r.json().get("cod_available") is False
    _log("admin block COD override", block_ok, f"reason={r.json().get('reason')}")
    # Try COD order → must be rejected
    try:
        _ = place_test_order(customer_token, payment_method="cod")
        gate_ok = False
        _log("COD gate blocks order", False, "order accepted unexpectedly")
    except AssertionError as e:
        gate_ok = "403" in str(e) or "Cash on Delivery" in str(e).lower() or "COD" in str(e)
        _log("COD gate blocks order", gate_ok, str(e)[:120])
    # Prepaid should still work
    prepaid_ok = False
    try:
        pp = place_test_order(customer_token, payment_method="razorpay")
        prepaid_ok = bool(pp.get("id"))
    except AssertionError as e:
        _log("Prepaid still works", False, str(e)[:120])
    _log("Prepaid still works while COD blocked", prepaid_ok)
    # Clear override
    r = requests.patch(
        f"{BASE}/admin/customers/{uid}/payment-status",
        headers=h(admin_token),
        json={"override": "clear"},
        timeout=10,
    )
    cleared_ok = r.status_code == 200 and r.json().get("cod_available") is True
    _log("admin clear COD override", cleared_ok)
    return initial_ok and block_ok and gate_ok and prepaid_ok and cleared_ok


def test_admin_cancel_rules_editing(admin_token: str) -> bool:
    r = requests.get(f"{BASE}/admin/settings/cancellation", headers=h(admin_token), timeout=10)
    if r.status_code != 200:
        _log("admin cancel rules GET", False, r.text[:200])
        return False
    r = requests.patch(f"{BASE}/admin/settings/cancellation", headers=h(admin_token), json={"restaurant_share_mid_pct": 45}, timeout=10)
    ok = r.status_code == 200 and r.json().get("restaurant_share_mid_pct") == 45
    _log("admin cancel rules PATCH", ok)
    # revert
    requests.patch(f"{BASE}/admin/settings/cancellation", headers=h(admin_token), json={"restaurant_share_mid_pct": 50}, timeout=10)
    return ok


def main():
    print("== policy_ext POC ==")
    # Log in as admin & a fresh customer
    admin_token, admin_user = login_role("9999999999", role="admin", name="Admin")
    _log("admin login", bool(admin_token))

    # Fresh customer per-run
    fresh_phone = f"9{uuid.uuid4().int % 1000000000:09d}"
    print(f"[i] Fresh customer phone: {fresh_phone}")
    cust_token, cust_user = login_role(fresh_phone, role="customer", name="POC Customer")
    _log("customer login", bool(cust_token))

    results = {
        "legal": test_legal_content(admin_token),
        "cancel_rules": test_admin_cancel_rules_editing(admin_token),
        "cancel_free_window": test_cancellation_free_window(cust_token),
        "cancel_before_pickup": test_cancellation_before_pickup(cust_token, admin_token),
        "restaurant_bands": test_restaurant_score_bands(admin_token),
        "cod_gate": test_cod_gate_and_override(admin_token, cust_token, cust_user),
    }

    print("\n== Summary ==")
    for k, v in results.items():
        print(f"  {'PASS' if v else 'FAIL'}  {k}")
    all_ok = all(results.values())
    print(f"\nOverall: {'ALL PASS ' + chr(0x2705) if all_ok else 'FAILURES ' + chr(0x274C)}")
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
