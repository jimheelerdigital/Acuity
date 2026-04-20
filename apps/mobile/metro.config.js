// Learn more https://docs.expo.io/guides/customizing-metro
// Monorepo pattern: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo so changes in packages/shared
//    or apps/web/src/shared types hot-reload the mobile bundle.
config.watchFolders = [workspaceRoot];

// 2. Resolution order: apps/mobile/node_modules first, root second.
//    This is the single lever that resolves the "duplicate React"
//    problem in an npm-workspaces monorepo — we have react@18.3.1 at
//    the root (apps/web requires it) and react@19.1.0 at
//    apps/mobile/node_modules (required by Expo SDK 54 + react-native
//    0.81). npm workspaces has no `nohoist` like Yarn Classic, so
//    both copies physically exist. Metro picking from the list below
//    in order means the 19.1.0 copy always wins when bundling the
//    mobile app; root 18.3.1 is invisible to the mobile build.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 3. Only look in the explicit paths above. Without this, Metro walks
//    up the directory tree hunting for additional node_modules, which
//    on a monorepo means it re-enters the root and potentially finds
//    the react@18 duplicate a second time. Locking resolution to the
//    paths list is what makes the React 19 pick deterministic.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
