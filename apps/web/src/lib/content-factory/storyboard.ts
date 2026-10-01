/**
 * Content Factory — STORYBOARD TEST (2026-09-30, per Keenan: "create two
 * storyboard videos for me with sound effects... use the exact idea that
 * you just said with the dragon and give me a post example" / "replace
 * nothing yet while i see if this is viable").
 *
 * TEST ONLY. Nothing here is wired to a lane, the publisher or a ContentLane
 * row — it builds two videos from one storyboard and emails them:
 *
 *   Version A "cut":        all 8 shots generated from the character sheet
 *                           and animated independently, hard cuts on action.
 *   Version B "continuous": shot 1 shared with A; every later shot's start
 *                           image is an EDIT of the previous clip's LAST
 *                           frame (plus the character sheet), so light,
 *                           place and characters carry over shot to shot.
 *
 * Recurring characters (dragon, knight, fortress) are generated ONCE and
 * combined into one character sheet that every shot is generated against.
 * Sound: fal.ai MMAudio v2 video-to-audio per clip (synced SFX), with the
 * Mythicals music bed underneath at about -13 dB.
 *
 * Storage: storyboards/<name>/ — ref-*.jpg, sheet.jpg, a-shot-N.jpg,
 * b-shot-N.jpg, b-frame-N.jpg, base files, sfx/*, version-a.mp4,
 * version-b.mp4, manifest.json.
 */

import OpenAI from "openai";
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export const BUCKET = "content-factory";
const W = 1080;
const H = 1920;
/** Every shot plays its full Kling clip. */
export const SHOT_SEC = 5;

/**
 * A storyboard is DATA (2026-09-30, per Keenan's follow-up: the nature
 * reveal is the eventual Mythicals "scene" lane). It arrives in the
 * storage request / event data, or as a named preset below.
 */
export interface StoryShot {
  n: number;
  scene: string;
  motion: string;
  /** fal MMAudio prompt for this shot's synced sound. */
  sfx: string;
  /** Reference keys (from Storyboard.refs) that appear in this shot. */
  refs: string[];
}

export interface Storyboard {
  title: string;
  /** "film" = prestige fantasy film; "documentary" = BBC-style nature footage. */
  style: "film" | "documentary" | "trailcam" | "locked";
  /** Title text over shot 1, or null for no title card. */
  coverText: string | null;
  /** Question burned over the last shot, or null (question lives in the caption). */
  closingQuestion: string | null;
  caption: string;
  emailSubject: string;
  /** Recurring subjects, generated once into a character sheet. */
  refs: Record<string, string>;
  shots: StoryShot[];
  /** Which versions to build: "b" continuous (primary), "a" cut. */
  versions: ("a" | "b")[];
  /** Music under SFX starting at this shot (1 = whole video). */
  musicFromShot: number;
  /** Last shot is generated to mirror the first frame so the video loops. */
  endMatchesStart: boolean;
  /**
   * "raw" (2026-10-01): the next clip starts from the previous clip's EXACT
   * last frame, untouched, so every join is pixel-identical. "edit" (the
   * first kirin test) redrew each frame and was "not cohesive even slightly".
   */
  chain?: "edit" | "raw";
  /** Clip length in seconds (Kling: 5 or 10). Default 5. */
  shotSec?: number;
  /** Video model override for this storyboard (e.g. "kling-video/v3.0/pro/image-to-video"). */
  model?: string;
}

export const DRAGON_STORYBOARD: Storyboard = {
  title: "The Dragon Came at Dawn",
  style: "film",
  coverText: "THE DRAGON CAME AT DAWN.",
  closingQuestion: "WOULD YOU HAVE HELD THE WALL?",
  caption:
    "The bells never rang. The shadow came first.\n\nWould you have held the wall? Tell us below.\n\n#dragon #epicfantasy #mythicalcreatures #fantasyart",
  emailSubject: "Storyboard test: The Dragon Came at Dawn (A vs B)",
  versions: ["a", "b"],
  musicFromShot: 1,
  endMatchesStart: false,
  refs: {
    dragon:
      "a colossal ash-black dragon with cracked obsidian scales, an ember-orange glow in its throat and in the seams of its chest, tattered leathery wings and a long horned skull",
    knight: "a lone knight in battered dark steel plate armor with a deep red cloak, his face hidden by a closed helm",
    fortress: "a grey stone mountain fortress on a cliff edge with tall towers and long battlements",
  },
  shots: [
    { n: 1, scene: "The grey stone mountain fortress on its cliff at dawn, high above a sea of mist; a vast winged shadow sweeps across the clouds below the walls.", motion: "A slow push-in toward the fortress as the huge winged shadow passes over the walls.", sfx: "cold mountain wind, distant deep wingbeats, a low ominous rumble", refs: ["fortress"] },
    { n: 2, scene: "Soldiers on the fortress battlements look up at the sky, spears raised, banners whipping in the wind.", motion: "The soldiers turn their heads upward and raise their spears as the banners snap in the wind.", sfx: "banners snapping in strong wind, armor clinking, tense shouts of soldiers", refs: ["fortress"] },
    { n: 3, scene: "The ash-black dragon bursts out of the clouds with its wings spread wide, banking around the tallest tower of the fortress.", motion: "The dragon glides around the tower as the camera tracks it through the air.", sfx: "massive leathery wings beating, rushing wind, a deep dragon roar", refs: ["dragon", "fortress"] },
    { n: 4, scene: "An extreme close-up of the dragon's ember-orange eye; the slit pupil narrows; smoke curls past the scales.", motion: "The eye narrows slowly as thin smoke drifts across the cracked black scales.", sfx: "a low rumbling growl, deep heavy breathing, crackling embers", refs: ["dragon"] },
    { n: 5, scene: "The dragon dives steeply out of the sky toward the fortress battlements, wings folded back.", motion: "A steep dive toward the walls as the camera follows behind the dragon.", sfx: "a screaming dive through the air, rushing wind building, a rising roar", refs: ["dragon", "fortress"] },
    { n: 6, scene: "A wave of dragon fire rolls along the fortress battlements as soldiers dive for cover behind the stone parapet. No gore, no one on fire.", motion: "A sweeping wall of flame rolls along the battlements as the soldiers drop behind the stone.", sfx: "a roaring blast of fire, crackling flames, stone cracking, men shouting", refs: ["dragon", "fortress"] },
    { n: 7, scene: "The lone knight with the red cloak stands on the burning wall and raises his shield toward the dragon descending above him, embers swirling around him.", motion: "The knight braces his stance and lifts his shield as embers swirl and his red cloak whips in the heat.", sfx: "fire crackling, a metal shield clanking up, wind roaring, a dragon roar overhead", refs: ["knight", "dragon", "fortress"] },
    { n: 8, scene: "Aftermath at dawn: smoke clears over the scorched battlements; the knight is still standing, silhouetted; the dragon wheels away into the sunrise.", motion: "Smoke drifts across the wall as the dragon recedes into the dawn sky.", sfx: "smoke and embers settling, distant fading wingbeats, a quiet mountain wind", refs: ["knight", "dragon", "fortress"] },
  ],
};

/**
 * Nature reveal (2026-09-30, per Keenan via the coordinator): BBC-style
 * nature footage, a mythical creature appears mid-scene, does one
 * spectacular thing, calm returns; the last frame mirrors the first so
 * the reel loops. Minimal text: the question lives in the caption.
 */
export const FROST_KIRIN_STORYBOARD: Storyboard = {
  title: "The Frost Kirin",
  style: "documentary",
  coverText: null,
  closingQuestion: null,
  caption:
    "Nobody believed the trail cam footage.\n\nWhat would you have done? Tell us below.\n\n#mythicalcreatures #kirin #fantasyart #legendarycreatures",
  emailSubject: "Storyboard test: The Frost Kirin (nature reveal)",
  versions: ["b"],
  musicFromShot: 3,
  endMatchesStart: true,
  refs: {
    lake: "a misty alpine lake at dawn ringed by dark pines and snowy peaks, the water still and glassy",
    kirin:
      "a colossal frost kirin: a deer-like body the size of a house, pale silver-blue scales, a flowing white mane like mist, crystalline antlers and glowing pale-blue eyes",
  },
  shots: [
    { n: 1, scene: "A wide establishing shot of the misty alpine lake at dawn; two deer drink at the shore in the foreground.", motion: "A slow push-in as mist drifts over the water and a deer lowers its head to drink.", sfx: "birdsong, gentle lapping water, soft wind", refs: ["lake"] },
    { n: 2, scene: "The same framing: the deer's heads snap up; a flock of birds bursts from the pines; rings spread across the water from the center of the lake.", motion: "The deer startle and bolt out of frame, birds scatter from the trees and ripples widen across the lake.", sfx: "birds wings flapping away, deer hooves running, sudden silence", refs: ["lake"] },
    { n: 3, scene: "The frost kirin rises out of the center of the lake, water streaming off its silver scales and mane.", motion: "It rises slowly to its full height as water pours off its body and mane.", sfx: "deep rumble, water cascading, low resonant breath", refs: ["lake", "kirin"] },
    { n: 4, scene: "Closer: the kirin lowers its head and exhales a wave of frost across the lake; the water freezes in a sweeping wave toward the camera.", motion: "Frost sweeps across the surface toward the camera as the ice crackles forward.", sfx: "icy cracking and freezing, frost spreading, crystalline crackle", refs: ["lake", "kirin"] },
    { n: 5, scene: "The kirin walks across the frozen lake, each step leaving glowing blue frost prints.", motion: "It walks steadily across the ice, its mane drifting like mist, glowing prints left behind.", sfx: "heavy hooves on ice, crunching frost, faint chime", refs: ["lake", "kirin"] },
    { n: 6, scene: "The kirin fades into the mist at the far shore; the ice melts back into still water; the scene returns to the calm opening framing of the misty lake at dawn.", motion: "The kirin dissolves into the mist as the ice melts and the lake stills.", sfx: "soft wind, mist, birdsong returning", refs: ["lake", "kirin"] },
  ],
};

/**
 * Trail-cam nature reveal (2026-10-01), built after the first kirin test
 * failed ("not cohesive even slightly"): ONE fixed camera, ONE base image,
 * two 10-second clips joined on the exact last frame. Nothing is redrawn.
 */
export const TRAILCAM_KIRIN_STORYBOARD: Storyboard = {
  title: "Trail Cam: The Frost Kirin",
  style: "trailcam",
  coverText: null,
  closingQuestion: null,
  caption:
    "Nobody believed the trail cam footage.\n\nWhat would you have done? Tell us below.\n\n#trailcam #mythicalcreatures #kirin #legendarycreatures",
  emailSubject: "Storyboard test #2: Trail Cam Frost Kirin (one locked camera)",
  versions: ["b"],
  musicFromShot: 2,
  endMatchesStart: false,
  chain: "raw",
  shotSec: 10,
  refs: {
    lake: "the shore of a misty alpine lake at dawn seen from a trail camera strapped to a pine trunk: pebbled shore in the foreground, still glassy water in the middle, dark pines and a snowy peak behind, soft fog on the water",
    kirin:
      "a colossal frost kirin, as tall as the pines: a deer-like body with pale silver-blue scales, a flowing white mane like mist, crystalline antlers and glowing pale-blue eyes",
  },
  shots: [
    {
      n: 1,
      scene: "The misty lake shore at dawn from the fixed trail camera. Fog drifts on the still water. Far out in the middle of the lake, the water begins to bulge and ripple.",
      motion: "Fog drifts slowly; for the first few seconds nothing happens, then the center of the lake starts to swell and ripple outward, and the antlers and head of a colossal frost kirin slowly rise out of the water.",
      sfx: "birdsong, gentle lapping water, then the birds go quiet and a deep underwater rumble builds",
      // The opening still shows only the empty lake; the kirin rises during the clip.
      refs: ["lake"],
    },
    {
      n: 2,
      scene: "The colossal frost kirin, as tall as the pines, stands in the lake, water streaming off it.",
      motion: "The kirin lowers its head and breathes out a wave of frost that spreads across the lake and freezes the water in a sweeping crackling sheet, then it turns and walks slowly away into the fog until it is gone. The camera never moves.",
      sfx: "water cascading off a huge creature, a deep breath, ice cracking and freezing across a lake, heavy slow footsteps on ice fading away",
      refs: ["lake", "kirin"],
    },
  ],
};

/** Test #3 (2026-10-01): mossy valley, a dragon flies in and settles. One action per clip. */
export const VALLEY_DRAGON_STORYBOARD: Storyboard = {
  title: "The Valley Dragon",
  style: "locked",
  coverText: null,
  closingQuestion: null,
  caption:
    "We set the camera up for the waterfall.\n\nWhat would you have done? Tell us below.\n\n#dragon #mythicalcreatures #fantasy #legendarycreatures",
  emailSubject: "Storyboard test #3: The Valley Dragon (locked camera)",
  versions: ["b"],
  musicFromShot: 2,
  endMatchesStart: false,
  chain: "raw",
  shotSec: 10,
  refs: {
    valley:
      "a deep, empty, hyperreal mossy valley in soft overcast morning light: thick emerald moss over boulders and fallen stone, a thin waterfall on the far cliff, drifting low mist, a wide flat mossy clearing in the middle ground, open grey sky above the ridgeline. No animals, no birds, no people",
    dragon:
      "a colossal moss-green and bronze dragon with weathered scales, huge leathery wings with torn edges, a long horned head and a heavy, believable body",
  },
  shots: [
    // Test #4 (2026-10-01): test #3 left the dragon out of the opening frame,
    // so the video model invented a flat, game-like dragon that flew away
    // into the distance. Lesson: the creature must be IN the opening image
    // (rendered hyperreal by gpt-image-2), large and close, and each clip
    // gets exactly one action.
    {
      n: 1,
      scene: "The mossy valley from a camera locked on a tripod. The colossal moss-green and bronze dragon is descending into the valley from the upper right, wings spread wide, close to the camera and large in the frame (its body and wings fill about half the width), about twenty meters above the wide mossy clearing in the middle of the frame. Mist drifts, the waterfall falls on the far cliff. No other animals, birds or people.",
      motion: "The dragon glides down in one smooth, heavy descent and lands on the mossy clearing in the middle of the frame, its claws sinking into the moss, its wings still spread as it touches down. It stays large and close; it does not fly away.",
      sfx: "huge slow wingbeats and rushing air, valley wind, distant waterfall, then a heavy thud of a huge creature landing on moss",
      refs: ["valley", "dragon"],
    },
    {
      n: 2,
      scene: "The colossal moss-green and bronze dragon has just landed on the mossy clearing, wings spread.",
      motion: "The dragon slowly folds its huge wings against its body and settles down onto the moss, then lifts its head and breathes out a slow plume of mist. It stays in the same spot. The camera never moves.",
      sfx: "leathery wings folding, a heavy body settling on moss, a deep slow breath and a low rumbling growl, valley wind and waterfall",
      refs: ["valley", "dragon"],
    },
  ],
};

export const STORYBOARD_PRESETS: Record<string, Storyboard> = {
  dragon: DRAGON_STORYBOARD,
  kirin: FROST_KIRIN_STORYBOARD,
  "trailcam-kirin": TRAILCAM_KIRIN_STORYBOARD,
  "valley-dragon": VALLEY_DRAGON_STORYBOARD,
};

/** Preset name or a full storyboard object (request JSON) → a Storyboard. */
export function resolveStoryboard(input: { preset?: string; storyboard?: Partial<Storyboard> } | undefined): Storyboard {
  const base = STORYBOARD_PRESETS[input?.preset ?? ""] ?? null;
  const custom = input?.storyboard;
  const sb = { ...(base ?? DRAGON_STORYBOARD), ...(custom ?? {}) } as Storyboard;
  if (!sb.shots?.length || !sb.refs) throw new Error("storyboard needs refs and shots");
  return {
    ...sb,
    versions: sb.versions?.length ? sb.versions : ["b"],
    musicFromShot: sb.musicFromShot || 1,
    style: sb.style === "documentary" || sb.style === "trailcam" || sb.style === "locked" ? sb.style : "film",
    chain: sb.chain === "raw" ? "raw" : "edit",
    shotSec: sb.shotSec === 10 ? 10 : 5,
    ...(typeof sb.model === "string" && /^[a-z0-9-]+\/[a-z0-9./-]+$/i.test(sb.model) ? { model: sb.model } : {}),
    coverText: sb.coverText ?? null,
    closingQuestion: sb.closingQuestion ?? null,
    emailSubject: sb.emailSubject || `Storyboard test: ${sb.title}`,
  };
}

// ─── Image prompts ───────────────────────────────────────────────────

const FILM_LOOK =
  "Shot like a prestige live-action fantasy film: real weather, real light, tactile detail in scales, stone, steel and cloth, believable anatomy and scale, dramatic but natural lighting, rich color, tack-sharp focus. Not a cartoon, not anime, not a video-game render, not a painting. No text, letters, logos or watermarks anywhere. Nothing gory.";
const DOC_LOOK =
  "Hyperreal nature-documentary footage, like a BBC wildlife film: a long telephoto lens, natural dawn light, true-to-life color, real mist and water, believable scale. It must look like real footage of a real place that happens to contain the creature. Not a cartoon, not a painting, not a render. No text, letters, logos or watermarks anywhere.";

function look(sb: Storyboard): string {
  return sb.style === "locked"
    ? LOCKED_LOOK
    : sb.style === "trailcam"
      ? TRAILCAM_LOOK
      : sb.style === "documentary"
        ? DOC_LOOK
        : FILM_LOOK;
}

function stillLead(sb: Storyboard): string {
  return sb.style === "locked"
    ? "A hyperrealistic frame from a cinema camera locked on a tripod, vertical composition: "
    : sb.style === "trailcam"
    ? "A real wildlife trail-camera frame from a fixed camera, vertical composition: "
    : sb.style === "documentary"
    ? "A breathtaking, hyper-real nature documentary frame, vertical composition: "
    : "A breathtaking, hyper-real cinematic film still, vertical composition: ";
}

function sheetLegend(sb: Storyboard): string {
  return Object.keys(sb.refs).map((k) => k.toUpperCase()).join(", ");
}

export function refPrompt(sb: Storyboard, key: string): string {
  const subject = sb.refs[key];
  const isPlace = /lake|fortress|castle|forest|valley|city|shore|mountain|sea|river|temple/i.test(key + " " + subject.slice(0, 40));
  const framing = isPlace
    ? "A wide establishing shot of the whole place."
    : "The full creature or figure shown complete in the frame, head to tail / head to toe, against a plain misty background, like a production design reference photo.";
  return [`${stillLead(sb)}${subject}.`, framing, look(sb)].join("\n");
}

function refNames(sb: Storyboard, refs: string[]): string {
  return refs.map((r) => `the ${r.toUpperCase()} (${sb.refs[r] ?? r})`).join("; ");
}

/** Shot image generated against the character sheet. */
// Hyperreal fixed-camera footage (2026-10-01, test #3, Keenan: "it should
// be hyperrealistic", "no other animals in the scene").
const LOCKED_LOOK =
  "Hyperrealistic live-action footage shot on a high-end cinema camera locked on a tripod: natural light, true-to-life color and texture, real moss, rock, mist and scale. It must be indistinguishable from real footage of a real place. Absolutely NO animals, birds or people anywhere unless the scene names them. Not a cartoon, not a painting, not a render, not a video-game look. No text, letters, logos, timestamps or watermarks anywhere.";

const TRAILCAM_LOOK =
  "Real wildlife trail-camera footage: a fixed camera strapped to a tree, wide lens, natural light, slight sensor grain, true-to-life color, a believable real place. It must look like genuine footage that happens to contain the creature. Not a cartoon, not a painting, not a render. No text, letters, logos, timestamps or watermarks anywhere.";

export function shotPrompt(sb: Storyboard, shot: StoryShot): string {
  return [
    `${stillLead(sb)}${shot.scene}`,
    `The reference image is a REFERENCE SHEET with panels, left to right: ${sheetLegend(sb)}. Every one of them that appears in this shot must look EXACTLY like its panel: same shape, colors, markings and setting. This shot features ${refNames(sb, shot.refs)}. Do not copy the sheet's layout; compose a new single frame.`,
    "Keep the whole subject inside the frame with space around it.",
    look(sb),
  ].join("\n");
}

/** Continuous version: an edit of the previous clip's last frame (+ sheet, + opening frame for the loop). */
export function continuationPrompt(sb: Storyboard, shot: StoryShot, opts: { matchOpening?: boolean } = {}): string {
  return [
    `${stillLead(sb)}${shot.scene}`,
    "The FIRST reference image is the last frame of the previous moment of this same footage. Continue the SAME scene from it: same time of day, same light and color grade, same mist and weather, same place and lens. Move the action forward to show this next moment, so the cut feels like one continuous take.",
    `The SECOND reference image is the reference sheet (left to right: ${sheetLegend(sb)}). This shot features ${refNames(sb, shot.refs)}; each must look exactly like its panel.`,
    opts.matchOpening
      ? "The THIRD reference image is the OPENING frame of the video. End this shot on that same calm framing and composition, so the last frame mirrors the first and the video loops."
      : "",
    look(sb),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Higgsfield motion prompt. */
export function shotMotionPrompt(sb: Storyboard, shot: StoryShot): string {
  const sec = sb.shotSec ?? SHOT_SEC;
  return [
    sb.style === "locked"
      ? "Hyperrealistic live-action footage. The camera is LOCKED OFF on a tripod and does NOT move, pan, zoom or shake at all; only things in the scene move."
      : sb.style === "trailcam"
      ? "Real wildlife trail-camera footage. The camera is LOCKED OFF on a tripod and does NOT move, pan, zoom or shake at all; only things in the scene move."
      : sb.style === "documentary"
        ? "Real nature documentary footage, long telephoto lens, gentle handheld drift."
        : "Epic cinematic fantasy film shot.",
    `Scene: ${shot.scene}`,
    `Action: ${shot.motion}`,
    `Natural, continuous movement through all ${sec} seconds at real-world speed. Realistic physics, no morphing, no warping, no sudden changes.`,
    sb.style === "trailcam" || sb.style === "locked"
      ? "Keep the setting exactly as in the image: same shore, water, trees, light and framing for the whole clip. The camera never moves. The creature described in the action is the only thing that appears. No text, no people, no scene cuts."
      : "Keep every creature's design, colors and the setting exactly as in the image. The main subject stays in frame. No text, no new creatures or people, no scene cuts.",
  ].join(" ");
}

// ─── OpenAI images (multi-image edit for continuity) ────────────────

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) {
    const key = process.env.ACUITY_ADLAB_OPENAI_KEY || process.env.OPENAI_API_KEY;
    if (!key) throw new Error("No OpenAI API key configured");
    _openai = new OpenAI({ apiKey: key, timeout: 170_000, maxRetries: 0 });
  }
  return _openai;
}

/** gpt-image-2 edit with several reference images (last frame + sheet). */
export async function editWithReferences(prompt: string, refs: Buffer[], quality: "high" | "medium" = "medium"): Promise<Buffer> {
  const files = await Promise.all(
    refs.map((b, i) => OpenAI.toFile(b, `ref-${i}.jpg`, { type: "image/jpeg" }))
  );
  const res = await openai().images.edit({
    model: "gpt-image-2",
    image: files,
    prompt,
    n: 1,
    size: "1024x1536",
    quality,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("gpt-image-2 edit returned no image data");
  return Buffer.from(b64, "base64");
}

/** Three reference renders side by side → one JPEG character sheet. */
export async function buildCharacterSheet(refs: Buffer[]): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  const panelW = 683;
  const panelH = 1024;
  const panels = await Promise.all(
    refs.map((r) => sharp(r).resize(panelW, panelH, { fit: "cover" }).jpeg({ quality: 92 }).toBuffer())
  );
  return sharp({ create: { width: panelW * panels.length, height: panelH, channels: 3, background: { r: 10, g: 10, b: 12 } } })
    .composite(panels.map((p, i) => ({ input: p, left: i * panelW, top: 0 })))
    .jpeg({ quality: 92 })
    .toBuffer();
}

/** 9:16 1080x1920 base frame for Higgsfield. */
export async function toBaseFrame(img: Buffer): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  return sharp(img).resize(W, H, { fit: "cover", position: "centre" }).sharpen({ sigma: 0.6 }).jpeg({ quality: 95 }).toBuffer();
}

// ─── ffmpeg ──────────────────────────────────────────────────────────

function ffmpegPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const p = require("ffmpeg-static") as string | null;
  if (!p || !fs.existsSync(p)) throw new Error("ffmpeg-static binary not found");
  return p;
}

function runFfmpeg(args: string[]): Promise<void> {
  const bin = ffmpegPath();
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, ["-y", "-loglevel", "error", ...args]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr = (stderr + d.toString()).slice(-4000)));
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-1500)}`))));
  });
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "storyboard-"));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function fetchBuffer(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Download failed (${r.status}): ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Last frame of a clip as a JPEG (Version B continuity). */
export async function extractLastFrame(clip: Buffer): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const inPath = path.join(dir, "clip.mp4");
    const out = path.join(dir, "last.jpg");
    fs.writeFileSync(inPath, clip);
    // -sseof seeks from the end; -update 1 keeps overwriting so the final
    // decoded frame wins.
    await runFfmpeg(["-sseof", "-0.5", "-i", inPath, "-update", "1", "-q:v", "2", out]);
    return fs.readFileSync(out);
  });
}

/**
 * One shot → a 1080x1920 30fps segment of exactly `seconds`, optional text
 * layer on top, NO fades (hard cuts on action; segments concatenate with a
 * stream copy).
 */
export async function renderShotSegment(clip: Buffer, layer: Buffer | null, seconds = SHOT_SEC): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const clipPath = path.join(dir, "clip.mp4");
    const out = path.join(dir, "seg.mp4");
    fs.writeFileSync(clipPath, clip);
    const base = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,setsar=1,tpad=stop_mode=clone:stop_duration=${seconds},trim=0:${seconds},setpts=PTS-STARTPTS`;
    const args = ["-i", clipPath];
    let graph: string;
    if (layer) {
      const layerPath = path.join(dir, "layer.png");
      fs.writeFileSync(layerPath, layer);
      args.push("-loop", "1", "-t", String(seconds), "-i", layerPath);
      graph = `${base}[bg];[1:v]format=rgba,fps=30[l];[bg][l]overlay=0:0:shortest=1,format=yuv420p[v]`;
    } else {
      graph = `${base},format=yuv420p[v]`;
    }
    await runFfmpeg([
      ...args,
      "-filter_complex", graph,
      "-map", "[v]", "-t", String(seconds),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30",
      out,
    ]);
    return fs.readFileSync(out);
  });
}

/** Fallback when a shot's clip failed: a slow push-in on its still image. */
export async function renderStillSegment(image: Buffer, layer: Buffer | null, seconds = SHOT_SEC): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const imgPath = path.join(dir, "still.jpg");
    const out = path.join(dir, "seg.mp4");
    fs.writeFileSync(imgPath, image);
    const frames = Math.round(seconds * 30);
    const zoom = `[0:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='1+0.08*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=30,setsar=1`;
    const args = ["-i", imgPath];
    let graph: string;
    if (layer) {
      const layerPath = path.join(dir, "layer.png");
      fs.writeFileSync(layerPath, layer);
      args.push("-loop", "1", "-t", String(seconds), "-i", layerPath);
      graph = `${zoom}[bg];[1:v]format=rgba,fps=30[l];[bg][l]overlay=0:0:shortest=1,format=yuv420p[v]`;
    } else {
      graph = `${zoom},format=yuv420p[v]`;
    }
    await runFfmpeg([
      ...args,
      "-filter_complex", graph,
      "-map", "[v]", "-t", String(seconds),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30",
      out,
    ]);
    return fs.readFileSync(out);
  });
}

/**
 * Concat the segments (stream copy) and mix the sound: per-shot SFX
 * (padded/trimmed to each shot's length, laid end to end) leading, music
 * bed underneath at ~-13 dB. Without SFX, the music plays at full level.
 */
export async function assembleWithSound(opts: {
  segments: Buffer[];
  sfx: (Buffer | null)[];
  music: Buffer | null;
  seconds?: number;
  /** Music swells in from this shot (1 = from the start). */
  musicFromShot?: number;
}): Promise<{ buf: Buffer; seconds: number }> {
  const seg = opts.seconds ?? SHOT_SEC;
  const musicStart = Math.max(0, ((opts.musicFromShot ?? 1) - 1) * seg);
  return withTempDir(async (dir) => {
    const list = opts.segments.map((b, i) => {
      const p = path.join(dir, `seg-${i}.mp4`);
      fs.writeFileSync(p, b);
      return `file '${p}'`;
    });
    const listPath = path.join(dir, "list.txt");
    fs.writeFileSync(listPath, list.join("\n"));
    const silent = path.join(dir, "silent.mp4");
    await runFfmpeg(["-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", silent]);
    const t = opts.segments.length * seg;

    const inputs: string[] = ["-i", silent];
    const filters: string[] = [];
    const haveSfx = opts.sfx.some(Boolean);
    let idx = 1;
    const sfxLabels: string[] = [];
    if (haveSfx) {
      opts.sfx.forEach((b, i) => {
        if (b) {
          const p = path.join(dir, `sfx-${i}.audio`);
          fs.writeFileSync(p, b);
          inputs.push("-i", p);
          filters.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:${seg},asetpts=PTS-STARTPTS[s${i}]`);
          idx++;
        } else {
          filters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${seg}[s${i}]`);
        }
        sfxLabels.push(`[s${i}]`);
      });
      filters.push(`${sfxLabels.join("")}concat=n=${sfxLabels.length}:v=0:a=1[sfx]`);
    }
    let musicLabel: string | null = null;
    if (opts.music) {
      const mp = path.join(dir, "music.audio");
      fs.writeFileSync(mp, opts.music);
      inputs.push("-i", mp);
      filters.push(
        // Silent before musicStart, then a 2s swell (afade in), out over the last 2s.
        `[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:${t},volume=${haveSfx ? "-13dB" : "0dB"},afade=t=in:st=${musicStart.toFixed(2)}:d=${musicStart > 0 ? 2 : 0.5},afade=t=out:st=${(t - 2).toFixed(2)}:d=2[mus]`
      );
      musicLabel = "[mus]";
      idx++;
    }
    let outLabel: string;
    if (haveSfx && musicLabel) {
      filters.push(`[sfx]${musicLabel}amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[aout]`);
      outLabel = "[aout]";
    } else if (haveSfx) {
      outLabel = "[sfx]";
    } else if (musicLabel) {
      outLabel = musicLabel;
    } else {
      // no audio at all — silent track so players behave
      filters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${t}[aout]`);
      outLabel = "[aout]";
    }
    const out = path.join(dir, "out.mp4");
    await runFfmpeg([
      ...inputs,
      "-filter_complex", filters.join(";"),
      "-map", "0:v", "-map", outLabel,
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
      "-t", t.toFixed(2), out,
    ]);
    return { buf: fs.readFileSync(out), seconds: t };
  });
}

/** The audio track of a video file (fal returns the clip with sound). */
export async function extractAudio(video: Buffer): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const inPath = path.join(dir, "v.mp4");
    const out = path.join(dir, "a.m4a");
    fs.writeFileSync(inPath, video);
    await runFfmpeg(["-i", inPath, "-vn", "-c:a", "aac", "-b:a", "192k", out]);
    return fs.readFileSync(out);
  });
}

// ─── fal.ai MMAudio v2 (video → synced sound) ───────────────────────

export class FalLockedError extends Error {}

/**
 * Synced SFX for one clip. Returns the audio track. Throws FalLockedError
 * when the fal account is locked (unpaid / waiting on a top-up), so the
 * caller can build without sound and re-run sound later.
 */
export async function falVideoToAudio(videoUrl: string, prompt: string, duration = SHOT_SEC): Promise<Buffer> {
  const key = process.env.FAL_KEY;
  if (!key) throw new FalLockedError("FAL_KEY not configured");
  const res = await fetch("https://fal.run/fal-ai/mmaudio-v2", {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ video_url: videoUrl, prompt, negative_prompt: "music, speech, talking, singing", duration }),
    signal: AbortSignal.timeout(240_000),
  });
  const text = await res.text();
  if (!res.ok) {
    if (/locked|top_up|balance|exhausted/i.test(text)) throw new FalLockedError(text.slice(0, 300));
    throw new Error(`fal mmaudio failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const j = JSON.parse(text) as { video?: { url?: string } };
  if (!j.video?.url) throw new Error(`fal mmaudio returned no video: ${text.slice(0, 300)}`);
  return extractAudio(await fetchBuffer(j.video.url));
}

// ─── Email ───────────────────────────────────────────────────────────

export async function sendStoryboardEmail(opts: {
  sb: Storyboard;
  aUrl: string | null;
  bUrl: string | null;
  sfxNote: string;
  bApproach: string;
  costNote: string;
}): Promise<void> {
  const { sendEmailOrThrow } = await import("@/lib/resend");
  const { sb } = opts;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
  const button = (url: string, label: string) =>
    `<a href="${url}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">${label}</a>`;
  const cells: string[] = [];
  if (opts.bUrl)
    cells.push(`<td style="padding:8px;vertical-align:top;border:1px solid #eee;"><b>Continuous take${opts.aUrl ? " (Version B)" : ""}</b><br>
<span style="color:#555;font-size:13px;">${esc(opts.bApproach)}</span><br><br>${button(opts.bUrl, "Watch the video")}</td>`);
  if (opts.aUrl)
    cells.push(`<td style="padding:8px;vertical-align:top;border:1px solid #eee;"><b>Cut version (Version A)</b><br>
<span style="color:#555;font-size:13px;">${sb.shots.length} shots made separately from the same reference sheet, hard cuts on the action.</span><br><br>${button(opts.aUrl, "Watch Version A")}</td>`);
  const row = (k: string, v: string) =>
    `<tr><td style="padding:6px;border:1px solid #eee;width:140px;"><b>${k}</b></td><td style="padding:6px;border:1px solid #eee;">${esc(v)}</td></tr>`;
  const html = `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#111;">
<h2 style="margin:0 0 6px;">Storyboard test: ${esc(sb.title)}</h2>
<p style="margin:0 0 16px;color:#555;">Test only. Nothing was posted and no lane was changed.</p>
<table style="width:100%;border-collapse:collapse;"><tr>${cells.join("")}</tr></table>
<p style="font-size:13px;color:#555;">${esc(opts.sfxNote)}</p>
<h3 style="margin:22px 0 6px;">Post example</h3>
<table style="width:100%;border-collapse:collapse;font-size:14px;">
${row("On-screen text", [sb.coverText ? `Opening: ${sb.coverText}` : "No title card", sb.closingQuestion ? `Closing: ${sb.closingQuestion}` : "No closing card (the question is in the caption)"].join("\n"))}
${row("Caption", sb.caption)}
${row("Would post", "Legendary Mythicals (IG + FB), the 8pm CT slot, as 1 of the 4 daily posts, only if you approve the format.")}
${sb.endMatchesStart ? row("Loop", "The last shot returns to the opening framing so the reel loops.") : ""}
</table>
<p style="font-size:12px;color:#777;margin-top:16px;">${esc(opts.costNote)}</p>
</div>`;
  await sendEmailOrThrow({
    from: process.env.CONTENT_FACTORY_EMAIL_FROM ?? '"Ripple Content" <content@getacuity.io>',
    to: process.env.CONTENT_FACTORY_EMAIL_TO ?? "keenan@heelerdigital.com",
    subject: sb.emailSubject,
    html,
    text: `Storyboard test: ${sb.title}\n\n${opts.bUrl ? `Continuous: ${opts.bUrl}\n` : ""}${opts.aUrl ? `Cut: ${opts.aUrl}\n` : ""}\n${opts.sfxNote}\n\nPOST EXAMPLE\nCaption:\n${sb.caption}\nWould post: Legendary Mythicals, 8pm CT slot, only if approved.`,
  } as Parameters<typeof sendEmailOrThrow>[0]);
}
