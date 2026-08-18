"""Tests for the new admin dashboard endpoint /api/admin/dashboard."""
import pytest
import os
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://iska-preview-ready.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# --- Auth/role enforcement ---
class TestAdminDashboardAuth:
    def test_unauthenticated_blocked(self):
        r = requests.get(f"{API}/admin/dashboard", timeout=20)
        assert r.status_code in (401, 403), f"unauth expected 401/403, got {r.status_code}"

    def test_customer_forbidden(self, customer):
        r = customer["session"].get(f"{API}/admin/dashboard", timeout=20)
        assert r.status_code == 403, f"customer expected 403, got {r.status_code} {r.text[:200]}"

    def test_owner_forbidden(self, owner):
        r = owner["session"].get(f"{API}/admin/dashboard", timeout=20)
        assert r.status_code == 403

    def test_rider_forbidden(self, rider):
        r = rider["session"].get(f"{API}/admin/dashboard", timeout=20)
        assert r.status_code == 403


# --- Payload shape ---
class TestAdminDashboardPayload:
    @pytest.fixture(scope="class")
    def payload(self, admin):
        r = admin["session"].get(f"{API}/admin/dashboard", timeout=30)
        assert r.status_code == 200, f"admin dash expected 200, got {r.status_code} {r.text[:300]}"
        return r.json()

    def test_top_level_keys(self, payload):
        for key in [
            "stats", "revenue", "top_categories", "orders_overview",
            "order_types", "recent_orders", "trending_menus",
            "recent_activity", "reviews",
        ]:
            assert key in payload, f"missing top-level key: {key}"

    def test_stats_shape(self, payload):
        stats = payload["stats"]
        for k in ("total_orders", "total_customers", "total_revenue"):
            assert k in stats, f"stats missing {k}"
            assert "value" in stats[k], f"stats.{k}.value missing"
            assert "delta" in stats[k], f"stats.{k}.delta missing"

    def test_stats_values_nonzero(self, payload):
        # demo seeded ~177 orders, 16 customers — values should be positive
        s = payload["stats"]
        assert s["total_orders"]["value"] > 0, f"total_orders=0: {s}"
        assert s["total_customers"]["value"] > 0, f"total_customers=0: {s}"
        assert s["total_revenue"]["value"] > 0, f"total_revenue=0: {s}"

    def test_revenue_shape(self, payload):
        rev = payload["revenue"]
        for k in ("labels", "income", "expense", "peak"):
            assert k in rev, f"revenue missing {k}"
        assert len(rev["labels"]) == 8, f"revenue.labels len={len(rev['labels'])}"
        assert len(rev["income"]) == 8
        assert len(rev["expense"]) == 8

    def test_orders_overview_shape(self, payload):
        ov = payload["orders_overview"]
        assert len(ov["labels"]) == 7
        assert len(ov["values"]) == 7
        assert "peak_index" in ov
        assert 0 <= ov["peak_index"] < 7

    def test_order_types_three(self, payload):
        assert isinstance(payload["order_types"], list)
        assert len(payload["order_types"]) == 3

    def test_collections_are_lists(self, payload):
        for k in ("top_categories", "recent_orders", "trending_menus", "recent_activity", "reviews"):
            assert isinstance(payload[k], list), f"{k} should be a list"

    def test_no_mongo_id_leak(self, payload):
        # ensure raw mongo _id never leaks
        import json
        blob = json.dumps(payload)
        assert '"_id"' not in blob, "mongo _id leaked in dashboard payload"
