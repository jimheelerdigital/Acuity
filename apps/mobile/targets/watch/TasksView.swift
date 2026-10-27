import SwiftUI

// Tasks (watch) — your open tasks, tap to complete. Fetches live with the
// cached bearer token (GET /api/tasks returns non-DONE by default) and
// completes via PATCH /api/tasks { id, action: "complete" }.
//
// A completed task stays in the list struck through, like the phone
// (Jimmy, 2026-10-27); it used to vanish on tap. Tapping it again
// reopens it (PATCH action "reopen"). The next load drops it, since the
// server only returns open tasks.

struct TasksView: View {
    @EnvironmentObject var session: WatchSession

    @State private var tasks: [WatchTask] = []
    @State private var doneIds: Set<String> = []
    @State private var loading = true
    @State private var failed = false

    var body: some View {
        List {
            if loading {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else if failed {
                VStack(spacing: 6) {
                    Text("Couldn't load").font(.headline)
                    Button("Try again") { Task { await load() } }.font(.caption)
                }
            } else if tasks.isEmpty {
                VStack(spacing: 6) {
                    Image(systemName: "checkmark.circle")
                        .font(.title3)
                        .foregroundStyle(session.primary)
                    Text("All clear").font(.headline)
                    Text("No open tasks").font(.caption2).foregroundStyle(.secondary)
                }
            } else {
                ForEach(tasks) { task in
                    TaskRow(
                        task: task,
                        done: doneIds.contains(task.id),
                        accent: session.primary
                    ) { await toggle(task) }
                }
            }
        }
        .navigationTitle("Tasks")
        .task { await load() }
    }

    private func load() async {
        guard let token = session.token else { return }
        loading = true
        failed = false
        let api = RippleAPI(apiBase: session.apiBase, token: token)
        do {
            tasks = try await api.fetchTasks()
            doneIds = []
        } catch RippleAPIError.http(401) {
            session.handleUnauthorized()
        } catch {
            failed = true
        }
        loading = false
    }

    /// Complete an open task, or reopen one completed in this session.
    /// Optimistic: the row strikes through (or un-strikes) immediately and
    /// reverts if the server call fails.
    private func toggle(_ task: WatchTask) async {
        guard let token = session.token else { return }
        let wasDone = doneIds.contains(task.id)
        if wasDone { doneIds.remove(task.id) } else { doneIds.insert(task.id) }
        let api = RippleAPI(apiBase: session.apiBase, token: token)
        Haptics.click()
        do {
            if wasDone {
                try await api.reopenTask(id: task.id)
            } else {
                try await api.completeTask(id: task.id)
                Haptics.success()
            }
        } catch {
            if wasDone { doneIds.insert(task.id) } else { doneIds.remove(task.id) }
            Haptics.failure()
        }
    }
}

private struct TaskRow: View {
    let task: WatchTask
    let done: Bool
    let accent: Color
    let onToggle: () async -> Void
    @State private var busy = false

    var body: some View {
        Button {
            guard !busy else { return }
            busy = true
            Task { await onToggle(); busy = false }
        } label: {
            HStack {
                Image(systemName: done ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(done ? accent : .secondary)
                Text(task.title)
                    .font(.subheadline)
                    .strikethrough(done, color: .secondary)
                    .foregroundStyle(done ? .secondary : .primary)
                Spacer()
                if busy { ProgressView() }
            }
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .accessibilityLabel(done ? "\(task.title), completed" : task.title)
        .accessibilityHint(done ? "Double-tap to reopen" : "Double-tap to complete")
    }
}
