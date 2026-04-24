module.exports = function (api) {
  api.cache(true);
  const isProduction = process.env.BABEL_ENV === "production" ||
    process.env.NODE_ENV === "production";
  return {
    presets: [
      // NativeWind v4 handles className compilation via the jsxImportSource
      // option below — no separate `nativewind/babel` preset needed (that
      // was a v2 pattern and under v4 it's a missing-module error waiting
      // to happen).
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
    ],
    plugins: [
      // Strip `console.log` in production bundles. Hermes still
      // serializes the args list before dropping the output; deleting
      // the calls entirely saves bundle size + per-call CPU. Keep
      // `error` and `warn` so Sentry integration still sees them.
      ...(isProduction
        ? [["transform-remove-console", { exclude: ["error", "warn"] }]]
        : []),
      // Reanimated v4 still registers under this path — the installed
      // package's plugin/index.js is a one-line shim re-exporting
      // react-native-worklets/plugin. MUST be last.
      "react-native-reanimated/plugin",
    ],
  };
};
