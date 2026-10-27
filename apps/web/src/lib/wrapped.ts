/**
 * Ripple Wrapped — monthly + year-end recap (2026-10-27).
 *
 * Pure computation over rows the route has already loaded and converted to
 * the user's LOCAL calendar dates. Deterministic, no AI. Every section has
 * its own minimum; anything below it is null and the app hides it.
 *
 * Thresholds:
 *   - Wrapped at all: 4+ completed entries (month) / 12+ (year).
 *   - Minutes talked: only if at least half the entries have an audio length.
 *   - Top themes: up to 3, each in 2+ entries.
 *   - Habit streak: the longest run of consecutive EXPECTED days checked,
 *     inside the period, 3+ days.
 *   - Tasks: shown once 1+ task was captured from a recording.
 *   - Biggest win: the win that came up most (2+ entries), else the most
 *     recent one. Shown on screen only, never in the shared text.
 *   - Person: the most-mentioned person, 3+ mentions, first name only.
 *   - Mood arc: weekly (month) / monthly (year) average moodScore, needs 2+
 *     buckets with a score.
 */
import {
  isExpectedOn,
  shiftDate,
  WRAPPED_MIN_ENTRIES,
  wrappedPeriodKey,
  wrappedPeriodLabel,
  wrappedPeriodRange,
  type HabitLike,
  type WrappedPeriod,
  type WrappedSummary,
} from "@acuity/shared";

export type WrappedEntryRow = {
  localDate: string;
  audioDuration: number | null; // seconds
  themes: string[];
  wins: string[];
  moodScore: number | null; // 1-10
};

export type WrappedTaskRow = {
  fromRecording: boolean;
  createdLocalDate: string;
  completedLocalDate: string | null;
};

export type WrappedHabitRow = HabitLike & { checkedDates: string[] };

export type WrappedPersonRow = { displayName: string; mentionDates: string[] };

export type WrappedInput = {
  period: WrappedPeriod;
  entries: WrappedEntryRow[];
  tasks: WrappedTaskRow[];
  habits: WrappedHabitRow[];
  people: WrappedPersonRow[];
};

export type Wrapped = WrappedSummary;

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const inRange = (d: string, r: { start: string; end: string }) => d >= r.start && d < r.end;

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** First word of a display name: never share a full name. */
export function firstNameOnly(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

function topThemes(entries: WrappedEntryRow[]): Wrapped["topThemes"] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const e of entries) {
    const seen = new Set<string>();
    for (const raw of e.themes ?? []) {
      const key = raw.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const cur = counts.get(key);
      if (cur) cur.n += 1;
      else counts.set(key, { label: raw.trim(), n: 1 });
    }
  }
  return [...counts.values()]
    .filter((c) => c.n >= 2)
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .slice(0, 3)
    .map((c) => ({ theme: titleCase(c.label), entries: c.n }));
}

/** Longest run of consecutive expected days checked, inside the range. */
export function longestRunInRange(
  habit: WrappedHabitRow,
  range: { start: string; end: string }
): number {
  const checked = new Set(habit.checkedDates);
  let best = 0;
  let run = 0;
  for (let d = range.start; d < range.end; d = shiftDate(d, 1)) {
    if (!isExpectedOn(habit, d)) continue;
    if (checked.has(d)) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

function biggestWin(entries: WrappedEntryRow[]): string | null {
  const counts = new Map<string, { label: string; n: number; last: string }>();
  for (const e of entries) {
    for (const raw of e.wins ?? []) {
      const label = raw.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      const cur = counts.get(key);
      if (cur) {
        cur.n += 1;
        if (e.localDate > cur.last) cur.last = e.localDate;
      } else counts.set(key, { label, n: 1, last: e.localDate });
    }
  }
  const all = [...counts.values()];
  if (all.length === 0) return null;
  const repeated = all.filter((c) => c.n >= 2).sort((a, b) => b.n - a.n || b.last.localeCompare(a.last));
  if (repeated.length > 0) return repeated[0].label;
  return all.sort((a, b) => b.last.localeCompare(a.last))[0].label;
}

function moodArc(period: WrappedPeriod, entries: WrappedEntryRow[]): Wrapped["moodArc"] {
  const buckets = new Map<string, { label: string; sum: number; n: number }>();
  for (const e of entries) {
    if (typeof e.moodScore !== "number") continue;
    let key: string;
    let label: string;
    if (period.kind === "year") {
      const m = Number(e.localDate.slice(5, 7));
      key = e.localDate.slice(0, 7);
      label = MONTH_SHORT[m - 1];
    } else {
      const day = Number(e.localDate.slice(8, 10));
      const week = Math.min(4, Math.floor((day - 1) / 7) + 1); // days 29-31 join week 4
      key = String(week);
      label = `Week ${week}`;
    }
    const b = buckets.get(key) ?? { label, sum: 0, n: 0 };
    b.sum += e.moodScore;
    b.n += 1;
    buckets.set(key, b);
  }
  const arc = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, b]) => ({ label: b.label, avg: Math.round((b.sum / b.n) * 10) / 10 }));
  return arc.length >= 2 ? arc : null;
}

export function computeWrapped(input: WrappedInput): Wrapped {
  const { period } = input;
  const range = wrappedPeriodRange(period);
  const entries = input.entries.filter((e) => inRange(e.localDate, range));
  const minEntries = WRAPPED_MIN_ENTRIES[period.kind];

  const durations = entries
    .map((e) => e.audioDuration)
    .filter((d): d is number => typeof d === "number" && d > 0);
  const minutesTalked =
    entries.length > 0 && durations.length >= entries.length / 2
      ? Math.max(1, Math.round(durations.reduce((a, b) => a + b, 0) / 60))
      : null;

  let habitStreak: Wrapped["habitStreak"] = null;
  for (const h of input.habits) {
    const days = longestRunInRange(h, range);
    if (days >= 3 && (!habitStreak || days > habitStreak.days)) {
      habitStreak = { habit: h.name, days };
    }
  }

  const recTasks = input.tasks.filter((t) => t.fromRecording && inRange(t.createdLocalDate, range));
  const tasks =
    recTasks.length > 0
      ? {
          captured: recTasks.length,
          completed: recTasks.filter((t) => t.completedLocalDate !== null).length,
        }
      : null;

  let person: Wrapped["person"] = null;
  for (const p of input.people) {
    const mentions = p.mentionDates.filter((d) => inRange(d, range)).length;
    const firstName = firstNameOnly(p.displayName);
    if (mentions >= 3 && firstName && (!person || mentions > person.mentions)) {
      person = { firstName, mentions };
    }
  }

  return {
    period: { key: wrappedPeriodKey(period), kind: period.kind, label: wrappedPeriodLabel(period) },
    eligible: entries.length >= minEntries,
    minEntries,
    entries: entries.length,
    daysJournaled: new Set(entries.map((e) => e.localDate)).size,
    minutesTalked,
    topThemes: topThemes(entries),
    habitStreak,
    tasks,
    biggestWin: biggestWin(entries),
    person,
    moodArc: moodArc(period, entries),
  };
}
