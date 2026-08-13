import { inngest } from "@/inngest/client";

/**
 * 30-second story video — triggered per carousel post by
 * "content-factory/story.video", sent by the animate function AFTER slide
 * animation finishes (so story clips never contend with the slide waves
 * for Higgsfield's ~4-concurrent-job cap).
 *
 * Pipeline (2026-08-11; duration-fit + standalone concepts added
 * 2026-08-12 per Keenan): Claude invents its OWN viral story concept for
 * the demographic — independent of the carousel, deduped against recent
 * themes/headlines — and writes a ~30s six-scene script → gpt-image-2
 * renders 6 fresh text-free
 * scene images → Higgsfield animates each (5s clips) in waves of ≤4 →
 * ffmpeg stitches the surviving clips SILENT and measures the real
 * duration → Claude rewrites the narration (kept scenes only) to fit
 * that duration → OpenAI TTS voiceover (Higgsfield's platform API has no
 * TTS endpoint) → mux with gentle tempo-fit → the finished vertical MP4
 * is emailed, ready to post. Replaces Keenan's manual clip-together step.
 *
 * The story video is an enhancement: any failure logs and exits without
 * blocking anything — the main carousel email has already been sent.
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
    const postId = event.data.postId as string;
    const eventLane = typeof event.data.lane === "string" ? event.data.lane : undefined;

    // ── Step 1: load the post + the avoid list for concept dedup ─────
    const post = await step.run("load-post", async () => {
      const { prisma } = await import("@/lib/prisma");
      const p = await prisma.carouselPost.findUnique({
        where: { id: postId },
      });
      if (!p) return null;
      // The script is standalone (2026-08-12, per Keenan) — recent story
      // themes AND carousel headlines both go on the avoid list so the
      // video never rehashes what the feed already covered.
      const recent = await prisma.carouselPost.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          id: { not: p.id },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { headline: true, storyTheme: true },
      });
      const avoid = [
        ...recent.map((r) => r.storyTheme).filter((t): t is string => Boolean(t)),
        ...recent.map((r) => r.headline),
      ];
      return {
        topicSlug: p.topicSlug,
        dateStr: p.generatedFor.toISOString().slice(0, 10),
        lane: p.lane,
        avoid,
      };
    });
    if (!post) {
      logger.warn(`[story-video] Post ${postId} not found — skipping`);
      return { storyVideo: false, reason: "post not found" };
    }

    // Event lane wins (daily run passes it inline); the persisted column
    // is the fallback for manual re-runs from the admin (2026-08-12).
    const lane = eventLane ?? post.lane ?? "cinematicReal";

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

    const basePath = `carousels/${post.dateStr}/${post.topicSlug}`;

    // ── Step 2: invent the standalone concept + write the 30s script ─
    const script = await step.run("write-script", async () => {
      const { generateStoryScript } = await import(
        "@/lib/content-factory/story-video"
      );
      const { prisma } = await import("@/lib/prisma");
      const s = await generateStoryScript({ avoid: post.avoid });
      // Persist the theme immediately so tomorrow's script avoids it even
      // if this run dies downstream.
      await prisma.carouselPost
        .update({ where: { id: postId }, data: { storyTheme: s.theme } })
        .catch((err) =>
          console.error(
            `[story-video] Failed to save storyTheme: ${err instanceof Error ? err.message : err}`
          )
        );
      return s;
    });

    // NOTE (2026-08-12): the voiceover is generated AFTER the clips render
    // and the video is stitched, so the narration can be rewritten to
    // match the video's ACTUAL measured duration (failed scenes used to
    // cause audio/video desync trimmed blindly by -shortest).

    // ── Steps 3..8: scene images ─────────────────────────────────────
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
          return await uploadImage(framed, `${basePath}/story-scene-${i}.jpg`);
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
          return { url: silentVideo.url, voiced: false };
        }
        const muxed = await muxNarration(videoBuf, audioBuf, captions);
        const url = await uploadImage(muxed, `${basePath}/story-video.mp4`, "video/mp4");
        return { url, voiced: Boolean(audioBuf) };
      } catch (err) {
        console.error(
          `[story-video] Mux failed — shipping the silent video: ${err instanceof Error ? err.message : err}`
        );
        return { url: silentVideo.url, voiced: false };
      }
    });
    const finalVideoUrl = finalized.url;
    const voiced = finalized.voiced;

    // ── Persist the story video URL on the post (admin download link) ─
    await step.run("save-story-url", async () => {
      try {
        const { prisma } = await import("@/lib/prisma");
        await prisma.carouselPost.update({
          where: { id: postId },
          data: { storyVideoUrl: finalVideoUrl },
        });
      } catch (err) {
        console.error(
          `[story-video] Failed to save storyVideoUrl for ${postId}: ${err instanceof Error ? err.message : err}`
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
          durationSec: silentVideo.durationSec,
          voiceoverError: voiceover.error,
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
      scenes: readyClips.length,
      durationSec: silentVideo.durationSec,
      videoUrl: finalVideoUrl,
      voiced,
    };
  }
);
