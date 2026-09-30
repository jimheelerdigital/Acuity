import { inngest } from "@/inngest/client";

/**
 * VOICED daily videos (2026-09-30) — see lib/content-factory/voiced.ts for
 * the whole loop. Three functions:
 *
 *   voicedScriptDailyFn  cron 12:00 UTC + "content-factory/voiced.script"
 *                        {date?, brand?, force?}: write + email the day's
 *                        BWK then Ripple script, then start its shots.
 *   voicedClipsFn        "content-factory/voiced.clips" {date, brand}:
 *                        gpt-image-2 photo per line → Higgsfield clip per
 *                        line (waves, primary model then fallback), clips
 *                        copied into our bucket → clips.json "done".
 *   voicedBuildFn        "content-factory/voiced.build" {date, brand}
 *                        (sent by the upload page): waits for clips, then
 *                        voice → Whisper → alignment → one segment per shot
 *                        → join + mix → emailed for approval.
 *
 * Failures email Keenan (onFailure) instead of dying silently.
 */

type Brand = "ripple" | "bwk";

export const voicedScriptDailyFn = inngest.createFunction(
  {
    id: "voiced-script-daily",
    name: "Content Factory — Voiced Video Scripts",
    retries: 2,
    triggers: [{ cron: "0 12 * * *" }, { event: "content-factory/voiced.script" }],
    onFailure: async ({ event, error }) => {
      const { sendFailureEmail } = await import("@/lib/content-factory/voiced");
      const data = (event.data.event?.data ?? {}) as { date?: string; brand?: Brand };
      await sendFailureEmail(
        data.date ?? new Date().toISOString().slice(0, 10),
        data.brand ?? "ripple",
        "Script writing",
        error.message
      ).catch(() => {});
    },
  },
  async ({ event, step }) => {
    const data = (event?.data ?? {}) as { date?: string; brand?: Brand; force?: boolean };
    const date = data.date ?? new Date(typeof event?.ts === "number" ? event.ts : Date.now()).toISOString().slice(0, 10);
    const { VOICED_BRANDS } = await import("@/lib/content-factory/voiced");
    const brands = data.brand ? [data.brand] : VOICED_BRANDS;
    const done: string[] = [];
    // BWK first, then Ripple (Keenan's email order).
    for (const brand of brands) {
      const fresh = await step.run(`script-${brand}`, async () => {
        const { readScript, writeVoicedScript, writeJson, voicedDir, writeState } = await import(
          "@/lib/content-factory/voiced"
        );
        if (!data.force && (await readScript(date, brand))) return false;
        const script = await writeVoicedScript(date, brand);
        await writeJson(`${voicedDir(date, brand)}/script.json`, script);
        await writeState(date, brand, { status: "scripted", error: undefined });
        return true;
      });
      if (!fresh) continue;
      await step.run(`email-${brand}`, async () => {
        const { readScript, sendScriptEmail } = await import("@/lib/content-factory/voiced");
        const script = await readScript(date, brand);
        if (script) await sendScriptEmail(script);
      });
      await step.sendEvent(`clips-${brand}`, { name: "content-factory/voiced.clips", data: { date, brand } });
      done.push(brand);
    }
    return { date, scripted: done };
  }
);

export const voicedClipsFn = inngest.createFunction(
  {
    id: "voiced-clips",
    name: "Content Factory — Voiced Video Shots",
    retries: 2,
    concurrency: { key: "event.data.date + '-' + event.data.brand", limit: 1 },
    triggers: [{ event: "content-factory/voiced.clips" }],
    onFailure: async ({ event, error }) => {
      const { sendFailureEmail } = await import("@/lib/content-factory/voiced");
      const d = event.data.event.data as { date: string; brand: Brand };
      await sendFailureEmail(d.date, d.brand, "Shot generation", error.message).catch(() => {});
    },
  },
  async ({ event, step, logger }) => {
    const { date, brand } = event.data as { date: string; brand: Brand };
    const script = await step.run("load-script", async () => {
      const { readScript } = await import("@/lib/content-factory/voiced");
      const s = await readScript(date, brand);
      if (!s) throw new Error(`No voiced script for ${brand} ${date}`);
      return s;
    });
    const n = script.lines.length;

    // 1. One photo per line (Opus-checked, people-free), as a 9:16 start frame.
    const images: (string | null)[] = [];
    for (let i = 0; i < n; i++) {
      images.push(
        await step.run(`image-${i}`, async () => {
          const { generateImage, generateCheckedImage } = await import("@/lib/content-factory/carousel-generate");
          const { shotImagePrompt, uploadFile, voicedDir } = await import("@/lib/content-factory/voiced");
          const { toStartFrame } = await import("@/lib/content-factory/voiced-video");
          const line = script.lines[i];
          const prompt = await shotImagePrompt(brand, line.scene);
          try {
            const { buffer, qc } = await generateCheckedImage(() => generateImage(prompt, "item"), {
              scene: line.scene,
              slot: "item",
              personAllowed: false,
            });
            logger.info(`[voiced] ${brand} shot ${i} image quality: ${qc}`);
            return uploadFile(`${voicedDir(date, brand)}/shot-${i}.jpg`, await toStartFrame(buffer), "image/jpeg");
          } catch (err) {
            logger.warn(`[voiced] ${brand} shot ${i} image failed: ${err instanceof Error ? err.message : err}`);
            return null;
          }
        })
      );
    }
    if (images.every((u) => !u)) throw new Error("Every shot image failed to generate");

    // 2. Higgsfield clips in waves — primary model, then the fallback for
    // whatever it didn't deliver (same pattern as the post-video builder).
    const { POST_VIDEO_WAVE, POST_VIDEO_MODEL, POST_VIDEO_FALLBACK_MODEL, POST_VIDEO_ROUNDS } = await import(
      "@/lib/content-factory/post-video"
    );
    const attemptModels = [...new Set([POST_VIDEO_MODEL, POST_VIDEO_FALLBACK_MODEL].filter(Boolean))];
    const want = images.map((u, i) => (u ? i : -1)).filter((i) => i >= 0);
    const clips: Record<number, { url: string; model: string } | null> = {};
    for (let w = 0; w * POST_VIDEO_WAVE < want.length; w++) {
      let remaining = want.slice(w * POST_VIDEO_WAVE, (w + 1) * POST_VIDEO_WAVE);
      for (let a = 0; a < attemptModels.length && remaining.length > 0; a++) {
        const model = attemptModels[a];
        const batch = remaining;
        const jobs = await step.run(`submit-${w}-${a}`, async () => {
          const { submitCoverVideo } = await import("@/lib/content-factory/animate-cover");
          const { shotMotionPrompt, writeJson, voicedDir } = await import("@/lib/content-factory/voiced");
          const errors: string[] = [];
          const submitted = await Promise.all(
            batch.map(async (i) => {
              try {
                const id = await submitCoverVideo({
                  startImageUrl: images[i]!,
                  prompt: shotMotionPrompt(script.lines[i].scene, script.lines[i].motion),
                  duration: 5,
                  model,
                });
                return { i, id: id as string | null, model };
              } catch (err) {
                errors.push(`shot ${i} ${model}: ${err instanceof Error ? err.message : err}`);
                return { i, id: null as string | null, model };
              }
            })
          );
          await writeJson(`${voicedDir(date, brand)}/submit-${w}-${a}.json`, { at: new Date().toISOString(), submitted, errors });
          return submitted;
        });
        let pending = jobs.filter((j) => j.id);
        const rounds = POST_VIDEO_ROUNDS[a] ?? 20;
        for (let round = 0; round < rounds && pending.length > 0; round++) {
          await step.sleep(`wait-${w}-${a}-${round}`, "30s");
          const results = await step.run(`poll-${w}-${a}-${round}`, async () => {
            const { checkCoverVideo } = await import("@/lib/content-factory/animate-cover");
            return Promise.all(
              pending.map(async (j) => {
                try {
                  const st = await checkCoverVideo(j.id!, j.model);
                  if (st.status === "completed" && st.videoUrl) return { i: j.i, state: "done" as const, url: st.videoUrl };
                  if (st.status === "queued" || st.status === "in_progress") return { i: j.i, state: "wait" as const };
                  return { i: j.i, state: "failed" as const, reason: st.status };
                } catch (err) {
                  return { i: j.i, state: "wait" as const, reason: err instanceof Error ? err.message : String(err) };
                }
              })
            );
          });
          for (const r of results) {
            if (r.state === "done") clips[r.i] = { url: r.url, model };
            if (r.state === "failed") logger.warn(`[voiced] ${model} clip for shot ${r.i} ended ${r.reason}`);
          }
          const settled = new Set(results.filter((r) => r.state !== "wait").map((r) => r.i));
          pending = pending.filter((j) => !settled.has(j.i));
        }
        remaining = batch.filter((i) => !clips[i]);
      }
    }

    // 3. Copy the clips into our bucket (Higgsfield URLs don't live forever;
    // the recording can arrive hours later).
    await step.run("store-clips", async () => {
      const { downloadUrl, uploadFile, writeJson, voicedDir } = await import("@/lib/content-factory/voiced");
      const shots = await Promise.all(
        images.map(async (imageUrl, i) => {
          const c = clips[i];
          if (!c) return { imageUrl, clipUrl: null };
          try {
            const url = await uploadFile(`${voicedDir(date, brand)}/clip-${i}.mp4`, await downloadUrl(c.url), "video/mp4");
            return { imageUrl, clipUrl: url, model: c.model };
          } catch {
            return { imageUrl, clipUrl: null };
          }
        })
      );
      await writeJson(`${voicedDir(date, brand)}/clips.json`, { status: "done", shots, updatedAt: new Date().toISOString() });
    });
    return { date, brand, images: images.filter(Boolean).length, clips: Object.values(clips).filter(Boolean).length };
  }
);

export const voicedBuildFn = inngest.createFunction(
  {
    id: "voiced-build",
    name: "Content Factory — Voiced Video Build",
    retries: 1,
    // A re-upload queues behind the running build and rebuilds from the newest recording.
    concurrency: { key: "event.data.date + '-' + event.data.brand", limit: 1 },
    triggers: [{ event: "content-factory/voiced.build" }],
    onFailure: async ({ event, error }) => {
      const { sendFailureEmail, writeState } = await import("@/lib/content-factory/voiced");
      const d = event.data.event.data as { date: string; brand: Brand };
      await writeState(d.date, d.brand, { status: "failed", error: error.message.slice(0, 500) }).catch(() => {});
      await sendFailureEmail(d.date, d.brand, "Video build", error.message).catch(() => {});
    },
  },
  async ({ event, step }) => {
    const { date, brand } = event.data as { date: string; brand: Brand };
    const base = `voiced/${date}/${brand}`;

    const start = await step.run("load", async () => {
      const { readScript, readState, writeState } = await import("@/lib/content-factory/voiced");
      const [script, state] = await Promise.all([readScript(date, brand), readState(date, brand)]);
      if (!script) throw new Error(`No voiced script for ${brand} ${date}`);
      if (!state?.recordingPath) throw new Error("No recording uploaded yet");
      if (state.status === "approved") return { skip: true as const, script, recordingPath: state.recordingPath };
      await writeState(date, brand, { status: "building", error: undefined });
      return { skip: false as const, script, recordingPath: state.recordingPath };
    });
    if (start.skip) return { skipped: "already approved" };
    const { script, recordingPath } = start;

    // Shots may still be rendering if he recorded fast: wait up to ~45 min.
    let clips = null as Awaited<ReturnType<typeof import("@/lib/content-factory/voiced").readClips>>;
    for (let i = 0; i < 45; i++) {
      clips = await step.run(`clips-${i}`, async () => {
        const { readClips } = await import("@/lib/content-factory/voiced");
        return readClips(date, brand);
      });
      if (clips?.status === "done") break;
      await step.sleep(`clips-wait-${i}`, "60s");
    }
    if (clips?.status !== "done") throw new Error("The shots for this video never finished rendering");
    const shots = clips.shots;

    const voice = await step.run("voice", async () => {
      const { downloadUrl, publicUrl, uploadFile } = await import("@/lib/content-factory/voiced");
      const { normalizeVoice } = await import("@/lib/content-factory/voiced-video");
      const raw = await downloadUrl(publicUrl(recordingPath));
      const ext = recordingPath.split(".").pop() ?? "m4a";
      const { buf, seconds } = await normalizeVoice(raw, ext);
      if (seconds < 5) throw new Error(`The recording is only ${seconds.toFixed(1)}s after trimming silence`);
      return { url: await uploadFile(`${base}/voice.m4a`, buf, "audio/mp4"), seconds };
    });

    const timeline = await step.run("transcribe-align", async () => {
      const { downloadUrl, writeJson } = await import("@/lib/content-factory/voiced");
      const { transcribeVoice, alignToScript } = await import("@/lib/content-factory/voiced-video");
      const lines = script.lines.map((l) => l.text);
      const { text, words } = await transcribeVoice(await downloadUrl(voice.url), lines.join(" "));
      const t = alignToScript(lines, words, voice.seconds);
      await writeJson(`${base}/timeline.json`, { text, words, ...t });
      return t;
    });

    const segments: string[] = [];
    for (let i = 0; i < script.lines.length; i++) {
      segments.push(
        await step.run(`segment-${i}`, async () => {
          const { downloadUrl, uploadFile } = await import("@/lib/content-factory/voiced");
          const { renderShotSegment, captionsForSegment } = await import("@/lib/content-factory/voiced-video");
          const s0 = timeline.boundaries[i];
          const s1 = timeline.boundaries[i + 1];
          // A shot whose photo failed borrows the nearest one that exists.
          const shot = shots[i];
          const fallbackImage = shots.find((s) => s.imageUrl)?.imageUrl ?? null;
          const imageUrl = shot?.imageUrl ?? fallbackImage;
          if (!imageUrl) throw new Error("No shot images available");
          const [image, clip] = await Promise.all([
            downloadUrl(imageUrl),
            shot?.clipUrl ? downloadUrl(shot.clipUrl).catch(() => null) : Promise.resolve(null),
          ]);
          const buf = await renderShotSegment({
            clip,
            image,
            seconds: s1 - s0,
            captions: await captionsForSegment(timeline.captions, s0, s1),
          });
          return uploadFile(`${base}/seg-${i}.mp4`, buf, "video/mp4");
        })
      );
    }

    const built = await step.run("join", async () => {
      const { downloadUrl, uploadFile, voicedVideoPath, writeState } = await import("@/lib/content-factory/voiced");
      const { joinVoicedVideo } = await import("@/lib/content-factory/voiced-video");
      const { pickMusicTrack } = await import("@/lib/content-factory/slideshow-reel");
      const [segBufs, voiceBuf, music] = await Promise.all([
        Promise.all(segments.map(downloadUrl)),
        downloadUrl(voice.url),
        pickMusicTrack(`voiced-${brand}`, brand),
      ]);
      const { buf, seconds } = await joinVoicedVideo({
        segments: segBufs,
        voice: voiceBuf,
        voiceSeconds: voice.seconds,
        musicUrl: music,
        ctaUrl: `https://goripple.io/cta-slide-${brand}.jpg`,
      });
      // Cache-bust: a rebuild overwrites the same path.
      const url = `${await uploadFile(voicedVideoPath(date, brand), buf, "video/mp4")}?v=${Date.now()}`;
      await writeState(date, brand, { status: "built", videoUrl: url, seconds, builtAt: new Date().toISOString() });
      return { url, seconds };
    });

    await step.run("email", async () => {
      const { readState, sendBuiltEmail, downloadUrl } = await import("@/lib/content-factory/voiced");
      const state = await readState(date, brand);
      const video = await downloadUrl(built.url).catch(() => null);
      await sendBuiltEmail(script, state!, video);
    });

    return { date, brand, seconds: built.seconds, matched: `${timeline.matched}/${timeline.spoken}` };
  }
);
