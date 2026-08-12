import { inngest } from "@/inngest/client";

/**
 * Daily engagement metrics refresh (2026-08-12) — fully automates the
 * topic feedback loop. For every POSTED carousel where Keenan pasted an
 * Instagram link, this pulls views/likes/comments/saves/shares from the
 * Meta Graph API and writes them to the post. Runs daily so numbers keep
 * updating while a post is still climbing.
 *
 * TikTok slot: when the TikTok developer app is approved, add a
 * tiktok-metrics lib and a second fetch here; metrics from both
 * platforms should then be summed per post.
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
      { cron: "0 13 * * *" }, // 8am Central, before the 16 UTC generation uses the data
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
      // Refresh POSTED carousels from the last 90 days — after that the
      // numbers have flattened and the feedback loop already has them.
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);
      const rows = await prisma.carouselPost.findMany({
        where: {
          status: "POSTED",
          instagramUrl: { not: null },
          generatedFor: { gte: ninetyDaysAgo },
        },
        select: { id: true, headline: true, instagramUrl: true },
      });
      return { configured: true, posts: rows };
    });

    if (!configured) {
      logger.warn(
        "[metrics-refresh] IG_ACCESS_TOKEN / IG_USER_ID not set — skipping"
      );
      return { refreshed: 0, reason: "instagram not configured" };
    }
    if (posts.length === 0) {
      return { refreshed: 0, reason: "no posted carousels with instagram links" };
    }

    const result = await step.run("fetch-and-save", async () => {
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
    return { refreshed: result.refreshed, total: posts.length, unmatched: result.unmatched };
  }
);
