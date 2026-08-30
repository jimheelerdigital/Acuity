import { inngest } from "@/inngest/client";

/**
 * Carousel generation — 11 lanes, ALL generated overnight so every post
 * is in Keenan's inbox by 7am Central (2026-08-28 night, per Keenan:
 * "I want ALL posts to be in my inbox in the morning"). The cron fires
 * hourly 5-10 UTC (12am-5am CDT; one hour later in winter CST) and each
 * run FANS OUT this hour's lanes as events — generation itself always
 * runs on the event trigger.
 *
 * Kill history (never revive without asking): animated quote loop
 * (2026-08-28 night, replaced by SIGN), AMBIENT calm video (same late
 * night, "get rid of the calm video"), and — 2026-08-29 — LATE
 * BLOOMERS, UNSENT TEXTS, WHAT ___ TAUGHT ME, FORBIDDEN TRUTHS, and
 * MISSED CONNECTIONS (both missed and missed-men, "get rid of missed
 * connections on both pipelines"). Same 2026-08-29 directive locked the
 * two visual identities: Ripple = aesthetically pleasing FEMININE
 * (soft, silk/candlelight/flowers, warm-dim), BWK = male-dominant dark
 * themes, highly motivational.
 *
 * Overnight schedule (CDT):
 * -  5 UTC (12am): MOODY-WOMEN + MOODY-MEN — the numbered discipline
 *                  carousels (men = BWK)
 * -  6 UTC (1am):  MEMENTO — women's time-math (Ripple)
 *                  + MEMENTO-MEN — men's time-math (BWK)
 * -  7 UTC (2am):  RULES — "Rules I broke to get my life back" (women)
 *                  + QUESTIONS — women's hard questions
 * -  8 UTC (3am):  YEAR — "ONE YEAR FROM NOW" discipline time-math
 *                  (men, BWK) + BEHIND — "YOU'RE NOT BEHIND" timeline
 *                  lies (men, BWK, numbered)
 * -  9 UTC (4am):  SIGN — single static bold "THIS IS YOUR SIGN TO..."
 *                  image (women) + FREE — "THINGS THAT ARE STILL FREE"
 *                  (women/Ripple, numbered)
 * - 10 UTC (5am):  NOBODY — "NOBODY TELLS YOU ABOUT ___" (women,
 *                  rotating season)
 *
 * Manual/test trigger (admin): event "content-factory/daily.generate"
 * with data.bucket set to any lane name above.
 *
 * Every email subject leads with the TikTok account the post belongs
 * to: [BUILD WITH KEY] for moody-men / memento-men / year / behind,
 * [RIPPLE] for everything else (handled in lib/content-factory/
 * email.ts, keyed off post.lane).
 */
const CAROUSEL_LANES = [
  "rules",
  "moody-women",
  "moody-men",
  "memento",
  "memento-men",
  "questions",
  "sign",
  "year",
  "free",
  "behind",
  "nobody",
] as const;
type DailyBucket = (typeof CAROUSEL_LANES)[number];

/** Which lanes each overnight cron hour fans out (UTC hour). */
const HOUR_LANES: Record<number, DailyBucket[]> = {
  5: ["moody-women", "moody-men"],
  6: ["memento", "memento-men"],
  7: ["rules", "questions"],
  8: ["year", "behind"],
  9: ["sign", "free"],
  10: ["nobody"],
};

export const carouselDailyCronFn = inngest.createFunction(
  {
    id: "carousel-daily-cron",
    name: "Content Factory — Daily Carousel Generation",
    triggers: [
      { cron: "0 5,6,7,8,9,10 * * *" },
      // Generation trigger (cron fan-out + admin generate actions).
      { event: "content-factory/daily.generate" },
    ],
    retries: 1,
  },
  async ({ event, step, logger }) => {
    // ── CRON runs only DISPATCH: fan out this hour's two lanes ─────
    // (2026-08-28 night.) Generation always happens on the event
    // trigger so the two lanes run as parallel, independently-retried
    // Inngest runs and the whole night finishes by ~6:30am Central.
    if (event?.name !== "content-factory/daily.generate") {
      const ts = typeof event?.ts === "number" ? event.ts : Date.now();
      const hour = new Date(ts).getUTCHours();
      const lanes = HOUR_LANES[hour] ?? [];
      if (lanes.length === 0) {
        logger.warn(`[carousel-cron] No lanes mapped for hour ${hour} UTC`);
        return { generated: 0, dispatched: [] };
      }
      await step.run("dispatch-hour-lanes", async () => {
        await inngest.send(
          lanes.map((lane) => ({
            name: "content-factory/daily.generate" as const,
            data: { bucket: lane },
          }))
        );
      });
      logger.info(`[carousel-cron] Dispatched: ${lanes.join(", ")}`);
      return { generated: 0, dispatched: lanes };
    }

    // ── Resolve the bucket (event runs) ────────────────────────────
    const b = event.data?.bucket as string | undefined;
    const bucket: DailyBucket = (CAROUSEL_LANES as readonly string[]).includes(
      b ?? ""
    )
      ? (b as DailyBucket)
      : "rules";
    logger.info(`[carousel-cron] Bucket: ${bucket}`);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dateStr = today.toISOString().slice(0, 10);

    // ── SIGN bucket: single static image, ONE bold line ────────────
    // (2026-08-28 night, per Keenan — replaces the animated quote
    // loop. "static image post but no fancy italics. bold, confident
    // lettering.") One dark scene + one "THIS IS YOUR SIGN TO..."
    // line rendered in the bold COVER treatment.
    if (bucket === "sign") {
      const sign = await step.run("generate-sign-topic", async () => {
        const { prisma } = await import("@/lib/prisma");
        const { generateSignTopic } = await import(
          "@/lib/content-factory/moody-carousel"
        );
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
        const recent = await prisma.carouselPost.findMany({
          where: { generatedFor: { gte: thirtyDaysAgo }, lane: "sign" },
          select: { headline: true },
        });
        return generateSignTopic(recent.map((p) => p.headline));
      });

      await step.run("ensure-bucket", async () => {
        const { ensureBucket } = await import(
          "@/lib/content-factory/carousel-generate"
        );
        await ensureBucket();
      });

      const signImage = await step.run("generate-sign-image", async () => {
        const { generateImage, uploadImage } = await import(
          "@/lib/content-factory/carousel-generate"
        );
        const { buildMoodyImagePrompt } = await import(
          "@/lib/content-factory/moody-carousel"
        );
        const { composeSlideWithOverlay, renderMoodyTextOverlay } =
          await import("@/lib/content-factory/compose");
        const prompt = buildMoodyImagePrompt("women", sign.scene);
        const rawBuffer = await generateImage(prompt);
        const overlay = await renderMoodyTextOverlay([sign.line], "SIGN");
        const composed = await composeSlideWithOverlay(rawBuffer, overlay);
        const imageUrl = await uploadImage(
          composed,
          `carousels/${dateStr}/${sign.slug}/slide-0-cover.jpg`
        );
        return { imageUrl, imagePrompt: prompt };
      });

      const signResult = await step.run("save-and-email-sign", async () => {
        const { prisma } = await import("@/lib/prisma");
        const { buildMoodyCaption } = await import(
          "@/lib/content-factory/moody-carousel"
        );
        const { extractHashtags } = await import(
          "@/lib/content-factory/carousel-generate"
        );
        const caption = buildMoodyCaption("women", sign.slug);
        const post = await prisma.carouselPost.create({
          data: {
            topicSlug: sign.slug,
            headline: sign.line,
            status: "DRAFT",
            format: "PHOTO",
            caption,
            hashtags: extractHashtags(caption),
            generatedFor: today,
            lane: "sign",
            slides: {
              create: [
                {
                  order: 0,
                  kind: "COVER" as const,
                  overlayText: sign.line,
                  imagePrompt: signImage.imagePrompt,
                  imageUrl: signImage.imageUrl,
                },
              ],
            },
          },
        });
        const { sendCarouselEmail } = await import(
          "@/lib/content-factory/email"
        );
        await sendCarouselEmail(post.id);
        return { postId: post.id, slideCount: 1, estimatedCostCents: 10 };
      });

      logger.info(`[carousel-cron] Generated sign image: "${sign.line}"`);
      return { generated: 1, bucket, ...signResult };
    }

    // ── MOODY-FAMILY buckets: dark centered-text carousels ─────────
    // (2026-08-28, per Keenan — cloned from the "TRUST THE PROCESS"
    // reference and expanded lane by lane until the whole daily
    // rotation is the moody visual DNA.) Every remaining bucket is a
    // moody-family carousel: cover + 5 item slides, dim cinematic
    // photography, white text centered mid-frame, hashtag-only
    // caption. All are audience-growth funnels — no product CTA.

    // Visual DNA per lane (2026-08-29, per Keenan): BWK men's lanes =
    // male-dominant dark power imagery; EVERY Ripple lane = soft
    // aesthetically-pleasing feminine photography.
    const imageAudience: "women" | "men" =
      bucket === "moody-men" ||
      bucket === "memento-men" ||
      bucket === "year" ||
      bucket === "behind"
        ? "men"
        : "women";
    // Lanes whose items carry an "N. Name." header (discipline, rules,
    // free things, timeline lies).
    const numbered =
      bucket === "moody-women" ||
      bucket === "moody-men" ||
      bucket === "rules" ||
      bucket === "free" ||
      bucket === "behind";
    // Every lane's item slides render in the same ITEM style
    // (2026-08-30, per Keenan: "get rid of the italicized ripple
    // characters. make everything consistent" — the Playfair QUOTE
    // serif italic is dead; questions now match every other lane).
    const itemKind = "ITEM" as const;

    const moody = await step.run("generate-moody-topic", async () => {
      const { prisma } = await import("@/lib/prisma");
      const {
        generateMoodyTopic,
        generateMementoTopic,
        generateQuestionsTopic,
        generateRulesTopic,
        generateYearTopic,
        generateFreeTopic,
        generateBehindTopic,
        generateNobodyTopic,
      } = await import("@/lib/content-factory/moody-carousel");
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
      const recent = await prisma.carouselPost.findMany({
        where: { generatedFor: { gte: thirtyDaysAgo }, lane: bucket },
        select: { headline: true },
      });
      const headlines = recent.map((p) => p.headline);
      if (bucket === "memento") return generateMementoTopic("women", headlines);
      if (bucket === "memento-men")
        return generateMementoTopic("men", headlines);
      if (bucket === "questions") return generateQuestionsTopic(headlines);
      if (bucket === "rules") return generateRulesTopic(headlines);
      if (bucket === "year") return generateYearTopic(headlines);
      if (bucket === "free") return generateFreeTopic(headlines);
      if (bucket === "behind") return generateBehindTopic(headlines);
      if (bucket === "nobody") return generateNobodyTopic(headlines);
      return generateMoodyTopic(
        bucket === "moody-women" ? "women" : "men",
        headlines
      );
    });

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
      const { buildMoodyCaption, buildMementoCaption, buildUniversalCaption } =
        await import("@/lib/content-factory/moody-carousel");
      const { extractHashtags } = await import(
        "@/lib/content-factory/carousel-generate"
      );

      // Hashtag-only caption cloned from the reference (2026-08-28,
      // per Keenan — the moody-family exception to the question+tags
      // rule). Memento lanes keep their niche pool regardless of
      // audience; FREE gets the universal pool; BWK men's lanes use
      // the men's pool; the women's lanes share the women's.
      const caption =
        bucket === "memento" || bucket === "memento-men"
          ? buildMementoCaption(slug)
          : bucket === "free"
            ? buildUniversalCaption(slug)
            : buildMoodyCaption(
                bucket === "moody-men" || bucket === "year" || bucket === "behind"
                  ? "men"
                  : "women",
                slug
              );

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
