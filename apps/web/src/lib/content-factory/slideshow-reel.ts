/**
 * Content Factory — slideshow Reel renderer (2026-09-14, per Keenan:
 * "i need music to be a part of this auto posting" → "build it hybrid").
 *
 * Instagram's Graph API cannot attach music to photo carousels — music on
 * an API-published post is only possible when the post IS a video with
 * the audio baked in. So Reel-designated lanes get their slides rendered
 * into a 1080x1920 slideshow MP4 (gentle Ken Burns zoom per slide,
 * crossfades between) with a library music track muxed in, published as
 * an IG Reel + FB video instead of a photo carousel.
 *
 * MUSIC LIBRARY: Keenan uploads royalty-free MP3s to the content-factory
 * bucket under music/ripple/ and music/bwk/ (Supabase dashboard →
 * Storage). A random track is picked per render; if the BWK folder is
 * empty, BWK lanes borrow Ripple's library; if NO tracks exist at all,
 * the caller falls back to publishing the silent photo carousel — a
 * silent Reel defeats the purpose (music was the whole ask).
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/** Seconds each slide is on screen (2026-09-14, per Keenan: 2.5 → 3.3 —
 * slides need more read time). */
const SLIDE_SEC = 3.3;
/** Crossfade length between slides. */
const XFADE_SEC = 0.4;
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
  const { BWK_LANES } = await import("./social-publish");

  const isBwk = (BWK_LANES as readonly string[]).includes(lane ?? "");
  // Supabase Storage paths are case-sensitive and the dashboard-created
  // BWK folder is uppercase — check both spellings.
  const folders = isBwk
    ? ["music/bwk", "music/BWK", "music/ripple"]
    : ["music/ripple"];

  for (const folder of folders) {
    const { data, error } = await supabase.storage
      .from("content-factory")
      .list(folder, { limit: 200 });
    if (error) continue;
    const tracks = (data ?? []).filter((f) => AUDIO_EXT.test(f.name));
    if (tracks.length === 0) continue;
    const pick = tracks[Math.floor(Math.random() * tracks.length)];
    return supabase.storage
      .from("content-factory")
      .getPublicUrl(`${folder}/${pick.name}`).data.publicUrl;
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
 * muxed in. Each slide holds SLIDE_SEC with a subtle zoom, slides
 * crossfade, audio fades out over the last second. Returns the MP4
 * buffer. Throws on any failure — callers fall back to the photo
 * carousel.
 */
export async function renderSlideshowReel(
  imageUrls: string[],
  musicUrl: string
): Promise<Buffer> {
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
    const frames = Math.round(SLIDE_SEC * FPS);
    const totalSec = n * SLIDE_SEC - (n - 1) * XFADE_SEC;

    const args: string[] = ["-y", "-loglevel", "warning"];
    for (const p of imgPaths) args.push("-i", p);
    // Loop the track in case it's shorter than the video; -shortest ends
    // the encode when the (finite) video stream does.
    args.push("-stream_loop", "-1", "-i", musicPath);

    const filters: string[] = [];
    for (let i = 0; i < n; i++) {
      filters.push(
        `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,` +
          `crop=1080:1920,setsar=1,` +
          `zoompan=z='min(zoom+0.0012,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
          `d=${frames}:s=1080x1920:fps=${FPS}[v${i}]`
      );
    }
    let videoLabel = "[v0]";
    if (n > 1) {
      for (let j = 0; j < n - 1; j++) {
        const offset = ((j + 1) * (SLIDE_SEC - XFADE_SEC)).toFixed(2);
        const out = j === n - 2 ? "[vout]" : `[x${j}]`;
        const left = j === 0 ? "[v0]" : `[x${j - 1}]`;
        filters.push(
          `${left}[v${j + 1}]xfade=transition=fade:duration=${XFADE_SEC}:offset=${offset}${out}`
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
      "-crf", "21",
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
      `[slideshow-reel] Rendered ${n} slides → ${totalSec.toFixed(1)}s, ${out.length} bytes`
    );
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
