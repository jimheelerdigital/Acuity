import { inngest } from "@/inngest/client";

/**
 * AMBIENT calm video — event "content-factory/ambient.video" (2026-08-18,
 * per Keenan). The 4th daily post: one catchy soothing image → one
 * low-movement Higgsfield clip looped to the voiceover's length → a
 * soothing ElevenLabs read of a short lesson/story → script-true captions.
 * Modeled on the wakingupapp format (calm sky + quiet truth + captions).
 *
 * Pipeline: Claude writes a ~40s calm script + scene concept → gpt-image-2
 * renders ONE photoreal soothing 9:16 image (no text, no people) →
 * Higgsfield animates it (5s ambient drift, 2 attempts) → ElevenLabs
 * voices the whole script in one continuous calm read → the clip is
 * looped with crossfades to the audio's length → captions estimated from
 * the SCRIPT text (never re-transcribed) → mux (audio-only retry) →
 * storyVideoUrl/storyVoiced persisted → emailed.
 *
 * Fallback: if TTS fails, ships the looped clip at ~40s with script
 * captions only (doubles as a teleprompter for a self-recorded read).
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
      const { buildStoryCaption } = await import("@/lib/content-factory/caption");
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
      const caption = buildStoryCaption({
        slug,
        title: script.title,
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

    // ── Step 6: voice the whole script in one continuous calm read ────
    const tts = await step.run("tts-script", async () => {
      try {
        const { generateVoiceover, probeMediaDuration } = await import(
          "@/lib/content-factory/story-video"
        );
        const { ambientVoiceoverOptions } = await import(
          "@/lib/content-factory/ambient-video"
        );
        const { uploadImage } = await import(
          "@/lib/content-factory/carousel-generate"
        );
        const { audio, engine } = await generateVoiceover(
          script.script,
          undefined,
          ambientVoiceoverOptions()
        );
        const durationSec = await probeMediaDuration(audio, "mp3");
        const url = await uploadImage(
          audio,
          `${basePath}/ambient-voiceover.mp3`,
          "audio/mpeg"
        );
        return { url, durationSec, engine, error: null as string | null };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[ambient-video] TTS failed: ${msg}`);
        return { url: null, durationSec: 0, engine: null, error: msg };
      }
    });

    // ── Step 7: loop the clip to length + captions + mux ──────────────
    // Voiced: loop to the audio's length (+1s of quiet tail). Silent
    // fallback: loop to ~40s with script captions as a teleprompter.
    const TAIL_SEC = 1.0;
    const targetSec = tts.url ? tts.durationSec + TAIL_SEC : 40;

    // Looping and muxing are SEPARATE steps (2026-08-18): each is a full
    // x264 encode of the whole runtime, and both in one step blew
    // Vercel's 300s function limit on every attempt. Splitting gives
    // each encode its own serverless invocation.
    const loopedUrl = await step.run("loop-clip", async () => {
      const { loopClipToDuration } = await import(
        "@/lib/content-factory/ambient-video"
      );
      const { uploadImage } = await import(
        "@/lib/content-factory/carousel-generate"
      );
      const clipRes = await fetch(clipUrl!);
      if (!clipRes.ok) throw new Error(`clip re-download failed (${clipRes.status})`);
      const looped = await loopClipToDuration(
        Buffer.from(await clipRes.arrayBuffer()),
        targetSec
      );
      return await uploadImage(
        looped,
        `${basePath}/ambient-looped.mp4`,
        "video/mp4"
      );
    });

    const finalized = await step.run("mux-video", async () => {
      const { muxNarration, estimateCaptionChunks } = await import(
        "@/lib/content-factory/story-video"
      );
      const { uploadImage } = await import(
        "@/lib/content-factory/carousel-generate"
      );
      const loopedRes = await fetch(loopedUrl);
      if (!loopedRes.ok) {
        throw new Error(`looped clip re-download failed (${loopedRes.status})`);
      }
      const looped = Buffer.from(await loopedRes.arrayBuffer());

      let audioBuf: Buffer | null = null;
      if (tts.url) {
        const audioRes = await fetch(tts.url);
        if (!audioRes.ok) throw new Error(`voiceover re-download failed (${audioRes.status})`);
        audioBuf = Buffer.from(await audioRes.arrayBuffer());
      }
      // Captions from the SCRIPT text spread over the measured audio
      // (or the whole silent runtime) — never a re-transcription.
      const captions = estimateCaptionChunks(
        script.script,
        tts.url ? tts.durationSec : targetSec
      );

      // Captioned mux first; retry without captions so a caption problem
      // can never ship a silent/broken video (2026-08-14 drawtext incident).
      let muxed: Buffer;
      let captioned = captions.length > 0;
      let muxError: string | null = null;
      try {
        muxed = await muxNarration(looped, audioBuf, captioned ? captions : undefined);
      } catch (muxErr) {
        muxError = muxErr instanceof Error ? muxErr.message : String(muxErr);
        console.error(
          `[ambient-video] Captioned mux failed — retrying without captions: ${muxError}`
        );
        if (!audioBuf) throw muxErr; // silent AND captionless = nothing to ship
        muxed = await muxNarration(looped, audioBuf, undefined);
        captioned = false;
      }
      const url = await uploadImage(muxed, `${basePath}/ambient-video.mp4`, "video/mp4");
      return { url, captioned, durationSec: targetSec, error: muxError };
    });

    const voiced = Boolean(tts.url);

    // ── Step 8: persist ───────────────────────────────────────────────
    await step.run("persist-result", async () => {
      try {
        const { prisma } = await import("@/lib/prisma");
        await prisma.carouselPost.update({
          where: { id: postId },
          data: { storyVideoUrl: finalized.url, storyVoiced: voiced },
        });
      } catch (err) {
        console.error(
          `[ambient-video] Failed to save result for ${postId}: ${err instanceof Error ? err.message : err}`
        );
      }
    });

    // ── Step 9: email the finished video ──────────────────────────────
    await step.run("email-ambient-video", async () => {
      try {
        const { sendStoryVideoEmail } = await import("@/lib/content-factory/email");
        await sendStoryVideoEmail(postId, finalized.url, {
          sceneCount: 1,
          totalScenes: 1,
          narration: script.script,
          silent: !voiced,
          captioned: finalized.captioned,
          durationSec: finalized.durationSec,
          voiceoverError: tts.error ?? finalized.error,
          voiceEngine: tts.engine,
        });
      } catch (err) {
        logger.error(
          `[ambient-video] Email failed for post ${postId}: ${err instanceof Error ? err.message : err}`
        );
      }
    });

    logger.info(
      `[ambient-video] Post ${postId}: calm video complete (${finalized.durationSec.toFixed(1)}s${voiced ? `, voiced via ${tts.engine}` : ", silent"})`
    );
    return {
      ambientVideo: true,
      postId,
      durationSec: finalized.durationSec,
      videoUrl: finalized.url,
      voiced,
    };
  }
);
