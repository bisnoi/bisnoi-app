const { withXcodeProject } = require("@expo/config-plugins");

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
