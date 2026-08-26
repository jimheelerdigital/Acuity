/**
 * Manual selfie-slideshow generation script (one-off example runner).
 * Mirrors the "selfie" bucket in src/inngest/functions/carousel-daily.ts
 * but runs linearly without Inngest, then emails the result.
 *
 * Run from apps/web: npx tsx scripts/run-selfie-example.ts
 */
import "./load-env";

// Shim server-only before any app module imports it
const Module = require("module");
try {
  const soPath = require.resolve("server-only");
  Module._cache[soPath] = {
    id: soPath,
    filename: soPath,
    loaded: true,
    exports: {},
    children: [],
    paths: [],
  };
} catch {}

async function main() {
  console.log("[selfie] OpenAI:", process.env.OPENAI_API_KEY ? "set" : "MISSING");
  console.log("[selfie] Anthropic:", process.env.ANTHROPIC_API_KEY ? "set" : "MISSING");
  console.log("[selfie] Supabase:", process.env.NEXT_PUBLIC_SUPABASE_URL ? "set" : "MISSING");
  console.log("[selfie] Resend:", process.env.RESEND_API_KEY ? "set" : "MISSING");
  console.log("[selfie] DATABASE_URL:", process.env.DATABASE_URL ? "set" : "MISSING");

  const { prisma } = await import("@/lib/prisma");
  const { generateSelfieTopic } = await import("@/lib/content-factory/generate-topic");
  const {
    buildSelfieImagePrompt,
    generateImage,
    generateImageWithReference,
    uploadImage,
    ensureBucket,
    extractHashtags,
  } = await import("@/lib/content-factory/carousel-generate");
  const {
    composeSlide,
    composeSlideWithOverlay,
    renderSelfieCaptionOverlay,
    SELFIE_TEXT_COLORS,
  } = await import("@/lib/content-factory/compose");
  const { buildCaption } = await import("@/lib/content-factory/caption");

  // ── Topic + persona anchor ─────────────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const recent = await prisma.carouselPost.findMany({
    where: { generatedFor: { gte: thirtyDaysAgo } },
    select: { headline: true },
  });
  console.log(`[selfie] ${recent.length} recent headlines for dedupe`);

  // The local ANTHROPIC_API_KEY is stale (401) — prod uses Vercel's valid
  // key. For this one-off example, fall back to a hand-written topic in
  // the exact shape generateSelfieTopic returns when Claude auth fails.
  // Complies with the 2026-08-26 shot rules: 3 selfies total including
  // the cover, never back-to-back (cover → aesthetic first step).
  const FALLBACK_TOPIC: Awaited<ReturnType<typeof generateSelfieTopic>> = {
    slug: "how-i-got-my-evenings-back",
    headline: "this is how i got my evenings back",
    steps: [
      "i stopped bringing my phone to the couch",
      "i made dinner cleanup a hard stop",
      "i picked one thing that's just mine",
      "i let the evening be boring on purpose",
    ],
    details: [
      "it charges in the kitchen now. the couch is for me.",
      "when the counter's wiped, the workday is over. period.",
      "twenty minutes with my book. everyone survives.",
      "boring turned out to be the whole point.",
    ],
    mood: "hopeful",
    coverScene:
      "evening at home, mirror on a bedroom closet door, wearing a flannel shirt over a tank top, warm lamp light from the side, bed with a folded throw behind her",
    stepShots: [
      {
        type: "aesthetic",
        scene:
          "a phone plugged in on the kitchen counter at dusk, screen dark, warm under-cabinet light, dish towel folded nearby, no people",
      },
      {
        type: "mirror",
        scene:
          "mirror selfie in the dim hallway after dinner, hair tied back loosely, apron still half-on, day visibly done",
      },
      {
        type: "aesthetic",
        scene:
          "an open paperback resting on the arm of a couch with reading glasses on top, soft blanket, one warm lamp glowing, evening window behind, no people",
      },
      {
        type: "mirror",
        scene:
          "relaxed late-evening mirror selfie in the living room, big cardigan, mug in her free hand, lamp-lit and cozy",
      },
    ],
    captionOpen: "took me 44 years to learn this one.",
    captionClose: "tell me which one you'd actually try.",
  };

  let topic: Awaited<ReturnType<typeof generateSelfieTopic>>;
  try {
    topic = await generateSelfieTopic(recent.map((p) => p.headline));
  } catch (e: any) {
    console.warn(`[selfie] Topic generation failed (${e?.status ?? e?.message}) — using fallback topic`);
    topic = FALLBACK_TOPIC;
  }

  const prev = await prisma.carouselSlide.findFirst({
    where: {
      order: 0,
      rawImageUrl: { not: null },
      carouselPost: { lane: "selfie" },
    },
    orderBy: { carouselPost: { generatedFor: "desc" } },
    select: { rawImageUrl: true },
  });
  const anchorUrl = prev?.rawImageUrl ?? null;
  console.log(`[selfie] Topic: "${topic.headline}" (${topic.steps.length} steps)`);
  console.log(`[selfie] Anchor: ${anchorUrl ?? "none (first selfie post — fresh persona)"}`);
  topic.stepShots.forEach((s, i) =>
    console.log(`[selfie]   step ${i + 1} [${s.type}]: ${topic.steps[i]} — ${s.scene.slice(0, 80)}`)
  );

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dateStr = today.toISOString().slice(0, 10);
  const slug = topic.slug;

  await ensureBucket();

  // Sticker color — deterministic per slug, same as the cron.
  let hash = 0;
  for (const c of slug) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  const stickerColor = SELFIE_TEXT_COLORS[Math.abs(hash) % SELFIE_TEXT_COLORS.length];
  console.log(`[selfie] Sticker color: ${stickerColor}`);

  const { SELFIE_POSE_VARIANTS } = await import("@/lib/content-factory/brand");
  const poseBase = Math.abs(hash) % SELFIE_POSE_VARIANTS.length;

  // ── Cover ──────────────────────────────────────────────────────
  console.log("[selfie] Generating cover (mirror selfie)...");
  const coverPrompt = buildSelfieImagePrompt({
    shot: "mirror",
    scene: topic.coverScene,
    slideText: topic.headline,
    headline: topic.headline,
    hasReference: !!anchorUrl,
    pose: SELFIE_POSE_VARIANTS[poseBase],
  });

  let coverRaw: Buffer;
  if (anchorUrl) {
    const res = await fetch(anchorUrl);
    if (!res.ok) throw new Error(`Anchor fetch failed: HTTP ${res.status}`);
    coverRaw = await generateImageWithReference(coverPrompt, Buffer.from(await res.arrayBuffer()));
  } else {
    coverRaw = await generateImage(coverPrompt);
  }

  const textFree = await composeSlide(coverRaw, "", "COVER");
  const coverRawUrl = await uploadImage(
    textFree,
    `carousels/${dateStr}/${slug}/slide-0-cover-raw.jpg`
  );
  const coverOverlay = await renderSelfieCaptionOverlay(topic.headline, {
    kind: "COVER",
    color: stickerColor,
    placement: "lower",
  });
  const coverComposed = await composeSlideWithOverlay(coverRaw, coverOverlay);
  const coverUrl = await uploadImage(
    coverComposed,
    `carousels/${dateStr}/${slug}/slide-0-cover.jpg`
  );
  console.log(`[selfie] Cover done: ${coverUrl}`);

  // ── Step slides ────────────────────────────────────────────────
  const stepSlides: {
    imageUrl: string;
    rawImageUrl: string;
    overlayText: string;
    imagePrompt: string;
  }[] = [];
  for (let i = 0; i < topic.steps.length; i++) {
    const shot = topic.stepShots[i];
    console.log(`[selfie] Generating step ${i + 1}/${topic.steps.length} [${shot.type}]...`);
    const prompt = buildSelfieImagePrompt({
      shot: shot.type,
      scene: shot.scene,
      slideText: topic.steps[i],
      headline: topic.headline,
      hasReference: shot.type === "mirror",
      pose: SELFIE_POSE_VARIANTS[(poseBase + i + 1) % SELFIE_POSE_VARIANTS.length],
    });

    let rawBuffer: Buffer;
    if (shot.type === "mirror") {
      const res = await fetch(coverRawUrl);
      if (!res.ok) throw new Error(`Cover reference fetch failed: HTTP ${res.status}`);
      rawBuffer = await generateImageWithReference(prompt, Buffer.from(await res.arrayBuffer()));
    } else {
      rawBuffer = await generateImage(prompt);
    }

    const stepTextFree = await composeSlide(rawBuffer, "", "REASON");
    const rawImageUrl = await uploadImage(
      stepTextFree,
      `carousels/${dateStr}/${slug}/slide-${i + 1}-step-raw.jpg`
    );
    const overlay = await renderSelfieCaptionOverlay(topic.steps[i], {
      kind: "REASON",
      detail: topic.details[i] || undefined,
      color: stickerColor,
      placement: shot.type === "mirror" ? "lower" : "upper",
    });
    const composed = await composeSlideWithOverlay(rawBuffer, overlay);
    const imageUrl = await uploadImage(
      composed,
      `carousels/${dateStr}/${slug}/slide-${i + 1}-step.jpg`
    );
    stepSlides.push({ imageUrl, rawImageUrl, overlayText: topic.steps[i], imagePrompt: prompt });
    console.log(`[selfie]   done: ${imageUrl}`);
  }

  // ── Save + email ───────────────────────────────────────────────
  const caption = buildCaption({
    slug,
    headline: topic.headline,
    style: "hook",
    lane: "cinematicReal",
    reasons: topic.steps,
    captionOpen: topic.captionOpen,
    captionClose: topic.captionClose,
  });

  // Re-runs regenerate images at the same storage paths; replace any
  // existing post for this slug+date instead of tripping the unique
  // (topicSlug, generatedFor) constraint.
  await prisma.carouselPost.deleteMany({
    where: { topicSlug: slug, generatedFor: today },
  });

  const post = await prisma.carouselPost.create({
    data: {
      topicSlug: slug,
      headline: topic.headline,
      status: "DRAFT",
      format: "PHOTO",
      caption,
      hashtags: extractHashtags(caption),
      generatedFor: today,
      lane: "selfie",
      mood: topic.mood ?? null,
      slides: {
        create: [
          {
            order: 0,
            kind: "COVER" as const,
            overlayText: topic.headline,
            imagePrompt: coverPrompt,
            imageUrl: coverUrl,
            rawImageUrl: coverRawUrl,
          },
          ...stepSlides.map((s, i) => ({
            order: i + 1,
            kind: "REASON" as const,
            overlayText: s.overlayText,
            imagePrompt: s.imagePrompt,
            imageUrl: s.imageUrl,
            rawImageUrl: s.rawImageUrl,
          })),
        ],
      },
    },
  });
  console.log(`[selfie] Post saved: ${post.id}`);

  const { sendCarouselEmail } = await import("@/lib/content-factory/email");
  await sendCarouselEmail(post.id);
  console.log(`[selfie] Email sent for post ${post.id}`);
  console.log(`[selfie] DONE — ${stepSlides.length + 1} slides`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[selfie] FAILED:", e?.message || e);
    console.error(e?.stack);
    process.exit(1);
  });
