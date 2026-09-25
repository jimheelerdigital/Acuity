import SwiftUI

// Ripple watchOS app entry (1.9).
//
// The watch is the one surface that captures audio independently of the phone,
// so its headline job is a wrist debrief; it also shows today's habits + streak
// and lets you check a habit off. All of it runs against the Ripple API using a
// session token handed over from the phone via WatchConnectivity (see
// WatchSession) — an App Group can't bridge phone↔watch (separate devices).
//
// UNVERIFIED until an EAS build installs this on a paired Apple Watch. Written
// to compile cleanly by inspection; watchOS behavior (mic permission, WCSession
// activation timing, upload over cellular) can only be confirmed on-device.

@main
struct RippleWatchApp: App {
    @StateObject private var session = WatchSession.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(session)
                .tint(Color("AccentColor"))
        }
    }
}
