"""
Migration smoke test for Bisnoi food delivery app.
Tests backend APIs after re-import to new preview URL.
"""
import requests
import sys
import json
from datetime import datetime

BASE_URL = "https://isko-main.preview.emergentagent.com/api"

class MigrationTester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.customer_token = None
        self.owner_token = None
        self.admin_token = None
        self.restaurant_id = None
        self.menu_item_id = None

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

    def test_get_restaurants(self):
        """GET /api/restaurants should return 8 seeded restaurants"""
        self.log("Fetching restaurants...")
        res = requests.get(f"{BASE_URL}/restaurants")
        assert res.status_code == 200, f"Get restaurants failed: {res.status_code} {res.text}"
        restaurants = res.json()
        assert isinstance(restaurants, list), "Expected list of restaurants"
        self.log(f"Found {len(restaurants)} restaurants")
        assert len(restaurants) == 8, f"Expected 8 restaurants, got {len(restaurants)}"
        
        # Store first restaurant for later tests
        if restaurants:
            self.restaurant_id = restaurants[0]["id"]
            self.log(f"✓ 8 restaurants found. First: {restaurants[0]['name']} (ID: {self.restaurant_id})")

    def test_customer_login(self):
        """Customer login with demo OTP (5550001111)"""
        phone = "5550001111"
        self.log(f"Sending OTP to customer phone {phone}...")
        res = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
        assert res.status_code == 200, f"Send OTP failed: {res.status_code} {res.text}"
        data = res.json()
        demo_otp = data.get("demo_otp")
        assert demo_otp, "No demo_otp in response"
        self.log(f"Demo OTP received: {demo_otp}")

        self.log("Verifying OTP...")
        res = requests.post(f"{BASE_URL}/auth/verify-otp", json={
            "phone": phone,
            "code": demo_otp,
            "name": "Test Customer"
        })
        assert res.status_code == 200, f"Verify OTP failed: {res.status_code} {res.text}"
        data = res.json()
        assert "token" in data, "No token in response"
        assert "user" in data, "No user in response"
        assert data["user"]["role"] == "customer", f"Expected customer role, got {data['user']['role']}"
        
        self.customer_token = data["token"]
        self.log(f"✓ Customer logged in: {data['user']['name']} (role: {data['user']['role']})")

    def test_customer_me(self):
        """GET /api/auth/me with customer JWT"""
        self.log("Testing GET /api/auth/me with customer token...")
        headers = {"Authorization": f"Bearer {self.customer_token}"}
        res = requests.get(f"{BASE_URL}/auth/me", headers=headers)
        assert res.status_code == 200, f"GET /me failed: {res.status_code} {res.text}"
        user = res.json()
        assert user["role"] == "customer", f"Expected customer, got {user['role']}"
        self.log(f"✓ Customer profile retrieved: {user['name']}")

    def test_owner_login(self):
        """Owner login with demo OTP (8888888888)"""
        phone = "8888888888"
        self.log(f"Sending OTP to owner phone {phone}...")
        res = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
        assert res.status_code == 200, f"Send OTP failed: {res.status_code} {res.text}"
        data = res.json()
        demo_otp = data.get("demo_otp")
        assert demo_otp, "No demo_otp in response"
        self.log(f"Demo OTP received: {demo_otp}")

        self.log("Verifying OTP...")
        res = requests.post(f"{BASE_URL}/auth/verify-otp", json={
            "phone": phone,
            "code": demo_otp
        })
        assert res.status_code == 200, f"Verify OTP failed: {res.status_code} {res.text}"
        data = res.json()
        assert "token" in data, "No token in response"
        assert data["user"]["role"] == "restaurant_owner", f"Expected restaurant_owner, got {data['user']['role']}"
        
        self.owner_token = data["token"]
        self.log(f"✓ Owner logged in: {data['user']['name']} (role: {data['user']['role']})")

    def test_owner_dinein_orders(self):
        """GET /api/owner/dinein/orders with owner JWT"""
        self.log("Testing GET /api/owner/dinein/orders...")
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        res = requests.get(f"{BASE_URL}/owner/dinein/orders", headers=headers)
        assert res.status_code == 200, f"GET /owner/dinein/orders failed: {res.status_code} {res.text}"
        orders = res.json()
        assert isinstance(orders, list), "Expected list of orders"
        self.log(f"✓ Owner dine-in orders retrieved: {len(orders)} orders")

    def test_admin_login(self):
        """Admin login with demo OTP (9999999999)"""
        phone = "9999999999"
        self.log(f"Sending OTP to admin phone {phone}...")
        res = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
        assert res.status_code == 200, f"Send OTP failed: {res.status_code} {res.text}"
        data = res.json()
        demo_otp = data.get("demo_otp")
        assert demo_otp, "No demo_otp in response"
        self.log(f"Demo OTP received: {demo_otp}")

        self.log("Verifying OTP...")
        res = requests.post(f"{BASE_URL}/auth/verify-otp", json={
            "phone": phone,
            "code": demo_otp
        })
        assert res.status_code == 200, f"Verify OTP failed: {res.status_code} {res.text}"
        data = res.json()
        assert "token" in data, "No token in response"
        assert data["user"]["role"] == "admin", f"Expected admin, got {data['user']['role']}"
        
        self.admin_token = data["token"]
        self.log(f"✓ Admin logged in: {data['user']['name']} (role: {data['user']['role']})")

    def test_restaurant_menu(self):
        """GET /api/restaurants/{id}/menu"""
        if not self.restaurant_id:
            self.log("Skipping menu test - no restaurant_id", "WARN")
            return
        
        self.log(f"Fetching menu for restaurant {self.restaurant_id}...")
        res = requests.get(f"{BASE_URL}/restaurants/{self.restaurant_id}")
        assert res.status_code == 200, f"Get restaurant failed: {res.status_code} {res.text}"
        data = res.json()
        assert "menu" in data, "No menu in response"
        menu = data["menu"]
        assert isinstance(menu, list), "Menu should be a list"
        assert len(menu) > 0, "Menu should have items"
        
        self.menu_item_id = menu[0]["id"]
        self.log(f"✓ Restaurant menu retrieved: {len(menu)} items. First: {menu[0]['name']}")

    def test_categories(self):
        """GET /api/categories"""
        self.log("Fetching categories...")
        res = requests.get(f"{BASE_URL}/categories")
        assert res.status_code == 200, f"Get categories failed: {res.status_code} {res.text}"
        categories = res.json()
        assert isinstance(categories, list), "Expected list of categories"
        assert len(categories) > 0, "Should have categories"
        self.log(f"✓ Categories retrieved: {len(categories)} categories")
        for cat in categories[:3]:
            self.log(f"  - {cat['name']}")

    def run_all_tests(self):
        """Run all migration smoke tests"""
        self.log("\n" + "="*60)
        self.log("BISNOI MIGRATION SMOKE TEST")
        self.log("Testing: https://isko-main.preview.emergentagent.com")
        self.log("="*60)
        
        # Public endpoints
        self.run_test("GET /api/restaurants (expect 8)", self.test_get_restaurants)
        self.run_test("GET /api/categories", self.test_categories)
        self.run_test("GET /api/restaurants/{id}/menu", self.test_restaurant_menu)
        
        # Customer auth & endpoints
        self.run_test("Customer login (5550001111)", self.test_customer_login)
        self.run_test("GET /api/auth/me (customer)", self.test_customer_me)
        
        # Owner auth & endpoints
        self.run_test("Owner login (8888888888)", self.test_owner_login)
        self.run_test("GET /api/owner/dinein/orders", self.test_owner_dinein_orders)
        
        # Admin auth
        self.run_test("Admin login (9999999999)", self.test_admin_login)
        
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
    tester = MigrationTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())
