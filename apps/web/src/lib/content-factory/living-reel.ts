/**
 * Content Factory — LIVING reels (2026-09-24, per Keenan: "run every single
 * one through higgsfield").
 *
 * Every slide's text-free photo is animated by Higgsfield (subtle ambient
 * motion: weather, water, light, animals), the slide's exact text layer
 * (adaptive scrim + overlay) is burned on top — pixel-frozen, so the video
 * model can never warp the words — and the clips are joined with clean
 * transitions: text fades out, backgrounds crossfade, next text fades in.
 * Ends on the brand CTA slide, with library music muxed in.
 *
 * Validated by hand on 2026-09-24 (BWK "SHOW UP ANYWAY..." via Kling 3.0):
 * crossfading two slides that each carry text stacked both paragraphs on
 * top of each other, so text must be OFF during every transition.
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const W = 1080;
const H = 1920;
/** Higgsfield clip length requested per slide. */
export const LIVING_CLIP_SEC = 5;
const COVER_SEC = 3.5;
const CTA_SEC = 3;
const XFADE_SEC = 0.6;
const TEXT_FADE_SEC = 0.3;

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
 * Motion prompt for one slide, built from the scene sentence of its stored
 * image prompt. Per the animate-cover lessons (v9/v12), the model executes
 * any verb it is given, so the prompt only asks for movement that already
 * belongs in the photo and pins everything else.
 */
export function livingMotionPrompt(imagePrompt: string, opts: { person?: boolean } = {}): string {
  const firstLine = imagePrompt.split("\n")[0] ?? "";
  // Avatar slides carry the brand's recurring person (attached as a
  // "reference photo"), even when the scene line says "no people" — drop
  // that phrase so the model doesn't remove them, and pin their pose.
  // Selfie covers pass person: true (their prompts don't use the marker).
  const hasPerson = opts.person === true || imagePrompt.includes("reference photo");
  let scene = firstLine
    .replace(/^A REAL photograph a person actually took with a camera:\s*/i, "")
    .trim();
  if (hasPerson) scene = scene.replace(/,?\s*no people\b,?/gi, ",").replace(/,\s*,/g, ",");
  scene = scene.slice(0, 400);
  return [
    "The photo comes to life with subtle cinematic ambient motion.",
    scene ? `Scene: ${scene}` : "",
    hasPerson
      ? "The person in the photo stays exactly where they are in the same pose, facing the same way; only their hair and clothing move gently in the air, with a slow natural breath."
      : "",
    `Motion: ${sceneMotions(scene).join(", ")}. Everything else stays perfectly still.`,
    "Camera: very slow steady push-in, no cuts.",
    "Keep composition, lighting and color exactly as the photo. No text, no new people, no new objects.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Pick ONLY the motions the scene itself contains. Higgsfield's DoP models
 * execute whatever they are told (animate-cover v9/v12 lessons), so a
 * generic list like "rain, snow, waves..." would make it rain indoors.
 */
const MOTION_RULES: [RegExp, string][] = [
  [/rain-streaked|raindrop|rain on (the )?(window|glass)/i, "raindrops run slowly down the glass"],
  [/\brain(?![- ]slicked|-streaked| on (the )?(window|glass))|drizzle|downpour/i, "rain keeps falling softly"],
  [/\bpuddle|rain-slicked|wet (concrete|tarmac|pavement|street|stone)/i, "tiny drips ripple the puddles"],
  [/\bsnow|blizzard|sleet/i, "snow keeps falling and blowing"],
  [/\bwave|surf|sea\b|ocean|tide|shore/i, "waves roll and break slowly"],
  [/\blake|river|pond|water|bath\b|harbou?r|fjord/i, "the water surface ripples gently"],
  [/\bcloud|storm|sky|thunderhead/i, "clouds drift slowly across the sky"],
  [/\bfog|mist|haze|steam|smoke/i, "mist drifts slowly"],
  [/\bcandle|flame|fire|ember|hearth/i, "the flame flickers"],
  [/\blamp|lamplight|bulb|lantern|overhead beam|porch light|neon/i, "the lamp light flickers very faintly"],
  [/\btree|leaves|forest|grass|field|garden|flower|willow|reeds|bamboo|pine/i, "leaves and grass stir in a light breeze"],
  [/\bcurtain|linen|robe|silk|cloak|flag|sail/i, "fabric moves gently in the air"],
  [/\bwolf|lion|stag|eagle|panther|horse|bear|tiger|bull|hawk|falcon|fox|elk|leopard|jaguar|moth|bird|animal/i, "the animal keeps doing what it is doing, slow and natural"],
  [/\bknight|warrior|samurai|viking|spartan/i, "the warrior keeps moving slowly in the same direction, cloak and hair stirring in the wind"],
];

function sceneMotions(scene: string): string[] {
  const picked = MOTION_RULES.filter(([re]) => re.test(scene)).map(([, m]) => m);
  return picked.length > 0 ? picked.slice(0, 4) : ["the light shifts very subtly"];
}

/**
 * The slide's full-frame text layer: the same adaptive scrim + overlay the
 * static JPEG uses, as one transparent 1080x1920 PNG, plus the resized
 * base photo that goes to Higgsfield as the start frame.
 */
export async function buildLivingSlideLayer(opts: {
  raw: Buffer;
  overlayText: string;
  lane: string | null;
  slideKind: string;
  imagePrompt: string;
}): Promise<{ base: Buffer; layer: Buffer }> {
  const { default: sharp } = await import("sharp");
  const { renderMoodyTextOverlay, buildAdaptiveScrim } = await import("./compose");
  const { moodyOverlayStyle } = await import("./carousel-generate");
  const base = await sharp(opts.raw)
    .resize(W, H, { fit: "cover", position: "centre" })
    .sharpen({ sigma: 0.6 })
    .jpeg({ quality: 95 })
    .toBuffer();
  const { kind, tone } = moodyOverlayStyle(opts.lane, opts.slideKind, opts.imagePrompt);
  const overlay = await renderMoodyTextOverlay(opts.overlayText.split("\n\n"), kind, tone);
  const scrim = await buildAdaptiveScrim(base, overlay).catch(() => null);
  const layer = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      ...(scrim ? [{ input: scrim, top: 0, left: 0 }] : []),
      { input: overlay, top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
  return { base, layer };
}

/** On-screen time for a slide: cover is short, text slides scale with word count. */
export function livingSlideSeconds(slideKind: string, overlayText: string): number {
  if (slideKind === "COVER") return COVER_SEC;
  const words = overlayText.split(/\s+/).filter(Boolean).length;
  return Math.min(8, Math.max(5, Math.round((words / 5.5) * 2) / 2));
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

/**
 * Join animated slide clips into the final reel (the manual Kling script's
 * entry point — every slide animated). See assemblePostVideo.
 */
export async function assembleLivingReel(opts: {
  clips: Buffer[];
  layers: Buffer[];
  seconds: number[];
  /** Length the clips were requested at (the model may return a bit less). */
  clipSeconds?: number;
  ctaUrl: string;
  musicUrl: string;
}): Promise<{ buf: Buffer; seconds: number }> {
  const n = opts.clips.length;
  if (n === 0 || opts.layers.length !== n || opts.seconds.length !== n) {
    throw new Error("assembleLivingReel: clips, layers and seconds must match");
  }
  return assemblePostVideo({
    slides: opts.clips.map((clip, i) => ({
      kind: "live" as const,
      clip,
      layer: opts.layers[i],
      seconds: opts.seconds[i],
    })),
    clipSeconds: opts.clipSeconds,
    ctaUrl: opts.ctaUrl,
    musicUrl: opts.musicUrl,
  });
}

/**
 * One slide of a post video (2026-09-26):
 * - live: a Higgsfield clip of the text-free photo, with the slide's exact
 *   text layer on top (text fades out/in around every transition, so two
 *   slides' words never stack);
 * - still: the finished slide JPEG with a slow push-in — used where the
 *   words are part of the photo itself (baked quote / message slides,
 *   timeline grids, paper guides) or a clip failed, so nothing warps text.
 */
export type PostVideoSlide =
  | { kind: "live"; clip: Buffer; layer: Buffer; seconds: number }
  | { kind: "still"; image: Buffer; seconds: number };

/**
 * A still that isn't 9:16 (the square timeline-grid collages) would lose
 * its sides to a cover crop — cutting grid cells in half. Those sit whole
 * on a blurred, darkened copy of themselves instead. 9:16-ish stills pass
 * through untouched.
 */
async function fitStillTo916(image: Buffer): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  const meta = await sharp(image).metadata();
  if (!meta.width || !meta.height) return image;
  if (Math.abs(meta.width / meta.height - W / H) < 0.06) return image;
  const [bg, fg] = await Promise.all([
    sharp(image).resize(W, H, { fit: "cover" }).blur(40).modulate({ brightness: 0.55 }).toBuffer(),
    sharp(image).resize(W, H, { fit: "inside" }).toBuffer({ resolveWithObject: true }),
  ]);
  return sharp(bg)
    .composite([
      {
        input: fg.data,
        left: Math.round((W - fg.info.width) / 2),
        top: Math.round((H - fg.info.height) / 2),
      },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * Build the post video: slides in order, clean transitions (crossfade
 * between animated slides, dip-to-black wherever a still with baked text
 * is involved), the brand CTA end card, library music.
 */
export async function assemblePostVideo(opts: {
  slides: PostVideoSlide[];
  /** Length the clips were requested at (the model may return a bit less). */
  clipSeconds?: number;
  ctaUrl: string;
  musicUrl: string;
}): Promise<{ buf: Buffer; seconds: number }> {
  const clipSec = opts.clipSeconds ?? LIVING_CLIP_SEC;
  const bin = ffmpegPath();
  if (!bin) throw new Error("ffmpeg-static binary not found in this environment");
  const slides = opts.slides;
  const n = slides.length;
  if (n === 0) throw new Error("assemblePostVideo: no slides");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "post-video-"));
  try {
    const args = ["-y"];
    let input = 0;
    const idx: { a: number; b?: number }[] = [];
    for (let i = 0; i < n; i++) {
      const s = slides[i];
      if (s.kind === "live") {
        const clipPath = path.join(dir, `clip-${i}.mp4`);
        const layerPath = path.join(dir, `layer-${i}.png`);
        fs.writeFileSync(clipPath, s.clip);
        fs.writeFileSync(layerPath, s.layer);
        args.push("-i", clipPath, "-loop", "1", "-t", String(s.seconds), "-i", layerPath);
        idx.push({ a: input, b: input + 1 });
        input += 2;
      } else {
        const stillPath = path.join(dir, `still-${i}.jpg`);
        fs.writeFileSync(stillPath, await fitStillTo916(s.image));
        args.push("-i", stillPath);
        idx.push({ a: input });
        input += 1;
      }
    }
    const ctaIn = input++;
    const ctaPath = path.join(dir, "cta.jpg");
    await download(opts.ctaUrl, ctaPath);
    args.push("-loop", "1", "-t", String(CTA_SEC), "-i", ctaPath);
    const musicIn = input++;
    const musicPath = path.join(dir, "music.audio");
    await download(opts.musicUrl, musicPath);
    args.push("-stream_loop", "-1", "-i", musicPath);

    const f: string[] = [];
    for (let i = 0; i < n; i++) {
      const s = slides[i];
      const d = s.seconds;
      if (s.kind === "live") {
        f.push(
          // tpad holds the last frame if the model returned a shorter clip
          // than requested, so every slot is exactly d seconds and the
          // xfade offsets stay right.
          `[${idx[i].a}:v]setpts=${(d / clipSec).toFixed(3)}*PTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,setsar=1,tpad=stop_mode=clone:stop_duration=${d},trim=0:${d},setpts=PTS-STARTPTS[bg${i}]`
        );
        const fadeIn = i === 0 ? "" : `fade=t=in:st=${XFADE_SEC}:d=${TEXT_FADE_SEC}:alpha=1,`;
        f.push(
          `[${idx[i].b}:v]format=rgba,fps=30,${fadeIn}fade=t=out:st=${(d - XFADE_SEC - TEXT_FADE_SEC).toFixed(2)}:d=${TEXT_FADE_SEC}:alpha=1[l${i}]`
        );
        // fps + settb after the overlay: xfade needs every input at a
        // constant frame rate and the same timebase (DoP clips arrive VFR).
        f.push(`[bg${i}][l${i}]overlay=0:0:shortest=1,format=yuv420p,fps=30,settb=AVTB[s${i}]`);
      } else {
        // Slow 6% push-in over the slot. zoompan on a single frame with
        // d = frame count gives exactly d seconds; the 2x upscale first
        // keeps the zoom from stepping.
        const frames = Math.round(d * 30);
        f.push(
          `[${idx[i].a}:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='1+0.06*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=30,setsar=1,format=yuv420p,settb=AVTB[s${i}]`
        );
      }
    }
    f.push(
      `[${ctaIn}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,setsar=1,format=yuv420p,settb=AVTB[s${n}]`
    );
    const all = [...slides.map((s) => s.seconds), CTA_SEC];
    let prev = "s0";
    let t = all[0];
    for (let i = 1; i < all.length; i++) {
      const out = i === all.length - 1 ? "vout" : `x${i}`;
      // A still carries its words in the photo, so a crossfade would stack
      // two slides' text — dip through black instead.
      const stillInvolved = slides[i - 1]?.kind === "still" || slides[i]?.kind === "still";
      const transition = stillInvolved ? "fadeblack" : "fade";
      f.push(
        `[${prev}][s${i}]xfade=transition=${transition}:duration=${XFADE_SEC}:offset=${(t - XFADE_SEC).toFixed(2)}[${out}]`
      );
      t = t - XFADE_SEC + all[i];
      prev = out;
    }
    f.push(
      `[${musicIn}:a]atrim=0:${t.toFixed(2)},afade=t=in:st=0:d=0.3,afade=t=out:st=${(t - 1.5).toFixed(2)}:d=1.5[aout]`
    );
    const outPath = path.join(dir, "reel.mp4");
    args.push(
      "-filter_complex", f.join(";"),
      "-map", "[vout]", "-map", "[aout]",
      "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
      "-t", t.toFixed(2),
      outPath
    );
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(bin, args);
      let stderr = "";
      proc.stderr.on("data", (d) => {
        stderr = (stderr + d.toString()).slice(-4000);
      });
      proc.on("error", reject);
      proc.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-1500)}`))
      );
    });
    return { buf: fs.readFileSync(outPath), seconds: t };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
