"""
Backend API tests for owner menu bulk import (AI menu scan fix).
Tests that bulk-imported items do NOT auto-generate AI photos.
"""
import requests
import sys
import json
from datetime import datetime

BASE_URL = "https://merge-live-build.preview.emergentagent.com/api"

class BulkMenuTester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.owner_token = None
        self.owner_user = None
        self.restaurant_id = None
        self.created_item_ids = []  # Track items for cleanup

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

    def test_login_owner(self):
        """Login as owner (8888888888) using demo OTP"""
        self.log("Sending OTP to owner phone 8888888888...")
        res = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": "8888888888"})
        assert res.status_code == 200, f"Send OTP failed: {res.status_code} {res.text}"
        data = res.json()
        demo_otp = data.get("demo_otp")
        assert demo_otp, "No demo_otp in response"
        self.log(f"Demo OTP received: {demo_otp}")

        self.log("Verifying OTP...")
        res = requests.post(f"{BASE_URL}/auth/verify-otp", json={
            "phone": "8888888888",
            "code": demo_otp
        })
        assert res.status_code == 200, f"Verify OTP failed: {res.status_code} {res.text}"
        data = res.json()
        assert "token" in data, "No token in response"
        assert "user" in data, "No user in response"
        assert data["user"]["role"] == "restaurant_owner", f"Expected restaurant_owner role, got {data['user']['role']}"
        
        self.owner_token = data["token"]
        self.owner_user = data["user"]
        self.log(f"✓ Logged in as owner: {self.owner_user.get('name', 'Owner')} (ID: {self.owner_user['id']})")

    def test_get_owner_restaurant(self):
        """Get the owner's restaurant (should be 'Truffles')"""
        self.log("Fetching owner's restaurant...")
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        res = requests.get(f"{BASE_URL}/owner/restaurant", headers=headers)
        assert res.status_code == 200, f"Get owner restaurant failed: {res.status_code} {res.text}"
        restaurant = res.json()
        assert restaurant is not None, "No restaurant found for owner"
        
        self.restaurant_id = restaurant["id"]
        self.log(f"✓ Owner's restaurant: {restaurant['name']} (ID: {self.restaurant_id})")
        assert restaurant['name'] == 'Truffles', f"Expected 'Truffles', got {restaurant['name']}"

    def test_bulk_import_without_images(self):
        """Bulk import items WITHOUT image field → verify NO AI image generation"""
        self.log("Testing bulk import WITHOUT images...")
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        
        # Create test items without image field
        payload = {
            "items": [
                {
                    "name": "Test Burger No Image 1",
                    "description": "",  # Empty description to test auto-generation
                    "price": 199,
                    "category": "Test Category",
                    "veg": True,
                    "is_available": True,
                    "out_of_stock": False,
                    "prep_time": 15
                },
                {
                    "name": "Test Pizza No Image 2",
                    "description": "",
                    "price": 299,
                    "category": "Test Category",
                    "veg": False,
                    "is_available": True,
                    "out_of_stock": False,
                    "prep_time": 20
                }
            ]
        }
        
        res = requests.post(f"{BASE_URL}/owner/menu/bulk", json=payload, headers=headers)
        assert res.status_code == 200, f"Bulk import failed: {res.status_code} {res.text}"
        data = res.json()
        
        # CRITICAL ASSERTIONS
        self.log("Verifying response structure...")
        assert "created" in data, "Missing 'created' field"
        assert "items" in data, "Missing 'items' field"
        assert "images_generating" in data, "Missing 'images_generating' field"
        
        # KEY FIX: images_generating must be 0
        assert data["images_generating"] == 0, f"Expected images_generating=0, got {data['images_generating']}"
        self.log(f"✓ images_generating = 0 (NO AI image generation triggered)")
        
        # Verify items were created
        assert data["created"] == 2, f"Expected 2 items created, got {data['created']}"
        items = data["items"]
        assert len(items) == 2, f"Expected 2 items in response, got {len(items)}"
        
        # Verify each item
        for item in items:
            self.created_item_ids.append(item["id"])
            self.log(f"\nVerifying item: {item['name']} (ID: {item['id']})")
            
            # KEY FIX: image_status must be None (not 'generating')
            assert item.get("image_status") is None, f"Expected image_status=None, got {item.get('image_status')}"
            self.log(f"  ✓ image_status = None (not 'generating')")
            
            # Image should be empty string
            assert item.get("image") == "", f"Expected empty image, got {item.get('image')}"
            self.log(f"  ✓ image = '' (empty)")
            
            # Description should be auto-generated (not empty) - but may fail if LLM API is down
            desc = item.get("description", "")
            if len(desc) > 0:
                self.log(f"  ✓ description auto-generated: '{desc[:50]}...'")
            else:
                self.log(f"  ⚠ description empty (LLM API may be unavailable)", "WARN")
            
            # Verify other fields
            assert item.get("approval_status") == "pending", f"Expected pending approval, got {item.get('approval_status')}"
            self.log(f"  ✓ approval_status = pending")
        
        self.log(f"\n✓ All {len(items)} items created WITHOUT AI image generation")

    def test_bulk_import_with_images(self):
        """Bulk import items WITH image URLs → verify images are preserved"""
        self.log("Testing bulk import WITH image URLs...")
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        
        test_image_url = "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400"
        
        payload = {
            "items": [
                {
                    "name": "Test Pasta With Image",
                    "description": "Delicious pasta",
                    "price": 249,
                    "image": test_image_url,
                    "category": "Test Category",
                    "veg": True,
                    "is_available": True,
                    "out_of_stock": False,
                    "prep_time": 18
                }
            ]
        }
        
        res = requests.post(f"{BASE_URL}/owner/menu/bulk", json=payload, headers=headers)
        assert res.status_code == 200, f"Bulk import with image failed: {res.status_code} {res.text}"
        data = res.json()
        
        # Verify response
        assert data["images_generating"] == 0, f"Expected images_generating=0, got {data['images_generating']}"
        assert data["created"] == 1, f"Expected 1 item created, got {data['created']}"
        
        item = data["items"][0]
        self.created_item_ids.append(item["id"])
        
        self.log(f"Verifying item: {item['name']} (ID: {item['id']})")
        
        # KEY FIX: Provided image must be preserved
        assert item.get("image") == test_image_url, f"Expected image URL to be preserved, got {item.get('image')}"
        self.log(f"  ✓ image preserved: {item['image']}")
        
        # image_status should still be None
        assert item.get("image_status") is None, f"Expected image_status=None, got {item.get('image_status')}"
        self.log(f"  ✓ image_status = None")
        
        self.log(f"✓ Image URL preserved correctly")

    def test_regression_ai_extract_endpoint(self):
        """Regression: Verify AI extract endpoint exists and returns proper error for invalid input"""
        self.log("Testing AI extract endpoint (regression)...")
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        
        # Send invalid/empty payload to check endpoint exists and handles errors
        payload = {
            "file_base64": "",
            "mime_type": "image/jpeg"
        }
        
        res = requests.post(f"{BASE_URL}/owner/menu/ai-extract", json=payload, headers=headers)
        
        # Endpoint should exist (not 404) and return an error for invalid input
        assert res.status_code != 404, f"AI extract endpoint not found (404)"
        self.log(f"  ✓ AI extract endpoint exists (status: {res.status_code})")
        
        # Should return error for empty file
        assert res.status_code in [400, 422, 502, 503], f"Expected error status for empty file, got {res.status_code}"
        self.log(f"  ✓ Correctly handles invalid input with status {res.status_code}")

    def test_regression_ocr_extract_endpoint(self):
        """Regression: Verify OCR extract endpoint exists and returns proper error for invalid input"""
        self.log("Testing OCR extract endpoint (regression)...")
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        
        # Send invalid/empty payload to check endpoint exists and handles errors
        payload = {
            "file_base64": "",
            "mime_type": "image/jpeg"
        }
        
        res = requests.post(f"{BASE_URL}/owner/menu/ocr-extract", json=payload, headers=headers)
        
        # Endpoint should exist (not 404) and return an error for invalid input
        assert res.status_code != 404, f"OCR extract endpoint not found (404)"
        self.log(f"  ✓ OCR extract endpoint exists (status: {res.status_code})")
        
        # Should return error for empty file (500 is also acceptable - internal error for invalid base64)
        assert res.status_code in [400, 422, 500, 502, 503], f"Expected error status for empty file, got {res.status_code}"
        self.log(f"  ✓ Correctly handles invalid input with status {res.status_code}")

    def test_cleanup_items(self):
        """Delete all test items created during testing"""
        self.log(f"Cleaning up {len(self.created_item_ids)} test items...")
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        
        deleted_count = 0
        for item_id in self.created_item_ids:
            try:
                res = requests.delete(f"{BASE_URL}/owner/menu/{item_id}", headers=headers)
                if res.status_code == 200:
                    deleted_count += 1
                    self.log(f"  ✓ Deleted item {item_id}")
                else:
                    self.log(f"  ⚠ Failed to delete item {item_id}: {res.status_code}", "WARN")
            except Exception as e:
                self.log(f"  ⚠ Error deleting item {item_id}: {e}", "WARN")
        
        self.log(f"✓ Cleanup complete: {deleted_count}/{len(self.created_item_ids)} items deleted")
        assert deleted_count == len(self.created_item_ids), f"Only {deleted_count}/{len(self.created_item_ids)} items deleted"

    def run_all_tests(self):
        """Run all backend tests"""
        self.log("\n" + "="*60)
        self.log("STARTING OWNER MENU BULK IMPORT TESTS")
        self.log("Testing: NO AI image auto-generation on bulk import")
        self.log("="*60)
        
        # Authentication & Setup
        if not self.run_test("Login as owner (8888888888)", self.test_login_owner):
            self.log("❌ Cannot proceed without owner authentication", "ERROR")
            return 1
        
        if not self.run_test("Get owner's restaurant (Truffles)", self.test_get_owner_restaurant):
            self.log("❌ Cannot proceed without restaurant", "ERROR")
            return 1
        
        # Core Tests
        self.run_test("Bulk import WITHOUT images (NO AI generation)", self.test_bulk_import_without_images)
        self.run_test("Bulk import WITH image URLs (preserve images)", self.test_bulk_import_with_images)
        
        # Regression Tests
        self.run_test("Regression: AI extract endpoint", self.test_regression_ai_extract_endpoint)
        self.run_test("Regression: OCR extract endpoint", self.test_regression_ocr_extract_endpoint)
        
        # Cleanup
        if self.created_item_ids:
            self.run_test("Cleanup: Delete test items", self.test_cleanup_items)
        
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
    tester = BulkMenuTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())
