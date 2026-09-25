import Foundation
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

    @Published private(set) var token: String?
    @Published private(set) var apiBase: String
    @Published private(set) var streak: Int = 0
    @Published private(set) var habits: [WatchHabit] = []

    private override init() {
        let d = UserDefaults.standard
        token = d.string(forKey: Self.tokenKey)
        apiBase = d.string(forKey: Self.apiBaseKey) ?? Self.defaultApiBase
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
