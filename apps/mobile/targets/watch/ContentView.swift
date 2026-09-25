import SwiftUI

// Watch home: the hub. Record (hero) + a streak glance + drill-ins to Growth
// (habits + goals, mirroring the phone) and Tasks. Shows an "open Ripple on your
// phone" nudge until the phone has handed a token over WatchConnectivity; once
// the token is cached the watch works on its own.

struct ContentView: View {
    @EnvironmentObject var session: WatchSession

    var body: some View {
        NavigationStack {
            if session.isSignedIn {
                home
            } else {
                needsPhone
            }
        }
    }

    private var needsPhone: some View {
        VStack(spacing: 8) {
            Image(systemName: "iphone.and.arrow.forward")
                .font(.title2)
                .foregroundStyle(Color("AccentColor"))
            Text("Open Ripple on your phone")
                .font(.headline)
                .multilineTextAlignment(.center)
            Text("Sign in there once and your watch connects automatically.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
        .navigationTitle("Ripple")
    }

    private var home: some View {
        List {
            Section {
                NavigationLink {
                    RecordView()
                } label: {
                    Label("Record a debrief", systemImage: "mic.fill")
                        .font(.headline)
                }
                .listRowBackground(Color("AccentColor").opacity(0.25))
            }

            Section {
                NavigationLink {
                    GrowthView()
                } label: {
                    Label("Growth", systemImage: "chart.line.uptrend.xyaxis")
                }
                NavigationLink {
                    TasksView()
                } label: {
                    Label("Tasks", systemImage: "checklist")
                }
            }

            Section {
                HStack {
                    Image(systemName: "flame.fill").foregroundStyle(Color("AccentColor"))
                    Text("\(session.streak)-day streak")
                        .font(.subheadline.weight(.semibold))
                }
            }
        }
        .navigationTitle("Ripple")
    }
}
