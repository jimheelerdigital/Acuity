/**
 * GET /api/insights/first-read (2026-10-27)
 *
 * "Your first read": the small report for people with 3+ completed
 * entries who haven't unlocked Pattern Insights yet. Rules are in
 * lib/first-read.ts.
 *
 * The Pattern Insights gate is applied by the CALLER from its own
 * progression (the app's Insights tab already holds it). Like
 * /api/insights/emerging-patterns, this deliberately avoids
 * getUserProgression, whose snapshot write would swallow
 * `recentlyUnlocked` before /api/user/progression could show it.
 *
 * Response: { firstRead: FirstRead | null }. null means render nothing.
 * Auth: cookie session or mobile bearer (getAnySessionUserId).
 */
import { NextRequest, NextResponse } from "next/server";

import { selectEmergingThemes } from "@/lib/emerging-patterns";
import { loadEmergingThemeCandidates } from "@/lib/emerging-patterns-data";
import {
  FIRST_READ_MIN_ENTRIES,
  MAX_TASK_TITLES,
  buildFirstRead,
} from "@/lib/first-read";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  const completedEntries = await prisma.entry.findMany({
    where: { userId, status: "COMPLETE" },
    select: { moodScore: true, energy: true },
  });
  if (completedEntries.length < FIRST_READ_MIN_ENTRIES) {
    return NextResponse.json({ firstRead: null });
  }

  const [capturedTaskCount, recentTasks, candidates, entriesCount] =
    await Promise.all([
      prisma.task.count({ where: { userId, entryId: { not: null } } }),
      prisma.task.findMany({
        where: { userId, entryId: { not: null } },
        orderBy: { createdAt: "desc" },
        take: MAX_TASK_TITLES,
        select: { title: true, text: true },
      }),
      loadEmergingThemeCandidates(prisma, userId),
      prisma.entry.count({ where: { userId } }),
    ]);

  const emerging = selectEmergingThemes({
    entriesCount,
    themeMapUnlocked: false,
    themes: candidates,
  });

  const firstRead = buildFirstRead({
    completedEntries,
    capturedTaskCount,
    recentTaskTitles: recentTasks.map((t) => t.title ?? t.text ?? ""),
    emergingThemeLabels: emerging.map((t) => t.label),
  });

  return NextResponse.json(
    { firstRead },
    { headers: { "Cache-Control": "private, max-age=300" } }
  );
}
