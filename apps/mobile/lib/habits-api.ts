import { api } from "@/lib/api";
import { currentStreak, type HabitLike } from "@acuity/shared";

/**
 * Habits client.
 *
 * Streaks are computed HERE, from the checks the server returns, using the
 * shared implementation. The server deliberately does not compute them: it
 * does not reliably know the user's local calendar day, and a streak
 * computed against the wrong day is the kind of bug a user sees instantly
 * and we can never reproduce.
 */

export interface Habit extends HabitLike {
  id: string;
  name: string;
  daysActive: number[];
  archivedAt: string | null;
  sortOrder: number;
  createdAt: string;
}

/**
 * How a check came to exist.
 *
 * "MANUAL" — the user tapped it.
 * "DEBRIEF" — the extraction pipeline found evidence of the habit in a
 *   debrief and checked it off for them.
 *
 * Widened to `string` rather than a union because the value crosses a
 * network boundary from a server that may ship a new source before this
 * client does; an unknown value must degrade to "not a debrief check",
 * not crash the screen.
 */
export type HabitCheckSource = string;

export interface HabitCheckRow {
  habitId: string;
  localDate: string;
  /** Absent on responses from a server predating source provenance. */
  source?: HabitCheckSource;
}

/** The one value that means "the app checked this off for you". */
export const DEBRIEF_SOURCE = "DEBRIEF";

export interface HabitsPayload {
  habits: Habit[];
  checks: HabitCheckRow[];
}

/** Today's date in the DEVICE's local zone, as YYYY-MM-DD. */
export function todayLocalDate(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export async function fetchHabits(): Promise<HabitsPayload> {
  const res = await api.get<HabitsPayload>("/api/habits");
  return { habits: res?.habits ?? [], checks: res?.checks ?? [] };
}

export async function createHabit(
  name: string,
  daysActive?: number[]
): Promise<Habit | null> {
  const res = await api.post<{ habit: Habit }>("/api/habits", {
    name,
    ...(daysActive ? { daysActive } : {}),
  });
  return res?.habit ?? null;
}

export async function setHabitCheck(
  habitId: string,
  checked: boolean,
  localDate: string = todayLocalDate()
): Promise<boolean> {
  const res = await api.post<{ ok: boolean }>(
    `/api/habits/${habitId}/check`,
    { localDate, checked }
  );
  return !!res?.ok;
}

/** Index checks by habit for streak math. */
export function checksByHabit(
  checks: HabitCheckRow[]
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const c of checks) {
    let set = map.get(c.habitId);
    if (!set) {
      set = new Set();
      map.set(c.habitId, set);
    }
    set.add(c.localDate);
  }
  return map;
}

/**
 * Index ONLY the debrief-created checks, by habit.
 *
 * Deliberately separate from `checksByHabit`: streak math must not care
 * how a day was checked, so that function keeps returning plain date sets
 * and this one carries the provenance the UI needs. Merging them would
 * put a display concern inside the streak path.
 *
 * A row with no `source` (older server, older cached payload) is treated
 * as manual — the safe direction, since claiming the app auto-checked
 * something it did not is worse than showing no marker.
 */
export function debriefChecksByHabit(
  checks: HabitCheckRow[]
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const c of checks) {
    if (c.source !== DEBRIEF_SOURCE) continue;
    let set = map.get(c.habitId);
    if (!set) {
      set = new Set();
      map.set(c.habitId, set);
    }
    set.add(c.localDate);
  }
  return map;
}

export function streakFor(
  habit: Habit,
  checks: Map<string, Set<string>>,
  today: string = todayLocalDate()
): number {
  return currentStreak(habit, checks.get(habit.id) ?? new Set(), today);
}
