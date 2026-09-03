import { inngest } from "@/inngest/client";

/**
 * Carousel generation — 9 lanes, ALL generated overnight so every post
 * is in Keenan's inbox by 7am Central (2026-08-28 night, per Keenan:
 * "I want ALL posts to be in my inbox in the morning"). The cron fires
 * hourly 5-8 UTC (12am-3am CDT; one hour later in winter CST) and each
 * run FANS OUT this hour's lanes as events — generation itself always
 * runs on the event trigger.
 *
 * Kill history (never revive without asking): animated quote loop
 * (2026-08-28 night, replaced by SIGN), AMBIENT calm video (same late
 * night); 2026-08-29 — LATE BLOOMERS, UNSENT TEXTS, WHAT ___ TAUGHT
 * ME, FORBIDDEN TRUTHS, MISSED CONNECTIONS (both); 2026-08-30 — RULES
 * ("get rid of the 'rules i let go of'"), MEMENTO women ("...and the
 * 'finite act now' ripple posts"), MOODY-WOMEN ("also get rid of
 * the 'hold your own'"), and — later the same day — SIGN and BEHIND
 * ("get rid of the 'this is your sign to' and 'someone elses
 * schedule'"). Generators stay dormant in moody-carousel.ts;
 * recomposeSlide keeps both lanes for editing historical posts.
 * 2026-08-31 — VERSIONS ("get rid of the 'two people' post" — the
 * "SAME DAY. TWO MEN." contrast carousel), and the AVATAR PERSONA is
 * RETIRED across all lanes ("you put the avatar into literally every
 * single post... get rid of the avatar across the field") — then
 * REVIVED the same day behind a hard cap ("you can include it in
 * 5-10% of generated posts, max"): one AVATAR_POST_PROBABILITY roll
 * per BWK post; a winning post gets the avatar on exactly one slide.
 * Lone-man SCENES render a generic figure everywhere else.
 *
 * 2026-08-31 — VARIANCE PASS (per Keenan: "we need more variation
 * across all different posts... create a ton of variance between
 * posts and image generations while keeping the theme intact"):
 * widened scene families in every lane (night-vantage penthouse
 * skylines, brutalist-coastal cliff houses — from his two TRUST THE
 * PROCESS references), "inspiration not a menu" directives, a
 * vantage-variance line in buildMoodyImagePrompt, a strengthened
 * substance-level avoid-list, and randomized slide counts on the
 * fixed-5 lanes (moody/year 4-7, questions/free/nobody 4-6).
 *
 * Visual identities (2026-08-29, RETUNED 2026-08-30): Ripple =
 * aesthetically pleasing FEMININE in LIGHT, airy schemes ("make the
 * ripple posts be lighter schemes") — bright cream/ivory scenes with
 * DARK charcoal text. BWK = male-dominant dark themes, highly
 * motivational — dim scenes, white text.
 *
 * 2026-08-30 additions (per Keenan: "add aura and two versions and 30
 * days"): AURA (single image, one bold line, lone man mid-element)
 * and PROTOCOL ("DO THIS FOR 30 DAYS" numbered save-bait) — VERSIONS
 * died 2026-08-31, see kill history. All BWK. Also 2026-08-30 (per
 * Keenan: "add the selfie
 * carousel back to the ripple pipeline"): the SELFIE slideshow —
 * killed 2026-08-28 — is revived unchanged (mirror-selfie cover with
 * phone over her face, identity anchored on the previous post's
 * text-free raw, aesthetic POV step slides, sticker captions).
 *
 * 2026-09-01 lane changes (per Keenan): AURA killed ("get rid of the
 * 'finish what they laughed at' post type where it's just one picture
 * generation") — generator dormant in moody-carousel.ts for historical
 * posts. MEMENTO (women, "DO THE MATH" life-math) and FORBIDDEN
 * ("DELETE THIS AFTER READING") revived INTO Ripple as LIGHT lanes
 * ("add the 'do the math' / less time than you think back to ripple...
 * add memento mori posts back to ripple and the delete after reading
 * posts back to ripple").
 *
 * 2026-09-03 — WINNER-FOCUSED RESTRUCTURE (per Keenan: "we're cutting
 * social posting to 3x/day for BWK and 4x/day for Ripple... focus
 * around these topics and images for the inital posts. still include
 * variance."). Every lane is now anchored on a post that already
 * performed:
 * - BWK: MOODY-MEN theme-locked to the SILENCE family ("earn your
 *   silence"), new LINE lane = HOLD THE LINE family with
 *   storm-skyscraper covers, PROTOCOL unchanged ("30 days. earn it."
 *   was already the winner format). MEMENTO-MEN and YEAR go DORMANT.
 * - Ripple: SELFIE runs TWICE daily with per-post photography styles
 *   ("give me 2x of those per day with more variance and different
 *   picture styles"), QUESTIONS pinned dark with direct-prompt covers
 *   ("the 'answer honestly' post... go back to that style of
 *   imagery"), MEMENTO pinned dark with dusk-coast covers ("the 'do
 *   the math' piture of the beach... give me more of that"). FREE,
 *   NOBODY, FORBIDDEN go DORMANT — this supersedes the 50/50
 *   light/dark roll: live women scenery lanes PIN to dark (the
 *   winners were dark-era); the light machinery stays implemented.
 * - NEW phone-quote lane pair, added ON TOP of the caps ("add a lane
 *   for both of these types of posts. one for ripple, one for BWK"):
 *   2 slides — photo cover with a sentence-case hook ("this quote
 *   kept me up all night...") + a programmatically-composed notes-app
 *   quote screen. Total: BWK 4/day, Ripple 5/day.
 *
 * Overnight schedule (CDT):
 * -  5 UTC (12am): MOODY-MEN — SILENCE-family discipline carousel
 *                  (BWK) + SELFIE #1 (Ripple)
 * -  6 UTC (1am):  LINE — HOLD THE LINE carousel, storm-skyscraper
 *                  cover (BWK) + QUESTIONS — hard questions, dark
 *                  (Ripple) + PHONE-QUOTE (Ripple, 2 slides)
 * -  7 UTC (2am):  PROTOCOL — "DO THIS FOR 30 DAYS" (BWK) + SELFIE
 *                  #2 (Ripple) + PHONE-QUOTE-MEN (BWK, 2 slides)
 * -  8 UTC (3am):  MEMENTO — women's "DO THE MATH" life-math, dark
 *                  dusk-coast cover (Ripple, 4-10 slides)
 *
 * Manual/test trigger (admin): event "content-factory/daily.generate"
 * with data.bucket set to any lane name above.
 *
 * Every email subject leads with the TikTok account the post belongs
 * to: [BUILD WITH KEY] for moody-men / line / protocol /
 * phone-quote-men, [RIPPLE] for everything else (handled in
 * lib/content-factory/email.ts, keyed off post.lane).
 */
const CAROUSEL_LANES = [
  "moody-men",
  "line",
  "protocol",
  "questions",
  "memento",
  "selfie",
  "phone-quote",
  "phone-quote-men",
] as const;
type DailyBucket = (typeof CAROUSEL_LANES)[number];

/** Which lanes each overnight cron hour fans out (UTC hour). Selfie
 *  appears twice on purpose (2026-09-03: "give me 2x of those per
 *  day"). */
const HOUR_LANES: Record<number, DailyBucket[]> = {
  5: ["moody-men", "selfie"],
  6: ["line", "questions", "phone-quote"],
  7: ["protocol", "selfie", "phone-quote-men"],
  8: ["memento"],
};

/**
 * Keenan-avatar frequency cap (2026-08-31, per Keenan: "you can
 * include it in 5-10% of generated posts, max"). One random roll per
 * BWK post — when it wins, the COVER is generated with the avatar
 * reference. HISTORY: the first avatar rollout gated on scene text and
 * hit ~every post; then 2026-09-01 the base prompt's standing lone-man
 * allowance put a GENERIC man in ~every image even with the reference
 * gated. BWK scenes are now people-free by default and a man appears
 * ONLY via this roll. The frequency gate must stay this explicit
 * probability, never a scene-text regex.
 */
const AVATAR_POST_PROBABILITY = 0.08;

export const carouselDailyCronFn = inngest.createFunction(
  {
    id: "carousel-daily-cron",
    name: "Content Factory — Daily Carousel Generation",
    triggers: [
      { cron: "0 5,6,7,8 * * *" },
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
      : "questions";
    logger.info(`[carousel-cron] Bucket: ${bucket}`);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dateStr = today.toISOString().slice(0, 10);

    // ── SELFIE bucket: realistic first-person photo slideshow ──────
    // 2026-08-25, per Keenan; 2026-08-28: ONE selfie per slideshow;
    // killed 2026-08-28, REVIVED 2026-08-30 ("add the selfie carousel
    // back to the ripple pipeline") — branch restored verbatim from
    // pre-kill. Fully static (no animation): cover mirror selfie
    // (phone covering her face, slightly dirty mirror; same avatar,
    // identity anchored on a reference image) + 4-6 hyper-realistic
    // aesthetic POV step slides. Captions burned onto every image in
    // TikTok sticker style. Emails immediately (no animation).
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

        const {
          SELFIE_POSE_VARIANTS,
          SELFIE_COVER_POSE_COUNT,
          SELFIE_STYLE_VARIANTS,
        } = await import("@/lib/content-factory/brand");
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
          // Photography style: per-POST (slug-deterministic like the
          // sticker color) so the day's two selfie posts read as
          // different days (2026-09-03, per Keenan: "more variance and
          // different picture styles").
          style:
            SELFIE_STYLE_VARIANTS[
              Math.abs(poseHash) % SELFIE_STYLE_VARIANTS.length
            ],
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

          const {
            SELFIE_POSE_VARIANTS,
            SELFIE_COVER_POSE_COUNT,
            SELFIE_STYLE_VARIANTS,
          } = await import("@/lib/content-factory/brand");
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
            // Same per-POST style as the cover — one camera roll, one day.
            style:
              SELFIE_STYLE_VARIANTS[
                Math.abs(poseHash) % SELFIE_STYLE_VARIANTS.length
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

    // ── PHONE-QUOTE buckets: 2-slide quote posts (2026-09-03) ──────
    // Per Keenan (with reference screenshots): "'this quote kept me up
    // all night...' first slide, and then the next slide is a phone
    // screen with a quote." Cover = photo + sentence-case hook
    // (rendered ITEM-style, never uppercase); slide 2 = the notes-app
    // screen composed programmatically by renderPhoneQuoteSlide — the
    // quote text never touches gpt-image-2, so it can't be misspelled.
    if (bucket === "phone-quote" || bucket === "phone-quote-men") {
      const variant = bucket === "phone-quote-men" ? "men" : "women";

      const pq = await step.run("generate-phone-quote-topic", async () => {
        const { prisma } = await import("@/lib/prisma");
        const { generatePhoneQuoteTopic } = await import(
          "@/lib/content-factory/moody-carousel"
        );
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
        const recent = await prisma.carouselPost.findMany({
          where: { generatedFor: { gte: thirtyDaysAgo }, lane: bucket },
          select: { headline: true },
        });
        return generatePhoneQuoteTopic(
          variant,
          recent.map((p) => p.headline)
        );
      });

      const slug = pq.slug;
      logger.info(`[carousel-cron] Phone-quote (${bucket}): "${pq.hook}"`);

      await step.run("ensure-bucket", async () => {
        const { ensureBucket } = await import(
          "@/lib/content-factory/carousel-generate"
        );
        await ensureBucket();
      });

      // Slide 0: photo cover with the sentence-case hook. Both funnels
      // shoot the DARK scheme (night interiors / night-city vantage) —
      // white text.
      const pqCover = await step.run("generate-phone-quote-cover", async () => {
        const { generateMoodyImage, uploadImage } = await import(
          "@/lib/content-factory/carousel-generate"
        );
        const { buildMoodyImagePrompt } = await import(
          "@/lib/content-factory/moody-carousel"
        );
        const { composeSlideWithOverlay, renderMoodyTextOverlay } =
          await import("@/lib/content-factory/compose");

        const { buffer: rawBuffer, prompt } = await generateMoodyImage(
          buildMoodyImagePrompt(variant, pq.coverScene, "dark"),
          false
        );
        const overlay = await renderMoodyTextOverlay([pq.hook], "ITEM", "white");
        const composed = await composeSlideWithOverlay(rawBuffer, overlay);
        const imageUrl = await uploadImage(
          composed,
          `carousels/${dateStr}/${slug}/slide-0-cover.jpg`
        );
        return { imageUrl, overlayText: pq.hook, imagePrompt: prompt };
      });

      // Slide 1: the notes-app quote screen — no image model.
      const pqQuote = await step.run("compose-phone-quote-screen", async () => {
        const { uploadImage } = await import(
          "@/lib/content-factory/carousel-generate"
        );
        const { renderPhoneQuoteSlide } = await import(
          "@/lib/content-factory/compose"
        );
        const composed = await renderPhoneQuoteSlide(pq.quote, variant);
        const imageUrl = await uploadImage(
          composed,
          `carousels/${dateStr}/${slug}/slide-1-quote.jpg`
        );
        // Marker prompt — recomposeSlide keys off the prefix to
        // re-render the screen instead of calling an image model.
        return {
          imageUrl,
          overlayText: pq.quote,
          imagePrompt: `PHONE-QUOTE NOTE SCREEN (${variant}) — composed programmatically by renderPhoneQuoteSlide; no image model involved.`,
        };
      });

      const pqResult = await step.run("save-and-email-phone-quote", async () => {
        const { prisma } = await import("@/lib/prisma");
        const { buildMoodyCaption } = await import(
          "@/lib/content-factory/moody-carousel"
        );
        const { extractHashtags } = await import(
          "@/lib/content-factory/carousel-generate"
        );

        const caption = buildMoodyCaption(variant, slug);
        const post = await prisma.carouselPost.create({
          data: {
            topicSlug: slug,
            headline: pq.hook,
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
                  overlayText: pqCover.overlayText,
                  imagePrompt: pqCover.imagePrompt,
                  imageUrl: pqCover.imageUrl,
                },
                {
                  order: 1,
                  kind: "REASON" as const,
                  overlayText: pqQuote.overlayText,
                  imagePrompt: pqQuote.imagePrompt,
                  imageUrl: pqQuote.imageUrl,
                },
              ],
            },
          },
        });

        const { sendCarouselEmail } = await import(
          "@/lib/content-factory/email"
        );
        await sendCarouselEmail(post.id);
        return { postId: post.id, slideCount: 2, estimatedCostCents: 8 + 2 };
      });

      logger.info(
        `[carousel-cron] Generated phone-quote (${bucket}) "${pq.hook}": 2 slides`
      );
      return { generated: 1, bucket, ...pqResult };
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
      bucket === "moody-men" || bucket === "line" || bucket === "protocol"
        ? "men"
        : "women";
    // Lanes whose items carry an "N. Name." header (discipline,
    // hold-the-line, protocol steps).
    const numbered =
      bucket === "moody-men" ||
      bucket === "line" ||
      bucket === "protocol";
    // Every lane's item slides render in the same ITEM style
    // (2026-08-30, per Keenan: "get rid of the italicized ripple
    // characters. make everything consistent" — the Playfair QUOTE
    // serif italic is dead; questions now match every other lane).
    const itemKind = "ITEM" as const;

    const moody = await step.run("generate-moody-topic", async () => {
      const { prisma } = await import("@/lib/prisma");
      const {
        generateMoodyTopic,
        generateLineTopic,
        generateMementoTopic,
        generateQuestionsTopic,
        generateProtocolTopic,
      } = await import("@/lib/content-factory/moody-carousel");
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
      const recent = await prisma.carouselPost.findMany({
        where: { generatedFor: { gte: thirtyDaysAgo }, lane: bucket },
        select: { headline: true },
      });
      const headlines = recent.map((p) => p.headline);

      // Ripple scheme: PINNED to "dark" (2026-09-03 — the winning
      // posts, ANSWER HONESTLY and DO THE MATH, were both dark-era;
      // supersedes the 2026-09-01 50/50 roll, whose light machinery
      // stays implemented and can be re-rolled later). BWK men's
      // lanes are always dark (scheme null).
      // (Widened cast: the pin makes this literally "dark" | null, but
      // downstream tone logic still handles "light" for a future
      // re-roll — keep the comparison legal.)
      const scheme = (imageAudience === "women" ? "dark" : null) as
        | "light"
        | "dark"
        | null;
      const topic =
        bucket === "memento"
          ? await generateMementoTopic("women", headlines, "dark")
          : bucket === "questions"
            ? await generateQuestionsTopic(headlines, "dark")
            : bucket === "line"
              ? await generateLineTopic(headlines)
              : bucket === "protocol"
                ? await generateProtocolTopic(headlines)
                : await generateMoodyTopic("men", headlines);

      // Keenan-avatar roll (2026-08-31: "5-10% of generated posts,
      // max"). One roll per BWK post; a winning post gets the avatar
      // on the COVER (scenes are people-free since 2026-09-01, so
      // there's no "slide that features a man" to pick — the exception
      // block in MOODY_AVATAR_PROMPT introduces him). Rolled INSIDE
      // this step so Inngest memoizes the result across replays.
      const avatarSlideIndex: number | null =
        imageAudience === "men" && Math.random() < AVATAR_POST_PROBABILITY
          ? 0
          : null;
      return { ...topic, avatarSlideIndex, scheme };
    });

    // Light scenes need dark charcoal text; dark scenes (BWK always,
    // Ripple on a "dark" roll) need white text.
    const textTone =
      moody.scheme === "light" ? ("dark" as const) : ("white" as const);

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
      const { generateMoodyImage, uploadImage } = await import(
        "@/lib/content-factory/carousel-generate"
      );
      const { buildMoodyImagePrompt } = await import(
        "@/lib/content-factory/moody-carousel"
      );
      const { composeSlideWithOverlay, renderMoodyTextOverlay } =
        await import("@/lib/content-factory/compose");

      // Avatar only when this post won the ≤8% roll AND the cover is
      // the chosen slide (2026-08-31 cap).
      const { buffer: rawBuffer, prompt } = await generateMoodyImage(
        buildMoodyImagePrompt(imageAudience, moody.coverScene, moody.scheme ?? "light"),
        moody.avatarSlideIndex === 0
      );
      const overlay = await renderMoodyTextOverlay(
        [moody.title],
        "COVER",
        textTone
      );
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
        const { generateMoodyImage, uploadImage } = await import(
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
        // Avatar only when this post won the ≤8% roll AND this is the
        // chosen slide (2026-08-31 cap).
        const { buffer: rawBuffer, prompt } = await generateMoodyImage(
          buildMoodyImagePrompt(imageAudience, item.scene, moody.scheme ?? "light"),
          moody.avatarSlideIndex === i + 1
        );
        const overlay = await renderMoodyTextOverlay(
          paragraphs,
          itemKind,
          textTone
        );
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
      // per Keenan — the moody-family exception to the question+tags
      // rule). BWK men's lanes use the men's pool; the women's lanes
      // share the women's. (The memento/universal niche pools went
      // dormant with their lanes, 2026-09-03.)
      const caption = buildMoodyCaption(imageAudience, slug);

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
