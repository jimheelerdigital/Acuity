/**
 * GET /api/insights/callback (2026-10-27)
 *
 * "From a month ago": one past entry (26–35 days before this week) that
 * shares a theme with last week, shown as a safe snippet. Rules live in
 * lib/callback.ts. Web session or mobile bearer. Returns { callback | null }.
 */

import { NextRequest, NextResponse } from "next/server";

import { callbackWindows, computeCallback, type CallbackEntry } from "@/lib/callback";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Cap the candidate set; a month-old window rarely has more. */
const MAX_PAST = 40;
const MAX_RECENT = 60;

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { prisma } = await import("@/lib/prisma");
  const now = new Date();
  const w = callbackWindows(now);

  const select = {
    id: true,
    createdAt: true,
    summary: true,
    wins: true,
    moodScore: true,
    themeMentions: { select: { themeId: true, theme: { select: { name: true } } } },
  } as const;

  const [pastRows, recentRows] = await Promise.all([
    prisma.entry.findMany({
      where: { userId, status: "COMPLETE", createdAt: { gte: w.pastFrom, lt: w.pastTo } },
      // Transcript only for the safety check on this small candidate set.
      select: { ...select, transcript: true },
      orderBy: { createdAt: "asc" },
      take: MAX_PAST,
    }),
    prisma.entry.findMany({
      where: { userId, status: "COMPLETE", createdAt: { gte: w.recentFrom, lt: w.recentTo } },
      select,
      orderBy: { createdAt: "desc" },
      take: MAX_RECENT,
    }),
  ]);

  const toEntry = (r: {
    id: string;
    createdAt: Date;
    summary: string | null;
    wins: string[];
    moodScore: number | null;
    transcript?: string | null;
    themeMentions: Array<{ themeId: string; theme: { name: string } }>;
  }): CallbackEntry => ({
    id: r.id,
    createdAt: r.createdAt,
    summary: r.summary,
    wins: r.wins ?? [],
    moodScore: r.moodScore,
    transcript: r.transcript ?? null,
    themes: r.themeMentions.map((m) => ({ themeId: m.themeId, name: m.theme.name })),
  });

  const callback = computeCallback(pastRows.map(toEntry), recentRows.map(toEntry), now, userId);

  return NextResponse.json(
    { callback },
    { headers: { "Cache-Control": "private, max-age=3600" } }
  );
}
