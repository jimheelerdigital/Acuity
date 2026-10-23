import SwiftUI

// Growth (watch) — mirrors the phone's "Growth" tab: Habits + Goals in one
// scrolling screen. Fetches live from the API with the cached bearer token
// (fresh data + real ids + real streak), rather than the WCSession snapshot.
//
//   • Habits — tap to check off today (POST /api/habits/{id}/check).
//   • Goals  — read-only, with a progress bar (GET /api/goals; progress 0–100).

struct GrowthView: View {
    @EnvironmentObject var session: WatchSession

    @State private var habits: [WatchHabit] = []
    @State private var goals: [WatchGoal] = []
    @State private var loading = true
    @State private var failed = false

    var body: some View {
        List {
            if loading {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else if failed {
                retry
            } else {
                habitsSection
                goalsSection
            }
        }
        .navigationTitle("Growth")
        .task { await load() }
    }

    private var habitsSection: some View {
        Section("Habits") {
            if habits.isEmpty {
                Text("No habits yet").font(.caption).foregroundStyle(.secondary)
            } else {
                ForEach(habits) { habit in
                    GrowthHabitRow(habit: habit) { await check(habit) }
                }
            }
        }
    }

    private var goalsSection: some View {
        Section("Goals") {
            if goals.isEmpty {
                Text("No goals yet").font(.caption).foregroundStyle(.secondary)
            } else {
                ForEach(goals) { goal in
                    GoalRow(goal: goal)
                }
            }
        }
    }

    private var retry: some View {
        VStack(spacing: 6) {
            Text("Couldn't load").font(.headline)
            Button("Try again") { Task { await load() } }
                .font(.caption)
        }
    }

    private func load() async {
        guard let token = session.token else { return }
        loading = true
        failed = false
        let api = RippleAPI(apiBase: session.apiBase, token: token)
        // Independent: one list failing (e.g. habits switched off) shouldn't
        // hide the other. Only a total failure shows "Couldn't load".
        async let h = Self.attempt { try await api.fetchHabits() }
        async let g = Self.attempt { try await api.fetchGoals() }
        let (hr, gr) = await (h, g)
        if case .failure(RippleAPIError.http(401)) = gr {
            session.handleUnauthorized() // token rejected → back to "open on phone"
            loading = false
            return
        }
        let fetchedHabits = try? hr.get()
        let fetchedGoals = try? gr.get()
        habits = fetchedHabits ?? []
        goals = fetchedGoals ?? []
        failed = fetchedHabits == nil && fetchedGoals == nil
        loading = false
    }

    private static func attempt<T>(_ f: () async throws -> T) async -> Result<T, Error> {
        do { return .success(try await f()) } catch { return .failure(error) }
    }

    private func check(_ habit: WatchHabit) async {
        guard !habit.done, let token = session.token else { return }
        // Optimistic flip.
        if let i = habits.firstIndex(where: { $0.id == habit.id }) {
            habits[i].done = true
        }
        let api = RippleAPI(apiBase: session.apiBase, token: token)
        Haptics.click()
        do {
            try await api.checkHabit(id: habit.id, checked: true)
            Haptics.success()
        } catch {
            Haptics.failure()
            // Revert on failure so the user can retry.
            if let i = habits.firstIndex(where: { $0.id == habit.id }) {
                habits[i].done = false
            }
        }
    }
}

private struct GrowthHabitRow: View {
    @EnvironmentObject var session: WatchSession
    let habit: WatchHabit
    let onTap: () async -> Void
    @State private var busy = false

    var body: some View {
        Button {
            guard !habit.done, !busy else { return }
            busy = true
            Task { await onTap(); busy = false }
        } label: {
            HStack {
                Image(systemName: habit.done ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(habit.done ? session.primary : .secondary)
                Text(habit.name).font(.subheadline)
                Spacer()
                if busy { ProgressView() }
            }
        }
        .buttonStyle(.plain)
        .disabled(habit.done || busy)
        .accessibilityLabel(habit.name)
        .accessibilityValue(habit.done ? "Done today" : "Not done today")
        .accessibilityHint(habit.done ? "" : "Double-tap to check off for today")
    }
}

private struct GoalRow: View {
    @EnvironmentObject var session: WatchSession
    let goal: WatchGoal

    private var fraction: Double {
        Double(min(max(goal.progress, 0), 100)) / 100.0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(goal.title).font(.subheadline)
            ProgressView(value: fraction)
                .tint(session.primary)
            HStack {
                if let area = goal.lifeArea, !area.isEmpty {
                    Text(area).font(.caption2).foregroundStyle(.secondary)
                }
                Spacer()
                Text("\(min(max(goal.progress, 0), 100))%")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(goal.title)
        .accessibilityValue("\(min(max(goal.progress, 0), 100)) percent")
    }
}
