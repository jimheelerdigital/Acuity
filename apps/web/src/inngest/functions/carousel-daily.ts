import { inngest } from "@/inngest/client";

/**
 * Daily carousel generation cron — runs at 11:00 UTC.
 *
 * Picks 5 topics not used in the last 30 days, generates each as DRAFT.
 * Idempotent per (topicSlug, generatedFor date) so retries never duplicate.
 */
export const carouselDailyCronFn = inngest.createFunction(
  {
    id: "carousel-daily-cron",
    name: "Content Factory — Daily Carousel Generation",
    triggers: [{ cron: "0 11 * * *" }], // 11:00 UTC daily
    retries: 1,
  },
  async ({ logger }) => {
    const { prisma } = await import("@/lib/prisma");
    const { generateCarousel } = await import(
      "@/lib/content-factory/carousel-generate"
    );
    const { CAROUSEL_TOPICS } = await import(
      "@/lib/content-factory/topics"
    );

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 86_400_000);

    // Find topics used in the last 30 days
    const recentPosts = await prisma.carouselPost.findMany({
      where: { generatedFor: { gte: thirtyDaysAgo } },
      select: { topicSlug: true },
    });
    const recentSlugs = new Set(recentPosts.map((p) => p.topicSlug));

    // Filter available topics
    const available = CAROUSEL_TOPICS.filter(
      (t) => !recentSlugs.has(t.slug)
    );

    if (available.length === 0) {
      logger.warn(
        "[carousel-cron] All 30 topics used in last 30 days — skipping"
      );
      return { generated: 0 };
    }

    // Pick up to 5 topics (deterministic order from the seed bank)
    const picks = available.slice(0, 5);

    let totalCostCents = 0;
    const results: { slug: string; postId: string; slides: number }[] = [];

    for (const topic of picks) {
      try {
        const result = await generateCarousel(topic.slug, today);
        totalCostCents += result.estimatedCostCents;
        results.push({
          slug: topic.slug,
          postId: result.postId,
          slides: result.slideCount,
        });
        logger.info(
          `[carousel-cron] Generated ${topic.slug}: ${result.slideCount} slides`
        );
      } catch (err) {
        logger.error(
          `[carousel-cron] Failed to generate ${topic.slug}: ${err instanceof Error ? err.message : err}`
        );
        // Continue with remaining topics
      }
    }

    console.log(
      `[carousel-cron] Daily run complete: ${results.length}/${picks.length} carousels generated, ` +
        `~$${(totalCostCents / 100).toFixed(2)} estimated cost`
    );

    return {
      generated: results.length,
      estimatedCostCents: totalCostCents,
      results,
    };
  }
);
