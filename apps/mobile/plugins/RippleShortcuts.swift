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
import SwiftUI
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

/// Setup-hub check marks (1.9.1). Records that an intent has been used so
/// the in-app "Set up Ripple everywhere" screen can show a green check.
/// iOS doesn't tell an intent whether it came from Siri, the Action Button,
/// Shortcuts or Spotlight, so: "Start a Check-in" (the intent the Action
/// Button is set to) marks the Action Button; every other intent marks Siri.
/// Read by apps/mobile/lib/setup-status.ts. Non-secret, App Group only.
private enum SetupStamp {
    static let actionButtonKey = "setup.startDebriefAt"
    static let siriKey = "setup.siriAt"
    static func mark(_ key: String) {
        let d = UserDefaults(suiteName: APP_GROUP)
        if d?.object(forKey: key) == nil {
            d?.set(Date().timeIntervalSince1970, forKey: key)
        }
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
        SetupStamp.mark(SetupStamp.actionButtonKey)
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
        SetupStamp.mark(SetupStamp.siriKey)
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
        SetupStamp.mark(SetupStamp.siriKey)
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
        SetupStamp.mark(SetupStamp.siriKey)
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
        SetupStamp.mark(SetupStamp.siriKey)
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

/// Optional due date for "Add a Task" (Jimmy, 2026-10-22: "no way to enter a
/// due date. Make that optional"). Asked once after the title; "No due date"
/// is the first choice, so skipping costs one tap.
@available(iOS 16.0, *)
enum TaskDueChoice: String, AppEnum {
    case none, today, tomorrow, nextWeek, pick

    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Due date")
    static var caseDisplayRepresentations: [TaskDueChoice: DisplayRepresentation] = [
        .none: "No due date",
        .today: "Today",
        .tomorrow: "Tomorrow",
        .nextWeek: "In a week",
        .pick: "Pick a date…",
    ]
}

/// A calendar day as YYYY-MM-DD in the device's local timezone: the same
/// shape the app's task form sends (the server stores it as that day).
private func ymd(_ date: Date) -> String {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = .current
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: date)
}

// MARK: - Task groups (shared from the app)

/// One task group as published by the RN app (siri-shortcuts-data.ts
/// publishSiriTaskGroups), in the user's order.
struct SiriTaskGroup: Codable, Hashable {
    let id: String
    let name: String
    let icon: String
}

@available(iOS 16.0, *)
private enum TaskGroupsShared {
    static func groups() -> [SiriTaskGroup] {
        guard let data = UserDefaults(suiteName: APP_GROUP)?.data(forKey: "taskGroupsForSiri") else { return [] }
        return (try? JSONDecoder().decode([SiriTaskGroup].self, from: data)) ?? []
    }
}

/// A task group, so a Shortcut can preset it ("Add a Task" → Group: Work).
@available(iOS 16.0, *)
struct TaskGroupEntity: AppEntity {
    let id: String
    let name: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Task group"
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }

    static var defaultQuery = TaskGroupQuery()
}

@available(iOS 16.0, *)
struct TaskGroupQuery: EntityStringQuery {
    func entities(for identifiers: [TaskGroupEntity.ID]) async throws -> [TaskGroupEntity] {
        TaskGroupsShared.groups()
            .filter { identifiers.contains($0.id) }
            .map { TaskGroupEntity(id: $0.id, name: $0.name) }
    }

    func entities(matching string: String) async throws -> [TaskGroupEntity] {
        let q = string.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        return TaskGroupsShared.groups()
            .filter { $0.name.lowercased().contains(q) || q.contains($0.name.lowercased()) }
            .map { TaskGroupEntity(id: $0.id, name: $0.name) }
    }

    func suggestedEntities() async throws -> [TaskGroupEntity] {
        TaskGroupsShared.groups().map { TaskGroupEntity(id: $0.id, name: $0.name) }
    }
}

/// The Add a Task card's in-progress choices (iOS 26+). The card's buttons
/// run their own small intents, which can't hand values back directly, so
/// the choice lives in the App Group until the card's Add button returns.
/// Reset at the start of every run. Non-secret.
@available(iOS 16.0, *)
private enum AddTaskDraft {
    private static let dueKey = "addTask.draft.due"
    private static let groupKey = "addTask.draft.groupId"
    private static var d: UserDefaults? { UserDefaults(suiteName: APP_GROUP) }

    static func reset() {
        d?.removeObject(forKey: dueKey)
        d?.removeObject(forKey: groupKey)
    }
    static var due: TaskDueChoice {
        get { TaskDueChoice(rawValue: d?.string(forKey: dueKey) ?? "") ?? .none }
        set { d?.set(newValue.rawValue, forKey: dueKey) }
    }
    static var groupId: String? {
        get { d?.string(forKey: groupKey) }
        set {
            if let v = newValue { d?.set(v, forKey: groupKey) } else { d?.removeObject(forKey: groupKey) }
        }
    }
}

// MARK: - Add a Task

@available(iOS 16.0, *)
struct AddTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Add a Task"
    static var description = IntentDescription("Adds a new task to your Ripple list, with an optional due date and group.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Task", requestValueDialog: "What task should I add?")
    var taskTitle: String

    /// Optional. Pre-set it in a Shortcut to skip the question.
    @Parameter(title: "Due date")
    var due: TaskDueChoice?

    /// Only used for "Pick a date…".
    @Parameter(title: "Date")
    var pickedDate: Date?

    /// Optional. Pre-set it in a Shortcut; otherwise chosen on the card
    /// (iOS 26+) or filed by AI.
    @Parameter(title: "Group")
    var group: TaskGroupEntity?

    func perform() async throws -> some IntentResult & ProvidesDialog {
        SetupStamp.mark(SetupStamp.siriKey)
        let trimmed = taskTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return .result(dialog: "I didn't catch the task.") }

        var choice: TaskDueChoice = due ?? .none
        var groupId: String? = group?.id

        // One card for due date + group (Jimmy, 2026-10-22: "the less
        // screens popping up consecutively the better"). iOS 26+ only, and
        // only when a Shortcut didn't preset the due date.
        if due == nil {
            if #available(iOS 26.0, *) {
                AddTaskDraft.reset()
                if let g = groupId { AddTaskDraft.groupId = g }
                try await requestConfirmation(
                    actionName: .add,
                    snippetIntent: AddTaskCardSnippet(taskTitle: trimmed)
                )
                choice = AddTaskDraft.due
                groupId = AddTaskDraft.groupId
                AddTaskDraft.reset()
            } else {
                choice = try await $due.requestValue("Add a due date?")
            }
        }

        let cal = Calendar.current
        var dueDay: Date?
        switch choice {
        case .none: dueDay = nil
        case .today: dueDay = Date()
        case .tomorrow: dueDay = cal.date(byAdding: .day, value: 1, to: Date())
        case .nextWeek: dueDay = cal.date(byAdding: .day, value: 7, to: Date())
        case .pick:
            if let preset = pickedDate {
                dueDay = preset
            } else {
                dueDay = try await $pickedDate.requestValue("Which day is it due?")
            }
        }

        var body: [String: Any] = ["title": trimmed]
        if let d = dueDay { body["dueDate"] = ymd(d) }
        if let g = groupId {
            body["groupId"] = g
        } else {
            // No group chosen: the server files it with AI after answering.
            body["autoGroup"] = true
        }
        let groupName = groupId.flatMap { id in TaskGroupsShared.groups().first { $0.id == id }?.name }
        let when: String = {
            guard let d = dueDay else { return "" }
            if cal.isDateInToday(d) { return ", due today" }
            if cal.isDateInTomorrow(d) { return ", due tomorrow" }
            let f = DateFormatter()
            f.dateFormat = "EEEE, MMM d"
            return ", due \(f.string(from: d))"
        }()
        let msg = await speakResult(
            { try await RippleAPI.post("/api/tasks", body: body) },
            ok: { _ in
                if let name = groupName { return "Added \(trimmed) to \(name)\(when)." }
                return "Added \(trimmed) to your tasks\(when)."
            },
            fail: "I couldn't add that task right now."
        )
        return .result(dialog: IntentDialog(stringLiteral: msg))
    }
}

// MARK: - Add a Task card (iOS 26+)

/// The card shown after the task name: due-date buttons, group buttons and
/// the system's Add button. Re-rendered by the system after each tap.
@available(iOS 26.0, *)
struct AddTaskCardSnippet: SnippetIntent {
    static var title: LocalizedStringResource = "Add a Task card"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Task")
    var taskTitle: String

    init() {}
    init(taskTitle: String) { self.taskTitle = taskTitle }

    func perform() async throws -> some IntentResult & ShowsSnippetView {
        .result(view: AddTaskCardView(
            title: taskTitle,
            due: AddTaskDraft.due,
            groups: TaskGroupsShared.groups(),
            groupId: AddTaskDraft.groupId
        ))
    }
}

/// Card button: choose a due date.
@available(iOS 26.0, *)
struct ChooseTaskDueIntent: AppIntent {
    static var title: LocalizedStringResource = "Choose task due date"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Due")
    var choice: TaskDueChoice

    init() {}
    init(_ choice: TaskDueChoice) { self.choice = choice }

    func perform() async throws -> some IntentResult {
        AddTaskDraft.due = choice
        return .result()
    }
}

/// Card button: choose a group (tap the chosen one again to clear it).
@available(iOS 26.0, *)
struct ChooseTaskGroupIntent: AppIntent {
    static var title: LocalizedStringResource = "Choose task group"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Group ID")
    var groupId: String

    init() {}
    init(_ groupId: String) { self.groupId = groupId }

    func perform() async throws -> some IntentResult {
        AddTaskDraft.groupId = AddTaskDraft.groupId == groupId ? nil : groupId
        return .result()
    }
}

@available(iOS 26.0, *)
private struct AddTaskCardView: View {
    let title: String
    let due: TaskDueChoice
    let groups: [SiriTaskGroup]
    let groupId: String?

    private static let violet = Color(red: 0x7C / 255, green: 0x3A / 255, blue: 0xED / 255)
    private static let dueChoices: [(TaskDueChoice, String)] = [
        (.none, "No date"), (.today, "Today"), (.tomorrow, "Tomorrow"),
        (.nextWeek, "In a week"), (.pick, "Pick a date…"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.headline)
                .lineLimit(2)
            Text("Due")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            ChipFlow {
                ForEach(Self.dueChoices, id: \.0) { item in
                    Button(intent: ChooseTaskDueIntent(item.0)) {
                        chip(item.1, systemImage: nil, selected: due == item.0)
                    }
                    .buttonStyle(.plain)
                }
            }
            if !groups.isEmpty {
                Text("Group")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                ChipFlow {
                    ForEach(groups, id: \.id) { g in
                        Button(intent: ChooseTaskGroupIntent(g.id)) {
                            chip(g.name, systemImage: sfSymbol(for: g.icon), selected: groupId == g.id)
                        }
                        .buttonStyle(.plain)
                    }
                }
                if groupId == nil {
                    Text("Skip it and Ripple picks one.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
    }

    private func chip(_ label: String, systemImage: String?, selected: Bool) -> some View {
        HStack(spacing: 4) {
            if let s = systemImage { Image(systemName: s).font(.caption) }
            Text(label).font(.subheadline.weight(selected ? .semibold : .regular))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .foregroundStyle(selected ? Color.white : Color.primary)
        .background(Capsule().fill(selected ? Self.violet : Color.secondary.opacity(0.15)))
    }
}

/// Ionicons name (what the app stores) → SF Symbol for the card.
@available(iOS 16.0, *)
private func sfSymbol(for ionicon: String) -> String {
    switch ionicon {
    case "briefcase": return "briefcase.fill"
    case "person": return "person.fill"
    case "heart": return "heart.fill"
    case "cart": return "cart.fill"
    case "home": return "house.fill"
    case "people": return "person.2.fill"
    case "school": return "graduationcap.fill"
    case "barbell": return "dumbbell.fill"
    case "cash": return "dollarsign.circle.fill"
    case "airplane": return "airplane"
    case "book": return "book.fill"
    case "leaf": return "leaf.fill"
    case "paw": return "pawprint.fill"
    case "car": return "car.fill"
    case "star": return "star.fill"
    default: return "circle.fill"
    }
}

/// Wraps chips onto new lines (SwiftUI has no built-in flow layout).
@available(iOS 16.0, *)
private struct ChipFlow: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            maxX = max(maxX, x - spacing)
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: min(maxX, width), height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
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
        SetupStamp.mark(SetupStamp.siriKey)
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
        SetupStamp.mark(SetupStamp.siriKey)
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
                "Start a recording in \(.applicationName)",
                "Record an entry in \(.applicationName)",
                "New entry in \(.applicationName)",
                "Start journaling in \(.applicationName)",
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
