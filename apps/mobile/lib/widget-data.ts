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

/**
 * Publishes the home-screen widget's data into the shared App Group so the
 * WidgetKit extension (targets/widget) can read it. iOS only — a no-op on
 * Android. Serialization matches the widget's Swift decode:
 *   streak      -> Int    (setInt)
 *   habitsToday -> [{name, done:0|1}] JSON (setArray)
 * After writing we ask WidgetKit to reload so the change shows promptly.
 */
const APP_GROUP = "group.com.heelerdigital.acuity";
const storage = Platform.OS === "ios" ? new ExtensionStorage(APP_GROUP) : null;

export function publishHabitsToWidget(
  habits: Habit[],
  checks: HabitCheckRow[]
): void {
  if (!storage) return;
  try {
    const today = todayLocalDate();
    const byHabit = checksByHabit(checks);
    const due = habits.filter((h) => !h.archivedAt && isExpectedOn(h, today));
    const habitsToday = due.map((h) => ({
      name: h.name,
      done: byHabit.get(h.id)?.has(today) ? 1 : 0,
    }));
    // Headline number = the best current streak among today's habits.
    const streak = due.reduce(
      (max, h) =>
        Math.max(max, currentStreak(h, byHabit.get(h.id) ?? new Set(), today)),
      0
    );
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
