import { inngest } from "@/inngest/client";

/**
 * One-off carousel generation triggered from the admin UI.
 *
 * Uses Inngest steps so each gpt-image-2 call gets its own 300s Lambda
 * invocation — prevents Vercel timeout on the full 7-image pipeline.
 */
export const carouselGenerateOneOffFn = inngest.createFunction(
  {
    id: "carousel-generate-one-off",
    name: "Content Factory — On-Demand Generation",
    triggers: [{ event: "carousel/generate.one-off" }],
    retries: 1,
    concurrency: { limit: 1 },
  },
  async ({ event, step, logger }) => {
    // ── Step 1: Pick topic ─────────────────────────────────────────
    const topicData = await step.run("pick-topic", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { CAROUSEL_TOPICS } = await import(
        "@/lib/content-factory/topics"
      );

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 86_400_000);

      let topicSlug = event.data?.topicSlug as string | undefined;

      if (topicSlug) {
        const topic = CAROUSEL_TOPICS.find((t) => t.slug === topicSlug);
        if (!topic) return null;
        return {
          slug: topic.slug,
          headline: topic.headline,
          reasons: topic.reasons,
          lane: topic.lane,
          style: topic.style,
        };
      }

      // Pick random unused topic
      const recentPosts = await prisma.carouselPost.findMany({
        where: { generatedFor: { gte: thirtyDaysAgo } },
        select: { topicSlug: true },
      });
      const recentSlugs = new Set(recentPosts.map((p) => p.topicSlug));
      const available = CAROUSEL_TOPICS.filter(
        (t) => !recentSlugs.has(t.slug)
      );

      if (available.length === 0) return null;

      const pick =
        available[Math.floor(Math.random() * available.length)];
      return {
        slug: pick.slug,
        headline: pick.headline,
        reasons: pick.reasons,
        lane: pick.lane,
        style: pick.style,
      };
    });

    if (!topicData) {
      logger.warn("[carousel-one-off] No available topics");
      return { generated: 0, error: "No available topics" };
    }

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
      logger.info(`[carousel-one-off] ${slug} already generated for ${dateStr}`);
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
        const composed = await composeSlide(rawBuffer, reason, "REASON", i + 1);
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
          `[carousel-one-off] Email failed: ${emailErr instanceof Error ? emailErr.message : emailErr}`
        );
      }

      return {
        postId: post.id,
        slideCount: allSlides.length,
        estimatedCostCents: (allSlides.length - 1) * 8,
      };
    });

    logger.info(
      `[carousel-one-off] Generated ${slug}: ${result.slideCount} slides`
    );

    return { generated: 1, ...result };
  }
);
