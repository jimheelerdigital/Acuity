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
  updatedAt: string;
}

const BUCKET = "content-factory";

/**
 * Primary Higgsfield model for post videos; HIGGSFIELD_LIVING_MODEL overrides.
 * DoP Lite since 2026-09-29's run (per Keenan, after Kling 2.5 Turbo Pro's
 * ~$0.19/clip — $0.35 after Oct 1: "go back to using DOP lite and lets see
 * if we can get away with that"). Kling: "kling-video/v2.5-turbo/pro/image-to-video".
 */
export const POST_VIDEO_MODEL =
  process.env.HIGGSFIELD_LIVING_MODEL?.trim() || "higgsfield-ai/dop/lite";

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
  const post = await prisma.carouselPost.findUnique({ where: { id: postId }, select: { lane: true } });
  if (!laneWantsReel(post?.lane ?? null)) return;
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
