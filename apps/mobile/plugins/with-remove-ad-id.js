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
 * Two layers (the first alone proved insufficient — build 18 / commit
 * fad0e0c still shipped AD_ID despite the manifest remove, so we also
 * strip the dependency that contributes it):
 *
 *   1. AndroidManifest: add `<uses-permission AD_ID tools:node="remove"/>`
 *      (+ declare the tools namespace).
 *   2. app/build.gradle: exclude the `play-services-ads-identifier` module
 *      from all configurations, so nothing contributes the permission.
 *      Safe here — release builds don't run R8
 *      (android.enableMinifyInReleaseBuilds=false), so the now-absent
 *      AdvertisingIdClient references don't fail the build, and nothing
 *      invokes them at runtime.
 *
 * Verify after prebuild: android/app/src/main/AndroidManifest.xml has the
 * remove directive, and android/app/build.gradle has the
 * configurations.all { exclude … } block.
 */

const {
  withAndroidManifest,
  withAppBuildGradle,
} = require("expo/config-plugins");

const AD_ID = "com.google.android.gms.permission.AD_ID";
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
      if (perms[i] && perms[i].$ && perms[i].$["android:name"] === AD_ID) {
        perms.splice(i, 1);
      }
    }
    perms.push({ $: { "android:name": AD_ID, "tools:node": "remove" } });

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
    "[with-remove-ad-id] applying: AndroidManifest tools:node=remove + gradle exclude of play-services-ads-identifier"
  );
  config = withManifestRemove(config);
  config = withGradleExclude(config);
  return config;
};

module.exports = withRemoveAdId;
