import { inngest } from "@/inngest/client";

/**
 * Carousel generation — runs 5× daily via cron AND on-demand via event.
 *
 * Uses Inngest steps so each gpt-image-2 call gets its own 300s Lambda
 * invocation. Without steps the full 7-image pipeline exceeds Vercel's
 * 300s max duration and times out.
 */
export const carouselDailyCronFn = inngest.createFunction(
  {
    id: "carousel-daily-cron",
    name: "Content Factory — Daily Carousel Generation",
    triggers: [{ cron: "0 10,11,12,13,14 * * *" }],
    retries: 1,
  },
  async ({ step, logger }) => {
    // ── Step 1: Pick topic ─────────────────────────────────────────
    const topicData = await step.run("pick-topic", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { CAROUSEL_TOPICS } = await import(
        "@/lib/content-factory/topics"
      );

      const now = new Date();
      const hour = now.getUTCHours();
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 86_400_000);

      const recentPosts = await prisma.carouselPost.findMany({
        where: { generatedFor: { gte: thirtyDaysAgo } },
        select: { topicSlug: true },
      });
      const recentSlugs = new Set(recentPosts.map((p) => p.topicSlug));
      const available = CAROUSEL_TOPICS.filter(
        (t) => !recentSlugs.has(t.slug)
      );

      if (available.length === 0) return null;

      // Style selection: even-hours → hook on even days, listicle on odd
      const dayOfYear = Math.floor(
        (today.getTime() -
          new Date(today.getFullYear(), 0, 0).getTime()) /
          86_400_000
      );
      const isEvenDay = dayOfYear % 2 === 0;
      const isEvenHour = hour % 2 === 0;
      const preferredStyle =
        isEvenDay === isEvenHour ? "hook" : "listicle";

      const todayPosts = await prisma.carouselPost.findMany({
        where: { generatedFor: today },
        select: { topicSlug: true },
      });
      const todaySlugs = new Set(todayPosts.map((p) => p.topicSlug));
      const todayTopics = CAROUSEL_TOPICS.filter((t) =>
        todaySlugs.has(t.slug)
      );
      const usedLanesToday = new Set(todayTopics.map((t) => t.lane));

      const preferred = available
        .filter((t) => t.style === preferredStyle)
        .sort(() => Math.random() - 0.5);
      const fallback = available
        .filter((t) => t.style !== preferredStyle)
        .sort(() => Math.random() - 0.5);

      const pickOne = (pool: typeof available) => {
        return (
          pool.find((t) => !usedLanesToday.has(t.lane)) ?? pool[0] ?? null
        );
      };

      const topic = pickOne(preferred) ?? pickOne(fallback);
      if (!topic) return null;

      return {
        slug: topic.slug,
        headline: topic.headline,
        reasons: topic.reasons,
        lane: topic.lane,
        style: topic.style,
      };
    });

    if (!topicData) {
      logger.warn("[carousel-cron] No available topics — skipping");
      return { generated: 0 };
    }

    // ── Shared date/path info ──────────────────────────────────────
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dateStr = today.toISOString().slice(0, 10);
    const { slug } = topicData;

    // ── Step 2: Idempotency check ──────────────────────────────────
    const existing = await step.run("idempotency-check", async () => {
      const { prisma } = await import("@/lib/prisma");
      const post = await prisma.carouselPost.findUnique({
        where: {
          topicSlug_generatedFor: {
            topicSlug: slug,
            generatedFor: today,
          },
        },
      });
      return post ? { id: post.id } : null;
    });

    if (existing) {
      logger.info(`[carousel-cron] ${slug} already generated for ${dateStr}`);
      return { generated: 0, existing: existing.id };
    }

    await step.run("ensure-bucket", async () => {
      const { ensureBucket } = await import(
        "@/lib/content-factory/carousel-generate"
      );
      await ensureBucket();
    });

    // ── Step 3: Generate cover slide ───────────────────────────────
    const coverSlide = await step.run("generate-cover", async () => {
      const { STYLE_LANES } = await import("@/lib/content-factory/brand");
      const {
        buildImagePrompt,
        generateImage,
        uploadImage,
      } = await import("@/lib/content-factory/carousel-generate");
      const { composeSlide } = await import(
        "@/lib/content-factory/compose"
      );

      const lanePrefix = STYLE_LANES[topicData.lane as keyof typeof STYLE_LANES];
      const topic = { headline: topicData.headline, slug, lane: topicData.lane as any, reasons: topicData.reasons };
      const prompt = buildImagePrompt(lanePrefix, topicData.headline, topic);
      const rawBuffer = await generateImage(prompt);
      const composed = await composeSlide(rawBuffer, topicData.headline, "COVER");
      const imageUrl = await uploadImage(
        composed,
        `carousels/${dateStr}/${slug}/slide-0-cover.jpg`
      );
      return { imageUrl, overlayText: topicData.headline, imagePrompt: prompt };
    });

    // ── Steps 4..N: Generate reason slides ─────────────────────────
    const reasonSlides: { imageUrl: string; overlayText: string; imagePrompt: string }[] = [];
    for (let i = 0; i < topicData.reasons.length; i++) {
      const slide = await step.run(`generate-reason-${i}`, async () => {
        const { STYLE_LANES } = await import("@/lib/content-factory/brand");
        const {
          buildImagePrompt,
          generateImage,
          uploadImage,
        } = await import("@/lib/content-factory/carousel-generate");
        const { composeSlide } = await import(
          "@/lib/content-factory/compose"
        );

        const reason = topicData.reasons[i];
        const lanePrefix = STYLE_LANES[topicData.lane as keyof typeof STYLE_LANES];
        const topic = { headline: topicData.headline, slug, lane: topicData.lane as any, reasons: topicData.reasons };
        const prompt = buildImagePrompt(lanePrefix, reason, topic);
        const rawBuffer = await generateImage(prompt);
        const composed = await composeSlide(rawBuffer, reason, "REASON");
        const imageUrl = await uploadImage(
          composed,
          `carousels/${dateStr}/${slug}/slide-${i + 1}-reason.jpg`
        );
        return { imageUrl, overlayText: reason, imagePrompt: prompt };
      });
      reasonSlides.push(slide);
    }

    // ── Step N+1: CTA slide ────────────────────────────────────────
    const ctaText = "Talk it out. See it clearly.";
    const ctaSlide = await step.run("generate-cta", async () => {
      const { composeCTASlide } = await import(
        "@/lib/content-factory/compose"
      );
      const { uploadImage } = await import(
        "@/lib/content-factory/carousel-generate"
      );

      const composed = await composeCTASlide(ctaText);
      const imageUrl = await uploadImage(
        composed,
        `carousels/${dateStr}/${slug}/slide-${topicData.reasons.length + 1}-cta.jpg`
      );
      return { imageUrl };
    });

    // ── Step N+2: Save to DB + email ───────────────────────────────
    const result = await step.run("save-and-email", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { buildCaption } = await import(
        "@/lib/content-factory/caption"
      );
      const { extractHashtags } = await import(
        "@/lib/content-factory/carousel-generate"
      );

      const allSlides = [
        {
          order: 0,
          kind: "COVER" as const,
          overlayText: coverSlide.overlayText,
          imagePrompt: coverSlide.imagePrompt,
          imageUrl: coverSlide.imageUrl,
        },
        ...reasonSlides.map((s, i) => ({
          order: i + 1,
          kind: "REASON" as const,
          overlayText: s.overlayText,
          imagePrompt: s.imagePrompt,
          imageUrl: s.imageUrl,
        })),
        {
          order: reasonSlides.length + 1,
          kind: "CTA" as const,
          overlayText: ctaText,
          imagePrompt: "CTA slide — solid brand background",
          imageUrl: ctaSlide.imageUrl,
        },
      ];

      const topic = {
        slug,
        headline: topicData.headline,
        style: topicData.style as any,
        lane: topicData.lane as any,
        reasons: topicData.reasons,
      };
      const caption = buildCaption(topic);

      const post = await prisma.carouselPost.create({
        data: {
          topicSlug: slug,
          headline: topicData.headline,
          status: "DRAFT",
          caption,
          hashtags: extractHashtags(caption),
          generatedFor: today,
          slides: {
            create: allSlides.map((s) => ({
              order: s.order,
              kind: s.kind,
              overlayText: s.overlayText,
              imagePrompt: s.imagePrompt,
              imageUrl: s.imageUrl,
            })),
          },
        },
      });

      // Send email
      try {
        const { sendCarouselEmail } = await import(
          "@/lib/content-factory/email"
        );
        await sendCarouselEmail(post.id);
      } catch (emailErr) {
        console.error(
          `[carousel-cron] Email failed: ${emailErr instanceof Error ? emailErr.message : emailErr}`
        );
      }

      return {
        postId: post.id,
        slideCount: allSlides.length,
        estimatedCostCents: (allSlides.length - 1) * 8,
      };
    });

    logger.info(
      `[carousel-cron] Generated ${slug}: ${result.slideCount} slides`
    );

    return {
      generated: 1,
      ...result,
    };
  }
);
