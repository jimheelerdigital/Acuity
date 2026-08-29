import { inngest } from "@/inngest/client";

/**
 * Carousel generation — 16 lanes, ALL generated overnight so every post
 * is in Keenan's inbox by 7am Central (2026-08-28 night, per Keenan:
 * "I want ALL posts to be in my inbox in the morning"). The cron fires
 * hourly 4-11 UTC (11pm-6am CDT; one hour later in winter CST) and each
 * run FANS OUT two lanes as events — generation itself always runs on
 * the event trigger.
 *
 * The animated quote loop (quote-women / quote-men) was ELIMINATED the
 * same night, replaced by the static SIGN image post.
 *
 * Overnight schedule (CDT):
 * -  4 UTC (11pm): RULES — "Rules I broke to get my life back" (women)
 *                  + MISSED — universal missed-connection math
 * -  5 UTC (12am): AMBIENT — calm voiced video (carouselAmbientVideoFn)
 *                  + FORBIDDEN — "DELETE THIS AFTER READING" (women,
 *                  QUOTE serif one-liners)
 * -  6 UTC (1am):  MOODY-WOMEN + MOODY-MEN — the numbered discipline
 *                  carousels (men = BUILD WITH KEY account)
 * -  7 UTC (2am):  MEMENTO — universal time-math
 *                  + QUESTIONS — women's hard questions
 * -  8 UTC (3am):  BLOOMERS — real late-bloomer proof (universal,
 *                  numbered names) + TAUGHT — "WHAT ___ TAUGHT ME"
 *                  (women, rotating teacher)
 * -  9 UTC (4am):  SIGN — single static image, ONE bold "THIS IS YOUR
 *                  SIGN TO..." line (women; replaces the quote loop)
 *                  + YEAR — "ONE YEAR FROM NOW" forward time-math
 *                  (universal)
 * - 10 UTC (5am):  FREE — "THINGS THAT ARE STILL FREE" (universal,
 *                  numbered) + BEHIND — "YOU'RE NOT BEHIND" timeline
 *                  lies (women, numbered)
 * - 11 UTC (6am):  NOBODY — "NOBODY TELLS YOU ABOUT ___" (women,
 *                  rotating season) + UNSENT — deleted texts (women,
 *                  QUOTE serif one-liners)
 *
 * Manual/test trigger (admin): event "content-factory/daily.generate"
 * with data.bucket set to any lane name above.
 *
 * Every email subject leads with the TikTok account the post belongs
 * to: [BUILD WITH KEY] for moody-men, [RIPPLE] for everything else
 * (handled in lib/content-factory/email.ts, keyed off post.lane).
 */
const CAROUSEL_LANES = [
  "rules",
  "missed",
  "ambient",
  "forbidden",
  "moody-women",
  "moody-men",
  "memento",
  "questions",
  "bloomers",
  "taught",
  "sign",
  "year",
  "free",
  "behind",
  "nobody",
  "unsent",
] as const;
type DailyBucket = (typeof CAROUSEL_LANES)[number];

/** Which two lanes each overnight cron hour fans out (UTC hour). */
const HOUR_LANES: Record<number, DailyBucket[]> = {
  4: ["rules", "missed"],
  5: ["ambient", "forbidden"],
  6: ["moody-women", "moody-men"],
  7: ["memento", "questions"],
  8: ["bloomers", "taught"],
  9: ["sign", "year"],
  10: ["free", "behind"],
  11: ["nobody", "unsent"],
};

export const carouselDailyCronFn = inngest.createFunction(
  {
    id: "carousel-daily-cron",
    name: "Content Factory — Daily Carousel Generation",
    triggers: [
      { cron: "0 4,5,6,7,8,9,10,11 * * *" },
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

    // ── AMBIENT bucket: hand off to the calm-video pipeline ────────
    // The ambient function generates its own concept, creates its own
    // CarouselPost (format=AMBIENT), and emails the result.
    if (bucket === "ambient") {
      await step.run("enqueue-ambient-video", async () => {
        await inngest.send({ name: "content-factory/ambient.video", data: {} });
      });
      return { generated: 0, bucket, delegated: "ambient.video" };
    }

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

    // Visual DNA per lane: men = stark architecture; universal lanes =
    // vast contemplative dark cinematics; the rest (women funnels) =
    // warm-dim quiet luxury.
    const imageAudience: "women" | "men" | "universal" =
      bucket === "moody-men"
        ? "men"
        : bucket === "memento" ||
            bucket === "missed" ||
            bucket === "bloomers" ||
            bucket === "year" ||
            bucket === "free"
          ? "universal"
          : "women";
    // Lanes whose items carry an "N. Name." header (discipline, rules,
    // bloomer names, free things, timeline lies).
    const numbered =
      bucket === "moody-women" ||
      bucket === "moody-men" ||
      bucket === "rules" ||
      bucket === "bloomers" ||
      bucket === "free" ||
      bucket === "behind";
    // Single-line lanes render in the bigger premium QUOTE serif
    // italic; multi-paragraph lanes use ITEM.
    const itemKind =
      bucket === "questions" || bucket === "forbidden" || bucket === "unsent"
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
        generateBloomersTopic,
        generateTaughtTopic,
        generateYearTopic,
        generateFreeTopic,
        generateBehindTopic,
        generateNobodyTopic,
        generateUnsentTopic,
      } = await import("@/lib/content-factory/moody-carousel");
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
      const recent = await prisma.carouselPost.findMany({
        where: { generatedFor: { gte: thirtyDaysAgo }, lane: bucket },
        select: {
          headline: true,
          // Bloomers dedupes on PEOPLE, not titles — the slide headers
          // carry the names ("1. Vera Wang.").
          ...(bucket === "bloomers"
            ? { slides: { select: { overlayText: true } } }
            : {}),
        },
      });
      const headlines = recent.map((p) => p.headline);
      if (bucket === "memento") return generateMementoTopic(headlines);
      if (bucket === "questions") return generateQuestionsTopic(headlines);
      if (bucket === "rules") return generateRulesTopic(headlines);
      if (bucket === "missed") return generateMissedTopic(headlines);
      if (bucket === "forbidden") return generateForbiddenTopic(headlines);
      if (bucket === "bloomers") {
        const usedNames = recent.flatMap((p) =>
          ((p as { slides?: { overlayText: string }[] }).slides ?? [])
            .map((s) => s.overlayText.split("\n")[0]?.trim() ?? "")
            .filter((l) => /^\d+\.\s/.test(l))
            .map((l) => l.replace(/^\d+\.\s*/, ""))
        );
        return generateBloomersTopic([...headlines, ...usedNames]);
      }
      if (bucket === "taught") return generateTaughtTopic(headlines);
      if (bucket === "year") return generateYearTopic(headlines);
      if (bucket === "free") return generateFreeTopic(headlines);
      if (bucket === "behind") return generateBehindTopic(headlines);
      if (bucket === "nobody") return generateNobodyTopic(headlines);
      if (bucket === "unsent") return generateUnsentTopic(headlines);
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
      const {
        buildMoodyCaption,
        buildMementoCaption,
        buildMissedCaption,
        buildUniversalCaption,
      } = await import("@/lib/content-factory/moody-carousel");
      const { extractHashtags } = await import(
        "@/lib/content-factory/carousel-generate"
      );

      // Hashtag-only caption cloned from the reference (2026-08-28,
      // per Keenan — the moody-family exception to the question+tags
      // rule). Universal lanes get universal pools; the women's lanes
      // share the women's pool; moody-men keeps the men's pool.
      const caption =
        bucket === "memento"
          ? buildMementoCaption(slug)
          : bucket === "missed"
            ? buildMissedCaption(slug)
            : bucket === "bloomers" || bucket === "year" || bucket === "free"
              ? buildUniversalCaption(slug)
              : buildMoodyCaption(
                  bucket === "moody-men" ? "men" : "women",
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
