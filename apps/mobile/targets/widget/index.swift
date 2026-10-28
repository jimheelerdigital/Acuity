import WidgetKit
import SwiftUI
import AppIntents
import Security

// Ripple home-screen widgets: habits/streak (tap-to-record) and "Today"
// tasks (interactive tap-to-check since 1.9.4).
//
// Reads data the RN app writes via @bacons/apple-targets ExtensionStorage into
// the shared App Group. Serialization (must match ExtensionStorageModule):
//   • setInt(key)    -> UserDefaults Int      -> defaults.integer(forKey:)
//   • setString(key) -> UserDefaults String   -> defaults.string(forKey:)
//   • setArray(key)  -> JSON Data([[String:Any]]) -> defaults.data(forKey:)
//
// Tapping the widget opens Habits (acuity://habits) when it lists habits
// (Keenan, 2026-10-27); with none yet it deep-links into the recorder via
// acuity://record?autostart=1 (iOS won't give a widget the mic; the tap
// brings the app forward to record).

private let APP_GROUP = "group.com.heelerdigital.acuity"

// Setup-hub check mark (1.9.1): getTimeline only runs for widgets actually
// placed on a Home/Lock Screen (gallery previews use getSnapshot), so the
// first call records "a Ripple widget is set up". Read by
// apps/mobile/lib/setup-status.ts.
private func markWidgetPlaced() {
    let d = UserDefaults(suiteName: APP_GROUP)
    if d?.object(forKey: "setup.widgetSeenAt") == nil {
        d?.set(Date().timeIntervalSince1970, forKey: "setup.widgetSeenAt")
    }
}
private let RECORD_URL = URL(string: "acuity://record?autostart=1")!
private let HABITS_URL = URL(string: "acuity://habits")!

private func tapURL(_ entry: RippleEntry) -> URL {
    entry.habits.isEmpty ? RECORD_URL : HABITS_URL
}

struct HabitItem: Decodable {
    let name: String
    let done: Int
    // This habit's own current streak (2026-10-27). Optional: data written
    // by an older app version has no per-habit streak.
    let streak: Int?
}

struct RippleEntry: TimelineEntry {
    let date: Date
    let streak: Int
    let habits: [HabitItem]
}

private func readEntry() -> RippleEntry {
    let defaults = UserDefaults(suiteName: APP_GROUP)
    let streak = defaults?.integer(forKey: "streak") ?? 0
    var habits: [HabitItem] = []
    if let data = defaults?.data(forKey: "habitsToday"),
       let decoded = try? JSONDecoder().decode([HabitItem].self, from: data) {
        habits = decoded
    }
    return RippleEntry(date: Date(), streak: streak, habits: habits)
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> RippleEntry {
        RippleEntry(date: Date(), streak: 5,
                    habits: [HabitItem(name: "Daily Reflection", done: 1, streak: 5),
                             HabitItem(name: "Stretch", done: 0, streak: 2)])
    }

    func getSnapshot(in context: Context, completion: @escaping (RippleEntry) -> Void) {
        completion(readEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RippleEntry>) -> Void) {
        // Refresh a few times a day; the app also nudges a reload after habit
        // actions via ExtensionStorage.reloadWidget().
        markWidgetPlaced()
        let entry = readEntry()
        let next = Calendar.current.date(byAdding: .hour, value: 6, to: Date()) ?? Date().addingTimeInterval(21600)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

private let accent = Color("AccentColor")

/// Flame fill for the streak (Jimmy, 2026-10-28: "It's an achievement").
private let flameGradient = LinearGradient(
    colors: [Color(red: 1.0, green: 0.72, blue: 0.25), accent],
    startPoint: .top, endPoint: .bottom
)

struct SmallView: View {
    let entry: RippleEntry
    var remaining: Int { entry.habits.filter { $0.done == 0 }.count }
    var body: some View {
        VStack(spacing: 6) {
            DailyStreakPanel(streak: entry.streak)
            if entry.habits.isEmpty {
                Text("Tap to reflect").font(.system(size: 13, weight: .medium)).foregroundColor(.secondary)
            } else if remaining == 0 {
                Text("All done today ✓").font(.system(size: 13, weight: .semibold)).foregroundColor(accent)
            } else {
                Text("\(remaining) habit\(remaining == 1 ? "" : "s") left")
                    .font(.system(size: 13, weight: .medium)).foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct MediumView: View {
    let entry: RippleEntry
    /// Width of the per-habit streak column, so every check circle lines up
    /// whether or not that habit has a streak. No column when none do.
    private var habitStreakWidth: CGFloat {
        entry.habits.prefix(4).contains { ($0.streak ?? 0) > 0 } ? 24 : 0
    }
    var body: some View {
        // Jimmy, 2026-10-28: habits on the left, each habit's streak LEFT of
        // its check circle; the daily streak on the right, set apart by a
        // vertical line. The system's widget margins provide the outer
        // padding, so none is added here.
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 9) {
                ForEach(Array(entry.habits.prefix(4).enumerated()), id: \.offset) { _, h in
                    HabitRow(habit: h, streakWidth: habitStreakWidth)
                }
                if entry.habits.isEmpty {
                    Text("Tap to start today's debrief")
                        .font(.system(size: 14, weight: .medium)).foregroundColor(.secondary)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)

            Rectangle()
                .fill(Color.secondary.opacity(0.22))
                .frame(width: 1)
                .padding(.vertical, 10)

            DailyStreakPanel(streak: entry.streak)
                .frame(width: 92)
        }
    }
}

private struct HabitRow: View {
    let habit: HabitItem
    let streakWidth: CGFloat
    var body: some View {
        HStack(spacing: streakWidth > 0 ? 6 : 0) {
            Group {
                if let s = habit.streak, s > 0 {
                    HStack(spacing: 1) {
                        Image(systemName: "flame.fill")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(flameGradient)
                        Text("\(s)")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .accessibilityLabel("\(s)-day streak")
                } else {
                    Color.clear.accessibilityHidden(true)
                }
            }
            .frame(width: streakWidth, height: 14, alignment: .trailing)
            .opacity(streakWidth > 0 ? 1 : 0)

            Image(systemName: habit.done == 1 ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 16))
                .foregroundColor(habit.done == 1 ? accent : Color.secondary.opacity(0.6))
            Text(habit.name)
                .font(.system(size: 14, weight: .medium))
                .lineLimit(1)
                .strikethrough(habit.done == 1, color: .secondary)
                .foregroundColor(habit.done == 1 ? .secondary : .primary)
        }
    }
}

/// Right side of the medium widget: "DAILY STREAK", a flame beside a big
/// number, and "day(s)", centered as one group.
private struct DailyStreakPanel: View {
    let streak: Int
    var body: some View {
        VStack(spacing: 4) {
            Text("DAILY STREAK")
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .tracking(0.8)
                .foregroundColor(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            HStack(alignment: .center, spacing: 3) {
                Image(systemName: "flame.fill")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(flameGradient)
                    .widgetAccentable()
                Text("\(streak)")
                    .font(.system(size: 40, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .foregroundColor(.primary)
            }
            Text(streak == 1 ? "day" : "days")
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundColor(accent)
                .widgetAccentable()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Daily streak, \(streak) day\(streak == 1 ? "" : "s")")
    }
}

// ── Lock Screen (accessory) views ────────────────────────────────────
// iOS renders these monochrome/tinted to match the clock, so we keep them
// to text + one SF Symbol. AccentColor won't show as coral here — that's
// expected on the Lock Screen.

private func remainingCount(_ entry: RippleEntry) -> Int {
    entry.habits.filter { $0.done == 0 }.count
}

private func habitsSummary(_ entry: RippleEntry) -> String {
    if entry.habits.isEmpty { return "tap to reflect" }
    let left = remainingCount(entry)
    return left == 0 ? "all done ✓" : "\(left) habit\(left == 1 ? "" : "s") left"
}

// Circular: streak number under a small flame (sits in the clock strip).
struct CircularView: View {
    let entry: RippleEntry
    var body: some View {
        VStack(spacing: -1) {
            Image(systemName: "flame.fill").font(.system(size: 11))
            Text("\(entry.streak)").font(.system(size: 17, weight: .bold, design: .rounded))
        }
    }
}

// Rectangular: streak + today's habit status, a couple of lines.
struct RectangularView: View {
    let entry: RippleEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Label("\(entry.streak)-day streak", systemImage: "flame.fill")
                .font(.headline)
            Text(habitsSummary(entry).prefix(1).uppercased() + habitsSummary(entry).dropFirst())
                .font(.caption)
        }
    }
}

// Inline: single line above the clock.
struct InlineView: View {
    let entry: RippleEntry
    var body: some View {
        Label("Ripple: \(habitsSummary(entry))", systemImage: "flame.fill")
    }
}

struct RippleWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: RippleEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            CircularView(entry: entry)
                .widgetURL(tapURL(entry))
                .containerBackground(for: .widget) { AccessoryWidgetBackground() }
        case .accessoryRectangular:
            RectangularView(entry: entry)
                .widgetURL(tapURL(entry))
                .containerBackground(for: .widget) { Color.clear }
        case .accessoryInline:
            InlineView(entry: entry)
                .widgetURL(tapURL(entry))
        case .systemSmall:
            SmallView(entry: entry)
                .widgetURL(tapURL(entry))
                .containerBackground(for: .widget) { Color(.systemBackground) }
        default:
            MediumView(entry: entry)
                .widgetURL(tapURL(entry))
                .containerBackground(for: .widget) { Color(.systemBackground) }
        }
    }
}

struct RippleWidget: Widget {
    let kind = "RippleWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            RippleWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Ripple")
        .description("Your streak and today's habits. Tap to open Habits.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
        ])
    }
}

// ── "Today" widget (1.9.1; filled out + interactive in 1.9.4) ────────
// The app publishes open tasks to `todayTasks` (lib/widget-data.ts
// publishTodayToWidget); this applies the SAME pressing rule as
// lib/today-tasks.ts so the list rolls over at midnight and when a snooze
// ends without the app running:
//   overdue (oldest first) → due today → high priority with no date;
//   snoozed hidden; within a bucket, priority rank then id.
// 1.9.4 adds a fourth bucket the Home card deliberately does NOT show:
//   open — every other open task, newest first (createdAt desc).
// Most AI-extracted tasks are MEDIUM with no due date, so without it the
// widget was empty for most people.
//
// Tap-to-check (1.9.4): the row's circle is an interactive Button running
// CompleteTaskIntent, which TOGGLES:
//   • unchecked → checked: LOCAL first and immediately — the id goes into the
//     App Group key `pendingDone` (JSON string array), the item leaves
//     `todayTasks`, and a snapshot goes into `recentDone` so the row STAYS,
//     struck through, for RECENT_DONE_LINGER seconds (Jimmy: "they should
//     stick for a few so I can uncheck"). Then PATCH /api/tasks
//     {id, action:"complete"} goes out on a background URLSession with the
//     bearer from the SHARED keychain access group (sharedSessionToken()).
//     The id stays in `pendingDone` until the app's next foreground flush
//     (lib/widget-data.ts flushWidgetCompletions) re-sends it (idempotent).
//   • checked → unchecked (within the linger window): the id leaves
//     `pendingDone`/`recentDone`, the snapshot goes back into `todayTasks`,
//     and PATCH {action:"reopen"} goes out the same way.
//   perform() never awaits the network: WidgetKit re-renders only after it
//   returns, and awaiting the PATCH made taps take ~5s (build 185, 10/20).
// Struck rows drop off on their own when the linger expires (timeline
// entries are scheduled at each expiry), so the app needn't be running.

private let TASKS_URL = URL(string: "acuity://tasks")!
private let TODAY_LIMIT = 5
private let MEDIUM_LIMIT = 3
private let PENDING_DONE_KEY = "pendingDone"
private let RECENT_DONE_KEY = "recentDone"
private let TODAY_TASKS_KEY = "todayTasks"
private let TODAY_WIDGET_KIND = "RippleTodayWidget"
/// How long a checked-off task stays visible (struck through) before it
/// drops off the widget. Long enough to notice a mis-tap and undo it.
private let RECENT_DONE_LINGER: Int = 10 * 60

// Shared keychain access group. Declared in app.json ios.entitlements and
// targets/widget/expo-target.config.js as
// "$(AppIdentifierPrefix)com.heelerdigital.acuity.shared"; the prefix is the
// Apple team id (app.json ios.appleTeamId). lib/auth.ts writes the token
// there via expo-secure-store with accessGroup set to this exact string.
private let SHARED_KEYCHAIN_GROUP = "ZNF9ZJ4NVX.com.heelerdigital.acuity.shared"
private let SHARED_TOKEN_KEY = "acuity_session_token_shared"

struct TodayTaskItem: Codable {
    let id: String
    let title: String
    let due: String        // "YYYY-MM-DD" or ""
    let high: Int          // 1 = URGENT/HIGH
    let rank: Int          // 0 URGENT … 3 LOW, 9 unknown
    let snoozedUntil: Int  // epoch seconds, 0 = not snoozed
    let createdAt: Int     // epoch seconds, 0 = unknown (pre-1.9.4 data)

    init(id: String, title: String, due: String, high: Int, rank: Int, snoozedUntil: Int, createdAt: Int = 0) {
        self.id = id; self.title = title; self.due = due; self.high = high
        self.rank = rank; self.snoozedUntil = snoozedUntil; self.createdAt = createdAt
    }

    private enum CodingKeys: String, CodingKey { case id, title, due, high, rank, snoozedUntil, createdAt }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        due = try c.decodeIfPresent(String.self, forKey: .due) ?? ""
        high = try c.decodeIfPresent(Int.self, forKey: .high) ?? 0
        rank = try c.decodeIfPresent(Int.self, forKey: .rank) ?? 9
        snoozedUntil = try c.decodeIfPresent(Int.self, forKey: .snoozedUntil) ?? 0
        createdAt = try c.decodeIfPresent(Int.self, forKey: .createdAt) ?? 0
    }
}

enum TodayBucket: Int { case overdue = 0, today = 1, priority = 2, open = 3 }

/// A task checked off on the widget, kept (struck through) for
/// RECENT_DONE_LINGER seconds so a mis-tap can be undone. Carries the full
/// item because the app's next publish drops DONE tasks from `todayTasks`.
struct RecentDone: Codable {
    let item: TodayTaskItem
    let doneAt: Int  // epoch seconds
}

struct TodayRow {
    let item: TodayTaskItem
    let bucket: TodayBucket
    let done: Bool  // checked on the widget (pending server confirm, or recently confirmed)
}

struct TodayEntry: TimelineEntry {
    let date: Date
    let rows: [TodayRow]   // full ordered list; views slice
    let hasData: Bool      // false = app hasn't published yet / signed out
}

private func ymd(_ d: Date) -> String {
    let f = DateFormatter()
    f.calendar = Calendar.current
    f.timeZone = TimeZone.current
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: d)
}

private func readTodayItems() -> [TodayTaskItem]? {
    let defaults = UserDefaults(suiteName: APP_GROUP)
    guard let data = defaults?.data(forKey: TODAY_TASKS_KEY) else { return nil }
    return try? JSONDecoder().decode([TodayTaskItem].self, from: data)
}

private func writeTodayItems(_ items: [TodayTaskItem]) {
    guard let data = try? JSONEncoder().encode(items) else { return }
    UserDefaults(suiteName: APP_GROUP)?.set(data, forKey: TODAY_TASKS_KEY)
}

/// `pendingDone` is a JSON-encoded [String] stored as a String so the RN
/// side can read it back with ExtensionStorage.get (which returns a String).
private func readPendingDone() -> [String] {
    guard let raw = UserDefaults(suiteName: APP_GROUP)?.string(forKey: PENDING_DONE_KEY),
          let data = raw.data(using: .utf8),
          let ids = try? JSONDecoder().decode([String].self, from: data)
    else { return [] }
    return ids
}

private func writePendingDone(_ ids: [String]) {
    guard let data = try? JSONEncoder().encode(ids),
          let raw = String(data: data, encoding: .utf8) else { return }
    UserDefaults(suiteName: APP_GROUP)?.set(raw, forKey: PENDING_DONE_KEY)
}

/// `recentDone` is a JSON-encoded [RecentDone] stored as a String (same
/// convention as `pendingDone`). Expired entries are dropped on read.
private func readRecentDone(at date: Date = Date()) -> [RecentDone] {
    guard let raw = UserDefaults(suiteName: APP_GROUP)?.string(forKey: RECENT_DONE_KEY),
          let data = raw.data(using: .utf8),
          let list = try? JSONDecoder().decode([RecentDone].self, from: data)
    else { return [] }
    let nowSec = Int(date.timeIntervalSince1970)
    return list.filter { $0.doneAt + RECENT_DONE_LINGER > nowSec }
}

private func writeRecentDone(_ list: [RecentDone]) {
    guard let data = try? JSONEncoder().encode(list),
          let raw = String(data: data, encoding: .utf8) else { return }
    UserDefaults(suiteName: APP_GROUP)?.set(raw, forKey: RECENT_DONE_KEY)
}

private func bucketFor(_ it: TodayTaskItem, today: String) -> TodayBucket {
    if !it.due.isEmpty && it.due < today { return .overdue }
    if it.due == today { return .today }
    if it.due.isEmpty && it.high == 1 { return .priority }
    return .open
}

func selectToday(_ items: [TodayTaskItem], at date: Date, pending: Set<String> = [], recent: [RecentDone] = []) -> [TodayRow] {
    let today = ymd(date)
    let nowSec = Int(date.timeIntervalSince1970)
    // Only linger entries still inside their window AT THIS ENTRY'S DATE —
    // getTimeline builds future entries, and a struck row must drop off there.
    let live = recent.filter { $0.doneAt + RECENT_DONE_LINGER > nowSec }
    let recentIds = Set(live.map { $0.item.id })
    var rows: [TodayRow] = []
    var seen = Set<String>()
    for it in items {
        if it.snoozedUntil > nowSec { continue }
        seen.insert(it.id)
        let done = pending.contains(it.id) || recentIds.contains(it.id)
        rows.append(TodayRow(item: it, bucket: bucketFor(it, today: today), done: done))
    }
    // Checked-off tasks the app has already dropped from `todayTasks`: keep
    // them in place, struck through, until the linger expires.
    for r in live where !seen.contains(r.item.id) {
        seen.insert(r.item.id)
        rows.append(TodayRow(item: r.item, bucket: bucketFor(r.item, today: today), done: true))
    }
    rows.sort { a, b in
        if a.bucket != b.bucket { return a.bucket.rawValue < b.bucket.rawValue }
        if a.bucket == .open {
            // Newest first; the app also publishes them in this order.
            if a.item.createdAt != b.item.createdAt { return a.item.createdAt > b.item.createdAt }
            return a.item.id < b.item.id
        }
        if a.bucket == .overdue && a.item.due != b.item.due { return a.item.due < b.item.due }
        if a.item.rank != b.item.rank { return a.item.rank < b.item.rank }
        return a.item.id < b.item.id
    }
    return rows
}

// MARK: - Session token (shared keychain access group)

/// Reads the session bearer lib/auth.ts mirrors into the shared access group.
/// The query must match expo-secure-store's schema exactly
/// (node_modules/expo-secure-store/ios/SecureStoreModule.swift `query(with:options:)`):
///   kSecClass           = kSecClassGenericPassword
///   kSecAttrService     = "app:no-auth"   (default keychainService "app" + ":no-auth")
///   kSecAttrAccount     = UTF-8 Data of the key
///   kSecAttrAccessGroup = the shared group
/// Returns nil when signed out / not yet migrated (app opened pre-1.9.4 only).
private func sharedSessionToken() -> String? {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "app:no-auth",
        kSecAttrAccount as String: Data(SHARED_TOKEN_KEY.utf8),
        kSecAttrAccessGroup as String: SHARED_KEYCHAIN_GROUP,
        kSecReturnData as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
          let data = item as? Data,
          let token = String(data: data, encoding: .utf8),
          !token.isEmpty
    else { return nil }
    return token
}

/// API origin the RN app is pointed at (App Group key `apiBase`, written by
/// lib/auth.ts via publishSiriConfig on sign-in and cold launch). Falls back
/// to production.
private func apiBase() -> String {
    let b = UserDefaults(suiteName: APP_GROUP)?.string(forKey: "apiBase") ?? ""
    return b.isEmpty ? "https://goripple.io" : b
}

private func extensionVersion() -> String {
    (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "unknown"
}

// MARK: - CompleteTaskIntent (interactive widget button)

@available(iOS 17.0, *)
struct CompleteTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Complete Task"
    static var description = IntentDescription("Marks a Ripple task as done.")
    // Runs in the widget extension; never foregrounds the app.
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false

    @Parameter(title: "Task")
    var taskId: String

    init() {}
    init(taskId: String) { self.taskId = taskId }

    // Why perform() never awaits the network (Jimmy, 10/20 on build 185:
    // "5 second delay" between tapping a circle and seeing it checked):
    // WidgetKit only re-renders an interactive widget AFTER perform()
    // returns, so the old version, which awaited PATCH /api/tasks (cold
    // extension + TLS + server, up to 10s), held the checkmark hostage to the
    // round trip. Now perform() only writes the local state and returns
    // immediately; the request goes out on a BACKGROUND URLSession, which the
    // system finishes even after the extension exits. The task stays in
    // `pendingDone` until the app's next foreground flush
    // (lib/widget-data.ts flushWidgetCompletions) re-sends it, and complete is
    // idempotent, so a lost background request can't lose the check-off.

    func perform() async throws -> some IntentResult {
        let pending = readPendingDone()
        let recent = readRecentDone()
        let isChecked = pending.contains(taskId) || recent.contains { $0.item.id == taskId }
        if isChecked {
            uncheck(pending: pending, recent: recent)
            sendInBackground(action: "reopen")
        } else {
            check(pending: pending, recent: recent)
            sendInBackground(action: "complete")
        }
        WidgetCenter.shared.reloadTimelines(ofKind: TODAY_WIDGET_KIND)
        return .result()
    }

    /// unchecked → checked, all local. The row lingers struck-through for
    /// RECENT_DONE_LINGER (undo window), then drops off.
    private func check(pending: [String], recent: [RecentDone]) {
        if !pending.contains(taskId) { writePendingDone(pending + [taskId]) }
        if let items = readTodayItems(), let item = items.first(where: { $0.id == taskId }) {
            let nowSec = Int(Date().timeIntervalSince1970)
            writeRecentDone(recent.filter { $0.item.id != taskId } + [RecentDone(item: item, doneAt: nowSec)])
            writeTodayItems(items.filter { $0.id != taskId })
        }
    }

    /// checked → unchecked (undo within the linger window), all local.
    private func uncheck(pending: [String], recent: [RecentDone]) {
        writePendingDone(pending.filter { $0 != taskId })
        writeRecentDone(recent.filter { $0.item.id != taskId })
        if let item = recent.first(where: { $0.item.id == taskId })?.item {
            var items = readTodayItems() ?? []
            if !items.contains(where: { $0.id == item.id }) {
                items.append(item)
                writeTodayItems(items)
            }
        }
    }

    /// PATCH /api/tasks { id, action } on a background URLSession. Background
    /// sessions need an upload-from-file task (no in-memory bodies, no
    /// completion handlers), so the JSON body is written to the shared
    /// container first. Fire-and-forget by design; see the note above.
    private func sendInBackground(action: String) {
        guard let token = sharedSessionToken(),
              let url = URL(string: apiBase() + "/api/tasks"),
              let body = try? JSONSerialization.data(withJSONObject: ["id": taskId, "action": action]),
              let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: APP_GROUP)
        else { return }
        // Sweep request bodies from earlier taps (the system has long since
        // read them) so the shared container doesn't accumulate files.
        let fm = FileManager.default
        if let old = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey]) {
            let cutoff = Date().addingTimeInterval(-3600)
            for f in old where f.lastPathComponent.hasPrefix("widget-") && f.pathExtension == "json" {
                let m = (try? f.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
                if let m, m < cutoff { try? fm.removeItem(at: f) }
            }
        }
        let file = dir.appendingPathComponent("widget-\(action)-\(taskId)-\(UUID().uuidString).json")
        guard (try? body.write(to: file)) != nil else { return }

        var req = URLRequest(url: url)
        req.httpMethod = "PATCH"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("ios", forHTTPHeaderField: "X-Platform")
        req.setValue(extensionVersion(), forHTTPHeaderField: "X-App-Version")

        // Unique identifier per request: reusing one while a previous session
        // with that id is still alive makes the new session's tasks unreliable.
        let config = URLSessionConfiguration.background(
            withIdentifier: "com.heelerdigital.acuity.widget.tasks.\(UUID().uuidString)"
        )
        config.sharedContainerIdentifier = APP_GROUP
        config.sessionSendsLaunchEvents = false
        config.isDiscretionary = false
        let session = URLSession(configuration: config)
        session.uploadTask(with: req, fromFile: file).resume()
        session.finishTasksAndInvalidate()
    }
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        let sample = [
            TodayTaskItem(id: "1", title: "Send the proposal", due: "2000-01-01", high: 1, rank: 1, snoozedUntil: 0),
            TodayTaskItem(id: "2", title: "Call the dentist", due: ymd(Date()), high: 0, rank: 2, snoozedUntil: 0),
            TodayTaskItem(id: "3", title: "Plan the week", due: "", high: 1, rank: 1, snoozedUntil: 0),
            TodayTaskItem(id: "4", title: "Book the car service", due: "", high: 0, rank: 2, snoozedUntil: 0, createdAt: 1),
        ]
        return TodayEntry(date: Date(), rows: selectToday(sample, at: Date()), hasData: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        if context.isPreview, readTodayItems() == nil {
            completion(placeholder(in: context))
            return
        }
        let items = readTodayItems()
        let pending = Set(readPendingDone())
        let recent = readRecentDone()
        completion(TodayEntry(date: Date(), rows: selectToday(items ?? [], at: Date(), pending: pending, recent: recent), hasData: items != nil))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        markWidgetPlaced()
        let now = Date()
        let items = readTodayItems()
        let list = items ?? []
        let pending = Set(readPendingDone())
        let recent = readRecentDone(at: now)
        // Re-evaluate at midnight (overdue/today roll over), whenever a
        // snooze ends in the next day, and when each struck-through row's
        // linger window closes. The app also reloads us on changes.
        var dates: [Date] = [now]
        for r in recent {
            let d = Date(timeIntervalSince1970: TimeInterval(r.doneAt + RECENT_DONE_LINGER + 1))
            if d > now { dates.append(d) }
        }
        let cal = Calendar.current
        if let midnight = cal.nextDate(after: now, matching: DateComponents(hour: 0, minute: 0, second: 5), matchingPolicy: .nextTime) {
            dates.append(midnight)
        }
        let horizon = now.addingTimeInterval(86400)
        for it in list where it.snoozedUntil > 0 {
            let d = Date(timeIntervalSince1970: TimeInterval(it.snoozedUntil + 1))
            if d > now && d < horizon { dates.append(d) }
        }
        dates.sort()
        let entries = dates.map { TodayEntry(date: $0, rows: selectToday(list, at: $0, pending: pending, recent: recent), hasData: items != nil) }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

struct TodayRowView: View {
    let row: TodayRow
    /// Title lines. Medium keeps one; Large has room for two.
    var titleLines: Int = 1
    var body: some View {
        // Clean list row (Jimmy, 10/19 on build 184: the grey pill rows
        // "look awful"). No card fill; a ringed check on the left, a bold
        // title, and a status tag only when it says something (Overdue /
        // Today / Priority). The row's height is set by TodayListView so a
        // fixed number of rows always fills the widget evenly.
        HStack(spacing: 4) {
            // Interactive check-off (iOS 17 widget button). Runs in-process in
            // the extension. The whole left column (44pt × full row height)
            // is the target. Everything else on the widget opens the Tasks
            // tab (widgetURL TASKS_URL), not one task's editor (Jimmy,
            // 2026-10-22: "click the bubble and it checks it off or I click
            // elsewhere on the widget and it just opens tasks").
            Button(intent: CompleteTaskIntent(taskId: row.item.id)) {
                Image(systemName: row.done ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22, weight: .medium))
                    .foregroundColor(row.done ? accent : accent.opacity(0.85))
                    .frame(width: 44)
                    .frame(maxHeight: .infinity)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(row.done ? "Undo complete \(row.item.title)" : "Mark \(row.item.title) complete")
            HStack(spacing: 8) {
                    // Strikethrough drawn explicitly: WidgetKit dropped
                    // Text.strikethrough on device (row only greyed — Jimmy,
                    // 10/17 on build 181). An overlaid rule can't be skipped.
                    Text(row.item.title)
                        .font(.system(size: 16, weight: .semibold))
                        .lineLimit(titleLines)
                        .foregroundColor(row.done ? .secondary : .primary)
                        .overlay {
                            if row.done {
                                Rectangle()
                                    .fill(Color.secondary)
                                    .frame(height: 1.5)
                                    .offset(y: 0.5)
                            }
                        }
                    Spacer(minLength: 4)
                    if let tag = statusTag(row) {
                        Text(tag.label)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(tag.color)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(Capsule().fill(tag.color.opacity(0.14)))
                    }
                }
                .frame(maxHeight: .infinity)
        }
        .frame(maxWidth: .infinity)
    }
}

/// Only tags that carry information: plain open tasks get none.
private func statusTag(_ row: TodayRow) -> (label: String, color: Color)? {
    if row.done { return ("Done", .secondary) }
    switch row.bucket {
    case .overdue: return ("Overdue", .red)
    case .today: return ("Today", .orange)
    case .priority: return ("Priority", accent)
    case .open: return nil
    }
}

struct TodayListView: View {
    let entry: TodayEntry
    let limit: Int
    var titleLines: Int = 1
    var body: some View {
        let shown = Array(entry.rows.prefix(limit))
        let more = entry.rows.count - shown.count
        let openCount = entry.rows.filter { !$0.done }.count
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text("TODAY").font(.system(size: 12, weight: .heavy)).foregroundColor(accent)
                Spacer()
                if entry.hasData && !entry.rows.isEmpty {
                    Text(more > 0 ? "+\(more) more" : "\(openCount) open")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.secondary)
                }
            }
            .padding(.leading, 4)
            if !entry.hasData {
                Spacer(minLength: 0)
                Text("Open Ripple to load your tasks").font(.system(size: 15, weight: .semibold)).foregroundColor(.secondary)
                Spacer(minLength: 0)
            } else if shown.isEmpty {
                Spacer(minLength: 0)
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill").foregroundColor(accent)
                    Text("All clear for today").font(.system(size: 15, weight: .semibold))
                }
                Spacer(minLength: 0)
            } else {
                // Fixed row height = the space below the header split into
                // `limit` slots, so 3 tasks fill a Medium widget evenly and
                // 1–2 tasks keep the same comfortable size (the rest stays
                // empty below). Measured with GeometryReader: on device the
                // flexible-frame + layoutPriority version left rows short
                // with a band of empty space underneath (Jimmy, 10/19).
                GeometryReader { geo in
                    let rowH = geo.size.height / CGFloat(max(limit, 1))
                    VStack(spacing: 0) {
                        ForEach(Array(shown.enumerated()), id: \.offset) { i, row in
                            TodayRowView(row: row, titleLines: titleLines)
                                .frame(height: rowH)
                                .overlay(alignment: .top) {
                                    if i > 0 {
                                        Rectangle()
                                            .fill(Color.secondary.opacity(0.18))
                                            .frame(height: 0.5)
                                            .padding(.leading, 48)
                                    }
                                }
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct TodayRectangularView: View {
    let entry: TodayEntry
    var body: some View {
        // Lock Screen: no tap targets, so show what's left to do.
        let open = entry.rows.filter { !$0.done }
        VStack(alignment: .leading, spacing: 1) {
            Label(open.isEmpty ? "Today: clear" : "Today: \(open.count)", systemImage: "checklist")
                .font(.headline)
            if let first = open.first {
                Text(first.item.title).font(.caption).lineLimit(1)
            }
            if open.count > 1 {
                Text(open[1].item.title).font(.caption).lineLimit(1)
            }
        }
    }
}

struct RippleTodayWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: TodayEntry
    var body: some View {
        switch family {
        case .accessoryRectangular:
            TodayRectangularView(entry: entry)
                .widgetURL(TASKS_URL)
                .containerBackground(for: .widget) { Color.clear }
        case .systemLarge:
            TodayListView(entry: entry, limit: TODAY_LIMIT, titleLines: 2)
                .widgetURL(TASKS_URL)
                .containerBackground(for: .widget) { Color(.systemBackground) }
        default:
            // Medium: 3 big rows (Jimmy, 10/19). "+N more" covers the rest.
            TodayListView(entry: entry, limit: MEDIUM_LIMIT)
                .widgetURL(TASKS_URL)
                .containerBackground(for: .widget) { Color(.systemBackground) }
        }
    }
}

struct RippleTodayWidget: Widget {
    let kind = TODAY_WIDGET_KIND
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayProvider()) { entry in
            RippleTodayWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Ripple Today")
        .description("Your open tasks, most pressing first. Tap the circle to check one off.")
        .supportedFamilies([.systemMedium, .systemLarge, .accessoryRectangular])
    }
}

@main
struct RippleWidgetBundle: WidgetBundle {
    var body: some Widget {
        RippleWidget()
        RippleTodayWidget()
    }
}
