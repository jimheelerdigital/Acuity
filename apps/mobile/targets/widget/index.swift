import WidgetKit
import SwiftUI

// Ripple home-screen widget (v1: glanceable + tap-to-record).
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

// ── "Today" widget (1.9.1) ───────────────────────────────────────────
// Most pressing open tasks. The app publishes candidate tasks to
// `todayTasks` (lib/widget-data.ts publishTodayToWidget); this applies the
// SAME rule as lib/today-tasks.ts so the list rolls over at midnight and
// when a snooze ends without the app running:
//   overdue (oldest first) → due today → high priority with no date;
//   snoozed hidden; within a bucket, priority rank then id.

private let TASKS_URL = URL(string: "acuity://tasks")!
private let TODAY_LIMIT = 5

struct TodayTaskItem: Decodable {
    let id: String
    let title: String
    let due: String        // "YYYY-MM-DD" or ""
    let high: Int          // 1 = URGENT/HIGH
    let rank: Int          // 0 URGENT … 3 LOW, 9 unknown
    let snoozedUntil: Int  // epoch seconds, 0 = not snoozed
}

enum TodayBucket: Int { case overdue = 0, today = 1, priority = 2 }

struct TodayRow {
    let item: TodayTaskItem
    let bucket: TodayBucket
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
    guard let data = defaults?.data(forKey: "todayTasks") else { return nil }
    return try? JSONDecoder().decode([TodayTaskItem].self, from: data)
}

func selectToday(_ items: [TodayTaskItem], at date: Date) -> [TodayRow] {
    let today = ymd(date)
    let nowSec = Int(date.timeIntervalSince1970)
    var rows: [TodayRow] = []
    for it in items {
        if it.snoozedUntil > nowSec { continue }
        var bucket: TodayBucket? = nil
        if !it.due.isEmpty && it.due < today { bucket = .overdue }
        else if it.due == today { bucket = .today }
        else if it.due.isEmpty && it.high == 1 { bucket = .priority }
        if let b = bucket { rows.append(TodayRow(item: it, bucket: b)) }
    }
    rows.sort { a, b in
        if a.bucket != b.bucket { return a.bucket.rawValue < b.bucket.rawValue }
        if a.bucket == .overdue && a.item.due != b.item.due { return a.item.due < b.item.due }
        if a.item.rank != b.item.rank { return a.item.rank < b.item.rank }
        return a.item.id < b.item.id
    }
    return rows
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        let sample = [
            TodayTaskItem(id: "1", title: "Send the proposal", due: "2000-01-01", high: 1, rank: 1, snoozedUntil: 0),
            TodayTaskItem(id: "2", title: "Call the dentist", due: ymd(Date()), high: 0, rank: 2, snoozedUntil: 0),
            TodayTaskItem(id: "3", title: "Plan the week", due: "", high: 1, rank: 1, snoozedUntil: 0),
        ]
        return TodayEntry(date: Date(), rows: selectToday(sample, at: Date()), hasData: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        if context.isPreview, readTodayItems() == nil {
            completion(placeholder(in: context))
            return
        }
        let items = readTodayItems()
        completion(TodayEntry(date: Date(), rows: selectToday(items ?? [], at: Date()), hasData: items != nil))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        markWidgetPlaced()
        let now = Date()
        let items = readTodayItems()
        let list = items ?? []
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
        let entries = dates.map { TodayEntry(date: $0, rows: selectToday(list, at: $0), hasData: items != nil) }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

private func bucketLabel(_ row: TodayRow) -> String {
    switch row.bucket {
    case .overdue: return "Overdue"
    case .today: return "Today"
    case .priority: return "Priority"
    }
}

private func bucketColor(_ row: TodayRow) -> Color {
    switch row.bucket {
    case .overdue: return .red
    case .today: return .orange
    case .priority: return accent
    }
}

struct TodayRowView: View {
    let row: TodayRow
    var body: some View {
        Link(destination: URL(string: "acuity://task/\(row.item.id)") ?? TASKS_URL) {
            HStack(spacing: 8) {
                Image(systemName: "circle").foregroundColor(.secondary).font(.system(size: 13))
                Text(row.item.title).font(.system(size: 14)).lineLimit(1)
                Spacer(minLength: 4)
                Text(bucketLabel(row))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(bucketColor(row))
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
                Text("Nothing overdue or due today. You're clear.")
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
        VStack(alignment: .leading, spacing: 1) {
            Label(entry.rows.isEmpty ? "Today: clear" : "Today: \(entry.rows.count)", systemImage: "checklist")
                .font(.headline)
            if let first = entry.rows.first {
                Text(first.item.title).font(.caption).lineLimit(1)
            }
            if entry.rows.count > 1 {
                Text(entry.rows[1].item.title).font(.caption).lineLimit(1)
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
    let kind = "RippleTodayWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayProvider()) { entry in
            RippleTodayWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Ripple Today")
        .description("Your most pressing tasks: overdue, due today, high priority.")
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
