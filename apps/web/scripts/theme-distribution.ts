/**
 * Theme distribution metrics — observability for the v1.1
 * dispositional-themes rollout. Run weekly to verify the lab
 * improvement (Phase 2 bench: 80% singletons → ~30% singletons,
 * docs/v1-1/theme-extraction-phase2.md) holds at production scale.
 *
 * Reports the same metrics computed in scripts/theme-audit.ts
 * (Phase 1) but scoped to a rolling time window so we can compare
 * pre- and post-rollout cohorts.
 *
 * Usage:
 *   cd apps/web
 *   unset DATABASE_URL DIRECT_URL  # if a stale shell value points elsewhere
 *   npx tsx -r dotenv/config scripts/theme-distribution.ts \
 *     dotenv_config_path=.env.local [--days=N]
 *
 * Default window is 7 days. Pass --days=30 for the 30-day view, or
 * --days=14 to compare the prior week against the current one
 * (run twice with different windows).
 *
 * Output: JSON with totals, distribution percentiles, top themes,
 * and per-day theme creation counts. Pipe through `jq` to slice.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseDaysArg(): number {
  const arg = process.argv.find((a) => a.startsWith("--days="));
  if (!arg) return 7;
  const n = Number(arg.split("=")[1]);
  if (!Number.isFinite(n) || n <= 0 || n > 365) return 7;
  return Math.floor(n);
}

async function main() {
  // BigInt serialization shim for raw-query counts (Prisma raw returns
  // bigint for `count(*)`).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (BigInt.prototype as any).toJSON = function () {
    return Number(this);
  };

  const days = parseDaysArg();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Mentions in window — joined to Theme so we get name + per-mention
  // sentiment + the entry's createdAt (denormalized on ThemeMention,
  // so no Entry join needed).
  const mentionsInWindow = await prisma.$queryRaw<
    {
      theme_id: string;
      theme_name: string;
      user_id: string;
      sentiment: string;
      mention_at: Date;
    }[]
  >`
    SELECT
      tm."themeId" AS theme_id,
      t.name AS theme_name,
      t."userId" AS user_id,
      tm.sentiment,
      tm."createdAt" AS mention_at
    FROM "ThemeMention" tm
    JOIN "Theme" t ON t.id = tm."themeId"
    WHERE tm."createdAt" >= ${since}
  `;

  // Themes CREATED in window (vs. existing themes that just got new
  // mentions). createdAt on Theme = first time the (userId, name)
  // tuple was upserted.
  const themesCreatedInWindow = await prisma.theme.count({
    where: { createdAt: { gte: since } },
  });

  const totalMentions = mentionsInWindow.length;
  const totalEntries = await prisma.entry.count({
    where: { status: "COMPLETE", createdAt: { gte: since } },
  });

  // Mentions-per-theme distribution within window.
  const perThemeCount = new Map<string, number>();
  for (const m of mentionsInWindow) {
    perThemeCount.set(
      m.theme_id,
      (perThemeCount.get(m.theme_id) ?? 0) + 1
    );
  }
  const counts = [...perThemeCount.values()].sort((a, b) => a - b);
  const distinct = counts.length;
  const median = counts[Math.floor(counts.length / 2)] ?? 0;
  const p90 = counts[Math.floor(counts.length * 0.9)] ?? 0;
  const p99 = counts[Math.floor(counts.length * 0.99)] ?? 0;
  const max = counts[counts.length - 1] ?? 0;
  const single = counts.filter((c) => c === 1).length;
  const fivePlus = counts.filter((c) => c >= 5).length;
  const tenPlus = counts.filter((c) => c >= 10).length;

  // Top 30 themes by mention count within window.
  const topThemes = [...perThemeCount.entries()]
    .map(([themeId, count]) => {
      const sample = mentionsInWindow.find((m) => m.theme_id === themeId)!;
      return {
        name: sample.theme_name,
        userId: sample.user_id.slice(0, 8),
        mentionsInWindow: count,
      };
    })
    .sort((a, b) => b.mentionsInWindow - a.mentionsInWindow)
    .slice(0, 30);

  // Per-day mention volume (helps spot ramp-up after a rollout flip).
  const perDay: Record<string, number> = {};
  for (const m of mentionsInWindow) {
    const day = m.mention_at.toISOString().slice(0, 10);
    perDay[day] = (perDay[day] ?? 0) + 1;
  }
  const perDayRows = Object.entries(perDay)
    .map(([date, count]) => ({ date, mentions: count }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  console.log(
    JSON.stringify(
      {
        window: { days, since: since.toISOString() },
        totals: {
          totalEntries,
          totalMentions,
          distinctThemes: distinct,
          themesCreatedInWindow,
        },
        distribution: {
          median,
          p90,
          p99,
          max,
          singleMention: single,
          singleMentionPct:
            distinct === 0 ? 0 : Math.round((single / distinct) * 1000) / 10,
          fivePlus,
          fivePlusPct:
            distinct === 0 ? 0 : Math.round((fivePlus / distinct) * 1000) / 10,
          tenPlus,
          tenPlusPct:
            distinct === 0 ? 0 : Math.round((tenPlus / distinct) * 1000) / 10,
        },
        topThemes,
        perDay: perDayRows,
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
