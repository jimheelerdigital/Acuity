/**
 * GET /api/insights/how-you-talk (2026-10-27)
 *
 * Shifts in the user's feeling words: last 30 days vs the 30 before.
 * Logic, lexicon and thresholds live in lib/how-you-talk.ts. Returns
 * { enoughData: false, shifts: [] } when either period is too thin.
 * Cached privately for an hour, like the comparisons card.
 */
import { NextRequest, NextResponse } from "next/server";

import {
  MAX_CHARS_PER_TRANSCRIPT,
  PERIOD_DAYS,
  compareTalk,
  countPeriod,
} from "@/lib/how-you-talk";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Cap rows read: two months of very frequent recording. */
const MAX_ENTRIES = 240;

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { prisma } = await import("@/lib/prisma");

  const now = Date.now();
  const splitAt = new Date(now - PERIOD_DAYS * DAY_MS);
  const since = new Date(now - 2 * PERIOD_DAYS * DAY_MS);

  const rows = await prisma.entry.findMany({
    where: {
      userId,
      status: "COMPLETE",
      createdAt: { gte: since },
      transcript: { not: null },
    },
    select: { createdAt: true, transcript: true },
    orderBy: { createdAt: "desc" },
    take: MAX_ENTRIES,
  });

  const current: string[] = [];
  const previous: string[] = [];
  for (const r of rows) {
    const t = (r.transcript ?? "").slice(0, MAX_CHARS_PER_TRANSCRIPT);
    (r.createdAt >= splitAt ? current : previous).push(t);
  }

  const result = compareTalk(countPeriod(current), countPeriod(previous));
  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, max-age=3600" },
  });
}
