/**
 * Content Factory — AMBIENT calm video pipeline (2026-08-18, per Keenan).
 *
 * The 4th daily post format, modeled on the wakingupapp pattern that
 * performs well: ONE catchy, soothing image (sky, clouds, water, light —
 * no people) turned into a low-movement looping video, with a soothing
 * voiceover telling a short story or lesson and script-true captions
 * burned over the video.
 *
 * Pipeline (see carousel-ambient-video.ts):
 * 1. Claude writes a calm ~40s lesson/story script + the scene concept
 * 2. gpt-image-2 renders one photoreal soothing 9:16 image (no text)
 * 3. Higgsfield animates it (5s, ambient drift only)
 * 4. The clip is looped with crossfades to the voiceover's length
 * 5. ElevenLabs voices the whole script in one continuous calm read
 *    (random pick between Vanessa and Hope, Keenan's chosen calm voices;
 *    AMBIENT_ELEVENLABS_VOICE_ID forces one — Higgsfield's platform API
 *    has no TTS endpoint, so a Higgsfield-app voice can't be called here)
 * 6. Captions come straight from the script text (estimateCaptionChunks)
 *    and are muxed in as timed PNG overlays
 *
 * Env knobs:
 * - AMBIENT_ELEVENLABS_VOICE_ID — force a single calm voice (optional;
 *   default alternates Vanessa/Hope)
 * - HIGGSFIELD_AMBIENT_CLIP_DURATION — seconds per source clip (default 5)
 */

import Anthropic from "@anthropic-ai/sdk";
import type { VoiceoverOptions } from "./story-video";

const anthropic = new Anthropic();
const CLAUDE_MODEL = "claude-sonnet-4-6";
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

/** Seconds per Higgsfield source clip before looping. */
export function ambientClipDuration(): number {
  const d = Number(process.env.HIGGSFIELD_AMBIENT_CLIP_DURATION);
  return Number.isFinite(d) && d > 0 ? d : 5;
}

export interface AmbientScript {
  /** Short label of the concept — persisted so future scripts avoid repeats. */
  theme: string;
  /** Short scroll-stopping title for the post (admin/email/caption). */
  title: string;
  /** The full voiceover text, read as ONE continuous calm narration. */
  script: string;
  /** What the single image shows — a serene scene, no people, no text. */
  visual: string;
  /** The ambient movement for the i2v prompt (clouds drift, light shifts...). */
  motion: string;
  /** 1-2 caption lines that tee up the video, same voice. */
  captionHook?: string;
  /** One question inviting viewers to share their version. */
  commentPrompt?: string;
}

const AMBIENT_SYSTEM_PROMPT = `You are a scriptwriter for calm, contemplative short-form vertical videos for Ripple, an AI-powered voice self-reflection app. Each video is ONE serene looping scene (sky, clouds, water, light — no people) with a soothing female voiceover telling a short story or offering a gentle lesson, with the words appearing as captions.

TARGET AUDIENCE: Women aged 40-50 carrying a heavy mental load — work, family, aging parents, invisible labor. They are capable, busy, reflective women who want to feel SEEN, not lectured.

BRAND VOICE — MIRROR, NOT A COACH: reflect, don't advise. Name what is true about her inner life so precisely that she feels understood. You may end on a gentle reframe or a question she can sit with, but NEVER instructions, steps, tips, or "you should". No app, product, or brand mention anywhere in the script — the account posting it carries the brand.

THE FORMAT (why it works): a beautiful, quiet scene + a low, warm voice + a thought that lands. Reference example of the register (do not copy): "How long must you spend locked in the prison of a negative emotion? Not a moment longer than you want to." Yours should be gentler and more reflective than that — a small story, an observation, or a truth about the weight she carries.

SCRIPT RULES:
- 70-90 words TOTAL, read slowly (~40 seconds). One continuous narration, not scenes.
- Open with a line too specific or too true to scroll past — mid-thought, no greeting, no setup.
- Second person or first person, present tense, intimate and unhurried.
- Short sentences. Real pauses implied by punctuation. Every line must read as natural spoken English.
- Land on a release: a recognition, a permission, or a question that lingers — never a to-do.
- No hashtags, no emojis, no CTA, no advice-verbs ("try", "start", "practice", "remember to").

VISUAL RULES ("visual" — the single image the whole video lives on):
- A breathtaking, SOOTHING natural scene with strong visual pull: e.g. towering clouds at golden hour, moonlit ocean, rain on a window at dusk, fog over a still lake, sun rays through a forest, city lights blurring at night, a candle by a dark window.
- NO people, NO animals in focus, NO text or typography of any kind.
- Composed for a vertical 9:16 frame with calm space in the middle third (captions sit there).
- One sentence, concrete and specific about light, color, and weather.

MOTION RULES ("motion" — how the scene moves for a few seconds):
- Only ambient, continuous, slow movement that can loop: clouds drifting, light shifting, water rippling, rain sliding, fog rolling, flame swaying.
- Nothing enters or leaves the frame. No people appear. No camera cuts or fast moves.
- Under 20 words, present tense.

ALSO OUTPUT:
- "title": a short scroll-stopping title, max 60 characters, in the same quiet voice
- "captionHook": 1-2 caption lines that tee up the video without repeating its first line
- "commentPrompt": one gentle question inviting viewers to answer in the comments

OUTPUT FORMAT (strict JSON, no markdown):
{
  "theme": "5-10 word label for this concept (used to avoid future repeats)",
  "title": "...",
  "captionHook": "...",
  "commentPrompt": "...",
  "script": "the full 70-90 word narration",
  "visual": "...",
  "motion": "..."
}`;

/**
 * Invent one calm lesson/story concept and write its script. Logs the
 * Claude call to ClaudeCallLog like the other generators.
 */
export async function generateAmbientScript(input: {
  /** Recent themes + headlines the new concept must not resemble. */
  avoid: string[];
}): Promise<AmbientScript> {
  const { prisma } = await import("@/lib/prisma");

  const avoidBlock =
    input.avoid.length > 0
      ? `\n\nDo NOT reuse or closely resemble any of these recent concepts and headlines:\n${input.avoid.map((a) => `- ${a}`).join("\n")}`
      : "";

  const userPrompt = `Write one new calm-video script for this audience.${avoidBlock}

Return ONLY valid JSON.`;

  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 900,
      system: AMBIENT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const durationMs = Date.now() - start;
    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    await prisma.claudeCallLog.create({
      data: {
        purpose: "ambient-video-script",
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
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    const script = typeof parsed.script === "string" ? parsed.script.trim() : "";
    const visual = typeof parsed.visual === "string" ? parsed.visual.trim() : "";
    if (script.split(/\s+/).length < 30 || !visual) {
      throw new Error("Ambient script returned an unusable script/visual");
    }

    const title =
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim().slice(0, 80)
        : script.split(/[.!?]/)[0].slice(0, 60);
    return {
      theme:
        typeof parsed.theme === "string" && parsed.theme.trim()
          ? parsed.theme.trim()
          : title,
      title,
      script,
      visual,
      motion:
        typeof parsed.motion === "string" && parsed.motion.trim()
          ? parsed.motion.trim()
          : "clouds drift slowly and the light shifts softly",
      captionHook:
        typeof parsed.captionHook === "string" ? parsed.captionHook.trim() : undefined,
      commentPrompt:
        typeof parsed.commentPrompt === "string" ? parsed.commentPrompt.trim() : undefined,
    };
  } catch (err) {
    await prisma.claudeCallLog.create({
      data: {
        purpose: "ambient-video-script",
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
 * Image prompt for the single ambient scene. Deliberately NOT the brand's
 * illustrated STYLE_LANES look — this format lives on photoreal, cinematic
 * nature footage (the reference posts use real cloud/sky video).
 */
export function buildAmbientImagePrompt(script: Pick<AmbientScript, "visual">): string {
  return [
    `Breathtaking photorealistic cinematic photograph: ${script.visual}`,
    "Shot on a full-frame camera, rich natural color grading, soft gradients, immense depth and atmosphere. Serene, calming, awe-inspiring.",
    "Vertical 9:16 composition with a calm, uncluttered middle third of the frame.",
    "NO people, NO animals, NO buildings in focus unless the scene requires distant lights.",
    "Absolutely NO text, letters, words, numbers, logos, or watermarks anywhere in the image.",
  ].join("\n");
}

/**
 * Image-to-video prompt for the ambient clip: only slow, continuous,
 * loop-friendly environmental motion. Same positive-only style as the
 * other i2v prompts (negatives invite the model to do the thing).
 */
export function buildAmbientVideoPrompt(script: Pick<AmbientScript, "motion">): string {
  return [
    `The scene breathes in slow motion: ${script.motion}.`,
    "Everything moves gently, continuously, and evenly — the movement at the last frame matches the first frame so the clip can loop seamlessly.",
    "Fixed, locked camera. Same scene, same colors, same framing from first frame to last.",
    "Crisp, sharp, high-definition cinematic footage with steady soft lighting and clean detail throughout.",
  ].join(" ");
}

/**
 * Loop one short clip into a video trimmed to exactly `targetSec`.
 * Uses stitchClipsWithCrossfade (xfade verified on the prod
 * ffmpeg-static binary 2026-08-16) so the loop point reads as a soft
 * dissolve instead of a hard reset; the trim rides along in the same
 * encode via trimToSec — a single encode pass, because two back-to-back
 * encodes blew Vercel's 300s limit (2026-08-18). `reverse` is
 * deliberately avoided — it buffers every frame in memory and is
 * unverified on prod.
 */
export async function loopClipToDuration(clip: Buffer, targetSec: number): Promise<Buffer> {
  const { probeMediaDuration, stitchClipsWithCrossfade, fitClipToDuration } =
    await import("./story-video");
  const clipSec = await probeMediaDuration(clip, "mp4");
  if (clipSec <= 0.5) throw new Error(`Ambient clip is only ${clipSec.toFixed(2)}s`);

  const XFADE_SEC = 0.6;
  // Each additional copy adds (clipSec - xfade) of runtime.
  const copies = Math.max(
    1,
    1 + Math.ceil((targetSec - clipSec) / Math.max(0.5, clipSec - XFADE_SEC))
  );
  if (copies === 1 && clipSec >= targetSec) {
    return fitClipToDuration(clip, targetSec);
  }
  // Trim happens inside the stitch encode (2026-08-18): stitching and
  // then re-encoding again via fitClipToDuration doubled the encode
  // time and blew Vercel's 300s function limit.
  return stitchClipsWithCrossfade(
    Array.from({ length: copies }, () => clip),
    { crossfadeSec: XFADE_SEC, trimToSec: targetSec }
  );
}

/**
 * Keenan's picked calm voices (2026-08-18) — both added to My Voices in
 * the ElevenLabs account. Each ambient post picks one at random;
 * AMBIENT_ELEVENLABS_VOICE_ID forces a single voice if set.
 */
const AMBIENT_VOICES = [
  "8DzKSPdgEQPaK5vKG0Rs", // Vanessa - Beach Girl
  "WAhoMTNdLdMoq1j3wf3I", // Hope - Smooth, Engaging and Kind
];

/**
 * Voice settings for the calm read. Higher stability + lower style than
 * the story read = steady, meditative delivery instead of emotional
 * confession.
 */
export function ambientVoiceoverOptions(): VoiceoverOptions {
  return {
    voiceId:
      process.env.AMBIENT_ELEVENLABS_VOICE_ID ||
      AMBIENT_VOICES[Math.floor(Math.random() * AMBIENT_VOICES.length)],
    voiceSettings: {
      stability: 0.65,
      similarity_boost: 0.8,
      style: 0.2,
      use_speaker_boost: true,
    },
    openaiInstructions:
      "You are a warm, unhurried female narrator guiding a quiet moment of reflection. Speak slowly and evenly, voice low and soft, with long natural pauses at punctuation. Calm, grounded, soothing — like a meditation guide who never performs. Never chipper, never announcer-like, never rushed.",
  };
}
