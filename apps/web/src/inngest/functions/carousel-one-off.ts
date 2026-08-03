import { inngest } from "@/inngest/client";

/**
 * One-off carousel generation triggered from the admin UI.
 *
 * Picks an unused topic (or uses the provided slug), generates the
 * carousel, and emails the result. Runs inside Inngest so it won't
 * hit Vercel's HTTP response timeout.
 */
export const carouselGenerateOneOffFn = inngest.createFunction(
  {
    id: "carousel-generate-one-off",
    name: "Content Factory — One-off Carousel Generation",
    triggers: [{ event: "carousel/generate.one-off" }],
    retries: 1,
    concurrency: { limit: 1 },
  },
  async ({ event, logger }) => {
    const { prisma } = await import("@/lib/prisma");
    const { generateCarousel } = await import(
      "@/lib/content-factory/carousel-generate"
    );
    const { CAROUSEL_TOPICS } = await import(
      "@/lib/content-factory/topics"
    );

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    let topicSlug = event.data?.topicSlug as string | undefined;

    if (!topicSlug) {
      // Pick a random unused topic (same logic as the daily cron)
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 86_400_000);
      const recentPosts = await prisma.carouselPost.findMany({
        where: { generatedFor: { gte: thirtyDaysAgo } },
        select: { topicSlug: true },
      });
      const recentSlugs = new Set(recentPosts.map((p) => p.topicSlug));
      const available = CAROUSEL_TOPICS.filter(
        (t) => !recentSlugs.has(t.slug)
      );

      if (available.length === 0) {
        logger.warn("[carousel-one-off] All topics used in last 30 days");
        return { generated: 0, error: "No available topics" };
      }

      const pick = available[Math.floor(Math.random() * available.length)];
      topicSlug = pick.slug;
    }

    logger.info(`[carousel-one-off] Generating ${topicSlug}`);

    const result = await generateCarousel(topicSlug, today);

    logger.info(
      `[carousel-one-off] Generated ${topicSlug}: ${result.slideCount} slides`
    );

    // Send email
    if (result.slideCount > 0) {
      try {
        const { sendCarouselEmail } = await import(
          "@/lib/content-factory/email"
        );
        await sendCarouselEmail(result.postId);
        logger.info(`[carousel-one-off] Emailed ${topicSlug}`);
      } catch (emailErr) {
        logger.error(
          `[carousel-one-off] Email failed for ${topicSlug}: ${emailErr instanceof Error ? emailErr.message : emailErr}`
        );
      }
    }

    return {
      generated: 1,
      topicSlug,
      postId: result.postId,
      slideCount: result.slideCount,
      estimatedCostCents: result.estimatedCostCents,
    };
  }
);
