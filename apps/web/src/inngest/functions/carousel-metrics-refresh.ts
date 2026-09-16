import { inngest } from "@/inngest/client";

/**
 * Daily engagement metrics refresh (2026-08-12) — fully automates the
 * topic feedback loop. For every carousel where Keenan pasted an
 * Instagram link, this pulls views/likes/comments/saves/shares from the
 * Meta Graph API and writes them to the post. Runs daily so numbers keep
 * updating while a post is still climbing. (2026-08-18: the POSTED
 * status gate is gone with the approval workflow — a pasted link IS the
 * "posted" signal now.)
 *
 * Facebook (2026-09-14): a second step pulls reactions/comments/shares
 * (+ impressions where the token allows) for every auto-published FB
 * post via its stored SocialPublish.externalId, writing them to the
 * SocialPublish row. IG metrics are mirrored onto their SocialPublish
 * rows too, so per-platform numbers live in one shape. CarouselPost's
 * columns stay IG-only — the learning loop (performance.ts) sums the FB
 * rows on top, so nothing clobbers hand-entered numbers.
 *
 * TikTok: NO metrics step (removed 2026-09-16, per Keenan: "get rid
 * of the tiktok metrics section"). The official Display API isn't
 * offered to our app, and the Apify-scrape fallback was scrapped along
 * with the inbox-draft flow when TikTok posting went fully manual.
 *
 * Manual trigger: "content-factory/metrics.refresh" (admin button).
 * Posts WITHOUT links are untouched — the manual admin form still owns
 * those, and the cron never clobbers hand-entered numbers for them.
 */
export const carouselMetricsRefreshFn = inngest.createFunction(
  {
    id: "carousel-metrics-refresh",
    name: "Content Factory — Engagement Metrics Refresh",
    retries: 1,
    triggers: [
      { cron: "0 3 * * *" }, // 10pm Central — before the overnight 4-10 UTC generation runs use the data (2026-08-18)
      { event: "content-factory/metrics.refresh" },
    ],
  },
  async ({ step, logger }) => {
    const { configured, posts } = await step.run("load-linked-posts", async () => {
      const { instagramConfigured } = await import(
        "@/lib/content-factory/instagram-metrics"
      );
      if (!instagramConfigured()) return { configured: false, posts: [] };

      const { prisma } = await import("@/lib/prisma");
      // Refresh linked carousels from the last 90 days — after that the
      // numbers have flattened and the feedback loop already has them.
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);
      const rows = await prisma.carouselPost.findMany({
        where: {
          instagramUrl: { not: null },
          generatedFor: { gte: ninetyDaysAgo },
        },
        select: { id: true, headline: true, instagramUrl: true },
      });
      return { configured: true, posts: rows };
    });

    // IG problems must not block the FB step below — skip, don't return.
    const skipIg = !configured || posts.length === 0;
    if (!configured) {
      logger.warn(
        "[metrics-refresh] IG_ACCESS_TOKEN / IG_USER_ID not set — skipping IG"
      );
    }

    const result = skipIg
      ? { refreshed: 0, unmatched: [] as string[] }
      : await step.run("fetch-and-save", async () => {
      const { fetchIgMediaIndex, fetchIgMediaMetrics, matchIgMedia } =
        await import("@/lib/content-factory/instagram-metrics");
      const { prisma } = await import("@/lib/prisma");

      const index = await fetchIgMediaIndex();
      let refreshed = 0;
      const unmatched: string[] = [];

      for (const post of posts) {
        const media = matchIgMedia(index, post.instagramUrl!);
        if (!media) {
          unmatched.push(post.headline);
          continue;
        }
        try {
          const metrics = await fetchIgMediaMetrics(media);
          await prisma.carouselPost.update({
            where: { id: post.id },
            data: { ...metrics, metricsAt: new Date() },
          });
          // Mirror onto the IG SocialPublish row (auto-published posts
          // only — updateMany is a no-op for hand-posted carousels).
          await prisma.socialPublish.updateMany({
            where: {
              carouselPostId: post.id,
              platform: "instagram",
              status: "POSTED",
            },
            data: { ...metrics, metricsAt: new Date() },
          });
          refreshed++;
        } catch (err) {
          console.error(
            `[metrics-refresh] Failed for "${post.headline}": ${err instanceof Error ? err.message : err}`
          );
        }
        // Stay well under Graph API rate limits
        await new Promise((r) => setTimeout(r, 300));
      }

      return { refreshed, unmatched };
    });

    if (result.unmatched.length > 0) {
      logger.warn(
        `[metrics-refresh] ${result.unmatched.length} link(s) not found in the IG media list (check the pasted URLs): ${result.unmatched.join(" | ")}`
      );
    }
    logger.info(
      `[metrics-refresh] Refreshed ${result.refreshed}/${posts.length} posts`
    );

    // ── Facebook: refresh every auto-published FB post by external ID ──
    const fb = await step.run("fetch-facebook", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { facebookMetricsConfigured, fetchFbPostMetrics } = await import(
        "@/lib/content-factory/facebook-metrics"
      );

      const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);
      const rows = await prisma.socialPublish.findMany({
        where: {
          platform: "facebook",
          status: "POSTED",
          externalId: { not: null },
          postedAt: { gte: ninetyDaysAgo },
        },
        select: { id: true, externalId: true, accountKey: true },
      });
      if (rows.length === 0) return { refreshed: 0, failed: 0 };

      let refreshed = 0;
      let failed = 0;
      for (const row of rows) {
        if (!facebookMetricsConfigured(row.accountKey)) continue;
        try {
          const metrics = await fetchFbPostMetrics(
            row.externalId!,
            row.accountKey
          );
          await prisma.socialPublish.update({
            where: { id: row.id },
            data: { ...metrics, metricsAt: new Date() },
          });
          refreshed++;
        } catch (err) {
          failed++;
          console.error(
            `[metrics-refresh] FB fetch failed for ${row.externalId}: ${err instanceof Error ? err.message : err}`
          );
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      return { refreshed, failed };
    });
    logger.info(
      `[metrics-refresh] Facebook: refreshed ${fb.refreshed}, failed ${fb.failed}`
    );

    return {
      refreshed: result.refreshed,
      total: posts.length,
      unmatched: result.unmatched,
      facebook: fb,
    };
  }
);
