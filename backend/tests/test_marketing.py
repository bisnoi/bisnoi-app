"""Backend tests for the Marketing + Wallet module (#1, #2)."""
import sys
import requests

BASE = "https://preview-edit-zip.preview.emergentagent.com/api"
OWNER_PHONE = "8888888888"   # Demo Owner -> Truffles
ADMIN_PHONE = "9999999999"


def login(phone):
    code = requests.post(f"{BASE}/auth/send-otp", json={"phone": phone}, timeout=30).json()["demo_otp"]
    d = requests.post(f"{BASE}/auth/verify-otp", json={"phone": phone, "code": code}, timeout=30).json()
    return d["token"], d["user"]


def h(t):
    return {"Authorization": f"Bearer {t}"}


def main():
    r = []
    owner_tok, owner = login(OWNER_PHONE)
    admin_tok, admin = login(ADMIN_PHONE)
    r.append(("owner login role=restaurant_owner", owner.get("role") == "restaurant_owner"))
    r.append(("admin login role=admin", admin.get("role") == "admin"))

    # --- Admin sets marketing settings (rate + template) ---
    st = requests.put(f"{BASE}/admin/marketing/settings", headers=h(admin_tok),
                      json={"per_message_rate": 0.85, "currency": "INR",
                            "marketing_template": "promo_test", "marketing_template_lang": "en"},
                      timeout=30).json()
    r.append(("admin set rate=0.85", abs(float(st.get("per_message_rate", 0)) - 0.85) < 0.001))
    r.append(("admin set template", st.get("marketing_template") == "promo_test"))

    # --- Owner overview (resolves own restaurant = Truffles) ---
    ov = requests.get(f"{BASE}/marketing/overview", headers=h(owner_tok), timeout=30).json()
    rid = ov["restaurant"]["id"]
    r.append(("owner overview restaurant name", ov["restaurant"]["name"] == "Truffles"))
    r.append(("owner overview rate visible", abs(float(ov.get("rate", 0)) - 0.85) < 0.001))
    start_balance = float(ov["wallet"]["balance"])

    # --- Admin credits owner wallet by 100 ---
    cr = requests.post(f"{BASE}/admin/marketing/wallets/{rid}/credit", headers=h(admin_tok),
                       json={"amount": 100, "note": "test topup"}, timeout=30).json()
    r.append(("admin credit +100", abs(float(cr.get("balance", 0)) - (start_balance + 100)) < 0.001))

    # --- Owner wallet reflects credit + ledger entry ---
    w = requests.get(f"{BASE}/marketing/wallet", headers=h(owner_tok), timeout=30).json()
    r.append(("owner wallet balance == start+100", abs(float(w["balance"]) - (start_balance + 100)) < 0.001))
    r.append(("owner wallet has credit txn", any(t["kind"] == "credit" for t in w.get("transactions", []))))

    # --- Owner customers list (dine-in + delivery) ---
    cust = requests.get(f"{BASE}/marketing/customers?segment=all", headers=h(owner_tok), timeout=30).json()
    r.append(("owner customers endpoint ok", "customers" in cust and isinstance(cust["customers"], list)))

    # --- Owner sends a campaign to explicit phones ---
    # WhatsApp creds are NOT configured -> expect fallback (channel="link"), 0 sent, 0 cost, balance unchanged.
    camp = requests.post(f"{BASE}/marketing/campaigns", headers=h(owner_tok),
                         json={"restaurant_id": rid, "message": "Flat 20% off this weekend at Truffles!",
                               "phones": ["9111111111", "9222222222"]}, timeout=45).json()
    r.append(("campaign recipients=2", camp.get("recipients") == 2))
    r.append(("campaign fallback sent=0 (unconfigured)", camp.get("sent") == 0))
    r.append(("campaign cost=0 when unconfigured", float(camp.get("cost", -1)) == 0))
    r.append(("campaign results have wa_link fallback", all(x.get("wa_link") for x in camp.get("results", []))))

    # Balance unchanged after unconfigured campaign
    w2 = requests.get(f"{BASE}/marketing/wallet", headers=h(owner_tok), timeout=30).json()
    r.append(("balance unchanged after fallback campaign", abs(float(w2["balance"]) - float(w["balance"])) < 0.001))

    # --- Campaign history ---
    hist = requests.get(f"{BASE}/marketing/campaigns", headers=h(owner_tok), timeout=30).json()
    r.append(("campaign history has >=1", len(hist.get("campaigns", [])) >= 1))

    # --- Wallet DEBIT path via admin negative adjust ---
    adj = requests.post(f"{BASE}/admin/marketing/wallets/{rid}/credit", headers=h(admin_tok),
                        json={"amount": -10, "note": "test debit"}, timeout=30).json()
    r.append(("admin debit -10 works", abs(float(adj.get("balance", 0)) - (float(w2["balance"]) - 10)) < 0.001))

    # --- Insufficient balance guard (huge debit) ---
    big = requests.post(f"{BASE}/admin/marketing/wallets/{rid}/credit", headers=h(admin_tok),
                        json={"amount": -9999999, "note": "overdraw"}, timeout=30)
    r.append(("overdraw rejected (400)", big.status_code == 400))

    # --- Admin wallets + usage ---
    wl = requests.get(f"{BASE}/admin/marketing/wallets", headers=h(admin_tok), timeout=30).json()
    r.append(("admin wallets includes this restaurant", any(x["restaurant_id"] == rid for x in wl.get("wallets", []))))
    usage = requests.get(f"{BASE}/admin/marketing/usage", headers=h(admin_tok), timeout=30).json()
    r.append(("admin usage endpoint ok", "total_campaigns" in usage))

    # --- Razorpay wallet top-up create-order (LIVE create only; no capture) ---
    topup = requests.post(f"{BASE}/payments/create-order", headers=h(owner_tok),
                          json={"purpose": "wallet_topup", "restaurant_id": rid, "amount": 50}, timeout=30)
    if topup.status_code == 200:
        tj = topup.json()
        r.append(("wallet_topup create-order returns rzp order", bool(tj.get("razorpay_order_id"))))
        r.append(("wallet_topup amount=5000 paise", tj.get("amount") == 5000))
    elif topup.status_code == 503:
        r.append(("wallet_topup create-order (gateway disabled -> 503 acceptable)", True))
    else:
        r.append((f"wallet_topup create-order unexpected {topup.status_code}: {topup.text[:120]}", False))

    # --- Owner cannot access admin marketing ---
    forbidden = requests.get(f"{BASE}/admin/marketing/usage", headers=h(owner_tok), timeout=30)
    r.append(("owner blocked from admin usage (401/403)", forbidden.status_code in (401, 403)))

    print("\n===== MARKETING/WALLET TEST RESULTS =====")
    ok = True
    for name, passed in r:
        print(f"[{'PASS' if passed else 'FAIL'}] {name}")
        ok = ok and passed
    print("=========================================")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
