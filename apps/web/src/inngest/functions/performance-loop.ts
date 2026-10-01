import { inngest } from "@/inngest/client";

/**
 * Performance loop crons (2026-09-30, per Keenan: "I want our analysis to
 * see what does well and give it to jev to make decisions on what we post
 * daily"). See lib/content-factory/performance-loop.ts for the design.
 *
 *   scoreboardRefreshFn — 04:30 UTC daily, after the 03:00 metrics refresh
 *     and before the 05:00 generation runs. Backfills missing recipes,
 *     scores every loop-lane post 48h–30d old, writes scoreboard/<brand>.json.
 *     Manual: "content-factory/scoreboard.refresh".
 *   performanceReportFn — Mondays 14:00 UTC: refreshes, then emails Keenan
 *     the weekly winners / losers / scoreboard. Manual:
 *     "content-factory/performance.report" (POST
 *     /api/admin/content-factory/performance-report).
 */
export const scoreboardRefreshFn = inngest.createFunction(
  {
    id: "performance-scoreboard-refresh",
    name: "Content Factory — Performance Scoreboard Refresh",
    retries: 1,
    triggers: [{ cron: "30 4 * * *" }, { event: "content-factory/scoreboard.refresh" }],
  },
  async ({ step, logger }) => {
    const summary = await step.run("refresh-scoreboards", async () => {
      const { refreshScoreboards } = await import("@/lib/content-factory/performance-loop");
      const boards = await refreshScoreboards();
      return boards.map((b) => ({
        brand: b.brand,
        posts: b.posts,
        types: Object.fromEntries(Object.entries(b.postTypes).map(([k, v]) => [k, `${v.label} (${v.n}, ${v.mean})`])),
      }));
    });
    logger.info(`[performance-loop] scoreboards: ${JSON.stringify(summary)}`);
    return { summary };
  }
);

export const performanceReportFn = inngest.createFunction(
  {
    id: "performance-weekly-report",
    name: "Content Factory — Weekly Performance Report",
    retries: 1,
    triggers: [{ cron: "0 14 * * 1" }, { event: "content-factory/performance.report" }],
  },
  async ({ step }) => {
    const boards = await step.run("refresh", async () => {
      const { refreshScoreboards } = await import("@/lib/content-factory/performance-loop");
      return refreshScoreboards();
    });
    const sent = await step.run("email", async () => {
      const { sendPerformanceReport } = await import("@/lib/content-factory/performance-loop");
      return sendPerformanceReport(boards);
    });
    return sent;
  }
);
