"""Isolated POC test for Message Central credentials.
Step 1: token generation (validates customerId + key + email) — NO SMS cost.
Step 2 (optional): send OTP to a number if passed as argv[1] — spends 1 SMS credit.
"""
import sys
import os
import asyncio
import base64
import httpx
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE = os.environ["MC_BASE_URL"].rstrip("/")
CID = os.environ["MC_CUSTOMER_ID"]
PWD = os.environ["MC_PASSWORD"]
EMAIL = os.environ["MC_EMAIL"]
COUNTRY = os.environ["MC_COUNTRY"]
FLOW = os.environ["MC_FLOW_TYPE"]
OTP_LEN = os.environ["MC_OTP_LENGTH"]

KEY = base64.b64encode(PWD.encode()).decode()


async def main():
    print(f"BASE={BASE}")
    print(f"customerId={CID}")
    print(f"key(base64)={KEY}")
    print("=" * 50)

    # ---- Step 1: token ----
    params = {"customerId": CID, "key": KEY, "scope": "NEW", "country": COUNTRY, "email": EMAIL}
    async with httpx.AsyncClient(timeout=25) as c:
        r = await c.get(f"{BASE}/auth/v1/authentication/token", params=params, headers={"accept": "*/*"})
    print(f"[TOKEN] status={r.status_code}")
    print(f"[TOKEN] body={r.text[:600]}")
    try:
        data = r.json()
    except Exception:
        data = {}
    token = data.get("token") or (data.get("data") or {}).get("token")
    if not token:
        print("RESULT: FAILED to get token — check credentials.")
        return
    print(f"RESULT: TOKEN OK -> {token[:40]}...")
    print("=" * 50)

    # ---- Step 2: send OTP (only if a phone number is passed) ----
    if len(sys.argv) > 1:
        mobile = sys.argv[1]
        sp = {"countryCode": COUNTRY, "flowType": FLOW, "mobileNumber": mobile, "otpLength": OTP_LEN}
        async with httpx.AsyncClient(timeout=25) as c:
            r2 = await c.post(f"{BASE}/verification/v3/send", params=sp, headers={"authToken": token, "accept": "*/*"})
        print(f"[SEND] status={r2.status_code}")
        print(f"[SEND] body={r2.text[:600]}")
    else:
        print("(Skipping SEND — pass a phone number as arg to test SMS send.)")


asyncio.run(main())
