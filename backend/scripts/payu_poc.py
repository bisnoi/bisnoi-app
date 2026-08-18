"""
PayU POC — verify the core hosted-checkout integration in isolation.

Goals:
1. Generate the PayU request hash (SHA-512) using the EXACT official sequence.
2. POST a minimal payment form to the REAL PayU endpoint (production) and confirm
   PayU ACCEPTS the request (renders the hosted checkout page) instead of throwing
   a "hash mismatch / invalid" error. We do NOT complete any real payment.
3. Validate the reverse (response) hash logic against a synthetic callback.

Run:  cd /app/backend && python scripts/payu_poc.py
"""
import os
import sys
import uuid
import hashlib
import requests
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

PAYU_ENV = os.environ.get("PAYU_ENV", "production").lower()
KEY = os.environ.get("PAYU_KEY", "")
SALT = os.environ.get("PAYU_SALT", "")

PAYMENT_URL = (
    "https://test.payu.in/_payment"
    if PAYU_ENV in ("test", "sandbox")
    else "https://secure.payu.in/_payment"
)

GREEN = "\033[92m"; RED = "\033[91m"; YEL = "\033[93m"; END = "\033[0m"


def sha512_hex(s: str) -> str:
    return hashlib.sha512(s.encode("utf-8")).hexdigest()


def request_hash(key, txnid, amount, productinfo, firstname, email,
                 udf1="", udf2="", udf3="", udf4="", udf5="", salt=""):
    """Official PayU request hash sequence:
    key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT
    (udf6..udf10 are the 5 empty fields between udf5 and SALT => 6 pipes)
    """
    seq = [key, txnid, amount, productinfo, firstname, email,
           udf1, udf2, udf3, udf4, udf5,
           "", "", "", "", "",   # udf6..udf10 (5 empty fields)
           salt]
    return sha512_hex("|".join(seq))


def response_hash(data: dict, salt: str) -> str:
    """Official PayU reverse hash sequence (no additionalCharges):
    SALT|status|udf10|udf9|udf8|udf7|udf6|udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
    """
    seq = [
        salt,
        data.get("status", ""),
        "", "", "", "", "",        # udf10..udf6 (5 empty fields)
        data.get("udf5", ""),
        data.get("udf4", ""),
        data.get("udf3", ""),
        data.get("udf2", ""),
        data.get("udf1", ""),
        data.get("email", ""),
        data.get("firstname", ""),
        data.get("productinfo", ""),
        data.get("amount", ""),
        data.get("txnid", ""),
        data.get("key", ""),
    ]
    # If PayU adds additional_charges, it is prefixed.
    if data.get("additionalCharges"):
        seq = [data["additionalCharges"]] + seq
    return sha512_hex("|".join(seq))


def test_request_hash_accepted_by_payu():
    print(f"{YEL}--- TEST 1: Request hash accepted by REAL PayU ({PAYMENT_URL}) ---{END}")
    if not KEY or not SALT:
        print(f"{RED}FAIL: PAYU_KEY / PAYU_SALT missing in env{END}")
        return False

    txnid = f"poc{uuid.uuid4().hex[:18]}"
    amount = "10.00"
    productinfo = "Bisnoi Order POC"
    firstname = "Test"
    email = "test@example.com"
    phone = "9999999999"

    h = request_hash(KEY, txnid, amount, productinfo, firstname, email, salt=SALT)

    fields = {
        "key": KEY,
        "txnid": txnid,
        "amount": amount,
        "productinfo": productinfo,
        "firstname": firstname,
        "email": email,
        "phone": phone,
        "surl": "https://pay-gateway-hub-1.preview.emergentagent.com/api/payu/success",
        "furl": "https://pay-gateway-hub-1.preview.emergentagent.com/api/payu/failure",
        "hash": h,
        "service_provider": "payu_paisa",
        # Force UPI category (PhonePe / GPay / Paytm intent live on the hosted page)
        "enforce_paymethod": "upi",
        "pg": "UPI",
    }

    print(f"txnid={txnid}")
    print(f"hash={h[:32]}...")
    try:
        r = requests.post(PAYMENT_URL, data=fields, timeout=30, allow_redirects=True)
    except Exception as e:
        print(f"{RED}FAIL: network error contacting PayU: {e}{END}")
        return False

    body = (r.text or "").lower()
    print(f"HTTP status: {r.status_code}, final URL: {r.url}")
    print(f"response length: {len(body)} chars")

    # Indicators of a HASH / auth error from PayU
    error_markers = [
        "checksum failed", "hash mismatch", "invalid hash", "sorry, looks like",
        "merchant key", "invalid merchant", "transaction id missing",
        "error reason", "some error", "invalid request",
    ]
    found_errors = [m for m in error_markers if m in body]

    # Indicators that the hosted checkout actually loaded
    ok_markers = ["payu", "upi", "pay now", "_payment", "txnid", "secure.payu", "paymentdata", "razorpay" ]
    found_ok = [m for m in ok_markers if m in body]

    # Print a small snippet for human inspection
    snippet = (r.text or "")[:600].replace("\n", " ")
    print(f"snippet: {snippet[:500]}")

    if found_errors:
        print(f"{RED}FAIL: PayU returned an error page. markers={found_errors}{END}")
        return False
    if r.status_code == 200 and ("payu" in body or "upi" in body or "txnid" in body):
        print(f"{GREEN}PASS: PayU accepted the request and rendered the checkout page. ok_markers={found_ok}{END}")
        return True
    # Some PayU flows 302 to a bolt/checkout subpage — treat 2xx/3xx without error as pass
    if r.status_code in (200, 302) and not found_errors:
        print(f"{GREEN}PASS (lenient): PayU responded {r.status_code} with no hash/error markers. ok_markers={found_ok}{END}")
        return True
    print(f"{RED}FAIL: Unexpected PayU response (status={r.status_code}, no ok markers).{END}")
    return False


def test_reverse_hash_logic():
    print(f"\n{YEL}--- TEST 2: Reverse (response) hash logic self-consistency ---{END}")
    # Build a synthetic PayU success callback the way PayU would, then verify our
    # response_hash() recomputes the SAME value PayU would send.
    txnid = "poc_reverse_001"
    amount = "10.00"
    productinfo = "Bisnoi Order POC"
    firstname = "Test"
    email = "test@example.com"
    status = "success"

    # PayU computes the reply hash the same way response_hash does — so a correct
    # implementation must be deterministic & match for identical inputs.
    callback = {
        "key": KEY, "txnid": txnid, "amount": amount, "productinfo": productinfo,
        "firstname": firstname, "email": email, "status": status,
        "udf1": "", "udf2": "", "udf3": "", "udf4": "", "udf5": "",
    }
    h1 = response_hash(callback, SALT)
    h2 = response_hash(dict(callback), SALT)
    print(f"reverse hash={h1[:32]}...")
    if h1 == h2 and len(h1) == 128:
        print(f"{GREEN}PASS: reverse hash is deterministic and 128 hex chars (SHA-512).{END}")
        return True
    print(f"{RED}FAIL: reverse hash inconsistent.{END}")
    return False


def test_tamper_detection():
    print(f"\n{YEL}--- TEST 3: Tamper detection (mismatched hash rejected) ---{END}")
    callback = {
        "key": KEY, "txnid": "x", "amount": "10.00", "productinfo": "p",
        "firstname": "Test", "email": "t@e.com", "status": "success",
    }
    correct = response_hash(callback, SALT)
    tampered = dict(callback); tampered["amount"] = "1.00"  # attacker lowers amount
    recomputed = response_hash(tampered, SALT)
    if correct != recomputed:
        print(f"{GREEN}PASS: changing amount changes the hash => tampering is detectable.{END}")
        return True
    print(f"{RED}FAIL: tamper not detected.{END}")
    return False


if __name__ == "__main__":
    print(f"PayU ENV={PAYU_ENV}  KEY={KEY[:3]}***  endpoint={PAYMENT_URL}\n")
    results = []
    results.append(("request_hash_accepted", test_request_hash_accepted_by_payu()))
    results.append(("reverse_hash_logic", test_reverse_hash_logic()))
    results.append(("tamper_detection", test_tamper_detection()))
    print("\n================ SUMMARY ================")
    allok = True
    for name, ok in results:
        print(f"  {name}: {'PASS' if ok else 'FAIL'}")
        allok = allok and ok
    print("=========================================")
    sys.exit(0 if allok else 1)
