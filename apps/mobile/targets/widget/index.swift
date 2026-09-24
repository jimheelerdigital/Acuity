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

@main
struct RippleWidgetBundle: WidgetBundle {
    var body: some Widget {
        RippleWidget()
    }
}
