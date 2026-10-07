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
export function livingMotionPrompt(
  imagePrompt: string,
  opts: { person?: boolean; action?: boolean; realistic?: boolean; calm?: boolean } = {}
): string {
  // ACTION mode (2026-09-29, Legendary Mythicals — per Keenan: "the
  // animations for the mythical beasts are pretty weak... it's basically
  // just zooming in"). The ambient template below asks for near-stillness;
  // creature posts need the subject itself to move. The writer stores the
  // action on a "MOTION:" line of the image prompt.
  if (opts.action) {
    const motion = imagePrompt.match(/^MOTION:\s*(.+)$/m)?.[1]?.trim();
    const scene = (imagePrompt.split("\n")[0] ?? "")
      .replace(/^A breathtaking, hyper-real cinematic (film still|establishing shot), vertical composition:\s*/i, "")
      .replace(/^A REAL photograph a person actually took with a camera:\s*/i, "")
      .slice(0, 300);
    // realistic (2026-09-30): Ripple/BWK pick-lane covers — a real-world
    // photograph brought to life, not a fantasy film shot.
    return [
      opts.realistic ? "Realistic cinematic footage of a real place, shot on a real camera." : "Epic cinematic fantasy film shot.",
      scene ? `Scene: ${scene}` : "",
      motion
        ? `Action: ${motion}`
        : opts.realistic
          ? "Action: clearly visible, dynamic movement that belongs in the scene: the car rolls forward and its lights sweep, traffic streams, waves break, a person in the frame moves through the action, rain and steam swirl."
          : "Action: the creature or fighter comes alive subtly: it breathes, blinks, and its mane, cloak or the air around it stirs.",
      // Tuned 2026-09-29 (per Keenan: the first war-mount post "was perfect",
      // the next two "a bit too much movement which made it look slightly
      // unrealistic"): one clear action at real-world speed, gentle camera.
      // Pick lanes (realistic) move more (2026-09-30, Keenan: "barely has any
      // animation"; "make the image move somewhat dynamically"). Mythicals
      // keeps the tuned, measured level.
      // BWK picks are calmer (2026-10-01, Keenan: "bwk posts need a little
      // bit less movement throughout. they're too chaotic right now").
      opts.realistic && opts.calm
        ? "Keep the movement calm, controlled and premium: one slow, deliberate motion (light shifting, a car rolling slowly forward, steam rising, a man turning his head) and a slow, steady camera push-in or drift. Nothing fast, no whip pans, no sudden moves, no shaking. No morphing, no warping. The WHOLE subject stays fully inside the frame for all five seconds."
        : opts.realistic
        ? "Make it move DYNAMICALLY but stay real: the subject moves clearly through the five seconds at natural speed, AND the camera makes a confident move (a steady dolly-in, a slow orbit, a tracking move alongside). Never a static frame or a barely-there zoom. No morphing, no warping. The WHOLE subject (the entire car, watch or person) stays fully inside the frame for all five seconds: the camera follows it and never lets it drive out of shot or get cut off at an edge."
        : // 2026-10-06 (per Keenan: "dragons can be normal full fire/ice
          // bursts... pulsing runes are ok as long as they blend properly.
          // it's more so the magic stuff").
          "Keep it SUBTLE: the subject holds its pose and stays essentially still (slow breathing, a slight head turn or blink at most, wind in its mane, feathers or cloak, one slow wingbeat at most). A dragon may breathe a full burst of fire or ice matching its type, up into the sky or across the landscape, never at a person. Armor and weapons may have runes that pulse softly, blended into the metal or stone. Everything blends perfectly into the scene's light, color and materials, never pasted on. No magic effects on anything else: no auras, no ghostfire, no lightning crawling over bodies, no energy glows or sparkles, no flames on blades or armor. No attacks, no swings, no rearing, no charging, no lunging, no morphing. A creature never holds or uses a weapon. The camera moves slowly and steadily (a gentle push-in or slight drift).",
      "Keep the subject's design, colors, armor and setting exactly as in the image. The subject stays in frame. No text, no new creatures or people, no scene cuts.",
    ]
      .filter(Boolean)
      .join(" ");
  }
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
 * Length of an audio file in seconds (ffmpeg's "Duration:" line), or null.
 * Used to keep music at least as long as the reel (2026-09-30).
 */
export async function probeAudioSeconds(url: string): Promise<number | null> {
  const bin = ffmpegPath();
  if (!bin) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "probe-"));
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const file = path.join(dir, "a.audio");
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    const stderr = await new Promise<string>((resolve) => {
      const proc = spawn(bin, ["-i", file]);
      let err = "";
      proc.stderr.on("data", (d) => (err += d.toString()));
      proc.on("close", () => resolve(err));
      proc.on("error", () => resolve(err));
    });
    const m = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
    return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
  } catch {
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  const bin = ffmpegPath();
  if (!bin) return Promise.reject(new Error("ffmpeg-static binary not found in this environment"));
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, ["-y", "-loglevel", "error", ...args]);
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr = (stderr + d.toString()).slice(-4000);
    });
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-1500)}`))
    );
  });
}

function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "post-video-"));
  return fn(dir).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}

const SEGMENT_ENCODE = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30"];
/** Each segment dips to/from black over this long, so segments simply concatenate. */
const DIP_SEC = 0.3;

/** Fade in (unless first) and out, as a filter-chain suffix for a d-second segment. */
function dipFilters(d: number, first: boolean): string {
  return `${first ? "" : `fade=t=in:st=0:d=${DIP_SEC},`}fade=t=out:st=${(d - DIP_SEC).toFixed(2)}:d=${DIP_SEC}`;
}

/**
 * Render ONE slide to its own 1080x1920 30fps segment of exactly
 * slide.seconds (2026-09-27). The post video is built in small ffmpeg
 * passes because one big graph — every clip, looped text layer, the
 * crossfade chain and looped music together — stalled at ~2 fps in
 * production and blew the 300s step cap. A segment takes seconds.
 *
 * live: the clip slowed to fill the slot, the text layer on top. still: a
 * slow 6% push-in on the finished slide. Every segment dips from and to
 * black at its edges (2026-09-28): segments then join by plain
 * concatenation — the xfade crossfade chain failed on Vercel's ffmpeg
 * build ("inputs needs to be a constant frame rate") even with fps=30.
 */
export async function renderSlideSegment(slide: PostVideoSlide, opts: { first: boolean; clipSeconds?: number }): Promise<Buffer> {
  const clipSec = opts.clipSeconds ?? LIVING_CLIP_SEC;
  const d = slide.seconds;
  return withTempDir(async (dir) => {
    const out = path.join(dir, "seg.mp4");
    if (slide.kind === "live") {
      const clipPath = path.join(dir, "clip.mp4");
      const layerPath = path.join(dir, "layer.png");
      fs.writeFileSync(clipPath, slide.clip);
      fs.writeFileSync(layerPath, slide.layer);
      await runFfmpeg([
        "-i", clipPath,
        "-loop", "1", "-t", String(d), "-i", layerPath,
        "-filter_complex",
        [
          // tpad holds the last frame if the model returned a shorter clip.
          `[0:v]setpts=${(d / clipSec).toFixed(3)}*PTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,setsar=1,tpad=stop_mode=clone:stop_duration=${d},trim=0:${d},setpts=PTS-STARTPTS[bg]`,
          `[1:v]format=rgba,fps=30[l]`,
          `[bg][l]overlay=0:0:shortest=1,format=yuv420p,${dipFilters(d, opts.first)}[v]`,
        ].join(";"),
        "-map", "[v]", "-t", String(d), ...SEGMENT_ENCODE, out,
      ]);
    } else {
      const stillPath = path.join(dir, "still.jpg");
      fs.writeFileSync(stillPath, await fitStillTo916(slide.image));
      // zoompan on a single frame with d = frame count gives exactly d
      // seconds; the 2x upscale first keeps the zoom from stepping.
      const frames = Math.round(d * 30);
      await runFfmpeg([
        "-i", stillPath,
        "-vf",
        `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='1+0.06*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=30,setsar=1,format=yuv420p,${dipFilters(d, opts.first)}`,
        "-t", String(d), ...SEGMENT_ENCODE, out,
      ]);
    }
    return fs.readFileSync(out);
  });
}

/**
 * Join rendered segments into the post video: the segments (each already
 * dipping to/from black) plus the brand CTA end card, concatenated with a
 * stream copy — no filter graph — then the music muxed in a SEPARATE pass
 * (a looped audio input inside one big graph is what stalled ffmpeg).
 */
export async function joinPostVideo(opts: {
  segments: { buf: Buffer; seconds: number; still: boolean }[];
  /** Brand CTA end card; null when the post carries its own closing slide. */
  ctaUrl: string | null;
  musicUrl: string;
}): Promise<{ buf: Buffer; seconds: number }> {
  const segs = opts.segments;
  if (segs.length === 0) throw new Error("joinPostVideo: no segments");
  return withTempDir(async (dir) => {
    let ctaSeg: string | null = null;
    if (opts.ctaUrl) {
      const ctaImg = path.join(dir, "cta.jpg");
      await download(opts.ctaUrl, ctaImg);
      ctaSeg = path.join(dir, "cta.mp4");
      await runFfmpeg([
        "-loop", "1", "-t", String(CTA_SEC), "-i", ctaImg,
        "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,setsar=1,format=yuv420p,fade=t=in:st=0:d=${DIP_SEC}`,
        "-t", String(CTA_SEC), ...SEGMENT_ENCODE, ctaSeg,
      ]);
    }
    const list: string[] = [];
    segs.forEach((s, i) => {
      const p = path.join(dir, `seg-${i}.mp4`);
      fs.writeFileSync(p, s.buf);
      list.push(`file '${p}'`);
    });
    if (ctaSeg) list.push(`file '${ctaSeg}'`);
    const listPath = path.join(dir, "list.txt");
    fs.writeFileSync(listPath, list.join("\n"));
    const t = segs.reduce((a, s) => a + s.seconds, 0) + (ctaSeg ? CTA_SEC : 0);

    const silent = path.join(dir, "silent.mp4");
    await runFfmpeg(["-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", silent]);

    const music = path.join(dir, "music.audio");
    await download(opts.musicUrl, music);
    const out = path.join(dir, "reel.mp4");
    await runFfmpeg([
      "-i", silent,
      // No looping (2026-09-30, per Keenan: "all songs used must be at LEAST
      // as long as the reel, no looping from now on"). The picker only
      // offers tracks at least this long; apad is a silent safety net.
      "-i", music,
      "-filter_complex", `[1:a]apad,atrim=0:${t.toFixed(2)},afade=t=in:st=0:d=0.3,afade=t=out:st=${(t - 1.5).toFixed(2)}:d=1.5[aout]`,
      "-map", "0:v", "-map", "[aout]",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
      "-t", t.toFixed(2), out,
    ]);
    return { buf: fs.readFileSync(out), seconds: t };
  });
}

/** Segments + join in one call (the manual Kling script; local runs). */
export async function assemblePostVideo(opts: {
  slides: PostVideoSlide[];
  /** Length the clips were requested at (the model may return a bit less). */
  clipSeconds?: number;
  ctaUrl: string | null;
  musicUrl: string;
}): Promise<{ buf: Buffer; seconds: number }> {
  if (opts.slides.length === 0) throw new Error("assemblePostVideo: no slides");
  const segments = [];
  for (let i = 0; i < opts.slides.length; i++) {
    const s = opts.slides[i];
    segments.push({
      buf: await renderSlideSegment(s, { first: i === 0, clipSeconds: opts.clipSeconds }),
      seconds: s.seconds,
      still: s.kind === "still",
    });
  }
  return joinPostVideo({ segments, ctaUrl: opts.ctaUrl, musicUrl: opts.musicUrl });
}

/**
 * Finish a Legendary Mythicals cinematic shot (2026-10-04, cinematic-shot.ts):
 * the Kling 3.0 clip (4K 2164x3828 or pro 1080p) scaled to 1080x1920 30fps,
 * an optional text hook on screen for the first `hookSeconds` (fading out;
 * the mythic-colossus lane runs with none),
 * Kling's own sound brought to social loudness (-14 LUFS), and a fade up
 * from black at the start and down to black at the end. A clip with
 * no audio stream gets library music under it instead, or ships silent.
 * One small graph: a single 15s clip encodes in well under a minute.
 */
const FADE_IN_SEC = 1;
const FADE_OUT_SEC = 1.5;

export async function finishCinematicVideo(opts: {
  clip: Buffer;
  hook?: Buffer | null;
  hookSeconds?: number;
  /** Called only when the clip has no audio stream. */
  music?: () => Promise<string | null>;
}): Promise<{ buf: Buffer; seconds: number; audio: "native" | "music" | "none" }> {
  return withTempDir(async (dir) => {
    const clipFile = path.join(dir, "clip.mp4");
    fs.writeFileSync(clipFile, opts.clip);
    const bin = ffmpegPath();
    if (!bin) throw new Error("ffmpeg-static binary not found in this environment");
    const info = await new Promise<string>((resolve) => {
      const proc = spawn(bin, ["-i", clipFile]);
      let err = "";
      proc.stderr.on("data", (d) => (err += d.toString()));
      proc.on("close", () => resolve(err));
      proc.on("error", () => resolve(err));
    });
    const dm = info.match(/Duration: (\d+):(\d+):([\d.]+)/);
    const seconds = dm ? +dm[1] * 3600 + +dm[2] * 60 + +dm[3] : 15;
    const hasAudio = /Stream #\d+:\d+.*Audio:/.test(info);

    const args: string[] = ["-i", clipFile];
    let next = 1;
    let hookIdx = -1;
    if (opts.hook) {
      const hookFile = path.join(dir, "hook.png");
      fs.writeFileSync(hookFile, opts.hook);
      args.push("-loop", "1", "-t", String((opts.hookSeconds ?? 2) + 0.6), "-i", hookFile);
      hookIdx = next++;
    }
    let musicIdx = -1;
    const musicUrl = !hasAudio && opts.music ? await opts.music().catch(() => null) : null;
    if (musicUrl) {
      const res = await fetch(musicUrl);
      if (res.ok) {
        const musicFile = path.join(dir, "music.audio");
        fs.writeFileSync(musicFile, Buffer.from(await res.arrayBuffer()));
        args.push("-i", musicFile);
        musicIdx = next++;
      }
    }
    const base = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},fps=30,format=yuv420p`;
    // Cinematic open and close (2026-10-04, per Keenan: "it should fade in
    // and fade out cinematically"): up from black, down to black, with the
    // sound easing in and out to match.
    const outStart = Math.max(0, seconds - FADE_OUT_SEC).toFixed(2);
    const fades = `fade=t=in:st=0:d=${FADE_IN_SEC},fade=t=out:st=${outStart}:d=${FADE_OUT_SEC}`;
    const audioFades = `afade=t=in:st=0:d=${FADE_IN_SEC * 0.75},afade=t=out:st=${outStart}:d=${FADE_OUT_SEC}`;
    const filters: string[] = [];
    if (hookIdx >= 0) {
      filters.push(`${base}[bg]`);
      filters.push(`[${hookIdx}:v]format=rgba,fade=t=out:st=${opts.hookSeconds ?? 2}:d=0.6:alpha=1[hk]`);
      filters.push(`[bg][hk]overlay=0:0:eof_action=pass,${fades},format=yuv420p[v]`);
    } else {
      filters.push(`${base},${fades}[v]`);
    }
    let audio: "native" | "music" | "none" = "none";
    if (hasAudio) {
      filters.push(`[0:a]loudnorm=I=-14:TP=-1.5:LRA=11,${audioFades},aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a]`);
      audio = "native";
    } else if (musicIdx >= 0) {
      filters.push(
        `[${musicIdx}:a]atrim=0:${seconds.toFixed(2)},loudnorm=I=-14:TP=-1.5:LRA=11,${audioFades},aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a]`
      );
      audio = "music";
    }
    const out = path.join(dir, "out.mp4");
    await runFfmpeg([
      ...args,
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[v]",
      ...(audio !== "none" ? ["-map", "[a]", "-c:a", "aac", "-b:a", "192k"] : []),
      "-t",
      seconds.toFixed(2),
      ...SEGMENT_ENCODE,
      "-movflags",
      "+faststart",
      out,
    ]);
    return { buf: fs.readFileSync(out), seconds, audio };
  });
}

/**
 * Dragon egg hatching video (2026-10-06, Keenan-approved example v2): the
 * egg clip with its title, a slow fade to black, a beat of black, then the
 * dragon clip fading in slowly with its name. The dragon clip's own sound
 * (the roar) plays under the music. See egg-hatch.ts.
 */
export async function assembleEggVideo(opts: {
  eggClip: Buffer;
  dragonClip: Buffer;
  eggOverlay: Buffer;
  dragonOverlay: Buffer;
  musicUrl: string | null;
  eggSeconds?: number;
}): Promise<{ buf: Buffer; seconds: number; roar: boolean }> {
  return withTempDir(async (dir) => {
    const bin = ffmpegPath();
    if (!bin) throw new Error("ffmpeg-static binary not found in this environment");
    const files = {
      egg: path.join(dir, "egg.mp4"),
      dragon: path.join(dir, "dragon.mp4"),
      eggOv: path.join(dir, "egg-ov.png"),
      dragonOv: path.join(dir, "dragon-ov.png"),
      music: path.join(dir, "music.audio"),
    };
    fs.writeFileSync(files.egg, opts.eggClip);
    fs.writeFileSync(files.dragon, opts.dragonClip);
    fs.writeFileSync(files.eggOv, opts.eggOverlay);
    fs.writeFileSync(files.dragonOv, opts.dragonOverlay);
    const info = await new Promise<string>((resolve) => {
      const proc = spawn(bin, ["-i", files.dragon]);
      let err = "";
      proc.stderr.on("data", (d) => (err += d.toString()));
      proc.on("close", () => resolve(err));
      proc.on("error", () => resolve(err));
    });
    const dm = info.match(/Duration: (\d+):(\d+):([\d.]+)/);
    const dragonSec = dm ? +dm[1] * 3600 + +dm[2] * 60 + +dm[3] : 10;
    const roar = /Stream #\d+:\d+.*Audio:/.test(info);
    const eggSec = opts.eggSeconds ?? 5;
    const GAP = 0.3;
    const FADE = 1.5;
    const total = eggSec + GAP + dragonSec;
    let haveMusic = false;
    if (opts.musicUrl) {
      const res = await fetch(opts.musicUrl).catch(() => null);
      if (res?.ok) {
        fs.writeFileSync(files.music, Buffer.from(await res.arrayBuffer()));
        haveMusic = true;
      }
    }
    const fit = `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1,fps=30,format=yuv420p`;
    const filters = [
      `[0:v]${fit}[e]`,
      `[e][2:v]overlay=0:0,trim=0:${eggSec},setpts=PTS-STARTPTS,fade=t=out:st=${(eggSec - FADE).toFixed(2)}:d=${FADE}[v0]`,
      `[1:v]${fit}[d]`,
      `[d][3:v]overlay=0:0,setpts=PTS-STARTPTS,tpad=start_duration=${GAP}:color=black,fade=t=in:st=${GAP}:d=${FADE}[v1]`,
      `[v0][v1]concat=n=2:v=1:a=0,format=yuv420p[v]`,
    ];
    const delayMs = Math.round((eggSec + GAP) * 1000);
    const norm = "aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo";
    const audioOut = (() => {
      const fadeOut = `afade=t=out:st=${(total - 1.5).toFixed(2)}:d=1.5`;
      if (haveMusic && roar) {
        filters.push(`[4:a]atrim=0:${total.toFixed(2)},volume=0.9,${fadeOut},${norm}[m]`);
        filters.push(`[1:a]${norm},adelay=${delayMs}|${delayMs},volume=0.75[sfx]`);
        filters.push(`[m][sfx]amix=inputs=2:duration=first:normalize=0[a]`);
        return true;
      }
      if (haveMusic) {
        filters.push(`[4:a]atrim=0:${total.toFixed(2)},volume=0.9,${fadeOut},${norm}[a]`);
        return true;
      }
      if (roar) {
        filters.push(`[1:a]${norm},adelay=${delayMs}|${delayMs},apad,atrim=0:${total.toFixed(2)}[a]`);
        return true;
      }
      return false;
    })();
    const out = path.join(dir, "out.mp4");
    await runFfmpeg([
      "-i", files.egg,
      "-i", files.dragon,
      "-i", files.eggOv,
      "-i", files.dragonOv,
      ...(haveMusic ? ["-i", files.music] : []),
      "-filter_complex", filters.join(";"),
      "-map", "[v]",
      ...(audioOut ? ["-map", "[a]", "-c:a", "aac", "-b:a", "192k"] : []),
      "-t", total.toFixed(2),
      ...SEGMENT_ENCODE,
      "-movflags", "+faststart",
      out,
    ]);
    return { buf: fs.readFileSync(out), seconds: total, roar };
  });
}
