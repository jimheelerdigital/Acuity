/**
 * Expo config plugin — removes the Google advertising-ID permissions from the
 * Android build so the AAB matches our Play Data Safety declaration ("we do
 * NOT use an advertising ID").
 *
 * ── What works, and what bit us (lesson from v1.3.4 vc21, 2026-06-29) ───────
 *
 * LAYER 1 (kept) — AndroidManifest `tools:node="remove"` for BOTH AD_ID
 *   permissions:
 *     - com.google.android.gms.permission.AD_ID        (legacy GMS)
 *     - android.permission.ACCESS_ADSERVICES_AD_ID     (Android 13+ AdServices)
 *   This is the ONLY thing required: it strips both permissions from the merged
 *   manifest and satisfies Play's data-safety check. Confirmed empirically —
 *   build 18 had the GMS perm stripped by this directive alone.
 *
 * LAYER 2 (REMOVED — do not bring back) — a gradle
 *   `configurations.all { exclude … play-services-ads-identifier }` used to
 *   live here as "belt-and-suspenders." It shipped a 100% cold-launch crash and
 *   got v1.3.4 vc21 REJECTED by Play (Broken Functionality — "the app opens but
 *   keeps crashing"; Sentry: NoClassDefFoundError on AdvertisingIdClient).
 *
 *   Root cause: the Meta SDK (react-native-fbsdk-next) auto-initializes at
 *   launch (autoLogAppEventsEnabled) and calls
 *   `com.google.android.gms.ads.identifier.AdvertisingIdClient` from
 *   `com.facebook.internal.AttributionIdentifiers`. Excluding the module deleted
 *   that CLASS but left Meta's reference to it; release builds aren't minified
 *   (no R8 to prune the dead path), so the dangling reference shipped →
 *   NoClassDefFoundError on the FIRST event-logging call → crash. Removing the
 *   *permission* (Layer 1) never required removing the *class*.
 *
 *   ⚠️  DO NOT re-add the gradle exclude — or any native dependency strip — to
 *       this plugin without running the resulting AAB on a real Android
 *       device/emulator first. Decoding the AAB manifest verifies the
 *       PERMISSION is gone; it does NOT verify the app still launches. See
 *       docs/RELEASE_CHECKLIST.md.
 *
 * Verify after prebuild: AndroidManifest has BOTH remove directives + the tools
 * namespace, AND `play-services-ads-identifier` / AdvertisingIdClient remain in
 * the build (present, just unused — that's correct and safe).
 */

const { withAndroidManifest } = require("expo/config-plugins");

const REMOVE_PERMISSIONS = [
  "com.google.android.gms.permission.AD_ID",
  "android.permission.ACCESS_ADSERVICES_AD_ID",
];
const TOOLS_NS = "http://schemas.android.com/tools";

function withManifestRemove(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    manifest.$ = manifest.$ || {};
    if (!manifest.$["xmlns:tools"]) {
      manifest.$["xmlns:tools"] = TOOLS_NS;
    }

    if (!Array.isArray(manifest["uses-permission"])) {
      manifest["uses-permission"] = manifest["uses-permission"]
        ? [manifest["uses-permission"]]
        : [];
    }
    const perms = manifest["uses-permission"];

    // Drop any existing declarations, then re-add as explicit remove directives
    // so the manifest merger strips whatever the GMS/Meta AARs contribute.
    for (let i = perms.length - 1; i >= 0; i--) {
      const name = perms[i] && perms[i].$ && perms[i].$["android:name"];
      if (REMOVE_PERMISSIONS.includes(name)) perms.splice(i, 1);
    }
    for (const name of REMOVE_PERMISSIONS) {
      perms.push({ $: { "android:name": name, "tools:node": "remove" } });
    }

    return cfg;
  });
}

const withRemoveAdId = (config) => {
  // Logged so the EAS prebuild output confirms the plugin ran.
  // eslint-disable-next-line no-console
  console.warn(
    "[with-remove-ad-id] applying: manifest remove of GMS + AdServices AD_ID perms (manifest-only — NO gradle exclude; see file header)"
  );
  return withManifestRemove(config);
};

module.exports = withRemoveAdId;
