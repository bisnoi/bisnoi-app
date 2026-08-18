// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const { FileStore } = require("metro-cache");

const config = getDefaultConfig(__dirname);

// Use a stable on-disk store (shared across web/android)
const root = process.env.METRO_CACHE_ROOT || path.join(__dirname, ".metro-cache");
config.cacheStores = [
  new FileStore({ root: path.join(root, "cache") }),
];

// Only watch source folders (not node_modules). This prevents
// "ENOSPC: System limit for number of file watchers reached" on containers
// where inotify limits are low and watchman is unavailable.
config.watchFolders = [
  path.join(__dirname, "app"),
  path.join(__dirname, "src"),
  path.join(__dirname, "assets"),
  path.join(__dirname, "public"),
];

// Reduce the number of workers to decrease resource usage
config.maxWorkers = 2;

// Prevent watcher from recursing into heavy node_modules subtrees while
// still allowing module resolution.
config.resolver = config.resolver || {};
config.resolver.blockList = [
  /\/node_modules\/.*\/(sampleApps|example|examples|__tests__|android|ios|macos|windows)\/.*/,
  /\/node_modules\/react-native-razorpay\/(sampleApps|android|ios)\/.*/,
];

module.exports = config;
