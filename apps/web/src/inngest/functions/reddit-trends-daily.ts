import { inngest } from "@/inngest/client";

/**
 * Weekly Reddit audience-pulse digest (2026-09-17, per Keenan; cut
 * from daily to weekly 2026-09-21, per Keenan: "only pull once a week
 * for audience pulse").
 *
 * Runs Mondays at 4 UTC — an hour BEFORE the first carousel dispatch
 * hour (5), so lanes generated that night see a fresh pulse. Scrapes both
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
      { cron: "0 4 * * 1" },
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
