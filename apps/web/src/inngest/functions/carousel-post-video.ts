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
    const { postId } = event.data as { postId: string };

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
    const liveIdx = configured
      ? plan.slides.map((s, i) => (s.mode === "live" ? i : -1)).filter((i) => i >= 0)
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
          prompt: livingMotionPrompt(s.imagePrompt, { person: s.person }),
        };
      });
    }

    // ── 3. Higgsfield clips, in waves ────────────────────────────────
    const clips: Record<number, string | null> = {};
    const models: string[] = [];
    const { POST_VIDEO_WAVE } = await import("@/lib/content-factory/post-video");
    for (let w = 0; w * POST_VIDEO_WAVE < liveIdx.length; w++) {
      const wave = liveIdx.slice(w * POST_VIDEO_WAVE, (w + 1) * POST_VIDEO_WAVE);
      const jobs = await step.run(`submit-${w}`, async () => {
        const { submitCoverVideo } = await import("@/lib/content-factory/animate-cover");
        const { POST_VIDEO_MODEL } = await import("@/lib/content-factory/post-video");
        const fallback = process.env.HIGGSFIELD_VIDEO_MODEL?.trim();
        return Promise.all(
          wave.map(async (i) => {
            const opts = { startImageUrl: prepared[i].baseUrl, prompt: prepared[i].prompt, duration: 5 };
            try {
              return { i, id: await submitCoverVideo({ ...opts, model: POST_VIDEO_MODEL }), model: POST_VIDEO_MODEL };
            } catch (err) {
              console.warn(`[post-video] ${POST_VIDEO_MODEL} submit failed for slide ${i}: ${err instanceof Error ? err.message : err}`);
              if (!fallback || fallback === POST_VIDEO_MODEL) return { i, id: null, model: POST_VIDEO_MODEL };
              try {
                return { i, id: await submitCoverVideo({ ...opts, model: fallback }), model: fallback };
              } catch (err2) {
                console.warn(`[post-video] ${fallback} submit failed for slide ${i}: ${err2 instanceof Error ? err2.message : err2}`);
                return { i, id: null, model: fallback };
              }
            }
          })
        );
      });
      for (const j of jobs) {
        clips[j.i] = null;
        if (j.id) models.push(j.model);
      }
      let pending = jobs.filter((j) => j.id);
      // Up to ~15 min per wave; anything still out after that goes still.
      for (let round = 0; round < 30 && pending.length > 0; round++) {
        await step.sleep(`wait-${w}-${round}`, "30s");
        const results = await step.run(`poll-${w}-${round}`, async () => {
          const { checkCoverVideo } = await import("@/lib/content-factory/animate-cover");
          return Promise.all(
            pending.map(async (j) => {
              try {
                const st = await checkCoverVideo(j.id!);
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
          if (r.state === "done") clips[r.i] = r.url;
          if (r.state === "failed") logger.warn(`[post-video] clip for slide ${r.i} ended ${r.reason}`);
        }
        const settled = new Set(results.filter((r) => r.state !== "wait").map((r) => r.i));
        pending = pending.filter((j) => !settled.has(j.i));
      }
      if (pending.length > 0) {
        logger.warn(`[post-video] ${pending.length} clip(s) still rendering after 15 min — those slides go still`);
      }
    }

    // ── 4. Assemble + store at the publisher's path ──────────────────
    const result = await step.run("assemble", async () => {
      const { supabase } = await import("@/lib/supabase.server");
      const { assemblePostVideo, LIVING_CLIP_SEC } = await import("@/lib/content-factory/living-reel");
      const { pickMusicTrack } = await import("@/lib/content-factory/slideshow-reel");
      const { reelPath, writeVideoMarker } = await import("@/lib/content-factory/post-video");
      const get = async (u: string) => {
        const r = await fetch(u);
        if (!r.ok) throw new Error(`Download failed (${r.status}): ${u}`);
        return Buffer.from(await r.arrayBuffer());
      };
      const slides = await Promise.all(
        plan.slides.map(async (s, i) => {
          const clipUrl = clips[i];
          if (s.mode === "live" && clipUrl && prepared[i]) {
            const [clip, layer] = await Promise.all([get(clipUrl), get(prepared[i].layerUrl)]);
            return { kind: "live" as const, clip, layer, seconds: s.seconds };
          }
          const imageUrl = s.mode === "still" ? s.imageUrl : null;
          if (imageUrl) return { kind: "still" as const, image: await get(imageUrl), seconds: s.seconds };
          // Animated slide whose clip failed: its finished JPEG sits beside
          // the stored raw ("<slide>-raw.jpg" → "<slide>.jpg").
          const { prisma } = await import("@/lib/prisma");
          const row = await prisma.carouselSlide.findFirst({
            where: { carouselPostId: postId, rawImageUrl: (s as { rawUrl: string }).rawUrl },
            select: { imageUrl: true },
          });
          return { kind: "still" as const, image: await get(row!.imageUrl), seconds: s.seconds };
        })
      );
      const live = slides.filter((s) => s.kind === "live").length;
      const music = await pickMusicTrack(plan.lane);
      if (!music) throw new Error(`No music track for lane ${plan.lane}`);
      const { buf, seconds } = await assemblePostVideo({
        slides,
        clipSeconds: LIVING_CLIP_SEC,
        ctaUrl: `https://goripple.io/cta-slide-${plan.brand}.jpg`,
        musicUrl: music,
      });
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
        model,
        liveSlides: live,
        totalSlides: slides.length,
      });
      return { url, seconds, bytes: buf.length, live, total: slides.length };
    });

    await step.run("digest-check", async () => {
      const { requestDigestCheck } = await import("@/lib/content-factory/post-video");
      await requestDigestCheck(plan.brand, plan.date);
    });

    return { postId, ...result };
  }
);
