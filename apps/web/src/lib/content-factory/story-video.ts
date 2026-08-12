/**
 * Content Factory — 30-second story video pipeline (2026-08-11).
 *
 * For each daily carousel post, a companion vertical video is produced:
 * 1. Claude writes a ~30s voiceover script broken into 6 scenes
 *    (narration + visual direction + safe micro-motion per scene)
 * 2. gpt-image-2 renders 6 fresh text-free scene images
 * 3. Higgsfield animates each image with the current i2v model
 * 4. A voiceover is synthesized for the full narration
 * 5. ffmpeg concatenates the 6 clips and muxes the voiceover
 * 6. The finished MP4 is emailed to Keenan, ready to post
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
  /** All narration lines joined — the TTS input. */
  fullNarration: string;
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
      fullNarration: scenes.map((s) => s.narration).join(" "),
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

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let stderr = "";
    const proc = spawn(bin, args);
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(0, 800)}`));
    });
  });
}

/**
 * Concatenate the scene clips into one vertical MP4 and mux the voiceover.
 * Every clip is normalized to 1080x1920 @ 30fps first (Higgsfield's output
 * resolution varies by model/quality). `-shortest` trims audio overrun.
 * Ships silent (`-an`) when `audio` is null so a TTS failure never blocks
 * the video.
 */
export async function stitchStoryVideo(
  clips: Buffer[],
  audio: Buffer | null
): Promise<Buffer> {
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
    const audioIndex = clips.length;
    if (audio) {
      const p = path.join(dir, "voiceover.mp3");
      fs.writeFileSync(p, audio);
      inputs.push("-i", p);
    }

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
      ...(audio ? ["-map", `${audioIndex}:a`, "-c:a", "aac", "-b:a", "128k", "-shortest"] : ["-an"]),
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
      `[story-video] Stitched ${clips.length} clips${audio ? " + voiceover" : " (silent)"}: ${out.length} bytes`
    );
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
