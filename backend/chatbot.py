"""
AI support chatbot + live human (admin) handoff for Bisnoi.

- Every role (customer / restaurant_owner / rider) gets an in-app assistant.
- The bot answers using LIVE context (the user's real orders / restaurant / profile)
  via Google Gemini (GEMINI_API_KEY).
- If the bot can't resolve the issue (or the user asks for a human), the session is
  escalated to `waiting_admin`; admins are notified and can JOIN the chat to reply
  live. Realtime delivery is over Socket.IO (rooms = chat:<session_id>).

Collections:
  chat_sessions : { id, user_id, user_name, user_phone, role, status, admin_id,
                    admin_name, subject, last_message, last_sender, created_at, updated_at }
  chat_messages : { id, session_id, sender(user|bot|admin|system), sender_name,
                    text, created_at }
"""
import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

log = logging.getLogger("chatbot")

# Sentinel control token the LLM emits (never shown to users) to trigger a
# hand-off to a human agent. NOT a secret/credential — it's a plain marker.
ESCALATE_TOKEN = "<ESCALATE>"
HUMAN_KEYWORDS = ["talk to human", "talk to a human", "human agent", "real person",
                  "speak to agent", "customer care", "call admin", "contact admin",
                  "agent se baat", "insaan", "admin se baat", "live agent", "representative"]


def _now():
    return datetime.now(timezone.utc).isoformat()


# --- Per-role live-context builders (extracted from gather_context to keep it
# flat & simple). Each appends human-readable lines the LLM uses to answer
# questions about the caller's real orders/account. Pure read-only queries. ---
async def _ctx_customer(db, user, lines):
    orders = await db.orders.find({"customer_id": user["id"]}, {"_id": 0}).sort("placed_at", -1).to_list(8)
    if not orders:
        lines.append("ORDERS: (none yet)")
    for o in orders:
        items = ", ".join(f"{it.get('quantity', 1)}x {it.get('name')}" for it in o.get("items", [])[:6])
        lines.append(
            f"ORDER {o['id'][:8]} | {o.get('restaurant_name')} | status={o.get('status')} | "
            f"payment={o.get('payment_method')}/{o.get('payment_status')} | total=Rs{o.get('total')} | "
            f"placed={o.get('placed_at', '')[:16]} | rider={o.get('rider_name') or 'unassigned'} | items=[{items}]"
        )


async def _ctx_owner(db, user, lines):
    rests = await db.restaurants.find({"owner_id": user["id"]}, {"_id": 0}).to_list(10)
    for r in rests:
        lines.append(f"RESTAURANT {r['id'][:8]} | {r.get('name')} | open={r.get('is_open')} | rating={r.get('rating')}")
    rids = [r["id"] for r in rests]
    orders = await db.orders.find({"restaurant_id": {"$in": rids}}, {"_id": 0}).sort("placed_at", -1).to_list(10)
    active = [o for o in orders if o.get("status") in ("placed", "accepted", "preparing", "ready", "picked")]
    lines.append(f"ACTIVE_ORDERS: {len(active)} | RECENT (last {len(orders)}):")
    for o in orders[:8]:
        lines.append(f"ORDER {o['id'][:8]} | status={o.get('status')} | total=Rs{o.get('total')} | {o.get('customer_name')}")
    items_count = await db.menu_items.count_documents({"restaurant_id": {"$in": rids}})
    lines.append(f"MENU_ITEMS: {items_count}")


async def _ctx_rider(db, user, lines):
    mine = await db.orders.find({"rider_id": user["id"]}, {"_id": 0}).sort("placed_at", -1).to_list(8)
    active = [o for o in mine if o.get("status") in ("accepted", "preparing", "ready", "picked")]
    lines.append(f"MY_ACTIVE_DELIVERIES: {len(active)}")
    for o in mine[:6]:
        lines.append(f"ORDER {o['id'][:8]} | {o.get('restaurant_name')} | status={o.get('status')} | total=Rs{o.get('total')}")
    avail = await db.orders.count_documents({"status": {"$in": ["ready", "accepted", "preparing"]}, "rider_id": None})
    lines.append(f"AVAILABLE_PICKUPS: {avail}")


_CTX_BUILDERS = {
    "customer": _ctx_customer,
    "restaurant_owner": _ctx_owner,
    "rider": _ctx_rider,
}


def make_chat_router(db, get_current_user, require_role, sio, create_notification, llm_key):
    router = APIRouter()

    # ---------------- realtime helpers ----------------
    def room(session_id: str) -> str:
        return f"chat:{session_id}"

    async def emit_message(session_id: str, msg: dict):
        try:
            await sio.emit("chat_message", msg, room=room(session_id))
        except Exception as e:  # noqa: BLE001
            log.warning("emit chat_message failed: %s", e)

    async def emit_status(session_id: str, payload: dict):
        try:
            await sio.emit("chat_status", payload, room=room(session_id))
        except Exception as e:  # noqa: BLE001
            log.warning("emit chat_status failed: %s", e)

    async def emit_lobby(payload: dict):
        try:
            await sio.emit("support_event", payload, room="admin_support")
        except Exception as e:  # noqa: BLE001
            log.warning("emit support_event failed: %s", e)

    # ---------------- persistence helpers ----------------
    async def add_message(session_id: str, sender: str, sender_name: str, text: str) -> dict:
        msg = {
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "sender": sender,
            "sender_name": sender_name,
            "text": text,
            "created_at": _now(),
        }
        await db.chat_messages.insert_one(dict(msg))
        await db.chat_sessions.update_one(
            {"id": session_id},
            {"$set": {"last_message": text[:120], "last_sender": sender, "updated_at": _now()}},
        )
        await emit_message(session_id, msg)
        return msg

    async def get_or_create_session(user: dict) -> dict:
        s = await db.chat_sessions.find_one(
            {"user_id": user["id"], "status": {"$ne": "closed"}}, {"_id": 0},
            sort=[("updated_at", -1)],
        )
        if s:
            return s
        s = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "user_name": user.get("name") or "User",
            "user_phone": user.get("phone"),
            "role": user.get("role"),
            "status": "bot",
            "admin_id": None,
            "admin_name": None,
            "subject": None,
            "last_message": None,
            "last_sender": None,
            "created_at": _now(),
            "updated_at": _now(),
        }
        await db.chat_sessions.insert_one(dict(s))
        greet = ("Namaste! Main Bisnoi Assistant hoon \U0001F44B  Aapki orders, delivery, "
                 "payment ya account se judi kisi bhi help ke liye poochho. Agar zaroorat ho to "
                 "main aapko ek support agent se bhi connect kar sakta hoon.")
        if user.get("role") == "restaurant_owner":
            greet = ("Hi! Main Bisnoi Partner Assistant hoon \U0001F44B  Orders, menu, payouts ya "
                     "outlet settings me help chahiye? Poochho — ya main aapko admin support se connect kar du.")
        elif user.get("role") == "rider":
            greet = ("Hi! Main Bisnoi Rider Assistant hoon \U0001F44B  Pickups, deliveries ya earnings "
                     "se judi help chahiye? Poochho — ya main admin support se connect kara du.")
        await add_message(s["id"], "bot", "Bisnoi Assistant", greet)
        return await db.chat_sessions.find_one({"id": s["id"]}, {"_id": 0})

    # ---------------- live context for the LLM ----------------
    async def gather_context(user: dict) -> str:
        role = user.get("role")
        lines = [f"USER: name={user.get('name')}, phone={user.get('phone')}, role={role}, id={user.get('id')}",
                 f"NOW(UTC): {_now()}"]
        builder = _CTX_BUILDERS.get(role)
        if builder:
            try:
                await builder(db, user, lines)
            except Exception as e:  # noqa: BLE001
                lines.append(f"(context error: {e})")
        return "\n".join(lines)

    def system_prompt(role: str, context: str, transcript: str) -> str:
        cap = {
            "customer": "order status & ETA, delivery tracking, payment status, cancellations, what's in an order, and general app help",
            "restaurant_owner": "incoming/active orders, order status, menu & catalog questions, payouts/earnings basics, and outlet settings help",
            "rider": "available pickups, your active deliveries, delivery status steps, and earnings basics",
        }.get(role, "general app help")
        return (
            "You are 'Bisnoi Assistant', the in-app AI support agent for Bisnoi, an Indian food-delivery app. "
            f"You are currently helping a {role}. Be warm, concise and helpful. Reply in the SAME language the user "
            "writes in (Hindi, English or Hinglish). Keep replies under ~120 words and use simple formatting.\n\n"
            f"You can help with: {cap}.\n\n"
            "RULES:\n"
            "- Use ONLY the LIVE CONTEXT below to answer questions about real orders/accounts. Never invent order IDs, "
            "amounts or statuses. If something isn't in the context, say you don't have that detail.\n"
            "- Refer to orders by their short id and restaurant name so the user recognises them.\n"
            "- If the user explicitly asks for a human/agent/admin, OR the issue needs manual action you cannot do "
            "(refunds, money disputes, account changes, a complaint, a bug, or anything outside the context), then briefly "
            "tell them you're connecting them to a support agent, and put the token " + ESCALATE_TOKEN + " on its OWN final line.\n"
            "- Do NOT escalate for simple questions you can already answer from the context.\n\n"
            "===== LIVE CONTEXT =====\n" + context + "\n===== END CONTEXT =====\n\n"
            "===== RECENT CONVERSATION =====\n" + (transcript or "(start of conversation)") + "\n===== END ====="
        )

    async def bot_reply(session: dict, user: dict, user_text: str):
        """Return (reply_text, escalate_bool)."""
        context = await gather_context(user)
        history = await db.chat_messages.find(
            {"session_id": session["id"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(12)
        history = list(reversed(history))
        transcript = "\n".join(
            f"{'User' if m['sender'] == 'user' else ('Assistant' if m['sender']=='bot' else m['sender'].title())}: {m['text']}"
            for m in history if m["sender"] in ("user", "bot", "admin")
        )
        sys = system_prompt(user.get("role"), context, transcript)

        wants_human = any(k in (user_text or "").lower() for k in HUMAN_KEYWORDS)

        reply = ""
        try:
            from gemini_client import gemini_text
            reply = await gemini_text(sys, user_text, model="gemini-2.5-flash")
        except Exception as e:  # noqa: BLE001
            log.warning("LLM error: %s", e)
            return ("Mujhe abhi jawab dene me dikkat aa rahi hai. Main aapko ek support agent se connect kar deta hoon.", True)

        escalate = ESCALATE_TOKEN in reply or wants_human
        reply = reply.replace(ESCALATE_TOKEN, "").strip()
        if not reply:
            reply = "Main aapko ek support agent se connect kar raha hoon."
        return (reply, escalate)

    async def notify_admins_escalation(session: dict):
        async for a in db.users.find({"role": "admin"}, {"_id": 0, "id": 1}):
            await create_notification(
                a["id"], "support_escalation", "Support chat needs an agent",
                f"{session.get('user_name')} ({session.get('role')}) needs help in live chat.",
                session_id=session["id"],
            )
        await emit_lobby({"type": "escalation", "session_id": session["id"],
                          "user_name": session.get("user_name"), "role": session.get("role")})

    async def do_escalate(session: dict):
        if session.get("status") in ("waiting_admin", "admin_joined"):
            return session
        await db.chat_sessions.update_one({"id": session["id"]}, {"$set": {"status": "waiting_admin", "updated_at": _now()}})
        await add_message(session["id"], "system", "System",
                          "Aapko ek live support agent se connect kiya ja raha hai. Please thodi der wait karein \u2014 agent jaldi join karega.")
        await emit_status(session["id"], {"session_id": session["id"], "status": "waiting_admin"})
        s2 = await db.chat_sessions.find_one({"id": session["id"]}, {"_id": 0})
        await notify_admins_escalation(s2)
        return s2

    # ---------------- user/role endpoints ----------------
    class SendBody(BaseModel):
        text: str
        session_id: Optional[str] = None

    @router.post("/chat/session")
    async def chat_session(user: dict = Depends(get_current_user)):
        s = await get_or_create_session(user)
        msgs = await db.chat_messages.find({"session_id": s["id"]}, {"_id": 0}).sort("created_at", 1).to_list(200)
        return {"session": s, "messages": msgs}

    @router.get("/chat/messages")
    async def chat_messages(session_id: str, user: dict = Depends(get_current_user)):
        s = await db.chat_sessions.find_one({"id": session_id}, {"_id": 0})
        if not s:
            raise HTTPException(404, "Session not found")
        if s["user_id"] != user["id"] and user.get("role") != "admin":
            raise HTTPException(403, "Forbidden")
        msgs = await db.chat_messages.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
        return {"session": s, "messages": msgs}

    @router.post("/chat/send")
    async def chat_send(body: SendBody, user: dict = Depends(get_current_user)):
        text = (body.text or "").strip()
        if not text:
            raise HTTPException(400, "Empty message")
        session = await db.chat_sessions.find_one({"id": body.session_id}, {"_id": 0}) if body.session_id else None
        if not session or session.get("user_id") != user["id"] or session.get("status") == "closed":
            session = await get_or_create_session(user)

        await add_message(session["id"], "user", user.get("name") or "User", text)

        if session.get("status") == "bot":
            reply, escalate = await bot_reply(session, user, text)
            await add_message(session["id"], "bot", "Bisnoi Assistant", reply)
            if escalate:
                await do_escalate(session)
        else:
            # Human is (or will be) handling — just ping admins/lobby.
            await emit_lobby({"type": "user_message", "session_id": session["id"],
                              "user_name": session.get("user_name")})
            if session.get("admin_id"):
                await create_notification(
                    session["admin_id"], "support_message", "New message in live chat",
                    f"{session.get('user_name')}: {text[:80]}", session_id=session["id"],
                )

        msgs = await db.chat_messages.find({"session_id": session["id"]}, {"_id": 0}).sort("created_at", 1).to_list(500)
        s2 = await db.chat_sessions.find_one({"id": session["id"]}, {"_id": 0})
        return {"session": s2, "messages": msgs}

    @router.post("/chat/escalate")
    async def chat_escalate(body: SendBody, user: dict = Depends(get_current_user)):
        session = await db.chat_sessions.find_one({"id": body.session_id}, {"_id": 0}) if body.session_id else None
        if not session or session.get("user_id") != user["id"]:
            session = await get_or_create_session(user)
        s2 = await do_escalate(session)
        msgs = await db.chat_messages.find({"session_id": session["id"]}, {"_id": 0}).sort("created_at", 1).to_list(500)
        return {"session": s2, "messages": msgs}

    # ---------------- admin endpoints ----------------
    @router.get("/admin/chat/sessions")
    async def admin_sessions(status: Optional[str] = None, user: dict = Depends(require_role("admin"))):
        q = {}
        if status:
            q["status"] = status
        sessions = await db.chat_sessions.find(q, {"_id": 0}).sort("updated_at", -1).to_list(300)
        order = {"waiting_admin": 0, "admin_joined": 1, "bot": 2, "closed": 3}
        # stable: newest-first within a status, with waiting sessions surfaced first
        sessions.sort(key=lambda s: s.get("updated_at") or "", reverse=True)
        sessions.sort(key=lambda s: order.get(s.get("status"), 9))
        waiting = await db.chat_sessions.count_documents({"status": "waiting_admin"})
        return {"sessions": sessions, "waiting": waiting}

    @router.get("/admin/chat/waiting-count")
    async def admin_waiting(user: dict = Depends(require_role("admin"))):
        return {"waiting": await db.chat_sessions.count_documents({"status": "waiting_admin"})}

    @router.get("/admin/chat/{sid}/messages")
    async def admin_chat_messages(sid: str, user: dict = Depends(require_role("admin"))):
        s = await db.chat_sessions.find_one({"id": sid}, {"_id": 0})
        if not s:
            raise HTTPException(404, "Session not found")
        msgs = await db.chat_messages.find({"session_id": sid}, {"_id": 0}).sort("created_at", 1).to_list(500)
        return {"session": s, "messages": msgs}

    @router.post("/admin/chat/{sid}/join")
    async def admin_join(sid: str, user: dict = Depends(require_role("admin"))):
        s = await db.chat_sessions.find_one({"id": sid}, {"_id": 0})
        if not s:
            raise HTTPException(404, "Session not found")
        await db.chat_sessions.update_one(
            {"id": sid}, {"$set": {"status": "admin_joined", "admin_id": user["id"],
                                   "admin_name": user.get("name") or "Support Agent", "updated_at": _now()}},
        )
        await add_message(sid, "system", "System", f"{user.get('name') or 'Support agent'} chat me join ho gaye hain. \U0001F468\u200D\U0001F4BB")
        await emit_status(sid, {"session_id": sid, "status": "admin_joined", "admin_name": user.get("name") or "Support Agent"})
        await create_notification(s["user_id"], "support_joined", "Support agent connected",
                                  "A support agent has joined your chat.", session_id=sid)
        s2 = await db.chat_sessions.find_one({"id": sid}, {"_id": 0})
        msgs = await db.chat_messages.find({"session_id": sid}, {"_id": 0}).sort("created_at", 1).to_list(500)
        return {"session": s2, "messages": msgs}

    class AdminSendBody(BaseModel):
        text: str

    @router.post("/admin/chat/{sid}/send")
    async def admin_send(sid: str, body: AdminSendBody, user: dict = Depends(require_role("admin"))):
        s = await db.chat_sessions.find_one({"id": sid}, {"_id": 0})
        if not s:
            raise HTTPException(404, "Session not found")
        text = (body.text or "").strip()
        if not text:
            raise HTTPException(400, "Empty message")
        if s.get("status") != "admin_joined":
            await db.chat_sessions.update_one({"id": sid}, {"$set": {"status": "admin_joined", "admin_id": user["id"],
                                              "admin_name": user.get("name") or "Support Agent", "updated_at": _now()}})
            await emit_status(sid, {"session_id": sid, "status": "admin_joined", "admin_name": user.get("name") or "Support Agent"})
        await add_message(sid, "admin", user.get("name") or "Support Agent", text)
        await create_notification(s["user_id"], "support_message", "New message from support",
                                  text[:80], session_id=sid)
        msgs = await db.chat_messages.find({"session_id": sid}, {"_id": 0}).sort("created_at", 1).to_list(500)
        return {"messages": msgs}

    @router.post("/admin/chat/{sid}/close")
    async def admin_close(sid: str, user: dict = Depends(require_role("admin"))):
        s = await db.chat_sessions.find_one({"id": sid}, {"_id": 0})
        if not s:
            raise HTTPException(404, "Session not found")
        await db.chat_sessions.update_one({"id": sid}, {"$set": {"status": "closed", "updated_at": _now()}})
        await add_message(sid, "system", "System", "Yeh chat band kar di gayi hai. Dhanyavaad! \U0001F64F")
        await emit_status(sid, {"session_id": sid, "status": "closed"})
        return {"ok": True}

    return router
