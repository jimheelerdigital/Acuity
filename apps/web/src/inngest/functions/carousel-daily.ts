import { inngest } from "@/inngest/client";

/**
 * Carousel generation — runs 5× daily via cron.
 *
 * Each run generates a fresh AI-written topic (via Claude) then
 * creates images with gpt-image-2. Uses Inngest steps so each
 * API call gets its own 300s Lambda invocation.
 */
export const carouselDailyCronFn = inngest.createFunction(
  {
    id: "carousel-daily-cron",
    name: "Content Factory — Daily Carousel Generation",
    triggers: [{ cron: "0 10,11,12,13,14 * * *" }],
    retries: 1,
  },
  async ({ step, logger }) => {
    // ── Step 1: Generate a fresh topic via Claude ──────────────────
    const topicData = await step.run("generate-topic", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { generateTopic } = await import(
        "@/lib/content-factory/generate-topic"
      );

      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 86_400_000
      );
      const recentPosts = await prisma.carouselPost.findMany({
        where: { generatedFor: { gte: thirtyDaysAgo } },
        select: { headline: true },
      });
      const recentHeadlines = recentPosts.map((p) => p.headline);

      const topic = await generateTopic(recentHeadlines);
      return topic;
    });

    if (!topicData) {
      logger.warn("[carousel-cron] Topic generation failed — skipping");
      return { generated: 0 };
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dateStr = today.toISOString().slice(0, 10);
    const { slug } = topicData;

    logger.info(
      `[carousel-cron] Generated topic: "${topicData.headline}" (${topicData.reasons.length} reasons)`
    );

    // Pick a color scheme for this carousel (all slides share it)
    const colorScheme = await step.run("pick-color-scheme", async () => {
      const { COLOR_SCHEMES } = await import("@/lib/content-factory/brand");
      const pick = COLOR_SCHEMES[Math.floor(Math.random() * COLOR_SCHEMES.length)];
      return pick;
    });

    await step.run("ensure-bucket", async () => {
      const { ensureBucket } = await import(
        "@/lib/content-factory/carousel-generate"
      );
      await ensureBucket();
    });

    // ── Step 2: Generate cover slide ──────────────────────────────
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

      const lanePrefix =
        STYLE_LANES[topicData.lane as keyof typeof STYLE_LANES];
      const topic = {
        headline: topicData.headline,
        slug,
        lane: topicData.lane as any,
        reasons: topicData.reasons,
      };
      const prompt = buildImagePrompt(lanePrefix, topicData.headline, topic, colorScheme.prompt);
      const rawBuffer = await generateImage(prompt);
      const composed = await composeSlide(
        rawBuffer,
        topicData.headline,
        "COVER"
      );
      const imageUrl = await uploadImage(
        composed,
        `carousels/${dateStr}/${slug}/slide-0-cover.jpg`
      );
      return {
        imageUrl,
        overlayText: topicData.headline,
        imagePrompt: prompt,
      };
    });

    // ── Steps 3..N: Generate reason slides ────────────────────────
    const reasonSlides: {
      imageUrl: string;
      overlayText: string;
      imagePrompt: string;
    }[] = [];
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
        const lanePrefix =
          STYLE_LANES[topicData.lane as keyof typeof STYLE_LANES];
        const topic = {
          headline: topicData.headline,
          slug,
          lane: topicData.lane as any,
          reasons: topicData.reasons,
        };
        const prompt = buildImagePrompt(lanePrefix, reason, topic, colorScheme.prompt);
        const rawBuffer = await generateImage(prompt);
        const composed = await composeSlide(rawBuffer, reason, "REASON", i + 1);
        const imageUrl = await uploadImage(
          composed,
          `carousels/${dateStr}/${slug}/slide-${i + 1}-reason.jpg`
        );
        return { imageUrl, overlayText: reason, imagePrompt: prompt };
      });
      reasonSlides.push(slide);
    }

    // ── Step N+1: CTA slide ──────────────────────────────────────
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

    // ── Step N+2: Save to DB + email ─────────────────────────────
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
        estimatedCostCents: (allSlides.length - 1) * 8 + 2, // images + Claude call
      };
    });

    logger.info(
      `[carousel-cron] Generated "${topicData.headline}": ${result.slideCount} slides`
    );

    return { generated: 1, ...result };
  }
);
