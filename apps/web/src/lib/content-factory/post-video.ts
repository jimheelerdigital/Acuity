/**
 * Content Factory — Higgsfield POST VIDEOS (2026-09-26, per Keenan:
 * "higgsfield needs to build VIDEOS to post to all instagram and facebook
 * posts using higgsfield API").
 *
 * Every daily post, once generated, is handed to the
 * "content-factory/post-video.build" Inngest function
 * (inngest/functions/carousel-post-video.ts), which:
 *   1. plans each slide — "live" when a text-free photo + text layer exist
 *      (animated by Higgsfield, words laid back on top), "still" when the
 *      words are part of the photo (baked quote / message slides, timeline
 *      grids, paper guides), which get a slow push-in instead;
 *   2. renders the Higgsfield clips in waves (the account runs ~4 at once);
 *   3. assembles the video (living-reel.ts assemblePostVideo) with the
 *      brand CTA + library music and stores it at reels/<postId>.mp4 —
 *      the path the IG/FB publisher already posts from.
 *
 * Build state lives in Storage (video-builds/<postId>.json), not the DB,
 * so this shipped without a schema change. The publisher waits on a
 * "pending" marker instead of rendering its own slideshow, and the daily
 * digest (daily-digest.ts) waits until every post has a finished video.
 */

import { livingSlideSeconds } from "./living-reel";
import type { SocialAccountKey } from "./social-publish";

export type VideoBuildStatus = "pending" | "done" | "failed";

export interface VideoBuildMarker {
  status: VideoBuildStatus;
  /** Final video (reels/<postId>.mp4) once done. */
  url?: string;
  /** "higgsfield" = at least one animated slide; "stills" = push-in only. */
  source?: "higgsfield" | "stills";
  model?: string;
  liveSlides?: number;
  totalSlides?: number;
  error?: string;
  /** Why a post that wanted animation shipped as stills (2026-10-02). */
  stillsReason?: "no-credits";
  updatedAt: string;
}

// ─── Higgsfield credits (2026-10-02, fix #2 of the 30-day hands-off list) ──
// Out of credits, every submit fails at once, the post ships as push-in
// stills, and the daily health check used to call that "broken" and rebuild
// it every day (one email + retries per post). Now a submit wave where
// EVERY error looks like a billing error flips health/higgsfield-credits.json
// to out; the next successful submit flips it back, so videos resume on
// their own after a top-up. The health check reports it once every 3 days.
// The pattern is a best guess at Higgsfield's billing errors (HTTP 402 /
// "credit" / "balance" wording); widen it if a real one slips through.

const CREDITS_FLAG = "health/higgsfield-credits.json";
export const CREDITS_ALERT_EVERY_MS = 3 * 86_400_000;

export interface CreditsFlag {
  out: boolean;
  since?: string;
  lastError?: string;
  alertedAt?: string;
  updatedAt: string;
}

export function isOutOfCreditsError(message: string): boolean {
  return /\((402)\)|insufficient|not enough (credits|balance)|credit|balance|quota|payment required|top ?up/i.test(message);
}

export async function readCreditsFlag(): Promise<CreditsFlag | null> {
  const { readJson } = await import("./performance-loop");
  return readJson<CreditsFlag>(CREDITS_FLAG).catch(() => null);
}

export async function writeCreditsFlag(flag: Omit<CreditsFlag, "updatedAt">): Promise<void> {
  const { writeJson } = await import("./performance-loop");
  await writeJson(CREDITS_FLAG, { ...flag, updatedAt: new Date().toISOString() }).catch(() => undefined);
}

/** Record a submit wave's outcome. Returns true when it was a credits failure. */
export async function noteSubmitWave(submittedCount: number, errors: string[]): Promise<boolean> {
  const prev = await readCreditsFlag();
  if (submittedCount > 0) {
    if (prev?.out) await writeCreditsFlag({ out: false });
    return false;
  }
  const credits = errors.length > 0 && errors.every(isOutOfCreditsError);
  if (credits) {
    await writeCreditsFlag({
      out: true,
      since: prev?.out ? prev.since : new Date().toISOString(),
      lastError: errors[0].slice(0, 300),
      alertedAt: prev?.out ? prev.alertedAt : undefined,
    });
  }
  return credits;
}

const BUCKET = "content-factory";

const KLING_STD = "kling-video/v2.5-turbo/standard/image-to-video";
/**
 * Hailuo's 75%-off promo ends here; after it, Kling 2.5 Standard is cheapest.
 * 2026-10-04 (per Keenan: "use the best possible model that's the most cost
 * effective"): a new 7-day account discount runs to Oct 11 9:03 AM CT —
 * Hailuo 2.3 75% off (~$0.0117/s, 768x1364) vs Kling 50% off (~$0.0116/s,
 * 720p). Same price, Hailuo has the better resolution and motion, so it
 * leads again until then and Kling takes over automatically after.
 */
// (The promo-date switch was removed 2026-10-05: Kling leads always.)

/**
 * Post-video models (2026-09-28, per Keenan: "just use standard kling 2.5
 * as the backup. whats the lowest model that higgsfield can run"). The
 * cheapest working image-to-video model leads, the other backs it up:
 * - until Oct 1: Hailuo 2.3 Standard ($0.0117/s promo, ~$0.07 per 6s clip,
 *   768x1364) → Kling 2.5 Turbo Standard ($0.0231/s, ~$0.12 per 5s, 720p);
 * - from Oct 1 (Hailuo back to $0.047/s): Kling 2.5 Standard → Hailuo.
 * DoP Lite is dead on the dev API (jobs never leave "queued"; it's gone
 * from Higgsfield's model list); Kling 2.5 Turbo Pro 1080p is ~$0.19→$0.35.
 * HIGGSFIELD_LIVING_MODEL / HIGGSFIELD_FALLBACK_MODEL override either.
 */
// 2026-10-05, per Keenan ("you should use turbo standard always", after
// "i think hailu might be way worse"): Kling 2.5 Turbo Standard leads
// regardless of promos; Hailuo is only the backup.
export const POST_VIDEO_MODEL = process.env.HIGGSFIELD_LIVING_MODEL?.trim() || KLING_STD;

/**
 * Second model for clips the primary didn't deliver in time (failed
 * submit, failed clip, or still queued): unfinished slides are
 * resubmitted here once, so a slow or broken model costs a few minutes —
 * never the whole night's animation.
 */
// 2026-10-05, per Keenan: "i don't want hailuo as the model... i only want
// the kling we use". The backup is a second try on the same Kling model.
export const POST_VIDEO_FALLBACK_MODEL = process.env.HIGGSFIELD_FALLBACK_MODEL?.trim() || KLING_STD;

/**
 * Animated-slide budget per post (2026-09-29, per Keenan: "I don't want to
 * spend more than $5 a day across lanes"). The cover and first swipe decide
 * whether someone stops scrolling, so main lanes animate the cover + the
 * first slide and the rest get the free push-in; Legendary Mythicals
 * animates everything, because its five options ARE the content.
 * ~36 clips/day → ~$2.50 on Hailuo (promo), ~$4.20 on Kling 2.5 Std.
 * POST_VIDEO_MAX_LIVE overrides the main-lane number without a deploy.
 *
 * RIPPLE = 0 (2026-09-30, per Keenan: "turn off higgsfield animation ...
 * keep them as normal slow zoom posts of pictures that you cut together.
 * no higgsfield integration. it's not worth the cost for ripple"). Every
 * Ripple slide becomes a free push-in still; no Higgsfield call is made.
 * Ripple/BWK "which one is you?" pick lanes (pick-*, 2026-09-30): every
 * slide (cover + five picks), like Mythicals. Checked before the brand
 * override.
 * Per-brand override: POST_VIDEO_MAX_LIVE_<BRAND> (e.g.
 * POST_VIDEO_MAX_LIVE_BWK=2 turns BWK back on; needs a redeploy to apply).
 */
export function maxAnimatedSlides(brand: string, lane?: string | null): number {
  // Every slide (cover + 5 picks) since 2026-09-30 per Keenan: "it also
  // didn't animate every slide which it needs to". ~6 clips/post.
  if (lane?.startsWith("pick-")) return 6;
  const perBrand = process.env[`POST_VIDEO_MAX_LIVE_${brand.toUpperCase()}`];
  if (perBrand !== undefined && perBrand.trim() !== "") {
    const b = Number(perBrand);
    if (Number.isFinite(b) && b >= 0) return b;
  }
  // BWK too, same day ("do the same for BWK actually. the only one that
  // should be animated is the fantasy one"). Only Mythicals animates.
  return brand === "mythicals" ? 6 : 0;
}

/** Poll rounds (30s each) per model attempt: primary 10 min, fallback 12 min. */
export const POST_VIDEO_ROUNDS = [20, 24];

/** Clips submitted at once — Higgsfield silently drops jobs past ~4 per account. */
export const POST_VIDEO_WAVE = Math.max(1, Number(process.env.HIGGSFIELD_MAX_CONCURRENT) || 4);

/** How long the publisher holds a post whose video is still building. */
export const PENDING_VIDEO_MAX_AGE_MS = 10 * 60 * 60 * 1000;

function markerPath(postId: string): string {
  return `video-builds/${postId}.json`;
}

export function reelPath(postId: string): string {
  return `reels/${postId}.mp4`;
}

/** Instagram's copy of the post video, with an original song (2026-10-04). */
export function igReelPath(postId: string): string {
  return `reels/${postId}-ig.mp4`;
}

/** YouTube's copy: the clips' own sound with music mixed over it (2026-10-09, Mythicals). */
export function ytReelPath(postId: string): string {
  return `reels/${postId}-yt.mp4`;
}

/**
 * Legendary Mythicals daily videos (2026-10-09, per Keenan: "make it so the
 * new pipeline uses kling 3 for the 3 videos a day. don't add music. ONLY
 * add the kling 3 audio to the clips that are sent to me. for YOUTUBE ONLY,
 * add music over the top"). Every clip renders on Kling 3.0 with its own
 * sound; the main reel (email, Instagram, Facebook) carries only that sound
 * and YouTube gets a copy with music mixed under it.
 * MYTHICALS_VIDEO_MODEL overrides the model ("" → the normal post model).
 */
export const MYTHICALS_VIDEO_MODEL =
  process.env.MYTHICALS_VIDEO_MODEL?.trim() ?? "kling-video/v3.0/std/image-to-video";

/** Sound direction appended to Mythicals clip prompts when Kling 3.0 renders sound. */
export const MYTHICALS_SOUND_LINE =
  "Sound: the creature's own natural sounds (breathing, growls, wingbeats, footfalls) and the real ambience of its setting. No music, no dialogue, no voices.";

export async function writeVideoMarker(
  postId: string,
  marker: Omit<VideoBuildMarker, "updatedAt">
): Promise<void> {
  const { supabase } = await import("@/lib/supabase.server");
  const body: VideoBuildMarker = { ...marker, updatedAt: new Date().toISOString() };
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(markerPath(postId), Buffer.from(JSON.stringify(body)), {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw new Error(`Video marker write failed for ${postId}: ${error.message}`);
}

export async function readVideoMarker(postId: string): Promise<VideoBuildMarker | null> {
  const { supabase } = await import("@/lib/supabase.server");
  const { data } = await supabase.storage.from(BUCKET).download(markerPath(postId));
  if (!data) return null;
  try {
    return JSON.parse(await data.text()) as VideoBuildMarker;
  } catch {
    return null;
  }
}

/** True while a build is pending and young enough to be worth waiting for. */
export function isVideoPending(marker: VideoBuildMarker | null): boolean {
  if (!marker || marker.status !== "pending") return false;
  return Date.now() - new Date(marker.updatedAt).getTime() < PENDING_VIDEO_MAX_AGE_MS;
}

/**
 * Hand a freshly generated daily post to the video builder. Replaces the
 * per-post email: the brand's daily digest goes out once every post has
 * its finished video.
 */
export async function queuePostVideo(postId: string): Promise<void> {
  // Carousel-only lanes never get a video (2026-09-28).
  const { prisma } = await import("@/lib/prisma");
  const { laneWantsReel } = await import("./social-publish");
  const post = await prisma.carouselPost.findUnique({
    where: { id: postId },
    select: { lane: true, generatedFor: true },
  });
  if (!laneWantsReel(post?.lane ?? null)) {
    // No video to wait on — tell the daily post-email send this one's ready.
    if (post) {
      const { laneBrand } = await import("./social-publish");
      await requestDigestCheck(await laneBrand(post.lane), post.generatedFor.toISOString().slice(0, 10));
    }
    return;
  }
  await writeVideoMarker(postId, { status: "pending" });
  const { inngest } = await import("@/inngest/client");
  await inngest.send({ name: "content-factory/post-video.build", data: { postId } });
}

/** Ask the digest to check whether a brand's day is complete. */
export async function requestDigestCheck(brand: SocialAccountKey, date: string): Promise<void> {
  const { inngest } = await import("@/inngest/client");
  await inngest.send({ name: "content-factory/digest.check", data: { brand, date } });
}

/** Seconds a slide stays on screen in the post video. */
export function postVideoSlideSeconds(
  lane: string | null,
  slideKind: string,
  overlayText: string
): number {
  // Paper reset guides carry ~40 words a slide (2026-09-25).
  if (lane?.startsWith("reset-guide")) return slideKind === "COVER" ? 4 : 7;
  return livingSlideSeconds(slideKind, overlayText);
}
