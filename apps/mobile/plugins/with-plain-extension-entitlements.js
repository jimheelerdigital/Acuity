/**
 * Expo config plugin — normalize apple-targets' EAS extension entitlements.
 *
 * MUST be listed AFTER "@bacons/apple-targets" in app.json plugins.
 *
 * Why: when a target declares its entitlements in a hand-written
 * `*.entitlements` file (targets/watch-widget/RippleComplication.entitlements),
 * @bacons/apple-targets v5 parses it with @expo/plist, which returns a
 * NULL-PROTOTYPE object, and stores it as-is in
 * extra.eas.build.experimental.ios.appExtensions[].entitlements. Expo's config
 * serializer then crashes prebuild/EAS with
 * "TypeError: val.hasOwnProperty is not a function".
 *
 * The watch complication needs that hand-written file (an `entitlements`
 * object would auto-add the main App Group to the watch-widget target — a
 * capability our ASC API key can't enable). Converting the parsed object to a
 * plain one is lossless (entitlements are plain plist data).
 */
function toPlain(value) {
  if (Array.isArray(value)) return value.map(toPlain);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) out[key] = toPlain(value[key]);
    return out;
  }
  return value;
}

module.exports = function withPlainExtensionEntitlements(config) {
  const exts = config.extra?.eas?.build?.experimental?.ios?.appExtensions;
  if (Array.isArray(exts)) {
    for (const ext of exts) {
      if (ext && ext.entitlements) ext.entitlements = toPlain(ext.entitlements);
    }
  }
  return config;
};
