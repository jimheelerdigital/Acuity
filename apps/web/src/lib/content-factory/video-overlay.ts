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

  // Two filtergraph strategies, tried in order. scale2ref exited 0 with a
  // frameless 261-byte shell on Vercel (live 2026-08-11: "No filtered
  // frames for output stream"), so the primary strategy avoids it: upscale
  // the video to the overlay's fixed 1080x1920 and composite directly.
  const filterStrategies = [
    "[0:v]scale=1080:1920:flags=lanczos[base];[base][1:v]overlay=0:0:format=auto",
    "[1:v][0:v]scale2ref[ovr][base];[base][ovr]overlay=0:0:format=auto",
  ];

  try {
    fs.writeFileSync(inVideo, videoBuffer);
    fs.writeFileSync(inOverlay, overlayPng);

    let lastErr: Error | null = null;
    for (const filter of filterStrategies) {
      const args = [
        "-y",
        "-loglevel", "warning",
        "-i", inVideo,
        "-i", inOverlay,
        "-filter_complex", filter,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-an", // slide videos have no audio track worth keeping
        outVideo,
      ];

      let stderr = "";
      try {
        await new Promise<void>((resolve, reject) => {
          const proc = spawn(bin, args);
          proc.stderr.on("data", (d) => (stderr += d.toString()));
          proc.on("error", reject);
          proc.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(0, 800)}`));
          });
        });

        const out = fs.readFileSync(outVideo);
        // ffmpeg can exit 0 yet emit a frameless ~261-byte container.
        // Treat tiny output as failure so we try the next strategy (and
        // ultimately let callers fall back to the un-burned video).
        if (out.length < 100_000) {
          throw new Error(
            `ffmpeg produced a suspiciously small output (${out.length} bytes from a ` +
              `${videoBuffer.length}-byte input) with filter "${filter}". stderr: ${stderr.slice(0, 800)}`
          );
        }
        console.log(
          `[video-overlay] Burn ok (${filter.slice(0, 40)}…): ${videoBuffer.length} -> ${out.length} bytes` +
            (stderr ? ` (ffmpeg warnings: ${stderr.slice(0, 300)})` : "")
        );
        return out;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        console.warn(`[video-overlay] Strategy failed: ${lastErr.message.slice(0, 400)}`);
      }
    }
    throw lastErr ?? new Error("All burn strategies failed");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
