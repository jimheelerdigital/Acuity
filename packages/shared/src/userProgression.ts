/**
 * userProgression — single source of truth for the guided 14-day
 * first-experience on Acuity. Pure function; no DB access. Callers
 * (web lib + mobile via API) fetch the user + entries + themes +
 * goals, then pipe them in.
 *
 * The output drives:
 *   - Home focus card ("here's what to do today")
 *   - Tip bubbles across feature pages
 *   - Empty-state copy for not-yet-unlocked features
 *   - Streak celebrations
 *   - Email cadence (Phase 2+)
 *
 * Unlocks are experiential gates, NOT billing gates — a user on the
 * paid tier who has 2 entries still sees "Life Matrix is getting
 * ready" because 2 entries is not enough data for the feature to
 * mean anything. This prevents empty-state theater on features that
 * need minimum data to be useful.
 *
 * All user-facing strings say "Acuity" (the product voice). Never
 * "Claude" — that's the underlying model, not the brand.
 */

export type UnlockKey =
  | "lifeMatrix"
  | "goalSuggestions"
  | "patternInsights"
  | "themeMap"
  | "weeklyReport"
  | "lifeAudit";

export interface UnlockProgress {
  current: number;
  target: number;
}

/**
 * Milestone thresholds in days. Passing any value in this list via a
 * streak crossing fires a one-shot celebration card. Tiers:
 *   3, 60 → small
 *   7, 14, 30 → medium
 *   100 → big
 *   365 → biggest
 * Defined here so web + mobile agree on the ladder.
 */
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 365] as const;
export type StreakMilestone = (typeof STREAK_MILESTONES)[number];

export type MilestoneTier = "small" | "medium" | "big" | "biggest";

export function milestoneTier(m: number): MilestoneTier {
  if (m >= 365) return "biggest";
  if (m >= 100) return "big";
  if (m === 7 || m === 14 || m === 30) return "medium";
  return "small";
}

export interface UserProgression {
  // Time
  dayOfTrial: number;
  trialEndsAt: Date;
  isInTrial: boolean;

  // Data
  entriesCount: number;
  entriesInLast7Days: number;
  dimensionsCovered: number;
  goalsSet: number;
  themesDetected: number;

  // Streaks
  currentStreak: number;
  longestStreak: number;
  lastEntryAt: Date | null;
  streakAtRisk: boolean;
  /** Next milestone the user is working toward. Null when the user is
   *  already past the top of the ladder (365+). */
  nextMilestone: number | null;

  // Unlocks
  unlocked: Record<UnlockKey, boolean>;

  // What's next
  nextUnlock: {
    key: UnlockKey;
    label: string;
    condition: string;
    progress: UnlockProgress;
  } | null;

  // Celebrations
  recentlyUnlocked: UnlockKey[];
  /** The milestone value just crossed — set exactly once per crossing
   *  (compared against previousProgression.currentStreak). Guarded by
   *  milestoneBaselineStreak (no retro fires pre-deploy) AND
   *  lastStreakMilestone (don't re-fire the same milestone after a
   *  streak-break + rebuild). Null when no milestone crossed this
   *  diff. Cleared on the next snapshot read — one-shot semantics
   *  matching recentlyUnlocked. */
  recentlyHitMilestone: number | null;
}

export interface UserProgressionInput {
  user: { id: string; createdAt: Date };
  entries: Array<{ id: string; createdAt: Date; dimensionId: string | null }>;
  themes: Array<{ id: string }>;
  goals: Array<{ id: string }>;
  /** Count of distinct life areas the user has touched, sourced from
   *  the LifeMapArea table (rows with mentionCount > 0). Preferred
   *  over counting Entry.dimensionContext because the latter is only
   *  set when the user explicitly taps "Record about this area" from
   *  a dimension detail screen — standard Home-tab recordings leave
   *  dimensionContext null even when the extraction pipeline scores
   *  multiple life areas from the transcript. When omitted, falls
   *  back to the old entries-based count for backward compat. */
  lifeAreasCovered?: number;
  previousProgression?: UserProgression | null;
  /** Streak value at the time milestone celebrations shipped. Prevents
   *  retroactively firing every milestone below a user's current
   *  streak on first snapshot post-deploy. Static after backfill;
   *  callers pass it in from User.milestoneBaselineStreak. Defaults
   *  to 0 when omitted (new users, tests). */
  milestoneBaselineStreak?: number;
  /** Highest milestone already celebrated for this user (from
   *  User.lastStreakMilestone). Used alongside the baseline: a
   *  milestone fires only if threshold > lastStreakMilestone, so a
   *  user who hit 7 → broke → rebuilt to 7 doesn't re-celebrate.
   *  Defaults to 0 (never celebrated). */
  lastStreakMilestone?: number;
  /** Optional override for "now" — used by tests and by the snapshot
   *  comparison logic. Defaults to `new Date()`. */
  now?: Date;
  /** IANA tz string (e.g. "America/Chicago"). Used for calendar-day
   *  math in streak calculation. Defaults to UTC. */
  timezone?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_DAYS = 14;

// Priority order when multiple unlocks are equidistant — matches the
// natural product flow (first data artifacts → insight layers → the
// long-tail weekly/audit artifacts).
const UNLOCK_PRIORITY: UnlockKey[] = [
  "lifeMatrix",
  "goalSuggestions",
  "patternInsights",
  "themeMap",
  "weeklyReport",
  "lifeAudit",
];

/**
 * Human-readable labels for unlock keys. Acuity voice — plain,
 * confident, no model-marketing noise.
 */
const UNLOCK_LABELS: Record<UnlockKey, string> = {
  lifeMatrix: "Life Matrix",
  goalSuggestions: "Goal Suggestions",
  patternInsights: "Pattern Insights",
  themeMap: "Theme Map",
  weeklyReport: "Weekly Report",
  lifeAudit: "Day 14 Life Audit",
};

export function userProgression(input: UserProgressionInput): UserProgression {
  const now = input.now ?? new Date();
  const { user, entries, themes, goals, previousProgression } = input;
  const timezone = input.timezone ?? "UTC";

  // ─── Time ─────────────────────────────────────────────────────
  const ageMs = now.getTime() - user.createdAt.getTime();
  const dayOfTrial = Math.max(1, Math.floor(ageMs / DAY_MS) + 1);
  const trialEndsAt = new Date(user.createdAt.getTime() + TRIAL_DAYS * DAY_MS);
  const isInTrial = now < trialEndsAt;

  // ─── Data counts ──────────────────────────────────────────────
  const entriesCount = entries.length;
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const entriesInLast7Days = entries.filter((e) => e.createdAt >= sevenDaysAgo).length;
  // Prefer the explicit LifeMapArea count (extraction pipeline ground
  // truth) when callers pass it in. Fall back to the legacy
  // Entry.dimensionContext tally for old callers / tests.
  const dimensionsCovered =
    input.lifeAreasCovered ?? countDistinctDimensions(entries);
  const goalsSet = goals.length;
  const themesDetected = themes.length;

  // ─── Streaks ──────────────────────────────────────────────────
  const streak = computeStreak(entries, now, timezone);

  // ─── Unlocks ──────────────────────────────────────────────────
  const unlocked: Record<UnlockKey, boolean> = {
    lifeMatrix: entriesCount >= 5 && dimensionsCovered >= 3,
    goalSuggestions: entriesCount >= 5,
    patternInsights: entriesCount >= 7,
    themeMap: entriesCount >= 10 && themesDetected >= 3,
    weeklyReport: dayOfTrial >= 7 && entriesInLast7Days >= 3,
    lifeAudit: dayOfTrial >= 14 && entriesCount >= 1,
  };

  // ─── What's next ──────────────────────────────────────────────
  const nextUnlock = pickNextUnlock({
    unlocked,
    entriesCount,
    dimensionsCovered,
    themesDetected,
    entriesInLast7Days,
    dayOfTrial,
  });

  // ─── Celebrations ─────────────────────────────────────────────
  const recentlyUnlocked: UnlockKey[] = [];
  if (previousProgression) {
    for (const key of UNLOCK_PRIORITY) {
      if (unlocked[key] && !previousProgression.unlocked[key]) {
        recentlyUnlocked.push(key);
      }
    }
  }

  // Milestone detection: the highest milestone the user crossed
  // between previousProgression.currentStreak and streak.current.
  // Guards:
  //   (a) only fires on a real crossing during THIS diff — no prior
  //       snapshot means no fire (new users' baseline already
  //       accounts for pre-existing streaks)
  //   (b) threshold must exceed milestoneBaselineStreak — prevents
  //       retroactive cards for users who were already deep into a
  //       streak when milestones shipped
  //   (c) threshold must exceed lastStreakMilestone — prevents
  //       re-celebrating the same milestone after a streak-break +
  //       rebuild (matches the existing User.lastStreakMilestone
  //       semantics)
  const baseline = Math.max(0, input.milestoneBaselineStreak ?? 0);
  const lastCelebrated = Math.max(0, input.lastStreakMilestone ?? 0);
  let recentlyHitMilestone: number | null = null;
  if (previousProgression) {
    const prevStreak = previousProgression.currentStreak;
    let highestCrossed = -1;
    for (const m of STREAK_MILESTONES) {
      if (streak.current >= m && prevStreak < m && m > baseline && m > lastCelebrated) {
        if (m > highestCrossed) highestCrossed = m;
      }
    }
    if (highestCrossed > 0) recentlyHitMilestone = highestCrossed;
  }

  // nextMilestone — the smallest threshold the user hasn't yet hit.
  // Null when past the top. Used by the resting card on day 8+.
  const nextMilestone =
    STREAK_MILESTONES.find((m) => m > streak.current) ?? null;

  return {
    dayOfTrial,
    trialEndsAt,
    isInTrial,
    entriesCount,
    entriesInLast7Days,
    dimensionsCovered,
    goalsSet,
    themesDetected,
    currentStreak: streak.current,
    longestStreak: streak.longest,
    lastEntryAt: streak.lastEntryAt,
    streakAtRisk: streak.atRisk,
    nextMilestone,
    unlocked,
    nextUnlock,
    recentlyUnlocked,
    recentlyHitMilestone,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function countDistinctDimensions(
  entries: Array<{ dimensionId: string | null }>
): number {
  const set = new Set<string>();
  for (const e of entries) {
    if (e.dimensionId && e.dimensionId.trim() !== "") {
      set.add(e.dimensionId.toLowerCase());
    }
  }
  return set.size;
}

/**
 * Streak = consecutive calendar days (in user's timezone) with at
 * least one entry, ending today or yesterday. If the last entry
 * was 2+ days ago, the streak is broken.
 *
 * Implementation note: we bucket entries into YYYY-MM-DD strings
 * in the user's timezone, then walk backwards from today. Using
 * plain strings avoids Date arithmetic bugs around DST boundaries.
 */
function computeStreak(
  entries: Array<{ createdAt: Date }>,
  now: Date,
  timezone: string
): {
  current: number;
  longest: number;
  lastEntryAt: Date | null;
  atRisk: boolean;
} {
  if (entries.length === 0) {
    return { current: 0, longest: 0, lastEntryAt: null, atRisk: false };
  }

  // Sort so we can find lastEntryAt; the Set below is order-agnostic.
  const sorted = [...entries].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
  const lastEntryAt = sorted[0].createdAt;

  const daySet = new Set<string>();
  for (const e of entries) daySet.add(toLocalDayKey(e.createdAt, timezone));

  const today = toLocalDayKey(now, timezone);
  const yesterday = toLocalDayKey(new Date(now.getTime() - DAY_MS), timezone);

  // Current streak — walk back from today (if today has an entry) or
  // yesterday (if today has none but yesterday does, streak is at risk).
  let current = 0;
  let atRisk = false;

  if (daySet.has(today)) {
    let cursor = new Date(now);
    while (daySet.has(toLocalDayKey(cursor, timezone))) {
      current += 1;
      cursor = new Date(cursor.getTime() - DAY_MS);
    }
  } else if (daySet.has(yesterday)) {
    atRisk = true;
    let cursor = new Date(now.getTime() - DAY_MS);
    while (daySet.has(toLocalDayKey(cursor, timezone))) {
      current += 1;
      cursor = new Date(cursor.getTime() - DAY_MS);
    }
  }
  // else current = 0, atRisk = false

  // Longest — scan all distinct days, sort ascending, find the longest
  // run of consecutive day keys. O(n log n) on distinct days; cheap.
  const longest = longestRun([...daySet]);

  return { current, longest, lastEntryAt, atRisk };
}

/** Format a Date into YYYY-MM-DD in the given IANA timezone. Falls
 *  back to UTC slicing if Intl fails (unlikely in Node 18+). */
function toLocalDayKey(d: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value ?? "0000";
    const m = parts.find((p) => p.type === "month")?.value ?? "01";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";
    return `${y}-${m}-${day}`;
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function longestRun(dayKeys: string[]): number {
  if (dayKeys.length === 0) return 0;
  const sorted = [...dayKeys].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (isNextDay(sorted[i - 1], sorted[i])) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }
  return longest;
}

function isNextDay(a: string, b: string): boolean {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const aDate = new Date(Date.UTC(ay, am - 1, ad));
  const bDate = new Date(Date.UTC(by, bm - 1, bd));
  return bDate.getTime() - aDate.getTime() === DAY_MS;
}

function pickNextUnlock(args: {
  unlocked: Record<UnlockKey, boolean>;
  entriesCount: number;
  dimensionsCovered: number;
  themesDetected: number;
  entriesInLast7Days: number;
  dayOfTrial: number;
}): UserProgression["nextUnlock"] {
  const {
    unlocked,
    entriesCount,
    dimensionsCovered,
    themesDetected,
    entriesInLast7Days,
    dayOfTrial,
  } = args;

  // Candidate rows — one per still-locked feature, with the primary
  // "progress" pair the user sees in the UI. The condition copy is
  // the single most-important remaining blocker, phrased as what
  // the user needs to do next.
  const candidates: Array<{
    key: UnlockKey;
    condition: string;
    progress: UnlockProgress;
    /** How many "work units" away from unlock — smaller = closer. */
    distance: number;
  }> = [];

  if (!unlocked.lifeMatrix) {
    const entryGap = Math.max(0, 5 - entriesCount);
    const dimGap = Math.max(0, 3 - dimensionsCovered);
    const primaryGap = entryGap > 0 ? entryGap : dimGap;
    candidates.push({
      key: "lifeMatrix",
      condition:
        entryGap > 0
          ? recordMore(entryGap)
          : `Touch ${dimGap} more life area${dimGap === 1 ? "" : "s"} in your entries`,
      progress:
        entryGap > 0
          ? { current: entriesCount, target: 5 }
          : { current: dimensionsCovered, target: 3 },
      distance: entryGap + dimGap,
    });
  }

  if (!unlocked.goalSuggestions) {
    const gap = Math.max(0, 5 - entriesCount);
    candidates.push({
      key: "goalSuggestions",
      condition: recordMore(gap),
      progress: { current: entriesCount, target: 5 },
      distance: gap,
    });
  }

  if (!unlocked.patternInsights) {
    const gap = Math.max(0, 7 - entriesCount);
    candidates.push({
      key: "patternInsights",
      condition: recordMore(gap),
      progress: { current: entriesCount, target: 7 },
      distance: gap,
    });
  }

  if (!unlocked.themeMap) {
    const entryGap = Math.max(0, 10 - entriesCount);
    const themeGap = Math.max(0, 3 - themesDetected);
    candidates.push({
      key: "themeMap",
      condition:
        entryGap > 0
          ? recordMore(entryGap)
          : `Keep recording — Acuity needs to see ${themeGap} more recurring theme${themeGap === 1 ? "" : "s"}`,
      progress:
        entryGap > 0
          ? { current: entriesCount, target: 10 }
          : { current: themesDetected, target: 3 },
      distance: entryGap + themeGap,
    });
  }

  if (!unlocked.weeklyReport) {
    const dayGap = Math.max(0, 7 - dayOfTrial);
    const entryGap = Math.max(0, 3 - entriesInLast7Days);
    candidates.push({
      key: "weeklyReport",
      condition:
        dayGap > 0
          ? `${dayGap} more day${dayGap === 1 ? "" : "s"} until your first weekly report`
          : recordMore(entryGap, "this week"),
      progress:
        dayGap > 0
          ? { current: dayOfTrial, target: 7 }
          : { current: entriesInLast7Days, target: 3 },
      distance: dayGap + entryGap,
    });
  }

  if (!unlocked.lifeAudit) {
    const dayGap = Math.max(0, 14 - dayOfTrial);
    candidates.push({
      key: "lifeAudit",
      condition:
        dayGap > 0
          ? `${dayGap} day${dayGap === 1 ? "" : "s"} until your Life Audit`
          : recordMore(1),
      progress: { current: dayOfTrial, target: 14 },
      distance: dayGap,
    });
  }

  if (candidates.length === 0) return null;

  // Sort by (distance asc, then priority order). The priority tiebreak
  // matches UNLOCK_PRIORITY so the story stays coherent when two
  // unlocks are equidistant.
  candidates.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    return UNLOCK_PRIORITY.indexOf(a.key) - UNLOCK_PRIORITY.indexOf(b.key);
  });

  const best = candidates[0];
  return {
    key: best.key,
    label: UNLOCK_LABELS[best.key],
    condition: best.condition,
    progress: best.progress,
  };
}

function recordMore(n: number, scope?: string): string {
  if (n <= 0) return "Record your next entry";
  const noun = n === 1 ? "entry" : "entries";
  return scope ? `Record ${n} more ${noun} ${scope}` : `Record ${n} more ${noun}`;
}

/** Copy used by locked-feature empty states. Exported so both web
 *  and mobile render the same phrasing. */
export function lockedFeatureCopy(
  key: UnlockKey,
  progression: UserProgression
): {
  headline: string;
  body: string;
  progress: UnlockProgress | null;
} {
  switch (key) {
    case "lifeMatrix": {
      const entryGap = Math.max(0, 5 - progression.entriesCount);
      const dimGap = Math.max(0, 3 - progression.dimensionsCovered);
      return {
        headline: "Your Life Matrix unlocks soon.",
        body:
          entryGap > 0
            ? `Acuity needs 5 entries across at least 3 life areas to show meaningful patterns. You have ${progression.entriesCount} of 5.`
            : `Acuity has ${progression.entriesCount} entries, but only ${progression.dimensionsCovered} of the 3 life areas needed. Record about more sides of your life — work, health, relationships, money, personal, other.`,
        progress:
          entryGap > 0
            ? { current: progression.entriesCount, target: 5 }
            : { current: progression.dimensionsCovered, target: 3 },
      };
    }
    case "goalSuggestions": {
      return {
        headline: "Goal suggestions come after a few entries.",
        body: `Acuity reads your entries, then surfaces goals you're already working toward. You have ${progression.entriesCount} of the 5 needed.`,
        progress: { current: progression.entriesCount, target: 5 },
      };
    }
    case "patternInsights": {
      return {
        headline: "Pattern insights open once Acuity has enough signal.",
        body: `A week of entries is roughly when patterns emerge. You have ${progression.entriesCount} of 7.`,
        progress: { current: progression.entriesCount, target: 7 },
      };
    }
    case "themeMap": {
      const entryGap = Math.max(0, 10 - progression.entriesCount);
      return {
        headline: "Your Theme Map is still forming.",
        body:
          entryGap > 0
            ? `Acuity needs 10 entries and 3 recurring themes before the map is meaningful. You have ${progression.entriesCount} of 10.`
            : `Acuity has ${progression.entriesCount} entries but only ${progression.themesDetected} recurring themes. Keep recording — themes repeat as you return to the same topics.`,
        progress:
          entryGap > 0
            ? { current: progression.entriesCount, target: 10 }
            : { current: progression.themesDetected, target: 3 },
      };
    }
    case "weeklyReport": {
      const dayGap = Math.max(0, 7 - progression.dayOfTrial);
      const entryGap = Math.max(0, 3 - progression.entriesInLast7Days);
      return {
        headline: "Your first Weekly Report lands on day 7.",
        body:
          dayGap > 0
            ? `You're on day ${progression.dayOfTrial} of 14. Your first report will arrive in ${dayGap} day${dayGap === 1 ? "" : "s"} — assuming at least 3 entries in the past week.`
            : `You're on day ${progression.dayOfTrial}. Acuity needs 3 entries in the past 7 days to write your report. You have ${progression.entriesInLast7Days}.`,
        progress:
          dayGap > 0
            ? { current: progression.dayOfTrial, target: 7 }
            : { current: progression.entriesInLast7Days, target: 3 },
      };
    }
    case "lifeAudit": {
      const dayGap = Math.max(0, 14 - progression.dayOfTrial);
      return {
        headline: "Your Day 14 Life Audit is coming.",
        body:
          dayGap > 0
            ? `This is the long-form letter Acuity writes about your first two weeks. It lands in ${dayGap} day${dayGap === 1 ? "" : "s"}.`
            : `You're on day ${progression.dayOfTrial}. Your Life Audit should be generating — if it hasn't appeared, try recording one more entry.`,
        progress: { current: progression.dayOfTrial, target: 14 },
      };
    }
  }
}
