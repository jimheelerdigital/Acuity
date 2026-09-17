import { inngest } from "@/inngest/client";

/**
 * Daily Reddit audience-pulse digest (2026-09-17, per Keenan: fully
 * automated Reddit trend scraping — "daily with 7 day rolling blend").
 *
 * Runs at 4 UTC — an hour BEFORE the first carousel dispatch hour (5),
 * so every lane generated that night sees a fresh pulse. Scrapes both
 * brands' subreddit lists via RSS, distills themes with Claude, stores
 * one RedditTrendDigest row per brand. Every failure is soft: a missing
 * digest just means lanes generate without the pulse block that night.
 *
 * Manual trigger: "content-factory/reddit.digest".
 */
export const redditTrendsDailyFn = inngest.createFunction(
  {
    id: "reddit-trends-daily",
    name: "Content Factory — Daily Reddit Audience Pulse",
    retries: 1,
    triggers: [
      { cron: "0 4 * * *" },
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

    logger.info(`[reddit-trends] ripple=${ripple} themes, bwk=${bwk} themes`);
    return { ripple, bwk };
  }
);
