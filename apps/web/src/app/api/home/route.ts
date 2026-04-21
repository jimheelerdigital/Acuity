/**
 * GET /api/home
 *
 * Combined-read endpoint for Home screen surfaces that need
 * server-computed state: the progression checklist (created-at +
 * entry/weekly/audit counts + stored JSON) and today's recommended
 * activity prompt.
 *
 * Recommended activity is computed in 3 tiers, falling through to the
 * next tier when the prior doesn't apply:
 *
 *   Tier 1 — goal-based. If the user has ≥1 active goal (status in
 *     NOT_STARTED / IN_PROGRESS) whose `lastMentionedAt` is ≥7 days
 *     ago (or missing), surface "You set 'X' N days ago. What's one
 *     small thing you could do this week to get closer to it?" The
 *     stalest goal wins; ties broken by recency of creation.
 *
 *   Tier 2 — pattern-based. If the user has recent entries and a
 *     theme appears in ≥2 of the last 5 entries, surface "You've
 *     mentioned Y a few times lately. What's underneath that?"
 *
 *   Tier 3 — library fallback. `pickDailyPrompt` from the shared
 *     package returns a deterministic (userId+dateKey) pick from the
 *     20-prompt library. This always returns something.
 *
 * Bearer-or-cookie auth via getAnySessionUserId.
 */

import { NextRequest, NextResponse } from "next/server";

import { pickDailyPrompt } from "@acuity/shared";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import {
  computeProgressionState,
  type ProgressionState,
} from "@/lib/progression";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type RecommendationTier = "GOAL" | "PATTERN" | "LIBRARY";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      onboarding: { select: { progressionChecklist: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [progression, recommendation] = await Promise.all([
    computeProgressionState({
      userId,
      createdAt: user.createdAt,
      storedState:
        (user.onboarding?.progressionChecklist as ProgressionState | null) ??
        null,
    }),
    computeRecommendation(userId),
  ]);

  return NextResponse.json(
    {
      progression,
      // `dailyPrompt` kept for back-compat with clients that only
      // consumed the string form; new clients should read `recommendation`.
      dailyPrompt: recommendation.text,
      recommendation,
    },
    {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    }
  );
}

async function computeRecommendation(userId: string): Promise<{
  tier: RecommendationTier;
  label: string;
  text: string;
  goalId?: string;
}> {
  const { prisma } = await import("@/lib/prisma");

  // Tier 1 — goal-based. Prefer the stalest non-complete goal whose
  // lastMentionedAt is either null or ≥7 days old.
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
  const staleGoal = await prisma.goal.findFirst({
    where: {
      userId,
      status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
      OR: [{ lastMentionedAt: null }, { lastMentionedAt: { lt: cutoff } }],
    },
    orderBy: [{ lastMentionedAt: "asc" }, { createdAt: "desc" }],
    select: { id: true, title: true, createdAt: true, lastMentionedAt: true },
  });

  if (staleGoal) {
    const sinceDate = staleGoal.lastMentionedAt ?? staleGoal.createdAt;
    const days = Math.max(
      1,
      Math.round((Date.now() - sinceDate.getTime()) / (24 * 60 * 60 * 1000))
    );
    return {
      tier: "GOAL",
      label: "Building on your goals",
      text: `You set "${staleGoal.title}" ${days} day${days === 1 ? "" : "s"} ago. What's one small thing you could do this week to get closer to it?`,
      goalId: staleGoal.id,
    };
  }

  // Tier 2 — pattern-based. Look at the last 5 COMPLETE entries for a
  // theme repeated in ≥2 of them. "Repeated theme" uses case-insensitive
  // string match on Entry.themes.
  const recentEntries = await prisma.entry.findMany({
    where: { userId, status: "COMPLETE" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { themes: true },
  });

  if (recentEntries.length >= 3) {
    const counts: Record<string, number> = {};
    for (const e of recentEntries) {
      const seen = new Set<string>(); // dedupe within a single entry
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
      const theme = recurring[0][0];
      return {
        tier: "PATTERN",
        label: "Based on your recent themes",
        text: `You've mentioned "${theme}" a few times lately. What's underneath that?`,
      };
    }
  }

  // Tier 3 — library. Deterministic per-user per-day.
  return {
    tier: "LIBRARY",
    label: "Today's prompt",
    text: pickDailyPrompt(userId, new Date().toISOString().slice(0, 10)),
  };
}
