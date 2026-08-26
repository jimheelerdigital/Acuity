/**
 * Content Factory — carousel image generation pipeline.
 *
 * generateCarousel(topicSlug): builds prompts from STYLE_LANES + VISUAL_DNA,
 * calls gpt-image-2 for each slide, uploads raw images to Supabase Storage
 * "content-factory" bucket, then runs compose() for text overlay, and persists
 * CarouselPost + CarouselSlides as DRAFT.
 */

import OpenAI from "openai";
import { VISUAL_DNA, VISUAL_DNA_NOTEXT, STYLE_LANES, MOOD_EXPRESSIONS, isMood, resolveStyleLane, SELFIE_PERSONA, SELFIE_VISUAL_DNA, SELFIE_AESTHETIC_DNA } from "./brand";
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

  const lanePrefix = STYLE_LANES[resolveStyleLane(topic.lane)];
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
    /**
     * COVER, baked-text runs only (2026-08-16, per Keenan): the exact
     * short answers from the reason slides. gpt-image-2 loves inventing
     * its own sticky-note preview list on covers, which then doesn't
     * match the actual slides — if a list appears it must be THESE.
     */
    coverListItems?: string[];
    /**
     * REASON, baked-text runs only (2026-08-16, per Keenan): the
     * supporting "how/why" sentence rendered smaller below the main text.
     */
    detailText?: string;
  }
): string {
  const isCover = !slideLabel;
  const displayText = slideLabel ?? sceneText;
  // One art style per post (2026-08-16, per Keenan): the lane used to be a
  // soft one-liner that fought with VISUAL_DNA's own style language, so
  // slides within a post drifted between realistic/toon/clay renders.
  // Locking it as a hard rule keeps every slide in the same treatment.
  const styleLock = `STYLE LOCK (hard rule — every image in this post's series uses this ONE art style): ${lanePrefix} Every slide must look like it was made by the same artist in the same medium — do NOT drift toward photorealism, 3D, clay, flat vector, or any other rendering style unless it IS the stated style.`;
  const sizeRule = isCover
    ? "Text should be prominent but not exceed 50% of the slide. Blend it creatively with the illustration — vary placement each time."
    : "Text should be prominent but not exceed 40% of the slide. Blend it creatively with the illustration — vary placement each time.";
  // TikTok photo-mode chrome overlaps the image itself (2026-08-16, per
  // Keenan: live post had the headline running under the search bar and
  // clipped at the top edge). Baked-in text must stay inside the same
  // safe zone the animated bucket's overlays already use.
  const safeZoneRule =
    "CRITICAL TEXT SAFE ZONE — TikTok's interface covers parts of the image, so EVERY letter of text must sit inside the central safe area: nothing in the top 15% of the image (the search bar covers it), nothing in the bottom 15% (caption and music info cover it), and nothing in the right-most 15% (like/comment/share buttons sit there). Keep text at least 6% in from the left edge. If the text does not fit inside this zone, make the type smaller — text must NEVER touch or cross these boundaries, and must never be cropped by the image edge.";
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
    // 2026-08-24: sceneHint may now be a bespoke object scene with no
    // person — the character-expression mood line would make gpt-image-2
    // add a woman anyway, so it only applies when the scene has one.
    // (No sceneHint = legacy rotating room settings, which always do.)
    const personInScene =
      !opts.sceneHint || /\b(she|her|hers|herself|woman)\b/i.test(opts.sceneHint);
    return [
      styleLock,
      colorPrompt ?? "",
      `An illustrated scene that visually represents: ${sceneText}`,
      opts.sceneHint ?? "",
      personInScene ? moodLine : "",
      `Mood context: ${topic.headline} — self-reflection and mental load, for women.`,
      VISUAL_DNA_NOTEXT,
    ].filter(Boolean).join("\n");
  }

  return [
    styleLock,
    colorPrompt ?? "",
    `The slide must display this EXACT text prominently: "${displayText}"`,
    isCover && opts?.coverListItems && opts.coverListItems.length > 0
      ? buildCoverTeaser(opts.coverListItems)
      : "",
    isCover && opts?.coverSubline
      ? `Near the BOTTOM of the safe area (lower quarter of the frame, but kept fully above the bottom 15% so platform UI never covers it), in clearly smaller text than the headline, display this EXACT question: "${opts.coverSubline}"`
      : "",
    // Supporting detail line (2026-08-16): smaller "how/why" sentence
    // under the main text, styled to match but clearly secondary.
    opts?.detailText
      ? `Directly below the main text, display this EXACT supporting sentence in smaller, lighter type (same font family, clearly secondary): "${opts.detailText}"`
      : "",
    sizeRule,
    safeZoneRule,
    moodLine,
    `Topic context: "${topic.headline}" — a carousel about self-reflection and mental load for women.`,
    `Include relevant illustrated elements that visually represent: ${sceneText}`,
    VISUAL_DNA,
  ].filter(Boolean).join("\n");
}

/**
 * Cover teaser list (2026-08-16, per Keenan): the cover previews AT MOST
 * 40% of the answers — 1 of 5, 2 of 6-7, 3 of 8-10 — so she has to swipe
 * for the rest. The teased items are the EXACT slide answers (never
 * invented), and the cover must not hint at any of the hidden ones.
 */
function buildCoverTeaser(items: string[]): string {
  const n = items.length;
  const teaserCount = n <= 5 ? 1 : n <= 7 ? 2 : 3;
  const teased = items.slice(0, teaserCount);
  return [
    `The cover shows a small PARTIAL preview of the list (e.g. on sticky notes, a short written list, or small labels woven into the scene) — a teaser, NOT the full list.`,
    `Show ONLY ${teaserCount === 1 ? "this 1 item" : `these ${teaserCount} items`} of the ${n}, spelled exactly as written — do NOT invent, reword, add, or omit any:`,
    ...teased.map((item, i) => `${i + 1}. "${item}"`),
    `The remaining ${n - teaserCount} answers stay completely hidden — do not show, hint at, or leave blank spots for them. It's fine to imply there's more inside (e.g. a trailing "..." or a partially visible next note), but NO readable text beyond the ${teaserCount} item${teaserCount === 1 ? "" : "s"} above.`,
    `Each teased item in smaller text than the headline, all fully inside the safe zone.`,
  ].join("\n");
}

/**
 * Build the image prompt for one SELFIE-slideshow slide (2026-08-25,
 * per Keenan: realistic mirror-selfie avatar + hyper-realistic
 * aesthetic shots). Text is never baked — captions are burned on by
 * renderSelfieCaptionOverlay.
 */
export function buildSelfieImagePrompt(opts: {
  shot: "mirror" | "aesthetic";
  /** Scene direction from the topic model. */
  scene: string;
  /** The slide's burned-on line — the photo quietly acts it out. */
  slideText: string;
  headline: string;
  /** True when a reference photo of the avatar is passed to the edit endpoint. */
  hasReference?: boolean;
  /** Pose/framing directive (one of SELFIE_POSE_VARIANTS) — forces
   * every mirror selfie in a post to look different (2026-08-26). */
  pose?: string;
}): string {
  const context = `Context (convey through the photo only — subtly, shown not told): this photo belongs to a personal slideshow titled "${opts.headline}"; this slide's moment is "${opts.slideText}".`;

  if (opts.shot === "aesthetic") {
    return [
      `Scene (follow exactly): ${opts.scene}`,
      context,
      SELFIE_AESTHETIC_DNA,
    ].join("\n");
  }

  return [
    opts.hasReference
      ? "From the reference image take ONLY the woman's identity: the EXACT same person — identical face, hair, skin tone, and build. Take NOTHING else from the reference: do NOT copy or reuse its pose, arm position, phone position, framing, camera distance, outfit, room, furniture, or lighting. This is a COMPLETELY DIFFERENT photo of the same woman, taken on a different day."
      : "",
    SELFIE_PERSONA,
    `Scene (follow exactly): ${opts.scene}`,
    opts.pose
      ? `Pose and framing (follow exactly — this OVERRIDES any camera or mirror setup implied by the scene): ${opts.pose}`
      : "",
    context,
    SELFIE_VISUAL_DNA,
  ]
    .filter(Boolean)
    .join("\n");
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

/**
 * Generate an image with a REFERENCE image via gpt-image-2's edit
 * endpoint (2026-08-16, per Keenan: the story video's woman looked like
 * a different person in every scene — each scene was generated from
 * text alone. Passing scene 1's raw render as the reference keeps the
 * same face/hair/outfit across all scenes; same pattern AdLab already
 * uses for creative direction).
 */
export async function generateImageWithReference(
  prompt: string,
  reference: Buffer
): Promise<Buffer> {
  const file = await OpenAI.toFile(reference, "reference.jpg", { type: "image/jpeg" });
  const response = await openai().images.edit({
    model: "gpt-image-2",
    image: file,
    prompt,
    n: 1,
    // The edit endpoint's tallest portrait size (1024x1792 is
    // generate-only); composeSlide cover-crops to 1080x1920 downstream.
    size: "1024x1536",
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("gpt-image-2 edit returned no image data");
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
  const lanePrefix = STYLE_LANES[resolveStyleLane(topic?.lane)];

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
    const lanePrefix = STYLE_LANES[resolveStyleLane(topic?.lane)];
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
