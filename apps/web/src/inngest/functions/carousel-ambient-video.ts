import { inngest } from "@/inngest/client";

/**
 * AMBIENT calm video — event "content-factory/ambient.video" (2026-08-18,
 * per Keenan). The daily calm post: one catchy soothing image → one
 * low-movement Higgsfield clip looped to the script's read length.
 * Modeled on the wakingupapp format (calm sky + quiet truth).
 *
 * NO TTS as of 2026-08-24, per Keenan: he records the voiceover himself.
 * The pipeline ships a clean SILENT video — no audio, no burned captions
 * (he adds captions when posting) — and the email leads with the script
 * for him to read over it.
 *
 * Pipeline: Claude writes a 45-80 word calm script + scene concept →
 * gpt-image-2 renders ONE photoreal soothing 9:16 image (no text, no
 * people) → Higgsfield animates it (5s ambient drift, 2 attempts) → the
 * clip is looped with crossfades to the script's estimated slow-read
 * length → storyVideoUrl persisted (storyVoiced=false) → emailed with
 * the script framed "record this".
 */
export const carouselAmbientVideoFn = inngest.createFunction(
  {
    id: "carousel-ambient-video",
    name: "Content Factory — Ambient Calm Video",
    retries: 1,
    concurrency: { limit: 1 },
    triggers: [{ event: "content-factory/ambient.video" }],
  },
  async ({ step, logger }) => {
    // ── Step 0: config check — never burn Claude/image calls when the
    // video renderer isn't available. ─────────────────────────────────
    const { higgsfieldOk } = await step.run("check-config", async () => {
      const { higgsfieldConfigured } = await import(
        "@/lib/content-factory/animate-cover"
      );
      return { higgsfieldOk: higgsfieldConfigured() };
    });
    if (!higgsfieldOk) {
      logger.warn(`[ambient-video] Higgsfield not configured — skipping`);
      return { ambientVideo: false, reason: "higgsfield not configured" };
    }

    // ── Step 1: avoid list — 30 days of headlines + story/ambient themes
    // so the calm video never rehashes what the feed already covered. ──
    const seed = await step.run("load-seed", async () => {
      const { prisma } = await import("@/lib/prisma");
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
      const recent = await prisma.carouselPost.findMany({
        where: { generatedFor: { gte: thirtyDaysAgo } },
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

    // ── Step 2: write the calm script + scene concept ─────────────────
    const script = await step.run("write-script", async () => {
      const { generateAmbientScript } = await import(
        "@/lib/content-factory/ambient-video"
      );
      return generateAmbientScript({ avoid: seed.avoid });
    });

    // ── Step 3: create the AMBIENT post row ───────────────────────────
    const post = await step.run("create-post", async () => {
      const { prisma } = await import("@/lib/prisma");
      // buildAmbientCaption, not buildStoryCaption (2026-08-19, per
      // Keenan): calm videos build a following — no Ripple plug line,
      // no branded hashtags.
      const { buildAmbientCaption } = await import(
        "@/lib/content-factory/caption"
      );
      const { extractHashtags } = await import(
        "@/lib/content-factory/carousel-generate"
      );
      const slug =
        "calm-" +
        script.title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .slice(0, 52);
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const caption = buildAmbientCaption({
        slug,
        title: script.title,
        caption: script.caption,
        captionHook: script.captionHook,
        commentPrompt: script.commentPrompt,
      });
      const created = await prisma.carouselPost.create({
        data: {
          topicSlug: slug,
          headline: script.title,
          status: "DRAFT",
          format: "AMBIENT",
          caption,
          hashtags: extractHashtags(caption),
          generatedFor: today,
          storyTheme: script.theme,
        },
      });
      return {
        postId: created.id,
        topicSlug: slug,
        dateStr: today.toISOString().slice(0, 10),
      };
    });
    const postId = post.postId;
    const basePath = `carousels/${post.dateStr}/${post.topicSlug}`;

    // ── Step 4: the single soothing image ─────────────────────────────
    const imageUrl = await step.run("ambient-image", async () => {
      const { buildAmbientImagePrompt } = await import(
        "@/lib/content-factory/ambient-video"
      );
      const { generateImage, uploadImage } = await import(
        "@/lib/content-factory/carousel-generate"
      );
      const { composeSlide } = await import("@/lib/content-factory/compose");
      const prompt = buildAmbientImagePrompt(script);
      const raw = await generateImage(prompt);
      // Frame to exact 1080x1920 with no text — captions are muxed later.
      const framed = await composeSlide(raw, "", "COVER");
      const url = await uploadImage(framed, `${basePath}/ambient-scene.jpg`);
      const { prisma } = await import("@/lib/prisma");
      await prisma.carouselSlide.create({
        data: {
          carouselPostId: postId,
          order: 0,
          kind: "COVER",
          overlayText: script.script,
          imagePrompt: prompt,
          imageUrl: url,
        },
      });
      return url;
    });

    // ── Step 5: animate it (2 attempts, single job) ───────────────────
    let clipUrl: string | null = null;
    const MAX_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !clipUrl; attempt++) {
      const requestId = await step.run(`submit-clip-a${attempt}`, async () => {
        try {
          const { submitCoverVideo } = await import(
            "@/lib/content-factory/animate-cover"
          );
          const { buildAmbientVideoPrompt, ambientClipDuration } = await import(
            "@/lib/content-factory/ambient-video"
          );
          return await submitCoverVideo({
            startImageUrl: imageUrl,
            prompt: buildAmbientVideoPrompt(script),
            duration: ambientClipDuration(),
          });
        } catch (err) {
          console.error(
            `[ambient-video] Clip submit failed (attempt ${attempt}): ${err instanceof Error ? err.message : err}`
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
            `[ambient-video] Higgsfield clip ended: ${check.status} (post ${postId}, attempt ${attempt})`
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
          return await uploadImage(buf, `${basePath}/ambient-clip.mp4`, "video/mp4");
        } catch (err) {
          console.error(
            `[ambient-video] Store failed: ${err instanceof Error ? err.message : err}`
          );
          return null;
        }
      });
    }
    if (!clipUrl) {
      logger.error(
        `[ambient-video] No clip rendered for post ${postId} — image saved, no video`
      );
      return { ambientVideo: false, postId, reason: "clip never rendered" };
    }

    // ── Step 6: loop the clip to the script's read length ─────────────
    // No TTS (2026-08-24): the video is silent by design — Keenan records
    // the voiceover himself. Loop to the script's estimated slow-read
    // length so his read fits. No captions burned in (he adds them when
    // posting), so the looped clip IS the final video — no mux needed.
    const looped = await step.run("loop-clip", async () => {
      const { loopClipToDuration, estimateAmbientReadSeconds } = await import(
        "@/lib/content-factory/ambient-video"
      );
      const { probeMediaDuration } = await import(
        "@/lib/content-factory/story-video"
      );
      const { uploadImage } = await import(
        "@/lib/content-factory/carousel-generate"
      );
      const clipRes = await fetch(clipUrl!);
      if (!clipRes.ok) throw new Error(`clip re-download failed (${clipRes.status})`);
      const buf = await loopClipToDuration(
        Buffer.from(await clipRes.arrayBuffer()),
        estimateAmbientReadSeconds(script.script)
      );
      // The loop ends at a copy boundary, not exactly at target (clean
      // loop, 2026-08-19) — report the real length for the email.
      const durationSec = await probeMediaDuration(buf, "mp4");
      const url = await uploadImage(
        buf,
        `${basePath}/ambient-video.mp4`,
        "video/mp4"
      );
      return { url, durationSec };
    });

    // ── Step 7: persist ───────────────────────────────────────────────
    await step.run("persist-result", async () => {
      try {
        const { prisma } = await import("@/lib/prisma");
        await prisma.carouselPost.update({
          where: { id: postId },
          data: { storyVideoUrl: looped.url, storyVoiced: false },
        });
      } catch (err) {
        console.error(
          `[ambient-video] Failed to save result for ${postId}: ${err instanceof Error ? err.message : err}`
        );
      }
    });

    // ── Step 8: email the video + the script to record ────────────────
    await step.run("email-ambient-video", async () => {
      try {
        const { sendStoryVideoEmail } = await import("@/lib/content-factory/email");
        await sendStoryVideoEmail(postId, looped.url, {
          sceneCount: 1,
          totalScenes: 1,
          narration: script.script,
          silent: true,
          selfVoice: true, // silent by design — script leads the email
          captioned: false,
          calm: true, // 🌙 subject — distinguishable from story-video emails
          durationSec: looped.durationSec,
        });
      } catch (err) {
        logger.error(
          `[ambient-video] Email failed for post ${postId}: ${err instanceof Error ? err.message : err}`
        );
      }
    });

    logger.info(
      `[ambient-video] Post ${postId}: calm video complete (${looped.durationSec.toFixed(1)}s, silent by design — script emailed for self-record)`
    );
    return {
      ambientVideo: true,
      postId,
      durationSec: looped.durationSec,
      videoUrl: looped.url,
      voiced: false,
    };
  }
);
