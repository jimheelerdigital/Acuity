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

/** A habit banks one freeze per this many consecutive completed expected days. */
export const FREEZE_EARN_EVERY = 7;
/** Most freezes a habit can bank at once. */
export const MAX_BANKED_FREEZES = 2;

export interface StreakState {
  /** Consecutive EXPECTED days completed (frozen days keep it alive but don't add). */
  streak: number;
  /** Longest such run in the window, with the same freeze rules. */
  best: number;
  /** Freezes banked right now (0..MAX_BANKED_FREEZES). */
  freezesBanked: number;
  /** Missed expected days a freeze covered (shown as ❄️, not ✓). */
  frozenDates: Set<string>;
}

/**
 * Streak with freezes (2026-10-27), derived purely from check history: no
 * stored state, no cron. The same history always gives the same answer, on
 * web, mobile and the widget alike.
 *
 * ── The rules ─────────────────────────────────────────────────────────
 * - Days the habit is NOT expected are skipped, never a break (a
 *   weekdays-only habit keeps its streak over the weekend).
 * - TODAY unchecked is "in progress", never a miss.
 * - Every FREEZE_EARN_EVERY consecutive completed expected days bank one
 *   freeze, up to MAX_BANKED_FREEZES. The earn counter keeps going across a
 *   frozen day and resets when the streak breaks.
 * - A missed expected day uses a banked freeze automatically: the streak
 *   survives, the day is frozen (it does NOT count as done).
 * - A freeze covers ONE missed day. A miss right after a frozen day breaks
 *   the streak even with a freeze left, so freezes can't paper over a lapse.
 * - Banked freezes survive a break (they were earned).
 *
 * The walk starts at the habit's createdAt when known, else the first check
 * in the window, so days before the habit existed are never "missed".
 */
export function streakState(
  habit: HabitLike & { createdAt?: string | Date | null },
  checkedDates: ReadonlySet<string>,
  today: string,
  maxLookbackDays = 400
): StreakState {
  const windowStart = shiftDate(today, -(maxLookbackDays - 1));
  let start = windowStart;
  const created = habit.createdAt ? toLocalDate(habit.createdAt) : null;
  if (created && created > start) start = created;
  if (!created) {
    let first: string | null = null;
    for (const d of checkedDates) {
      if (d >= windowStart && d <= today && (first === null || d < first)) first = d;
    }
    if (first === null) {
      return { streak: 0, best: 0, freezesBanked: 0, frozenDates: new Set() };
    }
    start = first;
  }

  let streak = 0;
  let best = 0;
  let earn = 0;
  let bank = 0;
  let prevFrozen = false;
  const frozenDates = new Set<string>();

  for (let d = start; d <= today; d = shiftDate(d, 1)) {
    if (!isExpectedOn(habit, d)) continue;
    const done = checkedDates.has(d);
    if (d === today && !done) break; // still in progress
    if (done) {
      streak += 1;
      earn += 1;
      if (earn % FREEZE_EARN_EVERY === 0) bank = Math.min(MAX_BANKED_FREEZES, bank + 1);
      prevFrozen = false;
      if (streak > best) best = streak;
    } else if (bank > 0 && !prevFrozen && streak > 0) {
      bank -= 1;
      frozenDates.add(d);
      prevFrozen = true;
    } else {
      streak = 0;
      earn = 0;
      prevFrozen = false;
    }
  }

  return { streak, best, freezesBanked: bank, frozenDates };
}

function toLocalDate(v: string | Date): string {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const t = typeof v === "string" ? new Date(v) : v;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

/**
 * Current streak, in consecutive EXPECTED days completed, with streak
 * freezes applied (see streakState for the rules). Days the habit is not
 * expected are skipped, and an unchecked TODAY never breaks the streak.
 * `checkedDates` is a set of `YYYY-MM-DD` the user completed.
 */
export function currentStreak(
  habit: HabitLike & { createdAt?: string | Date | null },
  checkedDates: ReadonlySet<string>,
  today: string,
  maxLookbackDays = 400
): number {
  return streakState(habit, checkedDates, today, maxLookbackDays).streak;
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

/**
 * Longest run of consecutive EXPECTED days completed over the lookback
 * window, with the same rules (and freezes) as currentStreak, so "best" can
 * never be lower than "current".
 */
export function bestStreak(
  habit: HabitLike & { createdAt?: string | Date | null },
  checkedDates: ReadonlySet<string>,
  today: string,
  maxLookbackDays = 400
): number {
  return streakState(habit, checkedDates, today, maxLookbackDays).best;
}

/**
 * Completion rate over the last `days` calendar days: of the days the habit
 * was EXPECTED (and already over), how many were completed. Today is only
 * counted once it's been checked — an unchecked "today" is still in
 * progress and would otherwise drag the rate down every morning.
 */
export function completionRate(
  habit: HabitLike,
  checkedDates: ReadonlySet<string>,
  today: string,
  days = 30
): { done: number; expected: number; pct: number } {
  let done = 0;
  let expected = 0;
  for (let i = 0; i < days; i += 1) {
    const date = shiftDate(today, -i);
    if (!isExpectedOn(habit, date)) continue;
    const checked = checkedDates.has(date);
    if (i === 0 && !checked) continue; // today, still in progress
    expected += 1;
    if (checked) done += 1;
  }
  const pct = expected === 0 ? 0 : Math.round((done / expected) * 100);
  return { done, expected, pct };
}
