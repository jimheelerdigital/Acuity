/**
 * Ripple home-screen widget (WidgetKit) — @bacons/apple-targets.
 *
 * The `widget` target type auto-mirrors the app's App Group
 * (`com.apple.security.application-groups` from app.json's ios.entitlements)
 * as long as we don't override that key here, so the widget can read the
 * data the RN app writes via ExtensionStorage into
 * `group.com.heelerdigital.acuity`. Deployment target 17 for interactive
 * (tap-to-check) widgets.
 *
 * 1.9.4: keychain sharing. App Groups are mirrored automatically but keychain
 * access groups must be declared explicitly. The widget's CompleteTaskIntent
 * reads the session bearer from the shared access group
 * `$(AppIdentifierPrefix)com.heelerdigital.acuity.shared`, which lib/auth.ts
 * writes via expo-secure-store `accessGroup`. The same group is listed in
 * app.json ios.entitlements (app side). The prefix resolves to the Apple
 * team id (ZNF9ZJ4NVX) at build time. EAS reads this entitlements block via
 * extra.eas.build.experimental.ios.appExtensions and provisions the
 * extension accordingly.
 *
 * @type {import('@bacons/apple-targets').Config}
 */
module.exports = {
  type: "widget",
  name: "RippleWidget",
  deploymentTarget: "17.0",
  entitlements: {
    "keychain-access-groups": [
      "$(AppIdentifierPrefix)com.heelerdigital.acuity.shared",
    ],
  },
  colors: {
    // Coral accent (matches the app's primary). Referenced in Swift as
    // Color("AccentColor"). A named color set is generated for it.
    AccentColor: "#ED9672",
  },
};
