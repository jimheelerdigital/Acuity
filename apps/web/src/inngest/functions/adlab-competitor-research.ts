import { inngest } from "@/inngest/client";

/**
 * Weekly competitor ad research (2026-09-24, per Keenan).
 *
 * Saturday 18:00 UTC — ahead of the Sunday 10:00 UTC weekly ad batch, which
 * reads the resulting AdLabCompetitorBrief per audience group:
 *   per group: scrape each source (one step each — an Apify run-sync call
 *   can take minutes) → Claude brief.
 *
 * Soft everywhere: a failed source is skipped, a failed brief means the
 * batch runs without a competitor section. Never touches Meta ads.
 *
 * Manual trigger: "adlab/competitor-research.requested"
 * (POST /api/admin/adlab/run-competitor-research).
 */
export const adlabCompetitorResearchFn = inngest.createFunction(
  {
    id: "adlab-competitor-research",
    name: "AdLab — Weekly Competitor Ad Research",
    retries: 1,
    concurrency: { limit: 1 },
    triggers: [
      { cron: "0 18 * * 6" },
      { event: "adlab/competitor-research.requested" },
    ],
  },
  async ({ step, logger }) => {
    const groups = ["women", "men"] as const;
    const results: Record<string, unknown> = {};

    for (const groupKey of groups) {
      const { COMPETITOR_SOURCES } = await import("@/lib/adlab/competitor-research");
      const scrapes = [];
      for (const source of COMPETITOR_SOURCES[groupKey]) {
        const r = await step.run(`scrape-${groupKey}-${source.id}`, async () => {
          const { scrapeCompetitorSource } = await import("@/lib/adlab/competitor-research");
          return scrapeCompetitorSource(groupKey, source);
        });
        if (r.error) logger.warn(`[competitor-research] ${groupKey} ${r.source}: ${r.error}`);
        scrapes.push(r);
      }

      const brief = await step.run(`brief-${groupKey}`, async () => {
        const { runCompetitorBrief } = await import("@/lib/adlab/competitor-research");
        return runCompetitorBrief(groupKey);
      });

      results[groupKey] = { scrapes, brief };
      logger.info(
        `[competitor-research] ${groupKey}: ${scrapes.reduce((n, s) => n + s.kept, 0)} ads kept, brief ${brief.briefId ?? `FAILED (${brief.error})`}`
      );
    }
    return results;
  }
);
