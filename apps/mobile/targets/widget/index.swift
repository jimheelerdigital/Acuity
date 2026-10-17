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
// Tapping the widget deep-links into the recorder via acuity://record?autostart=1
// (iOS won't give a widget the mic; the tap brings the app forward to record).

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

struct HabitItem: Decodable {
    let name: String
    let done: Int
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
                    habits: [HabitItem(name: "Daily Reflection", done: 1),
                             HabitItem(name: "Stretch", done: 0)])
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

struct StreakBadge: View {
    let streak: Int
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "flame.fill").foregroundColor(accent)
            Text("\(streak)").font(.system(size: 30, weight: .bold, design: .rounded))
            Text("day\(streak == 1 ? "" : "s")")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.secondary)
                .padding(.top, 8)
        }
    }
}

struct SmallView: View {
    let entry: RippleEntry
    var remaining: Int { entry.habits.filter { $0.done == 0 }.count }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            StreakBadge(streak: entry.streak)
            Spacer()
            if entry.habits.isEmpty {
                Text("Tap to reflect").font(.system(size: 13, weight: .medium)).foregroundColor(.secondary)
            } else if remaining == 0 {
                Text("All done today ✓").font(.system(size: 13, weight: .semibold)).foregroundColor(accent)
            } else {
                Text("\(remaining) habit\(remaining == 1 ? "" : "s") left")
                    .font(.system(size: 13, weight: .medium)).foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(16)
    }
}

struct MediumView: View {
    let entry: RippleEntry
    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading) { StreakBadge(streak: entry.streak); Spacer() }
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(entry.habits.prefix(4).enumerated()), id: \.offset) { _, h in
                    HStack(spacing: 8) {
                        Image(systemName: h.done == 1 ? "checkmark.circle.fill" : "circle")
                            .foregroundColor(h.done == 1 ? accent : .secondary)
                        Text(h.name).font(.system(size: 14)).lineLimit(1)
                            .strikethrough(h.done == 1, color: .secondary)
                            .foregroundColor(h.done == 1 ? .secondary : .primary)
                    }
                }
                if entry.habits.isEmpty {
                    Text("Tap to start today's debrief")
                        .font(.system(size: 14, weight: .medium)).foregroundColor(.secondary)
                }
                Spacer()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(16)
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
                .widgetURL(RECORD_URL)
                .containerBackground(for: .widget) { AccessoryWidgetBackground() }
        case .accessoryRectangular:
            RectangularView(entry: entry)
                .widgetURL(RECORD_URL)
                .containerBackground(for: .widget) { Color.clear }
        case .accessoryInline:
            InlineView(entry: entry)
                .widgetURL(RECORD_URL)
        case .systemSmall:
            SmallView(entry: entry)
                .widgetURL(RECORD_URL)
                .containerBackground(for: .widget) { Color(.systemBackground) }
        default:
            MediumView(entry: entry)
                .widgetURL(RECORD_URL)
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
        .description("Your streak and today's habits. Tap to record.")
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
// CompleteTaskIntent. It is optimistic — the id goes into the App Group
// key `pendingDone` (JSON string array) first, then PATCH /api/tasks
// {id, action:"complete"} with the session bearer read from the SHARED
// keychain access group (see sharedSessionToken()). On 2xx the id leaves
// `pendingDone` and the item leaves `todayTasks`; on failure it stays in
// `pendingDone`, renders checked, and the app flushes it on next
// foreground (lib/widget-data.ts flushWidgetCompletions).

private let TASKS_URL = URL(string: "acuity://tasks")!
private let TODAY_LIMIT = 5
private let PENDING_DONE_KEY = "pendingDone"
private let TODAY_TASKS_KEY = "todayTasks"
private let TODAY_WIDGET_KIND = "RippleTodayWidget"

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

struct TodayRow {
    let item: TodayTaskItem
    let bucket: TodayBucket
    let pendingDone: Bool  // checked on the widget, not yet confirmed by the server
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

func selectToday(_ items: [TodayTaskItem], at date: Date, pending: Set<String> = []) -> [TodayRow] {
    let today = ymd(date)
    let nowSec = Int(date.timeIntervalSince1970)
    var rows: [TodayRow] = []
    for it in items {
        if it.snoozedUntil > nowSec { continue }
        let bucket: TodayBucket
        if !it.due.isEmpty && it.due < today { bucket = .overdue }
        else if it.due == today { bucket = .today }
        else if it.due.isEmpty && it.high == 1 { bucket = .priority }
        else { bucket = .open }
        rows.append(TodayRow(item: it, bucket: bucket, pendingDone: pending.contains(it.id)))
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

    func perform() async throws -> some IntentResult {
        // (a) Optimistic: mark pending so the row renders checked right away
        //     and survives timeline reloads until the server confirms.
        var pending = readPendingDone()
        if !pending.contains(taskId) {
            pending.append(taskId)
            writePendingDone(pending)
        }
        WidgetCenter.shared.reloadTimelines(ofKind: TODAY_WIDGET_KIND)

        // (b) PATCH /api/tasks { id, action: "complete" } — same call the
        //     Tasks tab / Home card make (apps/web/src/app/api/tasks/route.ts).
        var ok = false
        if let token = sharedSessionToken(),
           let url = URL(string: apiBase() + "/api/tasks") {
            var req = URLRequest(url: url)
            req.httpMethod = "PATCH"
            req.timeoutInterval = 10
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("ios", forHTTPHeaderField: "X-Platform")
            req.setValue(extensionVersion(), forHTTPHeaderField: "X-App-Version")
            req.httpBody = try? JSONSerialization.data(withJSONObject: ["id": taskId, "action": "complete"])
            let config = URLSessionConfiguration.ephemeral
            config.timeoutIntervalForRequest = 10
            config.timeoutIntervalForResource = 10
            let session = URLSession(configuration: config)
            if let result = try? await session.data(for: req),
               let code = (result.1 as? HTTPURLResponse)?.statusCode {
                // 404 = already gone (deleted elsewhere): nothing left to do.
                ok = (200..<300).contains(code) || code == 404
            }
        }

        if ok {
            writePendingDone(readPendingDone().filter { $0 != taskId })
            if let items = readTodayItems() {
                writeTodayItems(items.filter { $0.id != taskId })
            }
        }
        // On failure the id stays in `pendingDone`; the app retries it on
        // next foreground and keeps rendering it as done meanwhile.
        WidgetCenter.shared.reloadTimelines(ofKind: TODAY_WIDGET_KIND)
        return .result()
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
        completion(TodayEntry(date: Date(), rows: selectToday(items ?? [], at: Date(), pending: pending), hasData: items != nil))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        markWidgetPlaced()
        let now = Date()
        let items = readTodayItems()
        let list = items ?? []
        let pending = Set(readPendingDone())
        // Re-evaluate at midnight (overdue/today roll over) and whenever a
        // snooze ends in the next day. The app also reloads us on changes.
        var dates: [Date] = [now]
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
        let entries = dates.map { TodayEntry(date: $0, rows: selectToday(list, at: $0, pending: pending), hasData: items != nil) }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

private func bucketLabel(_ row: TodayRow) -> String {
    switch row.bucket {
    case .overdue: return "Overdue"
    case .today: return "Today"
    case .priority: return "Priority"
    case .open: return "Open"
    }
}

private func bucketColor(_ row: TodayRow) -> Color {
    switch row.bucket {
    case .overdue: return .red
    case .today: return .orange
    case .priority: return accent
    case .open: return .secondary
    }
}

struct TodayRowView: View {
    let row: TodayRow
    var body: some View {
        HStack(spacing: 8) {
            // Interactive check-off (iOS 17 widget button). Runs in-process in
            // the extension; the title next to it still deep-links to the task.
            Button(intent: CompleteTaskIntent(taskId: row.item.id)) {
                Image(systemName: row.pendingDone ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(row.pendingDone ? accent : .secondary)
                    .font(.system(size: 15))
                    .frame(width: 22, height: 22)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(row.pendingDone ? "Completed" : "Mark \(row.item.title) complete")
            Link(destination: URL(string: "acuity://task/\(row.item.id)") ?? TASKS_URL) {
                HStack(spacing: 8) {
                    Text(row.item.title).font(.system(size: 14)).lineLimit(1)
                        .strikethrough(row.pendingDone, color: .secondary)
                        .foregroundColor(row.pendingDone ? .secondary : .primary)
                    Spacer(minLength: 4)
                    Text(bucketLabel(row))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(bucketColor(row))
                }
            }
        }
    }
}

struct TodayListView: View {
    let entry: TodayEntry
    let limit: Int
    var body: some View {
        let shown = Array(entry.rows.prefix(limit))
        let more = entry.rows.count - shown.count
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text("TODAY").font(.system(size: 11, weight: .bold)).foregroundColor(accent)
                Spacer()
                if more > 0 {
                    Text("+\(more) more").font(.system(size: 11, weight: .medium)).foregroundColor(.secondary)
                }
            }
            if !entry.hasData {
                Text("Open Ripple to load your tasks").font(.system(size: 14, weight: .medium)).foregroundColor(.secondary)
            } else if shown.isEmpty {
                Text("No open tasks. Nice.")
                    .font(.system(size: 14, weight: .medium)).foregroundColor(.secondary)
            } else {
                ForEach(Array(shown.enumerated()), id: \.offset) { _, row in
                    TodayRowView(row: row)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(16)
    }
}

struct TodayRectangularView: View {
    let entry: TodayEntry
    var body: some View {
        // Lock Screen: no tap targets, so show what's left to do.
        let open = entry.rows.filter { !$0.pendingDone }
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
            TodayListView(entry: entry, limit: TODAY_LIMIT)
                .widgetURL(TASKS_URL)
                .containerBackground(for: .widget) { Color(.systemBackground) }
        default:
            TodayListView(entry: entry, limit: 4)
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
