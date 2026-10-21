import { inngest } from "@/inngest/client";
import { competitorScrapeDailyFn } from "@/inngest/functions/competitor-scrape-daily";
import { nicheDiscoveryFn } from "@/inngest/functions/niche-discovery";
import { redditTrendsDailyFn } from "@/inngest/functions/reddit-trends-daily";

/**
 * ONE weekly social sweep (2026-10-20, per Keenan: "ONE single weekly sweep
 * of social that dictates our social media push and is sent to me in a
 * brief"). Saturday 8pm Central (Sun 01:00 UTC), in order, each collector
 * waited on before the next:
 *
 *   1. competitor organic scrape + keyword discovery + mimic briefs
 *      (competitor-scrape-daily; its own Sunday cron was removed)
 *   2. Reddit audience pulse (reddit-trends-daily; blocked by Reddit since
 *      10-03, so it usually adds nothing; the brief says so)
 *   3. niche hashtag + creator discovery (niche-discovery; was monthly)
 *   4. refresh the performance scoreboards (our own results)
 *   5. one Social Brief per brand: Ripple, Legendary Mythicals, Build With Key
 *
 * Competitor Meta-ad research keeps its Saturday 18:00 UTC slot because the
 * weekly ad batch reads it at 21:00; the brief reads its latest result.
 * The weekly how/what brief that tonight's post writers read is still rebuilt
 * Sunday 04:40 UTC (weekly-brief.ts), after this sweep's data is in.
 *
 * Every collector is soft: a failure or timeout is noted and the sweep
 * moves on. Manual: event "content-factory/social.sweep" { email?: boolean,
 * skipCollectors?: boolean } (skipCollectors rebuilds the briefs from data
 * already collected, without paying for another scrape).
 */
export const socialWeeklySweepFn = inngest.createFunction(
  {
    id: "social-weekly-sweep",
    name: "Social — weekly sweep + Social Brief",
    retries: 1,
    concurrency: { limit: 1 },
    triggers: [{ cron: "0 1 * * 0" }, { event: "content-factory/social.sweep" }],
  },
  async ({ event, step, logger }) => {
    const notes: string[] = [];
    const soft = async (label: string, run: () => Promise<unknown>) => {
      try {
        await run();
        notes.push(`${label}: ok`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        notes.push(`${label}: ${msg.slice(0, 160)}`);
        logger.warn(`[social-sweep] ${label} failed: ${msg}`);
      }
    };

    const opts = (event?.data ?? {}) as { email?: boolean; skipCollectors?: boolean };
    if (!opts.skipCollectors) {
      await soft("competitor scrape", () =>
        step.invoke("competitor-scrape", { function: competitorScrapeDailyFn, data: {}, timeout: "5h" })
      );
      await soft("reddit pulse", () =>
        step.invoke("reddit-pulse", { function: redditTrendsDailyFn, data: {}, timeout: "30m" })
      );
      await soft("niche discovery", () =>
        step.invoke("niche-discovery", { function: nicheDiscoveryFn, data: {}, timeout: "1h" })
      );
    }
    await soft("scoreboards", () =>
      step.run("refresh-scoreboards", async () => {
        const { refreshScoreboards } = await import("@/lib/content-factory/performance-loop");
        await refreshScoreboards();
        return true;
      })
    );

    const { SOCIAL_BRANDS } = await import("@/lib/content-factory/social-brief");
    for (const brand of SOCIAL_BRANDS) {
      await soft(`brief ${brand}`, () =>
        step.run(`social-brief-${brand}`, async () => {
          const { buildSocialBrief } = await import("@/lib/content-factory/social-brief");
          const b = await buildSocialBrief(brand);
          return { brand: b.brand, headline: b.headline };
        })
      );
    }

    // Manual runs can email right away; the scheduled run waits for Sunday 9am.
    if (opts.email === true) {
      await step.run("email-now", async () => {
        const { sendSocialBriefEmail } = await import("@/lib/content-factory/social-brief-send");
        return sendSocialBriefEmail();
      });
    }
    return { notes };
  }
);

/** Sunday 9am Central (14:00 UTC): email the latest Social Briefs. */
export const socialBriefEmailFn = inngest.createFunction(
  {
    id: "social-brief-email",
    name: "Social — Sunday Social Brief email",
    retries: 2,
    triggers: [{ cron: "0 14 * * 0" }, { event: "content-factory/social.brief.email" }],
  },
  async ({ step }) => {
    return step.run("send", async () => {
      const { sendSocialBriefEmail } = await import("@/lib/content-factory/social-brief-send");
      return sendSocialBriefEmail();
    });
  }
);
