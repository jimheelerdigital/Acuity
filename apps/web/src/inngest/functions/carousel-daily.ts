import { inngest } from "@/inngest/client";

/**
 * Carousel generation — 2 runs daily (2026-08-12 per Keenan: exactly
 * one animated video carousel + one static carousel + one story video
 * per day, matching what his posting workflow can absorb):
 * - 12 UTC (7am Central): FULLY ANIMATED — every slide gets a 4s video,
 *   topic capped at 6 reasons (7 animated slides max), and the 30s
 *   story video is chained after the slide animations finish.
 * - 16 UTC (11am Central): STATIC — image slides only, emailed
 *   immediately, no animation, no story.
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
      { cron: "0 12,16 * * *" },
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

      // Cron: the 12 UTC run is animated (+ story video), the 16 UTC run
      // is static (2026-08-12 per Keenan: one of each per day). Event
      // trigger: explicit `animated` flag wins when provided.
      const animatedRun =
        typeof eventAnimated === "boolean"
          ? eventAnimated
          : new Date().getUTCHours() < 14;

      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 86_400_000
      );
      const recentPosts = await prisma.carouselPost.findMany({
        where: { generatedFor: { gte: thirtyDaysAgo } },
        select: { headline: true },
      });
      const recentHeadlines = recentPosts.map((p) => p.headline);

      // Engagement feedback loop (2026-08-12): Keenan enters real metrics
      // via the admin form; the topic prompt learns from what actually
      // performed. Needs at least 4 metric-bearing posts to kick in.
      const metricPosts = await prisma.carouselPost.findMany({
        where: { metricsAt: { not: null } },
        orderBy: { metricsAt: "desc" },
        take: 30,
        select: {
          headline: true,
          views: true,
          likes: true,
          comments: true,
          saves: true,
          shares: true,
        },
      });
      let performance: { top: string[]; bottom: string[] } | undefined;
      if (metricPosts.length >= 4) {
        const scored = metricPosts.map((p) => {
          // Saves and shares are the algorithm's strongest signals;
          // normalize per 1k views when views are known so small posts
          // with great ratios still rank.
          const engagement =
            (p.likes ?? 0) +
            2 * (p.comments ?? 0) +
            3 * (p.saves ?? 0) +
            3 * (p.shares ?? 0);
          const score = p.views ? (engagement / p.views) * 1000 : engagement;
          return { headline: p.headline, score };
        });
        scored.sort((a, b) => b.score - a.score);
        const topCount = Math.min(5, Math.floor(scored.length / 2));
        performance = {
          top: scored.slice(0, topCount).map((s) => s.headline),
          bottom: scored.slice(-topCount).map((s) => s.headline),
        };
      }

      const topic = await generateTopic(recentHeadlines, {
        ...(animatedRun ? { maxReasons: 6 } : {}),
        performance,
      });
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
      const { STYLE_LANES, SCENE_SETTINGS, COVER_TREATMENTS } = await import("@/lib/content-factory/brand");
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
      // On-cover engagement ask (2026-08-13, per Keenan): the cover asks
      // "which one hits the hardest" (varied per post) — static and
      // animated both carry it.
      const { coverEngagementLine } = await import(
        "@/lib/content-factory/caption"
      );
      const engagementLine = coverEngagementLine(topicData.headline, slug);
      const prompt = buildImagePrompt(
        lanePrefix,
        topicData.headline,
        topic,
        colorScheme.prompt,
        undefined,
        {
          noText: topicData.animatedRun,
          coverSubline: topicData.animatedRun ? undefined : engagementLine,
          // Rotate scene settings per slide (offset by slug so different
          // carousels don't all start in the same room), plus a rotating
          // cover composition so covers stop looking identical.
          sceneHint:
            SCENE_SETTINGS[slug.length % SCENE_SETTINGS.length] +
            " " +
            COVER_TREATMENTS[slug.length % COVER_TREATMENTS.length],
          // Her expression must match the post's emotional weight, not
          // default to joyful (2026-08-11).
          mood: topicData.coverEmotion?.mood ?? topicData.mood,
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
          colorScheme.accent,
          engagementLine
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
            mood: topicData.reasonEmotions?.[i]?.mood ?? topicData.mood,
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

    // NOTE (2026-08-12, per Keenan): the branded CTA end slide is removed
    // for now — ending on an ad suppressed shares. The post now ends on
    // the mic-drop last reason. composeCTASlide is kept for existing
    // posts and an easy restore.

    // ── Step N+1: Save to DB ─────────────────────────────────────
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
          // Persisted for the story-video fn (style/mood fallback) and the
          // engagement feedback loop (2026-08-12).
          lane: topicData.lane,
          mood: topicData.mood ?? null,
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
        estimatedCostCents: allSlides.length * 8 + 2, // every slide is a generated image now (no CTA) + Claude call
      };
    });

    // ── Step N+3: deliver ─────────────────────────────────────────
    // 16 UTC run: static slideshow — email straight away, no animation.
    // 12 UTC run: enqueue full-post animation + chained story video;
    // the animate function sends the email on EVERY exit path
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
            // Per-slide emotion directions, indexed by slide order
            // (0 = cover, 1..N = reasons). The animate function uses the
            // bespoke motion for each slide's video prompt, with the mood
            // pool as fallback.
            slideEmotions: [
              topicData.coverEmotion ?? { mood: topicData.mood },
              ...topicData.reasons.map(
                (_: string, i: number) =>
                  topicData.reasonEmotions?.[i] ?? { mood: topicData.mood }
              ),
            ],
            // After the slide animations finish, the animate function
            // kicks off the 30s story video (script → 6 images → 6 clips
            // → voiceover → stitch → email). Chained AFTER animation so
            // story clips never fight the slide waves for Higgsfield's
            // ~4-concurrent-job cap. Lane keeps the story's illustration
            // style consistent with the carousel (also persisted on the
            // post now, so manual story re-runs use the same lane).
            storyVideo: true,
            lane: topicData.lane,
            mood: topicData.mood,
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
