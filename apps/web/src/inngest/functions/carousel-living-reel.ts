import { inngest } from "@/inngest/client";

/**
 * LIVING REEL — event "content-factory/living-reel.build" (2026-09-24, per
 * Keenan: "run every single one through higgsfield").
 *
 * For one post: every slide's text-free photo → Higgsfield image-to-video
 * (developer API, model = event.data.model ?? HIGGSFIELD_LIVING_MODEL ??
 * HIGGSFIELD_VIDEO_MODEL) → text layer burned on top → clean transitions →
 * brand CTA + library music → stored at living/<postId>/reel.mp4 and
 * emailed. See lib/content-factory/living-reel.ts.
 *
 * First use: the DoP Lite vs Kling 3.0 comparison. The daily pipeline
 * wiring (publisher + TikTok email) comes after Keenan picks the model.
 *
 * Slides without a stored rawImageUrl get their photo regenerated from the
 * stored prompt (avatar-reference aware) and the raw is saved back.
 */
export const carouselLivingReelFn = inngest.createFunction(
  {
    id: "carousel-living-reel",
    name: "Content Factory — Living Reel",
    retries: 1,
    concurrency: { limit: 2 },
    triggers: [{ event: "content-factory/living-reel.build" }],
    // Write the failure next to the reel so ops scripts (which can read
    // Storage but not Inngest logs) can see why a build died.
    onFailure: async ({ event, error }) => {
      const postId = (event.data as { event?: { data?: { postId?: string } } })?.event?.data?.postId;
      if (!postId) return;
      try {
        const { supabase } = await import("@/lib/supabase.server");
        await supabase.storage
          .from("content-factory")
          .upload(
            `living/${postId}/error.txt`,
            Buffer.from(`${new Date().toISOString()}\n${error?.message ?? String(error)}`),
            { contentType: "text/plain", upsert: true }
          );
      } catch {
        // best effort
      }
    },
  },
  async ({ event, step, logger }) => {
    const { postId, model: modelOverride, email = true } = event.data as {
      postId: string;
      model?: string;
      email?: boolean;
    };
    const model =
      modelOverride ||
      process.env.HIGGSFIELD_LIVING_MODEL ||
      process.env.HIGGSFIELD_VIDEO_MODEL ||
      "";

    const ok = await step.run("check-config", async () => {
      const { higgsfieldConfigured } = await import("@/lib/content-factory/animate-cover");
      return higgsfieldConfigured() && !!model;
    });
    if (!ok) {
      logger.warn("[living-reel] Higgsfield not configured — skipping");
      return { built: false, reason: "higgsfield not configured" };
    }

    const slides = await step.run("load-slides", async () => {
      const { prisma } = await import("@/lib/prisma");
      const post = await prisma.carouselPost.findUniqueOrThrow({
        where: { id: postId },
        select: {
          lane: true,
          slides: {
            where: { kind: { notIn: ["SCENE", "CTA"] } },
            orderBy: { order: "asc" },
            select: { id: true, kind: true, overlayText: true, imagePrompt: true, rawImageUrl: true },
          },
        },
      });
      return { lane: post.lane, slides: post.slides };
    });

    // ── 1. Base frame + text layer per slide ─────────────────────────
    const prepared: { baseUrl: string; layerUrl: string; seconds: number; prompt: string }[] = [];
    for (let i = 0; i < slides.slides.length; i++) {
      const s = slides.slides[i];
      prepared.push(
        await step.run(`prepare-${i}`, async () => {
          const { supabase } = await import("@/lib/supabase.server");
          const { buildLivingSlideLayer, livingMotionPrompt, livingSlideSeconds } =
            await import("@/lib/content-factory/living-reel");
          let raw: Buffer | null = null;
          if (s.rawImageUrl) {
            const res = await fetch(s.rawImageUrl);
            if (res.ok) raw = Buffer.from(await res.arrayBuffer());
          }
          if (!raw) {
            const { regenerateOverlayRaw } = await import("@/lib/content-factory/carousel-generate");
            raw = await regenerateOverlayRaw(s.imagePrompt, slides.lane, s.kind === "COVER" ? "cover" : "item");
          }
          const { base, layer } = await buildLivingSlideLayer({
            raw,
            overlayText: s.overlayText,
            lane: slides.lane,
            slideKind: s.kind,
            imagePrompt: s.imagePrompt,
          });
          const up = async (p: string, buf: Buffer, type: string) => {
            const { error } = await supabase.storage
              .from("content-factory")
              .upload(p, buf, { contentType: type, upsert: true });
            if (error) throw new Error(`Upload failed (${p}): ${error.message}`);
            return supabase.storage.from("content-factory").getPublicUrl(p).data.publicUrl;
          };
          const baseUrl = await up(`living/${postId}/base-${i}.jpg`, base, "image/jpeg");
          const layerUrl = await up(`living/${postId}/layer-${i}.png`, layer, "image/png");
          if (!s.rawImageUrl) {
            const { prisma } = await import("@/lib/prisma");
            await prisma.carouselSlide.update({ where: { id: s.id }, data: { rawImageUrl: baseUrl } });
          }
          return {
            baseUrl,
            layerUrl,
            seconds: livingSlideSeconds(s.kind, s.overlayText),
            prompt: livingMotionPrompt(s.imagePrompt),
          };
        })
      );
    }

    // ── 2. Submit every slide to Higgsfield ──────────────────────────
    const requestIds: string[] = [];
    for (let i = 0; i < prepared.length; i++) {
      requestIds.push(
        await step.run(`submit-${i}`, async () => {
          const { submitCoverVideo } = await import("@/lib/content-factory/animate-cover");
          const { LIVING_CLIP_SEC } = await import("@/lib/content-factory/living-reel");
          return submitCoverVideo({
            startImageUrl: prepared[i].baseUrl,
            prompt: prepared[i].prompt,
            duration: LIVING_CLIP_SEC,
            model,
          });
        })
      );
    }

    // ── 3. Poll until every clip is done (max ~20 min) ───────────────
    let clipUrls: (string | null)[] = requestIds.map(() => null);
    for (let round = 0; round < 40; round++) {
      await step.sleep(`wait-${round}`, "30s");
      clipUrls = await step.run(`poll-${round}`, async () => {
        const { checkCoverVideo } = await import("@/lib/content-factory/animate-cover");
        return Promise.all(
          requestIds.map(async (id, i) => {
            if (clipUrls[i]) return clipUrls[i];
            const st = await checkCoverVideo(id);
            if (st.status === "failed" || st.status === "nsfw") {
              throw new Error(`Higgsfield clip ${i} (${id}) ended ${st.status}`);
            }
            return st.status === "completed" ? st.videoUrl : null;
          })
        );
      });
      if (clipUrls.every(Boolean)) break;
    }
    if (!clipUrls.every(Boolean)) {
      throw new Error(`[living-reel] Clips still pending after 20 min for post ${postId}`);
    }

    // ── 4. Assemble + store ──────────────────────────────────────────
    const reel = await step.run("assemble", async () => {
      const { supabase } = await import("@/lib/supabase.server");
      const { assembleLivingReel, LIVING_CLIP_SEC } = await import("@/lib/content-factory/living-reel");
      const { pickMusicTrack } = await import("@/lib/content-factory/slideshow-reel");
      const { laneBrand } = await import("@/lib/content-factory/social-publish");
      const get = async (u: string) => {
        const r = await fetch(u);
        if (!r.ok) throw new Error(`Download failed (${r.status}): ${u}`);
        return Buffer.from(await r.arrayBuffer());
      };
      const [clips, layers] = await Promise.all([
        Promise.all(clipUrls.map((u) => get(u!))),
        Promise.all(prepared.map((p) => get(p.layerUrl))),
      ]);
      const music = await pickMusicTrack(slides.lane);
      if (!music) throw new Error(`No music track for lane ${slides.lane}`);
      const brand = await laneBrand(slides.lane);
      const { buf, seconds } = await assembleLivingReel({
        clips,
        layers,
        seconds: prepared.map((p) => p.seconds),
        clipSeconds: LIVING_CLIP_SEC,
        ctaUrl: `https://goripple.io/cta-slide-${brand}.jpg`,
        musicUrl: music,
      });
      const path = `living/${postId}/reel.mp4`;
      const { error } = await supabase.storage
        .from("content-factory")
        .upload(path, buf, { contentType: "video/mp4", upsert: true });
      if (error) throw new Error(`Reel upload failed: ${error.message}`);
      return {
        url: supabase.storage.from("content-factory").getPublicUrl(path).data.publicUrl,
        seconds,
        bytes: buf.length,
        music: decodeURIComponent(music.split("/").pop() ?? ""),
      };
    });

    // ── 5. Email it ──────────────────────────────────────────────────
    if (email) {
      await step.run("email", async () => {
        const { prisma } = await import("@/lib/prisma");
        const post = await prisma.carouselPost.findUniqueOrThrow({
          where: { id: postId },
          select: { headline: true, lane: true },
        });
        const res = await fetch(reel.url);
        const buf = Buffer.from(await res.arrayBuffer());
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        const from =
          process.env.CONTENT_FACTORY_EMAIL_FROM ?? '"Ripple Content" <content@getacuity.io>';
        const { error } = await resend.emails.send({
          from,
          to: ["keenan@heelerdigital.com"],
          subject: `Living reel (${model}): ${post.headline}`,
          html: `<p>Lane: ${post.lane} — ${prepared.length} slides + end card, ${reel.seconds.toFixed(1)}s.</p>
<p>Video model: <b>${model}</b> (Higgsfield developer API). Music: ${reel.music}.</p>
<p>Video attached. Or watch: <a href="${reel.url}">${reel.url}</a></p>`,
          ...(buf.length < 30_000_000
            ? { attachments: [{ filename: `living-reel-${post.lane}.mp4`, content: buf.toString("base64") }] }
            : {}),
        });
        // Resend's SDK returns errors instead of throwing.
        if (error) throw new Error(`Email failed: ${JSON.stringify(error)}`);
      });
    }

    return { built: true, model, ...reel };
  }
);

/**
 * Request queue for living reels (2026-09-24). Ops scripts can't reach the
 * prod CRON_SECRET or Inngest event key, but they can write to Storage with
 * the service-role key. Drop `living-requests/<postId>.json` ({ model?,
 * email? }) into the content-factory bucket; this cron claims it (deletes
 * the file first, so a request fires once) and sends the build event.
 */
export const livingReelQueueFn = inngest.createFunction(
  {
    id: "carousel-living-reel-queue",
    name: "Content Factory — Living Reel Request Queue",
    retries: 0,
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }) => {
    const requests = await step.run("claim-requests", async () => {
      const { supabase } = await import("@/lib/supabase.server");
      const { data } = await supabase.storage
        .from("content-factory")
        .list("living-requests", { limit: 20 });
      const claimed: { postId: string; model?: string; email?: boolean }[] = [];
      for (const f of (data ?? []).filter((x) => x.name.endsWith(".json"))) {
        const path = `living-requests/${f.name}`;
        const dl = await supabase.storage.from("content-factory").download(path);
        const { error } = await supabase.storage.from("content-factory").remove([path]);
        if (error) continue;
        let body: { model?: string; email?: boolean } = {};
        try {
          body = dl.data ? JSON.parse(await dl.data.text()) : {};
        } catch {
          // empty or bad JSON → defaults
        }
        claimed.push({ postId: f.name.replace(/\.json$/, ""), ...body });
      }
      return claimed;
    });
    if (requests.length > 0) {
      await step.sendEvent(
        "send-builds",
        requests.map((r) => ({ name: "content-factory/living-reel.build", data: r }))
      );
    }
    return { queued: requests.map((r) => r.postId) };
  }
);
