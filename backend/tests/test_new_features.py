"""
Backend regression tests for Bisnoi feature additions:
- AI chat (session create, send, escalate)
- AI chat live context for customer last order
- Admin live handoff: sessions list, join, send, close
- Socket.IO handshake at /api/socket.io/
- WhatsApp admin settings GET (mask) / PATCH (persist; bullets do not overwrite)
- Web Push public-key (no auth), subscribe (auth), status
- Smoke checks for core flows still working (admin stats, restaurants list)
"""
import json
import os
import time
import requests

API = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://iska-preview-ready.preview.emergentagent.com").rstrip("/") + "/api"


# -------------------- AI chat --------------------
class TestChat:
    def _close_any_open(self, ctx):
        # admin closes any open session belonging to user to start clean
        pass  # we just rely on get_or_create returning current; cleaning by status check

    def test_session_create_greeting(self, customer, admin):
        r = customer["session"].post(f"{API}/chat/session")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "session" in data and "messages" in data
        assert data["session"]["status"] in ("bot", "waiting_admin", "admin_joined")
        assert isinstance(data["messages"], list)

    def test_send_answerable_question(self, admin, customer_chat):
        # ensure fresh-ish: close any existing sessions first to avoid races
        r = admin["session"].get(f"{API}/admin/chat/sessions")
        for s in r.json().get("sessions", []):
            if s.get("user_id") == customer_chat["user"]["id"] and s.get("status") != "closed":
                admin["session"].post(f"{API}/admin/chat/{s['id']}/close")
        r = customer_chat["session"].post(f"{API}/chat/session")
        sid = r.json()["session"]["id"]
        r2 = customer_chat["session"].post(
            f"{API}/chat/send",
            data=json.dumps({"text": "What payment methods can I use?", "session_id": sid}),
        )
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data["session"]["status"] == "bot", f"status={data['session']['status']}"
        bot_msgs = [m for m in data["messages"] if m["sender"] == "bot"]
        assert len(bot_msgs) >= 1
        assert len(bot_msgs[-1]["text"]) > 0

    def test_send_human_keyword_escalates(self, admin, customer):
        # First close any existing open session for clean state
        r = admin["session"].get(f"{API}/admin/chat/sessions")
        for s in r.json().get("sessions", []):
            if s.get("user_id") == customer["user"]["id"] and s.get("status") != "closed":
                admin["session"].post(f"{API}/admin/chat/{s['id']}/close")
        # Start fresh session
        r = customer["session"].post(f"{API}/chat/session")
        sid = r.json()["session"]["id"]
        assert r.json()["session"]["status"] == "bot"
        r2 = customer["session"].post(
            f"{API}/chat/send",
            data=json.dumps({"text": "please connect me to a human agent", "session_id": sid}),
        )
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data["session"]["status"] == "waiting_admin", f"expected waiting_admin got {data['session']['status']}"
        # system message inserted
        sys_msgs = [m for m in data["messages"] if m["sender"] == "system"]
        assert len(sys_msgs) >= 1

    def test_live_context_last_order(self, admin, customer_chat):
        # Close existing & open fresh
        r = admin["session"].get(f"{API}/admin/chat/sessions")
        for s in r.json().get("sessions", []):
            if s.get("user_id") == customer_chat["user"]["id"] and s.get("status") != "closed":
                admin["session"].post(f"{API}/admin/chat/{s['id']}/close")
        r = customer_chat["session"].post(f"{API}/chat/session")
        sid = r.json()["session"]["id"]
        r2 = customer_chat["session"].post(
            f"{API}/chat/send",
            data=json.dumps({"text": "what is the status of my last order?", "session_id": sid}),
        )
        assert r2.status_code == 200, r2.text
        data = r2.json()
        bot_msgs = [m for m in data["messages"] if m["sender"] == "bot"]
        # at least responded (either with no-orders or referencing an order)
        assert len(bot_msgs) >= 1
        assert len(bot_msgs[-1]["text"]) > 0


# -------------------- Admin live handoff --------------------
class TestAdminHandoff:
    def test_admin_sessions_list_has_waiting(self, admin, customer):
        # Ensure a waiting session exists
        admin_s = admin["session"]
        r = admin_s.get(f"{API}/admin/chat/sessions")
        for s in r.json().get("sessions", []):
            if s.get("user_id") == customer["user"]["id"] and s.get("status") != "closed":
                admin_s.post(f"{API}/admin/chat/{s['id']}/close")
        # Re-create + escalate
        r = customer["session"].post(f"{API}/chat/session")
        sid = r.json()["session"]["id"]
        customer["session"].post(
            f"{API}/chat/send",
            data=json.dumps({"text": "I want to talk to a human agent", "session_id": sid}),
        )
        r = admin_s.get(f"{API}/admin/chat/sessions")
        assert r.status_code == 200
        data = r.json()
        assert "waiting" in data and isinstance(data["waiting"], int)
        assert data["waiting"] >= 1
        # join
        rj = admin_s.post(f"{API}/admin/chat/{sid}/join")
        assert rj.status_code == 200, rj.text
        assert rj.json()["session"]["status"] == "admin_joined"
        # send
        rs = admin_s.post(
            f"{API}/admin/chat/{sid}/send",
            data=json.dumps({"text": "Hi, admin here. How can I help?"}),
        )
        assert rs.status_code == 200, rs.text
        msgs = rs.json()["messages"]
        admin_msgs = [m for m in msgs if m["sender"] == "admin"]
        assert len(admin_msgs) >= 1
        assert "admin here" in admin_msgs[-1]["text"].lower()
        # close
        rc = admin_s.post(f"{API}/admin/chat/{sid}/close")
        assert rc.status_code == 200
        # verify status closed
        rm = admin_s.get(f"{API}/admin/chat/{sid}/messages")
        assert rm.json()["session"]["status"] == "closed"


# -------------------- Socket.IO --------------------
class TestSocketIO:
    def test_handshake(self, api_base):
        r = requests.get(f"{api_base}/socket.io/?EIO=4&transport=polling", timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        body = r.text
        # Engine.IO v4 handshake starts with '0{' (open packet)
        assert body.startswith("0"), f"unexpected body: {body[:80]}"
        payload = json.loads(body[1:])
        assert "sid" in payload
        assert "upgrades" in payload


# -------------------- WhatsApp settings --------------------
class TestWhatsAppSettings:
    def test_get_masked(self, admin, api_base):
        r = admin["session"].get(f"{api_base}/admin/settings/whatsapp")
        assert r.status_code == 200, r.text
        cfg = r.json()
        for f in ["enabled", "access_token", "phone_number_id", "api_version",
                  "bill_template", "template_lang", "default_cc"]:
            assert f in cfg, f"missing {f}"
        # if a token is set, it must be masked (bullets + last 4)
        if cfg.get("access_token_set"):
            assert "\u2022" in cfg["access_token"]

    def test_patch_persist_and_bullets_not_overwrite(self, admin, api_base):
        # Save a known token + phone_number_id
        body = {
            "enabled": True,
            "access_token": "TESTTOKEN_ABCDEFG_1234",
            "phone_number_id": "TEST_PNID_001",
            "bill_template": "test_template",
            "template_lang": "en",
            "default_cc": "91",
        }
        r = admin["session"].patch(f"{api_base}/admin/settings/whatsapp", data=json.dumps(body))
        assert r.status_code == 200, r.text
        cfg = r.json()
        assert cfg["phone_number_id"] == "TEST_PNID_001"
        assert cfg["bill_template"] == "test_template"
        assert cfg.get("access_token_set") is True
        assert cfg["access_token"].endswith("1234")

        # Now PATCH with bullet-style access_token => must NOT overwrite
        masked = cfg["access_token"]
        r2 = admin["session"].patch(
            f"{api_base}/admin/settings/whatsapp",
            data=json.dumps({"access_token": masked, "phone_number_id": "TEST_PNID_002"}),
        )
        assert r2.status_code == 200, r2.text
        cfg2 = r2.json()
        assert cfg2["phone_number_id"] == "TEST_PNID_002"
        # still set + ends with original last4
        assert cfg2.get("access_token_set") is True
        assert cfg2["access_token"].endswith("1234")

        # Empty access_token must also not overwrite
        r3 = admin["session"].patch(
            f"{api_base}/admin/settings/whatsapp",
            data=json.dumps({"access_token": ""}),
        )
        assert r3.status_code == 200
        assert r3.json().get("access_token_set") is True


# -------------------- Web Push --------------------
class TestPush:
    def test_public_key_no_auth(self, api_base):
        r = requests.get(f"{api_base}/push/public-key", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "publicKey" in data and isinstance(data["publicKey"], str) and len(data["publicKey"]) > 20

    def test_subscribe_and_status(self, customer, api_base):
        sub = {
            "endpoint": f"https://fcm.googleapis.com/fcm/send/test-{int(time.time())}",
            "keys": {"p256dh": "BFakeP256dhKey", "auth": "FakeAuthKey"},
        }
        r = customer["session"].post(
            f"{api_base}/push/subscribe",
            data=json.dumps({"subscription": sub}),
        )
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        # status
        r2 = customer["session"].get(f"{api_base}/push/status")
        assert r2.status_code == 200
        st = r2.json()
        assert st["subscribed"] is True
        assert st["devices"] >= 1


# -------------------- Regression smoke --------------------
class TestRegressionSmoke:
    def test_admin_me(self, admin, api_base):
        r = admin["session"].get(f"{api_base}/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_customer_restaurants_list(self, customer, api_base):
        r = customer["session"].get(f"{api_base}/restaurants")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_owner_me(self, owner, api_base):
        r = owner["session"].get(f"{api_base}/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] == "restaurant_owner"

    def test_rider_me(self, rider, api_base):
        r = rider["session"].get(f"{api_base}/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] == "rider"
