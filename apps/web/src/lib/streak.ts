import "server-only";

import { formatInTimeZone } from "date-fns-tz";

/**
 * Streak update logic — called from the Inngest process-entry function
 * after an entry has been persisted. Pure function + a single prisma
 * write.
 *
 * Streak day boundaries are evaluated in the user's timezone (stored
 * on User.timezone, default "America/Chicago"). We bucket by YYYY-MM-DD
 * in that timezone — no 24-hour arithmetic — which correctly handles
 * daylight-savings transitions (23h/25h days).
 *
 * Rules:
 *   same day as lastSessionDate     → no change
 *   next calendar day               → currentStreak + 1
 *   gap of 2+ days                  → reset to 1
 *   first session ever (null last)  → 1
 * Always bump lastSessionDate to now regardless.
 *
 * Milestone tracking: when currentStreak crosses 7, 30, or 100 for the
 * first time (tracked via User.lastStreakMilestone), we return the
 * crossed value so the caller can fire a UI celebration. Monotonic:
 * dropping back to 0 and climbing again past the same mark does not
 * re-fire.
 */

const MILESTONES = [7, 30, 100] as const;
type Milestone = (typeof MILESTONES)[number];

export interface StreakUpdate {
  currentStreak: number;
  longestStreak: number;
  /** The milestone crossed on THIS update, if any. */
  milestoneHit: Milestone | null;
}

export interface StreakInput {
  now: Date;
  timezone: string;
  lastSessionDate: Date | null;
  currentStreak: number;
  longestStreak: number;
  lastStreakMilestone: number | null;
}

export function computeStreakUpdate(input: StreakInput): StreakUpdate {
  const tz = input.timezone || "America/Chicago";
  const todayKey = formatInTimeZone(input.now, tz, "yyyy-MM-dd");

  let nextCurrent: number;

  if (!input.lastSessionDate) {
    nextCurrent = 1;
  } else {
    const lastKey = formatInTimeZone(input.lastSessionDate, tz, "yyyy-MM-dd");
    if (lastKey === todayKey) {
      // Same calendar day — no change, but the caller still bumps
      // lastSessionDate so the "most recent" timestamp moves forward.
      nextCurrent = input.currentStreak;
    } else {
      const diff = calendarDayDiff(lastKey, todayKey);
      if (diff === 1) {
        nextCurrent = input.currentStreak + 1;
      } else {
        // Gap of 2+ days (or edge case like time travel via manual DB
        // date edits) — reset to today-as-day-one.
        nextCurrent = 1;
      }
    }
  }

  const nextLongest = Math.max(input.longestStreak, nextCurrent);
  const milestoneHit = milestoneCrossed(
    nextCurrent,
    input.lastStreakMilestone ?? 0
  );

  return {
    currentStreak: nextCurrent,
    longestStreak: nextLongest,
    milestoneHit,
  };
}

function milestoneCrossed(
  nextCurrent: number,
  previousMilestone: number
): Milestone | null {
  // Find the highest milestone ≤ nextCurrent that's greater than the
  // last one we fired. MILESTONES is ascending; iterate in reverse so
  // we return the biggest match (e.g. hitting 100 in one jump skips
  // the 7/30 toasts that never fired).
  for (let i = MILESTONES.length - 1; i >= 0; i--) {
    const m = MILESTONES[i];
    if (nextCurrent >= m && previousMilestone < m) {
      return m;
    }
  }
  return null;
}

/**
 * Days between two YYYY-MM-DD strings. Both must be in the same
 * timezone (caller's responsibility). Handles month/year boundaries
 * correctly because we parse as local-midnight-ish via Date.
 */
function calendarDayDiff(fromKey: string, toKey: string): number {
  const from = Date.parse(fromKey + "T00:00:00Z");
  const to = Date.parse(toKey + "T00:00:00Z");
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}
