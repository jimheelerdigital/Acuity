// Learn more https://docs.expo.io/guides/customizing-metro
// Monorepo pattern: https://docs.expo.dev/guides/monorepos/
// NativeWind v4: https://www.nativewind.dev/docs/getting-started/installation
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch the full monorepo so packages/shared edits hot-reload.
config.watchFolders = [workspaceRoot];

// 2. Resolution order: apps/mobile/node_modules first, root second.
//    Fixes the dual React install: react@19.1.0 lives at
//    apps/mobile/node_modules (SDK 54 requirement) and react@18.3.1
//    at root (apps/web's Next.js). Metro picks 19 because it lands
//    first in the list.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

// 3. NativeWind v4 wraps the base Metro config to inject the Tailwind
//    CSS transformer. Without this wrapper, every `className` prop
//    compiles down to raw strings with no style resolution — exactly
//    the "no styling at all" symptom we hit on first install.
module.exports = withNativeWind(config, {
  input: "./global.css",
});
