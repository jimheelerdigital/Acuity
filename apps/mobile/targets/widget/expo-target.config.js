/**
 * Ripple home-screen widget (WidgetKit) — @bacons/apple-targets.
 *
 * The `widget` target type auto-mirrors the app's App Group
 * (`com.apple.security.application-groups` from app.json's ios.entitlements),
 * so the widget can read the data the RN app writes via ExtensionStorage into
 * `group.com.heelerdigital.acuity`. Deployment target 17 so we can add
 * interactive (tap-to-check) widgets later; v1 is glanceable + tap-to-record.
 *
 * @type {import('@bacons/apple-targets').Config}
 */
module.exports = {
  type: "widget",
  name: "RippleWidget",
  deploymentTarget: "17.0",
  colors: {
    // Coral accent (matches the app's primary). Referenced in Swift as
    // Color("AccentColor"). A named color set is generated for it.
    AccentColor: "#ED9672",
  },
};
