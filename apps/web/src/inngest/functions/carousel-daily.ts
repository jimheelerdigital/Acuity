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

    // Pick 5 topics: alternate daily between 3 hooks + 2 listicles
    // and 2 hooks + 3 listicles. Within each style, shuffle and
    // prefer lane diversity.
    const dayOfYear = Math.floor(
      (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86_400_000
    );
    const hookCount = dayOfYear % 2 === 0 ? 3 : 2;
    const listicleCount = 5 - hookCount;

    const hooks = [...available].filter((t) => t.style === "hook").sort(() => Math.random() - 0.5);
    const listicles = [...available].filter((t) => t.style === "listicle").sort(() => Math.random() - 0.5);

    const pickFromPool = (pool: typeof available, count: number) => {
      const picked: typeof available = [];
      const usedLanes = new Set<string>();
      // First pass: one per lane for variety
      for (const t of pool) {
        if (picked.length >= count) break;
        if (!usedLanes.has(t.lane)) { picked.push(t); usedLanes.add(t.lane); }
      }
      // Fill if needed
      for (const t of pool) {
        if (picked.length >= count) break;
        if (!picked.includes(t)) picked.push(t);
      }
      return picked;
    };

    const picks = [
      ...pickFromPool(hooks, hookCount),
      ...pickFromPool(listicles, listicleCount),
    ].sort(() => Math.random() - 0.5); // shuffle final order

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
