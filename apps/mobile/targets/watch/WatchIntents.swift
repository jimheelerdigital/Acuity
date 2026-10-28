import AppIntents
import SwiftUI

// Action Button + Siri entry point for the watch. `StartDebriefIntent` opens the
// app and jumps straight into recording. Exposed via AppShortcutsProvider so it
// shows up under Watch Settings → Action Button → Shortcut (the user assigns it;
// no app can claim the button itself — Apple requires the user to pick it).
//
// Apple ref: "Responding to the Action button on Apple Watch Ultra".

/// Routes an external "start a debrief" request (Action Button / Siri) to the
/// record page. ContentView binds the TabView selection to `selectedTab`, and
/// RecordView watches `recordTrigger` to auto-start.
@MainActor
final class RecordRouter: ObservableObject {
    static let shared = RecordRouter()
    private init() {}

    /// 0 = Tasks, 1 = Record (center, default), 2 = Growth.
    @Published var selectedTab: Int = 1
    /// Bumped to request an immediate recording start.
    @Published var recordTrigger: Int = 0
    /// Set with each request, cleared by RecordView when it starts. Covers a
    /// cold launch (complication tap / intent): the trigger is bumped before
    /// RecordView exists, so its onChange never sees it — onAppear does.
    private var pendingStart = false

    func requestRecord() {
        selectedTab = 1
        pendingStart = true
        recordTrigger &+= 1
    }

    /// True once per request.
    func consumePendingStart() -> Bool {
        guard pendingStart else { return false }
        pendingStart = false
        return true
    }
}

struct StartDebriefIntent: AppIntent {
    static let title: LocalizedStringResource = "Start a Debrief"
    static let description = IntentDescription("Open Ripple on your watch and start recording a debrief.")
    static let openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        RecordRouter.shared.requestRecord()
        return .result()
    }
}

struct RippleWatchShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartDebriefIntent(),
            phrases: [
                "Start a debrief in \(.applicationName)",
                "Record a debrief in \(.applicationName)",
                "Start a check-in in \(.applicationName)",
            ],
            shortTitle: "Start Debrief",
            systemImageName: "mic.fill"
        )
    }
}
