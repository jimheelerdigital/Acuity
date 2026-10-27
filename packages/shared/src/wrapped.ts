/**
 * Ripple Wrapped — period helpers shared by the web API and the app
 * (2026-10-27). Pure, works on local calendar dates (`YYYY-MM-DD`).
 *
 * Periods:
 *   - month: "YYYY-MM"  (a recap of one calendar month)
 *   - year:  "YYYY"     (the year-end recap)
 */

export type WrappedPeriod =
  | { kind: "month"; year: number; month: number } // month 1-12
  | { kind: "year"; year: number };

/** Minimum completed entries in the period before a Wrapped is shown. */
export const WRAPPED_MIN_ENTRIES = { month: 4, year: 12 } as const;

/** Days at the start of a month the previous month's Wrapped is offered. */
export const WRAPPED_MONTH_WINDOW_DAYS = 7;
/** The year-end Wrapped is offered from Dec 15 through Jan 7. */
export const WRAPPED_YEAR_FROM_DAY = 15;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n: number) => String(n).padStart(2, "0");

export function parseWrappedPeriod(raw: string | null | undefined): WrappedPeriod | null {
  if (!raw) return null;
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(raw.trim());
  if (!m) return null;
  const year = Number(m[1]);
  if (year < 2020 || year > 2100) return null;
  if (m[2] === undefined) return { kind: "year", year };
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { kind: "month", year, month };
}

export function wrappedPeriodKey(p: WrappedPeriod): string {
  return p.kind === "year" ? String(p.year) : `${p.year}-${pad(p.month)}`;
}

export function wrappedPeriodLabel(p: WrappedPeriod): string {
  return p.kind === "year" ? `Your ${p.year}` : `${MONTHS[p.month - 1]} ${p.year}`;
}

/** Inclusive start / exclusive end, as local date keys. */
export function wrappedPeriodRange(p: WrappedPeriod): { start: string; end: string } {
  if (p.kind === "year") {
    return { start: `${p.year}-01-01`, end: `${p.year + 1}-01-01` };
  }
  const nextY = p.month === 12 ? p.year + 1 : p.year;
  const nextM = p.month === 12 ? 1 : p.month + 1;
  return { start: `${p.year}-${pad(p.month)}-01`, end: `${nextY}-${pad(nextM)}-01` };
}

/** True when the period has started on or before `today` (YYYY-MM-DD). */
export function wrappedPeriodStarted(p: WrappedPeriod, today: string): boolean {
  return wrappedPeriodRange(p).start <= today;
}

/**
 * Which Wrapped (if any) the Insights card should offer on `today`.
 *   - Dec 15 – Dec 31: this year's Wrapped.
 *   - Jan 1 – Jan 7:   last year's Wrapped.
 *   - Days 1–7 of any other month: last month's Wrapped.
 *   - Otherwise: none.
 */
export function wrappedPeriodForCard(today: string): WrappedPeriod | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month === 12 && day >= WRAPPED_YEAR_FROM_DAY) return { kind: "year", year };
  if (month === 1 && day <= WRAPPED_MONTH_WINDOW_DAYS) return { kind: "year", year: year - 1 };
  if (day <= WRAPPED_MONTH_WINDOW_DAYS) {
    return month === 1
      ? { kind: "month", year: year - 1, month: 12 }
      : { kind: "month", year, month: month - 1 };
  }
  return null;
}

/** The recap the API returns (GET /api/insights/wrapped). */
export interface WrappedSummary {
  period: { key: string; kind: WrappedPeriod["kind"]; label: string };
  /** False below WRAPPED_MIN_ENTRIES: the app shows no recap. */
  eligible: boolean;
  minEntries: number;
  entries: number;
  daysJournaled: number;
  minutesTalked: number | null;
  topThemes: { theme: string; entries: number }[];
  habitStreak: { habit: string; days: number } | null;
  tasks: { captured: number; completed: number } | null;
  /** On screen only; never included in the shared text. */
  biggestWin: string | null;
  /** First name only. In the shared text only when the user opts in. */
  person: { firstName: string; mentions: number } | null;
  moodArc: { label: string; avg: number }[] | null;
}

/**
 * Text for the share sheet. Privacy rule: counts, top themes and the mood
 * trend only. Never transcript content, never the biggest win (it's lifted
 * from what the user said), never a habit's name (habits can be personal),
 * and a person's FIRST name only when `includePerson` is true (off by
 * default in the app). The app shows this exact text before sharing.
 */
export function wrappedShareText(
  w: WrappedSummary,
  opts: { includePerson?: boolean } = {}
): string {
  const lines: string[] = [`My ${w.period.kind === "year" ? w.period.label.replace(/^Your /, "") : w.period.label} on Ripple`];
  const talk = w.minutesTalked ? ` · ${w.minutesTalked} min of talking` : "";
  lines.push(`${w.entries} debriefs over ${w.daysJournaled} days${talk}`);
  if (w.topThemes.length > 0) {
    lines.push(`On my mind: ${w.topThemes.map((t) => t.theme).join(", ")}`);
  }
  if (w.habitStreak) {
    lines.push(`Longest habit streak: ${w.habitStreak.days} days`);
  }
  if (w.tasks) {
    lines.push(`${w.tasks.captured} to-dos captured just by talking, ${w.tasks.completed} done`);
  }
  if (w.moodArc && w.moodArc.length >= 2) {
    const first = w.moodArc[0].avg;
    const last = w.moodArc[w.moodArc.length - 1].avg;
    const trend = last - first >= 0.5 ? "trending up" : first - last >= 0.5 ? "a tougher stretch lately" : "pretty steady";
    lines.push(`Mood: ${trend}`);
  }
  if (opts.includePerson && w.person) {
    lines.push(`Most mentioned: ${w.person.firstName}`);
  }
  lines.push("goripple.io");
  return lines.join("\n");
}
