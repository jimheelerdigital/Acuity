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
        "[carousel-cron] All topics used in last 30 days — skipping"
      );
      return { generated: 0 };
    }

    // Pick one topic per style lane so each day's batch has visual variety.
    // 7 lanes = up to 7 carousels per day.
    const lanes = [
      "cinematicReal", "toon3d", "claymation", "stillLife",
      "flatGraphic", "paperDiorama", "risograph",
    ] as const;
    const picks: typeof available = [];
    for (const lane of lanes) {
      const match = available.find((t) => t.lane === lane && !picks.includes(t));
      if (match) picks.push(match);
    }

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

        // Email delivery — separate try/catch so email failure never
        // rolls back a successful generation. Retry once, then log.
        if (result.slideCount > 0) {
          try {
            const { sendCarouselEmail } = await import(
              "@/lib/content-factory/email"
            );
            await sendCarouselEmail(result.postId);
            logger.info(`[carousel-cron] Emailed ${topic.slug}`);
          } catch (emailErr) {
            logger.error(
              `[carousel-cron] Email failed for ${topic.slug}, retrying once: ${emailErr instanceof Error ? emailErr.message : emailErr}`
            );
            // One retry
            try {
              const { sendCarouselEmail } = await import(
                "@/lib/content-factory/email"
              );
              await sendCarouselEmail(result.postId);
              logger.info(`[carousel-cron] Email retry succeeded for ${topic.slug}`);
            } catch (retryErr) {
              logger.error(
                `[carousel-cron] Email retry also failed for ${topic.slug}: ${retryErr instanceof Error ? retryErr.message : retryErr}`
              );
            }
          }
        }
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
