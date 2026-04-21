/**
 * GET /api/home
 *
 * Combined-read endpoint for Home screen surfaces that need
 * server-computed state: the progression checklist and today's
 * tiered recommended activity prompt.
 *
 * The tiered selector (GOAL tree-aware → PATTERN → LIBRARY) lives
 * in `@/lib/recommendation` so the server-rendered dashboard and
 * this endpoint agree on the chosen prompt.
 *
 * Bearer-or-cookie auth via getAnySessionUserId.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import {
  computeProgressionState,
  type ProgressionState,
} from "@/lib/progression";
import { pickRecommendation } from "@/lib/recommendation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    pickRecommendation(prisma, userId),
  ]);

  return NextResponse.json(
    {
      progression,
      // `dailyPrompt` kept for back-compat with clients that only
      // consumed the string form; new clients should read
      // `recommendation` for tier + label + goalId metadata.
      dailyPrompt: recommendation.text,
      recommendation,
    },
    {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    }
  );
}
