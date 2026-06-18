/**
 * Expo config plugin — strips the Google advertising-ID permission from
 * the merged AndroidManifest.
 *
 * Why this exists (2026-06-18):
 *   Acuity does not use the advertising ID — no ads, no attribution SDK
 *   that needs it. But a transitive dependency (Google Play Services,
 *   pulled in via expo-notifications / other GMS-backed modules) declares
 *
 *     <uses-permission android:name="com.google.android.gms.permission.AD_ID"/>
 *
 *   which the manifest merger folds into the final APK/AAB. Google Play's
 *   Data Safety form has us declaring we do NOT collect/use the
 *   advertising ID, so the permission's presence is a mismatch Play flags.
 *
 *   This plugin ensures the source manifest carries a `tools:node="remove"`
 *   directive for AD_ID (and declares the `tools` namespace if missing),
 *   so the Android manifest merger drops the permission from the final
 *   merged manifest. Verify after prebuild: the generated
 *   android/app/src/main/AndroidManifest.xml should contain
 *   `<uses-permission android:name="...AD_ID" tools:node="remove"/>`.
 *
 * Idempotency:
 *   Removes any pre-existing AD_ID entry before adding the remove
 *   directive, so re-running prebuild is a no-op.
 */

const { withAndroidManifest } = require("expo/config-plugins");

const AD_ID = "com.google.android.gms.permission.AD_ID";
const TOOLS_NS = "http://schemas.android.com/tools";

const withRemoveAdId = (config) => {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // Ensure xmlns:tools is declared on the <manifest> element so the
    // merger understands the tools:node directive.
    manifest.$ = manifest.$ || {};
    if (!manifest.$["xmlns:tools"]) {
      manifest.$["xmlns:tools"] = TOOLS_NS;
    }

    // Normalize uses-permission to an array.
    if (!Array.isArray(manifest["uses-permission"])) {
      manifest["uses-permission"] = manifest["uses-permission"]
        ? [manifest["uses-permission"]]
        : [];
    }
    const perms = manifest["uses-permission"];

    // Drop any plain AD_ID grant, then add the explicit remove directive
    // (avoids a grant + remove conflict in the same manifest).
    for (let i = perms.length - 1; i >= 0; i--) {
      if (perms[i] && perms[i].$ && perms[i].$["android:name"] === AD_ID) {
        perms.splice(i, 1);
      }
    }
    perms.push({ $: { "android:name": AD_ID, "tools:node": "remove" } });

    return cfg;
  });
};

module.exports = withRemoveAdId;
