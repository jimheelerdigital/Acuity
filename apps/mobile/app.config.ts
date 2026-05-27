import type { ConfigContext, ExpoConfig } from "@expo/config";

/**
 * Dynamic Expo config. Layered over apps/mobile/app.json so secrets
 * stay out of the static config file (gitleaks blocks committing
 * Facebook client tokens etc.). Real values are sourced from
 * process.env at config-evaluation time:
 *
 *   - EXPO_PUBLIC_FACEBOOK_APP_ID
 *   - EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN
 *
 * For local dev: copy apps/mobile/.env.example → apps/mobile/.env
 * and fill in the values. Expo / Metro reads .env automatically.
 *
 * For EAS Build: set both as EAS Secrets via the Expo dashboard
 * (https://expo.dev → Acuity project → Configuration → Secrets) so
 * EAS interpolates them into the cloud build environment. Without
 * them set, the Meta SDK plugin block is omitted from the resolved
 * config and the runtime SDK init no-ops (lib/meta-sdk.ts swallows
 * the missing-config error in its try/catch).
 *
 * The pixel ID lives in app.json's `extra` because it is not a
 * secret — it's a public identifier embedded in the web pixel and
 * fine to commit.
 */

const FB_APP_ID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID;
const FB_CLIENT_TOKEN = process.env.EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN;

const FB_TRACKING_PERMISSION =
  "Acuity uses this only to help us see which Facebook or Instagram " +
  "ads led you here, so we can keep showing the ones that actually " +
  "helped. You can decline — nothing in the app changes.";

export default ({ config }: ConfigContext): ExpoConfig => {
  const plugins: NonNullable<ExpoConfig["plugins"]> = [
    ...((config.plugins ?? []) as NonNullable<ExpoConfig["plugins"]>),
  ];

  const extra: NonNullable<ExpoConfig["extra"]> = {
    ...(config.extra ?? {}),
  };

  if (FB_APP_ID && FB_CLIENT_TOKEN) {
    // Insert the Meta SDK plugin just before the folly mobile-flag
    // plugin so the native build order matches the pre-refactor
    // layout — folly stays last per its mod-application contract.
    const follyIdx = plugins.findIndex(
      (p) => typeof p === "string" && p.endsWith("with-folly-mobile-flag.js")
    );
    const insertAt = follyIdx >= 0 ? follyIdx : plugins.length;
    plugins.splice(insertAt, 0, [
      "react-native-fbsdk-next",
      {
        appID: FB_APP_ID,
        clientToken: FB_CLIENT_TOKEN,
        displayName: "Acuity",
        scheme: `fb${FB_APP_ID}`,
        advertiserIDCollectionEnabled: false,
        autoLogAppEventsEnabled: true,
        isAutoInitEnabled: false,
        iosUserTrackingPermission: FB_TRACKING_PERMISSION,
      },
    ]);
    extra.facebookAppId = FB_APP_ID;
  } else if (process.env.EAS_BUILD === "true") {
    // EAS build environment with missing secrets is almost certainly
    // a configuration error — surface it loudly so the build log
    // shows the problem instead of silently producing a binary that
    // can't fire Meta events.
    // eslint-disable-next-line no-console
    console.warn(
      "[app.config] EXPO_PUBLIC_FACEBOOK_APP_ID or _CLIENT_TOKEN missing; Meta SDK plugin omitted."
    );
  }

  return {
    ...(config as ExpoConfig),
    plugins,
    extra,
  };
};
