import { inngest } from "@/inngest/client";

/**
 * Carousel generation — runs 4× daily via cron, each run an EXPLICIT
 * bucket. 2026-08-28 per Keenan: the 4 UTC toon3d PHOTO lane is dead;
 * the two animated lanes went photoreal (times below are CDT; they
 * shift one hour later in winter CST):
 *
 * -  6 UTC (1am Central):  VIDEO bucket — STATIC image carousel (no AI
 *                          animation since 2026-08-28, per Keenan:
 *                          "JUST image gen"), always the NEGATIVE
 *                          "that's me" recognition archetype ("5 signs
 *                          you're burnt out"; topic capped at 6
 *                          reasons). Each day's post rotates one of 4
 *                          visual styles: aesthetic (photoreal, no
 *                          people) / avatar (Pixar-style woman) /
 *                          illustrated (animated-film scenes, no
 *                          people) / nature (hyper-real photography).
 * -  8 UTC (3am Central):  POSITIVE — same static 4-style rotation
 *                          (offset so the pair never shares a look on
 *                          the same day), always the POSITIVE
 *                          actionable archetype ("5 ways to have a
 *                          better day").
 * - 10 UTC (5am Central):  AMBIENT — single-scene calm video with the
 *                          female AI voiceover (handled by
 *                          carouselAmbientVideoFn)
 * - 12 UTC (7am Central):  SELFIE — realistic first-person "this is how
 *                          i ..." photo slideshow (2026-08-25 per
 *                          Keenan; tightened 2026-08-28: ONE selfie per
 *                          slideshow): the cover is a mirror selfie of
 *                          a consistent, hyper-realistic woman — phone
 *                          covering her face, mirror a little dirty —
 *                          and every step slide is an aesthetic POV
 *                          shot, captions burned onto every image in
 *                          TikTok sticker style. Same avatar across
 *                          posts — each run anchors identity on the
 *                          previous selfie post's cover via the
 *                          gpt-image-2 edit (reference) endpoint. This
 *                          is the ONLY lane the avatar appears in.
 *
 * - 14 UTC (9am Central):  MOODY-WOMEN — dark/moody discipline photo
 *                          carousel for the core demographic (2026-08-28
 *                          per Keenan, cloned from the "TRUST THE
 *                          PROCESS" reference): dim quiet-luxury
 *                          photography, white text centered mid-frame,
 *                          hashtag-only caption. Audience-growth funnel,
 *                          no product CTA.
 * - 16 UTC (11am Central): MOODY-MEN — same skeleton for the second
 *                          market (young aspiring men): stark dark
 *                          architecture, command-energy discipline
 *                          content, its own hashtag pool.
 *
 * Manual/test trigger (admin): event "content-factory/daily.generate"
 * with data.bucket = "video" | "positive" | "ambient" | "selfie" |
 * "moody-women" | "moody-men".
 *
 * Each run generates a fresh AI-written topic (via Claude) then
 * creates images with gpt-image-2. Uses Inngest steps so each
 * API call gets its own 300s Lambda invocation.
 */
type DailyBucket =
  | "video"
  | "positive"
  | "ambient"
  | "selfie"
  | "moody-women"
  | "moody-men";
export const carouselDailyCronFn = inngest.createFunction(
  {
    id: "carousel-daily-cron",
    name: "Content Factory — Daily Carousel Generation",
    triggers: [
      { cron: "0 6,8,10,12,14,16 * * *" },
      // Manual/test trigger (admin generate actions).
      { event: "content-factory/daily.generate" },
    ],
    retries: 1,
  },
  async ({ event, step, logger }) => {
    // ── Resolve the bucket ─────────────────────────────────────────
    // Event trigger: explicit bucket wins (anything else — including the
    // dead "photo" — falls back to video). Cron: keyed off the trigger
    // hour (event.ts is stable across retries) — 6→video, 8→positive,
    // 10→ambient, 12→selfie.
    let bucket: DailyBucket;
    if (event?.name === "content-factory/daily.generate") {
      const b = event.data?.bucket as string | undefined;
      bucket =
        b === "video" ||
        b === "positive" ||
        b === "ambient" ||
        b === "selfie" ||
        b === "moody-women" ||
        b === "moody-men"
          ? b
          : "video";
    } else {
      const ts = typeof event?.ts === "number" ? event.ts : Date.now();
      const hour = new Date(ts).getUTCHours();
      bucket =
        hour < 7
          ? "video"
          : hour < 9
            ? "positive"
            : hour < 11
              ? "ambient"
              : hour < 13
                ? "selfie"
                : hour < 15
                  ? "moody-women"
                  : "moody-men";
    }
    logger.info(`[carousel-cron] Bucket: ${bucket}`);

    // ── AMBIENT bucket: hand off to the calm-video pipeline ────────
    // The ambient function generates its own concept, creates its own
    // CarouselPost (format=AMBIENT), and emails the result.
    if (bucket === "ambient") {
      await step.run("enqueue-ambient-video", async () => {
        await inngest.send({ name: "content-factory/ambient.video", data: {} });
      });
      return { generated: 0, bucket, delegated: "ambient.video" };
    }

    // ── MOODY buckets: dark discipline carousels, two funnels ──────
    // (2026-08-28, per Keenan — cloned from the "TRUST THE PROCESS"
    // reference.) Cover + 5 numbered item slides: dim cinematic
    // photography, white text centered mid-frame, hashtag-only caption.
    // "moody-women" = core demographic, softer warm-dim visuals;
    // "moody-men" = young aspiring men, stark dark visuals. Both are
    // audience-growth funnels — no product CTA anywhere.
    if (bucket === "moody-women" || bucket === "moody-men") {
      const audience = bucket === "moody-women" ? "women" : "men";

      const moody = await step.run("generate-moody-topic", async () => {
        const { prisma } = await import("@/lib/prisma");
        const { generateMoodyTopic } = await import(
          "@/lib/content-factory/moody-carousel"
        );
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
        const recent = await prisma.carouselPost.findMany({
          where: { generatedFor: { gte: thirtyDaysAgo }, lane: bucket },
          select: { headline: true },
        });
        return generateMoodyTopic(audience, recent.map((p) => p.headline));
      });

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const dateStr = today.toISOString().slice(0, 10);
      const slug = moody.slug;
      logger.info(
        `[carousel-cron] Moody (${audience}) topic: "${moody.title}" (${moody.items.length} items)`
      );

      await step.run("ensure-bucket", async () => {
        const { ensureBucket } = await import(
          "@/lib/content-factory/carousel-generate"
        );
        await ensureBucket();
      });

      const moodyCover = await step.run("generate-moody-cover", async () => {
        const { generateImage, uploadImage } = await import(
          "@/lib/content-factory/carousel-generate"
        );
        const { buildMoodyImagePrompt } = await import(
          "@/lib/content-factory/moody-carousel"
        );
        const { composeSlideWithOverlay, renderMoodyTextOverlay } =
          await import("@/lib/content-factory/compose");

        const prompt = buildMoodyImagePrompt(audience, moody.coverScene);
        const rawBuffer = await generateImage(prompt);
        const overlay = await renderMoodyTextOverlay([moody.title], "COVER");
        const composed = await composeSlideWithOverlay(rawBuffer, overlay);
        const imageUrl = await uploadImage(
          composed,
          `carousels/${dateStr}/${slug}/slide-0-cover.jpg`
        );
        return { imageUrl, overlayText: moody.title, imagePrompt: prompt };
      });

      const moodySlides: {
        imageUrl: string;
        overlayText: string;
        imagePrompt: string;
      }[] = [];
      for (let i = 0; i < moody.items.length; i++) {
        const slide = await step.run(`generate-moody-item-${i}`, async () => {
          const { generateImage, uploadImage } = await import(
            "@/lib/content-factory/carousel-generate"
          );
          const { buildMoodyImagePrompt } = await import(
            "@/lib/content-factory/moody-carousel"
          );
          const { composeSlideWithOverlay, renderMoodyTextOverlay } =
            await import("@/lib/content-factory/compose");

          const item = moody.items[i];
          const paragraphs = [`${i + 1}. ${item.name}`, ...item.lines];
          const prompt = buildMoodyImagePrompt(audience, item.scene);
          const rawBuffer = await generateImage(prompt);
          const overlay = await renderMoodyTextOverlay(paragraphs, "ITEM");
          const composed = await composeSlideWithOverlay(rawBuffer, overlay);
          const imageUrl = await uploadImage(
            composed,
            `carousels/${dateStr}/${slug}/slide-${i + 1}-item.jpg`
          );
          return {
            imageUrl,
            overlayText: paragraphs.join("\n\n"),
            imagePrompt: prompt,
          };
        });
        moodySlides.push(slide);
      }

      const moodyResult = await step.run("save-and-email-moody", async () => {
        const { prisma } = await import("@/lib/prisma");
        const { buildMoodyCaption } = await import(
          "@/lib/content-factory/moody-carousel"
        );
        const { extractHashtags } = await import(
          "@/lib/content-factory/carousel-generate"
        );

        // Hashtag-only caption cloned from the reference (2026-08-28,
        // per Keenan — deliberate exception to the question+tags rule).
        const caption = buildMoodyCaption(audience, slug);

        const post = await prisma.carouselPost.create({
          data: {
            topicSlug: slug,
            headline: moody.title,
            status: "DRAFT",
            format: "PHOTO",
            caption,
            hashtags: extractHashtags(caption),
            generatedFor: today,
            lane: bucket,
            slides: {
              create: [
                {
                  order: 0,
                  kind: "COVER" as const,
                  overlayText: moodyCover.overlayText,
                  imagePrompt: moodyCover.imagePrompt,
                  imageUrl: moodyCover.imageUrl,
                },
                ...moodySlides.map((s, i) => ({
                  order: i + 1,
                  kind: "REASON" as const,
                  overlayText: s.overlayText,
                  imagePrompt: s.imagePrompt,
                  imageUrl: s.imageUrl,
                })),
              ],
            },
          },
        });

        const { sendCarouselEmail } = await import(
          "@/lib/content-factory/email"
        );
        await sendCarouselEmail(post.id);
        return {
          postId: post.id,
          slideCount: moodySlides.length + 1,
          estimatedCostCents: (moodySlides.length + 1) * 8 + 2,
        };
      });

      logger.info(
        `[carousel-cron] Generated moody (${audience}) "${moody.title}": ${moodyResult.slideCount} slides`
      );
      return { generated: 1, bucket, ...moodyResult };
    }

    // ── SELFIE bucket: realistic first-person photo slideshow ──────
    // 2026-08-25, per Keenan; 2026-08-28: ONE selfie per slideshow.
    // Fully static (no animation): cover mirror selfie (phone covering
    // her face, slightly dirty mirror; same avatar, identity anchored
    // on a reference image) + 4-6 hyper-realistic aesthetic POV step
    // slides. Captions burned onto every image in TikTok sticker
    // style. Emails immediately (no animation).
    if (bucket === "selfie") {
      // Step 1: topic + persona anchor (previous selfie post's raw cover).
      const selfie = await step.run("generate-selfie-topic", async () => {
        const { prisma } = await import("@/lib/prisma");
        const { generateSelfieTopic } = await import(
          "@/lib/content-factory/generate-topic"
        );

        const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
        const recent = await prisma.carouselPost.findMany({
          where: { generatedFor: { gte: thirtyDaysAgo } },
          select: { headline: true },
        });
        const topic = await generateSelfieTopic(recent.map((p) => p.headline));

        // Same avatar across posts: the newest selfie post's text-free
        // cover becomes the identity reference for this post's cover.
        const prev = await prisma.carouselSlide.findFirst({
          where: {
            order: 0,
            rawImageUrl: { not: null },
            carouselPost: { lane: "selfie" },
          },
          orderBy: { carouselPost: { generatedFor: "desc" } },
          select: { rawImageUrl: true },
        });
        return { ...topic, anchorUrl: prev?.rawImageUrl ?? null };
      });

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const dateStr = today.toISOString().slice(0, 10);
      const slug = selfie.slug;
      logger.info(
        `[carousel-cron] Selfie topic: "${selfie.headline}" (${selfie.steps.length} steps)`
      );

      await step.run("ensure-bucket", async () => {
        const { ensureBucket } = await import(
          "@/lib/content-factory/carousel-generate"
        );
        await ensureBucket();
      });

      // Sticker text color — deterministic per post so re-renders match.
      const stickerColor = await step.run("pick-sticker-color", async () => {
        const { SELFIE_TEXT_COLORS } = await import(
          "@/lib/content-factory/compose"
        );
        let hash = 0;
        for (const c of slug) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
        return SELFIE_TEXT_COLORS[Math.abs(hash) % SELFIE_TEXT_COLORS.length];
      });

      // Step 2: cover — mirror selfie, identity-anchored when possible.
      const cover = await step.run("generate-selfie-cover", async () => {
        const {
          buildSelfieImagePrompt,
          generateImage,
          generateImageWithReference,
          uploadImage,
        } = await import("@/lib/content-factory/carousel-generate");
        const { composeSlide, composeSlideWithOverlay, renderSelfieCaptionOverlay } =
          await import("@/lib/content-factory/compose");

        const { SELFIE_POSE_VARIANTS, SELFIE_COVER_POSE_COUNT } = await import(
          "@/lib/content-factory/brand"
        );
        let poseHash = 0;
        for (const c of slug) poseHash = ((poseHash << 5) - poseHash + c.charCodeAt(0)) | 0;
        // Cover pose: face-visible prefix ONLY — the cover raw anchors
        // her identity for future posts, so it can't be a facing-away shot.
        const poseBase = Math.abs(poseHash) % SELFIE_COVER_POSE_COUNT;
        const prompt = buildSelfieImagePrompt({
          shot: "mirror",
          scene: selfie.coverScene,
          slideText: selfie.headline,
          headline: selfie.headline,
          hasReference: !!selfie.anchorUrl,
          pose: SELFIE_POSE_VARIANTS[poseBase],
        });

        let rawBuffer: Buffer;
        if (selfie.anchorUrl) {
          const res = await fetch(selfie.anchorUrl);
          if (!res.ok) throw new Error(`Anchor fetch failed: HTTP ${res.status}`);
          rawBuffer = await generateImageWithReference(
            prompt,
            Buffer.from(await res.arrayBuffer())
          );
        } else {
          rawBuffer = await generateImage(prompt);
        }

        // Text-free raw at final 1080x1920 — this is BOTH the identity
        // reference for this post's mirror slides AND the anchor for
        // future selfie posts.
        const textFree = await composeSlide(rawBuffer, "", "COVER");
        const rawImageUrl = await uploadImage(
          textFree,
          `carousels/${dateStr}/${slug}/slide-0-cover-raw.jpg`
        );
        const overlay = await renderSelfieCaptionOverlay(selfie.headline, {
          kind: "COVER",
          color: stickerColor,
          placement: "lower", // cover is always a mirror selfie — keep off the face
        });
        const composed = await composeSlideWithOverlay(rawBuffer, overlay);
        const imageUrl = await uploadImage(
          composed,
          `carousels/${dateStr}/${slug}/slide-0-cover.jpg`
        );
        return {
          imageUrl,
          rawImageUrl,
          overlayText: selfie.headline,
          imagePrompt: prompt,
        };
      });

      // Steps 3..N: one slide per step. Mirror shots reference the cover
      // raw so it's the same woman on every slide; aesthetic shots are
      // person-free and generate fresh.
      const stepSlides: {
        imageUrl: string;
        rawImageUrl: string;
        overlayText: string;
        imagePrompt: string;
      }[] = [];
      for (let i = 0; i < selfie.steps.length; i++) {
        const slide = await step.run(`generate-selfie-step-${i}`, async () => {
          const {
            buildSelfieImagePrompt,
            generateImage,
            generateImageWithReference,
            uploadImage,
          } = await import("@/lib/content-factory/carousel-generate");
          const { composeSlideWithOverlay, renderSelfieCaptionOverlay } =
            await import("@/lib/content-factory/compose");

          const { SELFIE_POSE_VARIANTS, SELFIE_COVER_POSE_COUNT } = await import(
            "@/lib/content-factory/brand"
          );
          let poseHash = 0;
          for (const c of slug) poseHash = ((poseHash << 5) - poseHash + c.charCodeAt(0)) | 0;
          // Same face-visible base index as the cover; steps offset from
          // it across the FULL pool (incl. facing-away/outdoor poses).
          const poseBase = Math.abs(poseHash) % SELFIE_COVER_POSE_COUNT;
          const shot = selfie.stepShots[i];
          const prompt = buildSelfieImagePrompt({
            shot: shot.type,
            scene: shot.scene,
            slideText: selfie.steps[i],
            headline: selfie.headline,
            hasReference: shot.type === "mirror",
            // Offset by slide index so no two selfies in a post (cover
            // included) share a pose; slug offset varies it across days.
            pose: SELFIE_POSE_VARIANTS[
              (poseBase + i + 1) % SELFIE_POSE_VARIANTS.length
            ],
          });

          let rawBuffer: Buffer;
          if (shot.type === "mirror") {
            const res = await fetch(cover.rawImageUrl);
            if (!res.ok)
              throw new Error(`Cover reference fetch failed: HTTP ${res.status}`);
            rawBuffer = await generateImageWithReference(
              prompt,
              Buffer.from(await res.arrayBuffer())
            );
          } else {
            rawBuffer = await generateImage(prompt);
          }

          // Keep the text-free raw so captions can be re-rendered later
          // without paying for image regeneration (lesson from the
          // 2026-08-25 example run, where a text fix required new images).
          const { composeSlide } = await import("@/lib/content-factory/compose");
          const textFree = await composeSlide(rawBuffer, "", "REASON");
          const rawImageUrl = await uploadImage(
            textFree,
            `carousels/${dateStr}/${slug}/slide-${i + 1}-step-raw.jpg`
          );
          const overlay = await renderSelfieCaptionOverlay(selfie.steps[i], {
            kind: "REASON",
            detail: selfie.details[i] || undefined,
            color: stickerColor,
            // Mirror = her in frame → torso-level text, off the face.
            // Aesthetic = no people → upper-middle keeps the subject clear.
            placement: shot.type === "mirror" ? "lower" : "upper",
          });
          const composed = await composeSlideWithOverlay(rawBuffer, overlay);
          const imageUrl = await uploadImage(
            composed,
            `carousels/${dateStr}/${slug}/slide-${i + 1}-step.jpg`
          );
          return {
            imageUrl,
            rawImageUrl,
            overlayText: selfie.steps[i],
            imagePrompt: prompt,
          };
        });
        stepSlides.push(slide);
      }

      // Save + email (static — delivered immediately, no animation).
      const selfieResult = await step.run("save-and-email-selfie", async () => {
        const { prisma } = await import("@/lib/prisma");
        const { buildCaption } = await import("@/lib/content-factory/caption");
        const { extractHashtags } = await import(
          "@/lib/content-factory/carousel-generate"
        );

        // Caption = one thought-provoking question + 3-4 hashtags
        // (2026-08-28, per Keenan — all posts, no plug, no asks).
        const caption = buildCaption({
          slug,
          headline: selfie.headline,
          style: "hook",
          lane: "cinematicReal",
          reasons: selfie.steps,
          captionQuestion: selfie.captionQuestion,
        });

        const post = await prisma.carouselPost.create({
          data: {
            topicSlug: slug,
            headline: selfie.headline,
            status: "DRAFT",
            // PHOTO format (it IS a static picture slideshow); the
            // "selfie" lane marks the sub-format — no schema change, so
            // this ships without waiting on the pending db push.
            format: "PHOTO",
            caption,
            hashtags: extractHashtags(caption),
            generatedFor: today,
            lane: "selfie",
            mood: selfie.mood ?? null,
            slides: {
              create: [
                {
                  order: 0,
                  kind: "COVER" as const,
                  overlayText: cover.overlayText,
                  imagePrompt: cover.imagePrompt,
                  imageUrl: cover.imageUrl,
                  rawImageUrl: cover.rawImageUrl,
                },
                ...stepSlides.map((s, i) => ({
                  order: i + 1,
                  kind: "REASON" as const,
                  overlayText: s.overlayText,
                  imagePrompt: s.imagePrompt,
                  imageUrl: s.imageUrl,
                  rawImageUrl: s.rawImageUrl,
                })),
              ],
            },
          },
        });

        const { sendCarouselEmail } = await import(
          "@/lib/content-factory/email"
        );
        await sendCarouselEmail(post.id);
        return {
          postId: post.id,
          slideCount: stepSlides.length + 1,
          estimatedCostCents: (stepSlides.length + 1) * 8 + 2,
        };
      });

      logger.info(
        `[carousel-cron] Generated selfie slideshow "${selfie.headline}": ${selfieResult.slideCount} slides`
      );
      return { generated: 1, bucket, ...selfieResult };
    }

    // ── Visual style rotation (2026-08-28, per Keenan: no more AI
    // animation on the negative/positive carousels — JUST image gen,
    // rotating four looks). Deterministic by day (event.ts is stable
    // across retries) so each bucket cycles all four styles over four
    // days; the positive bucket is offset by 2 so the daily pair never
    // shares a look. An explicit event override wins (admin testing).
    const CAROUSEL_STYLE_ROTATION = [
      "aesthetic",
      "avatar",
      "illustrated",
      "nature",
    ] as const;
    type VisualStyle = (typeof CAROUSEL_STYLE_ROTATION)[number];
    const styleOverride = (
      event?.data as { visualStyle?: string } | undefined
    )?.visualStyle;
    const eventTs = typeof event?.ts === "number" ? event.ts : Date.now();
    const dayIndex = Math.floor(eventTs / 86_400_000);
    const visualStyle: VisualStyle = (CAROUSEL_STYLE_ROTATION as readonly string[]).includes(
      styleOverride ?? ""
    )
      ? (styleOverride as VisualStyle)
      : CAROUSEL_STYLE_ROTATION[
          (dayIndex + (bucket === "positive" ? 2 : 0)) %
            CAROUSEL_STYLE_ROTATION.length
        ];
    logger.info(`[carousel-cron] Visual style: ${visualStyle}`);

    // ── Step 1: Generate a fresh topic via Claude ──────────────────
    // Both daily buckets' topics are capped at 6 reasons (7 slides max).
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

      // Niche Lab data is deliberately NOT wired in here (2026-08-25,
      // per Keenan): niche research only produces SUGGESTED topics in
      // the admin, generated on demand — never silently influencing the
      // automatic daily posts.

      // The two animated runs are a deliberate daily pair (2026-08-24,
      // per Keenan): 6 UTC is always the negative recognition post,
      // 8 UTC always the positive actionable one.
      const topic = await generateTopic(recentHeadlines, {
        maxReasons: 6,
        archetype: bucket === "video" ? ("resonance" as const) : ("actionable" as const),
        performance,
        // Steers the prompt's scene direction to today's rotated look.
        visualStyle,
      });
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

    // Color scheme: the accent is still used for the burned text
    // overlays; the artwork itself is photoreal and ignores it.
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
    // STATIC image in today's rotated visual style (2026-08-28, per
    // Keenan: no more AI animation on these lanes — JUST image gen).
    // The artwork is generated text-free and the words are composited
    // on afterwards with sharp, so the model can't mangle them.
    const coverSlide = await step.run("generate-cover", async () => {
      const { buildCarouselImagePrompt, generateImage, uploadImage } =
        await import("@/lib/content-factory/carousel-generate");
      const { composeSlideWithOverlay, renderSlideTextOverlay } =
        await import("@/lib/content-factory/compose");

      const prompt = buildCarouselImagePrompt({
        style: visualStyle,
        scene:
          topicData.coverEmotion?.scene ||
          "A quiet kitchen counter in early morning light, a mug steaming alone by the window",
        slideText: topicData.headline,
        headline: topicData.headline,
      });
      const rawBuffer = await generateImage(prompt);

      // No engagement question on the cover (2026-08-28, per Keenan) —
      // just the centered headline.
      const overlay = await renderSlideTextOverlay(
        topicData.headline,
        "COVER",
        undefined,
        colorScheme.accent
      );
      const composed = await composeSlideWithOverlay(rawBuffer, overlay);
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
        const { buildCarouselImagePrompt, generateImage, uploadImage } =
          await import("@/lib/content-factory/carousel-generate");
        const { composeSlideWithOverlay, renderSlideTextOverlay } =
          await import("@/lib/content-factory/compose");

        const reason = topicData.reasons[i];
        // Supporting detail sentence for this item (2026-08-16 revamp).
        const detail = topicData.details?.[i] || undefined;
        const prompt = buildCarouselImagePrompt({
          style: visualStyle,
          scene:
            topicData.reasonEmotions?.[i]?.scene ||
            "A different quiet corner of the same real home — one everyday object carrying the feeling, warm natural light",
          slideText: reason,
          headline: topicData.headline,
        });
        const rawBuffer = await generateImage(prompt);

        const overlay = await renderSlideTextOverlay(
          reason,
          "REASON",
          i + 1,
          colorScheme.accent,
          detail
        );
        const composed = await composeSlideWithOverlay(rawBuffer, overlay);
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
      ];

      const topic = {
        slug,
        headline: topicData.headline,
        style: topicData.style as any,
        lane: topicData.lane as any,
        reasons: topicData.reasons,
        // LLM-written caption question (2026-08-28) — buildCaption
        // falls back to its question pool when absent.
        captionQuestion: topicData.captionQuestion,
      };
      const caption = buildCaption(topic);

      const post = await prisma.carouselPost.create({
        data: {
          topicSlug: slug,
          headline: topicData.headline,
          status: "DRAFT",
          // STATIC since 2026-08-28 (per Keenan: no more AI animation on
          // negative/positive — just image gen).
          format: "PHOTO",
          caption,
          hashtags: extractHashtags(caption),
          generatedFor: today,
          // Lane records today's visual style (aesthetic / avatar /
          // illustrated / nature) so the admin and future feedback loops
          // can compare how each look performs.
          lane: visualStyle,
          mood: topicData.mood ?? null,
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

      return {
        postId: post.id,
        slideCount: allSlides.length,
        estimatedCostCents: allSlides.length * 8 + 2, // every slide is a generated image now (no CTA) + Claude call
      };
    });

    // ── Step N+2: deliver ─────────────────────────────────────────
    // Static post (2026-08-28, per Keenan: no more AI animation on the
    // negative/positive carousels) — email the finished images right
    // away.
    await step.run("deliver", async () => {
      const { sendCarouselEmail } = await import("@/lib/content-factory/email");
      await sendCarouselEmail(result.postId);
    });

    logger.info(
      `[carousel-cron] Generated "${topicData.headline}": ${result.slideCount} slides`
    );

    return { generated: 1, ...result };
  }
);
