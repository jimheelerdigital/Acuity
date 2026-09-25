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
