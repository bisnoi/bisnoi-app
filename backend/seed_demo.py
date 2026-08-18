"""One-off demo data seeder so the admin dashboard charts look alive.

Idempotent-ish: skips if there are already >= 60 orders (unless FORCE=1).

NOTE ON RANDOMNESS: this file intentionally uses the stdlib ``random`` module
(NOT ``secrets``). None of the values generated here are security-sensitive —
they're demo customer names, ratings, delivery ETAs, order timestamps, etc.
Static-analysis tools sometimes flag these as insecure; they are safe by
design because this script only runs against the demo database and never
produces authentication tokens, session ids, or handover codes.
"""
import asyncio, os, uuid, random  # noqa: S311  # random is fine for demo seed data
from datetime import datetime, timedelta, timezone
from motor.motor_asyncio import AsyncIOMotorClient

MONGO = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DBN = os.environ.get("DB_NAME", "test_database")
FORCE = os.environ.get("FORCE") == "1"

FIRST = ["Dana", "Eve", "Charlie", "Aarav", "Diya", "Kabir", "Mira", "Rohan", "Sara", "Ishan",
         "Maya", "Vivaan", "Anaya", "Arjun", "Kiara", "Reyansh", "Zara", "Advait", "Myra", "Vihaan"]
LAST = ["White", "Carter", "Brown", "Sharma", "Patel", "Khan", "Reddy", "Mehta", "Nair", "Gupta"]
COMMENTS = [
    "This was divine! Rich, savory and unforgettable. Highly recommended!",
    "Crispy, generous and perfectly balanced — one of the best I've had!",
    "Fresh ingredients and quick delivery. Will order again.",
    "Loved the flavours, packaging was neat and warm.",
    "Good value for money, tasty and filling.",
    "Absolutely delicious, my new favourite spot!",
]
STATUSES = ["delivered"] * 6 + ["placed", "accepted", "preparing", "ready", "picked", "cancelled"]


def month_back(now, k):
    y, m = now.year, now.month
    for _ in range(k):
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return y, m


async def main():
    client = AsyncIOMotorClient(MONGO)
    db = client[DBN]
    existing = await db.orders.count_documents({})
    if existing >= 60 and not FORCE:
        print(f"Skip: already {existing} orders (set FORCE=1 to reseed)")
        return

    rests = await db.restaurants.find({}, {"_id": 0}).to_list(100)
    items = await db.menu_items.find({"approval_status": {"$nin": ["pending", "rejected"]}}, {"_id": 0}).to_list(2000)
    if not rests or not items:
        print("No restaurants/menu items to seed against"); return
    items_by_rest = {}
    for it in items:
        items_by_rest.setdefault(it["restaurant_id"], []).append(it)
    rests = [r for r in rests if items_by_rest.get(r["id"])]
    now = datetime.now(timezone.utc)

    # --- demo customers ---
    customers = []
    for i in range(16):
        name = f"{random.choice(FIRST)} {random.choice(LAST)}"
        uid = str(uuid.uuid4())
        created = now - timedelta(days=random.randint(0, 220))
        customers.append({"id": uid, "name": name, "phone": f"90000{random.randint(10000,99999)}",
                          "role": "customer", "created_at": created.isoformat()})
    await db.users.insert_many([dict(c) for c in customers])

    def make_order(rest, when, status=None):
        pool = items_by_rest[rest["id"]]
        chosen = random.sample(pool, k=min(len(pool), random.randint(1, 3)))
        oitems, subtotal = [], 0
        for it in chosen:
            q = random.randint(1, 3)
            subtotal += it["price"] * q
            oitems.append({"menu_item_id": it["id"], "name": it["name"], "price": it["price"],
                           "image": it.get("image", ""), "quantity": q})
        cust = random.choice(customers)
        total = subtotal + random.choice([0, 29]) 
        return {
            "id": str(uuid.uuid4()), "customer_id": cust["id"], "customer_name": cust["name"],
            "customer_phone": cust["phone"], "restaurant_id": rest["id"], "restaurant_name": rest["name"],
            "items": oitems, "subtotal": subtotal, "delivery_fee": total - subtotal, "packing_charge": 0,
            "gst_percent": 0, "gst_amount": 0, "discount": 0, "total": total,
            "address": {"label": "Home", "line1": "MG Road", "city": "Bengaluru", "lat": 12.97, "lng": 77.59},
            "status": status or random.choice(STATUSES), "payment_method": random.choice(["cod", "payu", "razorpay"]),
            "payment_status": "paid", "placed_at": when.isoformat(), "simulated": True,
        }

    orders = []
    # spread across last 8 months (heavier recent)
    for k in range(8):
        y, m = month_back(now, k)
        count = random.randint(8, 16) + (8 - k)
        for _ in range(count):
            day = random.randint(1, 27)
            when = datetime(y, m, day, random.randint(9, 22), random.randint(0, 59), tzinfo=timezone.utc)
            if when > now:
                when = now - timedelta(hours=random.randint(1, 72))
            orders.append(make_order(random.choice(rests), when))
    # this week with a Thursday peak
    week_start = (now - timedelta(days=now.weekday())).replace(hour=8, minute=0, second=0, microsecond=0)
    per_day = [14, 18, 16, 34, 22, 28, 20]  # Mon..Sun (Thu peak)
    for wd, n in enumerate(per_day):
        day_dt = week_start + timedelta(days=wd)
        if day_dt > now:
            continue
        for _ in range(n):
            when = day_dt + timedelta(hours=random.randint(0, 12), minutes=random.randint(0, 59))
            if when > now:
                when = now - timedelta(minutes=random.randint(5, 600))
            orders.append(make_order(random.choice(rests), when))
    await db.orders.insert_many([dict(o) for o in orders])

    # --- POS bills (for Order Types split) ---
    pos = []
    for _ in range(40):
        rest = random.choice(rests)
        pool = items_by_rest[rest["id"]]
        chosen = random.sample(pool, k=min(len(pool), random.randint(1, 3)))
        pitems, subtotal = [], 0
        for it in chosen:
            q = random.randint(1, 4)
            subtotal += it["price"] * q
            pitems.append({"menu_item_id": it["id"], "name": it["name"], "price": it["price"], "qty": q, "amount": it["price"] * q})
        when = now - timedelta(days=random.randint(0, 30), hours=random.randint(0, 23))
        pos.append({
            "id": str(uuid.uuid4()), "bill_number": f"POS-{random.randint(1,9999):05d}",
            "restaurant_id": rest["id"], "restaurant_name": rest["name"], "owner_id": rest.get("owner_id"),
            "order_type": random.choice(["dine_in", "dine_in", "takeaway", "walk_in"]),
            "items": pitems, "item_count": sum(i["qty"] for i in pitems), "subtotal": subtotal,
            "discount_amount": 0, "tax_amount": 0, "total": subtotal,
            "payment_method": random.choice(["cash", "upi", "card"]),
            "customer_name": f"{random.choice(FIRST)} {random.choice(LAST)}", "created_at": when.isoformat(),
        })
    await db.pos_orders.insert_many([dict(p) for p in pos])

    # --- reviews ---
    reviews = []
    for _ in range(18):
        rest = random.choice(rests)
        cust = random.choice(customers)
        when = now - timedelta(days=random.randint(0, 40), hours=random.randint(0, 23))
        reviews.append({"id": str(uuid.uuid4()), "restaurant_id": rest["id"], "order_id": None,
                        "user_id": cust["id"], "user_name": cust["name"], "rating": random.choice([5, 5, 4, 4, 3, 5]),
                        "comment": random.choice(COMMENTS), "created_at": when.isoformat()})
    await db.reviews.insert_many([dict(r) for r in reviews])

    print(f"Seeded: {len(orders)} orders, {len(pos)} POS bills, {len(reviews)} reviews, {len(customers)} customers")


asyncio.run(main())
