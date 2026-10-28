/**
 * Ripple watch-face complication (WidgetKit on watchOS) — @bacons/apple-targets.
 *
 * `watch-widget` builds a watchOS WidgetKit extension. apple-targets v5 embeds
 * it in the WATCH app (not the iPhone app) and adds the watch→extension target
 * dependency itself (with-xcode-changes.js "watchOS extension" branch).
 *
 * Tap → opens the watch app straight into recording (widgetURL
 * ripplewatch://record → RippleWatchApp.onOpenURL → RecordRouter.requestRecord).
 * Text → today's habit progress ("2/3"), fetched by the complication itself
 * from GET /api/habits with the token the watch app already keeps in its
 * Keychain. Falls back to a plain branded mic when signed out / offline.
 *
 * ── Why no App Group (deliberate) ─────────────────────────────────────
 * The watch app has NO App Group (adding one made EAS fail patching the
 * capability on the watch bundle id — our ASC API key can't modify
 * capabilities). So instead of shared UserDefaults, the complication reads the
 * watch app's Keychain item via Keychain Sharing, which is NOT a portal
 * capability (provisioning profiles already allow `TEAMID.*` access groups;
 * eas-cli skips `keychain-access-groups` when syncing capabilities).
 *
 * Entitlements therefore live in a HAND-WRITTEN RippleComplication.entitlements
 * file, NOT an `entitlements` object here: for `watch-widget` apple-targets
 * auto-mirrors the main app's App Group whenever an `entitlements` object is
 * given (appGroupsByDefault), which would re-trigger exactly that capability
 * failure. A source-dir .entitlements file is used verbatim.
 *
 * Bundle id must be prefixed by the watch app's (Apple rule for embedded
 * watch extensions). This is a NEW App ID — register it in the portal before
 * the first EAS build if EAS can't (see PROGRESS.md 2026-10-28).
 *
 * @type {import('@bacons/apple-targets').Config}
 */
module.exports = {
  type: "watch-widget",
  name: "RippleComplication",
  bundleIdentifier: "com.heelerdigital.acuity.watchkitapp.complication",
  // Match the watch app. Accessory families + containerBackground need 10+.
  deploymentTarget: "11.0",
  colors: {
    // Coral accent — matches the app, widget and watch app.
    AccentColor: "#ED9672",
  },
};
