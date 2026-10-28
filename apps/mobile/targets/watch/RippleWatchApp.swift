import SwiftUI
import WidgetKit

// Ripple watchOS app entry (1.9).
//
// The watch mirrors the phone: a 3-page swipe (Tasks · Record · Growth) with a
// morphing record orb in the center, colored by the user's palette. All of it
// runs against the Ripple API using a session token handed over from the phone
// via WatchConnectivity (WatchSession) — an App Group can't bridge phone↔watch.
//
// Action Button / Siri: StartDebriefIntent (WatchIntents.swift) routes through
// RecordRouter to open the record page and start.
//
// Watch-face complication (targets/watch-widget): taps open
// ripplewatch://record, handled in onOpenURL below → same RecordRouter path.

@main
struct RippleWatchApp: App {
    @StateObject private var session = WatchSession.shared
    @StateObject private var router = RecordRouter.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(session)
                .environmentObject(router)
                .tint(session.primary)
                // Complication tap → record page, start a debrief. Signed out
                // the watch shows "Open Ripple on your phone" instead, so don't
                // leave a pending start that would fire later by surprise.
                .onOpenURL { url in
                    guard url.scheme == "ripplewatch", url.host == "record" else { return }
                    if session.isSignedIn { router.requestRecord() }
                }
        }
        // Coming back to the app: retry queued uploads, re-ask the phone for
        // a token if we don't have one. Leaving it: refresh the complication
        // (habit checks / a debrief that ticks the reflection habit).
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { WidgetCenter.shared.reloadAllTimelines() }
            guard phase == .active else { return }
            if !session.isSignedIn { session.requestSnapshot() }
            Task { _ = await BackgroundUpload.drain() }
        }
        // Background retry while recordings are queued (BackgroundUpload).
        .backgroundTask(.appRefresh(BackgroundUpload.id)) {
            let empty = await BackgroundUpload.drain()
            if !empty { await MainActor.run { BackgroundUpload.schedule() } }
        }
    }
}
