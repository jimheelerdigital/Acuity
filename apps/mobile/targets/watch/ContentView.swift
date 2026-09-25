import SwiftUI

// Watch home: streak + today's habits (tap to check) + the wrist-debrief entry
// point. Shows a "open Ripple on your phone" nudge until the phone has handed a
// token over WatchConnectivity.

struct ContentView: View {
    @EnvironmentObject var session: WatchSession

    var body: some View {
        NavigationStack {
            if session.isSignedIn {
                signedInList
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

    private var signedInList: some View {
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

            Section("Today") {
                HStack {
                    Image(systemName: "flame.fill").foregroundStyle(Color("AccentColor"))
                    Text("\(session.streak)-day streak")
                        .font(.subheadline.weight(.semibold))
                }
                if session.habits.isEmpty {
                    Text("No habits for today")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(session.habits) { habit in
                        HabitRow(habit: habit)
                    }
                }
            }
        }
        .navigationTitle("Ripple")
    }
}

// One tappable habit row — optimistic check, POSTs to the API.
private struct HabitRow: View {
    @EnvironmentObject var session: WatchSession
    let habit: WatchHabit
    @State private var busy = false

    var body: some View {
        Button {
            guard !habit.done, !busy else { return }
            check()
        } label: {
            HStack {
                Image(systemName: habit.done ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(habit.done ? Color("AccentColor") : .secondary)
                Text(habit.name).font(.subheadline)
                Spacer()
                if busy { ProgressView() }
            }
        }
        .buttonStyle(.plain)
        .disabled(habit.done || busy)
    }

    private func check() {
        guard let token = session.token else { return }
        busy = true
        let api = RippleAPI(apiBase: session.apiBase, token: token)
        Task {
            do {
                try await api.checkHabit(id: habit.id, checked: true)
                session.markHabitDoneLocally(habit.id)
            } catch {
                // Leave it unchecked so the user can retry; watchOS haptic could
                // signal failure in a later pass.
            }
            busy = false
        }
    }
}
