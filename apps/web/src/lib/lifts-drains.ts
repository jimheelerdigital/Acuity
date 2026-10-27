/**
 * "What lifts you, what drains you" (Insights, 2026-10-27).
 *
 * Compares the user's day-level mood (average Entry.moodScore, 1–10, per
 * local day) and, since 2026-10-27, energy (average Entry.energy, 1–10) on
 * days WITH a factor against days WITHOUT it:
 *   - a theme came up (Entry.themes)
 *   - a person was mentioned (EntityMention → Person)
 *   - a habit was done vs skipped, on days it was expected
 *   - a busy calendar day (3+ timed events) vs a lighter one, only when
 *     the user has connected a calendar
 *
 * Apple Health (sleep, steps, HRV, active minutes) is deliberately NOT
 * here: the existing Health & mood card (/api/insights/health-correlations)
 * already reports it, and repeating it would show the same finding twice.
 *
 * Honesty rules — this is correlation over small samples, so:
 *   - at least MIN_SCORED_DAYS days with a mood score in the window;
 *   - each comparison needs MIN_DAYS_PER_SIDE days on BOTH sides;
 *   - the gap must be at least MIN_DELTA points on the 1–10 scale;
 *   - at most MAX_PER_SIDE lifts and MAX_PER_SIDE drains, biggest first;
 *   - copy says "tended to", never "makes you";
 *   - mood and energy use the same rules. When both qualify for one factor
 *     it's shown ONCE, ranked by the larger gap, with both numbers in the
 *     sentence ("your mood tended to be higher (7.4 vs 5.9) and your energy
 *     too (7.2 vs 5.1)").
 * Pure: no I/O. The route (app/api/insights/lifts-drains) gathers rows.
 */
import { isExpectedOn } from "@acuity/shared";

export const WINDOW_DAYS = 60;
export const MIN_SCORED_DAYS = 10;
export const MIN_DAYS_PER_SIDE = 4;
export const MIN_DELTA = 0.75;
export const MAX_PER_SIDE = 3;
export const BUSY_EVENT_COUNT = 3;

export type FactorKind = "theme" | "person" | "habit" | "calendar";
export type Metric = "mood" | "energy";

/** One local day that has at least one mood-scored entry. */
export type MoodDay = {
  date: string; // YYYY-MM-DD, user's local day
  mood: number; // average moodScore that day (1–10)
  energy?: number | null; // average energy that day (1–10), when recorded
  themes: string[]; // display names, any case
  people: string[]; // person display names
};

export type HabitInput = {
  name: string;
  daysActive: number[];
  createdDate: string; // YYYY-MM-DD (local) the habit was created
  archivedDate: string | null; // YYYY-MM-DD (local) archived, if any
  checkedDates: Set<string>;
};

/** One metric's comparison for a factor. */
export type MetricComparison = {
  metric: Metric;
  direction: "lift" | "drain";
  withAvg: number;
  withoutAvg: number;
  withDays: number;
  withoutDays: number;
};

export type LiftDrain = {
  kind: FactorKind;
  label: string;
  /** The metric with the larger gap; it decides placement and ranking. */
  metric: Metric;
  direction: "lift" | "drain";
  withAvg: number;
  withoutAvg: number;
  withDays: number;
  withoutDays: number;
  /** The other metric, when it also cleared every threshold. */
  also: MetricComparison | null;
  observation: string;
};

export type LiftsDrainsResult = {
  lifts: LiftDrain[];
  drains: LiftDrain[];
  scoredDays: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

type Candidate = {
  kind: FactorKind;
  label: string;
  withDays: MoodDay[];
  withoutDays: MoodDay[];
};

function compare(c: Candidate, metric: Metric): MetricComparison | null {
  const val = (d: MoodDay) => (metric === "mood" ? d.mood : d.energy ?? null);
  const withVals = c.withDays.map(val).filter((v): v is number => v != null);
  const withoutVals = c.withoutDays.map(val).filter((v): v is number => v != null);
  if (withVals.length < MIN_DAYS_PER_SIDE) return null;
  if (withoutVals.length < MIN_DAYS_PER_SIDE) return null;
  const withAvg = mean(withVals);
  const withoutAvg = mean(withoutVals);
  const delta = withAvg - withoutAvg;
  if (Math.abs(delta) < MIN_DELTA) return null;
  return {
    metric,
    direction: delta > 0 ? "lift" : "drain",
    withAvg: round1(withAvg),
    withoutAvg: round1(withoutAvg),
    withDays: withVals.length,
    withoutDays: withoutVals.length,
  };
}

const gapOf = (m: { withAvg: number; withoutAvg: number }) =>
  Math.abs(m.withAvg - m.withoutAvg);

function evaluate(c: Candidate, metrics: Metric[]): LiftDrain | null {
  const found = metrics
    .map((m) => compare(c, m))
    .filter((m): m is MetricComparison => m !== null)
    .sort((a, b) => gapOf(b) - gapOf(a));
  if (found.length === 0) return null;
  const [primary, other] = found;
  const out: LiftDrain = {
    kind: c.kind,
    label: c.label,
    ...primary,
    also: other ?? null,
    observation: "",
  };
  out.observation = observationFor(out);
  return out;
}

function metricPhrase(m: { metric: Metric; direction: "lift" | "drain"; withAvg: number; withoutAvg: number }) {
  const word = m.direction === "lift" ? "higher" : "lower";
  return { word, nums: `(${m.withAvg} vs ${m.withoutAvg})`, noun: m.metric };
}

export function observationFor(f: LiftDrain): string {
  const p = metricPhrase(f);
  let effect = `your ${p.noun} tended to be ${p.word}`;
  const skipped = f.kind === "habit" ? " than days you skipped it" : "";
  effect += `${skipped} ${p.nums}`;
  if (f.also) {
    const a = metricPhrase(f.also);
    effect +=
      a.word === p.word
        ? ` and your ${a.noun} too ${a.nums}`
        : `, while your ${a.noun} tended to be ${a.word} ${a.nums}`;
  }
  switch (f.kind) {
    case "theme":
      return `On days ${f.label} came up, ${effect}.`;
    case "person":
      return `On days you mentioned ${f.label}, ${effect}.`;
    case "habit":
      return `On days you did ${f.label}, ${effect}.`;
    case "calendar":
      return `On busier calendar days (${BUSY_EVENT_COUNT}+ events), ${effect}.`;
  }
}

/** Display label: the most common original spelling for a lower-cased key. */
function labelMap(days: MoodDay[], pick: (d: MoodDay) => string[]) {
  const byKey = new Map<string, Map<string, number>>();
  for (const d of days) {
    for (const raw of new Set(pick(d).map((s) => s.trim()).filter(Boolean))) {
      const key = raw.toLowerCase();
      const spellings = byKey.get(key) ?? new Map<string, number>();
      spellings.set(raw, (spellings.get(raw) ?? 0) + 1);
      byKey.set(key, spellings);
    }
  }
  const labels = new Map<string, string>();
  for (const [key, spellings] of byKey) {
    const best = [...spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
    labels.set(key, best);
  }
  return labels;
}

function presenceCandidates(
  days: MoodDay[],
  kind: "theme" | "person",
  pick: (d: MoodDay) => string[]
): Candidate[] {
  const labels = labelMap(days, pick);
  const out: Candidate[] = [];
  for (const [key, label] of labels) {
    const withDays: MoodDay[] = [];
    const withoutDays: MoodDay[] = [];
    for (const d of days) {
      const has = pick(d).some((s) => s.trim().toLowerCase() === key);
      (has ? withDays : withoutDays).push(d);
    }
    out.push({ kind, label, withDays, withoutDays });
  }
  return out;
}

function habitCandidates(days: MoodDay[], habits: HabitInput[]): Candidate[] {
  return habits.map((h) => {
    const withDays: MoodDay[] = [];
    const withoutDays: MoodDay[] = [];
    for (const d of days) {
      if (d.date < h.createdDate) continue;
      if (h.archivedDate && d.date > h.archivedDate) continue;
      if (!isExpectedOn({ id: "", name: h.name, daysActive: h.daysActive }, d.date)) continue;
      (h.checkedDates.has(d.date) ? withDays : withoutDays).push(d);
    }
    return { kind: "habit" as const, label: h.name, withDays, withoutDays };
  });
}

function calendarCandidate(
  days: MoodDay[],
  eventsByDay: Map<string, number> | null
): Candidate | null {
  if (!eventsByDay || eventsByDay.size === 0) return null; // no calendar data
  // Only days since the calendar's first stored event: before that, an
  // empty day means "not connected yet", not "a light day".
  const firstDay = [...eventsByDay.keys()].sort()[0];
  const withDays: MoodDay[] = [];
  const withoutDays: MoodDay[] = [];
  for (const d of days) {
    if (d.date < firstDay) continue;
    const n = eventsByDay.get(d.date) ?? 0;
    (n >= BUSY_EVENT_COUNT ? withDays : withoutDays).push(d);
  }
  return { kind: "calendar", label: "Busy calendar days", withDays, withoutDays };
}

export function computeLiftsDrains(input: {
  days: MoodDay[];
  habits: HabitInput[];
  /** Timed calendar events per local day; null when no calendar is connected. */
  eventsByDay: Map<string, number> | null;
}): LiftsDrainsResult {
  const { days } = input;
  const empty = { lifts: [], drains: [], scoredDays: days.length };
  if (days.length < MIN_SCORED_DAYS) return empty;

  const candidates: Candidate[] = [
    ...presenceCandidates(days, "theme", (d) => d.themes),
    ...presenceCandidates(days, "person", (d) => d.people),
    ...habitCandidates(days, input.habits),
  ];
  const cal = calendarCandidate(days, input.eventsByDay);
  if (cal) candidates.push(cal);

  // Energy joins only with enough energy-scored days of its own.
  const energyDays = days.filter((d) => d.energy != null).length;
  const metrics: Metric[] =
    energyDays >= MIN_SCORED_DAYS ? ["mood", "energy"] : ["mood"];

  const found = candidates
    .map((c) => evaluate(c, metrics))
    .filter((f): f is LiftDrain => f !== null);

  // A theme and a person can share a name ("Mom"); keep the stronger one.
  const byLabel = new Map<string, LiftDrain>();
  for (const f of found) {
    const key = f.label.toLowerCase();
    const prev = byLabel.get(key);
    const gap = (x: LiftDrain) => Math.abs(x.withAvg - x.withoutAvg);
    if (!prev || gap(f) > gap(prev)) byLabel.set(key, f);
  }
  const unique = [...byLabel.values()];
  const gap = (x: LiftDrain) => x.withAvg - x.withoutAvg;

  const lifts = unique
    .filter((f) => f.direction === "lift")
    .sort((a, b) => gap(b) - gap(a) || b.withDays - a.withDays)
    .slice(0, MAX_PER_SIDE);
  const drains = unique
    .filter((f) => f.direction === "drain")
    .sort((a, b) => gap(a) - gap(b) || b.withDays - a.withDays)
    .slice(0, MAX_PER_SIDE);

  return { lifts, drains, scoredDays: days.length };
}
