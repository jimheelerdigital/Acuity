import SwiftUI

// Watch shell — mirrors the phone's layout: a 3-page swipe with Record in the
// center (mic/orb), Tasks to the left, Growth to the right. Shows an "open Ripple
// on your phone" nudge until the phone has handed a token over WatchConnectivity;
// once the token is cached the watch works on its own.

struct ContentView: View {
    @EnvironmentObject var session: WatchSession
    @EnvironmentObject var router: RecordRouter

    var body: some View {
        if session.isSignedIn {
            TabView(selection: $router.selectedTab) {
                NavigationStack { TasksView() }
                    .tag(0)
                RecordView()
                    .tag(1)
                NavigationStack { GrowthView() }
                    .tag(2)
            }
            .tabViewStyle(.page)
        } else {
            needsPhone
        }
    }

    private var needsPhone: some View {
        VStack(spacing: 8) {
            Image(systemName: "iphone.and.arrow.forward")
                .font(.title2)
                .foregroundStyle(session.primary)
            Text("Open Ripple on your phone")
                .font(.headline)
                .multilineTextAlignment(.center)
            Text("Sign in there once and your watch connects automatically.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}
