# Android Upload Signing Certificate

This is the upload certificate (public key) used to sign the Android build for the Play Store upload.

- **File:** `upload_cert.der` (DER-encoded X.509 certificate, ~818 bytes)
- **Package name:** `com.bisnoi.app`
- **Valid:** 26 Jul 2026 → 11 Dec 2053

## Fingerprints
Register these in the places listed below.

| Alg     | Fingerprint |
|---------|-------------|
| SHA-1   | `15:0A:72:D3:D2:EE:B3:5F:3B:F2:B9:56:3B:16:4E:A4:15:38:4E:3D` |
| SHA-256 | `55:0F:58:2C:B1:AB:AF:59:A2:72:DF:11:9B:23:50:F5:EA:44:C0:57:B3:97:AC:E2:D6:5E:4B:BF:6E:CB:33:A7` |

## Where to add the fingerprint (one-time, manual)

1. **Firebase Console** → Project settings → Your Apps → Android app (`com.bisnoi.app`)
   → *Add fingerprint* → paste both SHA-1 and SHA-256. Then re-download
   `google-services.json` and replace the one at `/app/frontend/google-services.json`.

2. **Google Cloud Console** → APIs & Services → Credentials → your Android Maps API key
   → *Edit application restrictions* → add package `com.bisnoi.app` + SHA-1.

3. **Google Play Console** → your app → Setup → App signing
   → *Upload certificate* section shows the same SHA-1/SHA-256 as above.
   If they match, this is your correct upload cert.

## Notes
- Signing itself is not done here in the preview. When you click **Publish → Deploy → Generate Android build** in Emergent, the build service signs the APK/AAB with the corresponding upload keystore.
- Do NOT commit the private `.jks` / `.keystore` file to the repo. Only the public `.der`
  certificate is safe to keep here.
- `eas.json` is Emergent-managed — build credentials are configured through the
  Emergent build UI, not in this repo.
