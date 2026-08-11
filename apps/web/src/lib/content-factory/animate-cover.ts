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
import { isMood, type Mood } from "./brand";

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
const TEXT_LINE =
  "All text in the image stays razor-sharp, fixed in place, and fully visible in front of the scene for the entire video, with every movement happening behind it.";
const QUALITY_LINE =
  "Crisp, sharp, high-definition cinematic footage with steady lighting, rich color, and clean detail from first frame to last.";

/**
 * v12 (2026-08-10): scene/style/camera lock. Frame-extraction on the v11
 * output proved the model executes ANY verb it is given: quoting the slide
 * text ("…until the window closes itself") made the character stand up,
 * walk to a window, and even morph the claymation art style into photoreal
 * footage — trampling the baked-in text. So v12 gives the model zero new
 * actions: the character simply continues the activity the image already
 * shows (each slide's artwork depicts its own reason), in place, lips
 * closed, on a locked camera. Camera moves also warp baked-in text, so
 * the push-in is gone.
 */
const CAMERA_LOCK_LINE =
  "Fixed, locked camera. Same art style, same scene, same colors, same framing from first frame to last.";

/**
 * `textFree` = the start frame has NO text (animated-post pipeline: words
 * are burned on afterwards with ffmpeg). In that case the prompt must not
 * mention text at all — mentioning it invites the model to invent some.
 */
function sceneLockLines(textFree: boolean): string[] {
  return textFree
    ? [CAMERA_LOCK_LINE, QUALITY_LINE]
    : [CAMERA_LOCK_LINE, TEXT_LINE, QUALITY_LINE];
}

/**
 * Per-slide emotion direction (2026-08-11). `mood` selects a curated
 * motion pool + the image expression; `motion` is a bespoke Claude-written
 * micro-gesture matched to the slide's text. Bespoke motion wins when it
 * passes the safety check; otherwise the mood pool is the fallback.
 */
export interface SlideEmotion {
  mood?: string;
  motion?: string;
}

/**
 * Mood-grouped micro-motion beats, rotated within a mood so a post's
 * videos don't all move identically while still matching the emotional
 * weight of each slide. Same in-place style throughout — no walking,
 * no talking, no new actions.
 */
export const MOOD_MOTION_BEATS: Record<Mood, readonly string[]> = {
  heavy: [
    "lets her eyes fall closed as her head bows slowly, shoulders sinking under the weight",
    "rubs her temple slowly, eyes heavy, blinking like she can barely keep them open",
    "exhales long and slow, her whole body deflating slightly, gaze drifting down",
    "presses her palm to her forehead and holds it there, eyes closing",
    "tips her head back briefly with eyes shut, then drifts down into a drained blink",
    "stares ahead with heavy, unfocused eyes, one slow exhausted blink",
  ],
  tender: [
    "her eyes glisten as she takes one slow blink, holding back the feeling",
    "presses a hand softly over her heart, eyes going distant and glassy",
    "hugs her arms around herself, gaze drifting away, breath catching",
    "her lips press together as she swallows, eyes softening with held-back emotion",
    "looks down slowly, lashes lowering, a fragile breath moving her shoulders",
    "her eyes search the middle distance, vulnerable and open, breath shallow",
  ],
  wry: [
    "a slow, knowing head tilt and a soft exhale",
    "a small, wry smile slowly reaching her eyes",
    "gently shaking her head, half-smiling at the truth of it",
    "a quiet laugh through her nose, eyes softening",
    "nodding slowly, like she's finally admitting it to herself",
    "rolls her eyes gently at herself as a self-deprecating half-smile forms",
  ],
  frustrated: [
    "pinches the bridge of her nose and exhales hard, jaw tightening",
    "her jaw sets as she exhales sharply through her nose, eyes narrowing slightly",
    "shakes her head in disbelief, lips pressed thin",
    "closes her eyes and breathes in slowly, visibly holding her composure",
    "her brow furrows as she stares ahead, fingers slowly tensing",
    "tips her head back with a frustrated exhale, then levels a fed-up stare",
  ],
  hopeful: [
    "briefly closing her eyes and taking one deep, settling breath",
    "letting her shoulders drop as the tension visibly leaves them",
    "a slow genuine smile spreads as she exhales, shoulders settling with ease",
    "lifts her chin gently as her posture opens, a calm steadying breath",
    "her face softens into quiet relief, eyes brightening slowly",
    "tucking a strand of hair back while glancing up thoughtfully, lighter now",
  ],
};

/** Flat pool used when no mood is known (legacy posts, admin re-animate). */
const ALL_MOTION_BEATS: readonly string[] = Object.values(MOOD_MOTION_BEATS).flat();

/**
 * Verbs/nouns that have made the i2v model break the scene lock in live
 * runs (v12 notes above: walking to a window, standing up, talking). A
 * bespoke Claude-written motion containing any of these is discarded in
 * favor of the curated mood pool.
 */
const UNSAFE_MOTION_PATTERN =
  /\b(walks?|walking|stands?|standing|steps?|stepping|strides?|rises?|rising|gets? up|getting up|turns? around|talks?|talking|speaks?|speaking|says?|saying|sings?|singing|shouts?|mouths?|jumps?|runs?|running|dances?|dancing|leaves?|leaving|door|window|camera (?:pans|zooms|moves)|opens? her mouth)\b/i;

/** True when a bespoke motion is safe to hand to the video model. */
export function isSafeMotion(motion: unknown): motion is string {
  return (
    typeof motion === "string" &&
    motion.trim().length > 0 &&
    motion.length <= 220 &&
    !UNSAFE_MOTION_PATTERN.test(motion)
  );
}

/**
 * Resolve the motion beat for a slide: bespoke Claude-written motion when
 * safe → curated pool for the slide's mood → flat all-moods pool. `seed`
 * rotates within the pool so slides sharing a mood still vary.
 */
export function resolveMotionBeat(emotion: SlideEmotion | undefined, seed: number): string {
  if (emotion && isSafeMotion(emotion.motion)) return emotion.motion.trim();
  const pool = emotion && isMood(emotion.mood) ? MOOD_MOTION_BEATS[emotion.mood] : ALL_MOTION_BEATS;
  return pool[seed % pool.length];
}

export function buildCoverVideoPrompt(
  topic: Pick<CarouselTopic, "emotionBeat"> | undefined,
  opts?: { textFree?: boolean; seed?: number; emotion?: SlideEmotion }
): string {
  // Precedence: bespoke per-slide motion (AI-generated topics) → curated
  // topic emotionBeat (seed-bank topics) → mood pool.
  const emotionBeat =
    opts?.emotion && isSafeMotion(opts.emotion.motion)
      ? opts.emotion.motion.trim()
      : topic?.emotionBeat ?? resolveMotionBeat(opts?.emotion, opts?.seed ?? 0);
  return [
    `The woman stays in the same spot and pose, lips closed. She ${emotionBeat} — subtle, natural movement of her face, head, shoulders, and hands only.`,
    ...sceneLockLines(Boolean(opts?.textFree)),
  ].join(" ");
}

/**
 * Prompt for non-cover slides (reason slides) on fully animated posts.
 * The slide's artwork already depicts its reason, so the animation just
 * continues that exact activity in place — no new actions introduced.
 * `emotion` carries the slide's bespoke motion + mood; `seed` (usually
 * the slide order) rotates the pool fallback so the post's videos each
 * move a little differently.
 */
export function buildSlideVideoPrompt(opts?: {
  textFree?: boolean;
  seed?: number;
  emotion?: SlideEmotion;
}): string {
  const beat = resolveMotionBeat(opts?.emotion, opts?.seed ?? 0);
  return [
    "The character continues the exact activity shown in the image, staying in the same spot and pose, lips closed.",
    `Subtle, natural movements of the hands, eyes, and breathing, plus ${beat}.`,
    ...sceneLockLines(Boolean(opts?.textFree)),
  ].join(" ");
}

/**
 * "Crazy intro" variant — one post per day. Bolder gesture and a faster
 * camera land, same short-prompt approach and same text protection.
 */
export function buildCrazyCoverVideoPrompt(
  topic: Pick<CarouselTopic, "emotionBeat"> | undefined,
  opts?: { emotion?: SlideEmotion }
): string {
  const emotionBeat =
    (opts?.emotion && isSafeMotion(opts.emotion.motion) ? opts.emotion.motion.trim() : undefined) ??
    topic?.emotionBeat ??
    "a deep exhale and then looks up with quiet confidence";
  return [
    `The woman stays in the same spot and pose, lips closed. She ${emotionBeat} — one bold, confident movement of her head, shoulders, and hands with real momentum.`,
    ...sceneLockLines(false),
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
  let buffer: Buffer = Buffer.from(await res.arrayBuffer());
  // A frameless stub from the CDN would burn into a broken file — fail the
  // step instead so the retry / next wave resubmits the slide.
  if (buffer.length < 100_000) {
    throw new Error(
      `Downloaded slide video is only ${buffer.length} bytes from ${higgsfieldVideoUrl} — refusing to store`
    );
  }
  console.log(`[animate-cover] Downloaded ${buffer.length} bytes for slide ${slideId}`);

  const { prisma } = await import("@/lib/prisma");
  const slide = await prisma.carouselSlide.findUniqueOrThrow({
    where: { id: slideId },
    include: { carouselPost: { select: { topicSlug: true, generatedFor: true } } },
  });

  // Text-free pipeline: the video was animated from the raw (no-text)
  // artwork, so burn the exact overlay used on the static JPEG onto it.
  // If the burn fails we store the text-free video rather than nothing.
  if (slide.rawImageUrl && slide.kind !== "CTA") {
    try {
      const { burnOverlayOntoVideo } = await import("./video-overlay");
      const { supabase } = await import("@/lib/supabase.server");

      // Prefer the overlay PNG stored at generation time — the EXACT same
      // pixels as on the static JPEG (incl. the carousel's accent color).
      const genDateStr = slide.carouselPost.generatedFor.toISOString().slice(0, 10);
      const overlayPath = `carousels/${genDateStr}/${slide.carouselPost.topicSlug}/slide-${slide.order}-overlay.png`;
      let overlay: Buffer;
      const { data: overlayData } = await supabase.storage
        .from("content-factory")
        .download(overlayPath);
      if (overlayData) {
        overlay = Buffer.from(await overlayData.arrayBuffer());
        console.log(`[animate-cover] Using stored overlay ${overlayPath}`);
      } else {
        // Older posts predate stored overlays — re-render with defaults.
        const { renderSlideTextOverlay } = await import("./compose");
        overlay = await renderSlideTextOverlay(
          slide.overlayText,
          slide.kind as "COVER" | "REASON",
          slide.kind === "REASON" ? slide.order : undefined
        );
        console.log(`[animate-cover] No stored overlay at ${overlayPath} — re-rendered`);
      }
      buffer = await burnOverlayOntoVideo(buffer, overlay);
      console.log(`[animate-cover] Burned text overlay onto video for slide ${slideId}`);
    } catch (burnErr) {
      console.error(
        `[animate-cover] Overlay burn failed for slide ${slideId} — storing text-free video: ${burnErr instanceof Error ? burnErr.message : burnErr}`
      );
    }
  }

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
