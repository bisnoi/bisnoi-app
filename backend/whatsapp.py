"""
WhatsApp delivery for POS bills.

Uses the official Meta WhatsApp Cloud API. Credentials can come from two places
(DB-stored admin settings take priority, then environment variables):
  WHATSAPP_ACCESS_TOKEN / access_token       - permanent/system-user access token
  WHATSAPP_PHONE_NUMBER_ID / phone_number_id - the sender phone number id
Optional:
  WHATSAPP_API_VERSION / api_version         - default "v21.0"
  WHATSAPP_BILL_TEMPLATE / bill_template     - name of an APPROVED template with a
                                               single body parameter {{1}}
  WHATSAPP_TEMPLATE_LANG / template_lang     - template language code, default "en"
  WHATSAPP_DEFAULT_CC / default_cc           - default country code, "91"

When not configured it gracefully falls back to a wa.me click-to-send deep link so
the billing flow always works end to end.
"""
import os
import logging
from urllib.parse import quote

import httpx

logger = logging.getLogger("whatsapp")

INR = "\u20B9"


def _cfg(config: dict, key: str, env: str, default: str = "") -> str:
    """Resolve a config value: admin DB settings first, then env, then default."""
    if config:
        v = config.get(key)
        if v not in (None, ""):
            return str(v)
    return os.environ.get(env, default)


def _digits_with_cc(phone: str, cc: str = "91") -> str:
    """Normalise a phone number to digits incl. country code (E.164 w/o '+')."""
    d = "".join(ch for ch in (phone or "") if ch.isdigit())
    if len(d) == 10:  # bare Indian mobile -> prefix default country code
        d = (cc or "91") + d
    return d


def _money(x) -> str:
    try:
        return f"{INR}{float(x):.2f}"
    except Exception:
        return f"{INR}0.00"


def build_bill_message(bill: dict) -> str:
    """Human-readable plain-text bill used for WhatsApp text/template body."""
    lines = []
    lines.append(f"*{bill.get('restaurant_name') or 'Bisnoi'}*")
    lines.append(f"Bill: {bill.get('bill_number', '')}")
    if bill.get("table_label"):
        lines.append(f"Table: {bill['table_label']}")
    if bill.get("customer_name"):
        lines.append(f"Customer: {bill['customer_name']}")
    lines.append("--------------------------------")
    for it in bill.get("items", []):
        amt = it.get("amount", it.get("price", 0) * it.get("qty", 0))
        lines.append(f"{it.get('name')} x{it.get('qty')}  {_money(amt)}")
    lines.append("--------------------------------")
    lines.append(f"Subtotal: {_money(bill.get('subtotal', 0))}")
    if bill.get("discount_amount"):
        lines.append(f"Discount: -{_money(bill['discount_amount'])}")
    if bill.get("tax_amount"):
        lines.append(f"GST ({bill.get('tax_percent', 0)}%): +{_money(bill['tax_amount'])}")
    lines.append(f"*TOTAL: {_money(bill.get('total', 0))}*")
    # Split payments
    pays = bill.get("payments") or []
    if pays:
        label = {"cash": "Cash", "upi": "Online/UPI", "card": "Card"}
        for p in pays:
            if p.get("amount"):
                lines.append(f"Paid ({label.get(p.get('method'), p.get('method'))}): {_money(p['amount'])}")
    if bill.get("change"):
        lines.append(f"Change: {_money(bill['change'])}")
    lines.append("")
    lines.append("Thank you! Visit again \U0001F64F")
    return "\n".join(lines)


def wa_link(phone: str, text: str, cc: str = "91") -> str:
    return f"https://wa.me/{_digits_with_cc(phone, cc)}?text={quote(text)}"


async def send_whatsapp_bill(phone: str, bill: dict, config: dict = None) -> dict:
    """Send the bill over WhatsApp. Returns a status dict (never raises).

    `config` is the admin-stored WhatsApp settings dict (optional); env vars are the fallback.
    """
    config = config or {}
    cc = _cfg(config, "default_cc", "WHATSAPP_DEFAULT_CC", "91")
    text = build_bill_message(bill)
    link = wa_link(phone, text, cc)
    to = _digits_with_cc(phone, cc)

    token = _cfg(config, "access_token", "WHATSAPP_ACCESS_TOKEN").strip()
    phone_id = _cfg(config, "phone_number_id", "WHATSAPP_PHONE_NUMBER_ID").strip()
    enabled = config.get("enabled", True) if config else True

    if not (token and phone_id and enabled):
        return {
            "sent": False,
            "configured": False,
            "channel": "link",
            "to": to,
            "wa_link": link,
            "message": "WhatsApp API not configured \u2014 open the link to send manually.",
        }

    version = _cfg(config, "api_version", "WHATSAPP_API_VERSION", "v21.0")
    url = f"https://graph.facebook.com/{version}/{phone_id}/messages"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    template = _cfg(config, "bill_template", "WHATSAPP_BILL_TEMPLATE").strip()
    if template:
        lang = _cfg(config, "template_lang", "WHATSAPP_TEMPLATE_LANG", "en")
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": template,
                "language": {"code": lang},
                "components": [
                    {"type": "body", "parameters": [{"type": "text", "text": text}]}
                ],
            },
        }
    else:
        # Free-form text only works inside the 24h customer-initiated window.
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": {"preview_url": False, "body": text},
        }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(url, headers=headers, json=payload)
        if r.status_code in (200, 201):
            data = r.json()
            mid = (data.get("messages") or [{}])[0].get("id")
            return {"sent": True, "configured": True, "channel": "cloud_api",
                    "to": to, "message_id": mid, "wa_link": link}
        logger.warning("WhatsApp send failed %s: %s", r.status_code, r.text[:500])
        return {"sent": False, "configured": True, "channel": "cloud_api", "to": to,
                "error": f"HTTP {r.status_code}", "detail": r.text[:300], "wa_link": link}
    except Exception as e:  # network/timeouts etc.
        logger.warning("WhatsApp send exception: %s", e)
        return {"sent": False, "configured": True, "channel": "cloud_api", "to": to,
                "error": str(e), "wa_link": link}


async def send_whatsapp_marketing(phone: str, message: str, config: dict = None,
                                  template: str = "", template_lang: str = "en",
                                  customer_name: str = None) -> dict:
    """Send a MARKETING template message via the WhatsApp Cloud API.

    Business-initiated marketing messages MUST use an APPROVED marketing-category
    template. We map the owner's composed promo text to the template's single body
    parameter {{1}} (mirrors the bill-template approach).

    `config`   -> WhatsApp Cloud API credentials dict (access_token, phone_number_id, ...).
    `template` -> approved marketing template name (from admin Marketing settings).

    Never raises. When creds/template are missing it returns a wa.me fallback link
    (channel="link") so the owner can still send manually — and such sends are NOT
    metered against the wallet.
    """
    config = config or {}
    cc = _cfg(config, "default_cc", "WHATSAPP_DEFAULT_CC", "91")
    to = _digits_with_cc(phone, cc)
    link = wa_link(phone, message, cc)

    token = _cfg(config, "access_token", "WHATSAPP_ACCESS_TOKEN").strip()
    phone_id = _cfg(config, "phone_number_id", "WHATSAPP_PHONE_NUMBER_ID").strip()
    template = (template or "").strip()
    enabled = config.get("enabled", True) if config else True

    if not (token and phone_id and template and enabled):
        return {
            "sent": False,
            "configured": False,
            "channel": "link",
            "to": to,
            "wa_link": link,
            "message": "WhatsApp marketing not configured \u2014 open the link to send manually.",
        }

    version = _cfg(config, "api_version", "WHATSAPP_API_VERSION", "v21.0")
    lang = (template_lang or _cfg(config, "template_lang", "WHATSAPP_TEMPLATE_LANG", "en")).strip() or "en"
    url = f"https://graph.facebook.com/{version}/{phone_id}/messages"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": template,
            "language": {"code": lang},
            "components": [
                {"type": "body", "parameters": [{"type": "text", "text": message}]}
            ],
        },
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(url, headers=headers, json=payload)
        if r.status_code in (200, 201):
            data = r.json()
            mid = (data.get("messages") or [{}])[0].get("id")
            return {"sent": True, "configured": True, "channel": "cloud_api",
                    "to": to, "message_id": mid, "wa_link": link}
        # Surface Meta's error code so the UI can explain re-engagement / bad number etc.
        try:
            err = r.json().get("error", {})
        except Exception:
            err = {}
        logger.warning("WhatsApp marketing send failed %s: %s", r.status_code, r.text[:400])
        return {"sent": False, "configured": True, "channel": "cloud_api", "to": to,
                "error": err.get("message") or f"HTTP {r.status_code}",
                "error_code": err.get("code"), "wa_link": link}
    except Exception as e:
        logger.warning("WhatsApp marketing send exception: %s", e)
        return {"sent": False, "configured": True, "channel": "cloud_api", "to": to,
                "error": str(e), "wa_link": link}
