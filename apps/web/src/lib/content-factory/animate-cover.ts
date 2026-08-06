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
 *   "higgsfield-ai/dop/standard". If unset, animation is skipped
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
 * Build the image-to-video prompt for a cover. The per-topic emotionBeat
 * is the character's motion direction.
 *
 * v3 (2026-08-06): switched from first-last-frame to standard i2v.
 * The old first-last-frame model received near-identical start/end frames
 * (same scene ± text overlay), so it produced almost no motion. With the
 * end-frame constraint removed, the model is free to animate the full
 * scene dramatically.
 */
/** Which animation treatment a cover gets. */
export type AnimationStyle = "smooth" | "crazy";

export function buildCoverVideoPrompt(topic: Pick<CarouselTopic, "emotionBeat">): string {
  const emotionBeat =
    topic.emotionBeat ??
    "a small tired shrug — shoulders lifting then dropping with a slow exhale — followed by a soft, knowing half-smile to camera";
  return [
    "Cinematic, scroll-stopping social media cover animation. The ENTIRE scene must come alive with dramatic, clearly visible motion from the very first frame.",
    `The main character performs a full, expressive gesture: ${emotionBeat}. Her whole upper body moves — head turns, shoulders shift, hands gesture openly, facial expression transforms. This is NOT subtle — the motion should be immediately obvious.`,
    "Everything in the environment moves: steam billows from a mug, candle flames dance and flicker, curtains sway, plants rustle, hair drifts naturally, fabric shifts, warm light plays across surfaces. Fill the scene with life.",
    "The camera executes a confident cinematic move — a slow dolly-in with visible parallax between foreground and background layers, or a gentle crane-up that reveals depth.",
    "The overall energy is warm, premium, and alive. Every element in frame should be in motion. This must look like a living scene, never a still photo with a subtle filter.",
    "No warping or distortion of the character's face.",
  ].join(" ");
}

/**
 * "Crazy intro" variant — used for one of the five daily posts (the first
 * run of the day). Maximum-energy treatment: dramatic camera whip, explosive
 * scene entrance, everything moving at once.
 */
export function buildCrazyCoverVideoPrompt(topic: Pick<CarouselTopic, "emotionBeat">): string {
  const emotionBeat =
    topic.emotionBeat ??
    "a confident head turn to camera with a knowing smile";
  return [
    "Explosive, high-energy social media cover animation built to stop the scroll instantly. Maximum motion and energy throughout.",
    "The camera whips in with a fast, dramatic movement — the whole scene rushes toward the viewer with motion blur that decelerates into a confident landing.",
    `The main character performs a bold, attention-grabbing gesture: ${emotionBeat}. Full body involvement — leaning in, hands moving, expression shifting dramatically.`,
    "The entire environment erupts with motion: objects shift, light flares across surfaces, particles or steam catch the light, fabric and hair sweep with the camera movement, background elements have visible parallax.",
    "The pacing is fast-then-smooth: explosive energetic entrance in the first second with dramatic motion blur, then a confident cinematic settle where everything is still alive and moving but controlled.",
    "Bold, thrilling, premium — like a title sequence from a high-end brand campaign. Every pixel should be in motion.",
    "No warping or distortion of the character's face.",
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
