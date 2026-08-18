"""
Message Central "Verify Now" OTP SMS provider client.

Replaces the previous client-side Firebase phone-auth flow. All OTP send/verify
now happens server-side so the Message Central credentials (customerId /
password) never leave the backend.

Flow (base URL: https://cpaas.messagecentral.com):
  1) GET  /auth/v1/authentication/token   -> returns top-level `token` (valid ~24h)
  2) POST /verification/v3/send           -> returns data.verificationId
  3) GET  /verification/v3/validateOtp    -> success when data.verificationStatus == VERIFICATION_COMPLETED

Header for send/validate: authToken: <token>

NOTE: env vars are read LAZILY (at call time) and .env is loaded here too, so this
module works no matter whether it is imported before or after server.py's own
load_dotenv() call.
"""
import os
import base64
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timedelta, timezone

import httpx
from dotenv import load_dotenv

# Make sure our .env is loaded even if this module is imported BEFORE server.py
# calls load_dotenv(). Without this, module-level credential reads could be empty.
load_dotenv(Path(__file__).resolve().parent / ".env")

log = logging.getLogger("messagecentral")

_TIMEOUT = httpx.Timeout(25.0)

# In-memory auth-token cache (backend runs a single worker, so this is safe).
_token_cache = {"token": None, "expires_at": None}
_token_lock = asyncio.Lock()


# --------------------------- config (read lazily) ---------------------------
def _cfg(key: str, default: str = "") -> str:
    return (os.environ.get(key, default) or "").strip()


def _base_url() -> str:
    return _cfg("MC_BASE_URL", "https://cpaas.messagecentral.com").rstrip("/")


def _customer_id() -> str:
    return _cfg("MC_CUSTOMER_ID")


def _password() -> str:
    return _cfg("MC_PASSWORD")


def _key_override() -> str:
    # Some accounts store the base-64 key directly.
    return _cfg("MC_KEY")


def _email() -> str:
    return _cfg("MC_EMAIL")


def _country() -> str:
    return _cfg("MC_COUNTRY", "91")


def _flow_type() -> str:
    return (_cfg("MC_FLOW_TYPE", "SMS") or "SMS").upper()


def _otp_length() -> int:
    try:
        return int(_cfg("MC_OTP_LENGTH", "6") or "6")
    except ValueError:
        return 6


def messagecentral_configured() -> bool:
    """True when we have enough config to talk to Message Central."""
    return bool(_customer_id() and (_password() or _key_override()))


def _encoded_key() -> str:
    if _key_override():
        return _key_override()
    return base64.b64encode(_password().encode()).decode()


def _safe_json(r: httpx.Response) -> dict:
    try:
        data = r.json()
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


async def _fetch_new_token() -> str:
    params = {
        "customerId": _customer_id(),
        "key": _encoded_key(),
        "scope": "NEW",
        "country": _country(),
    }
    if _email():
        params["email"] = _email()
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.get(
            f"{_base_url()}/auth/v1/authentication/token",
            params=params,
            headers={"accept": "*/*"},
        )
    data = _safe_json(r)
    token = data.get("token") or (data.get("data") or {}).get("token")
    if not token:
        log.error("[messagecentral] token fetch failed status=%s body=%s", r.status_code, r.text[:400])
        raise RuntimeError(f"Message Central token fetch failed (status {r.status_code})")
    return token


async def get_auth_token(force_refresh: bool = False) -> str:
    now = datetime.now(timezone.utc)
    if (
        not force_refresh
        and _token_cache["token"]
        and _token_cache["expires_at"]
        and _token_cache["expires_at"] > now
    ):
        return _token_cache["token"]
    async with _token_lock:
        now = datetime.now(timezone.utc)
        if (
            not force_refresh
            and _token_cache["token"]
            and _token_cache["expires_at"]
            and _token_cache["expires_at"] > now
        ):
            return _token_cache["token"]
        token = await _fetch_new_token()
        _token_cache["token"] = token
        _token_cache["expires_at"] = now + timedelta(hours=23)
        log.info("[messagecentral] obtained new auth token (cached ~23h)")
        return token


async def _post_send(token: str, params: dict) -> httpx.Response:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        return await client.post(
            f"{_base_url()}/verification/v3/send",
            params=params,
            headers={"authToken": token, "accept": "*/*"},
        )


async def _get_validate(token: str, params: dict) -> httpx.Response:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        return await client.get(
            f"{_base_url()}/verification/v3/validateOtp",
            params=params,
            headers={"authToken": token, "accept": "*/*"},
        )


async def send_otp(mobile: str, country_code: str = None, otp_length: int = None) -> str:
    """Send an OTP SMS via Message Central. Returns the verificationId."""
    if not messagecentral_configured():
        raise RuntimeError("Message Central is not configured")
    token = await get_auth_token()
    params = {
        "countryCode": country_code or _country(),
        "flowType": _flow_type(),
        "mobileNumber": mobile,
        "otpLength": otp_length or _otp_length(),
    }
    r = await _post_send(token, params)
    if r.status_code in (401, 403):
        token = await get_auth_token(force_refresh=True)
        r = await _post_send(token, params)
    data = _safe_json(r)
    if r.status_code >= 400:
        log.error("[messagecentral] send failed status=%s body=%s", r.status_code, r.text[:400])
        raise RuntimeError(f"Message Central send failed (status {r.status_code})")
    d = data.get("data") or {}
    vid = d.get("verificationId") or d.get("verficationId") or data.get("verificationId")
    if not vid:
        log.error("[messagecentral] send returned no verificationId body=%s", r.text[:400])
        raise RuntimeError("Message Central send returned no verificationId")
    return str(vid)


async def validate_otp(verification_id: str, code: str) -> dict:
    """Validate an OTP. Returns {'verified': bool, 'status', 'responseCode', 'error'}."""
    if not messagecentral_configured():
        raise RuntimeError("Message Central is not configured")
    token = await get_auth_token()
    params = {
        "verificationId": verification_id,
        "code": code,
        "flowType": _flow_type(),
        "langId": "en",
    }
    r = await _get_validate(token, params)
    if r.status_code in (401, 403):
        token = await get_auth_token(force_refresh=True)
        r = await _get_validate(token, params)
    data = _safe_json(r)
    d = data.get("data") or {}
    status = d.get("verificationStatus")
    response_code = str(d.get("responseCode") or data.get("responseCode") or "")
    error_message = d.get("errorMessage") or data.get("message")
    verified = status == "VERIFICATION_COMPLETED"
    if not verified:
        log.info(
            "[messagecentral] validate not completed status=%s rc=%s err=%s",
            status, response_code, error_message,
        )
    return {
        "verified": verified,
        "status": status,
        "responseCode": response_code,
        "error": error_message,
    }
