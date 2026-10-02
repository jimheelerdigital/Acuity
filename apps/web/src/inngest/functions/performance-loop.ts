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
    // Jev calibration (2026-10-02): reweight the pick-concept judge by how
    // well each of its scores predicted our 48h results.
    const calibration = await step.run("calibrate-jev", async () => {
      const { scorePosts } = await import("@/lib/content-factory/performance-loop");
      const { refreshPickCalibration } = await import("@/lib/content-factory/jev-calibration");
      return refreshPickCalibration(await scorePosts()).catch((e) => {
        console.warn("[performance-loop] jev calibration failed:", e instanceof Error ? e.message : e);
        return [];
      });
    });
    const sent = await step.run("email", async () => {
      const { sendPerformanceReport } = await import("@/lib/content-factory/performance-loop");
      const extra = calibration.length
        ? `<h2 style="font-size:16px;margin:18px 0 4px">How Jev judges pick posts now</h2><p style="margin:0;color:#555">Each Jev score's rank correlation with our 48-hour results (1 = perfect predictor, 0 = no link), and the weight it now gets when choosing concepts.</p>${calibration
            .flatMap((c) => (c ? [c] : []))
            .map((c) => `<p style="margin:6px 0"><b>${c.brand === "bwk" ? "Build With Key" : "Ripple"}</b> (${c.n} posts): ${Object.entries(c.rho).map(([k, v]) => `${k} ${v.toFixed(2)} → weight ${(c.weights as Record<string, number>)[k].toFixed(2)}`).join(" · ")}</p>`)
            .join("")}`
        : "";
      return sendPerformanceReport(boards, extra);
    });
    return sent;
  }
);
