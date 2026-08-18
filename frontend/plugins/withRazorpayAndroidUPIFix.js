const { withAndroidManifest } = require("@expo/config-plugins");

// Android 11+ (API 30+) hides installed-app info unless the app declares
// which packages/intents it needs to query (package visibility). Without
// this, react-native-razorpay's Android SDK can't detect installed UPI apps
// (PhonePe, GPay, Paytm, etc.) and falls back to a generic VPA-entry screen
// instead of showing tappable app icons that open via intent.
const UPI_PACKAGES = [
  "com.phonepe.app",
  "net.one97.paytm",
  "com.google.android.apps.nbu.paisa.user",
  "in.org.npci.upiapp",
  "in.amazon.mShop.android.shopping",
  "com.mobikwik_new",
  "com.freecharge.android",
  "com.dreamplug.androidapp",
];

module.exports = function withRazorpayAndroidUPIFix(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest.queries) {
      manifest.queries = [{}];
    }
    const queries = manifest.queries[0];
    if (!queries.package) queries.package = [];
    for (const pkg of UPI_PACKAGES) {
      queries.package.push({ $: { "android:name": pkg } });
    }
    if (!queries.intent) queries.intent = [];
    queries.intent.push({
      action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
      data: [{ $: { "android:scheme": "upi" } }],
    });
    return config;
  });
};
