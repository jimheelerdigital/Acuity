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
    triggers: [{ cron: "0 8,9,10,11,12 * * *" }],
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
      // Upload the text-free raw image too — it's the START frame for the
      // animated cover video (the composed cover is the END frame).
      const rawImageUrl = await uploadImage(
        rawBuffer,
        `carousels/${dateStr}/${slug}/slide-0-cover-raw.jpg`
      );
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
        rawImageUrl,
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
        const slideLabel = `${i + 1}. ${reason}`;
        const prompt = buildImagePrompt(lanePrefix, reason, topic, colorScheme.prompt, slideLabel);
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

      const composed = await composeCTASlide(ctaText, colorScheme.ctaBg);
      const imageUrl = await uploadImage(
        composed,
        `carousels/${dateStr}/${slug}/slide-${topicData.reasons.length + 1}-cta.jpg`
      );
      return { imageUrl };
    });

    // ── Step N+2: Save to DB ─────────────────────────────────────
    // Email is sent AFTER cover animation completes (see the animate
    // function) so the video arrives in the same Resend email.
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
          rawImageUrl: coverSlide.rawImageUrl,
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
              rawImageUrl: "rawImageUrl" in s ? s.rawImageUrl : undefined,
            })),
          },
        },
      });

      return {
        postId: post.id,
        slideCount: allSlides.length,
        estimatedCostCents: (allSlides.length - 1) * 8 + 2, // images + Claude call
      };
    });

    // ── Step N+3: fan out cover animation, which sends the email ─
    // Pipeline order: carousel gen → cover animation → Resend email.
    // The animate function sends the email on EVERY exit path (success,
    // skip, failure, timeout) so Keenan always gets exactly one email —
    // with the video when animation worked, static cover otherwise.
    await step.run("enqueue-cover-animation", async () => {
      try {
        // The first run of the day (8 UTC) gets the high-energy "crazy
        // intro" (spin-in) treatment; the other four runs stay smooth.
        const animationStyle =
          new Date().getUTCHours() === 8 ? "crazy" : "smooth";
        await inngest.send({
          name: "content-factory/cover.animate",
          data: { postId: result.postId, sendEmail: true, animationStyle },
        });
      } catch (animateErr) {
        logger.error(
          `[carousel-cron] Failed to enqueue cover animation for ${slug}: ${animateErr instanceof Error ? animateErr.message : animateErr}`
        );
        // Never leave the post unsent — fall back to emailing the static
        // carousel right away if the animation event can't be enqueued.
        const { sendCarouselEmail } = await import("@/lib/content-factory/email");
        await sendCarouselEmail(result.postId);
      }
    });

    logger.info(
      `[carousel-cron] Generated "${topicData.headline}": ${result.slideCount} slides`
    );

    return { generated: 1, ...result };
  }
);
