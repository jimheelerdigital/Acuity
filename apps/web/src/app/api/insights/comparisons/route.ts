/**
 * GET /api/insights/comparisons
 *
 * Three comparison groups for the Insights comparison card:
 *   1. This week vs last week   — sessions, mood avg, top theme
 *   2. This month vs last month — same shape
 *   3. Since starting Acuity    — total sessions, days journaled, longest streak
 *
 * Computed server-side. Cache-Control: private, max-age=3600 — the
 * counts only change when a new entry lands, and the card tolerates
 * an hour of staleness in exchange for not re-scanning a month of
 * entries on every Insights page view.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

const MOOD_RANK: Record<string, number> = {
  ROUGH: 1,
  LOW: 2,
  NEUTRAL: 3,
  GOOD: 4,
  GREAT: 5,
};
const MOOD_LABELS: Record<number, string> = {
  1: "Rough",
  2: "Low",
  3: "Neutral",
  4: "Good",
  5: "Great",
};

type EntrySlice = {
  createdAt: Date;
  mood: string | null;
  themes: string[];
};

function moodAvgLabel(entries: EntrySlice[]): string | null {
  const ranks = entries
    .map((e) => (e.mood ? MOOD_RANK[e.mood] : null))
    .filter((r): r is number => r !== null);
  if (ranks.length === 0) return null;
  const avg = Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length);
  return MOOD_LABELS[avg] ?? null;
}

function topTheme(entries: EntrySlice[]): string | null {
  const freq: Record<string, number> = {};
  for (const e of entries) {
    for (const t of e.themes ?? []) {
      const key = t.toLowerCase();
      freq[key] = (freq[key] ?? 0) + 1;
    }
  }
  let best: [string, number] | null = null;
  for (const [k, v] of Object.entries(freq)) {
    if (!best || v > best[1]) best = [k, v];
  }
  return best?.[0] ?? null;
}

function daysJournaled(entries: EntrySlice[]): number {
  const dayKeys = new Set<string>();
  for (const e of entries) {
    const d = new Date(e.createdAt);
    dayKeys.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`);
  }
  return dayKeys.size;
}

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  const now = Date.now();
  const monthAgo = new Date(now - MONTH_MS);
  const twoMonthsAgo = new Date(now - 2 * MONTH_MS);

  // Pull last 2 months of completed entries — covers all three groups
  // except "since starting Acuity", which we compute from totals.
  const [recent, user, allCount] = await Promise.all([
    prisma.entry.findMany({
      where: {
        userId,
        status: "COMPLETE",
        createdAt: { gte: twoMonthsAgo },
      },
      select: { createdAt: true, mood: true, themes: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { longestStreak: true, createdAt: true },
    }),
    prisma.entry.count({ where: { userId, status: "COMPLETE" } }),
  ]);

  const cutoff = (ms: number) => new Date(now - ms);
  const within = (entries: EntrySlice[], from: Date, to: Date) =>
    entries.filter(
      (e) => e.createdAt >= from && e.createdAt < to
    );

  const thisWeek = within(recent, cutoff(WEEK_MS), new Date(now));
  const lastWeek = within(recent, cutoff(2 * WEEK_MS), cutoff(WEEK_MS));
  const thisMonth = within(recent, cutoff(MONTH_MS), new Date(now));
  const lastMonth = within(recent, cutoff(2 * MONTH_MS), cutoff(MONTH_MS));

  // "Since starting" needs the full span. We could count-only, but the
  // days-journaled number needs distinct-day calc, so pull the dates
  // column for all entries (lean projection).
  const allEntryDays = await prisma.entry.findMany({
    where: { userId, status: "COMPLETE" },
    select: { createdAt: true },
  });

  const payload = {
    thisWeekVsLast: {
      thisWeek: {
        sessions: thisWeek.length,
        moodAvg: moodAvgLabel(thisWeek),
        topTheme: topTheme(thisWeek),
      },
      lastWeek: {
        sessions: lastWeek.length,
        moodAvg: moodAvgLabel(lastWeek),
        topTheme: topTheme(lastWeek),
      },
    },
    thisMonthVsLast: {
      thisMonth: {
        sessions: thisMonth.length,
        moodAvg: moodAvgLabel(thisMonth),
        topTheme: topTheme(thisMonth),
      },
      lastMonth: {
        sessions: lastMonth.length,
        moodAvg: moodAvgLabel(lastMonth),
        topTheme: topTheme(lastMonth),
      },
    },
    sinceStarting: {
      totalSessions: allCount,
      daysJournaled: daysJournaled(
        allEntryDays.map((e) => ({ createdAt: e.createdAt, mood: null, themes: [] }))
      ),
      longestStreak: user?.longestStreak ?? 0,
      sinceDate: user?.createdAt?.toISOString() ?? null,
    },
  };

  return NextResponse.json(payload, {
    headers: {
      // Private cache — user-specific data. Browser + CDN can hold it
      // for 1h; the comparison card tolerates that staleness.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
