/**
 * Open loops (Insights, 2026-10-27): things that keep coming up without
 * resolving, and goals that have gone quiet. Deterministic, no AI.
 *
 *  1. Recurring worries: a theme that came up in 3+ distinct weeks, OR
 *     3+ debriefs spanning 14+ days, is still present in the last 10
 *     days, AND was talked about negatively (ThemeMention.sentiment) at
 *     least twice. Sentiment varies mention to mention, so recurrence is
 *     counted over all mentions. Entry.blockers isn't used: it's free
 *     text that never repeats verbatim (checked on prod data).
 *  2. Quiet goals: an active goal (NOT_STARTED / IN_PROGRESS) that had
 *     been mentioned before, but not in the last 21 days. Goals quiet for
 *     more than 120 days are left out: by then it reads as nagging about
 *     something the user has moved on from.
 *
 * At most 3 items: up to 2 worries first, goals fill the rest.
 *
 * Safety: theme names and goal titles that look like crisis or harm
 * content are never surfaced (CRISIS_PATTERN). This is a card about
 * everyday loops; it must not hand someone their darkest entry back as a
 * "pattern".
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

export const WORRY_LOOKBACK_DAYS = 90;
export const WORRY_MIN_WEEKS = 3;
export const WORRY_MIN_MENTIONS = 3;
export const WORRY_MIN_SPAN_DAYS = 14;
export const WORRY_MIN_NEGATIVE = 2;
export const WORRY_RECENT_DAYS = 10;
export const GOAL_QUIET_MIN_DAYS = 21;
export const GOAL_QUIET_MAX_DAYS = 120;
export const MAX_ITEMS = 3;
export const MAX_WORRIES = 2;

const ACTIVE_GOAL_STATUSES = new Set(["NOT_STARTED", "IN_PROGRESS"]);

/**
 * Conservative crisis/harm filter for short labels (theme names, goal
 * titles). Over-matching is fine: a false positive just means one item
 * isn't shown.
 */
export const CRISIS_PATTERN =
  /suicid|self[\s-]?harm|self[\s-]?injur|kill(ing)?\s+(my|him|her)self|end(ing)?\s+(it\s+all|my\s+life)|want(ing)?\s+to\s+die|overdos|cutting|hurt(ing)?\s+(my|him|her)self|abuse|assault|rape|relapse|violence/i;

export function isSensitiveLabel(label: string): boolean {
  return CRISIS_PATTERN.test(label);
}

export type WorryMention = {
  themeId: string;
  themeName: string;
  entryId: string;
  createdAt: Date;
  sentiment: string;
};

export type GoalForLoops = {
  id: string;
  title: string;
  status: string;
  lastMentionedAt: Date | null;
  entryRefsCount: number;
};

export type OpenLoop =
  | {
      kind: "worry";
      themeId: string;
      label: string;
      text: string;
      mentions: number;
      weeks: number;
      weeksRunning: number;
    }
  | {
      kind: "quiet_goal";
      goalId: string;
      label: string;
      text: string;
      daysQuiet: number;
    };

/** Week bucket counted back from `now` (0 = the last 7 days). */
function weekIndex(now: Date, d: Date): number {
  return Math.floor((now.getTime() - d.getTime()) / WEEK_MS);
}

function displayTheme(name: string): string {
  const t = name.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

export function findRecurringWorries(
  mentions: WorryMention[],
  now: Date = new Date()
): Extract<OpenLoop, { kind: "worry" }>[] {
  const lookbackStart = now.getTime() - WORRY_LOOKBACK_DAYS * DAY_MS;
  const byTheme = new Map<
    string,
    { name: string; entries: Map<string, Date>; negative: Set<string> }
  >();
  for (const m of mentions) {
    const t = m.createdAt.getTime();
    if (t < lookbackStart || t > now.getTime()) continue;
    if (!m.themeName || isSensitiveLabel(m.themeName)) continue;
    let g = byTheme.get(m.themeId);
    if (!g) {
      g = { name: m.themeName, entries: new Map(), negative: new Set() };
      byTheme.set(m.themeId, g);
    }
    g.entries.set(m.entryId, m.createdAt);
    if (m.sentiment === "NEGATIVE") g.negative.add(m.entryId);
  }

  const out: Extract<OpenLoop, { kind: "worry" }>[] = [];
  for (const [themeId, g] of byTheme) {
    const dates = [...g.entries.values()].sort((a, b) => a.getTime() - b.getTime());
    const count = dates.length;
    if (count < WORRY_MIN_MENTIONS || g.negative.size < WORRY_MIN_NEGATIVE) continue;
    const latest = dates[dates.length - 1];
    if (now.getTime() - latest.getTime() > WORRY_RECENT_DAYS * DAY_MS) continue;

    const weekSet = new Set(dates.map((d) => weekIndex(now, d)));
    const weeks = weekSet.size;
    const spanDays = (latest.getTime() - dates[0].getTime()) / DAY_MS;
    if (weeks < WORRY_MIN_WEEKS && spanDays < WORRY_MIN_SPAN_DAYS) continue;

    // Consecutive weeks ending at the most recent week with a mention.
    let weeksRunning = 0;
    for (let w = Math.min(...weekSet); weekSet.has(w); w++) weeksRunning++;

    const label = displayTheme(g.name);
    const text =
      weeksRunning >= WORRY_MIN_WEEKS
        ? `${label} has come up ${weeksRunning} weeks running`
        : `${label} keeps coming up: ${count} debriefs over ${Math.max(
            weeks,
            Math.ceil(spanDays / 7)
          )} weeks`;
    out.push({ kind: "worry", themeId, label, text, mentions: count, weeks, weeksRunning });
  }

  out.sort((a, b) => b.weeksRunning - a.weeksRunning || b.mentions - a.mentions);
  return out;
}

export function findQuietGoals(
  goals: GoalForLoops[],
  now: Date = new Date()
): Extract<OpenLoop, { kind: "quiet_goal" }>[] {
  const out: Extract<OpenLoop, { kind: "quiet_goal" }>[] = [];
  for (const g of goals) {
    if (!ACTIVE_GOAL_STATUSES.has(g.status)) continue;
    if (!g.lastMentionedAt || g.entryRefsCount < 1) continue;
    const title = g.title.trim();
    if (!title || isSensitiveLabel(title)) continue;
    const daysQuiet = Math.floor((now.getTime() - g.lastMentionedAt.getTime()) / DAY_MS);
    if (daysQuiet < GOAL_QUIET_MIN_DAYS || daysQuiet > GOAL_QUIET_MAX_DAYS) continue;
    out.push({
      kind: "quiet_goal",
      goalId: g.id,
      label: title,
      text: `You haven't mentioned “${title}” in ${daysQuiet} days`,
      daysQuiet,
    });
  }
  // Most recently gone quiet first: the freshest loops are the easiest to pick back up.
  out.sort((a, b) => a.daysQuiet - b.daysQuiet);
  return out;
}

export function computeOpenLoops(
  mentions: WorryMention[],
  goals: GoalForLoops[],
  now: Date = new Date()
): OpenLoop[] {
  const worries = findRecurringWorries(mentions, now).slice(0, MAX_WORRIES);
  const quiet = findQuietGoals(goals, now).slice(0, MAX_ITEMS - worries.length);
  return [...worries, ...quiet];
}
