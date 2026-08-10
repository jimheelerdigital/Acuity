/**
 * Content Factory — animated cover generation via Higgsfield platform API.
 *
 * Uses the raw (text-free) cover as the START frame and lets the model
 * generate freely — no end-frame constraint. This produces dramatic,
 * full-scene animation (character gestures, camera movement, environment
 * coming alive) instead of the near-static output the first-last-frame
 * model produced when both frames were nearly identical.
 *
 * The video is an attention-grabbing animation for emails and the review
 * queue; the static composed cover is still used for the actual social post.
 *
 * Auth is hf-api-key/hf-secret headers (per the playground cURL; NOT the
 * Authorization header in older docs).
 *
 * Env:
 * - HIGGSFIELD_API_KEY / HIGGSFIELD_API_SECRET — from cloud.higgsfield.ai
 * - HIGGSFIELD_VIDEO_MODEL — model path for the POST endpoint, e.g.
 *   "higgsfield-ai/dop/lite". If unset, animation is skipped
 *   (carousels stay static).
 * - HIGGSFIELD_VIDEO_QUALITY (optional) — e.g. "1080p"; sent as `quality`.
 * - HIGGSFIELD_VIDEO_DURATION (optional) — seconds; overrides the default 4.
 */

import type { CarouselTopic } from "./topics";

const BASE_URL = "https://platform.higgsfield.ai";

/** Max time we'll poll for a video before giving up (per attempt). */
const POLL_TIMEOUT_MS = 8 * 60_000;
const POLL_INTERVAL_MS = 10_000;

export function higgsfieldConfigured(): boolean {
  return Boolean(
    process.env.HIGGSFIELD_API_KEY &&
      process.env.HIGGSFIELD_API_SECRET &&
      process.env.HIGGSFIELD_VIDEO_MODEL
  );
}

/**
 * Auth headers per the cloud.higgsfield.ai playground cURL example
 * (hf-api-key / hf-secret — NOT an Authorization header).
 */
function authHeaders(): Record<string, string> {
  return {
    "hf-api-key": process.env.HIGGSFIELD_API_KEY!,
    "hf-secret": process.env.HIGGSFIELD_API_SECRET!,
  };
}

/**
 * Build the image-to-video prompt for a cover.
 *
 * v9 (2026-08-07): long prompts with many negative instructions don't
 * work — the model latches on to verbs like "walking" and "talking" and
 * does them. v9 is ultra-short: only describes what SHOULD happen,
 * avoids mentioning unwanted behaviors entirely.
 *
 * v10 (2026-08-10): v9's "a still, quiet moment" read as near-static and
 * the text fade-out hid what the post was about. v10 keeps the short,
 * positive-only style but leads with ONE clear, fully visible gesture
 * from the woman, keeps all text razor-sharp and fixed for the entire
 * video (scene moves behind it), and adds explicit high-definition
 * cinematic quality language.
 */
/** Which animation treatment a cover gets. */
export type AnimationStyle = "smooth" | "crazy";

/**
 * Shared closing lines for every cover prompt (positive-only phrasing):
 * the text never moves or fades, and the footage reads as high-end.
 */
const TEXT_AND_QUALITY_LINES = [
  "All text in the image stays razor-sharp, fixed in place, and fully visible in front of the scene for the entire video, with every movement happening behind it.",
  "Crisp, sharp, high-definition cinematic footage with steady lighting, rich color, and clean detail from first frame to last.",
];

export function buildCoverVideoPrompt(topic: Pick<CarouselTopic, "emotionBeat">): string {
  const emotionBeat =
    topic.emotionBeat ??
    "a gentle shrug and a slow deep breath";
  return [
    `The woman is seated, lips closed. From the first moment she ${emotionBeat} — one clear, graceful, fully visible movement carried through her head, shoulders, and hands.`,
    "Steam rises from the mug and her hair sways softly. The camera pushes in slowly and smoothly toward her.",
    "The same scene, same colors, same setting the entire time.",
    ...TEXT_AND_QUALITY_LINES,
  ].join(" ");
}

/**
 * Prompt for non-cover slides (reason slides) on fully animated posts.
 * The artwork varies by style lane (clay, flat graphic, still life, …)
 * and doesn't always contain a person, so this stays generic: one clear
 * movement from the scene's main subject, gentle push-in, text locked.
 */
export function buildSlideVideoPrompt(): string {
  return [
    "The scene comes alive with one clear, gentle, fully visible movement of its main subject.",
    "Soft ambient details drift — steam, light, or fabric. The camera pushes in slowly and smoothly.",
    "The same scene, same colors, same setting the entire time.",
    ...TEXT_AND_QUALITY_LINES,
  ].join(" ");
}

/**
 * "Crazy intro" variant — one post per day. Bolder gesture and a faster
 * camera land, same short-prompt approach and same text protection.
 */
export function buildCrazyCoverVideoPrompt(topic: Pick<CarouselTopic, "emotionBeat">): string {
  const emotionBeat =
    topic.emotionBeat ??
    "a deep exhale and then looks up with quiet confidence";
  return [
    `The woman is seated, lips closed. From the first moment she ${emotionBeat} — one bold, confident, fully visible movement with real momentum.`,
    "Her hair catches a breeze and a candle flame flickers. The camera sweeps in fast, then glides to a smooth, confident stop on her.",
    "The same scene, same colors, same setting the entire time.",
    ...TEXT_AND_QUALITY_LINES,
  ].join(" ");
}

/**
 * Submit an image-to-video job. Returns the Higgsfield request ID.
 *
 * Uses the standard i2v model (no end-frame lock) so the model is free
 * to produce dramatic motion from the start frame.
 */
export async function submitCoverVideo(opts: {
  startImageUrl: string; // composed cover with text
  prompt: string;
}): Promise<string> {
  const model = process.env.HIGGSFIELD_VIDEO_MODEL!;

  const body: Record<string, unknown> = {
    prompt: opts.prompt,
    image_url: opts.startImageUrl,
    duration: 4,
    motions: [],
    // Never let Higgsfield rewrite our validated prompt template.
    enhance_prompt: false,
  };
  // Quality/duration knobs (2026-08-10). Sent only when set in env so a
  // model that rejects `quality` can be dialed back without a code change:
  // - HIGGSFIELD_VIDEO_QUALITY, e.g. "1080p" or "high"
  // - HIGGSFIELD_VIDEO_DURATION, seconds — overrides the default 4
  if (process.env.HIGGSFIELD_VIDEO_QUALITY) {
    body.quality = process.env.HIGGSFIELD_VIDEO_QUALITY;
  }
  if (process.env.HIGGSFIELD_VIDEO_DURATION) {
    const duration = Number(process.env.HIGGSFIELD_VIDEO_DURATION);
    if (Number.isFinite(duration) && duration > 0) body.duration = duration;
  }

  const res = await fetch(`${BASE_URL}/${model}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Higgsfield submit failed (${res.status}) for model "${model}": ${body.slice(0, 500)}`
    );
  }

  const data = (await res.json()) as { request_id?: string; id?: string };
  const requestId = data.request_id ?? data.id;
  if (!requestId) {
    throw new Error(`Higgsfield submit returned no request_id: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return requestId;
}

export interface HiggsfieldStatus {
  status: "queued" | "in_progress" | "completed" | "failed" | "nsfw";
  videoUrl: string | null;
}

/** Check a request's status once. */
export async function checkCoverVideo(requestId: string): Promise<HiggsfieldStatus> {
  const res = await fetch(`${BASE_URL}/requests/${requestId}/status`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Higgsfield status failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    status: HiggsfieldStatus["status"];
    video?: { url?: string };
  };
  return { status: data.status, videoUrl: data.video?.url ?? null };
}

/** Poll until terminal. Used by scripts/manual paths; the Inngest function polls via steps instead. */
export async function pollCoverVideo(requestId: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { status, videoUrl } = await checkCoverVideo(requestId);
    if (status === "completed" && videoUrl) return videoUrl;
    if (status === "failed" || status === "nsfw") {
      throw new Error(`Higgsfield generation ${requestId} ended with status: ${status}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Higgsfield generation ${requestId} timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}

/**
 * Download the finished MP4 from Higgsfield's CDN, upload it to Supabase
 * Storage next to the slide's JPEG, and persist videoUrl on the slide.
 * Works for any slide (cover or reason). Returns the public Supabase URL.
 */
export async function storeSlideVideo(slideId: string, higgsfieldVideoUrl: string): Promise<string> {
  const res = await fetch(higgsfieldVideoUrl);
  if (!res.ok) {
    throw new Error(`Failed to download slide video (${res.status}) from ${higgsfieldVideoUrl}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());

  const { prisma } = await import("@/lib/prisma");
  const slide = await prisma.carouselSlide.findUniqueOrThrow({
    where: { id: slideId },
    include: { carouselPost: { select: { topicSlug: true, generatedFor: true } } },
  });

  const dateStr = slide.carouselPost.generatedFor.toISOString().slice(0, 10);
  const path = `carousels/${dateStr}/${slide.carouselPost.topicSlug}/slide-${slide.order}-${slide.kind.toLowerCase()}.mp4`;

  const { supabase } = await import("@/lib/supabase.server");
  const { error } = await supabase.storage
    .from("content-factory")
    .upload(path, buffer, { contentType: "video/mp4", upsert: true });
  if (error) throw new Error(`Supabase video upload failed for ${path}: ${error.message}`);

  const { data } = supabase.storage.from("content-factory").getPublicUrl(path);
  await prisma.carouselSlide.update({
    where: { id: slideId },
    data: { videoUrl: data.publicUrl },
  });

  console.log(`[animate-cover] Stored video for slide ${slideId}: ${data.publicUrl}`);
  return data.publicUrl;
}
