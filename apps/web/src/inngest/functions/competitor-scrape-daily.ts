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
 * 2026-10-01 (Keenan: "just do them all"): runs weekly (Sundays since
 * 10-02; was Mon + Thu for one day); every tracked
 * account and every search phrase gets its own step (25+ Apify runs no
 * longer fit one 300s step); keyword discovery finds new creators; every
 * standout is briefed from its real slides/frames, one step per post;
 * creators auto-promote / accounts auto-pause at the end.
 *
 * Manual trigger: "content-factory/competitor.scrape".
 */
export const competitorScrapeDailyFn = inngest.createFunction(
  {
    id: "competitor-scrape-daily",
    name: "Content Factory — Competitor Research (weekly, Sundays)",
    retries: 1,
    triggers: [
      // Sundays 3:30 UTC = Saturday 10:30pm Central (2026-10-02, per Keenan:
      // "cut back to one full scrape weekly on sundays" — Apify $19 plan).
      // Runs before the Sunday 10:00 UTC ad batch so its briefs are fresh.
      { cron: "30 3 * * 0" },
      { event: "content-factory/competitor.scrape" },
    ],
  },
  async ({ step, logger }) => {
    const startedAt = await step.run("started-at", async () => new Date().toISOString());
    const accountIds = await step.run("list-accounts", async () => {
      const { listActiveAccountIds } = await import("@/lib/content-factory/competitor-mimic");
      return process.env.APIFY_TOKEN ? listActiveAccountIds() : ([] as string[]);
    });
    let scraped = 0;
    for (const id of accountIds) {
      if (!id) continue;
      const n = await step.run(`scrape-account-${id}`, async () => {
        const { scrapeAccount } = await import("@/lib/content-factory/competitor-mimic");
        return scrapeAccount(id);
      });
      if (n > 0) scraped++;
    }

    // Keyword search: finds creators we don't track yet. The phrase list
    // evolves (research-learning.ts): dead phrases retire, Opus adds new ones.
    const keywords = await step.run("load-keywords", async () => {
      const { activeKeywords } = await import("@/lib/content-factory/research-learning");
      return activeKeywords();
    });
    let discovered = 0;
    const keywordRows: { brand: "ripple" | "bwk"; keyword: string; results: number; standouts: number }[] = [];
    for (const brand of ["ripple", "bwk"] as const) {
      for (const [i, keyword] of keywords[brand].entries()) {
        const r = await step.run(`discover-${brand}-${i}`, async () => {
          const { discoverKeyword } = await import("@/lib/content-factory/competitor-discovery");
          return discoverKeyword(brand, keyword);
        });
        discovered += r.standouts;
        keywordRows.push({ brand, keyword, results: r.results, standouts: r.standouts });
      }
    }
    await step.run("record-keyword-run", async () => {
      const { recordKeywordRun } = await import("@/lib/content-factory/research-learning");
      await recordKeywordRun(keywordRows);
    });

    // Hashtag top-video feed for the admin "Top Videos" tab (Keenan
    // recreates these by hand — separate from the mimic-brief pipeline).
    const hashtags = await step.run("scrape-hashtags", async () => {
      const { scrapeAllHashtags } = await import("@/lib/content-factory/hashtag-trends");
      return scrapeAllHashtags();
    });
    const emailedTags = await step.run("send-top-videos-email", async () => {
      const { sendTopVideosEmail } = await import("@/lib/content-factory/hashtag-trends");
      return sendTopVideosEmail();
    });

    // Brief every standout that passes triage, one post per step.
    const candidates = await step.run("select-brief-candidates", async () => {
      const { selectBriefCandidates } = await import("@/lib/content-factory/competitor-mimic");
      return selectBriefCandidates();
    });
    let briefs = 0;
    for (const id of candidates) {
      const ok = await step.run(`brief-${id}`, async () => {
        const { writeBriefFor } = await import("@/lib/content-factory/competitor-mimic");
        return writeBriefFor(id);
      });
      if (ok) briefs++;
    }

    // Learn: credit our 48h results to the sources behind them, then
    // promote/pause accounts and evolve the search phrases.
    const learning = await step.run("refresh-research-learning", async () => {
      const { refreshResearchLearning } = await import("@/lib/content-factory/research-learning");
      const res = await refreshResearchLearning().catch((e) => {
        console.warn("[competitor-mimic] research learning failed:", e instanceof Error ? e.message : e);
        return null;
      });
      if (res) {
        const { markLearningRun } = await import("@/lib/content-factory/learning-health");
        await markLearningRun("research-learning");
      }
      return res;
    });
    const roster = await step.run("promote-and-pause", async () => {
      const { promoteAndPause } = await import("@/lib/content-factory/competitor-discovery");
      return promoteAndPause();
    });
    const keywordChanges = await step.run("evolve-keywords", async () => {
      const { evolveKeywords } = await import("@/lib/content-factory/research-learning");
      return evolveKeywords().catch((e) => {
        console.warn("[competitor-mimic] keyword evolution failed:", e instanceof Error ? e.message : e);
        return { retired: [] as string[], added: [] as string[] };
      });
    });
    await step.run("send-research-report", async () => {
      const { sendResearchReport } = await import("@/lib/content-factory/research-report");
      await sendResearchReport({
        startedAt,
        accountsScraped: scraped,
        accountsTotal: accountIds.length,
        keywordRows,
        briefs,
        promoted: roster.promoted,
        paused: roster.paused,
        keywordChanges,
        learning,
      }).catch((e) => console.warn("[competitor-mimic] research report failed:", e instanceof Error ? e.message : e));
    });

    logger.info(
      `[competitor-mimic] ${scraped}/${accountIds.length} accounts, ${discovered} keyword standouts, ${hashtags} hashtags, ${briefs}/${candidates.length} briefs, promoted ${roster.promoted.length}, paused ${roster.paused.length}, top-videos email ${emailedTags} tags`
    );
    return { scraped, discovered, hashtags, emailedTags, briefs, promoted: roster.promoted, paused: roster.paused };
  }
);
