import { inngest } from "@/inngest/client";

/**
 * 30-second story video — triggered per carousel post by
 * "content-factory/story.video", sent by the animate function AFTER slide
 * animation finishes (so story clips never contend with the slide waves
 * for Higgsfield's ~4-concurrent-job cap).
 *
 * Pipeline (2026-08-11, per Keenan): Claude writes a ~30s six-scene
 * voiceover script → gpt-image-2 renders 6 fresh text-free scene images →
 * Higgsfield animates each (5s clips) in waves of ≤4 → OpenAI TTS
 * voiceover (Higgsfield's platform API has no TTS endpoint) → ffmpeg
 * concat + audio mux → the finished vertical MP4 is emailed, ready to
 * post. Replaces Keenan's manual clip-together step.
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
    const lane = typeof event.data.lane === "string" ? event.data.lane : "cinematicReal";
    const eventMood = typeof event.data.mood === "string" ? event.data.mood : undefined;

    // ── Step 1: load the post ────────────────────────────────────────
    const post = await step.run("load-post", async () => {
      const { prisma } = await import("@/lib/prisma");
      const p = await prisma.carouselPost.findUnique({
        where: { id: postId },
        include: { slides: { orderBy: { order: "asc" } } },
      });
      if (!p) return null;
      return {
        headline: p.headline,
        topicSlug: p.topicSlug,
        dateStr: p.generatedFor.toISOString().slice(0, 10),
        reasons: p.slides
          .filter((s) => s.kind === "REASON")
          .map((s) => s.overlayText),
      };
    });
    if (!post) {
      logger.warn(`[story-video] Post ${postId} not found — skipping`);
      return { storyVideo: false, reason: "post not found" };
    }

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

    // ── Step 2: write the 30s script ─────────────────────────────────
    const script = await step.run("write-script", async () => {
      const { generateStoryScript } = await import(
        "@/lib/content-factory/story-video"
      );
      return generateStoryScript({
        headline: post.headline,
        reasons: post.reasons,
        mood: eventMood,
      });
    });

    // ── Step 3: voiceover (never blocks — video ships silent on failure)
    const voiceoverUrl = await step.run("generate-voiceover", async () => {
      try {
        const { generateVoiceover } = await import(
          "@/lib/content-factory/story-video"
        );
        const { uploadImage } = await import(
          "@/lib/content-factory/carousel-generate"
        );
        const mp3 = await generateVoiceover(script.fullNarration);
        return await uploadImage(mp3, `${basePath}/story-voiceover.mp3`, "audio/mpeg");
      } catch (err) {
        console.error(
          `[story-video] Voiceover failed — video will ship silent: ${err instanceof Error ? err.message : err}`
        );
        return null;
      }
    });

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
            headline: post.headline,
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

    // ── Stitch + upload the finished video ───────────────────────────
    const finalVideoUrl = await step.run("stitch-video", async () => {
      const { stitchStoryVideo } = await import(
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
      let audio: Buffer | null = null;
      if (voiceoverUrl) {
        const res = await fetch(voiceoverUrl);
        if (res.ok) audio = Buffer.from(await res.arrayBuffer());
      }
      const stitched = await stitchStoryVideo(clipBuffers, audio);
      return uploadImage(stitched, `${basePath}/story-video.mp4`, "video/mp4");
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
          narration: script.fullNarration,
          silent: !voiceoverUrl,
        });
      } catch (err) {
        logger.error(
          `[story-video] Email failed for post ${postId}: ${err instanceof Error ? err.message : err}`
        );
      }
    });

    logger.info(
      `[story-video] Post ${postId}: story video complete (${readyClips.length}/${script.scenes.length} scenes${voiceoverUrl ? ", voiced" : ", silent"})`
    );
    return {
      storyVideo: true,
      scenes: readyClips.length,
      videoUrl: finalVideoUrl,
      voiced: Boolean(voiceoverUrl),
    };
  }
);
