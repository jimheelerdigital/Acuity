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
    const sceneImageUrls: (string | null)[] = [];
    for (let i = 0; i < script.scenes.length; i++) {
      const url = await step.run(`story-image-${i}`, async () => {
        try {
          const { buildStoryImagePrompt } = await import(
            "@/lib/content-factory/story-video"
          );
          const { generateImage, uploadImage } = await import(
            "@/lib/content-factory/carousel-generate"
          );
          const { composeSlide } = await import("@/lib/content-factory/compose");
          const prompt = buildStoryImagePrompt({
            lane,
            theme: script.theme,
            scene: script.scenes[i],
            sceneIndex: i,
          });
          const raw = await generateImage(prompt);
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
          return imageUrl;
        } catch (err) {
          console.error(
            `[story-video] Scene image ${i} failed: ${err instanceof Error ? err.message : err}`
          );
          return null;
        }
      });
      sceneImageUrls.push(url);
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
        const { buildSlideVideoPrompt, submitCoverVideo } = await import(
          "@/lib/content-factory/animate-cover"
        );
        const { storyClipDuration } = await import(
          "@/lib/content-factory/story-video"
        );
        const out: { scene: number; requestId: string }[] = [];
        for (const i of pendingScenes) {
          if (out.length >= MAX_CONCURRENT_JOBS) break;
          const scene = script.scenes[i];
          const prompt = buildSlideVideoPrompt({
            textFree: true,
            seed: i,
            emotion: { mood: scene.mood, motion: scene.motion },
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

    // ── Stitch the silent video and measure its REAL duration ────────
    const silentVideo = await step.run("stitch-silent", async () => {
      const { stitchStoryVideo, probeMediaDuration } = await import(
        "@/lib/content-factory/story-video"
      );
      const { uploadImage } = await import(
        "@/lib/content-factory/carousel-generate"
      );
      const clipBuffers: Buffer[] = [];
      // Keep scene order — skip scenes whose clip failed both attempts.
      for (const url of clipUrls) {
        if (!url) continue;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`clip re-download failed (${res.status}): ${url}`);
        clipBuffers.push(Buffer.from(await res.arrayBuffer()));
      }
      const stitched = await stitchStoryVideo(clipBuffers);
      const durationSec = await probeMediaDuration(stitched, "mp4");
      const url = await uploadImage(
        stitched,
        `${basePath}/story-video-silent.mp4`,
        "video/mp4"
      );
      return { url, durationSec };
    });

    // ── Rewrite the narration to fit the measured duration ───────────
    // Only lines whose scenes actually rendered; falls back to joining
    // them verbatim if the fit call fails (still no dropped-scene desync).
    const narration = await step.run("fit-narration", async () => {
      const keptNarrations = script.scenes
        .filter((_, i) => Boolean(clipUrls[i]))
        .map((s) => s.narration);
      try {
        const { fitNarrationToDuration } = await import(
          "@/lib/content-factory/story-video"
        );
        return await fitNarrationToDuration({
          narrations: keptNarrations,
          targetSeconds: silentVideo.durationSec,
          theme: script.theme,
        });
      } catch (err) {
        console.error(
          `[story-video] Narration fit failed — using kept scene lines verbatim: ${err instanceof Error ? err.message : err}`
        );
        return keptNarrations.join(" ");
      }
    });

    // ── Voiceover (never blocks — on failure the video ships without
    // audio but WITH script captions burned in, and the email leads with
    // the script so Keenan can record it himself; the failure reason is
    // captured for the email, 2026-08-13) ────────────────────────────
    const voiceover = await step.run("generate-voiceover", async () => {
      try {
        const { generateVoiceover } = await import(
          "@/lib/content-factory/story-video"
        );
        const { uploadImage } = await import(
          "@/lib/content-factory/carousel-generate"
        );
        const mp3 = await generateVoiceover(narration);
        const url = await uploadImage(mp3, `${basePath}/story-voiceover.mp3`, "audio/mpeg");
        return { url, error: null as string | null };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[story-video] Voiceover failed — video will ship with script captions only: ${msg}`
        );
        return { url: null, error: msg };
      }
    });

    // ── Mux the voiceover onto the silent video (tempo-fit to length),
    // with word-timed captions burned in (2026-08-12, per Keenan: most
    // viewers watch muted — captions are the retention fix). Whisper
    // transcribes the actual TTS audio so timing is exact; a failed
    // transcription ships the video uncaptioned rather than not at all. ─
    const finalized = await step.run("finalize-video", async () => {
      try {
        const {
          muxNarration,
          transcribeCaptionChunks,
          estimateCaptionChunks,
        } = await import("@/lib/content-factory/story-video");
        const { uploadImage } = await import(
          "@/lib/content-factory/carousel-generate"
        );
        const videoRes = await fetch(silentVideo.url);
        if (!videoRes.ok) throw new Error(`silent video re-download failed (${videoRes.status})`);
        const videoBuf = Buffer.from(await videoRes.arrayBuffer());

        let audioBuf: Buffer | null = null;
        if (voiceover.url) {
          const audioRes = await fetch(voiceover.url);
          if (!audioRes.ok) throw new Error(`voiceover re-download failed (${audioRes.status})`);
          audioBuf = Buffer.from(await audioRes.arrayBuffer());
        }

        // With audio: exact Whisper word timings. Without audio
        // (voiceover failed): captions estimated from the script itself,
        // spread over the measured duration — the silent video still
        // reads as the story, and the captions double as a teleprompter
        // for a self-recorded voiceover (2026-08-13, per Keenan).
        let captions;
        if (audioBuf) {
          try {
            captions = await transcribeCaptionChunks(audioBuf);
          } catch (capErr) {
            console.error(
              `[story-video] Caption transcription failed — shipping uncaptioned: ${capErr instanceof Error ? capErr.message : capErr}`
            );
          }
        } else {
          captions = estimateCaptionChunks(narration, silentVideo.durationSec);
        }

        if (!audioBuf && (!captions || captions.length === 0)) {
          return {
            url: silentVideo.url,
            voiced: false,
            captioned: false,
            error: null as string | null,
          };
        }

        // Captioned mux first; if that throws and we have audio, retry
        // audio-only (-c:v copy) so a caption problem can never ship a
        // silent video again (2026-08-14: drawtext missing from prod
        // ffmpeg silently muted two days of videos this exact way).
        let muxed: Buffer;
        let captioned = Boolean(captions && captions.length > 0);
        let muxError: string | null = null;
        try {
          muxed = await muxNarration(videoBuf, audioBuf, captions);
        } catch (muxErr) {
          if (!audioBuf) throw muxErr;
          muxError = muxErr instanceof Error ? muxErr.message : String(muxErr);
          console.error(
            `[story-video] Captioned mux failed — retrying audio-only: ${muxError}`
          );
          muxed = await muxNarration(videoBuf, audioBuf, undefined);
          captioned = false;
        }
        const url = await uploadImage(muxed, `${basePath}/story-video.mp4`, "video/mp4");
        return { url, voiced: Boolean(audioBuf), captioned, error: muxError };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[story-video] Mux failed — shipping the silent video: ${msg}`);
        return { url: silentVideo.url, voiced: false, captioned: false, error: msg };
      }
    });
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
          durationSec: silentVideo.durationSec,
          voiceoverError: voiceover.error ?? finalized.error,
        });
      } catch (err) {
        logger.error(
          `[story-video] Email failed for post ${postId}: ${err instanceof Error ? err.message : err}`
        );
      }
    });

    logger.info(
      `[story-video] Post ${postId}: story video complete (${readyClips.length}/${script.scenes.length} scenes, ${silentVideo.durationSec.toFixed(1)}s${voiced ? ", voiced" : ", silent"})`
    );
    return {
      storyVideo: true,
      standalone,
      postId,
      scenes: readyClips.length,
      durationSec: silentVideo.durationSec,
      videoUrl: finalVideoUrl,
      voiced,
    };
  }
);
