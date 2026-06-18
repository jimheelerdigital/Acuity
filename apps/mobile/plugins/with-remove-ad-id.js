/**
 * Expo config plugin — removes the Google advertising-ID permission
 * (com.google.android.gms.permission.AD_ID) from the Android build.
 *
 * Why this exists (2026-06-18):
 *   Acuity uses no advertising ID — no ads, no attribution that needs it.
 *   But Google Play Services (Firebase / play-services-measurement, and the
 *   Meta SDK with advertiserIDCollectionEnabled=false) pulls in
 *   `play-services-ads-identifier`, whose AAR manifest declares the AD_ID
 *   permission, which the merger folds into the AAB. Our Play Data Safety
 *   form declares we do NOT use the advertising ID, so Play rejects the
 *   upload ("This release includes the AD_ID permission…").
 *
 * TWO ad-ID permissions trigger Play's AD_ID data-safety check and BOTH must
 * go (confirmed by decoding the built AAB with bundletool):
 *   - com.google.android.gms.permission.AD_ID    (legacy GMS; contributed by
 *     play-services-ads-identifier)
 *   - android.permission.ACCESS_ADSERVICES_AD_ID  (Android 13+ AdServices;
 *     contributed by Firebase play-services-measurement-api)
 * Play's rejection error generically names the GMS permission even when the
 * AdServices one is the actual remaining trigger — build 18 had the GMS perm
 * already removed yet was still rejected for ACCESS_ADSERVICES_AD_ID.
 *
 * Fix layers:
 *   1. AndroidManifest: `<uses-permission … tools:node="remove"/>` for BOTH
 *      permissions (+ declare the tools namespace). Primary fix — confirmed
 *      working (build 18's AAB had the GMS perm stripped by this alone).
 *   2. app/build.gradle: also exclude the `play-services-ads-identifier`
 *      module (belt-and-suspenders for the GMS perm). Safe — release builds
 *      don't run R8 (android.enableMinifyInReleaseBuilds=false) and nothing
 *      invokes AdvertisingIdClient.
 *
 * Verify after prebuild: AndroidManifest has BOTH remove directives + the
 * tools namespace, and app/build.gradle has the configurations.all { exclude }.
 */

const {
  withAndroidManifest,
  withAppBuildGradle,
} = require("expo/config-plugins");

const REMOVE_PERMISSIONS = [
  "com.google.android.gms.permission.AD_ID",
  "android.permission.ACCESS_ADSERVICES_AD_ID",
];
const TOOLS_NS = "http://schemas.android.com/tools";

const GRADLE_SENTINEL =
  "with-remove-ad-id: exclude play-services-ads-identifier";
const GRADLE_BLOCK = `

// ${GRADLE_SENTINEL}
// Strips the AD_ID permission at its source — see
// apps/mobile/plugins/with-remove-ad-id.js for the full rationale.
configurations.all {
    exclude group: 'com.google.android.gms', module: 'play-services-ads-identifier'
}
`;

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

function withGradleExclude(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") {
      throw new Error(
        "[with-remove-ad-id] Expected a groovy app/build.gradle; got " +
          cfg.modResults.language
      );
    }
    if (!cfg.modResults.contents.includes(GRADLE_SENTINEL)) {
      cfg.modResults.contents += GRADLE_BLOCK;
    }
    return cfg;
  });
}

const withRemoveAdId = (config) => {
  // Logged so the EAS prebuild output confirms the plugin ran.
  // eslint-disable-next-line no-console
  console.warn(
    "[with-remove-ad-id] applying: manifest remove of GMS + AdServices AD_ID perms + gradle exclude of play-services-ads-identifier"
  );
  config = withManifestRemove(config);
  config = withGradleExclude(config);
  return config;
};

module.exports = withRemoveAdId;
