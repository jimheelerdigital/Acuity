/**
 * Server-driven app-version configuration. Read by GET
 * /api/app/version-check on every mobile launch.
 *
 * Why a static config file (vs a DB-backed AppVersion model):
 *
 *   1. No schema migration needed for v1.0 of this feature.
 *   2. Editing this file + redeploying Vercel IS the operator workflow
 *      we want — fast, atomic, reviewable in the diff.
 *   3. Per-segment targeting (e.g., "force-update users on build 42")
 *      isn't a v1 need. When it becomes one, promote to a Prisma model
 *      + admin UI; the mobile client API contract stays the same.
 *
 * Semantics:
 *
 *   - `minimumVersion`: if the running app's version is < this, the
 *     mobile client shows a NON-DISMISSIBLE force-update modal. Hold
 *     in reserve for critical-bug rollouts; default to a value that
 *     never triggers ("1.0.0" while v1.1+ is in the wild).
 *
 *   - `recommendedVersion`: if the running app's version is < this,
 *     the mobile client shows a dismissible soft modal. This is the
 *     normal "new version available" nudge. Bump when a new App
 *     Store build is approved + released.
 *
 *   - `headline` / `body` / `ctaText`: copy is server-driven so we
 *     can A/B or polish without shipping a mobile binary. Subject to
 *     the docs/Acuity_SalesCopy.md rubric — short, specific, no
 *     banned verbs.
 *
 *   - `dismissible`: client also enforces this as a belt-and-braces
 *     against the force-update lever. Hide "Later" when false.
 *
 *   - `appStoreUrl`: opened via Linking.openURL when the user taps
 *     "Update". Both https:// (universal) and itms-apps:// (deep
 *     link into the App Store app) are supported; the client picks
 *     itms-apps:// when canOpenURL approves it.
 *
 *   - `releaseNotes`: optional bullet list rendered below the body.
 *     Null/empty → no list. Keep each line under ~60 chars.
 *
 * Updating procedure (when v1.2 ships):
 *
 *   1. Set `recommendedVersion: "1.2.0"`.
 *   2. Add release-notes bullets reflecting the v1.2 highlights.
 *   3. Commit + push. Vercel deploys; v1.1 users see the prompt on
 *      their next launch (CDN cache TTL = 5 min).
 *
 * App Store ID `6762633410` is the canonical id for "Acuity" on the
 * iOS App Store — same value as the `apple-itunes-app` meta tag in
 * `apps/web/src/app/layout.tsx`. Confirmed live on getacuity.io and
 * referenced by Safari's Smart Banner for App Store deep-linking.
 */

export type AppPlatform = "ios" | "android";

export interface AppVersionConfig {
  /** Strict floor. If running app < this, force-update modal shows. */
  minimumVersion: string;
  /** Recommended floor. If running app < this, soft nudge shows. */
  recommendedVersion: string;
  /** Display headline. Short, specific. */
  headline: string;
  /** Body paragraph(s). Plain text. */
  body: string;
  /** Primary CTA label. */
  ctaText: string;
  /** When false, the "Later" button is hidden client-side. */
  dismissible: boolean;
  /** https://apps.apple.com/app/id<…> — opened on CTA tap. */
  appStoreUrl: string;
  /** Optional bullet list. `null` or `[]` → no list rendered. */
  releaseNotes: string[] | null;
}

const IOS_APP_STORE_ID = "6762633410";

export const APP_VERSION_CONFIG: Record<AppPlatform, AppVersionConfig> = {
  ios: {
    // No force-update active. v1.0 is the oldest shipped build; setting
    // this any higher would brick users still on 1.0.x until they
    // updated. Hold this lever in reserve for critical-bug rollouts.
    minimumVersion: "1.0.0",
    // The version we'd LIKE everyone on. Bump when a new App Store
    // build ships (currently v1.1 is in review; will become "1.1.0"
    // once it's released, then "1.2.0" when v1.2 lands).
    recommendedVersion: "1.1.0",
    headline: "A new version of Acuity is ready.",
    body: "We've shipped improvements to the Life Matrix, Theme Map, and the way your insights surface. Update in the App Store to get them.",
    ctaText: "Update",
    dismissible: true,
    appStoreUrl: `https://apps.apple.com/app/id${IOS_APP_STORE_ID}`,
    releaseNotes: null,
  },
  // Android placeholder. No Android build is in distribution yet; the
  // mobile client only checks ?platform=ios for now. Kept here so the
  // shape is forward-compatible without an immediate schema change.
  android: {
    minimumVersion: "1.0.0",
    recommendedVersion: "1.0.0",
    headline: "A new version of Acuity is ready.",
    body: "We've shipped improvements to the Life Matrix, Theme Map, and the way your insights surface. Update in the Play Store to get them.",
    ctaText: "Update",
    dismissible: true,
    appStoreUrl: "https://play.google.com/store/apps/details?id=com.heelerdigital.acuity",
    releaseNotes: null,
  },
};

export function configForPlatform(platform: string | null | undefined): AppVersionConfig {
  if (platform === "android") return APP_VERSION_CONFIG.android;
  // Default to iOS for any unknown / missing platform — matches the
  // current install base. When Android ships, this default behavior
  // shouldn't surprise anyone (Android client passes its own platform
  // explicitly).
  return APP_VERSION_CONFIG.ios;
}
