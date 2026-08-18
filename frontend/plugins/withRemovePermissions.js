const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withRemovePermissions(config, permissions) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults.manifest;

    if (!androidManifest["uses-permission"]) {
      androidManifest["uses-permission"] = [];
    }

    permissions.forEach((permission) => {
      // Add the permission with tools:node="remove"
      androidManifest["uses-permission"].push({
        $: {
          "android:name": permission,
          "tools:node": "remove",
        },
      });
    });

    // Ensure the tools namespace is present in the manifest tag
    if (!androidManifest.$["xmlns:tools"]) {
      androidManifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    }

    return config;
  });
};
