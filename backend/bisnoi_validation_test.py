"""
Backend API tests for Bisnoi validation rules:
1. PAN mandatory for restaurant partner and rider applications
2. One offer at a time per restaurant
3. POS toggle (admin control, blocks owner POS and customer dine-in when disabled)
4. Admin restaurant creation with pos_enabled
5. Regression tests
"""
import requests
import sys
import json
from datetime import datetime

BASE_URL = "https://app-zip-live.preview.emergentagent.com/api"

class BisnoisValidationTester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.customer_token = None
        self.customer_user = None
        self.owner_token = None
        self.owner_user = None
        self.admin_token = None
        self.admin_user = None
        self.rider_token = None
        self.rider_user = None
        self.restaurant_id = None
        self.menu_item_id = None
        self.offer_ids = []

    def log(self, msg, level="INFO"):
        print(f"[{level}] {msg}")

    def run_test(self, name, fn):
        """Run a single test function"""
        self.tests_run += 1
        self.log(f"\n{'='*70}")
        self.log(f"Test {self.tests_run}: {name}")
        self.log('='*70)
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

    def login_user(self, phone, expected_role, name):
        """Generic login helper"""
        self.log(f"Logging in {name} ({phone})...")
        res = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": phone})
        assert res.status_code == 200, f"Send OTP failed: {res.status_code} {res.text}"
        demo_otp = res.json().get("demo_otp")
        assert demo_otp, "No demo_otp in response"
        
        res = requests.post(f"{BASE_URL}/auth/verify-otp", json={
            "phone": phone,
            "code": demo_otp,
            "name": name
        })
        assert res.status_code == 200, f"Verify OTP failed: {res.status_code} {res.text}"
        data = res.json()
        assert "token" in data, "No token in response"
        assert data["user"]["role"] == expected_role, f"Expected {expected_role}, got {data['user']['role']}"
        
        self.log(f"✓ Logged in as {expected_role}: {data['user']['name']} (ID: {data['user']['id']})")
        return data["token"], data["user"]

    def test_login_all_users(self):
        """Login as customer, owner, admin, and rider"""
        self.customer_token, self.customer_user = self.login_user("5550001111", "customer", "Test Customer")
        self.owner_token, self.owner_user = self.login_user("8888888888", "restaurant_owner", "Test Owner")
        self.admin_token, self.admin_user = self.login_user("9999999999", "admin", "Test Admin")
        self.rider_token, self.rider_user = self.login_user("7777777777", "rider", "Test Rider")

    def test_pan_mandatory_restaurant_missing(self):
        """POST /api/applications with restaurant_partner type MISSING pan_number must fail"""
        self.log("Testing restaurant application WITHOUT pan_number...")
        headers = {"Authorization": f"Bearer {self.customer_token}"}
        
        # Get required fields from the schema (based on applications.py)
        payload = {
            "type": "restaurant_partner",
            "partner": {
                "owner_name": "Test Owner",
                "business_name": "Test Restaurant",
                "contact_phone": "9876543210",
                "restaurant_name": "Test Bisnoi Restaurant",
                "cuisines": ["Indian", "Chinese"],
                "address": "123 Test Street",
                "city": "Bengaluru",
                "pincode": "560001",
                "lat": 0,
                "lng": 0,
                "fssai_number": "12345678901234",
                # PAN is MISSING
                "bank_account_name": "Test Account",
                "bank_account_number": "1234567890",
                "bank_ifsc": "SBIN0001234",
                "pos_consent": True
            }
        }
        
        res = requests.post(f"{BASE_URL}/applications/submit", json=payload, headers=headers)
        # Should fail with 422 (validation error) or 400
        assert res.status_code in [400, 422], f"Expected 400/422, got {res.status_code}"
        self.log(f"✓ Correctly rejected application without PAN: {res.status_code}")
        self.log(f"  Error: {res.json().get('detail', res.text)}")

    def test_pan_mandatory_restaurant_invalid(self):
        """POST /api/applications with restaurant_partner type with INVALID pan_number must fail"""
        self.log("Testing restaurant application with INVALID pan_number...")
        headers = {"Authorization": f"Bearer {self.customer_token}"}
        
        payload = {
            "type": "restaurant_partner",
            "partner": {
                "owner_name": "Test Owner",
                "business_name": "Test Restaurant",
                "contact_phone": "9876543210",
                "restaurant_name": "Test Bisnoi Restaurant",
                "cuisines": ["Indian", "Chinese"],
                "address": "123 Test Street",
                "city": "Bengaluru",
                "pincode": "560001",
                "lat": 0,
                "lng": 0,
                "fssai_number": "12345678901234",
                "pan_number": "12345",  # INVALID format
                "bank_account_name": "Test Account",
                "bank_account_number": "1234567890",
                "bank_ifsc": "SBIN0001234",
                "pos_consent": True
            }
        }
        
        res = requests.post(f"{BASE_URL}/applications/submit", json=payload, headers=headers)
        assert res.status_code in [400, 422], f"Expected 400/422, got {res.status_code}"
        self.log(f"✓ Correctly rejected application with invalid PAN: {res.status_code}")
        error_msg = res.json().get('detail', res.text)
        self.log(f"  Error: {error_msg}")
        # Verify error mentions PAN format
        assert "PAN" in str(error_msg).upper() or "ABCDE1234F" in str(error_msg), "Error should mention PAN format"

    def test_pan_mandatory_restaurant_valid(self):
        """POST /api/applications with restaurant_partner type with VALID pan_number must succeed"""
        self.log("Testing restaurant application with VALID pan_number...")
        headers = {"Authorization": f"Bearer {self.customer_token}"}
        
        payload = {
            "type": "restaurant_partner",
            "partner": {
                "owner_name": "Test Owner Valid",
                "business_name": "Test Restaurant Valid",
                "contact_phone": "9876543210",
                "restaurant_name": "Test Bisnoi Restaurant Valid",
                "cuisines": ["Indian", "Chinese"],
                "address": "123 Test Street",
                "city": "Bengaluru",
                "pincode": "560001",
                "lat": 0,
                "lng": 0,
                "fssai_number": "12345678901234",
                "pan_number": "ABCDE1234F",  # VALID format
                "bank_account_name": "Test Account",
                "bank_account_number": "1234567890",
                "bank_ifsc": "SBIN0001234",
                "pos_consent": True
            }
        }
        
        res = requests.post(f"{BASE_URL}/applications/submit", json=payload, headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["type"] == "restaurant_partner", "Type mismatch"
        assert data["status"] == "pending", "Status should be pending"
        self.log(f"✓ Application submitted successfully with valid PAN")
        self.log(f"  Application ID: {data['id']}")

    def test_pan_mandatory_rider_missing(self):
        """POST /api/applications with rider type MISSING pan_number must fail"""
        self.log("Testing rider application WITHOUT pan_number...")
        headers = {"Authorization": f"Bearer {self.customer_token}"}
        
        payload = {
            "type": "rider",
            "rider": {
                "full_name": "Test Rider",
                "contact_phone": "9876543210",
                "date_of_birth": "1990-01-01",
                "city": "Bengaluru",
                "address": "123 Test Street",
                "pincode": "560001",
                "vehicle_type": "bike",
                "vehicle_number": "KA01AB1234",
                "rc_number": "RC1234567890",
                "license_number": "DL1234567890",
                "aadhaar_number": "123456789012",  # 12 digits
                # PAN is MISSING
                "bank_account_name": "Test Rider Account",
                "bank_account_number": "9876543210",
                "bank_ifsc": "HDFC0001234"
            }
        }
        
        res = requests.post(f"{BASE_URL}/applications/submit", json=payload, headers=headers)
        assert res.status_code in [400, 422], f"Expected 400/422, got {res.status_code}"
        self.log(f"✓ Correctly rejected rider application without PAN: {res.status_code}")

    def test_pan_mandatory_rider_invalid(self):
        """POST /api/applications with rider type with INVALID pan_number must fail"""
        self.log("Testing rider application with INVALID pan_number...")
        headers = {"Authorization": f"Bearer {self.customer_token}"}
        
        payload = {
            "type": "rider",
            "rider": {
                "full_name": "Test Rider",
                "contact_phone": "9876543210",
                "date_of_birth": "1990-01-01",
                "city": "Bengaluru",
                "address": "123 Test Street",
                "pincode": "560001",
                "vehicle_type": "bike",
                "vehicle_number": "KA01AB1234",
                "rc_number": "RC1234567890",
                "license_number": "DL1234567890",
                "aadhaar_number": "123456789012",
                "pan_number": "INVALID",  # INVALID format
                "bank_account_name": "Test Rider Account",
                "bank_account_number": "9876543210",
                "bank_ifsc": "HDFC0001234"
            }
        }
        
        res = requests.post(f"{BASE_URL}/applications/submit", json=payload, headers=headers)
        assert res.status_code in [400, 422], f"Expected 400/422, got {res.status_code}"
        self.log(f"✓ Correctly rejected rider application with invalid PAN: {res.status_code}")

    def test_pan_mandatory_rider_valid(self):
        """POST /api/applications with rider type with VALID pan_number must succeed"""
        self.log("Testing rider application with VALID pan_number...")
        headers = {"Authorization": f"Bearer {self.customer_token}"}
        
        payload = {
            "type": "rider",
            "rider": {
                "full_name": "Test Rider Valid",
                "contact_phone": "9876543210",
                "date_of_birth": "1990-01-01",
                "city": "Bengaluru",
                "address": "123 Test Street",
                "pincode": "560001",
                "vehicle_type": "bike",
                "vehicle_number": "KA01AB1234",
                "rc_number": "RC1234567890",
                "license_number": "DL1234567890",
                "aadhaar_number": "123456789012",
                "pan_number": "XYZAB5678C",  # VALID format
                "bank_account_name": "Test Rider Account",
                "bank_account_number": "9876543210",
                "bank_ifsc": "HDFC0001234"
            }
        }
        
        res = requests.post(f"{BASE_URL}/applications/submit", json=payload, headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["type"] == "rider", "Type mismatch"
        assert data["status"] == "pending", "Status should be pending"
        self.log(f"✓ Rider application submitted successfully with valid PAN")
        self.log(f"  Application ID: {data['id']}")

    def test_get_owner_restaurant(self):
        """Get owner's restaurant for offer tests"""
        self.log("Getting owner's restaurant...")
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        res = requests.get(f"{BASE_URL}/owner/outlet", headers=headers)
        assert res.status_code == 200, f"Get outlet failed: {res.status_code}"
        rest = res.json()
        self.restaurant_id = rest["id"]
        self.log(f"✓ Owner's restaurant: {rest['name']} (ID: {self.restaurant_id})")

    def test_get_available_offers(self):
        """Get available offers from admin"""
        self.log("Getting available offers...")
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        res = requests.get(f"{BASE_URL}/owner/offers", headers=headers)
        assert res.status_code == 200, f"Get offers failed: {res.status_code}"
        data = res.json()
        offers = data.get("offers", [])
        
        if len(offers) < 2:
            # Create offers as admin
            self.log("Creating test offers as admin...")
            admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
            
            offer1 = {
                "title": "Test Offer 1",
                "code": "TEST1",
                "type": "percent",
                "value": 10,
                "max_discount": 100,
                "min_order": 0,
                "active": True
            }
            res1 = requests.post(f"{BASE_URL}/admin/offers", json=offer1, headers=admin_headers)
            assert res1.status_code == 200, f"Create offer 1 failed: {res1.status_code}"
            self.offer_ids.append(res1.json()["id"])
            
            offer2 = {
                "title": "Test Offer 2",
                "code": "TEST2",
                "type": "flat",
                "value": 50,
                "min_order": 0,
                "active": True
            }
            res2 = requests.post(f"{BASE_URL}/admin/offers", json=offer2, headers=admin_headers)
            assert res2.status_code == 200, f"Create offer 2 failed: {res2.status_code}"
            self.offer_ids.append(res2.json()["id"])
            
            self.log(f"✓ Created 2 test offers")
        else:
            self.offer_ids = [o["id"] for o in offers[:2]]
            self.log(f"✓ Found {len(offers)} existing offers, using first 2")

    def test_one_offer_apply_first(self):
        """Apply first offer - should succeed"""
        self.log(f"Applying first offer {self.offer_ids[0]}...")
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        res = requests.post(f"{BASE_URL}/owner/offers/{self.offer_ids[0]}/apply", headers=headers)
        assert res.status_code == 200, f"Apply first offer failed: {res.status_code}: {res.text}"
        self.log(f"✓ First offer applied successfully")

    def test_one_offer_apply_second_rejected(self):
        """Apply second offer while first is active - must be REJECTED"""
        self.log(f"Attempting to apply second offer {self.offer_ids[1]} while first is active...")
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        res = requests.post(f"{BASE_URL}/owner/offers/{self.offer_ids[1]}/apply", headers=headers)
        assert res.status_code == 400, f"Expected 400, got {res.status_code}"
        error = res.json().get("detail", "")
        self.log(f"✓ Second offer correctly rejected with 400")
        self.log(f"  Error: {error}")
        assert "one offer" in error.lower() or "only one" in error.lower(), "Error should mention one offer limit"

    def test_one_offer_verify_single(self):
        """Verify restaurant has exactly one offer applied"""
        self.log("Verifying restaurant has exactly one offer...")
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        res = requests.get(f"{BASE_URL}/owner/offers", headers=headers)
        assert res.status_code == 200, f"Get offers failed: {res.status_code}"
        data = res.json()
        applied_count = data.get("applied_count", 0)
        assert applied_count == 1, f"Expected 1 applied offer, got {applied_count}"
        
        # Verify exactly one offer has applied=true
        offers = data.get("offers", [])
        applied_offers = [o for o in offers if o.get("applied")]
        assert len(applied_offers) == 1, f"Expected 1 applied offer in list, got {len(applied_offers)}"
        self.log(f"✓ Verified exactly 1 offer applied: {applied_offers[0]['title']}")

    def test_one_offer_remove_first(self):
        """Remove first offer"""
        self.log(f"Removing first offer {self.offer_ids[0]}...")
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        res = requests.post(f"{BASE_URL}/owner/offers/{self.offer_ids[0]}/remove", headers=headers)
        assert res.status_code == 200, f"Remove offer failed: {res.status_code}"
        self.log(f"✓ First offer removed successfully")

    def test_one_offer_apply_second_after_remove(self):
        """Apply second offer after removing first - should succeed"""
        self.log(f"Applying second offer {self.offer_ids[1]} after removing first...")
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        res = requests.post(f"{BASE_URL}/owner/offers/{self.offer_ids[1]}/apply", headers=headers)
        assert res.status_code == 200, f"Apply second offer failed: {res.status_code}: {res.text}"
        self.log(f"✓ Second offer applied successfully after removing first")

    def test_admin_list_restaurants(self):
        """Admin lists restaurants to find owner's restaurant"""
        self.log("Admin listing restaurants...")
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        res = requests.get(f"{BASE_URL}/admin/restaurants", headers=headers)
        assert res.status_code == 200, f"Admin list restaurants failed: {res.status_code}"
        restaurants = res.json()
        
        # Find owner's restaurant
        owner_rest = None
        for r in restaurants:
            if r.get("owner_id") == self.owner_user["id"]:
                owner_rest = r
                break
        
        assert owner_rest, f"Could not find restaurant owned by {self.owner_user['id']}"
        self.restaurant_id = owner_rest["id"]
        self.log(f"✓ Found owner's restaurant: {owner_rest['name']} (ID: {self.restaurant_id})")
        self.log(f"  Current pos_enabled: {owner_rest.get('pos_enabled', True)}")

    def test_admin_disable_pos(self):
        """Admin disables POS for owner's restaurant"""
        self.log(f"Admin disabling POS for restaurant {self.restaurant_id}...")
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        res = requests.patch(f"{BASE_URL}/admin/restaurants/{self.restaurant_id}", 
                           json={"pos_enabled": False}, 
                           headers=headers)
        assert res.status_code == 200, f"Admin disable POS failed: {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("pos_enabled") == False, f"pos_enabled should be False, got {data.get('pos_enabled')}"
        self.log(f"✓ POS disabled successfully")

    def test_admin_verify_pos_disabled(self):
        """Verify POS is disabled by re-fetching restaurant from list"""
        self.log(f"Verifying POS is disabled...")
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        res = requests.get(f"{BASE_URL}/admin/restaurants", headers=headers)
        assert res.status_code == 200, f"Get restaurants failed: {res.status_code}"
        restaurants = res.json()
        rest = next((r for r in restaurants if r["id"] == self.restaurant_id), None)
        assert rest, f"Restaurant {self.restaurant_id} not found in list"
        assert rest.get("pos_enabled") == False, f"pos_enabled should be False, got {rest.get('pos_enabled')}"
        self.log(f"✓ Verified pos_enabled=false persisted")

    def test_owner_pos_blocked_when_disabled(self):
        """Owner POS billing must be blocked when pos_enabled=false"""
        self.log("Testing owner POS billing with pos_enabled=false...")
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        
        # Try to create a POS order
        payload = {
            "order_type": "walk_in",
            "items": [
                {"name": "Test Item", "price": 100, "qty": 1}
            ],
            "payment_method": "cash"
        }
        
        res = requests.post(f"{BASE_URL}/owner/pos/orders", json=payload, headers=headers)
        assert res.status_code == 403, f"Expected 403, got {res.status_code}"
        error = res.json().get("detail", "")
        self.log(f"✓ Owner POS correctly blocked with 403")
        self.log(f"  Error: {error}")
        assert "pos" in error.lower() or "disabled" in error.lower(), "Error should mention POS disabled"

    def test_customer_dinein_blocked_when_disabled(self):
        """Customer dine-in must be blocked when pos_enabled=false"""
        self.log("Testing customer dine-in with pos_enabled=false...")
        headers = {"Authorization": f"Bearer {self.customer_token}"}
        
        # Get a menu item
        res = requests.get(f"{BASE_URL}/restaurants/{self.restaurant_id}")
        assert res.status_code == 200, f"Get restaurant failed: {res.status_code}"
        menu = res.json().get("menu", [])
        assert len(menu) > 0, "No menu items found"
        menu_item_id = menu[0]["id"]
        
        # Try to create a dine-in order
        payload = {
            "restaurant_id": self.restaurant_id,
            "table_number": 5,
            "items": [
                {"menu_item_id": menu_item_id, "quantity": 1}
            ]
        }
        
        res = requests.post(f"{BASE_URL}/dinein/order", json=payload, headers=headers)
        assert res.status_code == 403, f"Expected 403, got {res.status_code}"
        error = res.json().get("detail", "")
        self.log(f"✓ Customer dine-in correctly blocked with 403")
        self.log(f"  Error: {error}")
        assert "dine" in error.lower() or "unavailable" in error.lower(), "Error should mention dine-in unavailable"

    def test_admin_enable_pos(self):
        """Admin enables POS for owner's restaurant"""
        self.log(f"Admin enabling POS for restaurant {self.restaurant_id}...")
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        res = requests.patch(f"{BASE_URL}/admin/restaurants/{self.restaurant_id}", 
                           json={"pos_enabled": True}, 
                           headers=headers)
        assert res.status_code == 200, f"Admin enable POS failed: {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("pos_enabled") == True, f"pos_enabled should be True, got {data.get('pos_enabled')}"
        self.log(f"✓ POS enabled successfully")

    def test_owner_pos_works_when_enabled(self):
        """Owner POS billing must work when pos_enabled=true"""
        self.log("Testing owner POS billing with pos_enabled=true...")
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        
        payload = {
            "order_type": "walk_in",
            "items": [
                {"name": "Test Item Enabled", "price": 150, "qty": 2}
            ],
            "payment_method": "cash"
        }
        
        res = requests.post(f"{BASE_URL}/owner/pos/orders", json=payload, headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("total") == 300, f"Expected total 300, got {data.get('total')}"
        self.log(f"✓ Owner POS works correctly when enabled")
        self.log(f"  Bill number: {data.get('bill_number')}")

    def test_customer_dinein_works_when_enabled(self):
        """Customer dine-in must work when pos_enabled=true"""
        self.log("Testing customer dine-in with pos_enabled=true...")
        headers = {"Authorization": f"Bearer {self.customer_token}"}
        
        # Get a menu item
        res = requests.get(f"{BASE_URL}/restaurants/{self.restaurant_id}")
        assert res.status_code == 200, f"Get restaurant failed: {res.status_code}"
        menu = res.json().get("menu", [])
        assert len(menu) > 0, "No menu items found"
        menu_item_id = menu[0]["id"]
        
        payload = {
            "restaurant_id": self.restaurant_id,
            "table_number": 7,
            "items": [
                {"menu_item_id": menu_item_id, "quantity": 1}
            ]
        }
        
        res = requests.post(f"{BASE_URL}/dinein/order", json=payload, headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("payment_status") == "pay_at_counter", f"Expected pay_at_counter, got {data.get('payment_status')}"
        self.log(f"✓ Customer dine-in works correctly when enabled")
        self.log(f"  Order ID: {data.get('id')}")
        self.log(f"  Table: {data.get('table_label')}")

    def test_admin_create_restaurant_pos_disabled(self):
        """Admin creates restaurant with pos_enabled=false"""
        self.log("Admin creating restaurant with pos_enabled=false...")
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        payload = {
            "name": "Test Restaurant POS Disabled",
            "image": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800",
            "cuisines": ["Indian"],
            "address": "Test Address",
            "pos_enabled": False
        }
        
        res = requests.post(f"{BASE_URL}/admin/restaurants", json=payload, headers=headers)
        assert res.status_code == 200, f"Create restaurant failed: {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("pos_enabled") == False, f"pos_enabled should be False, got {data.get('pos_enabled')}"
        self.log(f"✓ Restaurant created with pos_enabled=false")
        self.log(f"  Restaurant ID: {data.get('id')}")

    def test_admin_create_restaurant_pos_enabled(self):
        """Admin creates restaurant with pos_enabled=true"""
        self.log("Admin creating restaurant with pos_enabled=true...")
        headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        payload = {
            "name": "Test Restaurant POS Enabled",
            "image": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800",
            "cuisines": ["Chinese"],
            "address": "Test Address 2",
            "pos_enabled": True
        }
        
        res = requests.post(f"{BASE_URL}/admin/restaurants", json=payload, headers=headers)
        assert res.status_code == 200, f"Create restaurant failed: {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("pos_enabled") == True, f"pos_enabled should be True, got {data.get('pos_enabled')}"
        self.log(f"✓ Restaurant created with pos_enabled=true")
        self.log(f"  Restaurant ID: {data.get('id')}")

    def test_regression_public_restaurants(self):
        """Regression: GET /api/restaurants still works"""
        self.log("Testing public restaurants endpoint...")
        res = requests.get(f"{BASE_URL}/restaurants")
        assert res.status_code == 200, f"Get restaurants failed: {res.status_code}"
        restaurants = res.json()
        assert isinstance(restaurants, list), "Response should be a list"
        self.log(f"✓ Public restaurants endpoint works ({len(restaurants)} restaurants)")

    def test_regression_dinein_kot(self):
        """Regression: Dine-in order creates KOT"""
        self.log("Testing dine-in KOT creation...")
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        res = requests.get(f"{BASE_URL}/owner/kitchen/kots", headers=headers)
        assert res.status_code == 200, f"Get KOTs failed: {res.status_code}"
        kots = res.json()
        self.log(f"✓ KOT endpoint works ({len(kots)} KOTs found)")

    def test_regression_owner_dinein_orders(self):
        """Regression: GET /api/owner/dinein/orders still works"""
        self.log("Testing owner dine-in orders endpoint...")
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        res = requests.get(f"{BASE_URL}/owner/dinein/orders", headers=headers)
        assert res.status_code == 200, f"Get dine-in orders failed: {res.status_code}"
        orders = res.json()
        assert isinstance(orders, list), "Response should be a list"
        self.log(f"✓ Owner dine-in orders endpoint works ({len(orders)} orders)")

    def run_all_tests(self):
        """Run all backend tests"""
        self.log("\n" + "="*70)
        self.log("STARTING BISNOI VALIDATION BACKEND TESTS")
        self.log("="*70)
        
        # Authentication
        self.run_test("Login all users (customer, owner, admin, rider)", self.test_login_all_users)
        
        # PAN Validation Tests
        self.log("\n" + "="*70)
        self.log("PAN VALIDATION TESTS")
        self.log("="*70)
        self.run_test("Restaurant application - PAN missing (must fail)", self.test_pan_mandatory_restaurant_missing)
        self.run_test("Restaurant application - PAN invalid (must fail)", self.test_pan_mandatory_restaurant_invalid)
        self.run_test("Restaurant application - PAN valid (must succeed)", self.test_pan_mandatory_restaurant_valid)
        self.run_test("Rider application - PAN missing (must fail)", self.test_pan_mandatory_rider_missing)
        self.run_test("Rider application - PAN invalid (must fail)", self.test_pan_mandatory_rider_invalid)
        self.run_test("Rider application - PAN valid (must succeed)", self.test_pan_mandatory_rider_valid)
        
        # One Offer at a Time Tests
        self.log("\n" + "="*70)
        self.log("ONE OFFER AT A TIME TESTS")
        self.log("="*70)
        self.run_test("Get owner's restaurant", self.test_get_owner_restaurant)
        self.run_test("Get available offers", self.test_get_available_offers)
        self.run_test("Apply first offer (must succeed)", self.test_one_offer_apply_first)
        self.run_test("Apply second offer while first active (must be rejected)", self.test_one_offer_apply_second_rejected)
        self.run_test("Verify exactly one offer applied", self.test_one_offer_verify_single)
        self.run_test("Remove first offer", self.test_one_offer_remove_first)
        self.run_test("Apply second offer after removing first (must succeed)", self.test_one_offer_apply_second_after_remove)
        
        # POS Toggle Tests
        self.log("\n" + "="*70)
        self.log("POS TOGGLE TESTS")
        self.log("="*70)
        self.run_test("Admin lists restaurants", self.test_admin_list_restaurants)
        self.run_test("Admin disables POS", self.test_admin_disable_pos)
        self.run_test("Verify POS disabled persists", self.test_admin_verify_pos_disabled)
        self.run_test("Owner POS blocked when disabled (403)", self.test_owner_pos_blocked_when_disabled)
        self.run_test("Customer dine-in blocked when disabled (403)", self.test_customer_dinein_blocked_when_disabled)
        self.run_test("Admin enables POS", self.test_admin_enable_pos)
        self.run_test("Owner POS works when enabled (200)", self.test_owner_pos_works_when_enabled)
        self.run_test("Customer dine-in works when enabled (200)", self.test_customer_dinein_works_when_enabled)
        
        # Admin Restaurant Creation Tests
        self.log("\n" + "="*70)
        self.log("ADMIN RESTAURANT CREATION TESTS")
        self.log("="*70)
        self.run_test("Admin creates restaurant with pos_enabled=false", self.test_admin_create_restaurant_pos_disabled)
        self.run_test("Admin creates restaurant with pos_enabled=true", self.test_admin_create_restaurant_pos_enabled)
        
        # Regression Tests
        self.log("\n" + "="*70)
        self.log("REGRESSION TESTS")
        self.log("="*70)
        self.run_test("Regression: GET /api/restaurants", self.test_regression_public_restaurants)
        self.run_test("Regression: Dine-in KOT creation", self.test_regression_dinein_kot)
        self.run_test("Regression: Owner dine-in orders", self.test_regression_owner_dinein_orders)
        
        # Summary
        self.log("\n" + "="*70)
        self.log("TEST SUMMARY")
        self.log("="*70)
        self.log(f"Total tests: {self.tests_run}")
        self.log(f"Passed: {self.tests_passed}")
        self.log(f"Failed: {self.tests_run - self.tests_passed}")
        self.log(f"Success rate: {(self.tests_passed / self.tests_run * 100):.1f}%")
        
        return 0 if self.tests_passed == self.tests_run else 1

def main():
    tester = BisnoisValidationTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())
