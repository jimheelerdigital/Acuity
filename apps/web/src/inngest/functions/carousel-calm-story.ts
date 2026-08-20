import { inngest } from "@/inngest/client";

/**
 * CALM-STORY video — event "content-factory/calmstory.video" (2026-08-20,
 * per Keenan). Replaces the eliminated illustrated STORY format: the same
 * soothing Hope voiceover as the ambient calm videos, but the narration
 * is a small story told across several photoreal scenes (no people ever)
 * that dissolve into each other with clean crossfades, each scene's
 * animation matching the beat of the story.
 *
 * Pipeline: Claude writes a 15-45s story split into 2-6 scenes with one
 * shared "look" → gpt-image-2 renders one photoreal 9:16 image per scene
 * → Higgsfield animates each (waves of ≤3 jobs, constant loopable
 * motion) → ElevenLabs (Hope, eleven_v3) voices the WHOLE narration as
 * one continuous read → each scene's clip is looped/trimmed to a window
 * weighted by its share of the narration words → crossfade stitch → mux
 * → storyVideoUrl/storyVoiced persisted → 🎞️ email.
 *
 * Fallbacks: a scene whose animation fails ships as a still clip of its
 * image (the story never loses a beat). If TTS fails, the video ships
 * silent with script captions burned in as a teleprompter.
 */
export const carouselCalmStoryFn = inngest.createFunction(
  {
    id: "carousel-calm-story",
    name: "Content Factory — Calm Story Video",
    retries: 1,
    concurrency: { limit: 1 },
    triggers: [{ event: "content-factory/calmstory.video" }],
  },
  async ({ step, logger }) => {
    // ── Step 0: config check ──────────────────────────────────────────
    const { higgsfieldOk } = await step.run("check-config", async () => {
      const { higgsfieldConfigured } = await import(
        "@/lib/content-factory/animate-cover"
      );
      return { higgsfieldOk: higgsfieldConfigured() };
    });
    if (!higgsfieldOk) {
      logger.warn(`[calm-story] Higgsfield not configured — skipping`);
      return { calmStory: false, reason: "higgsfield not configured" };
    }

    // ── Step 1: avoid list — 30 days of headlines + themes ────────────
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

    // ── Step 2: write the story script (scene-split) ──────────────────
    const script = await step.run("write-script", async () => {
      const { generateCalmStoryScript } = await import(
        "@/lib/content-factory/calm-story"
      );
      return generateCalmStoryScript({ avoid: seed.avoid });
    });
    const sceneCount = script.scenes.length;

    // ── Step 3: create the STORY post row ─────────────────────────────
    const post = await step.run("create-post", async () => {
      const { prisma } = await import("@/lib/prisma");
      // buildAmbientCaption — calm formats build a following: no Ripple
      // plug line, no branded hashtags (2026-08-20, per Keenan).
      const { buildAmbientCaption } = await import(
        "@/lib/content-factory/caption"
      );
      const { extractHashtags } = await import(
        "@/lib/content-factory/carousel-generate"
      );
      const slug =
        "calmstory-" +
        script.title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .slice(0, 48);
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
          format: "STORY",
          caption,
          hashtags: extractHashtags(caption),
          generatedFor: today,
          storyTheme: `${script.theme} (${script.shape})`,
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

    // ── Step 4: one photoreal image per scene ─────────────────────────
    const imageUrls: (string | null)[] = [];
    for (let i = 0; i < sceneCount; i++) {
      const url = await step.run(`scene-image-${i}`, async () => {
        try {
          const { buildCalmStorySceneImagePrompt } = await import(
            "@/lib/content-factory/calm-story"
          );
          const { generateImage, uploadImage } = await import(
            "@/lib/content-factory/carousel-generate"
          );
          const { composeSlide } = await import("@/lib/content-factory/compose");
          const prompt = buildCalmStorySceneImagePrompt({
            look: script.look,
            scene: script.scenes[i],
          });
          const raw = await generateImage(prompt);
          // Frame to exact 1080x1920 with no text overlay.
          const framed = await composeSlide(raw, "", "COVER");
          const u = await uploadImage(framed, `${basePath}/scene-${i}.jpg`);
          const { prisma } = await import("@/lib/prisma");
          await prisma.carouselSlide.create({
            data: {
              carouselPostId: postId,
              order: i,
              kind: i === 0 ? "COVER" : "SCENE",
              overlayText: script.scenes[i].narration,
              imagePrompt: prompt,
              imageUrl: u,
            },
          });
          return u;
        } catch (err) {
          console.error(
            `[calm-story] Scene ${i} image failed: ${err instanceof Error ? err.message : err}`
          );
          return null;
        }
      });
      imageUrls.push(url);
    }
    if (imageUrls.every((u) => !u)) {
      logger.error(`[calm-story] No scene images rendered for post ${postId}`);
      return { calmStory: false, postId, reason: "no scene images" };
    }

    // ── Step 5: animate scenes in waves of ≤3 Higgsfield jobs ─────────
    const clipUrls: (string | null)[] = new Array(sceneCount).fill(null);
    const WAVE_SIZE = 3;
    for (let w = 0; w * WAVE_SIZE < sceneCount; w++) {
      const wave = Array.from(
        { length: Math.min(WAVE_SIZE, sceneCount - w * WAVE_SIZE) },
        (_, k) => w * WAVE_SIZE + k
      ).filter((i) => imageUrls[i]);
      if (wave.length === 0) continue;

      const reqIds: Record<number, string | null> = {};
      for (const i of wave) {
        reqIds[i] = await step.run(`submit-scene-${i}`, async () => {
          try {
            const { submitCoverVideo } = await import(
              "@/lib/content-factory/animate-cover"
            );
            const { buildCalmStorySceneVideoPrompt, calmStoryClipDuration } =
              await import("@/lib/content-factory/calm-story");
            return await submitCoverVideo({
              startImageUrl: imageUrls[i]!,
              prompt: buildCalmStorySceneVideoPrompt(script.scenes[i]),
              duration: calmStoryClipDuration(),
            });
          } catch (err) {
            console.error(
              `[calm-story] Scene ${i} submit failed: ${err instanceof Error ? err.message : err}`
            );
            return null;
          }
        });
      }
      if (wave.every((i) => !reqIds[i])) continue;

      await step.sleep(`render-wait-w${w}`, "2m");

      // done[i]: cdn url when completed, null when failed, absent while pending
      const done: Record<number, string | null> = {};
      for (let r = 0; r < 20; r++) {
        const pending = wave.filter((i) => reqIds[i] && done[i] === undefined);
        if (pending.length === 0) break;
        for (const i of pending) {
          const check = await step.run(`poll-scene-${i}-r${r}`, async () => {
            try {
              const { checkCoverVideo } = await import(
                "@/lib/content-factory/animate-cover"
              );
              return await checkCoverVideo(reqIds[i]!);
            } catch {
              return { status: "in_progress", videoUrl: null as string | null };
            }
          });
          if (check.status === "completed" && check.videoUrl) {
            done[i] = check.videoUrl;
          } else if (check.status === "failed" || check.status === "nsfw") {
            logger.error(
              `[calm-story] Scene ${i} clip ended: ${check.status} (post ${postId})`
            );
            done[i] = null;
          }
        }
        const still = wave.filter((i) => reqIds[i] && done[i] === undefined);
        if (still.length > 0) await step.sleep(`poll-wait-w${w}-r${r}`, "30s");
      }

      for (const i of wave) {
        const cdnUrl = done[i];
        if (!cdnUrl) continue;
        clipUrls[i] = await step.run(`store-scene-${i}`, async () => {
          try {
            const { uploadImage } = await import(
              "@/lib/content-factory/carousel-generate"
            );
            const res = await fetch(cdnUrl);
            if (!res.ok) throw new Error(`clip download failed (${res.status})`);
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length < 100_000) {
              throw new Error(`clip is only ${buf.length} bytes — refusing to store`);
            }
            return await uploadImage(
              buf,
              `${basePath}/scene-${i}-clip.mp4`,
              "video/mp4"
            );
          } catch (err) {
            console.error(
              `[calm-story] Scene ${i} store failed: ${err instanceof Error ? err.message : err}`
            );
            return null;
          }
        });
      }
    }
    const animatedCount = clipUrls.filter(Boolean).length;
    logger.info(
      `[calm-story] Post ${postId}: ${animatedCount}/${sceneCount} scenes animated (rest ship as stills)`
    );

    // ── Step 6: voice the whole story in one continuous calm read ─────
    // Same Hope/eleven_v3 setup as the ambient format (2026-08-20, per
    // Keenan: "use the elevenlabs voice we've been using for all of our
    // other calm videos. this is the best we've made").
    const tts = await step.run("tts-script", async () => {
      try {
        const { generateVoiceover, probeMediaDuration } = await import(
          "@/lib/content-factory/story-video"
        );
        const { ambientVoiceoverOptions, ambientTtsText } = await import(
          "@/lib/content-factory/ambient-video"
        );
        const { uploadImage } = await import(
          "@/lib/content-factory/carousel-generate"
        );
        const { audio, engine } = await generateVoiceover(
          ambientTtsText({ script: script.script, vocalScript: script.vocalScript }),
          undefined,
          ambientVoiceoverOptions()
        );
        const durationSec = await probeMediaDuration(audio, "mp3");
        const url = await uploadImage(
          audio,
          `${basePath}/story-voiceover.mp3`,
          "audio/mpeg"
        );
        return { url, durationSec, engine, error: null as string | null };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[calm-story] TTS failed: ${msg}`);
        return { url: null, durationSec: 0, engine: null, error: msg };
      }
    });

    // ── Step 7: per-scene windows + loop/trim each scene to its window ─
    // The narration is ONE continuous read — each scene's on-screen time
    // is its share of the narration words, so the words and the scenes
    // stay together. Silent fallback: estimate the read from word count.
    const TAIL_SEC = 1.0;
    const totalWords = script.script.split(/\s+/).filter(Boolean).length;
    const targetSec = tts.url
      ? tts.durationSec + TAIL_SEC
      : Math.min(45, Math.max(15, totalWords / 2.2));

    const { windows } = await step.run("compute-windows", async () => {
      const { calmStorySceneWindows } = await import(
        "@/lib/content-factory/calm-story"
      );
      return { windows: calmStorySceneWindows(script.scenes, targetSec) };
    });

    const fittedUrls: (string | null)[] = [];
    for (let i = 0; i < sceneCount; i++) {
      const url = await step.run(`fit-scene-${i}`, async () => {
        try {
          const { uploadImage } = await import(
            "@/lib/content-factory/carousel-generate"
          );
          const win = windows[i];
          let buf: Buffer;
          if (clipUrls[i]) {
            const { loopClipToDuration } = await import(
              "@/lib/content-factory/ambient-video"
            );
            const { fitClipToDuration } = await import(
              "@/lib/content-factory/story-video"
            );
            const res = await fetch(clipUrls[i]!);
            if (!res.ok) throw new Error(`clip re-download failed (${res.status})`);
            // Loop ends at a copy boundary ≥ win — trim to the exact
            // window so the word-weighted timeline stays true.
            const looped = await loopClipToDuration(
              Buffer.from(await res.arrayBuffer()),
              win
            );
            buf = await fitClipToDuration(looped, win);
          } else if (imageUrls[i]) {
            // Animation never rendered — a still of the scene's image
            // keeps the story beat instead of skipping it.
            const { stillImageClip } = await import(
              "@/lib/content-factory/story-video"
            );
            const res = await fetch(imageUrls[i]!);
            if (!res.ok) throw new Error(`image re-download failed (${res.status})`);
            buf = await stillImageClip(Buffer.from(await res.arrayBuffer()), win);
          } else {
            return null;
          }
          return await uploadImage(
            buf,
            `${basePath}/scene-${i}-fitted.mp4`,
            "video/mp4"
          );
        } catch (err) {
          console.error(
            `[calm-story] Scene ${i} fit failed: ${err instanceof Error ? err.message : err}`
          );
          return null;
        }
      });
      fittedUrls.push(url);
    }
    const usable = fittedUrls.filter((u): u is string => Boolean(u));
    if (usable.length === 0) {
      logger.error(`[calm-story] No usable scene clips for post ${postId}`);
      return { calmStory: false, postId, reason: "no usable scene clips" };
    }

    // ── Step 8: crossfade stitch (clean fade between every scene) ─────
    const stitched = await step.run("stitch-video", async () => {
      const { stitchClipsWithCrossfade, probeMediaDuration } = await import(
        "@/lib/content-factory/story-video"
      );
      const { CALM_STORY_XFADE_SEC } = await import(
        "@/lib/content-factory/calm-story"
      );
      const { uploadImage } = await import(
        "@/lib/content-factory/carousel-generate"
      );
      const clips: Buffer[] = [];
      for (const u of usable) {
        const res = await fetch(u);
        if (!res.ok) throw new Error(`fitted clip re-download failed (${res.status})`);
        clips.push(Buffer.from(await res.arrayBuffer()));
      }
      // noEdgeFades: frame 1 must be the full scroll-stopping image, not
      // a fade from black. maxrate 5M keeps the file under the Supabase
      // 50MB and email 28MB caps (2026-08-19 incident).
      const buf = await stitchClipsWithCrossfade(clips, {
        crossfadeSec: CALM_STORY_XFADE_SEC,
        noEdgeFades: true,
        maxrate: "5M",
      });
      const durationSec = await probeMediaDuration(buf, "mp4");
      const url = await uploadImage(
        buf,
        `${basePath}/story-stitched.mp4`,
        "video/mp4"
      );
      return { url, durationSec };
    });

    // ── Step 9: mux the narration on top ──────────────────────────────
    const finalized = await step.run("mux-video", async () => {
      const { muxNarration, estimateCaptionChunks } = await import(
        "@/lib/content-factory/story-video"
      );
      const { uploadImage } = await import(
        "@/lib/content-factory/carousel-generate"
      );
      const stitchedRes = await fetch(stitched.url);
      if (!stitchedRes.ok) {
        throw new Error(`stitched re-download failed (${stitchedRes.status})`);
      }
      const stitchedBuf = Buffer.from(await stitchedRes.arrayBuffer());

      let audioBuf: Buffer | null = null;
      if (tts.url) {
        const audioRes = await fetch(tts.url);
        if (!audioRes.ok) throw new Error(`voiceover re-download failed (${audioRes.status})`);
        audioBuf = Buffer.from(await audioRes.arrayBuffer());
      }
      // NO burned captions on voiced videos (2026-08-20, per Keenan:
      // "No captions, I add them"). Silent fallback keeps script captions
      // as a teleprompter for a self-recorded read.
      const captions = tts.url
        ? []
        : estimateCaptionChunks(script.script, stitched.durationSec);

      let muxed: Buffer;
      let captioned = captions.length > 0;
      let muxError: string | null = null;
      try {
        muxed = await muxNarration(stitchedBuf, audioBuf, captioned ? captions : undefined);
      } catch (muxErr) {
        muxError = muxErr instanceof Error ? muxErr.message : String(muxErr);
        console.error(
          `[calm-story] Captioned mux failed — retrying without captions: ${muxError}`
        );
        if (!audioBuf) throw muxErr; // silent AND captionless = nothing to ship
        muxed = await muxNarration(stitchedBuf, audioBuf, undefined);
        captioned = false;
      }
      const url = await uploadImage(muxed, `${basePath}/story-video.mp4`, "video/mp4");
      return { url, captioned, durationSec: stitched.durationSec, error: muxError };
    });

    const voiced = Boolean(tts.url);

    // ── Step 10: persist ──────────────────────────────────────────────
    await step.run("persist-result", async () => {
      try {
        const { prisma } = await import("@/lib/prisma");
        await prisma.carouselPost.update({
          where: { id: postId },
          data: { storyVideoUrl: finalized.url, storyVoiced: voiced },
        });
      } catch (err) {
        console.error(
          `[calm-story] Failed to save result for ${postId}: ${err instanceof Error ? err.message : err}`
        );
      }
    });

    // ── Step 11: email the finished video ─────────────────────────────
    await step.run("email-calm-story", async () => {
      try {
        const { sendStoryVideoEmail } = await import("@/lib/content-factory/email");
        await sendStoryVideoEmail(postId, finalized.url, {
          sceneCount: usable.length,
          totalScenes: sceneCount,
          narration: script.script,
          silent: !voiced,
          captioned: finalized.captioned,
          captionsByHand: voiced, // voiced calm-story ships caption-free by design
          calmStory: true, // 🎞️ subject
          durationSec: finalized.durationSec,
          voiceoverError: tts.error ?? finalized.error,
          voiceEngine: tts.engine,
        });
      } catch (err) {
        logger.error(
          `[calm-story] Email failed for post ${postId}: ${err instanceof Error ? err.message : err}`
        );
      }
    });

    logger.info(
      `[calm-story] Post ${postId}: ${script.shape} story complete (${finalized.durationSec.toFixed(1)}s, ${usable.length}/${sceneCount} scenes, ${animatedCount} animated${voiced ? `, voiced via ${tts.engine}` : ", silent"})`
    );
    return {
      calmStory: true,
      postId,
      shape: script.shape,
      durationSec: finalized.durationSec,
      videoUrl: finalized.url,
      voiced,
      scenes: usable.length,
      animated: animatedCount,
    };
  }
);
