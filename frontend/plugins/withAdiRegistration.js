const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

module.exports = function withAdiRegistration(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const assetsDir = path.join(config.modRequest.platformProjectRoot, "app", "src", "main", "assets");
      fs.mkdirSync(assetsDir, { recursive: true });
      const src = path.join(config.modRequest.projectRoot, "assets", "adi-registration.properties");
      const dst = path.join(assetsDir, "adi-registration.properties");
      fs.copyFileSync(src, dst);
      return config;
    },
  ]);
};
