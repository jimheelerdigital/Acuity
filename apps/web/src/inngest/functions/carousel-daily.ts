import { inngest } from "@/inngest/client";

/**
 * Daily carousel generation cron — runs 5× daily at 10, 11, 12, 13, 14 UTC.
 *
 * Each run generates 1 carousel from a topic not used in the last 30 days.
 * Style alternates by hour and day to maintain a ~3 hooks + 2 listicles mix
 * (even days) or ~2 hooks + 3 listicles (odd days).
 * Idempotent per (topicSlug, generatedFor date) so retries never duplicate.
 */
export const carouselDailyCronFn = inngest.createFunction(
  {
    id: "carousel-daily-cron",
    name: "Content Factory — Daily Carousel Generation",
    triggers: [{ cron: "0 10,11,12,13,14 * * *" }], // 5× daily
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

    const now = new Date();
    const hour = now.getUTCHours();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 86_400_000);

    // Find topics used in the last 30 days (includes earlier runs today)
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

    // Determine preferred style for this run.
    // Even-hour runs (10, 12, 14) = 3 slots, odd-hour runs (11, 13) = 2 slots.
    // Even days: even-hours → hook, odd-hours → listicle  (3 hooks + 2 listicles)
    // Odd days:  even-hours → listicle, odd-hours → hook   (2 hooks + 3 listicles)
    const dayOfYear = Math.floor(
      (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86_400_000
    );
    const isEvenDay = dayOfYear % 2 === 0;
    const isEvenHour = hour % 2 === 0;
    const preferredStyle = (isEvenDay === isEvenHour) ? "hook" : "listicle";

    // Pick 1 topic: prefer the target style, prefer lane diversity
    // against topics already generated today
    const todayPosts = await prisma.carouselPost.findMany({
      where: { generatedFor: today },
      select: { topicSlug: true },
    });
    const todaySlugs = new Set(todayPosts.map((p) => p.topicSlug));
    const todayTopics = CAROUSEL_TOPICS.filter((t) => todaySlugs.has(t.slug));
    const usedLanesToday = new Set(todayTopics.map((t) => t.lane));

    const preferred = available
      .filter((t) => t.style === preferredStyle)
      .sort(() => Math.random() - 0.5);
    const fallback = available
      .filter((t) => t.style !== preferredStyle)
      .sort(() => Math.random() - 0.5);

    // Within each pool, prioritize unused lanes for variety
    const pickOne = (pool: typeof available) => {
      const freshLane = pool.find((t) => !usedLanesToday.has(t.lane));
      return freshLane ?? pool[0] ?? null;
    };

    const topic = pickOne(preferred) ?? pickOne(fallback);

    if (!topic) {
      logger.warn("[carousel-cron] No available topics — skipping");
      return { generated: 0 };
    }

    logger.info(
      `[carousel-cron] Run ${hour} UTC — generating ${topic.slug} (${topic.style})`
    );

    try {
      const result = await generateCarousel(topic.slug, today);

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

      console.log(
        `[carousel-cron] ${hour} UTC run complete: ${topic.slug}, ` +
          `~$${(result.estimatedCostCents / 100).toFixed(2)} estimated cost`
      );

      return {
        generated: 1,
        estimatedCostCents: result.estimatedCostCents,
        results: [
          {
            slug: topic.slug,
            postId: result.postId,
            slides: result.slideCount,
          },
        ],
      };
    } catch (err) {
      logger.error(
        `[carousel-cron] Failed to generate ${topic.slug}: ${err instanceof Error ? err.message : err}`
      );
      return { generated: 0, error: topic.slug };
    }
  }
);
