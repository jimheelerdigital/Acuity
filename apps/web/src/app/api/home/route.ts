/**
 * GET /api/home
 *
 * Combined-read endpoint for Home screen surfaces that need
 * server-computed state: the progression checklist (created-at +
 * entry/weekly/audit counts + stored JSON) and today's daily prompt.
 *
 * Consolidated so mobile Home makes one call instead of three.
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

  const progression = await computeProgressionState({
    userId,
    createdAt: user.createdAt,
    storedState:
      (user.onboarding?.progressionChecklist as ProgressionState | null) ??
      null,
  });

  const dailyPrompt = pickDailyPrompt(
    userId,
    new Date().toISOString().slice(0, 10)
  );

  return NextResponse.json(
    { progression, dailyPrompt },
    {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    }
  );
}
