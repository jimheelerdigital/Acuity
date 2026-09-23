import { inngest } from "@/inngest/client";

/**
 * Weekly Reddit audience-pulse digest (2026-09-17, per Keenan; cut
 * from daily to weekly 2026-09-21, per Keenan: "only pull once a week
 * for audience pulse").
 *
 * Runs Saturday 11:59pm CDT (Sun 04:59 UTC — moved from Mon 04:00 UTC
 * on 2026-09-23, per Keenan: fresh pulse + script report waiting for his
 * Sunday admin session, and it feeds the Sunday ad-creative generation).
 * Note: finishes ~05:05 UTC, so Sunday's 5 UTC carousel dispatch uses the
 * prior digest; the 6-8 UTC dispatches get the fresh one. Scrapes both
 * brands' subreddit lists via RSS, distills themes with Claude, stores
 * one RedditTrendDigest row per brand. Every failure is soft: a missing
 * digest just means lanes generate without the pulse block that night.
 *
 * Manual trigger: "content-factory/reddit.digest".
 */
export const redditTrendsDailyFn = inngest.createFunction(
  {
    id: "reddit-trends-daily",
    name: "Content Factory — Weekly Reddit Audience Pulse",
    retries: 1,
    triggers: [
      { cron: "59 4 * * 0" },
      { event: "content-factory/reddit.digest" },
    ],
  },
  async ({ step, logger }) => {
    const ripple = await step.run("digest-ripple", async () => {
      const { buildDailyDigest } = await import(
        "@/lib/content-factory/reddit-trends"
      );
      return buildDailyDigest("ripple");
    });

    const bwk = await step.run("digest-bwk", async () => {
      const { buildDailyDigest } = await import(
        "@/lib/content-factory/reddit-trends"
      );
      return buildDailyDigest("bwk");
    });

    // Weekly talking-head script report (2026-09-21, per Keenan):
    // 3 pulse-driven scripts per brand, emailed right after the fresh
    // digest lands. Soft — a failure never breaks the digest run.
    const scripts = await step.run("email-video-scripts", async () => {
      try {
        const { sendVideoScriptReport } = await import(
          "@/lib/content-factory/video-scripts"
        );
        return await sendVideoScriptReport();
      } catch (err) {
        logger.warn(
          `[reddit-trends] script report failed: ${err instanceof Error ? err.message : err}`
        );
        return 0;
      }
    });

    logger.info(
      `[reddit-trends] ripple=${ripple} themes, bwk=${bwk} themes, scripts emailed=${scripts}`
    );
    return { ripple, bwk, scripts };
  }
);
