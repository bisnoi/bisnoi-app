"""
Verification of bug fix: Expo Go manifest endpoint should not return 500
with EXPO_TOKEN authentication error.

Scope (per review request):
1. Manifest endpoint returns 200 (not 500) with Expo-Platform ios/android headers.
2. Manifest response has no EXPO_TOKEN / non-interactive mode error strings.
3. Web preview loads Bisnoi landing content.
4. Backend /api/restaurants returns 200 with non-empty JSON array.
5. app.json no longer contains 'owner', 'projectId', 'googleServicesFile'.
"""
import json
import os
import re

import pytest
import requests

BASE_URL = "https://mobile-app-demo-55.preview.emergentagent.com"
APP_JSON_PATH = "/app/frontend/app.json"


# -------- Expo Go manifest endpoint --------
class TestExpoManifest:
    @pytest.mark.parametrize("platform", ["ios", "android"])
    def test_manifest_no_500_no_expo_token_error(self, platform):
        headers = {
            "Expo-Platform": platform,
            "Expo-Api-Version": "1",
            "Expo-Accept-Signature": "true",
            "Accept": "application/expo+json,application/json",
        }
        r = requests.get(BASE_URL + "/", headers=headers, timeout=30)
        body = r.text
        # Not a 500
        assert r.status_code != 500, (
            f"[{platform}] Manifest returned 500. Body head: {body[:400]}"
        )
        # No EXPO_TOKEN / non-interactive mode error strings
        assert "EXPO_TOKEN" not in body, f"[{platform}] Body contains EXPO_TOKEN error"
        assert "non-interactive mode" not in body, (
            f"[{platform}] Body contains 'non-interactive mode' error"
        )
        # Should be 200
        assert r.status_code == 200, (
            f"[{platform}] Expected 200, got {r.status_code}. Body head: {body[:400]}"
        )

    @pytest.mark.parametrize("platform", ["ios", "android"])
    def test_manifest_has_expo_keys(self, platform):
        headers = {
            "Expo-Platform": platform,
            "Expo-Api-Version": "1",
            "Expo-Accept-Signature": "true",
            "Accept": "application/expo+json,application/json",
        }
        r = requests.get(BASE_URL + "/", headers=headers, timeout=30)
        assert r.status_code == 200
        # Try to parse JSON manifest
        try:
            data = r.json()
        except Exception as e:
            pytest.fail(
                f"[{platform}] Manifest is not valid JSON: {e}. Head: {r.text[:400]}"
            )
        # Look for at least one classic manifest key. Modern expo-updates
        # manifest v0 uses launchAsset, extra, runtimeVersion, etc.
        expected_any = ["launchAsset", "sdkVersion", "extra", "runtimeVersion", "id"]
        found = [k for k in expected_any if k in data]
        assert found, (
            f"[{platform}] None of expected manifest keys present. "
            f"Got keys: {list(data.keys())[:20]}"
        )


# -------- Web preview --------
class TestWebPreview:
    def test_web_preview_loads(self):
        # Fetch without Expo-Platform header -> should return web HTML bundle
        r = requests.get(BASE_URL + "/", headers={"Accept": "text/html"}, timeout=30)
        assert r.status_code == 200, f"Web preview status {r.status_code}"
        # Content-type html or contains html markers
        content = r.text.lower()
        assert "<html" in content or "<!doctype html" in content, (
            f"Web preview didn't return HTML. Head: {r.text[:200]}"
        )


# -------- Backend restaurants API --------
class TestRestaurantsAPI:
    def test_restaurants_returns_non_empty_array(self):
        r = requests.get(BASE_URL + "/api/restaurants", timeout=30)
        assert r.status_code == 200, f"/api/restaurants status {r.status_code}. Body: {r.text[:400]}"
        data = r.json()
        # Could be a list, or {"restaurants": [...]} shape
        if isinstance(data, dict):
            # Common wrapper keys
            for key in ("restaurants", "data", "items", "results"):
                if key in data and isinstance(data[key], list):
                    data = data[key]
                    break
        assert isinstance(data, list), f"Expected list, got {type(data).__name__}: {str(data)[:200]}"
        assert len(data) > 0, "Restaurants list is empty"
        # sanity-check first item has some identifiable fields
        first = data[0]
        assert isinstance(first, dict)


# -------- app.json cleanup verification --------
class TestAppJsonCleanup:
    def test_app_json_no_owner_projectid_googleservices(self):
        assert os.path.exists(APP_JSON_PATH), "app.json missing"
        with open(APP_JSON_PATH, "r") as f:
            raw = f.read()
        # Case-insensitive checks for the specific fields
        forbidden = ["\"owner\"", "\"projectId\"", "\"googleServicesFile\""]
        for token in forbidden:
            assert token not in raw, f"app.json still contains {token}"

        # Also validate JSON parses and structural absence
        cfg = json.loads(raw)
        expo = cfg.get("expo", {})
        assert "owner" not in expo, "expo.owner still present"
        extra = expo.get("extra", {})
        eas = extra.get("eas", {}) if isinstance(extra, dict) else {}
        assert "projectId" not in eas, "extra.eas.projectId still present"
        android = expo.get("android", {})
        assert "googleServicesFile" not in android, "android.googleServicesFile still present"
