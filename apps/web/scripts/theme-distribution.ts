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
 *     dotenv_config_path=.env.local [--days=N] [--cohort=both|v0_legacy|v5_dispositional]
 *
 * Default window is 7 days. Pass --days=30 for the 30-day view, or
 * --days=14 to compare the prior week against the current one
 * (run twice with different windows).
 *
 * --cohort filter (W-B, 2026-05-03 — replaces date-cutoff inference):
 *   - both (default)        → emits per-cohort sections + a combined "all" view
 *   - v0_legacy             → only entries where Entry.themePromptVersion="v0_legacy"
 *   - v5_dispositional      → only entries where Entry.themePromptVersion="v5_dispositional"
 *
 * Entries with themePromptVersion=NULL are excluded from cohort-
 * filtered runs but counted in the "all" view. NULL entries fall
 * into the gap between commit b8a1b4d (V5 prompt landed,
 * 2026-05-01T02:57:32Z) and the W-B backfill SQL — pre-b8a1b4d
 * entries should be backfilled to "v0_legacy" by the SQL command
 * documented in PROGRESS.md's W-B entry; post-b8a1b4d entries are
 * unattributable.
 *
 * Output: JSON with totals, distribution percentiles, top themes,
 * and per-day theme creation counts. Pipe through `jq` to slice.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Cohort = "both" | "v0_legacy" | "v5_dispositional";

function parseDaysArg(): number {
  const arg = process.argv.find((a) => a.startsWith("--days="));
  if (!arg) return 7;
  const n = Number(arg.split("=")[1]);
  if (!Number.isFinite(n) || n <= 0 || n > 365) return 7;
  return Math.floor(n);
}

function parseCohortArg(): Cohort {
  const arg = process.argv.find((a) => a.startsWith("--cohort="));
  if (!arg) return "both";
  const value = arg.split("=")[1];
  if (value === "v0_legacy" || value === "v5_dispositional") return value;
  return "both";
}

interface MentionRow {
  theme_id: string;
  theme_name: string;
  user_id: string;
  sentiment: string;
  mention_at: Date;
  prompt_version: string | null;
}

interface MetricsReport {
  totals: {
    totalEntries: number;
    totalMentions: number;
    distinctThemes: number;
    themesCreatedInWindow: number;
  };
  distribution: {
    median: number;
    p90: number;
    p99: number;
    max: number;
    singleMention: number;
    singleMentionPct: number;
    fivePlus: number;
    fivePlusPct: number;
    tenPlus: number;
    tenPlusPct: number;
  };
  topThemes: { name: string; userId: string; mentionsInWindow: number }[];
  perDay: { date: string; mentions: number }[];
}

function computeMetrics(
  rows: MentionRow[],
  totalEntries: number,
  themesCreatedInWindow: number
): MetricsReport {
  const totalMentions = rows.length;
  const perThemeCount = new Map<string, number>();
  for (const m of rows) {
    perThemeCount.set(m.theme_id, (perThemeCount.get(m.theme_id) ?? 0) + 1);
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

  const topThemes = [...perThemeCount.entries()]
    .map(([themeId, count]) => {
      const sample = rows.find((m) => m.theme_id === themeId)!;
      return {
        name: sample.theme_name,
        userId: sample.user_id.slice(0, 8),
        mentionsInWindow: count,
      };
    })
    .sort((a, b) => b.mentionsInWindow - a.mentionsInWindow)
    .slice(0, 30);

  const perDay: Record<string, number> = {};
  for (const m of rows) {
    const day = m.mention_at.toISOString().slice(0, 10);
    perDay[day] = (perDay[day] ?? 0) + 1;
  }
  const perDayRows = Object.entries(perDay)
    .map(([date, count]) => ({ date, mentions: count }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
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
  };
}

async function main() {
  // BigInt serialization shim for raw-query counts (Prisma raw returns
  // bigint for `count(*)`).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (BigInt.prototype as any).toJSON = function () {
    return Number(this);
  };

  const days = parseDaysArg();
  const cohort = parseCohortArg();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Mentions in window — joined to Theme + Entry so we get
  // themePromptVersion for cohort attribution.
  // ThemeMention.createdAt is denormalized from Entry.createdAt at
  // write time, so the time filter still hits the indexed column.
  const mentionsInWindow = await prisma.$queryRaw<MentionRow[]>`
    SELECT
      tm."themeId" AS theme_id,
      t.name AS theme_name,
      t."userId" AS user_id,
      tm.sentiment,
      tm."createdAt" AS mention_at,
      e."themePromptVersion" AS prompt_version
    FROM "ThemeMention" tm
    JOIN "Theme" t ON t.id = tm."themeId"
    JOIN "Entry" e ON e.id = tm."entryId"
    WHERE tm."createdAt" >= ${since}
  `;

  const themesCreatedInWindow = await prisma.theme.count({
    where: { createdAt: { gte: since } },
  });

  const totalEntries = await prisma.entry.count({
    where: { status: "COMPLETE", createdAt: { gte: since } },
  });

  // Cohort-specific entry counts (denominator for per-cohort
  // singleMentionPct interpretation). Same WHERE shape as the
  // entries-in-window count above plus the version filter.
  const v0Entries = await prisma.entry.count({
    where: {
      status: "COMPLETE",
      createdAt: { gte: since },
      themePromptVersion: "v0_legacy",
    },
  });
  const v5Entries = await prisma.entry.count({
    where: {
      status: "COMPLETE",
      createdAt: { gte: since },
      themePromptVersion: "v5_dispositional",
    },
  });
  const nullEntries = await prisma.entry.count({
    where: {
      status: "COMPLETE",
      createdAt: { gte: since },
      themePromptVersion: null,
    },
  });

  if (cohort === "both") {
    const v0Rows = mentionsInWindow.filter((m) => m.prompt_version === "v0_legacy");
    const v5Rows = mentionsInWindow.filter(
      (m) => m.prompt_version === "v5_dispositional"
    );

    console.log(
      JSON.stringify(
        {
          window: { days, since: since.toISOString() },
          cohort: "both",
          cohortEntryCounts: {
            v0_legacy: v0Entries,
            v5_dispositional: v5Entries,
            null_unattributable: nullEntries,
            total: totalEntries,
          },
          all: computeMetrics(
            mentionsInWindow,
            totalEntries,
            themesCreatedInWindow
          ),
          v0_legacy: computeMetrics(v0Rows, v0Entries, 0),
          v5_dispositional: computeMetrics(v5Rows, v5Entries, 0),
        },
        null,
        2
      )
    );
  } else {
    const filtered = mentionsInWindow.filter(
      (m) => m.prompt_version === cohort
    );
    const cohortEntries = cohort === "v0_legacy" ? v0Entries : v5Entries;

    console.log(
      JSON.stringify(
        {
          window: { days, since: since.toISOString() },
          cohort,
          ...computeMetrics(filtered, cohortEntries, themesCreatedInWindow),
        },
        null,
        2
      )
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
