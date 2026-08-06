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
 * v5 (2026-08-06): v4 told the model to animate text, but the raw cover
 * has no text — causing the model to hallucinate ugly numbers/letters.
 * v5 explicitly bans text generation and focuses entirely on flowing,
 * continuous scene motion with specific choreography.
 */
/** Which animation treatment a cover gets. */
export type AnimationStyle = "smooth" | "crazy";

export function buildCoverVideoPrompt(topic: Pick<CarouselTopic, "emotionBeat">): string {
  const emotionBeat =
    topic.emotionBeat ??
    "a relaxed shrug — both shoulders rise and drop visibly — then a slow knowing smile spreads across her face";
  return [
    // CORE DIRECTIVE
    "Smooth, flowing cinematic animation of this scene. Every element moves continuously throughout — nothing should be static at any point in the video.",
    // CHARACTER — continuous flowing motion, not a single pose
    `The woman performs a slow, fluid gesture: ${emotionBeat}.`,
    "The motion is continuous and flowing — she doesn't snap into a pose and freeze. Her head turns gradually, shoulders roll smoothly, hands drift through the air, her expression shifts naturally over several seconds. Her hair sways and settles. She breathes visibly.",
    // ENVIRONMENT — layered continuous motion
    "Background: clouds drift across the sky, birds glide past in the distance, tree branches rock gently in a continuous breeze, distant light shifts gradually.",
    "Midground: leaves or petals float lazily through the air, plants sway side to side in a slow rhythm, fabric or curtains ripple continuously.",
    "Foreground: steam curls upward in slow spirals from a mug or candle, dust particles drift through warm light, small details like a pen or phone catch shifting reflections.",
    // CAMERA — smooth continuous push
    "The camera drifts forward in a slow, steady dolly-in throughout the entire clip — never stopping. Foreground elements slide past faster than background, creating natural depth.",
    // LIGHTING — living light
    "Warm golden light shifts gradually across the scene as if filtering through moving curtains or passing clouds. Soft shadows drift across her face and the surfaces around her.",
    // STRICT PROHIBITIONS
    "Do NOT generate, add, or show any text, numbers, letters, titles, or captions anywhere in the video. This is a text-free scene.",
    "No warping or distortion of the character's face. Maintain consistent character identity throughout.",
  ].join(" ");
}

/**
 * "Crazy intro" variant — used for one of the five daily posts (the first
 * run of the day). Maximum-energy: fast camera, dramatic entrance,
 * everything animated aggressively. Still no text generation.
 */
export function buildCrazyCoverVideoPrompt(topic: Pick<CarouselTopic, "emotionBeat">): string {
  const emotionBeat =
    topic.emotionBeat ??
    "a confident head turn to camera with a knowing smile";
  return [
    // CORE DIRECTIVE
    "High-energy, attention-grabbing animation of this scene. Fast start, smooth settle, everything in continuous motion throughout.",
    // CHARACTER — bold continuous motion
    `The woman performs a dramatic, flowing gesture: ${emotionBeat}. Her whole upper body moves fluidly — leaning in, shoulders rolling, hands sweeping through the air, expression shifting from neutral to bold confidence over several seconds. Hair swings and settles naturally. She doesn't freeze into a pose.`,
    // ENVIRONMENT — energetic layered motion
    "Background: a flock of birds bursts across the sky, clouds race past, tree branches whip and sway, dramatic light sweeps across the horizon.",
    "Midground: leaves and petals swirl through the air in gusts, plants rock dramatically, fabric and curtains billow outward, background objects shift with visible parallax.",
    "Foreground: steam or smoke rushes upward, dust particles scatter through shafts of light, small objects vibrate with energy, warm reflections dance across surfaces.",
    // CAMERA — fast approach that settles
    "The camera rushes forward aggressively at the start with motion blur, then decelerates into a smooth, steady drift forward. Strong parallax throughout — foreground races past while background moves slowly.",
    // LIGHTING — dramatic shifts
    "Light flares dramatically at the start then settles into warm, shifting golden tones. Shadows sweep across the scene. The lighting keeps moving throughout, never static.",
    // STRICT PROHIBITIONS
    "Do NOT generate, add, or show any text, numbers, letters, titles, or captions anywhere in the video. This is a text-free scene.",
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
