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
 *   "higgsfield-ai/dop/turbo". If unset, animation is skipped
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
 * v4 (2026-08-06): v3 still only produced face movement and blinking.
 * This version is hyper-specific about every element that must move:
 * birds, light rays, text animation, full character gesture, particles.
 * Vague "cinematic" language doesn't work — the model needs concrete
 * motion instructions for each layer of the scene.
 */
/** Which animation treatment a cover gets. */
export type AnimationStyle = "smooth" | "crazy";

export function buildCoverVideoPrompt(topic: Pick<CarouselTopic, "emotionBeat">): string {
  const emotionBeat =
    topic.emotionBeat ??
    "a relaxed shrug — both shoulders rise and drop visibly — then a slow knowing smile spreads across her face";
  return [
    // CHARACTER — specific large motions, not "expressive gesture"
    `The woman performs a clear, unmistakable physical gesture: ${emotionBeat}.`,
    "Her head tilts, her shoulders move up and down, her hands shift position, her eyes blink naturally, and her facial expression visibly changes. Her hair sways with the movement. This is a FULL upper-body motion, not a micro-expression.",
    // ENVIRONMENT — name exact animated elements
    "The background is fully alive: birds fly across the sky in the distance, tree branches and leaves sway in a breeze, clouds drift slowly, light rays shift and move across the scene casting moving shadows.",
    "Closer to camera: steam or smoke curls upward from a mug or candle, dust particles float through shafts of light, fabric or curtains billow gently, flowers or plants bob in the wind.",
    // TEXT — animate the headline
    "Any text or headline in the scene slides smoothly into position from off-screen with a confident sweeping motion, settling crisply into place.",
    // CAMERA
    "The camera slowly pushes forward in a dolly-in, creating visible parallax — foreground elements shift faster than background elements.",
    // LIGHTING
    "The lighting shifts subtly throughout — warm golden light brightens and dims as if clouds are passing, creating a living, breathing atmosphere.",
    // QUALITY GUARDS
    "No warping or distortion of the character's face. Maintain consistent character identity throughout.",
  ].join(" ");
}

/**
 * "Crazy intro" variant — used for one of the five daily posts (the first
 * run of the day). Maximum-energy: fast camera move, dramatic entrance,
 * every element animated aggressively.
 */
export function buildCrazyCoverVideoPrompt(topic: Pick<CarouselTopic, "emotionBeat">): string {
  const emotionBeat =
    topic.emotionBeat ??
    "a confident head turn to camera with a knowing smile";
  return [
    // CHARACTER — bold dramatic motion
    `The woman makes a dramatic, attention-grabbing move: ${emotionBeat}. Her whole upper body is involved — she leans forward, shoulders roll, hands gesture widely, her expression shifts from neutral to bold confidence. Hair swings with the motion.`,
    // ENVIRONMENT — maximum life
    "The entire scene bursts with motion: a flock of birds scatters across the sky, tree branches sway dramatically, leaves and petals swirl through the air, clouds race past overhead.",
    "Steam or smoke pours upward energetically, candle flames flicker and dance, curtains and fabric whip in the wind, light particles and dust motes swirl through the frame.",
    // TEXT — punchy animated entrance
    "Any headline text punches onto the screen with kinetic energy — sliding or snapping into place with impact, like a movie title card.",
    // CAMERA — aggressive movement
    "The camera rushes in with a fast dolly or whip-pan that decelerates smoothly — heavy motion blur at the start that resolves into sharp clarity. Aggressive parallax between all depth layers.",
    // LIGHTING — dramatic shifts
    "Light flares across the scene, warm golden tones pulse and shift, dramatic shadows sweep across surfaces as if the sun just broke through clouds.",
    // QUALITY GUARDS
    "No warping or distortion of the character's face. Maintain consistent character identity throughout.",
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
