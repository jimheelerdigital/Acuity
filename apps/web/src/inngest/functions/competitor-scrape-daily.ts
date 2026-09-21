import { inngest } from "@/inngest/client";

/**
 * Daily competitor scrape + mimic briefs (2026-09-17, per Keenan:
 * fully automated competitor tracking feeding the content factory).
 *
 * Runs at 3:30 UTC — before the 4 UTC Reddit digest and the hour-5
 * lane dispatch, so tonight's lanes see fresh briefs. Scrapes every
 * ACTIVE CompetitorAccount via Apify, recomputes outliers, then writes
 * Claude mimic briefs for new outliers. Every failure is soft: no
 * APIFY_TOKEN or a scrape failure just means lanes generate without
 * the competitor signal.
 *
 * Manual trigger: "content-factory/competitor.scrape".
 */
export const competitorScrapeDailyFn = inngest.createFunction(
  {
    id: "competitor-scrape-daily",
    name: "Content Factory — Monthly Competitor Scrape + Mimic Briefs",
    retries: 1,
    triggers: [
      // Monthly (1st, 3:30 UTC) — was daily; cut 2026-09-21 to stay inside Apify plan limits
      { cron: "30 3 1 * *" },
      { event: "content-factory/competitor.scrape" },
    ],
  },
  async ({ step, logger }) => {
    const scraped = await step.run("scrape-accounts", async () => {
      const { scrapeAllAccounts } = await import(
        "@/lib/content-factory/competitor-mimic"
      );
      return scrapeAllAccounts();
    });

    // Hashtag top-video feed for the admin "Top Videos" tab (Keenan
    // recreates these by hand — separate from the mimic-brief pipeline).
    const hashtags = await step.run("scrape-hashtags", async () => {
      const { scrapeAllHashtags } = await import(
        "@/lib/content-factory/hashtag-trends"
      );
      return scrapeAllHashtags();
    });

    // Daily "top 3 per hashtag" email to Keenan — fresh links right
    // after the scrape, so morning inbox = today's recreate list.
    const emailedTags = await step.run("send-top-videos-email", async () => {
      const { sendTopVideosEmail } = await import(
        "@/lib/content-factory/hashtag-trends"
      );
      return sendTopVideosEmail();
    });

    const briefs = await step.run("write-briefs", async () => {
      const { writeMimicBriefs } = await import(
        "@/lib/content-factory/competitor-mimic"
      );
      return writeMimicBriefs();
    });

    logger.info(
      `[competitor-mimic] ${scraped} accounts + ${hashtags} hashtags scraped, ${briefs} briefs written, top-videos email covered ${emailedTags} tags`
    );
    return { scraped, hashtags, emailedTags, briefs };
  }
);
