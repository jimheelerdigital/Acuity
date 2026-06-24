import type { NotificationCategory } from "@acuity/shared";
import { isNotificationCategory } from "@acuity/shared";

import { prisma } from "@/lib/prisma";

import { NOTIFICATION_PRIORITY, PR2_LIVE_CATEGORIES } from "./constants";
import { computePreferredHourLocal, resolvePreferredHour } from "./smart-timing";
import { inQuietHours, localParts, resolveTimezone } from "./time";
import { evaluateTriggers, type Candidate } from "./triggers";

const MIN_GAP_MS = 18 * 60 * 60 * 1000;

/** Shape the cron selects per candidate user (User + its prefs relation). */
export interface CandidateUser {
  id: string;
  email: string;
  name: string | null;
  subscriptionStatus: string | null;
  currentStreak: number;
  timezone: string | null;
  prefs: {
    emailEnabled: boolean;
    enabledCategories: string[];
    tone: string;
    quietHoursStart: string;
    quietHoursEnd: string;
    timezone: string | null;
    maxPerDay: number;
    maxPerWeek: number;
    pausedUntil: Date | null;
    lastNotifiedAt: Date | null;
    preferredHourLocal: number | null;
  };
}

export type Decision =
  | {
      action: "send";
      candidate: Candidate;
      tz: string;
      localDay: string;
      /** Set when we computed a fresh preferred hour the cron should persist. */
      storePreferredHour?: number;
    }
  | { action: "skip"; reason: string };

/** Deterministic, stable hash (FNV-1a) → used for daily variant rotation. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pickByPriority(candidates: Candidate[]): Candidate | null {
  for (const cat of NOTIFICATION_PRIORITY) {
    const hit = candidates.find((c) => c.category === cat);
    if (hit) return hit;
  }
  return candidates[0] ?? null;
}

async function recordedToday(userId: string, tz: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ recorded: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM "Entry"
      WHERE "userId" = ${userId}
        AND ("createdAt" AT TIME ZONE ${tz})::date = (NOW() AT TIME ZONE ${tz})::date
    ) AS recorded
  `;
  return rows[0]?.recorded ?? false;
}

/** How many engagement notifications were sent recently (for cap checks). */
async function sentCount(
  userId: string,
  window: { localDay: string } | { since: Date }
): Promise<number> {
  if ("localDay" in window) {
    return prisma.notificationLog.count({
      where: { userId, status: "sent", localDay: window.localDay },
    });
  }
  return prisma.notificationLog.count({
    where: { userId, status: "sent", sentAt: { gte: window.since } },
  });
}

/**
 * Run the full eligibility pipeline for one user. Returns a "send" decision
 * with the chosen candidate, or a "skip" with a reason. Read-only — the cron
 * performs the atomic claim + send + log.
 */
export async function evaluateUser(
  user: CandidateUser,
  now: Date
): Promise<Decision> {
  const prefs = user.prefs;
  if (!prefs) return { action: "skip", reason: "no_prefs" };
  if (!prefs.emailEnabled) return { action: "skip", reason: "email_disabled" };
  if (prefs.pausedUntil && prefs.pausedUntil > now) {
    return { action: "skip", reason: "paused" };
  }
  if (
    prefs.lastNotifiedAt &&
    now.getTime() - prefs.lastNotifiedAt.getTime() < MIN_GAP_MS
  ) {
    return { action: "skip", reason: "min_gap_18h" };
  }

  const tz = resolveTimezone(prefs.timezone, user.timezone);
  const parts = localParts(now, tz);

  if (inQuietHours(parts, prefs.quietHoursStart, prefs.quietHoursEnd)) {
    return { action: "skip", reason: "quiet_hours" };
  }

  // Frequency cap by plan: FREE → weekly, everyone else → daily.
  const isFree = (user.subscriptionStatus ?? "FREE") === "FREE";
  if (isFree) {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if ((await sentCount(user.id, { since: weekAgo })) >= prefs.maxPerWeek) {
      return { action: "skip", reason: "weekly_cap" };
    }
  } else {
    if ((await sentCount(user.id, { localDay: parts.day })) >= prefs.maxPerDay) {
      return { action: "skip", reason: "daily_cap" };
    }
  }

  // Live categories the user actually has enabled.
  const enabled = new Set<NotificationCategory>(
    prefs.enabledCategories
      .filter(isNotificationCategory)
      .filter((c) => PR2_LIVE_CATEGORIES.includes(c))
  );
  if (enabled.size === 0) {
    return { action: "skip", reason: "no_enabled_category" };
  }

  const recorded = await recordedToday(user.id, tz);

  // Preferred hour (only meaningfully needed by habit_reminder). Compute +
  // cache lazily when missing; if still null, fall back to 19:00 local.
  let storePreferredHour: number | undefined;
  let cachedHour = prefs.preferredHourLocal;
  if (cachedHour === null && enabled.has("habit_reminder") && !recorded) {
    const computed = await computePreferredHourLocal(user.id, tz);
    if (computed !== null) {
      cachedHour = computed;
      storePreferredHour = computed;
    }
  }
  const preferredHour = resolvePreferredHour(cachedHour);

  const candidates = await evaluateTriggers(
    {
      userId: user.id,
      now,
      localHour: parts.hour,
      recordedToday: recorded,
      currentStreak: user.currentStreak,
      preferredHour,
    },
    enabled
  );

  const candidate = pickByPriority(candidates);
  if (!candidate) return { action: "skip", reason: "no_candidate" };

  return { action: "send", candidate, tz, localDay: parts.day, storePreferredHour };
}
