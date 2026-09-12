//
//  RippleShortcuts.swift
//  Ripple — App Intents keystone (thin slice)
//
//  ── What this file is ────────────────────────────────────────────────
//  A single App Intent + an AppShortcutsProvider that registers it with the
//  system. Once the app is installed, iOS surfaces this intent WITHOUT the
//  user configuring anything:
//    - Siri:      "Start a debrief in Ripple"
//    - Spotlight: search "debrief" → the action appears
//    - Shortcuts: the action is available as a building block
//    - Action Button / Back Tap: selectable as an app action
//
//  It is the native front door to the SAME primitive the Shortcuts "Open URL"
//  recipe already uses — the `acuity://record?autostart=1` deep link
//  (see apps/mobile/lib/record-deeplink.ts). This intent just makes that door
//  first-class and voice-addressable instead of something the user has to hand-
//  build in the Shortcuts app.
//
//  ── The microphone constraint (why perform() opens the app) ──────────
//  iOS does NOT grant the microphone to an App Intent running out of process.
//  Anything that captures audio must bring the app to the foreground. So this
//  intent sets `openAppWhenRun = true` and hands off to the recorder via the
//  deep link — it saves the user taps and makes the action voice-triggerable;
//  it does not (and on iPhone cannot) record in the background. The only
//  surface that captures independently is an Apple Watch app. Keep that line
//  intact if you add more intents: text-only intents may run in the
//  background, but any mic intent must open the app.
//
//  ── Wiring ───────────────────────────────────────────────────────────
//  This is a plain Swift source file. It is copied into the generated Xcode
//  project and added to the app target's compile sources by the config plugin
//  apps/mobile/plugins/with-app-intents.js at prebuild time. There is no
//  separate extension and no new entitlement — an AppShortcutsProvider
//  compiled into the main app target is all iOS needs to register the phrases.
//

import AppIntents
import UIKit

/// The canonical deep link into the recorder with autostart armed.
/// Must stay in sync with `RECORD_AUTOSTART_URL` in
/// apps/mobile/lib/record-deeplink.ts.
private let recordAutostartURL = "acuity://record?autostart=1"

/// Deep links for the other keystone intents. These map 1:1 to expo-router
/// routes that already exist (apps/mobile/app/habits.tsx and
/// apps/mobile/app/insights/ask.tsx), so opening them needs no new native
/// target — the app's existing linking handles the navigation.
private let habitsURL = "acuity://habits"
private let askRippleURL = "acuity://insights/ask"

/// Open a deep link on the main actor. Shared by every intent so the
/// open-app-and-route behaviour stays identical across them.
@available(iOS 16.0, *)
@MainActor
private func openRippleURL(_ raw: String) async {
    if let url = URL(string: raw) {
        await UIApplication.shared.open(url)
    }
}

@available(iOS 16.0, *)
struct StartDebriefIntent: AppIntent {
    /// Shown in the Shortcuts editor and Spotlight.
    static var title: LocalizedStringResource = "Start a Debrief"

    static var description = IntentDescription(
        "Opens Ripple and immediately starts recording a voice debrief."
    )

    /// Bring the app to the foreground. Required: the recorder needs the
    /// microphone, which iOS will not grant to an out-of-process intent.
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        await openRippleURL(recordAutostartURL)
        return .result()
    }
}

@available(iOS 16.0, *)
struct CheckHabitsIntent: AppIntent {
    static var title: LocalizedStringResource = "Check My Habits"

    static var description = IntentDescription(
        "Opens Ripple's habit tracker so you can check off today's habits."
    )

    // Opening a screen, not the mic — but still foreground the app so the
    // user lands on the habits list ready to tap.
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
struct RippleAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartDebriefIntent(),
            phrases: [
                "Start a debrief in \(.applicationName)",
                "Start a \(.applicationName) debrief",
                "New debrief in \(.applicationName)",
            ],
            shortTitle: "Start a Debrief",
            systemImageName: "mic.fill"
        )
        AppShortcut(
            intent: CheckHabitsIntent(),
            phrases: [
                "Check my habits in \(.applicationName)",
                "Open habits in \(.applicationName)",
            ],
            shortTitle: "Check My Habits",
            systemImageName: "checkmark.circle.fill"
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
    }
}
