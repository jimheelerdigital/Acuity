/**
 * Weekly cron: snapshot each user's current LifeMapArea scores into
 * LifeMapAreaHistory. Drives the Insights radar's "4 weeks ago" overlay
 * polygon in the Current/Trend toggle.
 *
 * Cadence: Sundays at 00:05 UTC. The 5-minute offset leaves room for
 * any scheduled :00 work to finish before we read LifeMapArea rows.
 *
 * Idempotent per (userId, area, weekStart) — the schema unique
 * constraint lets us re-run this function safely (e.g. after a failed
 * deploy) without double-writing. The upsert uses the ISO-date of the
 * containing Sunday UTC as weekStart so a user in any timezone lands
 * on the same bucket.
 */

import { inngest } from "@/inngest/client";

/** Start of the Sunday that contains `now` (UTC midnight). */
function weekStartOf(now: Date): Date {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const dayOfWeek = d.getUTCDay(); // 0=Sun
  d.setUTCDate(d.getUTCDate() - dayOfWeek);
  return d;
}

export const snapshotLifemapHistoryFn = inngest.createFunction(
  {
    id: "snapshot-lifemap-history",
    name: "Snapshot Life Matrix history (weekly)",
    triggers: [{ cron: "5 0 * * 0" }],
    retries: 2,
  },
  async ({ step, logger }) => {
    const { prisma } = await import("@/lib/prisma");

    const weekStart = weekStartOf(new Date());

    // Fetch all LifeMapArea rows. Chunked in a single step for
    // observability; scale concern is >10k users, solved with a
    // paginated iterator when we get there.
    const rows = await step.run("fetch-areas", async () =>
      prisma.lifeMapArea.findMany({
        select: { userId: true, area: true, score: true },
      })
    );

    logger.info(`snapshotting ${rows.length} area rows for ${weekStart.toISOString()}`);

    // Idempotent upserts. Could batch with createMany({ skipDuplicates: true })
    // but that refuses when a composite unique exists on the table; the
    // straightforward loop keeps the shape simple and small.
    let written = 0;
    for (const row of rows) {
      await prisma.lifeMapAreaHistory.upsert({
        where: {
          userId_area_weekStart: {
            userId: row.userId,
            area: row.area,
            weekStart,
          },
        },
        create: {
          userId: row.userId,
          area: row.area,
          score: row.score,
          weekStart,
        },
        update: {
          score: row.score,
        },
      });
      written += 1;
    }

    return { weekStart: weekStart.toISOString(), written };
  }
);
