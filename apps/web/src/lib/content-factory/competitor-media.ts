/**
 * Competitor post media (2026-10-01, per Keenan: Muse "isn't pulling the
 * right information"). The profile scrapes only keep a caption, counts and
 * a cover thumbnail, so briefs for slideshows and videos were written from
 * hashtags. This fetches the post itself for the posts we brief:
 *   - TikTok slideshow → every slide image
 *   - TikTok / IG video → ~8 frames (ffmpeg, one every 2s) + subtitles
 *   - IG carousel → every child image
 * and returns them as small JPEGs for a vision brief.
 *
 * One Apify run per post (clockworks~tiktok-scraper with postURLs, or
 * apify~instagram-scraper with the post URL). Every failure is soft: the
 * caller falls back to the thumbnail + caption brief.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawn } from "child_process";
import sharp from "sharp";
import { runApifyActor } from "./competitor-mimic";

export interface PostMedia {
  /** JPEG frames or slides, in order, ≤ MAX_IMAGES. */
  images: Buffer[];
  /** Spoken words (subtitles), timestamps stripped. "" when none. */
  transcript: string;
  kind: "slideshow" | "video" | "image" | "none";
}

const MAX_IMAGES = 8;
const FRAME_EVERY_SEC = 2;
const IMAGE_WIDTH = 640;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Every http(s) URL string found under the given keys, in order. */
function urlsFrom(v: unknown): string[] {
  if (typeof v === "string") return /^https?:\/\//.test(v) ? [v] : [];
  if (Array.isArray(v)) return v.flatMap(urlsFrom);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    // Prefer the downloadable copy Apify stored over the platform link.
    for (const k of ["downloadLink", "downloadUrl", "url", "imageURL", "displayUrl", "tiktokLink"]) {
      const u = urlsFrom(o[k]);
      if (u.length) return u.slice(0, 1);
    }
    if (o.urlList) return urlsFrom(o.urlList).slice(0, 1);
  }
  return [];
}

async function download(url: string, maxBytes = MAX_VIDEO_BYTES): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 && buf.length <= maxBytes ? buf : null;
  } catch {
    return null;
  }
}

async function toJpeg(buf: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(buf).resize({ width: IMAGE_WIDTH, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
  } catch {
    return null;
  }
}

function ffmpegPath(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require("ffmpeg-static") as string | null;
    return p && fs.existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

/** One frame every FRAME_EVERY_SEC seconds, at most MAX_IMAGES. */
async function videoFrames(video: Buffer): Promise<Buffer[]> {
  const bin = ffmpegPath();
  if (!bin) return [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "competitor-frames-"));
  try {
    const input = path.join(dir, "in.mp4");
    fs.writeFileSync(input, video);
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(bin, [
        "-loglevel", "error", "-y", "-i", input,
        "-vf", `fps=1/${FRAME_EVERY_SEC},scale=${IMAGE_WIDTH}:-2`,
        "-frames:v", String(MAX_IMAGES), "-q:v", "4",
        path.join(dir, "f%02d.jpg"),
      ]);
      let err = "";
      proc.stderr.on("data", (d) => (err += d.toString()));
      proc.on("error", reject);
      proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${err.slice(-300)}`))));
    });
    return fs
      .readdirSync(dir)
      .filter((f) => /^f\d+\.jpg$/.test(f))
      .sort()
      .map((f) => fs.readFileSync(path.join(dir, f)));
  } catch (e) {
    console.warn("[competitor-media] frame extraction failed:", e instanceof Error ? e.message : e);
    return [];
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** WebVTT/SRT → plain words. */
function cleanSubtitles(raw: string): string {
  return raw
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^WEBVTT/.test(l) && !/-->/.test(l) && !/^\d+$/.test(l.trim()))
    .map((l) => l.replace(/<[^>]+>/g, "").trim())
    .filter((l, i, a) => l && l !== a[i - 1])
    .join(" ")
    .slice(0, 2500);
}

async function tiktokMedia(url: string): Promise<PostMedia> {
  const items = await runApifyActor("clockworks~tiktok-scraper", {
    postURLs: [url],
    resultsPerPage: 1,
    shouldDownloadVideos: true,
    shouldDownloadSlideshowImages: true,
    downloadSubtitlesOptions: "DOWNLOAD_SUBTITLES_ONLY",
    shouldDownloadCovers: false,
  });
  const it = items[0];
  if (!it) return { images: [], transcript: "", kind: "none" };
  const meta = (it.videoMeta ?? {}) as Record<string, unknown>;

  // Subtitles: prefer English.
  let transcript = "";
  const subs = Array.isArray(meta.subtitleLinks) ? (meta.subtitleLinks as Record<string, unknown>[]) : [];
  const sub = subs.find((s) => /^en/i.test(str(s.language))) ?? subs[0];
  const subUrl = sub ? urlsFrom(sub)[0] : undefined;
  if (subUrl) {
    const b = await download(subUrl, 2 * 1024 * 1024);
    if (b) transcript = cleanSubtitles(b.toString("utf8"));
  }

  // Slideshow: every slide.
  const slideUrls = urlsFrom(it.slideshowImageLinks ?? (it.imagePost as Record<string, unknown> | undefined)?.images);
  if (slideUrls.length) {
    const images: Buffer[] = [];
    for (const u of slideUrls.slice(0, MAX_IMAGES)) {
      const b = await download(u, 15 * 1024 * 1024);
      const j = b ? await toJpeg(b) : null;
      if (j) images.push(j);
    }
    if (images.length) return { images, transcript, kind: "slideshow" };
  }

  // Video: frames from the stored copy.
  const videoUrl = urlsFrom(it.mediaUrls)[0] ?? str(meta.downloadAddr);
  if (videoUrl) {
    const v = await download(videoUrl);
    if (v) {
      const frames = await videoFrames(v);
      if (frames.length) return { images: frames, transcript, kind: "video" };
    }
  }
  return { images: [], transcript, kind: "none" };
}

async function instagramMedia(url: string): Promise<PostMedia> {
  const items = await runApifyActor("apify~instagram-scraper", {
    directUrls: [url],
    resultsType: "posts",
    resultsLimit: 1,
    addParentData: false,
  });
  const it = items[0];
  if (!it) return { images: [], transcript: "", kind: "none" };
  const videoUrl = str(it.videoUrl);
  if (videoUrl) {
    const v = await download(videoUrl);
    const frames = v ? await videoFrames(v) : [];
    if (frames.length) return { images: frames, transcript: "", kind: "video" };
  }
  const children = Array.isArray(it.childPosts) ? (it.childPosts as Record<string, unknown>[]) : [];
  const imageUrls = children.length
    ? children.map((c) => str(c.displayUrl)).filter(Boolean)
    : (Array.isArray(it.images) ? (it.images as unknown[]).map(str).filter(Boolean) : []).concat(str(it.displayUrl) ? [str(it.displayUrl)] : []);
  const images: Buffer[] = [];
  for (const u of [...new Set(imageUrls)].slice(0, MAX_IMAGES)) {
    const b = await download(u, 15 * 1024 * 1024);
    const j = b ? await toJpeg(b) : null;
    if (j) images.push(j);
  }
  return { images, transcript: "", kind: images.length > 1 ? "slideshow" : images.length ? "image" : "none" };
}

/**
 * The post's real content for a brief. Falls back to the cover thumbnail
 * when the media fetch fails, so a brief always has at least one image
 * when one exists.
 */
export async function fetchPostMedia(post: {
  url: string;
  platform: string;
  thumbnailUrl: string | null;
}): Promise<PostMedia> {
  let media: PostMedia = { images: [], transcript: "", kind: "none" };
  try {
    media = post.platform === "instagram" ? await instagramMedia(post.url) : await tiktokMedia(post.url);
  } catch (e) {
    console.warn(`[competitor-media] fetch failed for ${post.url}:`, e instanceof Error ? e.message.slice(0, 200) : e);
  }
  if (!media.images.length && post.thumbnailUrl) {
    const b = await download(post.thumbnailUrl, 15 * 1024 * 1024);
    const j = b ? await toJpeg(b) : null;
    if (j) media = { ...media, images: [j], kind: media.kind === "none" ? "image" : media.kind };
  }
  return media;
}
