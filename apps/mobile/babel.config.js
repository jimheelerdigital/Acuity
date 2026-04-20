module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // NativeWind v4 handles className compilation via the jsxImportSource
      // option below — no separate `nativewind/babel` preset needed (that
      // was a v2 pattern and under v4 it's a missing-module error waiting
      // to happen).
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
    ],
    plugins: [
      // Reanimated v4 still registers under this path — the installed
      // package's plugin/index.js is a one-line shim re-exporting
      // react-native-worklets/plugin.
      "react-native-reanimated/plugin",
    ],
  };
};
