# Bisnoi — Local Android Studio Build Guide

App identifiers (already configured in `app.json`):
- Android package: `com.bisnoi.app`
- iOS bundle id: `com.bisnoi.app`
- version: `1.0.0`  (Android versionCode `1`, iOS buildNumber `1`)

There are TWO ways to get an installable Android app locally. Read the caveat before choosing.

---

## ⚠️ Important caveat before you build

The Bisnoi frontend is an **Expo / React Native Web** app whose login + some features
are written for the **web** runtime:

| Feature | Web (bisnoi.com / PWA) | Raw Expo native build (Path A) |
|---|---|---|
| Real-number OTP (Firebase reCAPTCHA) | ✅ works | ❌ breaks — `firebase.ts` needs `document` (web only) |
| Demo-number OTP (backend) | ✅ works | ✅ works |
| Web Push notifications (service worker) | ✅ works | ❌ needs `expo-notifications` / FCM |
| Google Maps (JS) | ✅ works | ⚠️ needs native map module |

➡️ Because of this, **Path B (WebView wrapper) is recommended** — it ships the live,
fully-working web app inside a native APK, so every feature keeps working.

---

## ✅ PATH B (Recommended) — WebView wrapper APK (all features work)

This builds a tiny native Android app that loads `https://bisnoi.com` full-screen.
Best reliability, least effort.

### Prerequisites
- Install **Android Studio** (https://developer.android.com/studio)
- During setup let it install the **Android SDK** + an emulator (or use a real phone with USB debugging).

### Steps
1. Ask the agent to generate the `android-webview/` project (or use PWABuilder.com with URL `https://bisnoi.com`).
2. Open **Android Studio** → **Open** → select the `android-webview/` folder → let Gradle sync finish.
3. To make a debug APK: menu **Build → Build Bundle(s)/APK(s) → Build APK(s)**.
   - APK path: `android-webview/app/build/outputs/apk/debug/app-debug.apk`
4. To make a release/signed APK (for Play Store):
   - **Build → Generate Signed Bundle / APK → APK** → create a keystore (keep it safe!) → build **release**.
   - Output: `.../apk/release/app-release.apk` (or `.aab` for Play Store upload).
5. Install the APK on a phone (`adb install app-debug.apk`) or drag onto an emulator.

---

## PATH A — Full Expo native build (advanced)

Only choose this if you plan to invest in native fixes (Firebase native SDK, push, maps).

### Prerequisites
- Node 18+, Java JDK 17, Android Studio + Android SDK (API 34/35), Gradle.
- macOS + Xcode + Apple Developer account are required for the **iOS** build (cannot be done on Windows/Linux).

### Steps (Android APK)
```bash
# 1. From the project root (frontend/)
yarn install

# 2. Generate the native android/ (and ios/) project from app.json
npx expo prebuild --platform android --clean

# 3. Build a release APK
cd android
./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk

# (debug apk instead: ./gradlew assembleDebug)
```
Open the generated `android/` folder in Android Studio if you prefer the GUI
(**Build → Build APK(s)**).

### Steps (iOS IPA — needs a Mac)
```bash
npx expo prebuild --platform ios --clean
cd ios && pod install
# then open ios/Bisnoi.xcworkspace in Xcode → Product → Archive → Distribute
```

### Native rework needed for Path A to be fully functional
1. **Phone OTP:** replace the web `firebase/auth` reCAPTCHA flow with
   `@react-native-firebase/auth` (native), OR switch OTP to a backend SMS gateway.
2. **Push:** add `expo-notifications` + FCM (google-services.json) instead of Web Push.
3. **Maps:** add `react-native-maps` (+ Google Maps native API key) if maps are needed.

---

## iOS (both paths)
An installable **.ipa** can only be produced on **macOS with Xcode** and a paid
**Apple Developer account ($99/year)**. On Windows/Linux use a cloud Mac (e.g. EAS Build,
Codemagic) or a physical Mac. PWABuilder.com can also generate an iOS package skeleton
from `https://bisnoi.com`.
