"""
Backend API tests for PayU payment gateway integration + COD flow.
Tests authentication, order creation, payment initiation, and status endpoints.
"""
import requests
import sys
import json
from datetime import datetime

BASE_URL = "https://pay-gateway-hub-1.preview.emergentagent.com/api"

class PayUBackendTester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.customer_token = None
        self.customer_user = None
        self.restaurant_id = None
        self.menu_item_id = None
        self.cod_order_id = None
        self.payu_order_id = None

    def log(self, msg, level="INFO"):
        print(f"[{level}] {msg}")

    def run_test(self, name, fn):
        """Run a single test function"""
        self.tests_run += 1
        self.log(f"\n{'='*60}")
        self.log(f"Test {self.tests_run}: {name}")
        self.log('='*60)
        try:
            fn()
            self.tests_passed += 1
            self.log(f"✅ PASSED: {name}", "PASS")
            return True
        except AssertionError as e:
            self.log(f"❌ FAILED: {name} - {str(e)}", "FAIL")
            return False
        except Exception as e:
            self.log(f"❌ ERROR: {name} - {str(e)}", "ERROR")
            return False

    def test_login_customer(self):
        """Login as customer (5550001111) using demo OTP"""
        self.log("Sending OTP to customer phone 5550001111...")
        res = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": "5550001111"})
        assert res.status_code == 200, f"Send OTP failed: {res.status_code} {res.text}"
        data = res.json()
        demo_otp = data.get("demo_otp")
        assert demo_otp, "No demo_otp in response"
        self.log(f"Demo OTP received: {demo_otp}")

        self.log("Verifying OTP...")
        res = requests.post(f"{BASE_URL}/auth/verify-otp", json={
            "phone": "5550001111",
            "code": demo_otp,
            "name": "Test Customer"
        })
        assert res.status_code == 200, f"Verify OTP failed: {res.status_code} {res.text}"
        data = res.json()
        assert "token" in data, "No token in response"
        assert "user" in data, "No user in response"
        assert data["user"]["role"] == "customer", f"Expected customer role, got {data['user']['role']}"
        
        self.customer_token = data["token"]
        self.customer_user = data["user"]
        self.log(f"✓ Logged in as customer: {self.customer_user['name']} (ID: {self.customer_user['id']})")

    def test_get_restaurant_and_menu(self):
        """Get a restaurant and menu item for order creation"""
        self.log("Fetching restaurants...")
        res = requests.get(f"{BASE_URL}/restaurants")
        assert res.status_code == 200, f"Get restaurants failed: {res.status_code}"
        restaurants = res.json()
        assert len(restaurants) > 0, "No restaurants found"
        
        # Pick first active restaurant
        rest = next((r for r in restaurants if r.get("status") == "active"), restaurants[0])
        self.restaurant_id = rest["id"]
        self.log(f"✓ Selected restaurant: {rest['name']} (ID: {self.restaurant_id})")

        # Get menu
        self.log(f"Fetching menu for restaurant {self.restaurant_id}...")
        res = requests.get(f"{BASE_URL}/restaurants/{self.restaurant_id}")
        assert res.status_code == 200, f"Get restaurant failed: {res.status_code}"
        data = res.json()
        menu = data.get("menu", [])
        assert len(menu) > 0, "No menu items found"
        
        # Pick first available item
        item = next((m for m in menu if m.get("is_available", True)), menu[0])
        self.menu_item_id = item["id"]
        self.log(f"✓ Selected menu item: {item['name']} (ID: {self.menu_item_id}, Price: ₹{item['price']})")

    def test_create_cod_order(self):
        """Create a COD order and verify payment_status is pending"""
        self.log("Creating COD order...")
        headers = {"Authorization": f"Bearer {self.customer_token}"}
        payload = {
            "restaurant_id": self.restaurant_id,
            "items": [{"menu_item_id": self.menu_item_id, "quantity": 2}],
            "address": {
                "label": "Home",
                "line1": "Test Address 123",
                "city": "Bengaluru",
                "lat": 0,
                "lng": 0
            },
            "payment_method": "cod"
        }
        res = requests.post(f"{BASE_URL}/orders", json=payload, headers=headers)
        assert res.status_code == 200, f"Create COD order failed: {res.status_code} {res.text}"
        order = res.json()
        
        assert order["payment_method"] == "cod", f"Expected cod, got {order['payment_method']}"
        assert order["payment_status"] == "pending", f"Expected pending, got {order['payment_status']}"
        assert order["status"] == "placed", f"Expected placed, got {order['status']}"
        
        self.cod_order_id = order["id"]
        self.log(f"✓ COD order created: {self.cod_order_id}")
        self.log(f"  Payment method: {order['payment_method']}")
        self.log(f"  Payment status: {order['payment_status']}")
        self.log(f"  Total: ₹{order['total']}")

    def test_get_cod_order(self):
        """Retrieve COD order and verify details"""
        self.log(f"Fetching COD order {self.cod_order_id}...")
        headers = {"Authorization": f"Bearer {self.customer_token}"}
        res = requests.get(f"{BASE_URL}/orders/{self.cod_order_id}", headers=headers)
        assert res.status_code == 200, f"Get order failed: {res.status_code}"
        order = res.json()
        
        assert order["id"] == self.cod_order_id, "Order ID mismatch"
        assert order["payment_method"] == "cod", "Payment method should be cod"
        assert order["payment_status"] == "pending", "Payment status should be pending"
        self.log(f"✓ COD order retrieved successfully")

    def test_create_payu_order(self):
        """Create a PayU order (payment_method='payu')"""
        self.log("Creating PayU order...")
        headers = {"Authorization": f"Bearer {self.customer_token}"}
        payload = {
            "restaurant_id": self.restaurant_id,
            "items": [{"menu_item_id": self.menu_item_id, "quantity": 1}],
            "address": {
                "label": "Work",
                "line1": "Test PayU Address 456",
                "city": "Bengaluru",
                "lat": 0,
                "lng": 0
            },
            "payment_method": "payu"
        }
        res = requests.post(f"{BASE_URL}/orders", json=payload, headers=headers)
        assert res.status_code == 200, f"Create PayU order failed: {res.status_code} {res.text}"
        order = res.json()
        
        assert order["payment_method"] == "payu", f"Expected payu, got {order['payment_method']}"
        assert order["payment_status"] == "pending", f"Expected pending, got {order['payment_status']}"
        
        self.payu_order_id = order["id"]
        self.log(f"✓ PayU order created: {self.payu_order_id}")
        self.log(f"  Payment method: {order['payment_method']}")
        self.log(f"  Payment status: {order['payment_status']}")
        self.log(f"  Total: ₹{order['total']}")

    def test_payu_initiate_success(self):
        """Test POST /api/payu/initiate with valid customer token and order"""
        self.log(f"Initiating PayU payment for order {self.payu_order_id}...")
        headers = {"Authorization": f"Bearer {self.customer_token}"}
        payload = {"order_id": self.payu_order_id}
        res = requests.post(f"{BASE_URL}/payu/initiate", json=payload, headers=headers)
        assert res.status_code == 200, f"PayU initiate failed: {res.status_code} {res.text}"
        data = res.json()
        
        # Verify response structure
        assert "action" in data, "Missing 'action' field"
        assert "fields" in data, "Missing 'fields' field"
        
        action = data["action"]
        fields = data["fields"]
        
        # Verify action URL points to test.payu.in
        assert "test.payu.in" in action, f"Expected test.payu.in in action URL, got {action}"
        self.log(f"✓ Action URL: {action}")
        
        # Verify required fields
        required_fields = ["key", "txnid", "amount", "hash", "udf1", "enforce_paymethod", "surl", "furl"]
        for field in required_fields:
            assert field in fields, f"Missing required field: {field}"
        
        # Verify specific field values
        assert fields["udf1"] == self.payu_order_id, f"udf1 should be order_id, got {fields['udf1']}"
        assert fields["enforce_paymethod"] == "upi", f"Expected enforce_paymethod='upi', got {fields['enforce_paymethod']}"
        
        # Verify hash is SHA-512 (128 hex chars)
        hash_val = fields["hash"]
        assert len(hash_val) == 128, f"Hash should be 128 chars (SHA-512), got {len(hash_val)}"
        assert all(c in "0123456789abcdef" for c in hash_val.lower()), "Hash should be hex"
        
        # CRITICAL: Verify salt is NOT leaked
        assert "salt" not in fields, "SECURITY ISSUE: 'salt' field leaked in response!"
        assert "SALT" not in fields, "SECURITY ISSUE: 'SALT' field leaked in response!"
        
        self.log(f"✓ PayU initiate response valid:")
        self.log(f"  key: {fields['key']}")
        self.log(f"  txnid: {fields['txnid']}")
        self.log(f"  amount: {fields['amount']}")
        self.log(f"  hash: {hash_val[:20]}... (128 chars)")
        self.log(f"  udf1 (order_id): {fields['udf1']}")
        self.log(f"  enforce_paymethod: {fields['enforce_paymethod']}")
        self.log(f"  ✓ NO 'salt' field leaked")

    def test_payu_initiate_unauthorized(self):
        """Test POST /api/payu/initiate without auth token (should return 401)"""
        self.log("Testing PayU initiate without auth token...")
        payload = {"order_id": self.payu_order_id}
        res = requests.post(f"{BASE_URL}/payu/initiate", json=payload)
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"
        self.log(f"✓ Correctly rejected unauthenticated request with 401")

    def test_payu_initiate_forbidden(self):
        """Test POST /api/payu/initiate with another user's order (should return 403)"""
        self.log("Creating another customer to test forbidden access...")
        
        # Create another customer
        res = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": "9999999999"})
        assert res.status_code == 200, "Send OTP failed for second customer"
        demo_otp = res.json().get("demo_otp")
        
        res = requests.post(f"{BASE_URL}/auth/verify-otp", json={
            "phone": "9999999999",
            "code": demo_otp,
            "name": "Another Customer"
        })
        assert res.status_code == 200, "Verify OTP failed for second customer"
        other_token = res.json()["token"]
        
        # Try to initiate payment for first customer's order
        self.log(f"Attempting to initiate payment for order {self.payu_order_id} with different customer token...")
        headers = {"Authorization": f"Bearer {other_token}"}
        payload = {"order_id": self.payu_order_id}
        res = requests.post(f"{BASE_URL}/payu/initiate", json=payload, headers=headers)
        assert res.status_code == 403, f"Expected 403, got {res.status_code}"
        self.log(f"✓ Correctly rejected other user's order with 403")

    def test_payu_status(self):
        """Test GET /api/payu/status/{order_id}"""
        self.log(f"Fetching PayU status for order {self.payu_order_id}...")
        headers = {"Authorization": f"Bearer {self.customer_token}"}
        res = requests.get(f"{BASE_URL}/payu/status/{self.payu_order_id}", headers=headers)
        assert res.status_code == 200, f"PayU status failed: {res.status_code}"
        data = res.json()
        
        assert "order_id" in data, "Missing order_id"
        assert "payment_status" in data, "Missing payment_status"
        assert "txnid" in data, "Missing txnid"
        
        assert data["order_id"] == self.payu_order_id, "Order ID mismatch"
        assert data["payment_status"] == "pending", f"Expected pending, got {data['payment_status']}"
        
        self.log(f"✓ PayU status retrieved:")
        self.log(f"  order_id: {data['order_id']}")
        self.log(f"  payment_status: {data['payment_status']}")
        self.log(f"  txnid: {data.get('txnid', 'None')}")

    def run_all_tests(self):
        """Run all backend tests"""
        self.log("\n" + "="*60)
        self.log("STARTING PAYU BACKEND API TESTS")
        self.log("="*60)
        
        # Authentication & Setup
        self.run_test("Login as customer (5550001111)", self.test_login_customer)
        self.run_test("Get restaurant and menu item", self.test_get_restaurant_and_menu)
        
        # COD Flow
        self.run_test("Create COD order", self.test_create_cod_order)
        self.run_test("Retrieve COD order", self.test_get_cod_order)
        
        # PayU Flow
        self.run_test("Create PayU order", self.test_create_payu_order)
        self.run_test("PayU initiate - success case", self.test_payu_initiate_success)
        self.run_test("PayU initiate - unauthorized (401)", self.test_payu_initiate_unauthorized)
        self.run_test("PayU initiate - forbidden (403)", self.test_payu_initiate_forbidden)
        self.run_test("PayU status endpoint", self.test_payu_status)
        
        # Summary
        self.log("\n" + "="*60)
        self.log("TEST SUMMARY")
        self.log("="*60)
        self.log(f"Total tests: {self.tests_run}")
        self.log(f"Passed: {self.tests_passed}")
        self.log(f"Failed: {self.tests_run - self.tests_passed}")
        self.log(f"Success rate: {(self.tests_passed / self.tests_run * 100):.1f}%")
        
        return 0 if self.tests_passed == self.tests_run else 1

def main():
    tester = PayUBackendTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())
