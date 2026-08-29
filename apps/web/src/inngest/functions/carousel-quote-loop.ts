import { inngest } from "@/inngest/client";

/**
 * QUOTE LOOP video — event "content-factory/quote.loop" (2026-08-28 PM,
 * per Keenan: "literally none of the stuff we're doing right now is
 * working so it's worth exploring other options... must actually loop,
 * use a better model of higgsfield if needed").
 *
 * One devastating line burned on a dark cinematic scene that loops with
 * no visible start or end. Runs daily on BOTH moody funnels — women at
 * 18 UTC, men at 19 UTC (data.audience selects the funnel).
 *
 * Pipeline: Claude writes the quote + a single-motion moody scene →
 * gpt-image-2 renders the dark text-free 9:16 photograph → Higgsfield
 * animates it (model override HIGGSFIELD_QUOTE_VIDEO_MODEL, clip
 * default 10s, 2 attempts — the 2nd drops to 5s in case the model
 * rejects long durations) → seamlessLoopWithOverlay builds a
 * MATHEMATICALLY perfect loop (self-xfade + trim: first frame ==
 * last frame by construction), burns the quote in the same encode, and
 * stream-copy concatenates to 12-18s → storyVideoUrl persisted →
 * emailed (🖤 subject, silent by design — Keenan adds trending audio).
 *
 * Caption: hashtag-only from the funnel's moody pool (the moody-family
 * exception to the question+tags rule).
 */
export const carouselQuoteLoopFn = inngest.createFunction(
  {
    id: "carousel-quote-loop",
    name: "Content Factory — Quote Loop Video",
    retries: 1,
    concurrency: { limit: 1 },
    triggers: [{ event: "content-factory/quote.loop" }],
  },
  async ({ event, step, logger }) => {
    const audience: "women" | "men" =
      event.data?.audience === "men" ? "men" : "women";
    const lane = `quote-${audience}`;

    // ── Step 0: config check ──────────────────────────────────────────
    const { higgsfieldOk } = await step.run("check-config", async () => {
      const { higgsfieldConfigured } = await import(
        "@/lib/content-factory/animate-cover"
      );
      return { higgsfieldOk: higgsfieldConfigured() };
    });
    if (!higgsfieldOk) {
      logger.warn(`[quote-loop] Higgsfield not configured — skipping`);
      return { quoteLoop: false, reason: "higgsfield not configured" };
    }

    // ── Step 1: avoid list — this funnel's recent quotes + themes ─────
    const seed = await step.run("load-seed", async () => {
      const { prisma } = await import("@/lib/prisma");
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
      const recent = await prisma.carouselPost.findMany({
        where: { generatedFor: { gte: thirtyDaysAgo }, lane },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { headline: true, storyTheme: true },
      });
      return {
        avoid: [
          ...recent.map((r) => r.storyTheme).filter((t): t is string => Boolean(t)),
          ...recent.map((r) => r.headline),
        ],
      };
    });

    // ── Step 2: the quote + single-motion scene ───────────────────────
    const concept = await step.run("write-concept", async () => {
      const { generateQuoteConcept } = await import(
        "@/lib/content-factory/quote-loop"
      );
      return generateQuoteConcept(audience, seed.avoid);
    });

    // ── Step 3: create the post row ───────────────────────────────────
    const post = await step.run("create-post", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { buildMoodyCaption } = await import(
        "@/lib/content-factory/moody-carousel"
      );
      const { extractHashtags } = await import(
        "@/lib/content-factory/carousel-generate"
      );
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const caption = buildMoodyCaption(audience, concept.slug);
      const created = await prisma.carouselPost.create({
        data: {
          topicSlug: concept.slug,
          headline: concept.quote,
          status: "DRAFT",
          // AMBIENT format (it IS a single-scene looped video); the
          // "quote-women"/"quote-men" lane marks the sub-format — no
          // schema change needed.
          format: "AMBIENT",
          caption,
          hashtags: extractHashtags(caption),
          generatedFor: today,
          lane,
          storyTheme: concept.theme,
        },
      });
      return {
        postId: created.id,
        dateStr: today.toISOString().slice(0, 10),
      };
    });
    const postId = post.postId;
    const basePath = `carousels/${post.dateStr}/${concept.slug}`;

    // ── Step 4: the dark scene image (text-free — quote burns later) ──
    const imageUrl = await step.run("quote-image", async () => {
      const { buildMoodyImagePrompt } = await import(
        "@/lib/content-factory/moody-carousel"
      );
      const { generateImage, uploadImage } = await import(
        "@/lib/content-factory/carousel-generate"
      );
      const { composeSlide } = await import("@/lib/content-factory/compose");
      const prompt = buildMoodyImagePrompt(audience, concept.scene);
      const raw = await generateImage(prompt);
      // Frame to exact 1080x1920, no text — the quote is burned onto the
      // VIDEO by ffmpeg so it stays razor-sharp through the loop encode.
      const framed = await composeSlide(raw, "", "COVER");
      const url = await uploadImage(framed, `${basePath}/quote-scene.jpg`);
      const { prisma } = await import("@/lib/prisma");
      await prisma.carouselSlide.create({
        data: {
          carouselPostId: postId,
          order: 0,
          kind: "COVER",
          overlayText: concept.quote,
          imagePrompt: prompt,
          imageUrl: url,
        },
      });
      return url;
    });

    // ── Step 5: animate it (2 attempts; 2nd drops to 5s) ──────────────
    let clipUrl: string | null = null;
    const MAX_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !clipUrl; attempt++) {
      const requestId = await step.run(`submit-clip-a${attempt}`, async () => {
        try {
          const { submitCoverVideo } = await import(
            "@/lib/content-factory/animate-cover"
          );
          const { buildQuoteVideoPrompt, quoteClipDuration, quoteVideoModel } =
            await import("@/lib/content-factory/quote-loop");
          return await submitCoverVideo({
            startImageUrl: imageUrl,
            prompt: buildQuoteVideoPrompt(concept),
            // If the model rejects the long clip, attempt 2 retries at
            // the proven 5s ambient length.
            duration: attempt === 1 ? quoteClipDuration() : 5,
            model: quoteVideoModel(),
          });
        } catch (err) {
          console.error(
            `[quote-loop] Clip submit failed (attempt ${attempt}): ${err instanceof Error ? err.message : err}`
          );
          return null;
        }
      });
      if (!requestId) continue;

      await step.sleep(`initial-render-wait-a${attempt}`, "2m");

      let cdnUrl: string | null = null;
      const maxPolls = attempt === 1 ? 24 : 16;
      for (let p = 0; p < maxPolls && !cdnUrl; p++) {
        const check = await step.run(`poll-clip-a${attempt}-${p}`, async () => {
          try {
            const { checkCoverVideo } = await import(
              "@/lib/content-factory/animate-cover"
            );
            return await checkCoverVideo(requestId);
          } catch {
            return { status: "in_progress", videoUrl: null };
          }
        });
        if (check.status === "completed" && check.videoUrl) {
          cdnUrl = check.videoUrl;
        } else if (check.status === "failed" || check.status === "nsfw") {
          logger.error(
            `[quote-loop] Higgsfield clip ended: ${check.status} (post ${postId}, attempt ${attempt})`
          );
          break;
        } else {
          await step.sleep(`poll-wait-a${attempt}-${p}`, "30s");
        }
      }
      if (!cdnUrl) continue;

      clipUrl = await step.run(`store-clip-a${attempt}`, async () => {
        try {
          const { uploadImage } = await import(
            "@/lib/content-factory/carousel-generate"
          );
          const res = await fetch(cdnUrl!);
          if (!res.ok) throw new Error(`clip download failed (${res.status})`);
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length < 100_000) {
            throw new Error(`clip is only ${buf.length} bytes — refusing to store`);
          }
          return await uploadImage(buf, `${basePath}/quote-clip.mp4`, "video/mp4");
        } catch (err) {
          console.error(
            `[quote-loop] Store failed: ${err instanceof Error ? err.message : err}`
          );
          return null;
        }
      });
    }
    if (!clipUrl) {
      logger.error(
        `[quote-loop] No clip rendered for post ${postId} — image saved, no video`
      );
      return { quoteLoop: false, postId, reason: "clip never rendered" };
    }

    // ── Step 6: perfect loop + burn the quote, in one encode ──────────
    const finalized = await step.run("loop-and-burn", async () => {
      const { seamlessLoopWithOverlay, probeMediaDuration } = await import(
        "@/lib/content-factory/story-video"
      );
      const { renderMoodyTextOverlay } = await import(
        "@/lib/content-factory/compose"
      );
      const { uploadImage } = await import(
        "@/lib/content-factory/carousel-generate"
      );
      const { QUOTE_LOOP_MIN_SEC, QUOTE_LOOP_MAX_SEC } = await import(
        "@/lib/content-factory/quote-loop"
      );
      const clipRes = await fetch(clipUrl!);
      if (!clipRes.ok) throw new Error(`clip re-download failed (${clipRes.status})`);
      const overlay = await renderMoodyTextOverlay([concept.quote], "QUOTE");
      const buf = await seamlessLoopWithOverlay(
        Buffer.from(await clipRes.arrayBuffer()),
        {
          minSec: QUOTE_LOOP_MIN_SEC,
          maxSec: QUOTE_LOOP_MAX_SEC,
          overlayPng: overlay,
          maxrate: "5M",
        }
      );
      const durationSec = await probeMediaDuration(buf, "mp4");
      const url = await uploadImage(buf, `${basePath}/quote-video.mp4`, "video/mp4");
      return { url, durationSec };
    });

    // ── Step 7: persist ───────────────────────────────────────────────
    await step.run("persist-result", async () => {
      try {
        const { prisma } = await import("@/lib/prisma");
        await prisma.carouselPost.update({
          where: { id: postId },
          data: { storyVideoUrl: finalized.url, storyVoiced: false },
        });
      } catch (err) {
        console.error(
          `[quote-loop] Failed to save result for ${postId}: ${err instanceof Error ? err.message : err}`
        );
      }
    });

    // ── Step 8: email the finished loop ───────────────────────────────
    await step.run("email-quote-loop", async () => {
      try {
        const { sendStoryVideoEmail } = await import("@/lib/content-factory/email");
        await sendStoryVideoEmail(postId, finalized.url, {
          sceneCount: 1,
          totalScenes: 1,
          narration: concept.quote,
          silent: false,
          captioned: false,
          quote: true, // 🖤 subject + loop framing, no script blocks
          durationSec: finalized.durationSec,
        });
      } catch (err) {
        logger.error(
          `[quote-loop] Email failed for post ${postId}: ${err instanceof Error ? err.message : err}`
        );
      }
    });

    logger.info(
      `[quote-loop] Post ${postId} (${audience}): seamless loop complete (${finalized.durationSec.toFixed(1)}s)`
    );
    return {
      quoteLoop: true,
      postId,
      audience,
      durationSec: finalized.durationSec,
      videoUrl: finalized.url,
    };
  }
);
