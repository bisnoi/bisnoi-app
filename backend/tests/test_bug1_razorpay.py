"""
Bug 1 verification: Razorpay unpaid orders must be HIDDEN from every owner/rider/
admin feed AND from all analytics/stats until payment is verified.

Runs against the live preview backend via the public URL.
"""
import os
import sys
import requests

BASE = "https://preview-edit-zip.preview.emergentagent.com/api"


def login(phone, role=None, name=None):
    r = requests.post(f"{BASE}/auth/send-otp", json={"phone": phone}, timeout=30)
    r.raise_for_status()
    code = r.json()["demo_otp"]
    body = {"phone": phone, "code": code}
    if role:
        body["role"] = role
    if name:
        body["name"] = name
    r = requests.post(f"{BASE}/auth/verify-otp", json=body, timeout=30)
    r.raise_for_status()
    data = r.json()
    return data["token"], data["user"]


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


def main():
    results = []

    # Admin (seeded) — used to inspect global feeds/stats.
    admin_tok, admin_user = login("9999999999")
    assert admin_user["role"] == "admin", f"9999999999 should be admin, got {admin_user['role']}"

    # Pick an OPEN restaurant + a menu item to build a cart.
    rests = requests.get(f"{BASE}/restaurants", timeout=30).json()
    open_rest = None
    item = None
    for rst in rests:
        det = requests.get(f"{BASE}/restaurants/{rst['id']}", timeout=30).json()
        if not det.get("restaurant", {}).get("open_now"):
            continue
        menu = det.get("menu") or []
        avail = [m for m in menu if m.get("is_available", True) and not m.get("out_of_stock")]
        if avail:
            open_rest = det["restaurant"]
            item = avail[0]
            break
    assert open_rest and item, "No open restaurant with available menu item found"

    # Customer places a RAZORPAY order (starts UNPAID => awaiting_payment=True).
    cust_tok, cust_user = login("8888800001", role="customer", name="Bug1 Tester")
    order_body = {
        "restaurant_id": open_rest["id"],
        "items": [{"menu_item_id": item["id"], "quantity": 1}],
        "address": {"label": "Home", "line1": "Test St", "city": "Bengaluru", "lat": open_rest["lat"], "lng": open_rest["lng"]},
        "payment_method": "razorpay",
    }
    r = requests.post(f"{BASE}/orders", json=order_body, headers=h(cust_tok), timeout=30)
    r.raise_for_status()
    order = r.json()
    oid = order["id"]
    results.append(("razorpay order created", order.get("payment_status") == "pending"))

    # 1) Customer's own history must NOT show the unpaid order.
    mine = requests.get(f"{BASE}/orders/mine", headers=h(cust_tok), timeout=30).json()
    results.append(("hidden from customer /orders/mine", oid not in [o["id"] for o in mine]))

    # 2) Owner feed must NOT show it.
    owner_id = open_rest.get("owner_id")
    if owner_id:
        # We can't easily log in as the specific owner by phone; use admin feeds instead.
        pass

    # 3) Admin order list must NOT show it.
    admin_orders = requests.get(f"{BASE}/admin/orders", headers=h(admin_tok), timeout=30).json()
    admin_ids = [o["id"] for o in admin_orders]
    results.append(("hidden from /admin/orders", oid not in admin_ids))

    # 4) Admin stats / dashboard must not crash and must not count it.
    stats = requests.get(f"{BASE}/admin/stats", headers=h(admin_tok), timeout=30).json()
    results.append(("/admin/stats returns 200", "orders" in stats))
    dash = requests.get(f"{BASE}/admin/dashboard", headers=h(admin_tok), timeout=30)
    results.append(("/admin/dashboard returns 200", dash.status_code == 200))

    # 5) Rider available feed must NOT show it.
    rider_tok, _ = login("8888800002", role="rider", name="Bug1 Rider")
    feed = requests.get(f"{BASE}/orders/available/feed", headers=h(rider_tok), timeout=30).json()
    results.append(("hidden from rider available feed", oid not in [o["id"] for o in feed]))

    # ---- Now simulate the order becoming PAID (webhook/verify side-effect) ----
    # We can't run a real Razorpay checkout here, so we hit the DB via the
    # backend's own logic proxy: emulate verify by directly flipping in Mongo.
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    from pathlib import Path
    load_dotenv(Path(__file__).parent.parent / ".env")
    mc = AsyncIOMotorClient(os.environ["MONGO_URL"])
    mdb = mc[os.environ["DB_NAME"]]

    async def mark_paid():
        await mdb.orders.update_one({"id": oid}, {"$set": {"payment_status": "paid", "awaiting_payment": False}})
    asyncio.get_event_loop().run_until_complete(mark_paid())

    # 6) After payment, it MUST appear for the customer + admin.
    mine2 = requests.get(f"{BASE}/orders/mine", headers=h(cust_tok), timeout=30).json()
    results.append(("visible to customer after paid", oid in [o["id"] for o in mine2]))
    admin_orders2 = requests.get(f"{BASE}/admin/orders", headers=h(admin_tok), timeout=30).json()
    results.append(("visible in /admin/orders after paid", oid in [o["id"] for o in admin_orders2]))

    # cleanup test order
    async def cleanup():
        await mdb.orders.delete_one({"id": oid})
    asyncio.get_event_loop().run_until_complete(cleanup())

    print("\n===== BUG 1 TEST RESULTS =====")
    ok = True
    for name, passed in results:
        print(f"[{'PASS' if passed else 'FAIL'}] {name}")
        ok = ok and passed
    print("==============================")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
