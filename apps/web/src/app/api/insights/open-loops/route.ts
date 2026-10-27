/**
 * GET /api/insights/open-loops (2026-10-27)
 *
 * Up to 3 "open loops" for the Insights tab: worries that keep coming up
 * and active goals that have gone quiet. Rules live in lib/open-loops.ts.
 * Web session or mobile bearer.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import {
  DAY_MS,
  WORRY_LOOKBACK_DAYS,
  computeOpenLoops,
} from "@/lib/open-loops";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { prisma } = await import("@/lib/prisma");
  const now = new Date();
  const since = new Date(now.getTime() - WORRY_LOOKBACK_DAYS * DAY_MS);

  const [mentions, goals] = await Promise.all([
    prisma.themeMention.findMany({
      where: {
        theme: { userId },
        createdAt: { gte: since },
        entry: { status: "COMPLETE" },
      },
      select: {
        themeId: true,
        entryId: true,
        createdAt: true,
        sentiment: true,
        theme: { select: { name: true } },
      },
    }),
    prisma.goal.findMany({
      where: {
        userId,
        status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        lastMentionedAt: { not: null },
      },
      select: {
        id: true,
        title: true,
        status: true,
        lastMentionedAt: true,
        entryRefs: true,
      },
    }),
  ]);

  const loops = computeOpenLoops(
    mentions.map((m) => ({
      themeId: m.themeId,
      themeName: m.theme.name,
      entryId: m.entryId,
      createdAt: m.createdAt,
      sentiment: m.sentiment,
    })),
    goals.map((g) => ({
      id: g.id,
      title: g.title,
      status: g.status,
      lastMentionedAt: g.lastMentionedAt,
      entryRefsCount: g.entryRefs.length,
    })),
    now
  );

  return NextResponse.json(
    { loops },
    { headers: { "Cache-Control": "private, max-age=900" } }
  );
}
