import Foundation
import WatchKit

// Background retry for queued debriefs (1.9.6 watch polish).
//
// A recording that couldn't upload right away (no signal, phone away) used
// to wait until the next time the app was opened. Now, while anything is
// queued, we ask watchOS for a background refresh; RippleWatchApp's
// `.backgroundTask(.appRefresh(BackgroundUpload.id))` drains the queue
// when it fires and re-schedules if items remain. watchOS decides the
// exact timing (budgeted, usually within the hour) — best effort, on top
// of the existing drains on open / record / foreground.
enum BackgroundUpload {
    static let id = "ripple-upload"

    static func schedule(after seconds: TimeInterval = 15 * 60) {
        WKApplication.shared().scheduleBackgroundRefresh(
            withPreferredDate: Date().addingTimeInterval(seconds),
            userInfo: id as NSString
        ) { _ in }
    }

    /// Drain once; returns true when the queue is empty afterwards.
    @MainActor
    static func drain() async -> Bool {
        let queue = RecordingQueue.shared
        let session = WatchSession.shared
        queue.refresh()
        guard queue.pendingCount > 0 else { return true }
        guard let token = session.token else { return false }
        await queue.drain(using: RippleAPI(apiBase: session.apiBase, token: token))
        return queue.pendingCount == 0
    }
}
