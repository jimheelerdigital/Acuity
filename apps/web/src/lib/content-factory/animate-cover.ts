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
 * v13 (2026-08-12, per Keenan): a bathtub start frame made the model have
 * the woman STAND UP out of the water, fully clothed. Positive-only
 * posture pin — whatever position the image shows is held for the whole
 * clip.
 */
const POSTURE_LOCK_LINE =
  "She holds the position the image shows for the entire video — if seated she stays seated, if reclining she stays reclining — while her face, hands, and body move naturally and expressively within that pose.";

/**
 * v14 (2026-08-16, per Keenan): locked-camera micro-motion clips read as
 * boring/static. Text-free clips (VIDEO slides + STORY scenes) have no
 * baked text to warp, so they get a slow cinematic camera move and a
 * living environment. Baked-text clips keep the hard camera lock (camera
 * motion warps the text — v12 note above).
 *
 * v16 (2026-08-24, per Keenan): every clip was the same "push in toward
 * her" — text-free clips now rotate through several slow moves (seeded by
 * slide order, so one post's clips each move differently), and the moves
 * are subject-agnostic because scenes are no longer always a woman.
 */
const CAMERA_MOVES_TEXTFREE = [
  "The camera pushes in very slowly and smoothly toward the heart of the scene — one continuous gentle cinematic drift, no cuts, no shake, no fast moves.",
  "The camera pulls back very slowly and smoothly — one continuous gentle cinematic drift, no cuts, no shake, no fast moves.",
  "The camera glides very slowly and smoothly to one side — one continuous gentle cinematic drift, no cuts, no shake, no fast moves.",
  "The camera rises very slowly and smoothly — one continuous gentle cinematic drift, no cuts, no shake, no fast moves.",
  "The camera holds nearly still, with only the softest breathing drift — no cuts, no shake, no fast moves.",
] as const;
const STYLE_HOLD_LINE =
  "Same art style, same scene, same colors from first frame to last.";
/**
 * v15 (2026-08-19, per Keenan): the old ambient line listed object nouns
 * ("steam, rain, curtains, dust, screens, reflections") as things that
 * may keep moving — and per the v9/v12 lesson the model EXECUTES any noun
 * it's given, so it invented moving curtains/blinds behind the character
 * in scenes that had none. Positive-only now, zero inventable nouns: only
 * movement already present in the image continues.
 */
const AMBIENT_LINE =
  "The background stays exactly what the image already shows, softly alive — only movement that is already part of the scene continues, gently and naturally. Nothing new appears, and nothing enters or leaves the frame.";

/**
 * `textFree` = the start frame has NO text (animated-post pipeline: words
 * are burned on afterwards with ffmpeg). Baked-text clips keep the hard
 * camera lock; text-free clips are built by buildSceneVideoPrompt.
 */
function sceneLockLines(): string[] {
  return [POSTURE_LOCK_LINE, CAMERA_LOCK_LINE, TEXT_LINE, QUALITY_LINE];
}

/**
 * Per-slide direction (2026-08-11; scene added 2026-08-24). `mood` selects
 * a curated motion pool + the image expression; `scene` is the bespoke
 * Claude-written visual concept the slide's artwork was generated from
 * (woman-in-a-moment OR object scene); `motion` is the bespoke
 * Claude-written movement matched to the slide's text. Bespoke motion wins
 * when it passes the safety check; otherwise the mood pool is the fallback.
 */
export interface SlideEmotion {
  mood?: string;
  scene?: string;
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
 *
 * v16 (2026-08-24): "door"/"window" removed from the blocklist — scenes
 * are now bespoke per slide and legitimately contain them (rain on a
 * window, light under a door). The locomotion/speech bans that actually
 * caused the v12 breakage all stay.
 */
const UNSAFE_MOTION_PATTERN =
  /\b(walks?|walking|stands?|standing|steps?|stepping|strides?|rises?|rising|gets? up|getting up|turns? around|talks?|talking|speaks?|speaking|says?|saying|sings?|singing|shouts?|mouths?|jumps?|runs?|running|dances?|dancing|leaves?|leaving|camera (?:pans|zooms|moves)|opens? her mouth)\b/i;

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

/** Positive-only, noun-free ambient fallback for scenes with no usable motion. */
const MOTION_FALLBACK_LINE =
  "Everything already present in the scene moves gently and continuously with natural, lifelike motion.";

/** Normalize a bespoke motion into a standalone sentence. */
function asMotionSentence(motion: string): string {
  const t = motion.trim().replace(/\s+/g, " ");
  const capped = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

/**
 * True when the slide's direction involves a person — decides whether the
 * posture pin applies. Legacy slides (no scene) always had a woman, so an
 * absent scene counts as person-present.
 */
function sceneHasWoman(emotion?: SlideEmotion): boolean {
  if (!emotion?.scene) return true;
  return /\b(she|her|hers|herself|woman)\b/i.test(
    `${emotion.scene} ${emotion.motion ?? ""}`
  );
}

/**
 * v16 (2026-08-24, per Keenan): prompt for TEXT-FREE clips (the animated
 * daily posts). The old builders hard-coded "The woman stays in the same
 * spot… camera pushes in toward her", so every clip was a push-in on a
 * woman. Now the bespoke Claude-written motion (matched to the slide's
 * scene AND its text) leads the prompt, the camera move rotates by seed,
 * and the posture pin only applies when the scene actually has a person.
 */
export function buildSceneVideoPrompt(opts?: {
  seed?: number;
  emotion?: SlideEmotion;
}): string {
  const seed = opts?.seed ?? 0;
  const emotion = opts?.emotion;
  const hasWoman = sceneHasWoman(emotion);

  let motion: string;
  if (emotion && isSafeMotion(emotion.motion)) {
    motion = asMotionSentence(emotion.motion);
  } else if (hasWoman) {
    // Bespoke motion missing/unsafe but a woman is in frame — the curated
    // mood pools still fit. Beats written as "her jaw sets…" / "a slow
    // head tilt…" already stand alone; verb-first beats get a "She".
    const pool =
      emotion && isMood(emotion.mood)
        ? MOOD_MOTION_BEATS[emotion.mood]
        : ALL_MOTION_BEATS;
    const beat = pool[seed % pool.length];
    motion = asMotionSentence(/^(her|a|an|the)\b/i.test(beat) ? beat : `She ${beat}`);
  } else {
    motion = MOTION_FALLBACK_LINE;
  }

  return [
    motion,
    hasWoman ? POSTURE_LOCK_LINE : "",
    CAMERA_MOVES_TEXTFREE[seed % CAMERA_MOVES_TEXTFREE.length],
    STYLE_HOLD_LINE,
    AMBIENT_LINE,
    QUALITY_LINE,
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildCoverVideoPrompt(
  topic: Pick<CarouselTopic, "emotionBeat"> | undefined,
  opts?: { textFree?: boolean; seed?: number; emotion?: SlideEmotion }
): string {
  if (opts?.textFree) {
    // Seed-bank topics carry a curated "She …" emotionBeat fragment — fold
    // it into the emotion when no bespoke motion exists.
    const emotion: SlideEmotion | undefined =
      opts.emotion && isSafeMotion(opts.emotion.motion)
        ? opts.emotion
        : topic?.emotionBeat
          ? { ...opts.emotion, motion: `She ${topic.emotionBeat}` }
          : opts.emotion;
    return buildSceneVideoPrompt({ seed: opts.seed, emotion });
  }

  // Baked-text path (photo-bucket covers via the admin animate action):
  // camera hard-locked so the text can't warp — unchanged since v12.
  const emotionBeat =
    opts?.emotion && isSafeMotion(opts.emotion.motion)
      ? opts.emotion.motion.trim()
      : topic?.emotionBeat ?? resolveMotionBeat(opts?.emotion, opts?.seed ?? 0);
  return [
    `The woman stays in the same spot and pose, lips closed. She ${emotionBeat} — subtle, natural movement of her face, head, shoulders, and hands only.`,
    ...sceneLockLines(),
  ].join(" ");
}

/**
 * Prompt for non-cover slides (reason slides) on fully animated posts.
 * Text-free slides get the scene-based v16 prompt; baked-text slides keep
 * the locked-camera continuation prompt. `emotion` carries the slide's
 * bespoke scene + motion + mood; `seed` (usually the slide order) rotates
 * the camera move and pool fallback so the post's videos each move
 * differently.
 */
export function buildSlideVideoPrompt(opts?: {
  textFree?: boolean;
  seed?: number;
  emotion?: SlideEmotion;
}): string {
  if (opts?.textFree) {
    return buildSceneVideoPrompt({ seed: opts.seed, emotion: opts.emotion });
  }
  const beat = resolveMotionBeat(opts?.emotion, opts?.seed ?? 0);
  return [
    "The character continues the exact activity shown in the image, staying in the same spot and pose, lips closed.",
    `She ${beat} — a clearly visible, emotionally charged movement, with natural life in her hands, eyes, and breathing.`,
    ...sceneLockLines(),
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
    ...sceneLockLines(),
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
  /** Explicit clip length in seconds (story clips use 5). Overrides env/default. */
  duration?: number;
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
  // Per-call override wins (story-video clips run longer than slide clips).
  if (Number.isFinite(opts.duration) && (opts.duration as number) > 0) {
    body.duration = opts.duration;
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
