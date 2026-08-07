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
 * v9 (2026-08-07): long prompts with many negative instructions don't
 * work — the model latches on to verbs like "walking" and "talking" and
 * does them. v9 is ultra-short: only describes what SHOULD happen,
 * avoids mentioning unwanted behaviors entirely.
 */
/** Which animation treatment a cover gets. */
export type AnimationStyle = "smooth" | "crazy";

export function buildCoverVideoPrompt(topic: Pick<CarouselTopic, "emotionBeat">): string {
  const emotionBeat =
    topic.emotionBeat ??
    "a gentle shrug and a slow deep breath";
  return [
    `A still, quiet moment. The woman is seated. Her lips are closed. She ${emotionBeat}.`,
    "Her hair sways slightly. A bird glides past in the background. Steam rises from a mug.",
    "The camera drifts forward slowly. The same scene, same colors, same setting the entire time. All text in the image stays sharp and in place.",
  ].join(" ");
}

/**
 * "Crazy intro" variant — one post per day. Slightly bolder gesture
 * but same short-prompt approach.
 */
export function buildCrazyCoverVideoPrompt(topic: Pick<CarouselTopic, "emotionBeat">): string {
  const emotionBeat =
    topic.emotionBeat ??
    "a deep exhale and then looks up with quiet confidence";
  return [
    `A still, powerful moment. The woman is seated. Her lips are closed. She ${emotionBeat}.`,
    "Her hair catches a breeze. Birds fly across the sky in the background. A candle flame flickers.",
    "The camera pushes in steadily. The same scene, same colors, same setting the entire time. All text in the image stays sharp and in place.",
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
  const res = await fetch(`${BASE_URL}/${model}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      prompt: opts.prompt,
      image_url: opts.startImageUrl,
      duration: 4,
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
