import { inngest } from "@/inngest/client";

/**
 * POST VIDEO — event "content-factory/post-video.build" (2026-09-26, per
 * Keenan: "higgsfield needs to build VIDEOS to post to all instagram and
 * facebook posts using higgsfield API"). Sent by carousel-daily for every
 * generated post. See lib/content-factory/post-video.ts for the design.
 *
 * Always ends with a video at reels/<postId>.mp4: slides whose clip fails
 * (or that can't be animated without warping their words) become slow
 * push-in stills, so one bad clip never costs the post its video. Only a
 * crash (onFailure) leaves the publisher to render its own slideshow.
 *
 * Concurrency 1 + waves of POST_VIDEO_WAVE clips keeps the whole night
 * under Higgsfield's ~4-jobs-per-account cap (past it, jobs vanish
 * silently — see the 2026-08-10 notes).
 */

type PlannedSlide =
  | {
      mode: "live";
      rawUrl: string;
      /** Stored text layer; null = legacy moody slide, rebuilt at prepare. */
      layerUrl: string | null;
      imagePrompt: string;
      overlayText: string;
      kind: string;
      seconds: number;
      person: boolean;
    }
  | { mode: "still"; imageUrl: string; seconds: number };

export const carouselPostVideoFn = inngest.createFunction(
  {
    id: "carousel-post-video",
    name: "Content Factory — Higgsfield Post Video",
    retries: 1,
    concurrency: { limit: 1 },
    triggers: [{ event: "content-factory/post-video.build" }],
    onFailure: async ({ event, error }) => {
      const postId = (event.data as { event?: { data?: { postId?: string } } })?.event?.data?.postId;
      if (!postId) return;
      try {
        const { writeVideoMarker, requestDigestCheck } = await import("@/lib/content-factory/post-video");
        await writeVideoMarker(postId, { status: "failed", error: error?.message ?? String(error) });
        const { prisma } = await import("@/lib/prisma");
        const post = await prisma.carouselPost.findUnique({
          where: { id: postId },
          select: { lane: true, generatedFor: true },
        });
        if (post) {
          const { laneBrand } = await import("@/lib/content-factory/social-publish");
          await requestDigestCheck(await laneBrand(post.lane), post.generatedFor.toISOString().slice(0, 10));
        }
      } catch {
        // best effort
      }
    },
  },
  async ({ event, step, logger }) => {
    const { postId, music: musicOpts, model: forcedModel } = event.data as {
      postId: string;
      /** Rebuild options (2026-09-30): a longer minimum and songs to avoid. */
      music?: { minSeconds?: number; exclude?: string[] };
      /**
       * Rebuild with this Higgsfield model first (2026-10-05, per Keenan:
       * "remake the same video but with kling"). Skips the clip cache so
       * every slide is re-rendered on it.
       */
      model?: string;
    };

    // ── 0. Legendary Mythicals cinematic shot (mythic-colossus, 2026-10-04):
    // one Kling 3.0 15s render with its own sound, faded in and out. ──
    const cine = await step.run("cinematic-check", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { isCinematicSlug, decodeCinematicPrompt } = await import("@/lib/content-factory/cinematic-shot");
      const post = await prisma.carouselPost.findUniqueOrThrow({
        where: { id: postId },
        select: {
          topicSlug: true,
          lane: true,
          generatedFor: true,
          slides: { where: { order: 0 }, select: { rawImageUrl: true, imagePrompt: true } },
        },
      });
      if (!isCinematicSlug(post.topicSlug)) return null;
      const cover = post.slides[0];
      const decoded = cover ? decodeCinematicPrompt(cover.imagePrompt) : null;
      const motion = decoded?.motion ?? null;
      if (!cover?.rawImageUrl || !motion) throw new Error(`Cinematic post ${postId} is missing its start frame or motion prompt`);
      const { laneBrand } = await import("@/lib/content-factory/social-publish");
      return {
        lane: post.lane,
        brand: await laneBrand(post.lane),
        date: post.generatedFor.toISOString().slice(0, 10),
        // Reveal: hidden start frame → full encounter end frame (2026-10-04).
        imageUrl: decoded?.startFrame ?? cover.rawImageUrl,
        lastImageUrl: decoded?.startFrame ? decoded.endFrame : null,
        motion,
      };
    });
    if (cine) {
      const { cinematicModels } = await import("@/lib/content-factory/cinematic-shot");
      // A rebuild reuses a finished render instead of paying for another.
      let clip = await step.run("cinematic-cached", async () => {
        const { supabase } = await import("@/lib/supabase.server");
        const { data } = await supabase.storage.from("content-factory").download(`living/${postId}/cinematic.json`);
        if (!data) return null;
        try {
          return JSON.parse(await data.text()) as { url: string; model: string; estimate?: unknown };
        } catch {
          return null;
        }
      });
      const tried: string[] = [];
      for (const [a, model] of cinematicModels().entries()) {
        if (clip) break;
        const sub = await step.run(`cinematic-submit-${a}`, async () => {
          const { submitCinematicVideo } = await import("@/lib/content-factory/cinematic-shot");
          const { noteSubmitWave } = await import("@/lib/content-factory/post-video");
          try {
            const r = await submitCinematicVideo({ model, imageUrl: cine.imageUrl, lastImageUrl: cine.lastImageUrl, prompt: cine.motion });
            await noteSubmitWave(1, []);
            console.log(`[post-video] ${postId} cinematic ${model} submitted ${r.requestId}, estimate ${JSON.stringify(r.estimate)}`);
            return { id: r.requestId, estimate: r.estimate, error: null as string | null, creditsOut: false };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const creditsOut = await noteSubmitWave(0, [msg]);
            return { id: null as string | null, estimate: null, error: msg, creditsOut };
          }
        });
        tried.push(`${model}: ${sub.id ? "submitted" : sub.error}`);
        if (sub.creditsOut) break;
        if (!sub.id) continue;
        // 4K renders take ~5-15 min; allow 30 min, then fall back.
        for (let round = 0; round < 60 && !clip; round++) {
          await step.sleep(`cinematic-wait-${a}-${round}`, "30s");
          const st = await step.run(`cinematic-poll-${a}-${round}`, async () => {
            const { checkCoverVideo } = await import("@/lib/content-factory/animate-cover");
            try {
              return await checkCoverVideo(sub.id!, model);
            } catch {
              return { status: "in_progress" as const, videoUrl: null };
            }
          });
          if (st.status === "completed" && st.videoUrl) {
            clip = { url: st.videoUrl, model, estimate: sub.estimate };
            break;
          }
          if (st.status !== "queued" && st.status !== "in_progress") {
            tried.push(`${model}: ended ${st.status}`);
            break;
          }
        }
      }
      if (!clip) throw new Error(`Cinematic render failed: ${tried.join("; ") || "no model tried"}`);
      const done = clip;

      const result = await step.run("cinematic-finish", async () => {
        const { supabase } = await import("@/lib/supabase.server");
        const { finishCinematicVideo } = await import("@/lib/content-factory/living-reel");
        const { pickMusicTrack } = await import("@/lib/content-factory/slideshow-reel");
        const { reelPath, writeVideoMarker } = await import("@/lib/content-factory/post-video");
        const res = await fetch(done.url);
        if (!res.ok) throw new Error(`Cinematic clip download failed (${res.status})`);
        const raw = Buffer.from(await res.arrayBuffer());
        // Keep the full-resolution render (Higgsfield deletes outputs after ~7 days).
        const origPath = `living/${postId}/cinematic-original.mp4`;
        await supabase.storage.from("content-factory").upload(origPath, raw, { contentType: "video/mp4", upsert: true });
        const originalUrl = supabase.storage.from("content-factory").getPublicUrl(origPath).data.publicUrl;
        await supabase.storage
          .from("content-factory")
          .upload(`living/${postId}/cinematic.json`, Buffer.from(JSON.stringify({ ...done, url: originalUrl })), {
            contentType: "application/json",
            upsert: true,
          });
        // No text on screen (2026-10-04); fades in and out (finishCinematicVideo).
        const { buf, seconds, audio } = await finishCinematicVideo({
          clip: raw,
          music: () => pickMusicTrack(cine.lane, undefined, { minSeconds: 15 }),
        });
        const path = reelPath(postId);
        const { error } = await supabase.storage.from("content-factory").upload(path, buf, { contentType: "video/mp4", upsert: true });
        if (error) throw new Error(`Video upload failed: ${error.message}`);
        const url = supabase.storage.from("content-factory").getPublicUrl(path).data.publicUrl;
        const { prisma } = await import("@/lib/prisma");
        await prisma.carouselPost.update({ where: { id: postId }, data: { reelTransition: `higgsfield:${done.model}` } });
        await writeVideoMarker(postId, { status: "done", url, source: "higgsfield", model: done.model, liveSlides: 1, totalSlides: 1 });
        console.log(`[post-video] ${postId} cinematic done: ${done.model}, ${seconds.toFixed(1)}s, audio ${audio}, ${buf.length} bytes`);
        return { url, originalUrl, seconds, bytes: buf.length, audio, model: done.model };
      });

      await step.run("digest-check", async () => {
        const { requestDigestCheck } = await import("@/lib/content-factory/post-video");
        await requestDigestCheck(cine.brand, cine.date);
      });
      return { postId, cinematic: true, ...result };
    }

    // ── 1. Plan: which slides animate, which stay still ──────────────
    const plan = await step.run("plan", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { trimLegacyPickList, laneBrand } = await import("@/lib/content-factory/social-publish");
      const { textLayerUrlFor } = await import("@/lib/content-factory/carousel-generate");
      const { postVideoSlideSeconds } = await import("@/lib/content-factory/post-video");
      const post = await prisma.carouselPost.findUniqueOrThrow({
        where: { id: postId },
        select: {
          lane: true,
          generatedFor: true,
          slides: {
            where: { kind: { notIn: ["SCENE", "CTA"] } },
            orderBy: { order: "asc" },
            select: { kind: true, imageUrl: true, rawImageUrl: true, imagePrompt: true, overlayText: true },
          },
        },
      });
      const slides: PlannedSlide[] = [];
      for (const s of trimLegacyPickList(post.slides)) {
        const seconds = postVideoSlideSeconds(post.lane, s.kind, s.overlayText);
        let layerUrl: string | null = null;
        let live = false;
        if (s.rawImageUrl) {
          const candidate = textLayerUrlFor(s.imageUrl);
          const head = await fetch(candidate, { method: "HEAD" }).catch(() => null);
          if (head?.ok) {
            layerUrl = candidate;
            live = true;
          } else if (/DIM and shadowed|SOFT and LIGHT/.test(s.imagePrompt ?? "")) {
            // Moody slide generated before text layers were stored: the
            // layer is rebuilt from the same overlay style at prepare.
            live = true;
          }
        }
        slides.push(
          live
            ? {
                mode: "live",
                rawUrl: s.rawImageUrl!,
                layerUrl,
                imagePrompt: s.imagePrompt,
                overlayText: s.overlayText,
                kind: s.kind,
                seconds,
                person: post.lane === "selfie" && (s.kind === "COVER" || /mirror/i.test(s.imagePrompt)),
              }
            : { mode: "still", imageUrl: s.imageUrl, seconds }
        );
      }
      return {
        lane: post.lane,
        brand: await laneBrand(post.lane),
        date: post.generatedFor.toISOString().slice(0, 10),
        slides,
      };
    });

    const configured = await step.run("check-higgsfield", async () => {
      return Boolean(process.env.HIGGSFIELD_API_KEY && process.env.HIGGSFIELD_API_SECRET);
    });
    // Budget: only the first N animatable slides get a clip; the rest
    // become push-in stills (see maxAnimatedSlides).
    const { maxAnimatedSlides } = await import("@/lib/content-factory/post-video");
    const liveIdx = configured
      ? plan.slides
          .map((s, i) => (s.mode === "live" ? i : -1))
          .filter((i) => i >= 0)
          .slice(0, maxAnimatedSlides(plan.brand, plan.lane))
      : [];
    logger.info(
      `[post-video] ${postId} (${plan.lane}): ${liveIdx.length} animated / ${plan.slides.length} slides${configured ? "" : " — Higgsfield not configured"}`
    );

    // ── 2. Base frame (+ rebuilt layer) per animated slide ───────────
    const prepared: Record<number, { baseUrl: string; layerUrl: string; prompt: string }> = {};
    for (const i of liveIdx) {
      const s = plan.slides[i] as Extract<PlannedSlide, { mode: "live" }>;
      prepared[i] = await step.run(`prepare-${i}`, async () => {
        const { supabase } = await import("@/lib/supabase.server");
        const { buildLivingSlideLayer, livingMotionPrompt } = await import(
          "@/lib/content-factory/living-reel"
        );
        const { default: sharp } = await import("sharp");
        const res = await fetch(s.rawUrl);
        if (!res.ok) throw new Error(`Raw photo fetch failed (${res.status}): ${s.rawUrl}`);
        const raw = Buffer.from(await res.arrayBuffer());
        const up = async (p: string, buf: Buffer, type: string) => {
          const { error } = await supabase.storage
            .from("content-factory")
            .upload(p, buf, { contentType: type, upsert: true });
          if (error) throw new Error(`Upload failed (${p}): ${error.message}`);
          return supabase.storage.from("content-factory").getPublicUrl(p).data.publicUrl;
        };
        let base: Buffer;
        let layerUrl = s.layerUrl;
        if (layerUrl) {
          // Same resize as compose's buildTextLayer, so the layer lines up.
          base = await sharp(raw)
            .resize(1080, 1920, { fit: "cover", position: "centre" })
            .sharpen({ sigma: 0.6 })
            .jpeg({ quality: 95 })
            .toBuffer();
        } else {
          const built = await buildLivingSlideLayer({
            raw,
            overlayText: s.overlayText,
            lane: plan.lane,
            slideKind: s.kind,
            imagePrompt: s.imagePrompt,
          });
          base = built.base;
          layerUrl = await up(`living/${postId}/layer-${i}.png`, built.layer, "image/png");
        }
        return {
          baseUrl: await up(`living/${postId}/base-${i}.jpg`, base, "image/jpeg"),
          layerUrl,
          // Legendary Mythicals: the creature itself acts (action mode).
          prompt: livingMotionPrompt(s.imagePrompt, {
            person: s.person,
            action: plan.brand === "mythicals" || !!plan.lane?.startsWith("pick-"),
            realistic: !!plan.lane?.startsWith("pick-"),
            calm: plan.lane === "pick-bwk",
          }),
        };
      });
    }

    // ── 3. Higgsfield clips, in waves ────────────────────────────────
    // Finished clip URLs are cached per post, so a rerun after an assembly
    // failure doesn't pay Higgsfield for the same clips again.
    const cached = await step.run("load-cached-clips", async () => {
      const { supabase } = await import("@/lib/supabase.server");
      const { data } = await supabase.storage.from("content-factory").download(`living/${postId}/clips.json`);
      if (!data || forcedModel) return null;
      try {
        const c = JSON.parse(await data.text()) as { clips: Record<string, string | null>; models: string[] };
        return liveIdx.every((i) => c.clips[i]) ? c : null;
      } catch {
        return null;
      }
    });
    const clips: Record<number, string | null> = cached ? { ...cached.clips } : {};
    const models: string[] = cached ? [...cached.models] : [];
    const { POST_VIDEO_WAVE, POST_VIDEO_MODEL, POST_VIDEO_FALLBACK_MODEL, POST_VIDEO_ROUNDS } = await import(
      "@/lib/content-factory/post-video"
    );
    const attemptModels = [...new Set([forcedModel, POST_VIDEO_MODEL, POST_VIDEO_FALLBACK_MODEL].filter((m): m is string => !!m))].slice(0, 2);
    // Out of Higgsfield credits (2026-10-02): stop submitting for this post
    // and ship stills on purpose (the health check won't rebuild it).
    let noCredits = false;
    for (let w = 0; !cached && w * POST_VIDEO_WAVE < liveIdx.length; w++) {
      let remaining = liveIdx.slice(w * POST_VIDEO_WAVE, (w + 1) * POST_VIDEO_WAVE);
      for (const i of remaining) clips[i] = null;
      // Primary model first; whatever it doesn't deliver in time (failed
      // submit, failed clip, or still queued) goes to the fallback once.
      for (let a = 0; a < attemptModels.length && remaining.length > 0 && !noCredits; a++) {
        const model = attemptModels[a];
        const batch = remaining;
        const jobs = await step.run(`submit-${w}-${a}`, async () => {
          const { submitCoverVideo } = await import("@/lib/content-factory/animate-cover");
          const errors: string[] = [];
          const submitted = await Promise.all(
            batch.map(async (i) => {
              try {
                const id = await submitCoverVideo({
                  startImageUrl: prepared[i].baseUrl,
                  prompt: prepared[i].prompt,
                  duration: 5,
                  model,
                });
                return { i, id: id as string | null, model };
              } catch (err) {
                errors.push(`slide ${i} ${model}: ${err instanceof Error ? err.message : err}`);
                return { i, id: null as string | null, model };
              }
            })
          );
          // Submit log beside the build (ops scripts can read Storage, not Inngest logs).
          const { supabase } = await import("@/lib/supabase.server");
          await supabase.storage
            .from("content-factory")
            .upload(
              `living/${postId}/submit-${w}-${a}.json`,
              Buffer.from(JSON.stringify({ at: new Date().toISOString(), submitted, errors }, null, 1)),
              { contentType: "application/json", upsert: true }
            );
          const { noteSubmitWave } = await import("@/lib/content-factory/post-video");
          const creditsOut = await noteSubmitWave(submitted.filter((j) => j.id).length, errors);
          return { submitted, creditsOut };
        });
        if (jobs.creditsOut) {
          noCredits = true;
          logger.warn(`[post-video] Higgsfield is out of credits — ${postId} ships as stills`);
          break;
        }
        let pending = jobs.submitted.filter((j) => j.id);
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
                  // A status hiccup isn't a failed clip — ask again next round.
                  return { i: j.i, state: "wait" as const, reason: err instanceof Error ? err.message : String(err) };
                }
              })
            );
          });
          for (const r of results) {
            if (r.state === "done") {
              clips[r.i] = r.url;
              models.push(model);
            }
            if (r.state === "failed") logger.warn(`[post-video] ${model} clip for slide ${r.i} ended ${r.reason}`);
          }
          const settled = new Set(results.filter((r) => r.state !== "wait").map((r) => r.i));
          pending = pending.filter((j) => !settled.has(j.i));
        }
        remaining = batch.filter((i) => !clips[i]);
        if (remaining.length > 0) {
          logger.warn(
            `[post-video] ${model} left ${remaining.length} clip(s) undelivered in wave ${w}${a + 1 < attemptModels.length ? ` — retrying on ${attemptModels[a + 1]}` : " — those slides go still"}`
          );
        }
      }
    }

    if (!cached && liveIdx.some((i) => clips[i])) {
      await step.run("cache-clips", async () => {
        const { supabase } = await import("@/lib/supabase.server");
        await supabase.storage
          .from("content-factory")
          .upload(`living/${postId}/clips.json`, Buffer.from(JSON.stringify({ clips, models })), {
            contentType: "application/json",
            upsert: true,
          });
      });
    }

    // ── 4. One segment per slide (own step each — a single big ffmpeg
    // graph stalled past the 300s cap in prod, 2026-09-27) ───────────
    const segments: { url: string; seconds: number; still: boolean }[] = [];
    for (let i = 0; i < plan.slides.length; i++) {
      segments.push(
        await step.run(`segment-${i}`, async () => {
          const { supabase } = await import("@/lib/supabase.server");
          const { renderSlideSegment, LIVING_CLIP_SEC } = await import("@/lib/content-factory/living-reel");
          const get = async (u: string) => {
            const r = await fetch(u);
            if (!r.ok) throw new Error(`Download failed (${r.status}): ${u}`);
            return Buffer.from(await r.arrayBuffer());
          };
          const s = plan.slides[i];
          const clipUrl = clips[i];
          let slide;
          if (s.mode === "live" && clipUrl && prepared[i]) {
            const [clip, layer] = await Promise.all([get(clipUrl), get(prepared[i].layerUrl)]);
            slide = { kind: "live" as const, clip, layer, seconds: s.seconds };
          } else if (s.mode === "still") {
            slide = { kind: "still" as const, image: await get(s.imageUrl), seconds: s.seconds };
          } else {
            // Animated slide whose clip failed: use its finished JPEG.
            const { prisma } = await import("@/lib/prisma");
            const row = await prisma.carouselSlide.findFirst({
              where: { carouselPostId: postId, rawImageUrl: s.rawUrl },
              select: { imageUrl: true },
            });
            slide = { kind: "still" as const, image: await get(row!.imageUrl), seconds: s.seconds };
          }
          const buf = await renderSlideSegment(slide, { first: i === 0, clipSeconds: LIVING_CLIP_SEC });
          const p = `living/${postId}/seg-${i}.mp4`;
          const { error } = await supabase.storage
            .from("content-factory")
            .upload(p, buf, { contentType: "video/mp4", upsert: true });
          if (error) throw new Error(`Segment upload failed (${p}): ${error.message}`);
          return {
            url: supabase.storage.from("content-factory").getPublicUrl(p).data.publicUrl,
            seconds: s.seconds,
            still: slide.kind === "still",
          };
        })
      );
    }

    // ── 5. Join + music, store at the publisher's path ───────────────
    const result = await step.run("join", async () => {
      const t0 = Date.now();
      const { supabase } = await import("@/lib/supabase.server");
      const { joinPostVideo } = await import("@/lib/content-factory/living-reel");
      const { pickMusicTrack } = await import("@/lib/content-factory/slideshow-reel");
      const { reelPath, writeVideoMarker } = await import("@/lib/content-factory/post-video");
      const bufs = await Promise.all(
        segments.map(async (sg) => {
          const r = await fetch(sg.url);
          if (!r.ok) throw new Error(`Segment download failed (${r.status}): ${sg.url}`);
          return { buf: Buffer.from(await r.arrayBuffer()), seconds: sg.seconds, still: sg.still };
        })
      );
      const live = segments.filter((sg) => !sg.still).length;
      // Song must cover the whole reel, no looping (2026-09-30, per Keenan).
      const ctaSec = plan.brand === "mythicals" || (plan.lane?.startsWith("pick-") && process.env.PICK_CTA !== "1") ? 0 : 3;
      const reelSec = segments.reduce((a, sg) => a + sg.seconds, 0) + ctaSec;
      const music = await pickMusicTrack(plan.lane, undefined, {
        minSeconds: Math.max(Math.ceil(reelSec), musicOpts?.minSeconds ?? 0),
        exclude: musicOpts?.exclude,
      });
      if (!music) throw new Error(`No music track at least ${Math.ceil(reelSec)}s long for lane ${plan.lane}`);
      console.log(`[post-video] ${postId}: music ${music.split("/content-factory/")[1] ?? music}`);
      const { buf, seconds } = await joinPostVideo({
        segments: bufs,
        // Legendary Mythicals posts end on their own "which will you
        // choose?" slide — no app card.
        // Pick lanes skip the Ripple/BWK app card for the 2-week reach test
        // (2026-09-30, per Keenan: "for these first 2 weeks of posts, let's
        // NOT include the ripple callout end slide ... same with bwk").
        // PICK_CTA=1 turns it back on.
        ctaUrl:
          plan.brand === "mythicals" || (plan.lane?.startsWith("pick-") && process.env.PICK_CTA !== "1")
            ? null
            : `https://goripple.io/cta-slide-${plan.brand}.jpg`,
        musicUrl: music,
      });
      console.log(`[post-video] ${postId}: joined in ${Date.now() - t0}ms (${seconds.toFixed(1)}s video)`);
      const path = reelPath(postId);
      const { error } = await supabase.storage
        .from("content-factory")
        .upload(path, buf, { contentType: "video/mp4", upsert: true });
      if (error) throw new Error(`Video upload failed: ${error.message}`);
      const url = supabase.storage.from("content-factory").getPublicUrl(path).data.publicUrl;
      const model = [...new Set(models)].join("+") || undefined;
      const { prisma } = await import("@/lib/prisma");
      // reelTransition doubles as the format tag the metrics loop reads.
      await prisma.carouselPost.update({
        where: { id: postId },
        data: { reelTransition: live > 0 ? `higgsfield:${model ?? "unknown"}` : "stills" },
      });
      await writeVideoMarker(postId, {
        status: "done",
        url,
        source: live > 0 ? "higgsfield" : "stills",
        ...(live === 0 && noCredits ? { stillsReason: "no-credits" as const } : {}),
        model,
        liveSlides: live,
        totalSlides: segments.length,
      });
      return { url, seconds, bytes: buf.length, live, total: segments.length };
    });

    // Instagram copy (2026-10-04, per Keenan): same video, but the music comes
    // from the original-songs library (music-ig/). Facebook keeps the AI-music
    // reel above. Any old -ig file is removed first so a rebuild can never
    // leave Instagram on a stale video.
    await step.run("join-ig", async () => {
      const { supabase } = await import("@/lib/supabase.server");
      // Status beside the build so ops can see why an Instagram copy is
      // missing without Inngest logs (2026-10-04: it silently never appeared).
      const note = async (status: Record<string, unknown>) => {
        await supabase.storage
          .from("content-factory")
          .upload(`living/${postId}/ig-status.json`, Buffer.from(JSON.stringify({ at: new Date().toISOString(), ...status })), {
            contentType: "application/json",
            upsert: true,
          });
      };
      await note({ stage: "started" });
      try {
      const { joinPostVideo } = await import("@/lib/content-factory/living-reel");
      const { pickMusicTrack } = await import("@/lib/content-factory/slideshow-reel");
      const { igReelPath } = await import("@/lib/content-factory/post-video");
      const igPath = igReelPath(postId);
      await supabase.storage.from("content-factory").remove([igPath]);
      const ctaSec = plan.brand === "mythicals" || (plan.lane?.startsWith("pick-") && process.env.PICK_CTA !== "1") ? 0 : 3;
      const reelSec = segments.reduce((a, sg) => a + sg.seconds, 0) + ctaSec;
      const music = await pickMusicTrack(plan.lane, undefined, {
        minSeconds: Math.max(Math.ceil(reelSec), musicOpts?.minSeconds ?? 0),
        exclude: musicOpts?.exclude,
        platform: "instagram",
      });
      if (!music || !music.includes("/music-ig/")) {
        await note({ stage: "skipped", reason: "no original song long enough", music });
        return { ig: false, reason: "no original song long enough — Instagram uses the main reel" };
      }
      await note({ stage: "joining", music });
      const bufs = await Promise.all(
        segments.map(async (sg) => {
          const r = await fetch(sg.url);
          if (!r.ok) throw new Error(`Segment download failed (${r.status}): ${sg.url}`);
          return { buf: Buffer.from(await r.arrayBuffer()), seconds: sg.seconds, still: sg.still };
        })
      );
      const { buf } = await joinPostVideo({
        segments: bufs,
        ctaUrl:
          plan.brand === "mythicals" || (plan.lane?.startsWith("pick-") && process.env.PICK_CTA !== "1")
            ? null
            : `https://goripple.io/cta-slide-${plan.brand}.jpg`,
        musicUrl: music,
      });
      const { error } = await supabase.storage.from("content-factory").upload(igPath, buf, { contentType: "video/mp4", upsert: true });
      if (error) throw new Error(`IG video upload failed: ${error.message}`);
      console.log(`[post-video] ${postId}: instagram copy with ${music.split("/content-factory/")[1] ?? music}`);
      await note({ stage: "done", music, bytes: buf.length });
      return { ig: true, music: music.split("/content-factory/")[1] ?? music };
      } catch (err) {
        await note({ stage: "error", error: String(err instanceof Error ? err.stack ?? err.message : err).slice(0, 1500) });
        // Instagram falls back to the main reel; never fail the whole build.
        return { ig: false, error: String(err).slice(0, 300) };
      }
    });

    await step.run("digest-check", async () => {
      const { requestDigestCheck } = await import("@/lib/content-factory/post-video");
      await requestDigestCheck(plan.brand, plan.date);
    });

    return { postId, ...result };
  }
);
