/**
 * Ripple Apple Watch app (watchOS) — @bacons/apple-targets (Ripple 1.9).
 *
 * The `watch` target type builds a native SwiftUI watchOS APP (not an
 * extension). @bacons/apple-targets v5 wires the "Embed Watch Content" phase +
 * the iPhone→watch target dependency itself (the v4 bug from issue #175 is
 * fixed in v5's with-xcode-changes.js — it now distinguishes a watch app from a
 * watch extension). Still MUST be verified with an EAS build on a paired Watch.
 *
 * ── Data crosses devices via WatchConnectivity, NOT the App Group ─────
 * An App Group container is per-device — the phone's container is on the phone,
 * the watch's on the watch — so the widget's ExtensionStorage bridge does NOT
 * reach here. The watch receives the session token + today's habits/streak from
 * the phone over WCSession, then calls the Ripple API itself (record upload,
 * habit check-off). The App Group entitlement is kept only so the watch can
 * share data with its OWN future watch widget/complication.
 *
 * @type {import('@bacons/apple-targets').Config}
 */
module.exports = {
  type: "watch",
  name: "RippleWatch",
  // Suffix pattern required by Apple for a paired watch app.
  bundleIdentifier: "com.heelerdigital.acuity.watchkitapp",
  // v5 default is 11.0; pin explicitly so the build is deterministic.
  deploymentTarget: "11.0",
  colors: {
    // Coral accent — matches the app + widget. Color("AccentColor") in Swift.
    AccentColor: "#ED9672",
  },
  entitlements: {
    "com.apple.security.application-groups": ["group.com.heelerdigital.acuity"],
  },
};
