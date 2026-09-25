import Foundation
import Security
import WatchConnectivity
import UIKit

// Phone-side WatchConnectivity sender (Ripple 1.9).
//
// Hands the watch what it can't get any other way across devices: the session
// token (+ api base + today's streak). Pushed via `updateApplicationContext`
// (latest-value semantics — ideal for a credential + a daily snapshot). The
// watch side is targets/watch/WatchSession.swift; the keys MUST match:
//   "token" (String), "apiBase" (String), "streak" (Int).
//
// Reads the token from the SAME Keychain item the App Intents use
// (expo-secure-store, service "app:no-auth", account "acuity_session_token"),
// and apiBase/streak from the App Group the widget already populates. No new
// JS bridge: it self-refreshes on activation + when the app becomes active.
//
// Activated once at launch via `RippleWatchConnectivity.shared.activate()`,
// injected into the AppDelegate by plugins/with-watch-connectivity.js.
//
// UNVERIFIED until an EAS build on a paired Apple Watch.

@objc(RippleWatchConnectivity)
final class RippleWatchConnectivity: NSObject, WCSessionDelegate {
    @objc static let shared = RippleWatchConnectivity()

    private let appGroup = "group.com.heelerdigital.acuity"
    private let keychainService = "app:no-auth"
    private let keychainAccount = "acuity_session_token"
    private let defaultApiBase = "https://goripple.io"

    @objc func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(pushSnapshot),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    @objc func pushSnapshot() {
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        var ctx: [String: Any] = [:]
        if let token = readKeychainToken() { ctx["token"] = token }
        let defaults = UserDefaults(suiteName: appGroup)
        ctx["apiBase"] = defaults?.string(forKey: "apiBase") ?? defaultApiBase
        if let streak = defaults?.object(forKey: "streak") as? Int {
            ctx["streak"] = streak
        }
        // Brand colors so the watch accent + record orb follow the user's
        // palette (written to the App Group by lib/widget-data.ts).
        for key in ["themePrimary", "themePrimaryHi", "themeSecondary", "themeAccent"] {
            if let v = defaults?.string(forKey: key), !v.isEmpty { ctx[key] = v }
        }
        guard ctx["token"] != nil else { return } // nothing useful to send yet
        try? session.updateApplicationContext(ctx)
    }

    private func readKeychainToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: Data(keychainAccount.utf8),
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let token = String(data: data, encoding: .utf8),
              !token.isEmpty
        else { return nil }
        return token
    }

    // MARK: WCSessionDelegate (phone requires all three)
    func session(_ s: WCSession, activationDidCompleteWith st: WCSessionActivationState, error: Error?) {
        pushSnapshot()
    }
    func sessionDidBecomeInactive(_ s: WCSession) {}
    func sessionDidDeactivate(_ s: WCSession) {
        WCSession.default.activate() // re-activate for a newly-paired watch
    }
    func sessionWatchStateDidChange(_ s: WCSession) { pushSnapshot() }
}
