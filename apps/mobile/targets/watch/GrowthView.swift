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
        do {
            async let h = api.fetchHabits()
            async let g = api.fetchGoals()
            let (fetchedHabits, fetchedGoals) = try await (h, g)
            habits = fetchedHabits
            goals = fetchedGoals
        } catch {
            failed = true
        }
        loading = false
    }

    private func check(_ habit: WatchHabit) async {
        guard !habit.done, let token = session.token else { return }
        // Optimistic flip.
        if let i = habits.firstIndex(where: { $0.id == habit.id }) {
            habits[i].done = true
        }
        let api = RippleAPI(apiBase: session.apiBase, token: token)
        do {
            try await api.checkHabit(id: habit.id, checked: true)
        } catch {
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
    }
}
