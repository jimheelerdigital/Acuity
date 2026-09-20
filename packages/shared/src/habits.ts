/**
 * Habit streaks and scheduling.
 *
 * Shared so web and mobile compute a streak the same way — two
 * implementations of "what's my streak" that disagree is the kind of bug
 * users notice immediately and we can never reproduce.
 *
 * Everything here works in LOCAL CALENDAR DATES (`YYYY-MM-DD` strings), not
 * instants. "Did I do this today" is a question about the user's own day: a
 * check at 11pm in Sydney and one at 11pm in Los Angeles are both "today"
 * to the person tapping, even though they are different UTC dates.
 */

/** Server-side cap on habit reminders, separate from the 5 debrief ones. */
export const MAX_HABIT_REMINDERS = 3;

/** Sane ceiling on active habits. */
export const MAX_ACTIVE_HABITS = 12;

export interface HabitLike {
  id: string;
  name: string;
  daysActive: number[];
  archivedAt?: string | Date | null;
}

/** `YYYY-MM-DD` → day of week, 0=Sunday. Pure, no Date-parsing surprises. */
export function dayOfWeek(localDate: string): number {
  const [y, m, d] = localDate.split("-").map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return -1;
  // UTC constructor so the result cannot shift with the runtime's zone —
  // the string already IS the local date we care about.
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Step a `YYYY-MM-DD` by whole days, staying in calendar space. */
export function shiftDate(localDate: string, days: number): string {
  const [y, m, d] = localDate.split("-").map((n) => Number.parseInt(n, 10));
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

/** Is this habit expected on this date? */
export function isExpectedOn(habit: HabitLike, localDate: string): boolean {
  const dow = dayOfWeek(localDate);
  if (dow < 0) return false;
  return habit.daysActive.includes(dow);
}

/**
 * Current streak, in consecutive EXPECTED days completed.
 *
 * ── Two decisions that make this honest ──────────────────────────────
 *
 * 1. Days the habit is NOT expected are SKIPPED, not broken. A
 *    weekdays-only habit must not lose its streak every Saturday — that
 *    would punish the user for the schedule they chose.
 *
 * 2. TODAY does not break a streak if it is still unchecked. The day is not
 *    over. Counting from today would show "0" every morning to someone on a
 *    30-day run, which is both wrong and demoralising. Today counts when
 *    checked; otherwise we start from the previous expected day.
 *
 * `checkedDates` is a set of `YYYY-MM-DD` the user completed.
 */
export function currentStreak(
  habit: HabitLike,
  checkedDates: ReadonlySet<string>,
  today: string,
  maxLookbackDays = 400
): number {
  let streak = 0;
  let cursor = today;

  // If today is expected but not yet done, the streak is whatever ran up
  // to the last expected day — the day is still in progress.
  if (isExpectedOn(habit, today) && !checkedDates.has(today)) {
    cursor = shiftDate(today, -1);
  }

  for (let i = 0; i < maxLookbackDays; i += 1) {
    if (!isExpectedOn(habit, cursor)) {
      cursor = shiftDate(cursor, -1);
      continue;
    }
    if (!checkedDates.has(cursor)) break;
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }

  return streak;
}

/**
 * Which habits belong on Home today.
 *
 * Archived habits never appear; the check history survives archiving, but a
 * habit the user put away should not keep asking.
 */
export function habitsForToday<T extends HabitLike>(
  habits: readonly T[],
  today: string
): T[] {
  return habits.filter((h) => !h.archivedAt && isExpectedOn(h, today));
}

/**
 * A habit with no active days is paused, not broken.
 *
 * Surfaced as its own state so the UI can say "paused" rather than showing
 * a habit that silently never appears and looks like a bug.
 */
export function isPaused(habit: HabitLike): boolean {
  return !habit.archivedAt && habit.daysActive.length === 0;
}
