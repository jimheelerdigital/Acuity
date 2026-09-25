/**
 * Content Factory — slideshow Reel renderer (2026-09-14, per Keenan:
 * "i need music to be a part of this auto posting" → "build it hybrid").
 *
 * Instagram's Graph API cannot attach music to photo carousels — music on
 * an API-published post is only possible when the post IS a video with
 * the audio baked in. So Reel-designated lanes get their slides rendered
 * into a 1080x1920 slideshow MP4 (static slides with a randomized
 * transition from REEL_TRANSITIONS — zoom removed 2026-09-15 per Keenan)
 * with a library music track muxed in, published as an IG Reel + FB
 * video instead of a photo carousel.
 *
 * MUSIC LIBRARY: Keenan uploads royalty-free MP3s to the content-factory
 * bucket under music/ripple/ and music/bwk/ (Supabase dashboard →
 * Storage), optionally per lane in music/<brand>/<lane-key>/. A random
 * track is picked per render (lane folder first, then brand folder);
 * BWK never borrows Ripple's library; if NO tracks exist at all,
 * the caller falls back to publishing the silent photo carousel — a
 * silent Reel defeats the purpose (music was the whole ask).
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/** Seconds each slide is on screen (2026-09-14: 2.5 → 3.3; 2026-09-15,
 * per Keenan: 3.3 → 3.5 — slides need more read time). */
const SLIDE_SEC = 3.5;
/** Transition length between slides. */
const XFADE_SEC = 0.4;
/** xfade transition pool (2026-09-15, per Keenan: "play around with the
 * different transitions so we can get valuable data in the feedback
 * loop"). One is picked at random per render and recorded on
 * CarouselPost.reelTransition so engagement metrics can rank them —
 * once a winner emerges, shrink this list to it. All are directional /
 * reveal styles that read as intentional motion (no plain fade). */
export const REEL_TRANSITIONS = [
  "smoothleft", // soft carousel-swipe (the 09-15 baseline)
  "slideleft", // crisp hard swipe
  "circleopen", // circular reveal from center
  "radial", // clock-sweep reveal
  "hlslice", // horizontal sliced wipe
] as const;
export type ReelTransition = (typeof REEL_TRANSITIONS)[number];
const FPS = 30;

/** Resolve the bundled ffmpeg binary path (null if unavailable). */
function ffmpegPath(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require("ffmpeg-static") as string | null;
    return p && fs.existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

// .mp4 included (2026-09-14): Meta Sound Collection downloads tracks as
// audio-in-mp4 — ffmpeg maps only the audio stream ([n:a]), so any video
// stream in the file is ignored.
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|mp4)$/i;

/**
 * Pick a random music track for a lane from the bucket library.
 * Returns the track's public URL, or null when no library exists yet.
 */
export async function pickMusicTrack(lane: string | null): Promise<string | null> {
  const { supabase } = await import("@/lib/supabase.server");
  const { laneBrand } = await import("./social-publish");

  const isBwk = (await laneBrand(lane)) === "bwk";
  // Supabase Storage paths are case-sensitive and the dashboard-created
  // BWK folder is uppercase — check both spellings.
  // A lane can have its own playlist (2026-09-24): a subfolder named after
  // the lane key, e.g. music/bwk/fantasy-men/, is used first when it has
  // tracks; otherwise the brand folder. BWK no longer borrows Ripple's
  // calm lo-fi — BWK has to sound motivational, so an empty BWK library
  // means a silent carousel rather than piano under a discipline post.
  const brandFolders = isBwk ? ["music/bwk", "music/BWK"] : ["music/ripple"];
  const folders = [
    ...(lane ? brandFolders.map((f) => `${f}/${lane}`) : []),
    ...brandFolders,
  ];

  for (const folder of folders) {
    const { data, error } = await supabase.storage
      .from("content-factory")
      .list(folder, { limit: 200 });
    if (error) continue;
    const tracks = (data ?? []).filter((f) => AUDIO_EXT.test(f.name));
    if (tracks.length === 0) continue;
    const pick = tracks[Math.floor(Math.random() * tracks.length)];
    const url = supabase.storage
      .from("content-factory")
      .getPublicUrl(`${folder}/${pick.name}`).data.publicUrl;
    // Storage LIST matches folder names case-insensitively, but public URLs
    // are case-sensitive: listing music/bwk returns the tracks that live in
    // music/BWK, and the lowercase URL 400s (found 2026-09-24). Only return
    // a URL that actually serves; otherwise try the next spelling.
    try {
      const head = await fetch(url, { method: "HEAD" });
      if (head.ok) return url;
    } catch {
      // fall through to the next folder
    }
  }
  return null;
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

/**
 * Render slide images into a vertical slideshow MP4 with the music track
 * muxed in. Each slide holds SLIDE_SEC, slides transition with a
 * randomly-picked style from REEL_TRANSITIONS, audio fades out over the
 * last second. Returns the MP4 buffer plus the transition used (callers
 * persist it for the engagement feedback loop). Throws on any failure —
 * callers fall back to the photo carousel.
 */
export async function renderSlideshowReel(
  imageUrls: string[],
  musicUrl: string,
  /** Per-slide hold; text-dense lanes (paper reset guides) need longer. */
  slideSec: number = SLIDE_SEC
): Promise<{ buf: Buffer; transition: ReelTransition }> {
  const bin = ffmpegPath();
  if (!bin) throw new Error("ffmpeg-static binary not found in this environment");
  if (imageUrls.length === 0) throw new Error("No images to render");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slideshow-reel-"));
  try {
    const imgPaths: string[] = [];
    for (let i = 0; i < imageUrls.length; i++) {
      const p = path.join(dir, `img-${i}.jpg`);
      await download(imageUrls[i], p);
      imgPaths.push(p);
    }
    const musicPath = path.join(dir, "music.audio");
    await download(musicUrl, musicPath);

    const n = imgPaths.length;
    const totalSec = n * slideSec - (n - 1) * XFADE_SEC;
    const transition =
      REEL_TRANSITIONS[Math.floor(Math.random() * REEL_TRANSITIONS.length)];

    const args: string[] = ["-y", "-loglevel", "warning"];
    // Each still becomes a slideSec-long video stream (-loop 1 -t) —
    // xfade needs finite, timestamped inputs at a common fps.
    for (const p of imgPaths) {
      args.push("-loop", "1", "-t", slideSec.toFixed(2), "-framerate", String(FPS), "-i", p);
    }
    // Loop the track in case it's shorter than the video; -shortest ends
    // the encode when the (finite) video stream does.
    args.push("-stream_loop", "-1", "-i", musicPath);

    const filters: string[] = [];
    for (let i = 0; i < n; i++) {
      filters.push(
        `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,` +
          `crop=1080:1920,setsar=1,fps=${FPS},format=yuv420p[v${i}]`
      );
    }
    let videoLabel = "[v0]";
    if (n > 1) {
      for (let j = 0; j < n - 1; j++) {
        const offset = ((j + 1) * (slideSec - XFADE_SEC)).toFixed(2);
        const out = j === n - 2 ? "[vout]" : `[x${j}]`;
        const left = j === 0 ? "[v0]" : `[x${j - 1}]`;
        filters.push(
          `${left}[v${j + 1}]xfade=transition=${transition}:duration=${XFADE_SEC}:offset=${offset}${out}`
        );
      }
      videoLabel = "[vout]";
    }
    filters.push(
      `[${n}:a]afade=t=out:st=${Math.max(0, totalSec - 1).toFixed(2)}:d=1[aud]`
    );

    const outPath = path.join(dir, "out.mp4");
    args.push(
      "-filter_complex", filters.join(";"),
      "-map", videoLabel,
      "-map", "[aud]",
      "-c:v", "libx264",
      "-preset", "fast",
      // Target a FAT ~8Mbps master, not CRF (2026-09-16, per Keenan:
      // "the facebook/insta posts look super blurry"). CRF 21 encoded
      // these static slides at ~1.4Mbps — pixel-perfect locally, but
      // Meta ALWAYS re-encodes Reels, and their transcode of a skinny
      // master turns burned-in text to mush. A high-bitrate source
      // survives their second compression visibly sharper. ~19MB for a
      // 19s reel — far under every platform cap.
      "-b:v", "8M",
      "-maxrate", "12M",
      "-bufsize", "16M",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      // Hard duration cap. -shortest alone does NOT stop the encode when
      // the audio input is -stream_loop -1 through a filter graph (the
      // looped stream never EOFs — ffmpeg kept encoding past 80MB for a
      // 16s video when this was tested 2026-09-14). -t is authoritative.
      "-t", totalSec.toFixed(2),
      "-shortest",
      outPath
    );

    let stderr = "";
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(bin, args);
      proc.stderr.on("data", (d) => (stderr += d.toString()));
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 800)}`));
      });
    });

    const out = fs.readFileSync(outPath);
    // Same guard as video-overlay: ffmpeg can exit 0 with a frameless shell.
    if (out.length < 100_000) {
      throw new Error(
        `Slideshow render produced suspiciously small output (${out.length} bytes, ${n} slides). stderr: ${stderr.slice(0, 800)}`
      );
    }
    console.log(
      `[slideshow-reel] Rendered ${n} slides → ${totalSec.toFixed(1)}s, ${out.length} bytes, transition=${transition}`
    );
    return { buf: out, transition };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
