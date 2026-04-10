import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";
import { DEFAULT_LIFE_AREAS } from "@acuity/shared";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { prisma } = await import("@/lib/prisma");

  // Get last 8 weeks of entries with rawAnalysis
  const eightWeeksAgo = new Date();
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

  const entries = await prisma.entry.findMany({
    where: {
      userId,
      status: "COMPLETE",
      entryDate: { gte: eightWeeksAgo },
    },
    orderBy: { entryDate: "asc" },
    select: { entryDate: true, rawAnalysis: true },
  });

  // Group entries by week and compute average scores per area
  const weekMap = new Map<
    string,
    Record<string, { total: number; count: number }>
  >();

  for (const entry of entries) {
    const weekStart = getWeekStart(entry.entryDate);
    const weekKey = weekStart.toISOString().split("T")[0];

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, {});
    }
    const weekData = weekMap.get(weekKey)!;

    const analysis = entry.rawAnalysis as Record<string, unknown> | null;
    const mentions = analysis?.lifeAreaMentions as
      | Record<string, { mentioned: boolean; score: number }>
      | undefined;

    if (!mentions) continue;

    for (const area of DEFAULT_LIFE_AREAS) {
      const m = mentions[area.key];
      if (m?.mentioned) {
        if (!weekData[area.key]) {
          weekData[area.key] = { total: 0, count: 0 };
        }
        weekData[area.key].total += (m.score ?? 5) * 10;
        weekData[area.key].count++;
      }
    }
  }

  // Build response: per-area weekly scores
  const history = DEFAULT_LIFE_AREAS.map((area) => ({
    area: area.key,
    name: area.name,
    weeklyScores: Array.from(weekMap.entries()).map(([week, data]) => ({
      week,
      score: data[area.key]
        ? Math.round(data[area.key].total / data[area.key].count)
        : null,
    })),
  }));

  return NextResponse.json({ history });
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}
