import { WeeklyInsightCard } from "../weekly-insight-card";

/**
 * Weekly insight card section. Pulls the most recent COMPLETE
 * weekly report, total entry count (empty-state gating), and the
 * top 3 themes (empty-state body). The presentational
 * WeeklyInsightCard component stays untouched.
 */
export async function WeeklyInsightSection({ userId }: { userId: string }) {
  const { prisma } = await import("@/lib/prisma");
  const { getUserProgression } = await import("@/lib/userProgression");

  const [report, entryCount, topThemes, userProg] = await Promise.all([
    prisma.weeklyReport.findFirst({
      where: { userId, status: "COMPLETE" },
      orderBy: { weekStart: "desc" },
      select: {
        id: true,
        weekStart: true,
        weekEnd: true,
        insightBullets: true,
        narrative: true,
      },
    }),
    prisma.entry.count({ where: { userId } }),
    fetchTopThemes(userId),
    getUserProgression(userId),
  ]);

  return (
    <WeeklyInsightCard
      report={report}
      entryCount={entryCount}
      unlocked={userProg.unlocked.weeklyReport}
      topThemes={topThemes}
    />
  );
}

async function fetchTopThemes(
  userId: string
): Promise<Array<{ name: string; count: number }>> {
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.theme.findMany({
    where: { userId },
    select: {
      name: true,
      _count: { select: { mentions: true } },
    },
    orderBy: { mentions: { _count: "desc" } },
    take: 3,
  });
  return rows
    .map((r) => ({ name: r.name, count: r._count.mentions }))
    .filter((r) => r.count > 0);
}
