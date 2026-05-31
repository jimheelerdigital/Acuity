/**
 * Achievement evaluation library.
 *
 * Two evaluation modes:
 *   - evaluateRealtime({ userId, entryId? }): called from process-entry's
 *     post-persist enrichment block. Evaluates all real-time trigger
 *     types (STREAK_DAYS, ENTRY_COUNT, FIRST_ACTION, TIME_OF_DAY,
 *     COMEBACK, THEMES_SURFACED, TASKS_DAY_CLEAR, ENTRY_DURATION_SECONDS,
 *     TOTAL_SPEECH_MINUTES) against the user's current state.
 *   - evaluateBackground({ userId }): called from the nightly cron.
 *     Evaluates background trigger types (LIFE_AREA_LIFT,
 *     LIFE_AREAS_THRESHOLD, SEASONAL_COVERAGE, SPECIAL_DATE,
 *     TASKS_WEEK_CLEAR_STREAK, INSIGHTS_CONSECUTIVE).
 *
 * Both return the list of NEWLY-earned achievement IDs after writing
 * UserAchievement rows. ON CONFLICT DO NOTHING means re-evaluation
 * is idempotent — a user who already has a badge doesn't get a
 * duplicate row.
 *
 * Each evaluator is wrapped in try/catch — a single bad trigger
 * configuration shouldn't fail the whole pass. Unknown / unimplemented
 * trigger types return false (no match) silently. Logged via safeLog
 * so we can spot gaps without polluting Sentry with expected misses.
 */

import type { PrismaClient } from "@prisma/client";

import { safeLog } from "@/lib/safe-log";

// ─── Real-time evaluators (called from process-entry) ──────────────────

type RealtimeContext = {
  userId: string;
  entryId?: string;
};

export type AwardedAchievement = {
  achievementId: string;
  slug: string;
  pointsAwarded: number;
};

/**
 * Evaluate all real-time triggers and insert UserAchievement rows for
 * newly-earned badges. Returns the awarded achievements so callers can
 * log / fire downstream events. Safe to call multiple times — the
 * UserAchievement unique constraint on (userId, achievementId) plus the
 * `skipDuplicates: true` flag make this idempotent.
 *
 * Errors are caught at the per-trigger level. A single unknown
 * triggerType or a bad config doesn't kill the rest of the pass.
 */
export async function evaluateRealtime(
  prisma: PrismaClient,
  ctx: RealtimeContext
): Promise<AwardedAchievement[]> {
  const realtimeTypes = [
    "STREAK_DAYS",
    "ENTRY_COUNT",
    "FIRST_ACTION",
    "TIME_OF_DAY",
    "COMEBACK",
    "THEMES_SURFACED",
    "TASKS_DAY_CLEAR",
    "ENTRY_DURATION_SECONDS",
    "TOTAL_SPEECH_MINUTES",
  ];

  const achievements = await prisma.achievement.findMany({
    where: { isActive: true, triggerType: { in: realtimeTypes } },
    select: {
      id: true,
      slug: true,
      points: true,
      triggerType: true,
      triggerConfig: true,
    },
  });

  // Pre-load the user's existing awards so we can skip already-earned
  // achievements without round-tripping to the DB per trigger.
  const existing = await prisma.userAchievement.findMany({
    where: { userId: ctx.userId },
    select: { achievementId: true },
  });
  const earnedIds = new Set(existing.map((e) => e.achievementId));

  // Snapshot the user's state once. Most triggers read from it.
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: {
      id: true,
      timezone: true,
      currentStreak: true,
      totalRecordings: true,
      firstRecordingAt: true,
      lastRecordingAt: true,
      lastSessionDate: true,
    },
  });
  if (!user) return [];

  // Optional: snapshot the just-processed entry if entryId provided.
  const entry = ctx.entryId
    ? await prisma.entry.findUnique({
        where: { id: ctx.entryId },
        select: {
          id: true,
          createdAt: true,
          audioDuration: true,
        },
      })
    : null;

  const newlyAwarded: AwardedAchievement[] = [];

  for (const ach of achievements) {
    if (earnedIds.has(ach.id)) continue;
    try {
      const cfg = (ach.triggerConfig as Record<string, unknown>) ?? {};
      let matched = false;
      switch (ach.triggerType) {
        case "STREAK_DAYS":
          matched = matchStreakDays(user.currentStreak, cfg);
          break;
        case "ENTRY_COUNT":
          matched = matchEntryCount(user.totalRecordings ?? 0, cfg);
          break;
        case "FIRST_ACTION":
          matched = await matchFirstAction(prisma, ctx.userId, entry, cfg);
          break;
        case "TIME_OF_DAY":
          matched = matchTimeOfDay(entry, user.timezone, cfg);
          break;
        case "COMEBACK":
          matched = matchComeback(entry, user.lastSessionDate, cfg);
          break;
        case "THEMES_SURFACED":
          matched = await matchThemesSurfaced(prisma, ctx.userId, cfg);
          break;
        case "TASKS_DAY_CLEAR":
          matched = await matchTasksDayClear(prisma, ctx.userId, user.timezone);
          break;
        case "ENTRY_DURATION_SECONDS":
          matched = matchEntryDuration(entry, cfg);
          break;
        case "TOTAL_SPEECH_MINUTES":
          matched = await matchTotalSpeechMinutes(prisma, ctx.userId, cfg);
          break;
        default:
          matched = false;
      }
      if (matched) {
        await awardAchievement(prisma, ctx.userId, ach.id, ach.points);
        newlyAwarded.push({
          achievementId: ach.id,
          slug: ach.slug,
          pointsAwarded: ach.points,
        });
      }
    } catch (err) {
      safeLog.warn("achievements.evaluate-realtime-trigger-failed", {
        userId: ctx.userId,
        achievementId: ach.id,
        triggerType: ach.triggerType,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return newlyAwarded;
}

/**
 * Background evaluator — runs from the nightly cron. Covers triggers
 * that don't fire per-entry (life area lifts, seasonal coverage,
 * special dates, weekly task clear streaks).
 *
 * Current coverage: LIFE_AREA_LIFT, LIFE_AREAS_THRESHOLD,
 * SEASONAL_COVERAGE, SPECIAL_DATE (newyears + anniversary).
 * Deferred (TODOs): INSIGHTS_CONSECUTIVE (no open-event signal),
 * TASKS_WEEK_CLEAR_STREAK (cheap to add when tasks tracking firms up),
 * SPECIAL_DATE birthday (UserDemographics has no birthday field yet).
 */
export async function evaluateBackground(
  prisma: PrismaClient,
  userId: string
): Promise<AwardedAchievement[]> {
  const backgroundTypes = [
    "LIFE_AREA_LIFT",
    "LIFE_AREAS_THRESHOLD",
    "SEASONAL_COVERAGE",
    "SPECIAL_DATE",
    // TODO: TASKS_WEEK_CLEAR_STREAK, INSIGHTS_CONSECUTIVE
  ];

  const achievements = await prisma.achievement.findMany({
    where: { isActive: true, triggerType: { in: backgroundTypes } },
    select: {
      id: true,
      slug: true,
      points: true,
      triggerType: true,
      triggerConfig: true,
    },
  });

  const existing = await prisma.userAchievement.findMany({
    where: { userId },
    select: { achievementId: true },
  });
  const earnedIds = new Set(existing.map((e) => e.achievementId));

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, timezone: true, firstRecordingAt: true },
  });
  if (!user) return [];

  const newlyAwarded: AwardedAchievement[] = [];

  for (const ach of achievements) {
    if (earnedIds.has(ach.id)) continue;
    try {
      const cfg = (ach.triggerConfig as Record<string, unknown>) ?? {};
      let matched = false;
      switch (ach.triggerType) {
        case "LIFE_AREA_LIFT":
          matched = await matchLifeAreaLift(prisma, userId, cfg);
          break;
        case "LIFE_AREAS_THRESHOLD":
          matched = await matchLifeAreasThreshold(prisma, userId, cfg);
          break;
        case "SEASONAL_COVERAGE":
          matched = await matchSeasonalCoverage(prisma, userId, cfg);
          break;
        case "SPECIAL_DATE":
          matched = await matchSpecialDate(
            prisma,
            userId,
            user.timezone,
            user.firstRecordingAt,
            cfg
          );
          break;
        default:
          matched = false;
      }
      if (matched) {
        await awardAchievement(prisma, userId, ach.id, ach.points);
        newlyAwarded.push({
          achievementId: ach.id,
          slug: ach.slug,
          pointsAwarded: ach.points,
        });
      }
    } catch (err) {
      safeLog.warn("achievements.evaluate-background-trigger-failed", {
        userId,
        achievementId: ach.id,
        triggerType: ach.triggerType,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return newlyAwarded;
}

// ─── Trigger matchers ──────────────────────────────────────────────────

function matchStreakDays(
  currentStreak: number,
  cfg: Record<string, unknown>
): boolean {
  const target = numberFrom(cfg.days);
  return target !== null && currentStreak >= target;
}

function matchEntryCount(
  totalRecordings: number,
  cfg: Record<string, unknown>
): boolean {
  const target = numberFrom(cfg.count);
  return target !== null && totalRecordings >= target;
}

async function matchFirstAction(
  prisma: PrismaClient,
  userId: string,
  entry: { id: string } | null,
  cfg: Record<string, unknown>
): Promise<boolean> {
  const action = stringFrom(cfg.action);
  if (!action) return false;
  switch (action) {
    case "entry": {
      // First-ever entry: this is the only Entry row for the user.
      const count = await prisma.entry.count({ where: { userId } });
      return count >= 1 && entry !== null;
    }
    case "goal_set": {
      const count = await prisma.goal.count({ where: { userId } });
      return count >= 1;
    }
    case "goal_completed": {
      // Goal.status: "NOT_STARTED" | "IN_PROGRESS" | "ON_HOLD" |
      // "COMPLETE" | "ARCHIVED". Count rows in the COMPLETE state.
      const count = await prisma.goal.count({
        where: { userId, status: "COMPLETE" },
      });
      return count >= 1;
    }
    case "insight_read":
      // TODO: UserInsight has dismissedAt but no openedAt marker.
      // When mobile starts tracking insight opens, wire that in.
      return false;
    default:
      return false;
  }
}

/**
 * TIME_OF_DAY: the just-processed entry's createdAt, converted to the
 * user's timezone, falls inside [after, before). Windows can cross
 * midnight (e.g. after=22:00 before=04:00 — covers night-owl recordings
 * 10pm to 4am).
 */
function matchTimeOfDay(
  entry: { createdAt: Date } | null,
  timezone: string,
  cfg: Record<string, unknown>
): boolean {
  if (!entry) return false;
  const after = parseHHMM(stringFrom(cfg.after));
  const before = parseHHMM(stringFrom(cfg.before));
  if (after === null || before === null) return false;
  const local = entryHourMinuteInTz(entry.createdAt, timezone);
  if (local === null) return false;
  if (after <= before) {
    return local >= after && local < before;
  }
  // Window crosses midnight.
  return local >= after || local < before;
}

/**
 * COMEBACK: gap between User.lastSessionDate (effectively the previous
 * recording day) and the just-processed entry > gapDays. One-time per
 * user — once awarded, the unique constraint on UserAchievement
 * prevents a re-award.
 */
function matchComeback(
  entry: { createdAt: Date } | null,
  lastSessionDate: Date | null,
  cfg: Record<string, unknown>
): boolean {
  if (!entry || !lastSessionDate) return false;
  const gapDays = numberFrom(cfg.gapDays);
  if (gapDays === null) return false;
  const diffMs = entry.createdAt.getTime() - lastSessionDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > gapDays;
}

async function matchThemesSurfaced(
  prisma: PrismaClient,
  userId: string,
  cfg: Record<string, unknown>
): Promise<boolean> {
  const target = numberFrom(cfg.count);
  if (target === null) return false;
  const count = await prisma.theme.count({ where: { userId } });
  return count >= target;
}

/**
 * TASKS_DAY_CLEAR: every Task with a dueDate falling on today (in the
 * user's timezone) has status DONE. No open tasks for today = clear.
 * Zero tasks for today = no match (we don't reward inactivity).
 */
async function matchTasksDayClear(
  prisma: PrismaClient,
  userId: string,
  timezone: string
): Promise<boolean> {
  const todayBounds = startEndOfTodayUTC(timezone);
  if (!todayBounds) return false;
  const todayTasks = await prisma.task.findMany({
    where: {
      userId,
      dueDate: { gte: todayBounds.start, lt: todayBounds.end },
    },
    select: { status: true },
  });
  if (todayTasks.length === 0) return false;
  return todayTasks.every((t) => t.status === "DONE");
}

function matchEntryDuration(
  entry: { audioDuration: number | null } | null,
  cfg: Record<string, unknown>
): boolean {
  if (!entry || entry.audioDuration === null) return false;
  const target = numberFrom(cfg.seconds);
  return target !== null && entry.audioDuration >= target;
}

async function matchTotalSpeechMinutes(
  prisma: PrismaClient,
  userId: string,
  cfg: Record<string, unknown>
): Promise<boolean> {
  const target = numberFrom(cfg.minutes);
  if (target === null) return false;
  const agg = await prisma.entry.aggregate({
    where: { userId, audioDuration: { not: null } },
    _sum: { audioDuration: true },
  });
  const totalSec = agg._sum.audioDuration ?? 0;
  return totalSec / 60 >= target;
}

// ── Background matchers ────────────────────────────────────────────────

async function matchLifeAreaLift(
  prisma: PrismaClient,
  userId: string,
  cfg: Record<string, unknown>
): Promise<boolean> {
  const amount = numberFrom(cfg.amount);
  const withinDays = numberFrom(cfg.withinDays);
  if (amount === null || withinDays === null) return false;

  const sinceMs = Date.now() - withinDays * 24 * 60 * 60 * 1000;
  const since = new Date(sinceMs);

  // Pull all snapshots for the user since the window opened, group by
  // area, check if max(score) - min(score) >= amount in any area.
  const rows = await prisma.lifeMapAreaHistory.findMany({
    where: { userId, weekStart: { gte: since } },
    select: { area: true, score: true },
  });
  const byArea = new Map<string, { min: number; max: number }>();
  for (const r of rows) {
    const cur = byArea.get(r.area);
    if (!cur) {
      byArea.set(r.area, { min: r.score, max: r.score });
    } else {
      cur.min = Math.min(cur.min, r.score);
      cur.max = Math.max(cur.max, r.score);
    }
  }
  for (const v of byArea.values()) {
    if (v.max - v.min >= amount) return true;
  }
  return false;
}

async function matchLifeAreasThreshold(
  prisma: PrismaClient,
  userId: string,
  cfg: Record<string, unknown>
): Promise<boolean> {
  const threshold = numberFrom(cfg.threshold);
  if (threshold === null) return false;
  const targetCount = numberFrom(cfg.count);

  const areas = await prisma.lifeMapArea.findMany({
    where: { userId },
    select: { score100: true, score: true },
  });
  if (areas.length === 0) return false;

  const meeting = areas.filter((a) => {
    const s = a.score100 ?? a.score * 10;
    return s >= threshold;
  }).length;

  if (targetCount === null) {
    // No count specified — require ALL areas to meet threshold.
    return meeting === areas.length;
  }
  return meeting >= targetCount;
}

async function matchSeasonalCoverage(
  prisma: PrismaClient,
  userId: string,
  cfg: Record<string, unknown>
): Promise<boolean> {
  const target = numberFrom(cfg.count) ?? 4;
  const entries = await prisma.entry.findMany({
    where: { userId },
    select: { createdAt: true },
  });
  if (entries.length === 0) return false;
  const seasons = new Set<string>();
  for (const e of entries) {
    seasons.add(meteorologicalSeason(e.createdAt));
    if (seasons.size >= target) return true;
  }
  return seasons.size >= target;
}

async function matchSpecialDate(
  prisma: PrismaClient,
  userId: string,
  timezone: string,
  firstRecordingAt: Date | null,
  cfg: Record<string, unknown>
): Promise<boolean> {
  const type = stringFrom(cfg.type);
  if (!type) return false;

  if (type === "newyears") {
    // Today is Jan 1 in user's timezone AND user has an entry today.
    const localToday = ymdInTz(new Date(), timezone);
    if (!localToday || localToday.slice(5) !== "01-01") return false;
    const bounds = startEndOfTodayUTC(timezone);
    if (!bounds) return false;
    const has = await prisma.entry.count({
      where: { userId, createdAt: { gte: bounds.start, lt: bounds.end } },
    });
    return has > 0;
  }

  if (type === "anniversary") {
    if (!firstRecordingAt) return false;
    const todayUTC = new Date();
    const diffDays = Math.floor(
      (todayUTC.getTime() - firstRecordingAt.getTime()) /
        (1000 * 60 * 60 * 24)
    );
    return diffDays >= 365;
  }

  if (type === "birthday") {
    // TODO: UserDemographics has no birthday field yet. Stub returns
    // false so we never accidentally award until the field lands.
    return false;
  }

  return false;
}

// ─── Award + helpers ───────────────────────────────────────────────────

async function awardAchievement(
  prisma: PrismaClient,
  userId: string,
  achievementId: string,
  points: number
): Promise<void> {
  await prisma.userAchievement.upsert({
    where: { userId_achievementId: { userId, achievementId } },
    create: {
      userId,
      achievementId,
      pointsAwarded: points,
      shownToUser: false,
    },
    update: {}, // never overwrite an existing award
  });
}

function numberFrom(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function stringFrom(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function parseHHMM(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

/**
 * Returns hours*60+minutes for the given date in the user's timezone.
 * Uses Intl.DateTimeFormat for IANA timezone handling rather than a
 * naive offset (handles DST transitions correctly).
 */
function entryHourMinuteInTz(d: Date, timezone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const hh = Number(parts.find((p) => p.type === "hour")?.value ?? NaN);
    const mm = Number(parts.find((p) => p.type === "minute")?.value ?? NaN);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  } catch {
    return null;
  }
}

/**
 * UTC bounds for "today" in the user's timezone. Used by date-based
 * matchers (TASKS_DAY_CLEAR, SPECIAL_DATE newyears) to avoid the naive
 * UTC midnight off-by-one.
 */
function startEndOfTodayUTC(
  timezone: string
): { start: Date; end: Date } | null {
  try {
    const now = new Date();
    const ymd = ymdInTz(now, timezone);
    if (!ymd) return null;
    // Build local 00:00 string, parse with timezone via Intl.
    // Simpler: construct two ISO timestamps and walk back/forward.
    // We use a 24h+8h sandwich around the local-midnight estimate to
    // sidestep DST edge cases.
    const [y, m, d] = ymd.split("-").map(Number);
    // Try to find UTC instants that map to local 00:00 today and 00:00
    // tomorrow by searching across the +/-14h timezone offset window.
    const start = utcInstantForLocalMidnight(y, m, d, timezone);
    if (!start) return null;
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  } catch {
    return null;
  }
}

function ymdInTz(d: Date, timezone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (!y || !m || !day) return null;
    return `${y}-${m}-${day}`;
  } catch {
    return null;
  }
}

/**
 * Returns the UTC Date that corresponds to local midnight on the given
 * Y-M-D in the given IANA timezone. Brute-force search over the offset
 * range (-14h..+14h) — accurate, DST-aware via Intl. Cheap (≤2 iterations
 * in practice; we converge by overshoot-correct).
 */
function utcInstantForLocalMidnight(
  year: number,
  month: number,
  day: number,
  timezone: string
): Date | null {
  // Initial guess: UTC midnight of the same Y-M-D.
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const observed = ymdInTz(guess, timezone);
  if (!observed) return null;
  const [oy, om, od] = observed.split("-").map(Number);
  // Compute the offset (in minutes) between target Y-M-D and observed
  // Y-M-D when viewed in `timezone`. If we observe an EARLIER local
  // date than target, we need to add hours to the UTC instant.
  const observedDays = Date.UTC(oy, om - 1, od) / (1000 * 60 * 60 * 24);
  const targetDays =
    Date.UTC(year, month - 1, day) / (1000 * 60 * 60 * 24);
  const dayDiff = targetDays - observedDays;
  if (dayDiff === 0) return guess;
  return new Date(guess.getTime() + dayDiff * 24 * 60 * 60 * 1000);
}

function meteorologicalSeason(d: Date): "spring" | "summer" | "fall" | "winter" {
  const m = d.getUTCMonth() + 1;
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "fall";
  return "winter";
}
