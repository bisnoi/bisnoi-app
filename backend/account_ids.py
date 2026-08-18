"""
Shared account-id helpers.

Extracted from server.py so that both server.py and features.py can import them
from a common, dependency-free module — this removes the previous
features.py -> server.py circular import (features used to do a local
`from server import _account_id_for_rest` inside a function to dodge the cycle).

Pure functions only; no DB / FastAPI / app imports here.
"""
import hashlib

# Human-readable account-number prefixes per role.
_ROLE_PREFIX = {
    "customer": "CUST",
    "restaurant_owner": "OWNR",
    "rider": "RIDR",
    "admin": "ADMN",
    "admin_staff": "ADMN",
    "restaurant_staff": "OWNR",
}


def _short_id_from_uuid(uid: str, length: int = 5) -> str:
    """Deterministic short id derived from a UUID (only alphanumerics).

    Uses SHA-256 (not MD5) so static-analysis tools don't flag this as weak;
    the digest is used purely as a source of pseudo-randomness for a human-
    readable 5-char account tag — never as a security primitive.
    """
    h = hashlib.sha256((uid or "").encode("utf-8")).hexdigest().upper()
    # Strip characters that are easy to confuse when read aloud (0/O, 1/I).
    safe = "".join(ch for ch in h if ch not in "0O1I")
    return safe[:length] or h[:length]


def _account_id_for_user(u: dict) -> str:
    prefix = _ROLE_PREFIX.get((u.get("role") or "customer"), "USER")
    return f"{prefix}-{_short_id_from_uuid(u.get('id', ''))}"


def _account_id_for_rest(r: dict) -> str:
    return f"REST-{_short_id_from_uuid(r.get('id', ''))}"


def _ensure_user_account_id(u: dict) -> dict:
    if isinstance(u, dict) and not u.get("account_id"):
        u["account_id"] = _account_id_for_user(u)
    return u


def _ensure_rest_account_id(r: dict) -> dict:
    if isinstance(r, dict) and not r.get("account_id"):
        r["account_id"] = _account_id_for_rest(r)
    return r
