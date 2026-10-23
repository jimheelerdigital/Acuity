import SwiftUI

// Ripple watchOS app entry (1.9).
//
// The watch mirrors the phone: a 3-page swipe (Tasks · Record · Growth) with a
// morphing record orb in the center, colored by the user's palette. All of it
// runs against the Ripple API using a session token handed over from the phone
// via WatchConnectivity (WatchSession) — an App Group can't bridge phone↔watch.
//
// Action Button / Siri: StartDebriefIntent (WatchIntents.swift) routes through
// RecordRouter to open the record page and start.

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
        }
        // Coming back to the app: retry queued uploads, re-ask the phone for
        // a token if we don't have one.
        .onChange(of: scenePhase) { _, phase in
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
