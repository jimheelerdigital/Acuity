/**
 * Tiered recommended-activity selector shared between /api/home and
 * the server-rendered dashboard page so both surfaces agree on what
 * the user sees today.
 *
 * Tier 1 — goal-based (tree-aware post-2026-04-21):
 *   a. Parent with a stale child → "Your goal X has Y as a sub-step.
 *      How's that going?" (child.id anchors the CTA)
 *   b. Leaf with no children stale ≥7 days → "You set X N days ago..."
 *   c. Root with active children all recently mentioned → skip (user
 *      is engaged with the subtree; nudging the root reads as noise)
 *   Rotation uses (userId + dateKey) FNV-1a hash to pick an index
 *   across qualifying candidates so consecutive days don't repeat.
 *
 * Tier 2 — pattern-based: recurring theme in last 5 entries.
 * Tier 3 — library fallback: pickDailyPrompt.
 */

import type { Goal, PrismaClient } from "@prisma/client";

import { pickDailyPrompt } from "@acuity/shared";

export type RecommendationTier = "GOAL" | "PATTERN" | "LIBRARY";

export interface Recommendation {
  tier: RecommendationTier;
  label: string;
  text: string;
  goalId?: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function rotateIndex(seed: string, n: number): number {
  if (n <= 1) return 0;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % n;
}

export async function pickRecommendation(
  prisma: PrismaClient,
  userId: string
): Promise<Recommendation> {
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
  const activeGoals = await prisma.goal.findMany({
    where: {
      userId,
      status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      lastMentionedAt: true,
      parentGoalId: true,
    },
  });

  if (activeGoals.length > 0) {
    const rec = pickGoalTier(activeGoals, cutoff, userId);
    if (rec) return rec;
  }

  const recentEntries = await prisma.entry.findMany({
    where: { userId, status: "COMPLETE" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { themes: true },
  });

  if (recentEntries.length >= 3) {
    const counts: Record<string, number> = {};
    for (const e of recentEntries) {
      const seen = new Set<string>();
      for (const t of e.themes ?? []) {
        const key = t.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    const recurring = Object.entries(counts)
      .filter(([, n]) => n >= 2)
      .sort(([, a], [, b]) => b - a);
    if (recurring.length > 0) {
      return {
        tier: "PATTERN",
        label: "Based on your recent themes",
        text: `You've mentioned "${recurring[0][0]}" a few times lately. What's underneath that?`,
      };
    }
  }

  return {
    tier: "LIBRARY",
    label: "Today's prompt",
    text: pickDailyPrompt(userId, new Date().toISOString().slice(0, 10)),
  };
}

type GoalSlim = Pick<
  Goal,
  "id" | "title" | "createdAt" | "lastMentionedAt" | "parentGoalId"
>;

function pickGoalTier(
  goals: GoalSlim[],
  cutoff: Date,
  userId: string
): Recommendation | null {
  const childrenByParent = new Map<string, GoalSlim[]>();
  for (const g of goals) {
    if (!g.parentGoalId) continue;
    const bucket = childrenByParent.get(g.parentGoalId);
    if (bucket) bucket.push(g);
    else childrenByParent.set(g.parentGoalId, [g]);
  }

  const isStale = (g: Pick<GoalSlim, "lastMentionedAt">) =>
    g.lastMentionedAt === null || g.lastMentionedAt < cutoff;

  // (a) Parent/child-pair surface: stalest child whose parent is in
  // the active set. The pair phrasing reads context-aware, not
  // generic "you haven't touched this".
  const pairCandidates: Array<{ parent: GoalSlim; child: GoalSlim }> = [];
  for (const g of goals) {
    if (!g.parentGoalId) continue;
    if (!isStale(g)) continue;
    const parent = goals.find((p) => p.id === g.parentGoalId);
    if (parent) pairCandidates.push({ parent, child: g });
  }
  pairCandidates.sort((a, b) => {
    const aT = a.child.lastMentionedAt?.getTime() ?? 0;
    const bT = b.child.lastMentionedAt?.getTime() ?? 0;
    return aT - bT;
  });
  if (pairCandidates.length > 0) {
    const pair = pairCandidates[0];
    return {
      tier: "GOAL",
      label: "Building on your goals",
      text: `Your goal "${pair.parent.title}" has "${pair.child.title}" as a sub-step. How's that going?`,
      goalId: pair.child.id,
    };
  }

  // (b) Leaf with no children + stale. (c) Skip roots whose children
  // have all been recently mentioned.
  const leafCandidates = goals.filter((g) => {
    const children = childrenByParent.get(g.id);
    if (children && children.length > 0) return false;
    return isStale(g);
  });
  if (leafCandidates.length === 0) return null;

  leafCandidates.sort(
    (a, b) =>
      (a.lastMentionedAt?.getTime() ?? 0) -
      (b.lastMentionedAt?.getTime() ?? 0)
  );

  const dateKey = new Date().toISOString().slice(0, 10);
  const idx = rotateIndex(userId + dateKey, leafCandidates.length);
  const pick = leafCandidates[idx];
  const sinceDate = pick.lastMentionedAt ?? pick.createdAt;
  const days = Math.max(
    1,
    Math.round((Date.now() - sinceDate.getTime()) / (24 * 60 * 60 * 1000))
  );
  return {
    tier: "GOAL",
    label: "Building on your goals",
    text: `You set "${pick.title}" ${days} day${days === 1 ? "" : "s"} ago. What's one small thing you could do this week to get closer to it?`,
    goalId: pick.id,
  };
}
