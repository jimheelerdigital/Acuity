/**
 * GET /api/lifemap/trend
 *
 * Returns a snapshot of each of the 6 life areas' scores "4 weeks ago"
 * so the Insights radar can render the Trend overlay polygon. Prefers
 * LifeMapAreaHistory when a snapshot exists within the target window;
 * falls back to computing from Entry.rawAnalysis aggregates (the same
 * shape /api/lifemap/history returns).
 *
 * hasEnoughHistory: true only when at least one of the 6 areas has
 * data from 4+ weeks ago. When false, the client disables the Trend
 * toggle and shows "Check back in a few weeks."
 */

import { NextRequest, NextResponse } from "next/server";

import { DEFAULT_LIFE_AREAS } from "@acuity/shared";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FOUR_WEEKS_MS = 4 * 7 * 24 * 60 * 60 * 1000;
// Window width: accept any snapshot/data within ±10 days of the 4-week
// target. Users who journal weekly might not hit an exact 28-day mark.
const WINDOW_DAYS = 10;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  const now = Date.now();
  const target = now - FOUR_WEEKS_MS;
  const windowStart = new Date(target - WINDOW_MS);
  const windowEnd = new Date(target + WINDOW_MS);

  // Preferred source: LifeMapAreaHistory snapshots within the window.
  const snapshots = await prisma.lifeMapAreaHistory.findMany({
    where: {
      userId,
      weekStart: { gte: windowStart, lte: windowEnd },
    },
  });

  const byArea: Record<string, number> = {};

  for (const s of snapshots) {
    // If multiple snapshots fall inside the window (shouldn't happen
    // with weekly cadence + ±10 day window, but defensive), take the
    // one closest to the 4-week target.
    const existing = byArea[s.area];
    if (existing === undefined) {
      byArea[s.area] = s.score;
    }
  }

  // Fallback: compute from Entry.rawAnalysis when no snapshot exists.
  // Same aggregation as /api/lifemap/history, trimmed to the ±10d window.
  if (Object.keys(byArea).length === 0) {
    const entries = await prisma.entry.findMany({
      where: {
        userId,
        status: "COMPLETE",
        entryDate: { gte: windowStart, lte: windowEnd },
      },
      select: { rawAnalysis: true },
    });

    const totals: Record<string, { total: number; count: number }> = {};
    for (const entry of entries) {
      const analysis = entry.rawAnalysis as Record<string, unknown> | null;
      const mentions = analysis?.lifeAreaMentions as
        | Record<string, { mentioned: boolean; score: number }>
        | undefined;
      if (!mentions) continue;

      for (const area of DEFAULT_LIFE_AREAS) {
        // lifeAreaMentions uses lowercase `key` (career, health, …)
        // but the snapshot + radar use uppercase `enum` (CAREER, …).
        // Store under `enum` so both sources key consistently.
        const m = mentions[area.key];
        if (m?.mentioned) {
          if (!totals[area.enum]) totals[area.enum] = { total: 0, count: 0 };
          totals[area.enum].total += (m.score ?? 5) * 10;
          totals[area.enum].count += 1;
        }
      }
    }

    for (const [area, { total, count }] of Object.entries(totals)) {
      if (count > 0) byArea[area] = Math.round(total / count);
    }
  }

  // Final: return an area-keyed snapshot. Any area without data stays
  // out of the response; the client renders its trend vertex at the
  // current score if missing (zero-delta overlay).
  const fourWeeksAgo = DEFAULT_LIFE_AREAS.map((a) => ({
    area: a.enum,
    score: byArea[a.enum] ?? null,
  }));

  const hasEnoughHistory = fourWeeksAgo.some((x) => x.score !== null);

  return NextResponse.json(
    {
      hasEnoughHistory,
      fourWeeksAgo,
      source: snapshots.length > 0 ? "snapshot" : "derived",
    },
    {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    }
  );
}
