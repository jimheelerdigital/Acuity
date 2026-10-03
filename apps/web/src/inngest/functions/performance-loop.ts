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
      const { markLearningRun } = await import("@/lib/content-factory/learning-health");
      await markLearningRun("scoreboard");
      return boards.map((b) => ({
        brand: b.brand,
        posts: b.posts,
        types: Object.fromEntries(Object.entries(b.postTypes).map(([k, v]) => [k, `${v.label} (${v.n}, ${v.mean})`])),
      }));
    });
    logger.info(`[performance-loop] scoreboards: ${JSON.stringify(summary)}`);
    // Publish-gate lane track records (2026-10-02): daily, so the gate
    // ranks on yesterday's results. Weights are re-fit weekly (report fn).
    const gate = await step.run("refresh-gate-track", async () => {
      const { refreshGateCalibration } = await import("@/lib/content-factory/gate-calibration");
      const cals = await refreshGateCalibration();
      const { markLearningRun } = await import("@/lib/content-factory/learning-health");
      await markLearningRun("gate-track");
      return cals.map((c) => ({ brand: c.brand, lanes: Object.keys(c.lanes).length }));
    });
    logger.info(`[performance-loop] gate track: ${JSON.stringify(gate)}`);
    return { summary, gate };
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
    // Publish-gate weights (2026-10-02): re-fit from how each Jev score
    // predicted the real results of the posts the gate kept.
    const gateCal = await step.run("calibrate-gate", async () => {
      const { refreshGateCalibration } = await import("@/lib/content-factory/gate-calibration");
      const cals = await refreshGateCalibration({ updateWeights: true }).catch((e) => {
        console.warn("[performance-loop] gate calibration failed:", e instanceof Error ? e.message : e);
        return null;
      });
      if (cals) {
        const { markLearningRun } = await import("@/lib/content-factory/learning-health");
        await markLearningRun("weekly-calibration");
      }
      return cals ?? [];
    });
    // "Is it getting better?" (2026-10-02): absolute per-post numbers vs
    // the period before; two declining weeks puts the brand in the subject.
    const trend = await step.run("trend", async () => {
      const { computeTrends, trendHtml, twoWeekDecliners, trendSubjectPrefix } = await import(
        "@/lib/content-factory/trend-report"
      );
      const trends = await computeTrends();
      return { html: trendHtml(trends), subjectPrefix: trendSubjectPrefix(await twoWeekDecliners(trends)) };
    });
    const sent = await step.run("email", async () => {
      const { sendPerformanceReport } = await import("@/lib/content-factory/performance-loop");
      const gateHtml = gateCal.length
        ? `<h2 style="font-size:16px;margin:18px 0 4px">How the publish gate ranks posts now</h2><p style="margin:0;color:#555">The gate holds the bottom third of each Ripple / BWK day. It ranks on each lane's real track record plus the weights below, re-fit weekly from the posts it kept (needs 12+ with results).</p>${gateCal
            .map((c) => {
              const lanes = Object.entries(c.lanes).sort((a, b) => b[1].track - a[1].track);
              const fmt = (l: [string, { track: number; n: number }]) => `${l[0]} ${l[1].track.toFixed(2)} (${l[1].n})`;
              return `<p style="margin:6px 0"><b>${c.brand === "bwk" ? "Build With Key" : "Ripple"}</b>: weights ${Object.entries(c.weights).map(([k, v]) => `${k} ${(v as number).toFixed(2)}`).join(" · ")}${c.n ? ` · from ${c.n} posts, correlation ${Object.entries(c.rho).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(", ")}` : " · not enough kept posts with results yet, defaults in use"}<br/><span style="color:#555">Strongest lanes: ${lanes.slice(0, 3).map(fmt).join(", ") || "none yet"} · weakest: ${lanes.slice(-3).reverse().map(fmt).join(", ") || "none yet"}</span></p>`;
            })
            .join("")}`
        : "";
      const extra = calibration.length
        ? `<h2 style="font-size:16px;margin:18px 0 4px">How Jev judges pick posts now</h2><p style="margin:0;color:#555">Each Jev score's rank correlation with our 48-hour results (1 = perfect predictor, 0 = no link), and the weight it now gets when choosing concepts.</p>${calibration
            .flatMap((c) => (c ? [c] : []))
            .map((c) => `<p style="margin:6px 0"><b>${c.brand === "bwk" ? "Build With Key" : "Ripple"}</b> (${c.n} posts): ${Object.entries(c.rho).map(([k, v]) => `${k} ${v.toFixed(2)} → weight ${(c.weights as Record<string, number>)[k].toFixed(2)}`).join(" · ")}</p>`)
            .join("")}`
        : "";
      return sendPerformanceReport(boards, extra + gateHtml, { topHtml: trend.html, subjectPrefix: trend.subjectPrefix });
    });
    return sent;
  }
);
