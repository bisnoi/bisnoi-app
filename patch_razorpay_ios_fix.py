#!/usr/bin/env python3
"""
patch_razorpay_ios_fix.py

1. Creates frontend/plugins/withRazorpayIOSFix.js — a config plugin that
   sets EMBEDDED_CONTENT_CONTAINS_SWIFT = YES (and
   ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES = YES) on every build
   configuration in the generated Xcode project. This is the fix Razorpay's
   own iOS troubleshooting docs call for: without it, the Swift runtime the
   razorpay-pod framework needs isn't embedded, so
   NativeModules.RazorpayCheckout comes back undefined at runtime even
   though the app compiles and installs fine — exactly the TestFlight
   symptom seen here.

2. Registers "./plugins/withRazorpayIOSFix" in app.json's plugins array.

LSApplicationQueriesSchemes for UPI apps is already present in app.json's
ios.infoPlist — untouched, no change needed there.

Usage:
    cd ~/original_version
    python3 patch_razorpay_ios_fix.py

After this: you'll need a fresh EAS/Xcode prebuild (this only takes effect
on the next native build, not an OTA/JS-only update) — see the note the
script prints at the end.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PLUGIN_FILE = ROOT / "frontend" / "plugins" / "withRazorpayIOSFix.js"
APP_JSON = ROOT / "frontend" / "app.json"

PLUGIN_SOURCE = '''const { withXcodeProject } = require("@expo/config-plugins");

// react-native-razorpay's iOS SDK (the "razorpay-pod" CocoaPod) is built in
// Swift. This project itself has no Swift files, so Xcode never turns on
// Swift-runtime embedding by default — the app compiles and installs fine,
// but NativeModules.RazorpayCheckout comes back undefined at runtime because
// the Swift standard libraries the pod needs were never bundled in.
// Razorpay's own iOS troubleshooting docs call for exactly this build
// setting: EMBEDDED_CONTENT_CONTAINS_SWIFT = YES.
module.exports = function withRazorpayIOSFix(config) {
  return withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const buildSettingsObj = configurations[key].buildSettings;
      // Only touch real target build configs (they always have PRODUCT_NAME);
      // skip the project-level config entries which don't.
      if (buildSettingsObj !== undefined && buildSettingsObj.PRODUCT_NAME) {
        buildSettingsObj.EMBEDDED_CONTENT_CONTAINS_SWIFT = "YES";
        buildSettingsObj.ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES = "YES";
        if (!buildSettingsObj.SWIFT_VERSION) {
          buildSettingsObj.SWIFT_VERSION = "5.0";
        }
      }
    }
    return config;
  });
};
'''


def create_plugin_file() -> bool:
    if PLUGIN_FILE.exists():
        existing = PLUGIN_FILE.read_text(encoding="utf-8")
        if existing.strip() == PLUGIN_SOURCE.strip():
            print(f"[OK]   plugin file already present and matches: {PLUGIN_FILE}")
            return True
        print(f"[FAIL] {PLUGIN_FILE} already exists with different content — not overwriting.")
        print("       Delete or rename it first if you want this script to (re)create it.")
        return False
    PLUGIN_FILE.parent.mkdir(parents=True, exist_ok=True)
    PLUGIN_FILE.write_text(PLUGIN_SOURCE, encoding="utf-8")
    print(f"[DONE] created {PLUGIN_FILE}")
    return True


def apply_patch(path: Path, old: str, new: str, label: str) -> bool:
    if not path.exists():
        print(f"[SKIP] {label}: file not found at {path}")
        return False
    text = path.read_text(encoding="utf-8")

    if new.strip() and new in text:
        print(f"[OK]   {label}: already patched, nothing to do")
        return True

    count = text.count(old)
    if count == 0:
        print(f"[FAIL] {label}: could not find the expected original code.")
        print("       No changes made to this file.")
        return False
    if count > 1:
        print(f"[FAIL] {label}: found {count} matches, expected exactly 1 — refusing to guess.")
        print("       No changes made to this file.")
        return False

    backup = path.with_suffix(path.suffix + ".bak")
    if not backup.exists():
        backup.write_text(text, encoding="utf-8")
        print(f"       backup written: {backup}")

    path.write_text(text.replace(old, new), encoding="utf-8")
    print(f"[DONE] {label}: patched {path}")
    return True


APPJSON_OLD = '''      "expo-secure-store",
      "expo-font",
      "expo-notifications",
      [
        "./plugins/withRemovePermissions",
        [
          "android.permission.READ_EXTERNAL_STORAGE",
          "android.permission.WRITE_EXTERNAL_STORAGE"
        ]
      ]
    ],'''

APPJSON_NEW = '''      "expo-secure-store",
      "expo-font",
      "expo-notifications",
      "./plugins/withRazorpayIOSFix",
      [
        "./plugins/withRemovePermissions",
        [
          "android.permission.READ_EXTERNAL_STORAGE",
          "android.permission.WRITE_EXTERNAL_STORAGE"
        ]
      ]
    ],'''


def main() -> int:
    ok1 = create_plugin_file()
    ok2 = apply_patch(APP_JSON, APPJSON_OLD, APPJSON_NEW, "register plugin in app.json")

    print()
    if ok1 and ok2:
        print("Done. IMPORTANT: this changes native iOS build settings, so it only")
        print("takes effect on a fresh native build — not a JS/OTA update. Run:")
        print()
        print("  cd ~/original_version/frontend")
        print("  npx expo prebuild --platform ios --clean")
        print("  eas build --platform ios --profile <your-profile>")
        print()
        print("(or your usual EAS build command) and re-submit to TestFlight.")
        return 0
    print("One or more steps did NOT apply — see [FAIL]/[SKIP] above.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
