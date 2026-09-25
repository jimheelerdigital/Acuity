import Foundation
import SwiftUI
import WatchConnectivity

// WatchConnectivity bridge (watch side).
//
// Receives the session token + today's habits/streak the phone pushes via
// `updateApplicationContext` (latest-value semantics — perfect for a token and a
// daily snapshot). The token is cached to the watch's own UserDefaults so a cold
// launch out of phone range still has a credential to try. The phone side lives
// in apps/mobile/plugins/with-watch-connectivity.js (injected into the app
// target); it must call WCSession.updateApplicationContext with the same keys.
//
// Keys (must match the phone sender): "token" (String), "apiBase" (String),
// "streak" (Int), "habits" ([[ "id": String, "name": String, "done": Bool ]]).

struct WatchHabit: Identifiable, Equatable {
    let id: String
    let name: String
    var done: Bool
}

@MainActor
final class WatchSession: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchSession()

    private static let tokenKey = "ripple.session.token"
    private static let apiBaseKey = "ripple.api.base"
    private static let defaultApiBase = "https://goripple.io"
    private static let primaryKey = "ripple.theme.primary"
    private static let primaryHiKey = "ripple.theme.primaryHi"
    private static let secondaryKey = "ripple.theme.secondary"

    // Coral (default palette) fallbacks — used until the phone pushes the
    // user's resolved palette. #ED9672 matches the AccentColor asset.
    private static let defaultPrimary = "#ED9672"
    private static let defaultPrimaryHi = "#F4B49B"
    private static let defaultSecondary = "#9B86D4"

    @Published private(set) var token: String?
    @Published private(set) var apiBase: String
    @Published private(set) var streak: Int = 0
    @Published private(set) var habits: [WatchHabit] = []

    @Published private(set) var primaryHex: String
    @Published private(set) var primaryHiHex: String
    @Published private(set) var secondaryHex: String

    /// Brand colors, following the user's palette (parsed from the pushed hex).
    var primary: Color { Color(hex: primaryHex) ?? .orange }
    var primaryHi: Color { Color(hex: primaryHiHex) ?? primary }
    var secondary: Color { Color(hex: secondaryHex) ?? primary }

    private override init() {
        let d = UserDefaults.standard
        token = d.string(forKey: Self.tokenKey)
        apiBase = d.string(forKey: Self.apiBaseKey) ?? Self.defaultApiBase
        primaryHex = d.string(forKey: Self.primaryKey) ?? Self.defaultPrimary
        primaryHiHex = d.string(forKey: Self.primaryHiKey) ?? Self.defaultPrimaryHi
        secondaryHex = d.string(forKey: Self.secondaryKey) ?? Self.defaultSecondary
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    var isSignedIn: Bool { (token?.isEmpty == false) }

    /// Optimistically mark a habit done locally (the API call is fire-and-check).
    func markHabitDoneLocally(_ id: String) {
        if let i = habits.firstIndex(where: { $0.id == id }) {
            habits[i].done = true
        }
    }

    private func apply(context: [String: Any]) {
        if let t = context["token"] as? String {
            token = t
            UserDefaults.standard.set(t, forKey: Self.tokenKey)
        }
        if let b = context["apiBase"] as? String, !b.isEmpty {
            apiBase = b
            UserDefaults.standard.set(b, forKey: Self.apiBaseKey)
        }
        if let p = context["themePrimary"] as? String, !p.isEmpty {
            primaryHex = p
            UserDefaults.standard.set(p, forKey: Self.primaryKey)
        }
        if let p = context["themePrimaryHi"] as? String, !p.isEmpty {
            primaryHiHex = p
            UserDefaults.standard.set(p, forKey: Self.primaryHiKey)
        }
        if let p = context["themeSecondary"] as? String, !p.isEmpty {
            secondaryHex = p
            UserDefaults.standard.set(p, forKey: Self.secondaryKey)
        }
        if let s = context["streak"] as? Int { streak = s }
        if let raw = context["habits"] as? [[String: Any]] {
            habits = raw.compactMap { h in
                guard let id = h["id"] as? String, let name = h["name"] as? String
                else { return nil }
                return WatchHabit(id: id, name: name, done: (h["done"] as? Bool) ?? false)
            }
        }
    }

    // MARK: WCSessionDelegate

    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith state: WCSessionActivationState,
        error: Error?
    ) {}

    nonisolated func session(
        _ session: WCSession,
        didReceiveApplicationContext applicationContext: [String: Any]
    ) {
        Task { @MainActor in self.apply(context: applicationContext) }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveUserInfo userInfo: [String: Any]
    ) {
        Task { @MainActor in self.apply(context: userInfo) }
    }
}
