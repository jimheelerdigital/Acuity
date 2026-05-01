import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. Total distinct themes + total mentions
  const totalThemes = await prisma.theme.count();
  const totalMentions = await prisma.themeMention.count();
  const totalEntries = await prisma.entry.count({ where: { status: "COMPLETE" } });
  const totalUsers = await prisma.user.count();

  // 2. Mentions-per-theme distribution
  const themeCounts = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count
    FROM "ThemeMention"
    GROUP BY "themeId"
    ORDER BY count(*) DESC
  `;
  const counts = themeCounts.map((r) => Number(r.count)).sort((a, b) => a - b);
  const median = counts[Math.floor(counts.length / 2)] ?? 0;
  const p90 = counts[Math.floor(counts.length * 0.9)] ?? 0;
  const p99 = counts[Math.floor(counts.length * 0.99)] ?? 0;
  const max = counts[counts.length - 1] ?? 0;
  const single = counts.filter((c) => c === 1).length;
  const fivePlus = counts.filter((c) => c >= 5).length;
  const tenPlus = counts.filter((c) => c >= 10).length;

  // 3. Top 30 most-mentioned themes
  const topThemes = await prisma.$queryRaw<
    { name: string; userId: string; mention_count: bigint }[]
  >`
    SELECT t.name, t."userId", count(tm.*) AS mention_count
    FROM "Theme" t
    LEFT JOIN "ThemeMention" tm ON tm."themeId" = t.id
    GROUP BY t.id, t.name, t."userId"
    ORDER BY count(tm.*) DESC
    LIMIT 30
  `;

  // 4. 20 random recent entries with themes (last 30 days)
  const recentEntries = await prisma.entry.findMany({
    where: {
      status: "COMPLETE",
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    select: {
      id: true,
      createdAt: true,
      summary: true,
      themes: true,
      themeMentions: {
        select: {
          sentiment: true,
          theme: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  // Random sample of 20
  const sample = recentEntries
    .sort(() => Math.random() - 0.5)
    .slice(0, 20);

  // Per-user theme counts (concentration)
  const perUser = await prisma.$queryRaw<
    { themes_per_user: number; user_count: bigint }[]
  >`
    SELECT theme_count AS themes_per_user, count(*) AS user_count
    FROM (
      SELECT "userId", count(*) AS theme_count
      FROM "Theme"
      GROUP BY "userId"
    ) t
    GROUP BY theme_count
    ORDER BY theme_count DESC
    LIMIT 20
  `;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (BigInt.prototype as any).toJSON = function () {
    return Number(this);
  };

  console.log(
    JSON.stringify(
      {
        totals: { totalThemes, totalMentions, totalEntries, totalUsers },
        distribution: {
          median,
          p90,
          p99,
          max,
          singleMention: single,
          singleMentionPct:
            counts.length === 0
              ? 0
              : Math.round((single / counts.length) * 1000) / 10,
          fivePlus,
          fivePlusPct:
            counts.length === 0
              ? 0
              : Math.round((fivePlus / counts.length) * 1000) / 10,
          tenPlus,
          tenPlusPct:
            counts.length === 0
              ? 0
              : Math.round((tenPlus / counts.length) * 1000) / 10,
        },
        topThemes: topThemes.map((t) => ({
          name: t.name,
          userId: t.userId.slice(0, 8),
          mentions: Number(t.mention_count),
        })),
        perUserThemeCounts: perUser.map((p) => ({
          themesPerUser: p.themes_per_user,
          userCount: Number(p.user_count),
        })),
        sample: sample.map((e) => ({
          id: e.id.slice(0, 8),
          date: e.createdAt.toISOString().slice(0, 10),
          summary: (e.summary ?? "").slice(0, 200),
          themesArray: e.themes,
          relationalThemes: e.themeMentions.map((m) => ({
            name: m.theme.name,
            sentiment: m.sentiment,
          })),
        })),
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
