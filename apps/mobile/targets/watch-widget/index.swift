import Foundation
import Security
import SwiftUI
import WidgetKit

// Ripple watch-face complication (WidgetKit, watchOS 10+).
//
// Every family taps through to the watch app's record page and starts a
// debrief: widgetURL ripplewatch://record → RippleWatchApp.onOpenURL →
// RecordRouter.requestRecord() (the same path the Action Button uses).
//
// Data: today's habit progress, fetched by the complication itself from
// GET /api/habits using the session token the watch app keeps in its Keychain
// (WatchKeychain.swift). There is no App Group on the watch (see
// expo-target.config.js), so the token is read through Keychain Sharing — the
// watch app's default access group is its application identifier, which
// RippleComplication.entitlements lists. Fetching here (instead of reading a
// snapshot the app wrote) means the count is right even if the watch app
// hasn't been opened today. The last good value is cached per day so a
// failed refresh (offline) doesn't blank the face; with no token, no habits,
// or no habits scheduled today it shows a plain branded mic.

private let RECORD_URL = URL(string: "ripplewatch://record")!
private let API_BASE = "https://goripple.io"

// Must match WatchKeychain.swift (service/account) and the watch app's
// application identifier. ZNF9ZJ4NVX = Apple team id ($(AppIdentifierPrefix)),
// hard-coded the same way the iOS widget hard-codes its shared group.
private let WATCH_KEYCHAIN_GROUP = "ZNF9ZJ4NVX.com.heelerdigital.acuity.watchkitapp"
private let WATCH_KEYCHAIN_SERVICE = "com.heelerdigital.acuity.watch"
private let WATCH_KEYCHAIN_ACCOUNT = "session-token"

// MARK: - Data

struct HabitProgress: Equatable {
    let done: Int
    let total: Int
    var allDone: Bool { total > 0 && done >= total }
}

struct ComplicationEntry: TimelineEntry {
    let date: Date
    /// nil → signed out / never loaded / no habits today → branded mic only.
    let progress: HabitProgress?
}

private enum ComplicationKeychain {
    static func token() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: WATCH_KEYCHAIN_SERVICE,
            kSecAttrAccount as String: WATCH_KEYCHAIN_ACCOUNT,
            kSecAttrAccessGroup as String: WATCH_KEYCHAIN_GROUP,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let token = String(data: data, encoding: .utf8), !token.isEmpty
        else { return nil }
        return token
    }
}

/// Decode only what the count needs. `daysActive` is 0=Sunday…6=Saturday
/// (prisma Habit.daysActive); an empty array means the habit is paused.
private struct HabitsDTO: Decodable {
    struct Habit: Decodable {
        let id: String
        let daysActive: [Int]?
    }
    struct Check: Decodable {
        let habitId: String
        let localDate: String
    }
    let habits: [Habit]
    let checks: [Check]
}

private enum ProgressSource {
    private static let cacheDateKey = "complication.progress.date"
    private static let cacheDoneKey = "complication.progress.done"
    private static let cacheTotalKey = "complication.progress.total"

    /// `YYYY-MM-DD` in the watch's zone — same contract as RippleAPI.todayLocalDate().
    static func localDate(_ date: Date = Date()) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    /// Live count, else today's cached count, else nil.
    static func load() async -> HabitProgress? {
        guard let token = ComplicationKeychain.token() else {
            clearCache() // signed out on the watch → don't keep showing stale numbers
            return nil
        }
        switch await fetch(token: token) {
        case .some(let live):
            save(live)
            return live.total > 0 ? live : nil
        case .none:
            return cachedForToday()
        }
    }

    /// nil = request failed (offline / server); a value (possibly total 0) = success.
    private static func fetch(token: String) async -> HabitProgress? {
        guard let url = URL(string: API_BASE + "/api/habits") else { return nil }
        var req = URLRequest(url: url, timeoutInterval: 15)
        req.httpMethod = "GET"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("watchos", forHTTPHeaderField: "X-Platform")
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse else { return nil }
            if http.statusCode == 401 || http.statusCode == 404 {
                // Token revoked, or habits switched off for this account.
                return HabitProgress(done: 0, total: 0)
            }
            guard (200..<300).contains(http.statusCode) else { return nil }
            let decoded = try JSONDecoder().decode(HabitsDTO.self, from: data)
            let now = Date()
            let today = localDate(now)
            let weekday = Calendar.current.component(.weekday, from: now) - 1 // 1…7 → 0…6
            let dueToday = decoded.habits.filter { ($0.daysActive ?? [weekday]).contains(weekday) }
            let dueIds = Set(dueToday.map(\.id))
            let doneIds = Set(
                decoded.checks
                    .filter { $0.localDate == today && dueIds.contains($0.habitId) }
                    .map(\.habitId)
            )
            return HabitProgress(done: doneIds.count, total: dueToday.count)
        } catch {
            return nil
        }
    }

    private static func save(_ p: HabitProgress) {
        let d = UserDefaults.standard
        d.set(localDate(), forKey: cacheDateKey)
        d.set(p.done, forKey: cacheDoneKey)
        d.set(p.total, forKey: cacheTotalKey)
    }

    private static func cachedForToday() -> HabitProgress? {
        let d = UserDefaults.standard
        guard d.string(forKey: cacheDateKey) == localDate() else { return nil }
        let total = d.integer(forKey: cacheTotalKey)
        guard total > 0 else { return nil }
        return HabitProgress(done: d.integer(forKey: cacheDoneKey), total: total)
    }

    private static func clearCache() {
        let d = UserDefaults.standard
        d.removeObject(forKey: cacheDateKey)
        d.removeObject(forKey: cacheDoneKey)
        d.removeObject(forKey: cacheTotalKey)
    }
}

// MARK: - Timeline

struct ComplicationProvider: TimelineProvider {
    func placeholder(in context: Context) -> ComplicationEntry {
        ComplicationEntry(date: Date(), progress: HabitProgress(done: 2, total: 3))
    }

    func getSnapshot(in context: Context, completion: @escaping (ComplicationEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
            return
        }
        Task {
            let progress = await ProgressSource.load()
            completion(ComplicationEntry(date: Date(), progress: progress))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ComplicationEntry>) -> Void) {
        Task {
            let now = Date()
            let progress = await ProgressSource.load()
            let cal = Calendar.current
            let midnight = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: now))
                ?? now.addingTimeInterval(24 * 60 * 60)
            var entries = [ComplicationEntry(date: now, progress: progress)]
            // Roll the count over at midnight even if the next refresh is late.
            if let p = progress {
                entries.append(ComplicationEntry(
                    date: midnight,
                    progress: HabitProgress(done: 0, total: p.total)
                ))
            }
            // Refresh every ~30 min (system budget permitting) and at midnight.
            // The watch app also reloads timelines when it checks a habit,
            // gets a token, or goes to the background.
            let next = min(now.addingTimeInterval(30 * 60), midnight)
            completion(Timeline(entries: entries, policy: .after(next)))
        }
    }
}

// MARK: - Views

private let accent = Color("AccentColor")

/// Circular: progress ring around a mic; plain mic when there's no data.
struct CircularComplicationView: View {
    let entry: ComplicationEntry
    var body: some View {
        if let p = entry.progress {
            Gauge(value: Double(min(p.done, p.total)), in: 0...Double(p.total)) {
                Image(systemName: "mic.fill")
            } currentValueLabel: {
                Image(systemName: p.allDone ? "checkmark" : "mic.fill")
                    .font(.system(size: 18, weight: .semibold))
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .tint(accent)
            .widgetAccentable()
            .accessibilityLabel("Ripple, \(p.done) of \(p.total) habits done. Start a debrief.")
        } else {
            Image(systemName: "mic.fill")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(accent)
                .widgetAccentable()
                .accessibilityLabel("Ripple. Start a debrief.")
        }
    }
}

/// Corner: mic in the corner, curved habit gauge (or "Ripple") along the edge.
/// The label is a Gauge or a Text directly — not an if/else inside
/// widgetLabel — so the system can render it as the curved corner label.
struct CornerComplicationView: View {
    let entry: ComplicationEntry
    var body: some View {
        if let p = entry.progress {
            micIcon
                .widgetLabel {
                    Gauge(value: Double(min(p.done, p.total)), in: 0...Double(p.total)) {
                        Text("Habits")
                    } currentValueLabel: {
                        Text("\(p.done)/\(p.total)")
                    } minimumValueLabel: {
                        Text("\(p.done)")
                    } maximumValueLabel: {
                        Text("\(p.total)")
                    }
                    .tint(accent)
                }
                .accessibilityLabel("Ripple, \(p.done) of \(p.total) habits done. Start a debrief.")
        } else {
            micIcon
                .widgetLabel("Ripple")
                .accessibilityLabel("Ripple. Start a debrief.")
        }
    }

    private var micIcon: some View {
        Image(systemName: "mic.fill")
            .font(.system(size: 20, weight: .semibold))
            .foregroundStyle(accent)
            .widgetAccentable()
    }
}

/// Rectangular: brand line, habit status, call to action.
struct RectangularComplicationView: View {
    let entry: ComplicationEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 4) {
                Image(systemName: "mic.fill")
                Text("Ripple")
            }
            .font(.headline)
            .foregroundStyle(accent)
            .widgetAccentable()
            if let p = entry.progress {
                Text(p.allDone ? "All \(p.total) habits done" : "\(p.done) of \(p.total) habits done")
                    .font(.system(size: 15, weight: .semibold))
            }
            Text("Tap to debrief")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// Inline: one line above the time.
struct InlineComplicationView: View {
    let entry: ComplicationEntry
    var body: some View {
        if let p = entry.progress {
            Label("Ripple \(p.done)/\(p.total) habits", systemImage: "mic.fill")
        } else {
            Label("Ripple · Debrief", systemImage: "mic.fill")
        }
    }
}

struct RippleComplicationEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ComplicationEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            CircularComplicationView(entry: entry)
                .widgetURL(RECORD_URL)
                .containerBackground(for: .widget) { AccessoryWidgetBackground() }
        case .accessoryCorner:
            CornerComplicationView(entry: entry)
                .widgetURL(RECORD_URL)
                .containerBackground(for: .widget) { AccessoryWidgetBackground() }
        case .accessoryRectangular:
            RectangularComplicationView(entry: entry)
                .widgetURL(RECORD_URL)
                .containerBackground(for: .widget) { Color.clear }
        default: // .accessoryInline
            InlineComplicationView(entry: entry)
                .widgetURL(RECORD_URL)
                .containerBackground(for: .widget) { Color.clear }
        }
    }
}

// MARK: - Widget

@main
struct RippleComplicationWidget: Widget {
    let kind = "RippleComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ComplicationProvider()) { entry in
            RippleComplicationEntryView(entry: entry)
        }
        .configurationDisplayName("Ripple")
        .description("Start a debrief from your watch face and see today's habits.")
        .supportedFamilies([
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
            .accessoryCorner,
        ])
    }
}
