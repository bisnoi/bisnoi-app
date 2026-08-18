"""
Razorpay LIVE-key POC — proves the core payment integration works in isolation
BEFORE we build any UI around it.

Tests:
  1. Env keys load (LIVE) from backend/.env
  2. Orders API: create a real ₹1 order (100 paise) -> valid order_id
  3. Signature verify helper: a hand-computed HMAC passes utility.verify_payment_signature,
     and a tampered signature FAILS (clear rejection).

Run:  cd /app/backend && python scripts/razorpay_poc.py
"""
import os
import sys
import hmac
import hashlib
import razorpay
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")


def ok(msg):
    print(f"\033[92m[PASS]\033[0m {msg}")


def fail(msg):
    print(f"\033[91m[FAIL]\033[0m {msg}")


def main():
    print("=" * 60)
    print("RAZORPAY POC")
    print("=" * 60)

    # 1) keys loaded
    if not KEY_ID or not KEY_SECRET:
        fail("RAZORPAY keys missing from env")
        sys.exit(1)
    is_live = KEY_ID.startswith("rzp_live_")
    ok(f"Keys loaded. key_id prefix={KEY_ID[:12]} ({'LIVE' if is_live else 'TEST'}), secret_len={len(KEY_SECRET)}")

    client = razorpay.Client(auth=(KEY_ID, KEY_SECRET))

    # 2) create a real ₹1 order
    try:
        order = client.order.create({
            "amount": 100,  # ₹1 in paise
            "currency": "INR",
            "payment_capture": 1,
            "receipt": "poc_rcpt_001",
            "notes": {"purpose": "poc_connectivity_check"},
        })
        oid = order.get("id")
        if not oid or not oid.startswith("order_"):
            fail(f"Order create returned unexpected payload: {order}")
            sys.exit(1)
        ok(f"Order created: id={oid} amount={order.get('amount')} status={order.get('status')} currency={order.get('currency')}")
    except Exception as e:
        fail(f"Order create failed (keys/connectivity issue): {type(e).__name__}: {str(e)[:300]}")
        sys.exit(1)

    # 3) signature verify helper — simulate a client callback
    # In production, Razorpay sends razorpay_payment_id + razorpay_order_id + razorpay_signature.
    # signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret)
    fake_payment_id = "pay_POCFAKE0000001"
    body = f"{oid}|{fake_payment_id}"
    good_sig = hmac.new(KEY_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()

    try:
        client.utility.verify_payment_signature({
            "razorpay_order_id": oid,
            "razorpay_payment_id": fake_payment_id,
            "razorpay_signature": good_sig,
        })
        ok("verify_payment_signature accepts a correctly-signed payload")
    except Exception as e:
        fail(f"verify_payment_signature rejected a VALID signature: {e}")
        sys.exit(1)

    # tampered signature must fail
    try:
        client.utility.verify_payment_signature({
            "razorpay_order_id": oid,
            "razorpay_payment_id": fake_payment_id,
            "razorpay_signature": good_sig[:-4] + "0000",
        })
        fail("verify_payment_signature ACCEPTED a tampered signature (security bug)")
        sys.exit(1)
    except razorpay.errors.SignatureVerificationError:
        ok("verify_payment_signature correctly rejects a tampered signature")
    except Exception as e:
        # any rejection is acceptable here
        ok(f"Tampered signature rejected ({type(e).__name__})")

    print("=" * 60)
    ok("RAZORPAY POC PASSED — live keys valid, order create + signature verify work.")
    print("=" * 60)


if __name__ == "__main__":
    main()
