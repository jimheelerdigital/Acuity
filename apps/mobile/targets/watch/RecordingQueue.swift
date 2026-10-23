import Foundation

// Offline-first debrief queue (watch). A recording is ALWAYS persisted to disk
// the moment you stop — so capturing never depends on signal or the phone. Upload
// happens opportunistically: right after recording, on app foreground, and
// whenever a token is present + the network works. Failed uploads stay queued and
// retry later; nothing is lost.
//
// Storage: Application Support/pending-recordings/debrief_<epochMillis>_<dur>.m4a
// (duration encoded in the filename — no sidecar needed).

@MainActor
final class RecordingQueue: ObservableObject {
    static let shared = RecordingQueue()

    @Published private(set) var pendingCount = 0

    private let dir: URL

    private init() {
        let base = FileManager.default.urls(
            for: .applicationSupportDirectory, in: .userDomainMask
        )[0]
        dir = base.appendingPathComponent("pending-recordings", isDirectory: true)
        try? FileManager.default.createDirectory(
            at: dir, withIntermediateDirectories: true
        )
        refresh()
    }

    /// Persist a just-finished recording. Moves the temp file into the queue so a
    /// later cleanup can't delete it. Best-effort copy fallback.
    func enqueue(fileURL: URL, duration: Int) {
        let millis = Int(Date().timeIntervalSince1970 * 1000)
        let dest = dir.appendingPathComponent("debrief_\(millis)_\(duration).m4a")
        if FileManager.default.fileExists(atPath: dest.path) {
            try? FileManager.default.removeItem(at: dest)
        }
        do {
            try FileManager.default.moveItem(at: fileURL, to: dest)
        } catch {
            try? FileManager.default.copyItem(at: fileURL, to: dest)
        }
        refresh()
    }

    /// Upload every pending recording; remove each on success, stop on the first
    /// failure (usually no network) and keep the rest for a later retry.
    ///
    /// 1.9.6: a recording the server will NEVER accept (400 bad/empty audio,
    /// 413 too large, 415 unsupported type) is dropped instead of blocking
    /// every recording behind it forever. 401/402/429/5xx and network errors
    /// are temporary — kept for the next try.
    func drain(using api: RippleAPI) async {
        for url in items() {
            do {
                try await api.uploadRecording(
                    fileURL: url, durationSeconds: Self.duration(of: url)
                )
                try? FileManager.default.removeItem(at: url)
                refresh()
            } catch RippleAPIError.http(401) {
                // Signed out on the phone / token revoked: keep the recording,
                // drop the token so the phone hands over a fresh one.
                WatchSession.shared.handleUnauthorized()
                break
            } catch RippleAPIError.http(let code) where Self.permanent.contains(code) {
                try? FileManager.default.removeItem(at: url)
                refresh()
            } catch {
                break
            }
        }
        refresh()
    }

    private static let permanent: Set<Int> = [400, 413, 415]

    func refresh() {
        pendingCount = items().count
    }

    private func items() -> [URL] {
        let urls = (try? FileManager.default.contentsOfDirectory(
            at: dir, includingPropertiesForKeys: nil
        )) ?? []
        return urls
            .filter { $0.pathExtension == "m4a" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent } // FIFO by timestamp
    }

    private static func duration(of url: URL) -> Int {
        let parts = url.deletingPathExtension().lastPathComponent.split(separator: "_")
        if parts.count >= 3, let d = Int(parts[2]) { return d }
        return 0
    }
}
