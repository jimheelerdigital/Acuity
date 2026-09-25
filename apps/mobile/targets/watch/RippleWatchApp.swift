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

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(session)
                .environmentObject(router)
                .tint(session.primary)
        }
    }
}
