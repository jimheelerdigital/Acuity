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
 * v7 (2026-08-06): v6 had the character getting up and walking around.
 * v7 pins her stationary — seated or standing in place — and focuses on
 * emotional micro-gestures (shrug, deep breath, knowing smile) with
 * birds and ambient background life. Explicit "do not walk" guardrails.
 */
/** Which animation treatment a cover gets. */
export type AnimationStyle = "smooth" | "crazy";

export function buildCoverVideoPrompt(topic: Pick<CarouselTopic, "emotionBeat">): string {
  const emotionBeat =
    topic.emotionBeat ??
    "a small shrug, a deep breath, then a knowing half-smile";
  return [
    "Simple, emotional social media cover animation. The woman stays in place — no walking or relocating — but her upper body is expressive and alive.",
    `She does one emotional gesture: ${emotionBeat}. She can shrug, sigh, rub her head, lean back in her chair, lean forward, take a sip of coffee, tuck her hair back, or gesture softly while thinking. Her shoulders shift, she breathes visibly, her expression tells a story.`,
    "The background has gentle life — birds flutter past in the distance, a breeze moves the leaves, warm light shifts softly across the scene. Steam curls from a mug if one is present.",
    "The camera slowly drifts forward a few inches, creating a gentle sense of depth.",
    "The mood is warm, still, and emotionally resonant — like a quiet moment caught on camera.",
    "Her feet stay planted. No walking, no standing up, no moving to a different spot. But her upper body, hands, and face move freely.",
    "Do NOT generate any text, numbers, or letters. No warping or distortion of the face.",
  ].join(" ");
}

/**
 * "Crazy intro" variant — one post per day. Bolder emotional energy but
 * the character stays stationary — more confident gesture, slightly
 * faster camera, more ambient motion.
 */
export function buildCrazyCoverVideoPrompt(topic: Pick<CarouselTopic, "emotionBeat">): string {
  const emotionBeat =
    topic.emotionBeat ??
    "a deep exhale, then a confident look up to camera with a slight smile";
  return [
    "Bold, scroll-stopping social media cover animation. The woman stays in place — no walking or relocating — but her upper body is confident and expressive.",
    `She does one bold, emotional gesture: ${emotionBeat}. She can shrug dramatically, sigh, rub her forehead, lean back confidently, lean forward with intent, take a sip of coffee, or gesture with conviction. Shoulders shift, expression transforms, hair moves naturally.`,
    "The background has energy — birds scatter across the sky, leaves drift through the air, warm golden light sweeps across the scene. A candle flame flickers or steam rises if props are present.",
    "The camera pushes in with purpose — a smooth, steady move that draws you into the scene.",
    "The feel is bold, emotional, and premium. Confident but grounded — the power comes from her expression and hands, not from locomotion.",
    "Her feet stay planted. No walking, no standing up, no moving to a different spot. But her upper body, hands, and face move freely.",
    "Do NOT generate any text, numbers, or letters. No warping or distortion of the face.",
  ].join(" ");
}

/**
 * Submit an image-to-video job. Returns the Higgsfield request ID.
 *
 * Uses the standard i2v model (no end-frame lock) so the model is free
 * to produce dramatic motion from the start frame.
 */
export async function submitCoverVideo(opts: {
  startImageUrl: string; // text-free raw cover
  prompt: string;
}): Promise<string> {
  const model = process.env.HIGGSFIELD_VIDEO_MODEL!;
  const res = await fetch(`${BASE_URL}/${model}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      prompt: opts.prompt,
      image_url: opts.startImageUrl,
      motions: [],
      // Never let Higgsfield rewrite our validated prompt template.
      enhance_prompt: false,
    }),
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
 * Storage next to the cover JPEG, and persist videoUrl on the slide.
 * Returns the public Supabase URL.
 */
export async function storeCoverVideo(slideId: string, higgsfieldVideoUrl: string): Promise<string> {
  const res = await fetch(higgsfieldVideoUrl);
  if (!res.ok) {
    throw new Error(`Failed to download cover video (${res.status}) from ${higgsfieldVideoUrl}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());

  const { prisma } = await import("@/lib/prisma");
  const slide = await prisma.carouselSlide.findUniqueOrThrow({
    where: { id: slideId },
    include: { carouselPost: { select: { topicSlug: true, generatedFor: true } } },
  });

  const dateStr = slide.carouselPost.generatedFor.toISOString().slice(0, 10);
  const path = `carousels/${dateStr}/${slide.carouselPost.topicSlug}/slide-0-cover.mp4`;

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

  console.log(`[animate-cover] Stored cover video for slide ${slideId}: ${data.publicUrl}`);
  return data.publicUrl;
}
