import { inngest } from "@/inngest/client";

/**
 * 30-second story video — event "content-factory/story.video".
 *
 * Two modes (2026-08-16 reset per Keenan):
 * - STANDALONE (daily 20 UTC bucket, `data.standalone: true`): generates
 *   its OWN first-person narrative story (not derived from any carousel),
 *   creates a CarouselPost row (format=STORY) with scene slides, and
 *   emails the finished video. This is bucket 3 of the 3-posts-per-day
 *   system — a genuinely different post from the photo/video carousels.
 * - POST-DERIVED (`data.postId`, admin "🎥 Story" button): tells a story
 *   that lives inside an existing post's theme (no longer a re-read of
 *   its reason list) and saves the video onto that post.
 *
 * Pipeline: Claude writes a ~30s six-scene narrative script → gpt-image-2
 * renders 6 fresh text-free scene images → Higgsfield animates each (5s
 * clips) in waves of ≤4 → ffmpeg stitches the surviving clips SILENT and
 * measures the real duration → Claude rewrites the narration (kept scenes
 * only) to fit that duration → OpenAI TTS voiceover → mux (retried once —
 * the mux was flaking ~50% on Vercel and silently shipping silent videos)
 * → storyVideoUrl/storyVoiced persisted on the post → emailed.
 */
export const carouselStoryVideoFn = inngest.createFunction(
  {
    id: "carousel-story-video",
    name: "Content Factory — 30s Story Video",
    retries: 1,
    concurrency: { limit: 1 }, // never overlap with another story's Higgsfield waves
    triggers: [{ event: "content-factory/story.video" }],
  },
  async ({ event, step, logger }) => {
    const eventPostId =
      typeof event.data.postId === "string" ? event.data.postId : null;
    const standalone = !eventPostId;
    const eventLane = typeof event.data.lane === "string" ? event.data.lane : undefined;

    // ── Step 0: config check first — never burn Claude/image calls when
    // the video renderer isn't available. ─────────────────────────────
    const { higgsfieldOk } = await step.run("check-config", async () => {
      const { higgsfieldConfigured } = await import(
        "@/lib/content-factory/animate-cover"
      );
      return { higgsfieldOk: higgsfieldConfigured() };
    });
    if (!higgsfieldOk) {
      logger.warn(`[story-video] Higgsfield not configured — skipping story video`);
      return { storyVideo: false, reason: "higgsfield not configured" };
    }

    // ── Step 1: build the avoid list for concept dedup ───────────────
    // The script is standalone in BOTH modes (2026-08-12, per Keenan) —
    // recent story themes AND carousel headlines go on the avoid list so
    // the video never rehashes what the feed already covered (30-day
    // window, all formats). Post mode only validates the post exists.
    const seed = await step.run("load-seed", async () => {
      const { prisma } = await import("@/lib/prisma");
      if (eventPostId) {
        const p = await prisma.carouselPost.findUnique({
          where: { id: eventPostId },
          select: { id: true },
        });
        if (!p) return null;
      }
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
      const recent = await prisma.carouselPost.findMany({
        where: {
          generatedFor: { gte: thirtyDaysAgo },
          ...(eventPostId ? { id: { not: eventPostId } } : {}),
        },
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
    if (!seed) {
      logger.warn(`[story-video] Post ${eventPostId} not found — skipping`);
      return { storyVideo: false, reason: "post not found" };
    }

    // ── Step 2: invent the standalone concept + write the 30s script ─
    const script = await step.run("write-script", async () => {
      const { generateStoryScript } = await import(
        "@/lib/content-factory/story-video"
      );
      return generateStoryScript({ avoid: seed.avoid });
    });

    // ── Step 3: resolve the post row this video belongs to ───────────
    // Standalone: create the STORY CarouselPost (headline = story title,
    // caption = story caption). Post mode: reuse the existing post.
    const post = await step.run("resolve-post", async () => {
      const { prisma } = await import("@/lib/prisma");
      if (eventPostId) {
        const p = await prisma.carouselPost.findUniqueOrThrow({
          where: { id: eventPostId },
          select: { id: true, topicSlug: true, generatedFor: true },
        });
        // Persist the theme immediately so tomorrow's script avoids it
        // even if this run dies downstream.
        await prisma.carouselPost
          .update({ where: { id: p.id }, data: { storyTheme: script.theme } })
          .catch((err) =>
            console.error(
              `[story-video] Failed to save storyTheme: ${err instanceof Error ? err.message : err}`
            )
          );
        return {
          postId: p.id,
          topicSlug: p.topicSlug,
          dateStr: p.generatedFor.toISOString().slice(0, 10),
          lane: eventLane ?? "cinematicReal",
        };
      }
      const { buildStoryCaption } = await import("@/lib/content-factory/caption");
      const { extractHashtags } = await import(
        "@/lib/content-factory/carousel-generate"
      );
      const { STYLE_LANES } = await import("@/lib/content-factory/brand");
      const laneKeys = Object.keys(STYLE_LANES);
      const lane = laneKeys[Math.floor(Math.random() * laneKeys.length)];

      const slug =
        "story-" +
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
          format: "STORY",
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
        lane,
      };
    });

    const postId = post.postId;
    const lane = post.lane;
    const basePath = `carousels/${post.dateStr}/${post.topicSlug}`;

    // ── Steps 4..9: scene images ─────────────────────────────────────
    // 2026-08-16, per Keenan: she looked like a DIFFERENT woman in every
    // scene — text-only prompts can't hold a face. Scene 0's raw render
    // is uploaded as the character reference and every later scene is
    // generated via images.edit against it (same face/hair/outfit),
    // falling back to text-only generation if the edit call fails.
    const sceneImageUrls: (string | null)[] = [];
    let refImageUrl: string | null = null;
    for (let i = 0; i < script.scenes.length; i++) {
      const result = await step.run(`story-image-${i}`, async () => {
        try {
          const { buildStoryImagePrompt } = await import(
            "@/lib/content-factory/story-video"
          );
          const { generateImage, generateImageWithReference, uploadImage } =
            await import("@/lib/content-factory/carousel-generate");
          const { composeSlide } = await import("@/lib/content-factory/compose");
          const prompt = buildStoryImagePrompt({
            lane,
            theme: script.theme,
            scene: script.scenes[i],
            sceneIndex: i,
            withReference: i > 0 && Boolean(refImageUrl),
          });
          let raw: Buffer;
          if (i > 0 && refImageUrl) {
            try {
              const refRes = await fetch(refImageUrl);
              if (!refRes.ok) throw new Error(`reference download failed (${refRes.status})`);
              raw = await generateImageWithReference(
                prompt,
                Buffer.from(await refRes.arrayBuffer())
              );
            } catch (refErr) {
              console.warn(
                `[story-video] Reference edit failed for scene ${i} — falling back to plain generation: ${refErr instanceof Error ? refErr.message : refErr}`
              );
              raw = await generateImage(prompt);
            }
          } else {
            raw = await generateImage(prompt);
          }
          // Scene 0's RAW render becomes the character reference for the
          // rest of the scenes (uploaded before framing so the edit call
          // sees the full unletterboxed illustration).
          let newRefUrl: string | null = null;
          if (i === 0) {
            newRefUrl = await uploadImage(raw, `${basePath}/story-scene-ref.jpg`);
          }
          // Resize to the final 1080x1920 frame (no text — voiceover carries
          // the words) so the clip aspect is exact.
          const framed = await composeSlide(raw, "", "COVER");
          const imageUrl = await uploadImage(framed, `${basePath}/story-scene-${i}.jpg`);
          // Standalone stories persist their scenes as slides so the admin
          // can see/regenerate them like any other post.
          if (standalone) {
            const { prisma } = await import("@/lib/prisma");
            await prisma.carouselSlide.create({
              data: {
                carouselPostId: postId,
                order: i,
                kind: "SCENE",
                overlayText: script.scenes[i].narration,
                imagePrompt: prompt,
                imageUrl,
              },
            });
          }
          return { imageUrl, refUrl: newRefUrl };
        } catch (err) {
          console.error(
            `[story-video] Scene image ${i} failed: ${err instanceof Error ? err.message : err}`
          );
          return { imageUrl: null, refUrl: null };
        }
      });
      sceneImageUrls.push(result.imageUrl);
      if (i === 0 && result.refUrl) refImageUrl = result.refUrl;
    }

    // ── Steps 10+: animate scenes in waves of ≤4 (Higgsfield silently
    // drops submits past ~4 concurrent jobs; attempt 2 retries failures) ──
    const MAX_ATTEMPTS = 2;
    const MAX_CONCURRENT_JOBS = 4;
    // Scene index -> stored Supabase clip URL
    const clipUrls: (string | null)[] = script.scenes.map(() => null);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const pendingScenes = script.scenes
        .map((_, i) => i)
        .filter((i) => !clipUrls[i] && sceneImageUrls[i]);
      if (pendingScenes.length === 0) break;

      const jobs = await step.run(`submit-clips-a${attempt}`, async () => {
        const { buildStorySceneVideoPrompt, submitCoverVideo } = await import(
          "@/lib/content-factory/animate-cover"
        );
        const { storyClipDuration } = await import(
          "@/lib/content-factory/story-video"
        );
        const out: { scene: number; requestId: string }[] = [];
        for (const i of pendingScenes) {
          if (out.length >= MAX_CONCURRENT_JOBS) break;
          const scene = script.scenes[i];
          // 2026-08-16, per Keenan: story clips must act out the scene's
          // narration — bespoke script motion leads, pool is fallback only.
          const prompt = buildStorySceneVideoPrompt({
            scene: { motion: scene.motion, mood: scene.mood },
            seed: i,
          });
          try {
            const requestId = await submitCoverVideo({
              startImageUrl: sceneImageUrls[i]!,
              prompt,
              duration: storyClipDuration(),
            });
            out.push({ scene: i, requestId });
          } catch (err) {
            console.error(
              `[story-video] Clip submit failed for scene ${i} (attempt ${attempt}): ${err instanceof Error ? err.message : err}`
            );
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
        return out;
      });

      if (jobs.length === 0) {
        logger.warn(
          `[story-video] No clip jobs submitted on attempt ${attempt} for post ${postId}`
        );
        continue;
      }

      await step.sleep(`initial-render-wait-a${attempt}`, "2m");

      const maxPolls = attempt === 1 ? 36 : 24;
      let pending = jobs.map((j) => j.requestId);
      const completed: Record<string, string> = {};

      for (let p = 0; p < maxPolls && pending.length > 0; p++) {
        const results = await step.run(`poll-clips-a${attempt}-${p}`, async () => {
          const { checkCoverVideo } = await import(
            "@/lib/content-factory/animate-cover"
          );
          const out: { requestId: string; status: string; videoUrl: string | null }[] = [];
          for (const requestId of pending) {
            try {
              const check = await checkCoverVideo(requestId);
              out.push({ requestId, ...check });
            } catch {
              out.push({ requestId, status: "in_progress", videoUrl: null });
            }
          }
          return out;
        });

        for (const r of results) {
          if (r.status === "completed" && r.videoUrl) {
            completed[r.requestId] = r.videoUrl;
          } else if (r.status === "failed" || r.status === "nsfw") {
            logger.error(
              `[story-video] Higgsfield clip ${r.requestId} ended: ${r.status} (post ${postId})`
            );
            completed[r.requestId] = "";
          }
        }
        pending = pending.filter((id) => !(id in completed));
        if (pending.length > 0) {
          await step.sleep(`poll-wait-a${attempt}-${p}`, "30s");
        }
      }

      // Store finished clips in Supabase (step returns must be JSON — the
      // stitch step re-downloads them by URL).
      for (const job of jobs) {
        const cdnUrl = completed[job.requestId];
        if (!cdnUrl) continue;
        const stored = await step.run(`store-clip-a${attempt}-${job.scene}`, async () => {
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
              `${basePath}/story-clip-${job.scene}.mp4`,
              "video/mp4"
            );
          } catch (err) {
            console.error(
              `[story-video] Store failed for scene ${job.scene}: ${err instanceof Error ? err.message : err}`
            );
            return null;
          }
        });
        if (stored) clipUrls[job.scene] = stored;
      }
    }

    const readyClips = clipUrls.filter(Boolean) as string[];
    if (readyClips.length < 4) {
      logger.error(
        `[story-video] Only ${readyClips.length}/${script.scenes.length} clips rendered for post ${postId} — skipping stitch`
      );
      return { storyVideo: false, reason: `only ${readyClips.length} clips rendered` };
    }

    // ── Per-scene narration sync (2026-08-16, per Keenan: the voiceover
    // never lined up with the scenes — it was one rewritten monologue
    // tempo-fitted over the whole video. Now each scene's line is voiced
    // on its own, its clip is cut to that audio's length, and the pieces
    // are joined scene-by-scene, so words physically cannot drift). ────
    const GAP_SEC = 0.35; // breathing room after each scene's line
    const keptIdx = clipUrls.map((u, i) => (u ? i : -1)).filter((i) => i >= 0);
    const narration = keptIdx.map((i) => script.scenes[i].narration).join(" ");

    const sceneAudios: {
      scene: number;
      url: string | null;
      durationSec: number;
      engine: string | null;
      error: string | null;
    }[] = [];
    for (let k = 0; k < keptIdx.length; k++) {
      const i = keptIdx[k];
      const result = await step.run(`tts-scene-${i}`, async () => {
        try {
          const { generateVoiceover, probeMediaDuration } = await import(
            "@/lib/content-factory/story-video"
          );
          const { uploadImage } = await import(
            "@/lib/content-factory/carousel-generate"
          );
          // previous/next lines keep ElevenLabs' intonation continuous
          // across the scene cuts.
          const { audio, engine } = await generateVoiceover(
            script.scenes[i].narration,
            {
              previousText: k > 0 ? script.scenes[keptIdx[k - 1]].narration : undefined,
              nextText:
                k < keptIdx.length - 1
                  ? script.scenes[keptIdx[k + 1]].narration
                  : undefined,
            }
          );
          const durationSec = await probeMediaDuration(audio, "mp3");
          const url = await uploadImage(
            audio,
            `${basePath}/story-audio-${i}.mp3`,
            "audio/mpeg"
          );
          return { scene: i, url, durationSec, engine, error: null as string | null };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[story-video] TTS failed for scene ${i}: ${msg}`);
          return { scene: i, url: null, durationSec: 0, engine: null, error: msg };
        }
      });
      sceneAudios.push(result);
    }
    const allVoiced = sceneAudios.every((a) => a.url);
    const voiceEngine = sceneAudios.find((a) => a.engine)?.engine ?? null;
    const voiceError = sceneAudios.find((a) => a.error)?.error ?? null;

    let finalized: {
      url: string;
      voiced: boolean;
      captioned: boolean;
      durationSec: number;
      error: string | null;
    };

    if (allVoiced) {
      // ── Cut each clip to its own narration's length ────────────────
      const fittedUrls: string[] = [];
      for (let k = 0; k < keptIdx.length; k++) {
        const i = keptIdx[k];
        const target = sceneAudios[k].durationSec + GAP_SEC;
        const fitted = await step.run(`fit-clip-${i}`, async () => {
          const { fitClipToDuration } = await import(
            "@/lib/content-factory/story-video"
          );
          const { uploadImage } = await import(
            "@/lib/content-factory/carousel-generate"
          );
          const res = await fetch(clipUrls[i]!);
          if (!res.ok) throw new Error(`clip re-download failed (${res.status})`);
          const buf = await fitClipToDuration(
            Buffer.from(await res.arrayBuffer()),
            target
          );
          return await uploadImage(
            buf,
            `${basePath}/story-clip-fitted-${i}.mp4`,
            "video/mp4"
          );
        });
        fittedUrls.push(fitted);
      }

      // ── Combined audio + per-scene captions from the SCRIPT ────────
      const audioTrack = await step.run("build-audio", async () => {
        const { concatAudioWithGaps, estimateCaptionChunks } = await import(
          "@/lib/content-factory/story-video"
        );
        const { uploadImage } = await import(
          "@/lib/content-factory/carousel-generate"
        );
        const bufs: Buffer[] = [];
        for (const a of sceneAudios) {
          const res = await fetch(a.url!);
          if (!res.ok) throw new Error(`scene audio re-download failed (${res.status})`);
          bufs.push(Buffer.from(await res.arrayBuffer()));
        }
        const combined = await concatAudioWithGaps(bufs, GAP_SEC);
        const url = await uploadImage(
          combined,
          `${basePath}/story-voiceover.mp3`,
          "audio/mpeg"
        );
        // Captions come from the SCRIPT TEXT, not a re-transcription
        // (2026-08-16, per Keenan: whisper garbled the words — "house
        // wants To the" — and the slow emotional read's pauses split
        // captions into lone floating words). We already know every
        // word; each scene's line is chunked 3-4 words and spread over
        // that scene's measured audio, offset to its start in the cut.
        const captions: { text: string; start: number; end: number }[] = [];
        let offset = 0;
        for (let k = 0; k < sceneAudios.length; k++) {
          const chunks = estimateCaptionChunks(
            script.scenes[keptIdx[k]].narration,
            sceneAudios[k].durationSec
          );
          for (const c of chunks) {
            captions.push({ text: c.text, start: c.start + offset, end: c.end + offset });
          }
          offset += sceneAudios[k].durationSec + GAP_SEC;
        }
        const durationSec = sceneAudios.reduce((s, a) => s + a.durationSec + GAP_SEC, 0);
        return { url, captions, durationSec };
      });

      // ── Stitch the fitted clips and mux the synced audio ───────────
      finalized = await step.run("finalize-video", async () => {
        const { stitchStoryVideo, muxNarration } = await import(
          "@/lib/content-factory/story-video"
        );
        const { uploadImage } = await import(
          "@/lib/content-factory/carousel-generate"
        );
        const clips: Buffer[] = [];
        for (const u of fittedUrls) {
          const res = await fetch(u);
          if (!res.ok) throw new Error(`fitted clip re-download failed (${res.status})`);
          clips.push(Buffer.from(await res.arrayBuffer()));
        }
        const stitched = await stitchStoryVideo(clips);
        const audioRes = await fetch(audioTrack.url);
        if (!audioRes.ok) throw new Error(`voiceover re-download failed (${audioRes.status})`);
        const audioBuf = Buffer.from(await audioRes.arrayBuffer());

        // Captioned mux first; audio-only retry so a caption problem can
        // never ship a silent video (2026-08-14 drawtext incident).
        let muxed: Buffer;
        let captioned = audioTrack.captions.length > 0;
        let muxError: string | null = null;
        try {
          muxed = await muxNarration(
            stitched,
            audioBuf,
            captioned ? audioTrack.captions : undefined
          );
        } catch (muxErr) {
          muxError = muxErr instanceof Error ? muxErr.message : String(muxErr);
          console.error(
            `[story-video] Captioned mux failed — retrying audio-only: ${muxError}`
          );
          muxed = await muxNarration(stitched, audioBuf, undefined);
          captioned = false;
        }
        const url = await uploadImage(muxed, `${basePath}/story-video.mp4`, "video/mp4");
        return {
          url,
          voiced: true,
          captioned,
          durationSec: audioTrack.durationSec,
          error: muxError,
        };
      });
    } else {
      // ── Voiceover failed: silent video with estimated script captions
      // (doubles as a teleprompter for a self-recorded voiceover,
      // 2026-08-13, per Keenan). ─────────────────────────────────────
      finalized = await step.run("finalize-silent", async () => {
        const {
          stitchStoryVideo,
          probeMediaDuration,
          muxNarration,
          estimateCaptionChunks,
        } = await import("@/lib/content-factory/story-video");
        const { uploadImage } = await import(
          "@/lib/content-factory/carousel-generate"
        );
        const clips: Buffer[] = [];
        for (const i of keptIdx) {
          const res = await fetch(clipUrls[i]!);
          if (!res.ok) throw new Error(`clip re-download failed (${res.status})`);
          clips.push(Buffer.from(await res.arrayBuffer()));
        }
        const stitched = await stitchStoryVideo(clips);
        const durationSec = await probeMediaDuration(stitched, "mp4");
        const silentUrl = await uploadImage(
          stitched,
          `${basePath}/story-video-silent.mp4`,
          "video/mp4"
        );
        try {
          const captions = estimateCaptionChunks(narration, durationSec);
          const muxed = await muxNarration(stitched, null, captions);
          const url = await uploadImage(muxed, `${basePath}/story-video.mp4`, "video/mp4");
          return { url, voiced: false, captioned: true, durationSec, error: null as string | null };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[story-video] Silent captioned mux failed — shipping silent: ${msg}`);
          return { url: silentUrl, voiced: false, captioned: false, durationSec, error: msg };
        }
      });
    }
    const finalVideoUrl = finalized.url;
    const voiced = finalized.voiced;

    // ── Persist the result so the admin can see it (2026-08-16) ──────
    await step.run("persist-story-result", async () => {
      try {
        const { prisma } = await import("@/lib/prisma");
        await prisma.carouselPost.update({
          where: { id: postId },
          data: { storyVideoUrl: finalVideoUrl, storyVoiced: voiced },
        });
      } catch (err) {
        console.error(
          `[story-video] Failed to save story result for ${postId}: ${err instanceof Error ? err.message : err}`
        );
      }
    });

    // ── Email the finished video ─────────────────────────────────────
    await step.run("email-story-video", async () => {
      try {
        const { sendStoryVideoEmail } = await import(
          "@/lib/content-factory/email"
        );
        await sendStoryVideoEmail(postId, finalVideoUrl, {
          sceneCount: readyClips.length,
          totalScenes: script.scenes.length,
          narration,
          silent: !voiced,
          captioned: finalized.captioned,
          durationSec: finalized.durationSec,
          voiceoverError: voiceError ?? finalized.error,
          voiceEngine,
        });
      } catch (err) {
        logger.error(
          `[story-video] Email failed for post ${postId}: ${err instanceof Error ? err.message : err}`
        );
      }
    });

    logger.info(
      `[story-video] Post ${postId}: story video complete (${readyClips.length}/${script.scenes.length} scenes, ${finalized.durationSec.toFixed(1)}s${voiced ? `, voiced via ${voiceEngine}` : ", silent"})`
    );
    return {
      storyVideo: true,
      standalone,
      postId,
      scenes: readyClips.length,
      durationSec: finalized.durationSec,
      videoUrl: finalVideoUrl,
      voiced,
    };
  }
);
