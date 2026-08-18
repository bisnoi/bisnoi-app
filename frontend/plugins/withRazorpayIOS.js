const { withXcodeProject, withInfoPlist } = require("@expo/config-plugins");

// react-native-razorpay's iOS SDK (the `razorpay-pod` CocoaPod dependency) ships
// a Swift-based Razorpay.framework. Expo's default managed-workflow prebuild
// links the pod via autolinking but does NOT enable Swift support on the app
// target, so the framework's Swift runtime never gets embedded and the native
// module fails to register at runtime -- `NativeModules.RazorpayCheckout`
// stays undefined even in a real compiled build (APK/IPA), even though the
// build itself succeeds. Per Razorpay's own troubleshooting docs: "Set the
// Embedded Content Contains Swift Code (EMBEDDED_CONTENT_CONTAINS_SWIFT)
// build setting to YES in your app."
// https://razorpay.com/docs/payments/payment-gateway/react-native-integration/standard/troubleshooting-faqs/
function withRazorpaySwiftSupport(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const entry = configurations[key];
      if (entry.buildSettings) {
        entry.buildSettings.EMBEDDED_CONTENT_CONTAINS_SWIFT = "YES";
        entry.buildSettings.ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES = "YES";
        if (!entry.buildSettings.SWIFT_VERSION) {
          entry.buildSettings.SWIFT_VERSION = "5.0";
        }
      }
    }
    return config;
  });
}

// Registers the UPI app schemes Razorpay needs to be able to detect/deep-link
// into (PhonePe/GPay/Paytm) so the checkout sheet can list them as payment
// options on iOS. Without this, Razorpay's UPI intent flow silently shows no
// installed apps even when the module itself is linked correctly.
function withRazorpayUpiSchemes(config) {
  return withInfoPlist(config, (config) => {
    const existing = config.modResults.LSApplicationQueriesSchemes || [];
    const required = ["tez", "phonepe", "paytmmp"];
    config.modResults.LSApplicationQueriesSchemes = Array.from(
      new Set([...existing, ...required])
    );
    return config;
  });
}

module.exports = function withRazorpayIOS(config) {
  config = withRazorpaySwiftSupport(config);
  config = withRazorpayUpiSchemes(config);
  return config;
};
