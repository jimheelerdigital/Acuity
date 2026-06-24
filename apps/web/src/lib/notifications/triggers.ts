import type { NotificationCategory } from "@acuity/shared";

import { prisma } from "@/lib/prisma";

import {
  MILESTONE_RECENCY_HOURS,
  STREAK_EVENING_END_HOUR,
  STREAK_EVENING_START_HOUR,
  STREAK_MIN,
} from "./constants";

/**
 * Trigger evaluation for the three PR-2 (default-ON) categories. Each returns
 * a Candidate when its condition fires, else null. Opt-in categories
 * (goal/task/theme/life-area) are PR 3 — not evaluated here.
 *
 * Candidates carry the per-category data the email templates need (streak
 * count, milestone title) plus an optional refId used for dedup.
 */
export interface Candidate {
  category: NotificationCategory;
  refId?: string; // e.g. UserAchievement.id — dedups milestone re-sends
  streakCount?: number;
  milestoneTitle?: string;
}

export interface TriggerContext {
  userId: string;
  now: Date;
  localHour: number;
  recordedToday: boolean;
  currentStreak: number;
  preferredHour: number;
}

/**
 * milestone_celebration — a real achievement unlocked in the last 24h that we
 * haven't already emailed about. Highest priority (fresh wins decay). We
 * celebrate any recent unlock; the 18h floor + 1/day cap keep volume sane.
 * (Tier-gating to only "big" milestones is a possible future tuning knob.)
 */
async function milestoneCandidate(
  ctx: TriggerContext
): Promise<Candidate | null> {
  const cutoff = new Date(
    ctx.now.getTime() - MILESTONE_RECENCY_HOURS * 60 * 60 * 1000
  );
  const recent = await prisma.userAchievement.findFirst({
    where: { userId: ctx.userId, earnedAt: { gte: cutoff } },
    orderBy: { earnedAt: "desc" },
    select: { id: true, achievement: { select: { title: true } } },
  });
  if (!recent) return null;

  // Don't email the same achievement twice (it may sit unsent across ticks
  // until the user's send window / gates clear).
  const already = await prisma.notificationLog.findFirst({
    where: {
      userId: ctx.userId,
      category: "milestone_celebration",
      refId: recent.id,
      status: "sent",
    },
    select: { id: true },
  });
  if (already) return null;

  return {
    category: "milestone_celebration",
    refId: recent.id,
    milestoneTitle: recent.achievement.title,
  };
}

/**
 * streak_preservation — an at-risk streak (≥ STREAK_MIN, nothing recorded
 * today) nudged only in the evening window so "one entry keeps it alive" is
 * still actionable before the day ends. Conservative per the master spec.
 */
function streakCandidate(ctx: TriggerContext): Candidate | null {
  if (ctx.currentStreak < STREAK_MIN) return null;
  if (ctx.recordedToday) return null;
  if (
    ctx.localHour < STREAK_EVENING_START_HOUR ||
    ctx.localHour > STREAK_EVENING_END_HOUR
  ) {
    return null;
  }
  return { category: "streak_preservation", streakCount: ctx.currentStreak };
}

/**
 * habit_reminder — contentless fallback: nothing recorded today and it's the
 * user's typical engagement hour. Lowest priority.
 */
function habitCandidate(ctx: TriggerContext): Candidate | null {
  if (ctx.recordedToday) return null;
  if (ctx.localHour !== ctx.preferredHour) return null;
  return { category: "habit_reminder" };
}

/**
 * Evaluate all live categories the user has enabled; return every candidate
 * that fires (the caller picks one by priority).
 */
export async function evaluateTriggers(
  ctx: TriggerContext,
  enabled: ReadonlySet<NotificationCategory>
): Promise<Candidate[]> {
  const out: Candidate[] = [];
  if (enabled.has("milestone_celebration")) {
    const c = await milestoneCandidate(ctx);
    if (c) out.push(c);
  }
  if (enabled.has("streak_preservation")) {
    const c = streakCandidate(ctx);
    if (c) out.push(c);
  }
  if (enabled.has("habit_reminder")) {
    const c = habitCandidate(ctx);
    if (c) out.push(c);
  }
  return out;
}
