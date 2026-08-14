/**
 * Content Factory — carousel image generation pipeline.
 *
 * generateCarousel(topicSlug): builds prompts from STYLE_LANES + VISUAL_DNA,
 * calls gpt-image-2 for each slide, uploads raw images to Supabase Storage
 * "content-factory" bucket, then runs compose() for text overlay, and persists
 * CarouselPost + CarouselSlides as DRAFT.
 */

import OpenAI from "openai";
import { VISUAL_DNA, VISUAL_DNA_NOTEXT, STYLE_LANES, MOOD_EXPRESSIONS, isMood } from "./brand";
import { CAROUSEL_TOPICS, type CarouselTopic } from "./topics";
import { composeSlide, composeCTASlide } from "./compose";
import { buildCaption } from "./caption";

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) {
    const key = process.env.ACUITY_ADLAB_OPENAI_KEY || process.env.OPENAI_API_KEY;
    if (!key) throw new Error("No OpenAI API key configured (ACUITY_ADLAB_OPENAI_KEY or OPENAI_API_KEY)");
    _openai = new OpenAI({ apiKey: key, timeout: 120_000 });
  }
  return _openai;
}

export async function ensureBucket(): Promise<void> {
  const { supabase } = await import("@/lib/supabase.server");
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === "content-factory")) {
    const { error } = await supabase.storage.createBucket("content-factory", { public: true });
    if (error && !error.message.includes("already exists")) {
      throw new Error(`Failed to create content-factory bucket: ${error.message}`);
    }
    console.log("[carousel] content-factory bucket created");
  }
}

export async function uploadImage(
  buffer: Buffer,
  path: string,
  contentType = "image/jpeg"
): Promise<string> {
  const { supabase } = await import("@/lib/supabase.server");
  const { error } = await supabase.storage
    .from("content-factory")
    .upload(path, buffer, { contentType, upsert: true });
  if (error) throw new Error(`Supabase upload failed for ${path}: ${error.message}`);

  const { data } = supabase.storage.from("content-factory").getPublicUrl(path);
  return data.publicUrl;
}

interface GenerateResult {
  postId: string;
  slideCount: number;
  estimatedCostCents: number;
}

/**
 * Generate a complete carousel for a given topic slug.
 * Returns the created CarouselPost ID + cost estimate.
 */
export async function generateCarousel(
  topicSlug: string,
  generatedFor: Date = new Date()
): Promise<GenerateResult> {
  const topic = CAROUSEL_TOPICS.find((t) => t.slug === topicSlug);
  if (!topic) throw new Error(`Unknown carousel topic: ${topicSlug}`);

  await ensureBucket();

  const { prisma } = await import("@/lib/prisma");
  const dateStr = generatedFor.toISOString().slice(0, 10);

  // Idempotency check — don't re-generate same topic+date
  const existing = await prisma.carouselPost.findUnique({
    where: { topicSlug_generatedFor: { topicSlug, generatedFor } },
  });
  if (existing) {
    console.log(`[carousel] Already generated ${topicSlug} for ${dateStr}, skipping`);
    return { postId: existing.id, slideCount: 0, estimatedCostCents: 0 };
  }

  const lanePrefix = STYLE_LANES[topic.lane];
  let totalCostCents = 0;

  // ── Generate images for each reason slide ─────────────────────────
  const slides: {
    order: number;
    kind: "COVER" | "REASON" | "CTA";
    overlayText: string;
    imagePrompt: string;
    imageUrl: string;
    rawImageUrl?: string;
  }[] = [];

  // COVER slide (slide 0) — uses the headline.
  // The raw (text-free) image is uploaded too: it's the start frame for the
  // animated cover video (composed cover = end frame).
  const coverPrompt = buildImagePrompt(lanePrefix, topic.headline, topic);
  const coverBuffer = await generateImage(coverPrompt);
  totalCostCents += estimateImageCost();
  const coverRawUrl = await uploadImage(
    coverBuffer,
    `carousels/${dateStr}/${topicSlug}/slide-0-cover-raw.jpg`
  );
  const coverComposed = await composeSlide(coverBuffer, topic.headline, "COVER");
  const coverUrl = await uploadImage(
    coverComposed,
    `carousels/${dateStr}/${topicSlug}/slide-0-cover.jpg`
  );
  slides.push({
    order: 0,
    kind: "COVER",
    overlayText: topic.headline,
    imagePrompt: coverPrompt,
    imageUrl: coverUrl,
    rawImageUrl: coverRawUrl,
  });

  // REASON slides (1..N)
  for (let i = 0; i < topic.reasons.length; i++) {
    const reason = topic.reasons[i];
    const prompt = buildImagePrompt(lanePrefix, reason, topic);
    const rawBuffer = await generateImage(prompt);
    totalCostCents += estimateImageCost();
    const composed = await composeSlide(rawBuffer, reason, "REASON", i + 1);
    const url = await uploadImage(
      composed,
      `carousels/${dateStr}/${topicSlug}/slide-${i + 1}-reason.jpg`
    );
    slides.push({
      order: i + 1,
      kind: "REASON",
      overlayText: reason,
      imagePrompt: prompt,
      imageUrl: url,
    });
  }

  // NOTE (2026-08-12, per Keenan): no branded CTA end slide — ending on
  // an ad suppressed shares. The post ends on the mic-drop last reason.

  // ── Build caption ─────────────────────────────────────────────────
  const caption = buildCaption(topic);

  // ── Persist to DB ─────────────────────────────────────────────────
  const post = await prisma.carouselPost.create({
    data: {
      topicSlug,
      headline: topic.headline,
      status: "DRAFT",
      caption,
      hashtags: extractHashtags(caption),
      generatedFor,
      lane: topic.lane, // persisted so story re-runs match the carousel style

      slides: {
        create: slides.map((s) => ({
          order: s.order,
          kind: s.kind,
          overlayText: s.overlayText,
          imagePrompt: s.imagePrompt,
          imageUrl: s.imageUrl,
          rawImageUrl: s.rawImageUrl,
        })),
      },
    },
  });

  console.log(
    `[carousel] Generated ${topicSlug} for ${dateStr}: ${slides.length} slides, ` +
    `~$${(totalCostCents / 100).toFixed(2)} estimated cost`
  );

  return {
    postId: post.id,
    slideCount: slides.length,
    estimatedCostCents: totalCostCents,
  };
}

// ─── Helpers (exported for step-based Inngest functions) ─────────────────────

export function buildImagePrompt(
  lanePrefix: string,
  sceneText: string,
  topic: CarouselTopic,
  colorPrompt?: string,
  slideLabel?: string,
  opts?: {
    noText?: boolean;
    sceneHint?: string;
    mood?: string;
    /**
     * COVER, baked-text runs only (2026-08-13, per Keenan): a short
     * engagement question rendered smaller below the headline.
     * Animated runs put the same line in the composited overlay instead.
     */
    coverSubline?: string;
  }
): string {
  const isCover = !slideLabel;
  const displayText = slideLabel ?? sceneText;
  const sizeRule = isCover
    ? "Text should be prominent but not exceed 50% of the slide. Blend it creatively with the illustration — vary placement each time."
    : "Text should be prominent but not exceed 40% of the slide. Blend it creatively with the illustration — vary placement each time.";
  // Mood-matched expression so the character's face fits the slide's
  // emotional weight instead of gpt-image-2's default cheerful woman.
  const mood = opts?.mood;
  const moodLine = isMood(mood) ? MOOD_EXPRESSIONS[mood] : "";

  // Text-free variant (animated posts): the words are composited on
  // afterwards (sharp for the JPEG, ffmpeg for the video) so the video
  // model never gets text pixels to animate. The standard VISUAL_DNA
  // demands blended typography and "carousel slide" framing — both make
  // gpt-image-2 render full infographics even when told not to (proven
  // live 2026-08-11) — so the noText prompt swaps in VISUAL_DNA_NOTEXT
  // and never uses the words "slide" or "carousel".
  if (opts?.noText) {
    return [
      lanePrefix,
      colorPrompt ?? "",
      `An illustrated scene that visually represents: ${sceneText}`,
      opts.sceneHint ?? "",
      moodLine,
      `Mood context: ${topic.headline} — self-reflection and mental load, for women.`,
      VISUAL_DNA_NOTEXT,
    ].filter(Boolean).join("\n");
  }

  return [
    lanePrefix,
    colorPrompt ?? "",
    `The slide must display this EXACT text prominently: "${displayText}"`,
    isCover && opts?.coverSubline
      ? `Near the BOTTOM of the image (lower quarter of the frame, but kept above the bottom 12% so platform UI never covers it), in clearly smaller text than the headline, display this EXACT question: "${opts.coverSubline}"`
      : "",
    sizeRule,
    moodLine,
    `Topic context: "${topic.headline}" — a carousel about self-reflection and mental load for women.`,
    `Include relevant illustrated elements that visually represent: ${sceneText}`,
    VISUAL_DNA,
  ].filter(Boolean).join("\n");
}

export async function generateImage(prompt: string): Promise<Buffer> {
  const response = await openai().images.generate({
    model: "gpt-image-2",
    prompt,
    n: 1,
    size: "1024x1792", // 9:16 portrait — native TikTok carousel dimensions
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("gpt-image-2 returned no image data");
  return Buffer.from(b64, "base64");
}

/** gpt-image-2 at 1024x1536 costs ~$0.04-0.08 per image. Estimate conservatively. */
function estimateImageCost(): number {
  return 8; // 8 cents per image
}

/** Minimal topic for slides whose post's topicSlug isn't in CAROUSEL_TOPICS (e.g. AI-generated topics). */
function fallbackTopic(headline: string, slug: string): CarouselTopic {
  return {
    headline,
    slug,
    style: "hook",
    lane: "cinematicReal",
    reasons: [],
    emotionBeat:
      "a small tired shrug — shoulders lifting then dropping with a slow exhale — followed by a soft, knowing half-smile to camera",
  };
}

export function extractHashtags(caption: string): string[] {
  return (caption.match(/#\w+/g) ?? []).map((h) => h.toLowerCase());
}

/**
 * Regenerate a single slide within an existing carousel.
 * Returns the updated slide's new image URL.
 */
export async function regenerateSlide(slideId: string): Promise<string> {
  const { prisma } = await import("@/lib/prisma");

  const slide = await prisma.carouselSlide.findUniqueOrThrow({
    where: { id: slideId },
    include: { carouselPost: true },
  });

  if (slide.kind === "CTA") {
    const composed = await composeCTASlide(slide.overlayText);
    const url = await uploadImage(
      composed,
      `carousels/regen/${slide.carouselPostId}/${slideId}.jpg`
    );
    await prisma.carouselSlide.update({ where: { id: slideId }, data: { imageUrl: url } });
    return url;
  }

  const topic = CAROUSEL_TOPICS.find((t) => t.slug === slide.carouselPost.topicSlug);
  const lanePrefix = topic ? STYLE_LANES[topic.lane] : STYLE_LANES.cinematicReal;

  const rawBuffer = await generateImage(slide.imagePrompt || buildImagePrompt(
    lanePrefix,
    slide.overlayText,
    topic ?? fallbackTopic(slide.carouselPost.headline, slide.carouselPost.topicSlug),
  ));
  const slideNum = slide.kind === "REASON" ? slide.order : undefined;
  const composed = await composeSlide(rawBuffer, slide.overlayText, slide.kind as "COVER" | "REASON", slideNum);
  const url = await uploadImage(
    composed,
    `carousels/regen/${slide.carouselPostId}/${slideId}.jpg`
  );

  // COVER: keep the new raw image for animation, and clear any existing
  // video — it was rendered from the old image and is now stale.
  let rawImageUrl: string | undefined;
  if (slide.kind === "COVER") {
    rawImageUrl = await uploadImage(
      rawBuffer,
      `carousels/regen/${slide.carouselPostId}/${slideId}-raw.jpg`
    );
  }
  await prisma.carouselSlide.update({
    where: { id: slideId },
    data: {
      imageUrl: url,
      ...(slide.kind === "COVER" ? { rawImageUrl, videoUrl: null } : {}),
    },
  });

  console.log(`[carousel] Regenerated slide ${slideId}, ~$0.08 cost`);
  return url;
}

/**
 * Edit a slide's overlay text and re-compose (no image regeneration).
 * Downloads the original raw image from the existing imageUrl, strips
 * old text by re-composing from scratch. Returns new image URL.
 */
export async function recomposeSlide(slideId: string, newText: string): Promise<string> {
  const { prisma } = await import("@/lib/prisma");

  const slide = await prisma.carouselSlide.findUniqueOrThrow({
    where: { id: slideId },
    include: { carouselPost: true },
  });

  let composed: Buffer;
  let rawBuffer: Buffer | null = null;

  if (slide.kind === "CTA") {
    composed = await composeCTASlide(newText);
  } else {
    // Re-generate the raw image from the same prompt and re-compose with new text.
    // We can't strip text from an already-composed image, so we regenerate the
    // underlying image. This costs ~$0.08 but gives a clean result.
    const topic = CAROUSEL_TOPICS.find((t) => t.slug === slide.carouselPost.topicSlug);
    const lanePrefix = topic ? STYLE_LANES[topic.lane] : STYLE_LANES.cinematicReal;
    const prompt = slide.imagePrompt || buildImagePrompt(
      lanePrefix,
      newText,
      topic ?? fallbackTopic(slide.carouselPost.headline, slide.carouselPost.topicSlug),
    );
    rawBuffer = await generateImage(prompt);
    const slideNum = slide.kind === "REASON" ? slide.order : undefined;
    composed = await composeSlide(rawBuffer, newText, slide.kind as "COVER" | "REASON", slideNum);
  }

  const url = await uploadImage(
    composed,
    `carousels/edit/${slide.carouselPostId}/${slideId}.jpg`
  );

  // COVER: keep the new raw image for animation, clear the now-stale video.
  let rawImageUrl: string | undefined;
  if (slide.kind === "COVER" && rawBuffer) {
    rawImageUrl = await uploadImage(
      rawBuffer,
      `carousels/edit/${slide.carouselPostId}/${slideId}-raw.jpg`
    );
  }

  await prisma.carouselSlide.update({
    where: { id: slideId },
    data: {
      overlayText: newText,
      imageUrl: url,
      ...(slide.kind === "COVER" ? { rawImageUrl, videoUrl: null } : {}),
    },
  });

  console.log(`[carousel] Recomposed slide ${slideId} with new text`);
  return url;
}
