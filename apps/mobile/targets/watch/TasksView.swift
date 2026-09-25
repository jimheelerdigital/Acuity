import SwiftUI

// Tasks (watch) — your open tasks, tap to complete. Fetches live with the
// cached bearer token (GET /api/tasks returns non-DONE by default) and
// completes via PATCH /api/tasks { id, action: "complete" }.

struct TasksView: View {
    @EnvironmentObject var session: WatchSession

    @State private var tasks: [WatchTask] = []
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
                        .foregroundStyle(Color("AccentColor"))
                    Text("All clear").font(.headline)
                    Text("No open tasks").font(.caption2).foregroundStyle(.secondary)
                }
            } else {
                ForEach(tasks) { task in
                    TaskRow(task: task) { await complete(task) }
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
        } catch {
            failed = true
        }
        loading = false
    }

    private func complete(_ task: WatchTask) async {
        guard let token = session.token else { return }
        // Optimistic removal from the open list.
        let snapshot = tasks
        tasks.removeAll { $0.id == task.id }
        let api = RippleAPI(apiBase: session.apiBase, token: token)
        do {
            try await api.completeTask(id: task.id)
        } catch {
            tasks = snapshot // restore on failure
        }
    }
}

private struct TaskRow: View {
    let task: WatchTask
    let onComplete: () async -> Void
    @State private var busy = false

    var body: some View {
        Button {
            guard !busy else { return }
            busy = true
            Task { await onComplete(); busy = false }
        } label: {
            HStack {
                Image(systemName: "circle")
                    .foregroundStyle(.secondary)
                Text(task.title).font(.subheadline)
                Spacer()
                if busy { ProgressView() }
            }
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }
}
