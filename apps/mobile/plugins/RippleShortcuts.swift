//
//  RippleShortcuts.swift
//  Ripple — App Intents (Siri / Shortcuts / Spotlight / Action Button)
//
//  ── What this file is ────────────────────────────────────────────────
//  A set of App Intents + an AppShortcutsProvider that registers them with
//  the system. Once the app is installed, iOS surfaces these WITHOUT the user
//  configuring anything — via Siri, Spotlight, the Shortcuts app, and the
//  Action Button.
//
//  Two kinds of intent live here:
//    1. Open-app intents (Start a Debrief / Check Habits / Ask / Insights):
//       they foreground the app via a deep link. The recorder needs the mic,
//       which iOS will NOT grant to an out-of-process intent, so anything
//       touching audio MUST open the app (openAppWhenRun = true).
//    2. Background intents (Add Habit / Add Task / Check Off Habit / Streak):
//       text-only, so they run WITHOUT opening the app and speak a result.
//       They call the web API as the signed-in user using the session bearer
//       read straight from the app's Keychain (the same item lib/auth.ts
//       stores — a credential never touches the App Group). Only non-secret
//       config — API base and the active-habit list — comes from the App Group
//       (see apps/mobile/lib/siri-shortcuts-data.ts). If no token is present
//       the intent tells the user to open Ripple and sign in.
//
//  ── Wiring ───────────────────────────────────────────────────────────
//  Plain Swift source, copied into the generated Xcode project and added to
//  the app target's compile sources by apps/mobile/plugins/with-app-intents.js
//  at prebuild time. No separate extension; App Intents in the MAIN app target
//  is all iOS needs. The App Group entitlement already exists (widget).
//

import AppIntents
import Foundation
import Security
import UIKit

// The shared App Group. Must match app.json ios.entitlements and
// siri-shortcuts-data.ts / widget-data.ts.
private let APP_GROUP = "group.com.heelerdigital.acuity"

// Deep links (open-app intents). These map 1:1 to expo-router routes.
private let recordAutostartURL = "acuity://record?autostart=1"
private let habitsURL = "acuity://habits"
private let askRippleURL = "acuity://insights/ask"
private let insightsURL = "acuity://insights"

// MARK: - Shared state (App Group)

/// One active habit as published by the RN app for entity resolution.
struct SiriHabit: Codable, Hashable {
    let id: String
    let name: String
}

@available(iOS 16.0, *)
private enum RippleShared {
    private static var defaults: UserDefaults? { UserDefaults(suiteName: APP_GROUP) }

    /// The session bearer, read straight from the app's Keychain — the SAME
    /// item expo-secure-store writes in lib/auth.ts setToken(). A credential
    /// belongs in the Keychain, never the App Group. The App Intent runs as the
    /// app's own bundle, so it shares the app's default keychain access group;
    /// no shared-access-group entitlement is required.
    ///
    /// Query must match expo-secure-store's schema exactly (see
    /// node_modules/expo-secure-store/ios/SecureStoreModule.swift):
    ///   service = "<keychainService ?? 'app'>:no-auth"  (no requireAuthentication)
    ///   account = kSecAttrAccount = UTF-8 Data of the key
    /// lib/auth.ts stores TOKEN_KEY "acuity_session_token" with the default
    /// service and AFTER_FIRST_UNLOCK, so background reads work while locked.
    static var authToken: String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "app:no-auth",
            kSecAttrAccount as String: Data("acuity_session_token".utf8),
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let token = String(data: data, encoding: .utf8),
              !token.isEmpty
        else {
            return nil
        }
        return token
    }

    /// API origin the RN app is pointed at; falls back to production.
    static var apiBase: String {
        let b = defaults?.string(forKey: "apiBase") ?? ""
        return b.isEmpty ? "https://goripple.io" : b
    }

    /// Active habits (id + name), written by publishSiriHabits().
    static func habits() -> [SiriHabit] {
        guard let data = defaults?.data(forKey: "habitsForSiri") else { return [] }
        return (try? JSONDecoder().decode([SiriHabit].self, from: data)) ?? []
    }

    /// Best current streak, shared by the widget publisher.
    static var streak: Int { defaults?.integer(forKey: "streak") ?? 0 }
}

// MARK: - API + helpers

@available(iOS 16.0, *)
private enum RippleAPI {
    enum APIError: Error { case notSignedIn, badURL }

    /// POSTs JSON to the web API as the signed-in user. Returns the HTTP
    /// status code. Throws notSignedIn when no bearer is available.
    @discardableResult
    static func post(_ path: String, body: [String: Any]) async throws -> Int {
        guard let token = RippleShared.authToken else { throw APIError.notSignedIn }
        guard let url = URL(string: RippleShared.apiBase + path) else { throw APIError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 20
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, resp) = try await URLSession.shared.data(for: req)
        return (resp as? HTTPURLResponse)?.statusCode ?? 0
    }
}

/// Today's date in the device's local timezone, as YYYY-MM-DD — the shape the
/// habit-check endpoint validates (it belongs to the user's local calendar day).
@available(iOS 16.0, *)
private func localDateString() -> String {
    let f = DateFormatter()
    f.calendar = Calendar.current
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone.current
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: Date())
}

/// Maps an API attempt to a spoken result. Keeps every background intent's
/// success/failure phrasing consistent.
@available(iOS 16.0, *)
private func speakResult(
    _ run: () async throws -> Int,
    ok: (Int) -> String,
    fail: String
) async -> String {
    do {
        let code = try await run()
        if code == 200 || code == 201 { return ok(code) }
        if code == 401 { return "Open Ripple and sign in first, then try again." }
        return fail
    } catch RippleAPI.APIError.notSignedIn {
        return "Open Ripple and sign in first, then try again."
    } catch {
        return "I couldn't reach Ripple. Try again in a moment."
    }
}

/// Open a deep link on the main actor. Shared by every open-app intent.
@available(iOS 16.0, *)
@MainActor
private func openRippleURL(_ raw: String) async {
    if let url = URL(string: raw) {
        await UIApplication.shared.open(url)
    }
}

// MARK: - Habit entity (for "check off <habit>")

@available(iOS 16.0, *)
struct HabitEntity: AppEntity {
    let id: String
    let name: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Habit"
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }

    static var defaultQuery = HabitQuery()
}

@available(iOS 16.0, *)
struct HabitQuery: EntityStringQuery {
    /// Resolve specific ids (Shortcuts picker round-trips).
    func entities(for identifiers: [HabitEntity.ID]) async throws -> [HabitEntity] {
        RippleShared.habits()
            .filter { identifiers.contains($0.id) }
            .map { HabitEntity(id: $0.id, name: $0.name) }
    }

    /// Match spoken/typed text to a habit ("I did my stretching" → Stretching).
    func entities(matching string: String) async throws -> [HabitEntity] {
        let q = string.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        return RippleShared.habits()
            .filter {
                let n = $0.name.lowercased()
                return n.contains(q) || q.contains(n)
            }
            .map { HabitEntity(id: $0.id, name: $0.name) }
    }

    /// The list Siri/Shortcuts offers when disambiguating.
    func suggestedEntities() async throws -> [HabitEntity] {
        RippleShared.habits().map { HabitEntity(id: $0.id, name: $0.name) }
    }
}

// MARK: - Open-app intents

@available(iOS 16.0, *)
struct StartDebriefIntent: AppIntent {
    static var title: LocalizedStringResource = "Start a Check-in"
    static var description = IntentDescription(
        "Opens Ripple and immediately starts recording a voice check-in."
    )
    // Required: the recorder needs the microphone, which iOS will not grant to
    // an out-of-process intent.
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        await openRippleURL(recordAutostartURL)
        return .result()
    }
}

@available(iOS 16.0, *)
struct CheckHabitsIntent: AppIntent {
    static var title: LocalizedStringResource = "Open My Habits"
    static var description = IntentDescription(
        "Opens Ripple's habit tracker so you can check off today's habits."
    )
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        await openRippleURL(habitsURL)
        return .result()
    }
}

@available(iOS 16.0, *)
struct AskRippleIntent: AppIntent {
    static var title: LocalizedStringResource = "Ask Ripple"
    static var description = IntentDescription(
        "Opens Ripple's Ask screen to query your past reflections."
    )
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        await openRippleURL(askRippleURL)
        return .result()
    }
}

@available(iOS 16.0, *)
struct ReviewInsightsIntent: AppIntent {
    static var title: LocalizedStringResource = "Review My Insights"
    static var description = IntentDescription(
        "Opens Ripple's Insights hub — patterns, themes and reports from your check-ins."
    )
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        await openRippleURL(insightsURL)
        return .result()
    }
}

// MARK: - Background intents (no app launch; speak a result)

@available(iOS 16.0, *)
struct AddHabitIntent: AppIntent {
    static var title: LocalizedStringResource = "Add a Habit"
    static var description = IntentDescription("Adds a new habit to Ripple.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Habit", requestValueDialog: "What habit should I add?")
    var name: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return .result(dialog: "I didn't catch the habit name.") }
        let msg = await speakResult(
            { try await RippleAPI.post("/api/habits", body: ["name": trimmed]) },
            ok: { _ in "Added \(trimmed) to your habits." },
            fail: "I couldn't add that habit right now."
        )
        return .result(dialog: IntentDialog(stringLiteral: msg))
    }
}

@available(iOS 16.0, *)
struct AddTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Add a Task"
    static var description = IntentDescription("Adds a new task to your Ripple list.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Task", requestValueDialog: "What task should I add?")
    var taskTitle: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let trimmed = taskTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return .result(dialog: "I didn't catch the task.") }
        let msg = await speakResult(
            { try await RippleAPI.post("/api/tasks", body: ["title": trimmed]) },
            ok: { _ in "Added \(trimmed) to your tasks." },
            fail: "I couldn't add that task right now."
        )
        return .result(dialog: IntentDialog(stringLiteral: msg))
    }
}

@available(iOS 16.0, *)
struct CompleteHabitIntent: AppIntent {
    static var title: LocalizedStringResource = "Check Off a Habit"
    static var description = IntentDescription("Marks one of your habits done for today.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Habit")
    var habit: HabitEntity

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let msg = await speakResult(
            {
                try await RippleAPI.post(
                    "/api/habits/\(habit.id)/check",
                    body: ["localDate": localDateString(), "checked": true]
                )
            },
            ok: { _ in "Nice — checked off \(habit.name) for today." },
            fail: "I couldn't update that habit right now."
        )
        return .result(dialog: IntentDialog(stringLiteral: msg))
    }
}

@available(iOS 16.0, *)
struct CurrentStreakIntent: AppIntent {
    static var title: LocalizedStringResource = "Check My Streak"
    static var description = IntentDescription("Tells you your current Ripple streak.")
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let s = RippleShared.streak
        if s <= 0 {
            return .result(dialog: "No active streak yet — record a check-in to start one.")
        }
        return .result(dialog: "Your current streak is \(s) day\(s == 1 ? "" : "s").")
    }
}

// MARK: - Registration

@available(iOS 16.0, *)
struct RippleAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartDebriefIntent(),
            phrases: [
                "Start a check-in in \(.applicationName)",
                "Start a \(.applicationName) check-in",
                "Check in with \(.applicationName)",
                "Start a debrief in \(.applicationName)",
                "New debrief in \(.applicationName)",
            ],
            shortTitle: "Start a Check-in",
            systemImageName: "mic.fill"
        )
        AppShortcut(
            intent: AddHabitIntent(),
            phrases: [
                "Add a habit in \(.applicationName)",
                "Add a \(.applicationName) habit",
                "New habit in \(.applicationName)",
            ],
            shortTitle: "Add a Habit",
            systemImageName: "plus.circle.fill"
        )
        AppShortcut(
            intent: AddTaskIntent(),
            phrases: [
                "Add a task in \(.applicationName)",
                "Add a \(.applicationName) task",
                "New task in \(.applicationName)",
            ],
            shortTitle: "Add a Task",
            systemImageName: "checklist"
        )
        AppShortcut(
            intent: CompleteHabitIntent(),
            phrases: [
                "Check off \(\.$habit) in \(.applicationName)",
                "Mark \(\.$habit) done in \(.applicationName)",
                "I did my \(\.$habit) in \(.applicationName)",
                "Check off a habit in \(.applicationName)",
            ],
            shortTitle: "Check Off a Habit",
            systemImageName: "checkmark.circle.fill"
        )
        AppShortcut(
            intent: CurrentStreakIntent(),
            phrases: [
                "What's my streak in \(.applicationName)",
                "Check my \(.applicationName) streak",
            ],
            shortTitle: "Check My Streak",
            systemImageName: "flame.fill"
        )
        AppShortcut(
            intent: CheckHabitsIntent(),
            phrases: [
                "Open habits in \(.applicationName)",
                "Open my \(.applicationName) habits",
            ],
            shortTitle: "Open My Habits",
            systemImageName: "square.grid.2x2.fill"
        )
        AppShortcut(
            intent: AskRippleIntent(),
            phrases: [
                "Ask \(.applicationName)",
                "Ask my \(.applicationName)",
            ],
            shortTitle: "Ask Ripple",
            systemImageName: "sparkles"
        )
        AppShortcut(
            intent: ReviewInsightsIntent(),
            phrases: [
                "Review my insights in \(.applicationName)",
                "Show my \(.applicationName) insights",
            ],
            shortTitle: "Review My Insights",
            systemImageName: "chart.line.uptrend.xyaxis"
        )
    }
}
