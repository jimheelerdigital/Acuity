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
  /** "standard" | "reflection". The reflection habit self-completes on record. */
  type: string;
  daysActive: number[];
  archivedAt: string | null;
  sortOrder: number;
  createdAt: string;
}

/** The one self-completing habit: doing your daily Ripple debrief. */
export const REFLECTION_HABIT_TYPE = "reflection";
/** Default name for the suggested reflection habit (one-tap add). */
export const REFLECTION_HABIT_NAME = "Daily Reflection with Ripple";

export function isReflectionHabit(h: Pick<Habit, "type">): boolean {
  return h.type === REFLECTION_HABIT_TYPE;
}

export interface HabitCheckRow {
  habitId: string;
  localDate: string;
}

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

/** Archived (soft-deleted) habits, most-recently-archived first, + checks. */
export async function fetchArchivedHabits(): Promise<HabitsPayload> {
  const res = await api.get<HabitsPayload>("/api/habits?archived=1");
  return { habits: res?.habits ?? [], checks: res?.checks ?? [] };
}

export async function createHabit(
  name: string,
  daysActive?: number[],
  type?: string
): Promise<Habit | null> {
  const res = await api.post<{ habit: Habit }>("/api/habits", {
    name,
    ...(daysActive ? { daysActive } : {}),
    ...(type ? { type } : {}),
  });
  return res?.habit ?? null;
}

/**
 * One-tap add of the suggested "Daily Reflection with Ripple" habit. The
 * server is idempotent on the reflection type, so a double-tap can't create
 * a duplicate — it returns the existing one.
 */
export async function addReflectionHabit(): Promise<Habit | null> {
  return createHabit(REFLECTION_HABIT_NAME, undefined, REFLECTION_HABIT_TYPE);
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

export function streakFor(
  habit: Habit,
  checks: Map<string, Set<string>>,
  today: string = todayLocalDate()
): number {
  return currentStreak(habit, checks.get(habit.id) ?? new Set(), today);
}

/** Rename and/or change active days (empty daysActive = paused). */
export async function updateHabit(
  id: string,
  fields: { name?: string; daysActive?: number[] }
): Promise<Habit | null> {
  const res = await api.patch<{ habit: Habit }>(`/api/habits/${id}`, fields);
  return res?.habit ?? null;
}

/** Archive (soft delete). Check history is kept server-side. */
export async function archiveHabit(id: string): Promise<boolean> {
  const res = await api.del<{ ok: boolean }>(`/api/habits/${id}`);
  return !!res?.ok;
}

/**
 * Restore (unarchive) a previously deleted habit. Throws with the server's
 * message when it can't (e.g. you're at the active-habit cap), so the caller
 * can surface it.
 */
export async function unarchiveHabit(id: string): Promise<Habit | null> {
  const res = await api.patch<{ habit: Habit }>(`/api/habits/${id}`, {
    archived: false,
  });
  return res?.habit ?? null;
}

// ─── Per-habit reminders (nudges) ────────────────────────────────────
// Reuses the UserReminder infra (kind="habit"). The nudge follows the
// habit's own daysActive; the client only chooses the time + on/off.

export interface HabitReminder {
  id: string;
  time: string; // HH:MM, user's local zone
  daysActive: number[];
  enabled: boolean;
  habitId: string | null;
}

export async function fetchHabitReminders(): Promise<{
  reminders: HabitReminder[];
  cap: number;
}> {
  const res = await api.get<{ reminders: HabitReminder[]; cap: number }>(
    "/api/habits/reminders"
  );
  return { reminders: res?.reminders ?? [], cap: res?.cap ?? 3 };
}

/** Set (or move) the nudge time for one habit. */
export async function setHabitReminder(
  habitId: string,
  time: string
): Promise<HabitReminder | null> {
  const res = await api.put<{ reminder: HabitReminder }>(
    "/api/habits/reminders",
    { habitId, time, enabled: true }
  );
  return res?.reminder ?? null;
}

/** Turn off (delete) the nudge for one habit. */
export async function clearHabitReminder(habitId: string): Promise<boolean> {
  const res = await api.put<{ ok?: boolean; enabled?: boolean }>(
    "/api/habits/reminders",
    { habitId, enabled: false }
  );
  return res?.enabled === false || !!res?.ok;
}
