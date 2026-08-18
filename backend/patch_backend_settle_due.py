path = "server.py"
with open(path) as f:
    c = f.read()

old = '''    payments = [p.dict() for p in (body.payments or [])]
    payment_method = body.payment_method
    if payments:
        payment_method = max(
            [{"method": p["method"], "amount": _round2(max(0, p.get("amount", 0)))} for p in payments] or [{"method": "cash", "amount": 0}],
            key=lambda p: p["amount"],
        )["method"]'''

new = '''    # body.payments is None when the caller didn't send a split/partial
    # breakdown at all (use the single payment_method for the full total).
    # An explicitly-sent list — even an empty one, meaning "nothing
    # collected, whole bill is due" — must still go through the settlement
    # branch below, so this is checked on the raw field, not on truthiness
    # of the (possibly empty) parsed list.
    has_payments_list = body.payments is not None
    payments = [p.dict() for p in (body.payments or [])]
    payment_method = body.payment_method
    if payments:
        payment_method = max(
            [{"method": p["method"], "amount": _round2(max(0, p.get("amount", 0)))} for p in payments] or [{"method": "cash", "amount": 0}],
            key=lambda p: p["amount"],
        )["method"]'''

assert old in c, "BACKEND ANCHOR 1 NOT FOUND"
c = c.replace(old, new, 1)

old2 = '''    # Partial / split payment: unpaid remainder auto-becomes a discount.
    if payments:'''
new2 = '''    # Partial / split payment: unpaid remainder auto-becomes a discount.
    if has_payments_list:'''
assert old2 in c, "BACKEND ANCHOR 2 NOT FOUND"
c = c.replace(old2, new2, 1)

with open(path, "w") as f:
    f.write(c)
print("BACKEND SETTLE PATCH APPLIED SUCCESSFULLY")
