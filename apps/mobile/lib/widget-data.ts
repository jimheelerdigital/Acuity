import { Platform } from "react-native";
import { ExtensionStorage } from "@bacons/apple-targets";

import { currentStreak, isExpectedOn } from "@acuity/shared";
import {
  checksByHabit,
  todayLocalDate,
  type Habit,
  type HabitCheckRow,
} from "@/lib/habits-api";
import { publishSiriHabits } from "@/lib/siri-shortcuts-data";
import {
  dueYmdOf,
  isHighPriority,
  localYmd,
  taskLabel,
  type TodayTaskInput,
} from "@/lib/today-tasks";
import {
  clearAndroidWidget,
  publishAndroidWidget,
} from "@/lib/android-widget/update";

/**
 * Publishes the home-screen widget's data.
 *
 * iOS: into the shared App Group so the WidgetKit extension
 * (targets/widget) can read it. Serialization matches the widget's Swift
 * decode:
 *   streak      -> Int    (setInt)
 *   habitsToday -> [{name, done:0|1}] JSON (setArray)
 * After writing we ask WidgetKit to reload so the change shows promptly.
 *
 * Android: the same streak + today's habits go to the
 * react-native-android-widget snapshot (lib/android-widget), then every
 * placed Ripple widget is redrawn.
 */
const APP_GROUP = "group.com.heelerdigital.acuity";
const storage = Platform.OS === "ios" ? new ExtensionStorage(APP_GROUP) : null;

export function publishHabitsToWidget(
  habits: Habit[],
  checks: HabitCheckRow[]
): void {
  if (Platform.OS === "android") {
    try {
      const { streak, habitsToday, today } = computeWidgetData(habits, checks);
      void publishAndroidWidget({
        streak,
        habits: habitsToday.map((h) => ({ name: h.name, done: h.done === 1 })),
        localDate: today,
      }).catch(() => {});
    } catch {
      // Best-effort, same as iOS.
    }
    return;
  }
  if (!storage) return;
  try {
    const { streak, habitsToday } = computeWidgetData(habits, checks);
    storage.set("streak", streak);
    storage.set("habitsToday", habitsToday);
    storage.set("updatedAt", Date.now());
    ExtensionStorage.reloadWidget();
    // Also publish the full active-habit list (id + name) so the Siri
    // "check off <habit>" intent can resolve what the user says.
    publishSiriHabits(habits);
  } catch {
    // Widget data is best-effort; never let it break the app.
  }
}

/**
 * Streak + today's due habits — the numbers both platforms' widgets show.
 * Headline number = the best current streak among today's habits.
 */
function computeWidgetData(habits: Habit[], checks: HabitCheckRow[]) {
  const today = todayLocalDate();
  const byHabit = checksByHabit(checks);
  const due = habits.filter((h) => !h.archivedAt && isExpectedOn(h, today));
  const habitsToday = due.map((h) => ({
    name: h.name,
    done: byHabit.get(h.id)?.has(today) ? 1 : 0,
  }));
  const streak = due.reduce(
    (max, h) =>
      Math.max(max, currentStreak(h, byHabit.get(h.id) ?? new Set(), today)),
    0
  );
  return { today, habitsToday, streak };
}

/**
 * Sign-out: wipe the widget data so the next person on this device never
 * sees the previous user's habits on the home screen. Both platforms.
 */
export async function clearWidgetData(): Promise<void> {
  try {
    if (Platform.OS === "android") {
      await clearAndroidWidget();
      return;
    }
    if (!storage) return;
    storage.set("streak", 0);
    storage.set("habitsToday", []);
    storage.set("todayTasks", []);
    storage.set("updatedAt", Date.now());
    ExtensionStorage.reloadWidget();
  } catch {
    // Best-effort.
  }
}

/**
 * Publishes the resolved theme colors into the App Group so the phone-side
 * WatchConnectivity sender (plugins/RippleWatchConnectivity.swift) can hand them
 * to the watch. The watch uses these for its accent + the record orb gradient,
 * so changing palette on the phone reflects on the wrist. iOS only.
 * Hex strings (e.g. "#ED9672"); watch parses them. Note: watchOS has no light
 * mode, so only the accent/brand colors cross over — not a light/dark flip.
 */
export function publishThemeToWatch(theme: {
  primary: string;
  primaryHi: string;
  secondary: string;
  accent: string;
}): void {
  if (!storage) return;
  try {
    storage.set("themePrimary", theme.primary);
    storage.set("themePrimaryHi", theme.primaryHi);
    storage.set("themeSecondary", theme.secondary);
    storage.set("themeAccent", theme.accent);
  } catch {
    // Best-effort; never break the app over watch theming.
  }
}

/**
 * "Today" widget (1.9.1). iOS only for now.
 *
 * Publishes every open task that is, or will soon become, pressing — not
 * just today's top 5 — so the widget can roll over at midnight and when a
 * snooze ends without the app running. The widget applies the same rule
 * as lib/today-tasks.ts (`selectToday` in targets/widget/index.swift).
 *
 * App Group key `todayTasks` -> JSON array of
 *   { id, title, due: "YYYY-MM-DD" | "", high: 0|1, rank: 0..3|9,
 *     snoozedUntil: epoch seconds | 0 }
 * plus `todayUpdatedAt` (ms). Sign-out clears it (clearWidgetData).
 */
const TODAY_WIDGET_MAX = 40;
const TODAY_HORIZON_DAYS = 14;
const RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export function publishTodayToWidget(tasks: readonly TodayTaskInput[]): void {
  if (!storage) return;
  try {
    const now = new Date();
    const horizon = localYmd(
      new Date(now.getTime() + TODAY_HORIZON_DAYS * 24 * 60 * 60 * 1000)
    );
    const items: Record<string, string | number>[] = [];
    for (const t of tasks) {
      if (t.status === "DONE") continue;
      const due = dueYmdOf(t.dueDate);
      const high = isHighPriority(t.priority);
      // Only tasks that can show up within the horizon.
      if (due ? due > horizon : !high) continue;
      let snoozedUntil = 0;
      if (t.status === "SNOOZED") {
        const ms = t.snoozedUntil ? new Date(t.snoozedUntil).getTime() : NaN;
        if (!Number.isFinite(ms)) continue; // snoozed with no end: hidden
        if (ms > now.getTime()) snoozedUntil = Math.floor(ms / 1000);
      }
      items.push({
        id: t.id,
        title: taskLabel(t).slice(0, 120),
        due: due ?? "",
        high: high ? 1 : 0,
        rank: RANK[t.priority] ?? 9,
        snoozedUntil,
      });
      if (items.length >= TODAY_WIDGET_MAX) break;
    }
    storage.set("todayTasks", items);
    storage.set("todayUpdatedAt", Date.now());
    ExtensionStorage.reloadWidget("RippleTodayWidget");
  } catch {
    // Widget data is best-effort; never let it break the app.
  }
}
