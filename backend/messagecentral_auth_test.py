"""
Backend API tests for Message Central OTP authentication.
Tests that:
1. Test account 8929926078 with fixed OTP 989898 works correctly
2. OTP is NEVER leaked in API response (no demo_otp/code field)
3. Wrong OTP returns 400 error
4. Admin account 8447816991 exists in DB with role 'admin'
"""
import requests
import sys
from pymongo import MongoClient

# Use the public endpoint from frontend .env
BASE_URL = "https://zip-extract-live.preview.emergentagent.com/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"

class MessageCentralAuthTester:
    def __init__(self):
        self.tests_run = 0
        self.tests_passed = 0
        self.test_phone = "8929926078"
        self.test_otp = "989898"
        self.admin_phone = "8447816991"

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

    def test_send_otp_no_leak(self):
        """Test that send-otp for test account does NOT leak OTP in response"""
        self.log(f"Sending OTP to test account {self.test_phone}...")
        res = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": self.test_phone})
        
        assert res.status_code == 200, f"Send OTP failed: {res.status_code} {res.text}"
        data = res.json()
        
        # Verify response structure
        assert data.get("sent") is True, f"Expected sent=true, got {data.get('sent')}"
        assert data.get("channel") == "sms", f"Expected channel='sms', got {data.get('channel')}"
        
        # CRITICAL: Verify OTP is NOT leaked
        assert "demo_otp" not in data, "SECURITY ISSUE: 'demo_otp' field leaked in response!"
        assert "code" not in data, "SECURITY ISSUE: 'code' field leaked in response!"
        assert "otp" not in data, "SECURITY ISSUE: 'otp' field leaked in response!"
        assert self.test_otp not in str(data), f"SECURITY ISSUE: OTP '{self.test_otp}' found in response!"
        
        self.log(f"✓ Response: {data}")
        self.log(f"✓ NO OTP leaked in response (demo_otp, code, otp fields absent)")
        self.log(f"✓ OTP digits '{self.test_otp}' NOT present in response")

    def test_verify_otp_correct(self):
        """Test verify-otp with correct OTP 989898"""
        self.log(f"Verifying correct OTP {self.test_otp} for {self.test_phone}...")
        res = requests.post(f"{BASE_URL}/auth/verify-otp", json={
            "phone": self.test_phone,
            "code": self.test_otp
        })
        
        assert res.status_code == 200, f"Verify OTP failed: {res.status_code} {res.text}"
        data = res.json()
        
        # Verify response structure
        assert "token" in data, "Missing 'token' field in response"
        assert "user" in data, "Missing 'user' field in response"
        
        user = data["user"]
        assert user.get("phone") == self.test_phone, f"Phone mismatch: expected {self.test_phone}, got {user.get('phone')}"
        assert user.get("role") == "customer", f"Role mismatch: expected 'customer', got {user.get('role')}"
        assert user.get("name") == "Test User", f"Name mismatch: expected 'Test User', got {user.get('name')}"
        
        self.log(f"✓ Login successful!")
        self.log(f"  User ID: {user.get('id')}")
        self.log(f"  Phone: {user.get('phone')}")
        self.log(f"  Name: {user.get('name')}")
        self.log(f"  Role: {user.get('role')}")
        self.log(f"  Token: {data['token'][:30]}...")

    def test_verify_otp_wrong(self):
        """Test verify-otp with wrong OTP (should return 400)"""
        wrong_otp = "111111"
        self.log(f"Attempting to verify with WRONG OTP {wrong_otp} for {self.test_phone}...")
        
        # First send OTP again to ensure fresh session
        res = requests.post(f"{BASE_URL}/auth/send-otp", json={"phone": self.test_phone})
        assert res.status_code == 200, "Send OTP failed"
        
        # Try wrong OTP
        res = requests.post(f"{BASE_URL}/auth/verify-otp", json={
            "phone": self.test_phone,
            "code": wrong_otp
        })
        
        assert res.status_code == 400, f"Expected 400 for wrong OTP, got {res.status_code}"
        data = res.json()
        
        # Verify error message
        detail = data.get("detail", "")
        assert "Invalid OTP" in detail or "invalid" in detail.lower(), f"Expected 'Invalid OTP' error, got: {detail}"
        
        self.log(f"✓ Correctly rejected wrong OTP with 400")
        self.log(f"  Error message: {detail}")

    def test_admin_exists_in_db(self):
        """Verify admin phone 8447816991 exists in MongoDB with role 'admin'"""
        self.log(f"Checking MongoDB for admin user {self.admin_phone}...")
        
        try:
            client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
            db = client[DB_NAME]
            
            # Query for admin user
            admin_user = db.users.find_one({"phone": self.admin_phone}, {"_id": 0})
            
            assert admin_user is not None, f"Admin user with phone {self.admin_phone} NOT found in database"
            assert admin_user.get("role") == "admin", f"Expected role 'admin', got '{admin_user.get('role')}'"
            
            self.log(f"✓ Admin user found in database:")
            self.log(f"  Phone: {admin_user.get('phone')}")
            self.log(f"  Name: {admin_user.get('name')}")
            self.log(f"  Role: {admin_user.get('role')}")
            self.log(f"  ID: {admin_user.get('id')}")
            
            client.close()
            
        except Exception as e:
            raise AssertionError(f"MongoDB query failed: {str(e)}")

    def run_all_tests(self):
        """Run all Message Central auth tests"""
        self.log("\n" + "="*70)
        self.log("STARTING MESSAGE CENTRAL OTP AUTHENTICATION TESTS")
        self.log("="*70)
        self.log(f"Backend URL: {BASE_URL}")
        self.log(f"Test account: {self.test_phone} (fixed OTP: {self.test_otp})")
        self.log(f"Admin account: {self.admin_phone}")
        
        # Run tests
        self.run_test("Send OTP - verify NO OTP leak in response", self.test_send_otp_no_leak)
        self.run_test("Verify OTP - correct code (989898)", self.test_verify_otp_correct)
        self.run_test("Verify OTP - wrong code (should return 400)", self.test_verify_otp_wrong)
        self.run_test("Verify admin 8447816991 exists in DB with role 'admin'", self.test_admin_exists_in_db)
        
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
    tester = MessageCentralAuthTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())
