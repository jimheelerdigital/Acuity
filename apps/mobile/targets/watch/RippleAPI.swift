import Foundation

// Watch-side Ripple API client. Uses the token handed over from the phone
// (WatchSession) as a bearer credential — the same `getAnySessionUserId` bearer
// path the mobile app uses. Endpoints/contracts mirror the app exactly:
//   • POST /api/habits/{id}/check   body { localDate, checked }
//   • POST /api/record              multipart: audio (m4a) + durationSeconds
//
// UNVERIFIED until an on-watch build. Cellular uploads especially need device
// testing (watch URLSession background config is a likely future refinement).

enum RippleAPIError: Error {
    case notSignedIn
    case http(Int)
    case transport(String)
}

struct RippleAPI {
    let apiBase: String
    let token: String

    private func request(_ path: String) -> URLRequest {
        var req = URLRequest(url: URL(string: apiBase + path)!)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("watchos", forHTTPHeaderField: "X-Platform")
        return req
    }

    /// `YYYY-MM-DD` in the watch's local zone — matches the app's habit-check contract.
    static func todayLocalDate() -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    // MARK: Reads (Growth + Tasks) — same bearer path, live from the API.

    /// GET /api/habits → { habits: [{id,name,...}], checks: [{habitId,localDate}] }.
    /// A habit is "done today" when a check exists for today's localDate.
    func fetchHabits() async throws -> [WatchHabit] {
        var req = request("/api/habits")
        req.httpMethod = "GET"
        let (data, resp) = try await URLSession.shared.data(for: req)
        try Self.ensureOK(resp)
        let decoded = try JSONDecoder().decode(HabitsDTO.self, from: data)
        let today = Self.todayLocalDate()
        let doneToday = Set(
            decoded.checks.filter { $0.localDate == today }.map { $0.habitId }
        )
        return decoded.habits.map {
            WatchHabit(id: $0.id, name: $0.name, done: doneToday.contains($0.id))
        }
    }

    /// GET /api/goals → { goals: [{id,title,progress,lifeArea,status}] }.
    func fetchGoals() async throws -> [WatchGoal] {
        var req = request("/api/goals")
        req.httpMethod = "GET"
        let (data, resp) = try await URLSession.shared.data(for: req)
        try Self.ensureOK(resp)
        let decoded = try JSONDecoder().decode(GoalsDTO.self, from: data)
        return decoded.goals.map {
            WatchGoal(
                id: $0.id,
                title: $0.title,
                progress: $0.progress ?? 0,
                lifeArea: $0.lifeArea,
                status: $0.status
            )
        }
    }

    /// GET /api/tasks → open tasks (server excludes DONE by default).
    func fetchTasks() async throws -> [WatchTask] {
        var req = request("/api/tasks")
        req.httpMethod = "GET"
        let (data, resp) = try await URLSession.shared.data(for: req)
        try Self.ensureOK(resp)
        let decoded = try JSONDecoder().decode(TasksDTO.self, from: data)
        return decoded.tasks.compactMap { t in
            let label = t.title ?? t.text
            guard let label, !label.isEmpty else { return nil }
            return WatchTask(id: t.id, title: label, priority: t.priority)
        }
    }

    /// PATCH /api/tasks { id, action: "complete" } — the app's own contract.
    func completeTask(id: String) async throws {
        var req = request("/api/tasks")
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(
            withJSONObject: ["id": id, "action": "complete"]
        )
        let (_, resp) = try await URLSession.shared.data(for: req)
        try Self.ensureOK(resp)
    }

    func checkHabit(id: String, checked: Bool) async throws {
        var req = request("/api/habits/\(id)/check")
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = [
            "localDate": Self.todayLocalDate(),
            "checked": checked,
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, resp) = try await URLSession.shared.data(for: req)
        try Self.ensureOK(resp)
    }

    /// Multipart upload of a recorded debrief. Mirrors app/record.tsx's
    /// FormData: field `audio` (m4a) + `durationSeconds`.
    func uploadRecording(fileURL: URL, durationSeconds: Int) async throws {
        var req = request("/api/record")
        req.httpMethod = "POST"
        let boundary = "ripple-\(UUID().uuidString)"
        req.setValue(
            "multipart/form-data; boundary=\(boundary)",
            forHTTPHeaderField: "Content-Type"
        )

        var data = Data()
        func field(_ name: String, _ value: String) {
            data.append("--\(boundary)\r\n".data(using: .utf8)!)
            data.append(
                "Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n"
                    .data(using: .utf8)!)
            data.append("\(value)\r\n".data(using: .utf8)!)
        }
        field("durationSeconds", String(durationSeconds))

        let audio = try Data(contentsOf: fileURL)
        data.append("--\(boundary)\r\n".data(using: .utf8)!)
        data.append(
            "Content-Disposition: form-data; name=\"audio\"; filename=\"debrief.m4a\"\r\n"
                .data(using: .utf8)!)
        data.append("Content-Type: audio/mp4\r\n\r\n".data(using: .utf8)!)
        data.append(audio)
        data.append("\r\n".data(using: .utf8)!)
        data.append("--\(boundary)--\r\n".data(using: .utf8)!)

        let (_, resp) = try await URLSession.shared.upload(for: req, from: data)
        try Self.ensureOK(resp)
    }

    private static func ensureOK(_ resp: URLResponse) throws {
        guard let http = resp as? HTTPURLResponse else {
            throw RippleAPIError.transport("no response")
        }
        guard (200..<300).contains(http.statusCode) else {
            throw RippleAPIError.http(http.statusCode)
        }
    }
}

// MARK: - Watch domain models (shared across views)

struct WatchGoal: Identifiable, Equatable {
    let id: String
    let title: String
    /// 0–100 integer (Goal.progress is an Int in the schema).
    let progress: Int
    let lifeArea: String?
    let status: String?
}

struct WatchTask: Identifiable, Equatable {
    let id: String
    let title: String
    let priority: String?
}

// MARK: - Wire DTOs (decode only the fields the watch needs)

private struct HabitsDTO: Decodable {
    struct Habit: Decodable { let id: String; let name: String }
    struct Check: Decodable { let habitId: String; let localDate: String }
    let habits: [Habit]
    let checks: [Check]
}

private struct GoalsDTO: Decodable {
    struct Goal: Decodable {
        let id: String
        let title: String
        let progress: Int?
        let lifeArea: String?
        let status: String?
    }
    let goals: [Goal]
}

private struct TasksDTO: Decodable {
    struct Task: Decodable {
        let id: String
        let title: String?
        let text: String?
        let priority: String?
    }
    let tasks: [Task]
}
