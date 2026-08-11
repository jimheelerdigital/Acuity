import { inngest } from "@/inngest/client";

/**
 * Carousel generation — runs 2× daily via cron (was 5×; cut 2026-08-10
 * to reduce token/image spend).
 *
 * - 8 UTC run: static picture slideshow only — no animation, email sent
 *   directly after generation.
 * - 12 UTC run: fully animated — every slide except the last (CTA) gets
 *   a 4s video; topic capped at 6 reasons (7 animated slides max). Email
 *   is sent by the animate function after the renders finish.
 *
 * Each run generates a fresh AI-written topic (via Claude) then
 * creates images with gpt-image-2. Uses Inngest steps so each
 * API call gets its own 300s Lambda invocation.
 */
export const carouselDailyCronFn = inngest.createFunction(
  {
    id: "carousel-daily-cron",
    name: "Content Factory — Daily Carousel Generation",
    triggers: [
      { cron: "0 8,12 * * *" },
      // Manual/test trigger (admin "generate-animated" action). Event data
      // may carry `animated: boolean` to force the mode.
      { event: "content-factory/daily.generate" },
    ],
    retries: 1,
  },
  async ({ event, step, logger }) => {
    const eventAnimated =
      event?.name === "content-factory/daily.generate"
        ? (event.data?.animated as boolean | undefined)
        : undefined;

    // ── Step 1: Generate a fresh topic via Claude ──────────────────
    // The 12 UTC run is the fully animated post — its topic is capped at
    // 6 reasons so at most 7 slides (cover + 6 reasons) get videos.
    const topicData = await step.run("generate-topic", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { generateTopic } = await import(
        "@/lib/content-factory/generate-topic"
      );

      // Cron: the 8 UTC run is static, everything else is animated.
      // Event trigger: explicit `animated` flag wins when provided.
      const animatedRun =
        typeof eventAnimated === "boolean"
          ? eventAnimated
          : new Date().getUTCHours() !== 8;

      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 86_400_000
      );
      const recentPosts = await prisma.carouselPost.findMany({
        where: { generatedFor: { gte: thirtyDaysAgo } },
        select: { headline: true },
      });
      const recentHeadlines = recentPosts.map((p) => p.headline);

      const topic = await generateTopic(
        recentHeadlines,
        animatedRun ? { maxReasons: 6 } : undefined
      );
      return { ...topic, animatedRun };
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
    // Animated runs generate TEXT-FREE artwork: the video model never
    // sees the words, so they can't move or be blocked. The text is
    // composited on afterwards — sharp for the static JPEG here, ffmpeg
    // for the rendered MP4 (see storeSlideVideo). "-notext" in the raw
    // path is the marker the animate pipeline keys off.
    const coverSlide = await step.run("generate-cover", async () => {
      const { STYLE_LANES, SCENE_SETTINGS } = await import("@/lib/content-factory/brand");
      const {
        buildImagePrompt,
        generateImage,
        uploadImage,
      } = await import("@/lib/content-factory/carousel-generate");
      const { composeSlide, composeSlideWithOverlay, renderSlideTextOverlay } =
        await import("@/lib/content-factory/compose");

      const lanePrefix =
        STYLE_LANES[topicData.lane as keyof typeof STYLE_LANES];
      const topic = {
        headline: topicData.headline,
        slug,
        lane: topicData.lane as any,
        reasons: topicData.reasons,
      };
      const prompt = buildImagePrompt(
        lanePrefix,
        topicData.headline,
        topic,
        colorScheme.prompt,
        undefined,
        {
          noText: topicData.animatedRun,
          // Rotate scene settings per slide (offset by slug so different
          // carousels don't all start in the same room).
          sceneHint: SCENE_SETTINGS[slug.length % SCENE_SETTINGS.length],
        }
      );
      const rawBuffer = await generateImage(prompt);

      if (topicData.animatedRun) {
        // Text-free start frame (resized to final 1080x1920 so the video
        // aspect matches the overlay exactly).
        const textFree = await composeSlide(rawBuffer, "", "COVER");
        const rawImageUrl = await uploadImage(
          textFree,
          `carousels/${dateStr}/${slug}/slide-0-cover-notext.jpg`
        );
        const overlay = await renderSlideTextOverlay(
          topicData.headline,
          "COVER",
          undefined,
          colorScheme.accent
        );
        // Persist the overlay so the video burn (storeSlideVideo) uses the
        // EXACT same pixels as the static JPEG.
        await uploadImage(
          overlay,
          `carousels/${dateStr}/${slug}/slide-0-overlay.png`,
          "image/png"
        );
        const composed = await composeSlideWithOverlay(rawBuffer, overlay);
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
      }

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
      rawImageUrl?: string;
      overlayText: string;
      imagePrompt: string;
    }[] = [];
    for (let i = 0; i < topicData.reasons.length; i++) {
      const slide = await step.run(`generate-reason-${i}`, async () => {
        const { STYLE_LANES, SCENE_SETTINGS } = await import("@/lib/content-factory/brand");
        const {
          buildImagePrompt,
          generateImage,
          uploadImage,
        } = await import("@/lib/content-factory/carousel-generate");
        const { composeSlide, composeSlideWithOverlay, renderSlideTextOverlay } =
          await import("@/lib/content-factory/compose");

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
        const prompt = buildImagePrompt(
          lanePrefix,
          reason,
          topic,
          colorScheme.prompt,
          slideLabel,
          {
            noText: topicData.animatedRun,
            sceneHint:
              SCENE_SETTINGS[(slug.length + i + 1) % SCENE_SETTINGS.length],
          }
        );
        const rawBuffer = await generateImage(prompt);

        if (topicData.animatedRun) {
          // Text-free start frame + our own text composite (see cover).
          const textFree = await composeSlide(rawBuffer, "", "REASON");
          const rawImageUrl = await uploadImage(
            textFree,
            `carousels/${dateStr}/${slug}/slide-${i + 1}-reason-notext.jpg`
          );
          const overlay = await renderSlideTextOverlay(
            reason,
            "REASON",
            i + 1,
            colorScheme.accent
          );
          await uploadImage(
            overlay,
            `carousels/${dateStr}/${slug}/slide-${i + 1}-overlay.png`,
            "image/png"
          );
          const composed = await composeSlideWithOverlay(rawBuffer, overlay);
          const imageUrl = await uploadImage(
            composed,
            `carousels/${dateStr}/${slug}/slide-${i + 1}-reason.jpg`
          );
          return { imageUrl, rawImageUrl, overlayText: reason, imagePrompt: prompt };
        }

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
          rawImageUrl: s.rawImageUrl,
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

    // ── Step N+3: deliver ─────────────────────────────────────────
    // 8 UTC run: static slideshow — email straight away, no animation.
    // 12 UTC run: enqueue full-post animation (every slide except the
    // CTA); the animate function sends the email on EVERY exit path
    // (success, skip, failure, timeout) so Keenan always gets exactly
    // one email — with videos when animation worked, static otherwise.
    await step.run("deliver", async () => {
      if (!topicData.animatedRun) {
        const { sendCarouselEmail } = await import("@/lib/content-factory/email");
        await sendCarouselEmail(result.postId);
        return;
      }
      try {
        await inngest.send({
          name: "content-factory/cover.animate",
          data: {
            postId: result.postId,
            sendEmail: true,
            animateAll: true,
            animationStyle: "smooth",
          },
        });
      } catch (animateErr) {
        logger.error(
          `[carousel-cron] Failed to enqueue animation for ${slug}: ${animateErr instanceof Error ? animateErr.message : animateErr}`
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
