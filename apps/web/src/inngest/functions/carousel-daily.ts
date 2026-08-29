import { inngest } from "@/inngest/client";

/**
 * Carousel generation — runs 10× daily via cron, each run an EXPLICIT
 * bucket. 2026-08-28 late PM, per Keenan: the negative ("video"),
 * positive, and selfie lanes are REPLACED by three new moody-family
 * formats — the whole daily rotation is now the moody visual DNA (the
 * only formats he's validated), plus the ambient voiced video. Times
 * below are CDT; they shift one hour later in winter CST:
 *
 * -  6 UTC (1am Central):  RULES — "Rules I broke to get my life back"
 *                          (women): five quiet first-person rebellions,
 *                          numbered like the discipline lanes.
 *                          (Replaces the negative "video" lane.)
 * -  8 UTC (3am Central):  MISSED — universal missed-connection math
 *                          ("You'll walk past about 80,000 strangers.
 *                          One of them would have been your best
 *                          friend."). Memento's cousin — the finite
 *                          thing is connection, not time.
 *                          (Replaces the positive lane.)
 * - 10 UTC (5am Central):  AMBIENT — single-scene calm video with the
 *                          female AI voiceover (handled by
 *                          carouselAmbientVideoFn)
 * - 12 UTC (7am Central):  FORBIDDEN — "DELETE THIS AFTER READING"
 *                          (women): warning-label cover + 5 slides,
 *                          each ONE truth you're not supposed to say
 *                          out loud, in the premium QUOTE serif.
 *                          (Replaces the selfie lane.)
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
 * - 18 UTC (1pm Central):  QUOTE-WOMEN — one devastating line burned on
 *                          a dark scene that loops with NO visible
 *                          start/end (mathematically perfect loop,
 *                          handled by carouselQuoteLoopFn), 12-18s.
 * - 19 UTC (2pm Central):  QUOTE-MEN — same format, men's funnel.
 * - 20 UTC (3pm Central):  MEMENTO — universal memento-mori time-math
 *                          carousel ("You'll see your parents about 15
 *                          more times."), moody skeleton, no number
 *                          headers.
 * - 21 UTC (4pm Central):  QUESTIONS — women's hard-questions carousel:
 *                          5 slides, ONE question each, no answers
 *                          anywhere.
 *
 * Manual/test trigger (admin): event "content-factory/daily.generate"
 * with data.bucket = "rules" | "missed" | "ambient" | "forbidden" |
 * "moody-women" | "moody-men" | "quote-women" | "quote-men" |
 * "memento" | "questions".
 *
 * Each run generates a fresh AI-written topic (via Claude) then
 * creates images with gpt-image-2. Uses Inngest steps so each
 * API call gets its own 300s Lambda invocation.
 */
type DailyBucket =
  | "rules"
  | "missed"
  | "ambient"
  | "forbidden"
  | "moody-women"
  | "moody-men"
  | "quote-women"
  | "quote-men"
  | "memento"
  | "questions";
export const carouselDailyCronFn = inngest.createFunction(
  {
    id: "carousel-daily-cron",
    name: "Content Factory — Daily Carousel Generation",
    triggers: [
      { cron: "0 6,8,10,12,14,16,18,19,20,21 * * *" },
      // Manual/test trigger (admin generate actions).
      { event: "content-factory/daily.generate" },
    ],
    retries: 1,
  },
  async ({ event, step, logger }) => {
    // ── Resolve the bucket ─────────────────────────────────────────
    // Event trigger: explicit bucket wins (anything else — including the
    // dead video/positive/selfie names — falls back to rules). Cron:
    // keyed off the trigger hour (event.ts is stable across retries).
    let bucket: DailyBucket;
    if (event?.name === "content-factory/daily.generate") {
      const b = event.data?.bucket as string | undefined;
      bucket =
        b === "rules" ||
        b === "missed" ||
        b === "ambient" ||
        b === "forbidden" ||
        b === "moody-women" ||
        b === "moody-men" ||
        b === "quote-women" ||
        b === "quote-men" ||
        b === "memento" ||
        b === "questions"
          ? b
          : "rules";
    } else {
      const ts = typeof event?.ts === "number" ? event.ts : Date.now();
      const hour = new Date(ts).getUTCHours();
      bucket =
        hour < 7
          ? "rules"
          : hour < 9
            ? "missed"
            : hour < 11
              ? "ambient"
              : hour < 13
                ? "forbidden"
                : hour < 15
                  ? "moody-women"
                  : hour < 18
                    ? "moody-men"
                    : hour < 19
                      ? "quote-women"
                      : hour < 20
                        ? "quote-men"
                        : hour < 21
                          ? "memento"
                          : "questions";
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

    // ── QUOTE buckets: hand off to the quote-loop pipeline ─────────
    // (2026-08-28 PM, per Keenan.) The quote function generates its own
    // concept, creates its own post (format=AMBIENT, lane=quote-*),
    // builds the mathematically-seamless 12-18s loop, and emails it.
    if (bucket === "quote-women" || bucket === "quote-men") {
      const audience = bucket === "quote-women" ? "women" : "men";
      await step.run("enqueue-quote-loop", async () => {
        await inngest.send({
          name: "content-factory/quote.loop",
          data: { audience },
        });
      });
      return { generated: 0, bucket, delegated: "quote.loop" };
    }

    // ── MOODY-FAMILY buckets: dark centered-text carousels ─────────
    // (2026-08-28, per Keenan — cloned from the "TRUST THE PROCESS"
    // reference; expanded same day with memento + questions, then rules
    // + missed + forbidden replacing the old negative/positive/selfie
    // lanes.) Every remaining bucket is a moody-family carousel: cover
    // + 5 item slides, dim cinematic photography, white text centered
    // mid-frame, hashtag-only caption. All are audience-growth funnels —
    // no product CTA anywhere.
    // - moody-women/moody-men: numbered discipline items per funnel.
    // - rules: women's numbered first-person quiet rebellions.
    // - memento: universal time-math slides, NO number headers.
    // - missed: universal near-miss connection math, NO headers.
    // - questions: women's funnel, ONE big question per slide.
    // - forbidden: women's funnel, ONE forbidden truth per slide.

    // Visual DNA per lane: men = stark architecture; universal lanes
    // (memento/missed) = vast contemplative dark cinematics; the rest
    // (women funnels) = warm-dim quiet luxury.
    const imageAudience: "women" | "men" | "universal" =
      bucket === "moody-men"
        ? "men"
        : bucket === "memento" || bucket === "missed"
          ? "universal"
          : "women";
    // Discipline lanes and rules prefix items with "N. Name." like the
    // reference; the math lanes' numbers ARE the content and the
    // single-line lanes carry no header.
    const numbered =
      bucket === "moody-women" || bucket === "moody-men" || bucket === "rules";
    // Single-line lanes render in the bigger premium QUOTE serif italic;
    // multi-paragraph lanes use ITEM.
    const itemKind =
      bucket === "questions" || bucket === "forbidden"
        ? ("QUOTE" as const)
        : ("ITEM" as const);

    const moody = await step.run("generate-moody-topic", async () => {
      const { prisma } = await import("@/lib/prisma");
      const {
        generateMoodyTopic,
        generateMementoTopic,
        generateQuestionsTopic,
        generateRulesTopic,
        generateMissedTopic,
        generateForbiddenTopic,
      } = await import("@/lib/content-factory/moody-carousel");
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
      const recent = await prisma.carouselPost.findMany({
        where: { generatedFor: { gte: thirtyDaysAgo }, lane: bucket },
        select: { headline: true },
      });
      const headlines = recent.map((p) => p.headline);
      if (bucket === "memento") return generateMementoTopic(headlines);
      if (bucket === "questions") return generateQuestionsTopic(headlines);
      if (bucket === "rules") return generateRulesTopic(headlines);
      if (bucket === "missed") return generateMissedTopic(headlines);
      if (bucket === "forbidden") return generateForbiddenTopic(headlines);
      return generateMoodyTopic(
        bucket === "moody-women" ? "women" : "men",
        headlines
      );
    });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dateStr = today.toISOString().slice(0, 10);
    const slug = moody.slug;
    logger.info(
      `[carousel-cron] Moody-family (${bucket}) topic: "${moody.title}" (${moody.items.length} items)`
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

      const prompt = buildMoodyImagePrompt(imageAudience, moody.coverScene);
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
        const paragraphs = numbered
          ? [`${i + 1}. ${item.name}`, ...item.lines]
          : item.lines;
        const prompt = buildMoodyImagePrompt(imageAudience, item.scene);
        const rawBuffer = await generateImage(prompt);
        const overlay = await renderMoodyTextOverlay(paragraphs, itemKind);
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
      const { buildMoodyCaption, buildMementoCaption, buildMissedCaption } =
        await import("@/lib/content-factory/moody-carousel");
      const { extractHashtags } = await import(
        "@/lib/content-factory/carousel-generate"
      );

      // Hashtag-only caption cloned from the reference (2026-08-28,
      // per Keenan — the moody-family exception to the question+tags
      // rule). Universal lanes get their own pools; the women's lanes
      // (moody-women/rules/questions/forbidden) share the women's pool.
      const caption =
        bucket === "memento"
          ? buildMementoCaption(slug)
          : bucket === "missed"
            ? buildMissedCaption(slug)
            : buildMoodyCaption(bucket === "moody-men" ? "men" : "women", slug);

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
      `[carousel-cron] Generated moody-family (${bucket}) "${moody.title}": ${moodyResult.slideCount} slides`
    );
    return { generated: 1, bucket, ...moodyResult };
  }
);
