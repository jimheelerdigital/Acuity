/**
 * Content Factory — burn a static text overlay onto a slide video.
 *
 * Part of the animated-post pipeline (2026-08-10): the artwork is
 * generated WITHOUT text and animated text-free, so the video model can
 * never move, warp, or cover the words. The exact same overlay PNG used
 * for the static JPEG is then burned onto the finished MP4 here —
 * pixel-frozen, always on top.
 *
 * Uses the ffmpeg-static binary (bundled with the deployment). The
 * overlay is scaled to the video's dimensions with scale2ref, so it
 * works regardless of the resolution Higgsfield renders at.
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

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

/**
 * Composite `overlayPng` (1080x1920 transparent PNG) over every frame of
 * `videoBuffer`. Returns the new MP4 buffer.
 * Throws if ffmpeg is unavailable or the burn fails — callers decide
 * whether to fall back to the text-free video.
 */
export async function burnOverlayOntoVideo(
  videoBuffer: Buffer,
  overlayPng: Buffer
): Promise<Buffer> {
  const bin = ffmpegPath();
  if (!bin) throw new Error("ffmpeg-static binary not found in this environment");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slide-burn-"));
  const inVideo = path.join(dir, "in.mp4");
  const inOverlay = path.join(dir, "overlay.png");
  const outVideo = path.join(dir, "out.mp4");

  try {
    fs.writeFileSync(inVideo, videoBuffer);
    fs.writeFileSync(inOverlay, overlayPng);

    const args = [
      "-y",
      "-loglevel", "error",
      "-i", inVideo,
      "-i", inOverlay,
      // Scale the overlay to exactly match the video, then composite.
      "-filter_complex",
      "[1:v][0:v]scale2ref[ovr][base];[base][ovr]overlay=0:0:format=auto",
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-an", // slide videos have no audio track worth keeping
      outVideo,
    ];

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(bin, args);
      let stderr = "";
      proc.stderr.on("data", (d) => (stderr += d.toString()));
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(0, 500)}`));
      });
    });

    return fs.readFileSync(outVideo);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
