/**
 * Content Factory — 30-second story video pipeline (2026-08-11).
 *
 * For each daily carousel post, a companion vertical video is produced:
 * 1. Claude writes a ~30s voiceover script broken into 6 scenes
 *    (narration + visual direction + safe micro-motion per scene)
 * 2. gpt-image-2 renders 6 fresh text-free scene images
 * 3. Higgsfield animates each image with the current i2v model
 * 4. ffmpeg concatenates the surviving clips (silent) and the REAL
 *    duration is measured from the stitched output
 * 5. Claude condenses the narration — only lines for scenes that actually
 *    rendered — to a word budget matched to the measured duration
 *    (2026-08-12, per Keenan: script must reflect the assembled video's
 *    actual length, so failed scenes never cause audio/video desync)
 * 6. The voiceover is synthesized for the fitted narration, gently
 *    tempo-adjusted (≤18% faster) if it still runs long, and muxed in
 * 7. The finished MP4 is emailed to Keenan, ready to post
 *
 * VOICEOVER NOTE: the Higgsfield *platform* API has no text-to-speech
 * endpoint (verified against their full OpenAPI spec 2026-08-11 — only
 * image and image-to-video models exist). The voiceover therefore uses
 * OpenAI TTS with the key we already have for gpt-image-2. Env knobs:
 * - STORY_TTS_MODEL (default "gpt-4o-mini-tts")
 * - STORY_TTS_VOICE (default "shimmer" — warm female voice)
 * If TTS fails the video ships silent rather than not at all.
 *
 * Clip duration: HIGGSFIELD_STORY_CLIP_DURATION (default 5) — 6 × 5s = 30s.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { isMood, type Mood, MOOD_EXPRESSIONS, VISUAL_DNA_NOTEXT, SCENE_SETTINGS, STYLE_LANES, type StyleLane } from "./brand";

const anthropic = new Anthropic();
const CLAUDE_MODEL = "claude-sonnet-4-6";
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) {
    const key = process.env.ACUITY_ADLAB_OPENAI_KEY || process.env.OPENAI_API_KEY;
    if (!key) throw new Error("No OpenAI API key configured (ACUITY_ADLAB_OPENAI_KEY or OPENAI_API_KEY)");
    _openai = new OpenAI({ apiKey: key, timeout: 120_000 });
  }
  return _openai;
}

export const STORY_SCENE_COUNT = 6;

/** Seconds per Higgsfield clip — 6 × 5s = the 30s target. */
export function storyClipDuration(): number {
  const d = Number(process.env.HIGGSFIELD_STORY_CLIP_DURATION);
  return Number.isFinite(d) && d > 0 ? d : 5;
}

export interface StoryScene {
  /** The voiceover line spoken over this scene (~12 words). */
  narration: string;
  /** What the image shows — scene description handed to gpt-image-2. */
  visual: string;
  /** Safe in-place micro-gesture for the i2v prompt. */
  motion: string;
  mood?: Mood;
}

export interface StoryScript {
  scenes: StoryScene[];
  mood?: Mood;
}

const SCRIPT_SYSTEM_PROMPT = `You are a short-form video scriptwriter for Ripple, an AI-powered voice self-reflection app. You turn a carousel post into a ~30-second vertical video script with a voiceover.

TARGET AUDIENCE: Women aged 40-50 carrying a heavy mental load. BRAND VOICE: mirror, not a coach — reflect, don't advise. Warm but honest. US English spelling.

You will be given the carousel's headline and its reason list. Write a 6-scene script:
- Scene 1 is the HOOK: reframe the headline as a spoken line that stops the scroll ("If you're the one who remembers everything for everyone — this is for you").
- Scenes 2-5 distill the strongest reasons into spoken lines. Don't read the list verbatim — make it flow like one person talking honestly to another.
- Scene 6 is the landing: the emotional release plus one soft mention of Ripple by name (e.g. "Ripple is where you finally say it out loud"). Never salesy, never coach-y.

NARRATION RULES:
- TOTAL narration across all 6 scenes: 65-80 words (that is ~30 seconds spoken at a calm pace). Each scene's line is ~10-14 words.
- Second person, present tense, intimate — like a voice memo from someone who gets it.
- No hashtags, no emojis, no "hey guys", no CTA except the soft Ripple line in scene 6.

VISUAL RULES (each scene becomes ONE illustrated image of the same woman):
- "visual": one sentence describing the scene — the same woman (~40s) in a specific everyday setting doing a specific quiet activity that matches the narration. Vary the setting each scene. No text in the image, no other adults in focus.
- Every scene must be visually DIFFERENT (kitchen, car, hallway, bedroom, porch, bathroom mirror, sofa...).

MOTION RULES (each image is animated for a few seconds — the character's movement):
- "motion": ONE physical micro-gesture, present tense, continuation of "She ..." (e.g. "closes her eyes and lets her shoulders drop with a slow exhale").
- She stays in the same spot and pose, lips closed — no talking, no walking, no standing up, no turning around, no props appearing, no camera directions. Face, eyes, head, shoulders, hands, and breath ONLY. Under 20 words.

MOOD: every scene gets a "mood" from: "heavy", "tender", "wry", "frustrated", "hopeful". The arc usually moves heavy/frustrated → tender → hopeful by scene 6. Faces must match — never default to smiling.

OUTPUT FORMAT (strict JSON, no markdown):
{
  "mood": "dominant mood of the whole video",
  "scenes": [
    { "narration": "...", "visual": "...", "motion": "...", "mood": "..." },
    ... exactly 6 scenes ...
  ]
}`;

/**
 * Write the 30s story script from the carousel's headline + reasons.
 * Logs the Claude call to ClaudeCallLog like the topic generator.
 */
export async function generateStoryScript(input: {
  headline: string;
  reasons: string[];
  mood?: string;
}): Promise<StoryScript> {
  const { prisma } = await import("@/lib/prisma");

  const userPrompt = `Carousel headline: "${input.headline}"
Reasons:
${input.reasons.map((r, i) => `${i + 1}. ${r}`).join("\n")}
${isMood(input.mood) ? `Dominant mood of the post: ${input.mood}` : ""}

Write the 6-scene, ~30-second story video script. Return ONLY valid JSON.`;

  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1200,
      system: SCRIPT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const durationMs = Date.now() - start;
    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    await prisma.claudeCallLog.create({
      data: {
        purpose: "story-video-script",
        model: CLAUDE_MODEL,
        tokensIn,
        tokensOut,
        costCents: Math.ceil(
          (tokensIn * INPUT_COST_PER_TOKEN + tokensOut * OUTPUT_COST_PER_TOKEN) * 100
        ),
        durationMs,
        success: true,
      },
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr) as {
      mood?: unknown;
      scenes?: { narration?: unknown; visual?: unknown; motion?: unknown; mood?: unknown }[];
    };

    const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
    const scenes: StoryScene[] = rawScenes
      .filter((s) => typeof s.narration === "string" && typeof s.visual === "string")
      .slice(0, STORY_SCENE_COUNT)
      .map((s) => ({
        narration: (s.narration as string).trim(),
        visual: (s.visual as string).trim(),
        motion: typeof s.motion === "string" ? s.motion.trim() : "",
        mood: isMood(s.mood) ? s.mood : isMood(parsed.mood) ? parsed.mood : undefined,
      }));
    if (scenes.length < STORY_SCENE_COUNT) {
      throw new Error(
        `Story script returned ${scenes.length}/${STORY_SCENE_COUNT} usable scenes`
      );
    }

    return {
      scenes,
      mood: isMood(parsed.mood) ? parsed.mood : undefined,
    };
  } catch (err) {
    await prisma.claudeCallLog.create({
      data: {
        purpose: "story-video-script",
        model: CLAUDE_MODEL,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        durationMs: Date.now() - start,
        success: false,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      },
    });
    throw err;
  }
}

/** Calm spoken pace used to convert measured seconds into a word budget. */
const WORDS_PER_SECOND = 2.4;

/**
 * Rewrite the narration to fit the ACTUAL stitched video duration
 * (2026-08-12). Called after the clips render, with only the lines whose
 * scenes survived. Claude condenses/smooths them into one flowing
 * voiceover sized to the measured seconds — keeping the hook opening,
 * scene order, and the soft Ripple landing. Falls back to the joined
 * input lines if the call fails (caller handles that).
 */
export async function fitNarrationToDuration(input: {
  narrations: string[];
  targetSeconds: number;
  headline: string;
}): Promise<string> {
  const { prisma } = await import("@/lib/prisma");
  const maxWords = Math.round(input.targetSeconds * WORDS_PER_SECOND);
  const minWords = Math.max(10, Math.round(input.targetSeconds * (WORDS_PER_SECOND - 0.3)));

  const userPrompt = `The assembled video runs exactly ${input.targetSeconds.toFixed(1)} seconds. Here are the voiceover lines for the scenes that made it into the cut, in order:

${input.narrations.map((n, i) => `${i + 1}. ${n}`).join("\n")}

Topic: "${input.headline}"

Rewrite these into ONE continuous voiceover that a calm speaker finishes in ${input.targetSeconds.toFixed(0)} seconds: between ${minWords} and ${maxWords} words TOTAL. Rules:
- Keep the lines in this order and keep each line's core idea — condense or smooth, don't invent new points.
- The first line stays a hook; the last line keeps the soft Ripple mention.
- Second person, present tense, intimate. No hashtags, no emojis, no CTA beyond the Ripple line.
- Return ONLY the narration text, nothing else.`;

  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      system:
        "You are a short-form video voiceover editor for Ripple, an AI-powered voice self-reflection app for women 40-50 carrying a heavy mental load. Mirror, not a coach. US English.",
      messages: [{ role: "user", content: userPrompt }],
    });
    const durationMs = Date.now() - start;
    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    await prisma.claudeCallLog.create({
      data: {
        purpose: "story-narration-fit",
        model: CLAUDE_MODEL,
        tokensIn,
        tokensOut,
        costCents: Math.ceil(
          (tokensIn * INPUT_COST_PER_TOKEN + tokensOut * OUTPUT_COST_PER_TOKEN) * 100
        ),
        durationMs,
        success: true,
      },
    });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (text.split(/\s+/).length < 8) {
      throw new Error("Fitted narration is suspiciously short");
    }
    return text;
  } catch (err) {
    await prisma.claudeCallLog.create({
      data: {
        purpose: "story-narration-fit",
        model: CLAUDE_MODEL,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        durationMs: Date.now() - start,
        success: false,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      },
    });
    throw err;
  }
}

/**
 * Image prompt for one story scene — mirrors the text-free branch of
 * buildImagePrompt (VISUAL_DNA_NOTEXT, no "slide"/"carousel" wording)
 * so the clips match the carousel's illustration language.
 */
export function buildStoryImagePrompt(opts: {
  lane: string;
  headline: string;
  scene: StoryScene;
  sceneIndex: number;
  colorPrompt?: string;
}): string {
  const lanePrefix =
    opts.lane in STYLE_LANES ? STYLE_LANES[opts.lane as StyleLane] : STYLE_LANES.cinematicReal;
  const moodLine = isMood(opts.scene.mood) ? MOOD_EXPRESSIONS[opts.scene.mood] : "";
  const sceneHint = SCENE_SETTINGS[(opts.headline.length + opts.sceneIndex) % SCENE_SETTINGS.length];
  return [
    lanePrefix,
    opts.colorPrompt ?? "",
    `An illustrated scene: ${opts.scene.visual}`,
    // Claude's visual carries the setting; the rotating hint is a soft
    // backup so scenes stay varied even when the visual is generic.
    opts.scene.visual.toLowerCase().includes("setting") ? "" : sceneHint,
    moodLine,
    `Mood context: ${opts.headline} — self-reflection and mental load, for women. The SAME woman appears in a series of scenes; keep her look consistent: ~40s, warm, natural.`,
    VISUAL_DNA_NOTEXT,
  ].filter(Boolean).join("\n");
}

/**
 * Synthesize the voiceover MP3 for the full narration via OpenAI TTS.
 * (Higgsfield's platform API exposes no TTS endpoint — see header note.)
 */
export async function generateVoiceover(narration: string): Promise<Buffer> {
  const model = process.env.STORY_TTS_MODEL || "gpt-4o-mini-tts";
  const voice = process.env.STORY_TTS_VOICE || "shimmer";
  const res = await openai().audio.speech.create({
    model,
    voice,
    input: narration,
    response_format: "mp3",
    // gpt-4o-mini-tts supports style instructions; older models ignore it.
    instructions:
      "Warm, intimate, unhurried voice of a woman in her mid-40s. Calm and honest, like a voice memo to a close friend. Gentle pauses between sentences. Never peppy, never salesy.",
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 5_000) {
    throw new Error(`TTS returned a suspiciously small file (${buffer.length} bytes)`);
  }
  return buffer;
}

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

/** Run ffmpeg; resolves with the full stderr (where ffmpeg logs metadata). */
function runFfmpeg(bin: string, args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let stderr = "";
    const proc = spawn(bin, args);
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(0, 800)}`));
    });
  });
}

/** Parse "Duration: HH:MM:SS.ss" from ffmpeg stderr. */
function parseDuration(stderr: string): number | null {
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

async function probeFileDuration(bin: string, filePath: string): Promise<number> {
  // "-f null -" makes ffmpeg decode and exit 0 while printing Duration to
  // stderr (ffmpeg-static bundles no ffprobe binary, so this is the probe).
  const stderr = await runFfmpeg(bin, ["-i", filePath, "-f", "null", "-"]);
  const sec = parseDuration(stderr);
  if (sec === null || !Number.isFinite(sec) || sec <= 0) {
    throw new Error(`Could not parse media duration from ffmpeg output`);
  }
  return sec;
}

/** Measure a media buffer's duration in seconds (video or audio). */
export async function probeMediaDuration(media: Buffer, ext: string): Promise<number> {
  const bin = ffmpegPath();
  if (!bin) throw new Error("ffmpeg-static binary not found in this environment");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "story-probe-"));
  try {
    const p = path.join(dir, `probe.${ext}`);
    fs.writeFileSync(p, media);
    return await probeFileDuration(bin, p);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Concatenate the scene clips into one silent vertical MP4. Every clip is
 * normalized to 1080x1920 @ 30fps first (Higgsfield's output resolution
 * varies by model/quality). The voiceover is muxed separately AFTER the
 * duration is measured (muxNarration) so the narration can be fitted to
 * the video's real length.
 */
export async function stitchStoryVideo(clips: Buffer[]): Promise<Buffer> {
  const bin = ffmpegPath();
  if (!bin) throw new Error("ffmpeg-static binary not found in this environment");
  if (clips.length === 0) throw new Error("No clips to stitch");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "story-stitch-"));
  const outVideo = path.join(dir, "out.mp4");
  try {
    const inputs: string[] = [];
    clips.forEach((buf, i) => {
      const p = path.join(dir, `clip-${i}.mp4`);
      fs.writeFileSync(p, buf);
      inputs.push("-i", p);
    });

    const norm = clips
      .map((_, i) => `[${i}:v]scale=1080:1920:flags=lanczos,fps=30,setsar=1[v${i}]`)
      .join(";");
    const concat =
      clips.map((_, i) => `[v${i}]`).join("") + `concat=n=${clips.length}:v=1:a=0[v]`;

    const args = [
      "-y",
      "-loglevel", "warning",
      ...inputs,
      "-filter_complex", `${norm};${concat}`,
      "-map", "[v]",
      "-an",
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outVideo,
    ];

    await runFfmpeg(bin, args);
    const out = fs.readFileSync(outVideo);
    if (out.length < 100_000) {
      throw new Error(
        `Stitch produced a suspiciously small output (${out.length} bytes from ${clips.length} clips)`
      );
    }
    console.log(
      `[story-video] Stitched ${clips.length} clips (silent): ${out.length} bytes`
    );
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Mux the voiceover onto the already-stitched silent video (2026-08-12).
 * The video stream is copied (no re-encode). If the audio runs longer
 * than the video it is gently sped up (atempo, capped at 1.18×) so the
 * narration lands on the video's end; any tiny remainder is trimmed with
 * -shortest. If the audio is shorter, the video keeps its full length
 * and the audio simply ends early — -shortest is NOT used in that case
 * because it would trim the video.
 */
export async function muxNarration(video: Buffer, audio: Buffer): Promise<Buffer> {
  const bin = ffmpegPath();
  if (!bin) throw new Error("ffmpeg-static binary not found in this environment");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "story-mux-"));
  try {
    const videoPath = path.join(dir, "video.mp4");
    const audioPath = path.join(dir, "voiceover.mp3");
    const outPath = path.join(dir, "out.mp4");
    fs.writeFileSync(videoPath, video);
    fs.writeFileSync(audioPath, audio);

    const videoSec = await probeFileDuration(bin, videoPath);
    const audioSec = await probeFileDuration(bin, audioPath);

    const audioArgs: string[] = [];
    if (audioSec > videoSec + 0.15) {
      const factor = Math.min(audioSec / videoSec, 1.18);
      audioArgs.push("-filter:a", `atempo=${factor.toFixed(4)}`, "-shortest");
      console.log(
        `[story-video] Voiceover ${audioSec.toFixed(1)}s vs video ${videoSec.toFixed(1)}s — atempo ${factor.toFixed(3)}`
      );
    }

    await runFfmpeg(bin, [
      "-y",
      "-loglevel", "warning",
      "-i", videoPath,
      "-i", audioPath,
      "-map", "0:v",
      "-map", "1:a",
      "-c:v", "copy",
      ...audioArgs,
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outPath,
    ]);

    const out = fs.readFileSync(outPath);
    if (out.length < 100_000) {
      throw new Error(`Mux produced a suspiciously small output (${out.length} bytes)`);
    }
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
