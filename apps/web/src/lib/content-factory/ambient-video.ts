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
  /**
   * The same script with ElevenLabs v3 audio tags ([softly], [sighs]...)
   * placed by the scriptwriter for delivery (2026-08-19, per Keenan: the
   * read needed more tone and inflection). TTS-only — email/captions/admin
   * always show the clean `script`.
   */
  vocalScript?: string;
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

THE GOAL (2026-08-19, per Keenan): build a devoted following of this audience. This is NOT an ad and NOT app promotion — success is her sending the video to a friend, tagging her sister, or saving it for a hard day. Optimize every choice for VIRALITY and RELATABILITY: pick the most universally relatable version of every idea — moments most women this age have actually lived, not niche or clever ones.

BRAND VOICE — MIRROR, NOT A COACH: reflect, don't advise. Name what is true about her inner life so precisely that she feels understood. You may end on a gentle reframe or a question she can sit with, but NEVER instructions, steps, tips, or "you should". No app, product, or brand mention anywhere in the script — the account posting it carries the brand.

THE FORMAT (why it works): a beautiful, quiet scene + a low, warm voice + a thought that lands. Reference example of the register (do not copy): "How long must you spend locked in the prison of a negative emotion? Not a moment longer than you want to." Yours should be gentler and more reflective than that — a small story, an observation, or a truth about the weight she carries.

STRUCTURE — every script follows this exact arc, in order (2026-08-19, per Keenan: earlier scripts read as vague poetry that "made little to no sense"):
1. HOOK (first 1-2 lines): a direct question to her, OR a bold statement she might briefly disagree with. It must make her stop mid-scroll and think "wait — that's me." Examples of the shape (do not copy): "When did you stop planning things that were just for you?" / "You're not tired. You're unwitnessed." NO poetic fragments, NO scene-setting, NO openers that need context she doesn't have yet.
2. CONTEXT (the middle): explain the hook with concrete, relatable moments from her real life — the calendar full of everyone else's appointments, the car as the only quiet room, answering "I'm fine" on autopilot. Every line follows logically from the one before. She should NEVER have to work to decode a metaphor.
3. RELEASE (last 1-2 lines): a recognition, a permission, or a question she could answer out loud.

COHERENCE TEST: one idea per script. If a stranger heard it once at half-attention, could she repeat the point back in one sentence? If not, rewrite it.

SCRIPT RULES:
- 70-90 words TOTAL, read slowly (~40 seconds). One continuous narration, not scenes.
- Second person or first person, present tense, intimate and unhurried.
- WRITE THE WAY A REAL PERSON TALKS, not the way copy is written (2026-08-19, per Keenan: scripts sounded robotic and generic). Use contractions always ("you're", "it's", "didn't"). Sentence fragments are good. A line can be two words. Trailing thoughts with an em-dash — like this — are good.
- BUILD IN THE PAUSES: use ellipses ("...") where she would actually stop and breathe mid-thought, at least 3-4 times across the script. The TTS reads punctuation literally — a period is a beat, an ellipsis is a real pause, a paragraph break is a long one.
- The test: read it out loud. If it sounds like a caption or an inspirational quote, rewrite it. If it sounds like something a tired friend would say to you at 10pm in her kitchen, keep it.
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
- "commentPrompt": one short question a real woman would ask a friend. It becomes the FIRST line of the post caption, so it must stop the scroll on its own. Plain words, no emoji, no "comment below" / "drop it in the comments" phrasing — the question itself is the invitation.
- "captionHook": 1-2 plain lines that follow the question in the caption. Simple and human, like a text message — not marketing copy. No emoji. Never repeats the script's first line or the question.
- "vocalScript": the EXACT same script text with 2-4 ElevenLabs v3 audio performance tags inserted in square brackets where the narrator's delivery should shift. Allowed tags ONLY: [softly], [whispers], [sighs], [exhales]. Start it with [softly]. Tags direct delivery — they never replace or change the words. Place them where a real person's voice would actually drop, catch, or breathe.

OUTPUT FORMAT (strict JSON, no markdown):
{
  "theme": "5-10 word label for this concept (used to avoid future repeats)",
  "title": "...",
  "captionHook": "...",
  "commentPrompt": "...",
  "script": "the full 70-90 word narration",
  "vocalScript": "the same narration with [softly]/[whispers]/[sighs]/[exhales] tags placed for delivery",
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

    // vocalScript must be the same words (tags aside) — if the model
    // paraphrased, fall back to the clean script rather than letting the
    // spoken words drift from the emailed/captioned ones.
    let vocalScript =
      typeof parsed.vocalScript === "string" ? parsed.vocalScript.trim() : undefined;
    if (vocalScript) {
      const stripped = vocalScript.replace(/\[[a-z][a-z ]*\]\s*/gi, "");
      const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
      if (Math.abs(words(stripped) - words(script)) > 5) {
        console.warn(
          "[ambient-video] vocalScript diverged from script — using untagged script"
        );
        vocalScript = undefined;
      }
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
      vocalScript,
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
 * Loop one short clip into a video AT LEAST `targetSec` long.
 * Uses stitchClipsWithCrossfade (xfade verified on the prod
 * ffmpeg-static binary 2026-08-16) so each loop point reads as a soft
 * dissolve instead of a hard reset. One encode pass — two back-to-back
 * encodes blew Vercel's 300s limit (2026-08-18). `reverse` is
 * deliberately avoided — it buffers every frame in memory and is
 * unverified on prod.
 *
 * NOT trimmed and NO edge fades (2026-08-19, per Keenan: the video must
 * loop cleanly). The source clip is prompted so its last frame matches
 * its first, so ending exactly at a copy boundary makes the posted
 * video's end flow back into its start. A mid-copy trim or a
 * fade-to-black would break that. The overshoot past the voiceover is
 * at most one clip length (~4.4s of quiet tail).
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
  // maxrate 5M (2026-08-19): this stitch IS the final encode for voiced
  // calm videos (the mux stream-copies it). An unconstrained crf 18 on a
  // noisy scene hit 52.6MB → Supabase's 50MB global upload cap 413'd it
  // and the run died. 5 Mbps bounds a 40s video to ~25MB — under both
  // the upload cap and the 28MB email attachment cap — and IG/TikTok
  // recompress to about that bitrate anyway.
  return stitchClipsWithCrossfade(
    Array.from({ length: copies }, () => clip),
    { crossfadeSec: XFADE_SEC, noEdgeFades: true, maxrate: "5M" }
  );
}

/**
 * Keenan's calm voice (2026-08-19): Hope only. Vanessa (8DzKSPdgEQPaK5vKG0Rs)
 * was dropped after he heard her on the 08-19 video and called the voice
 * "meh". AMBIENT_ELEVENLABS_VOICE_ID still forces any voice if set.
 */
const AMBIENT_VOICES = [
  "WAhoMTNdLdMoq1j3wf3I", // Hope - Smooth, Engaging and Kind
];

/**
 * Voice settings for the calm read. Moved to eleven_v3 2026-08-19 (per
 * Keenan, second retune: the read still needed more tone and
 * inflection — "more realistic and engaging"). v3 is ElevenLabs'
 * expressive model and reads punctuation (ellipses, em-dashes,
 * paragraph breaks) as real prosody instead of flattening it; verified
 * live against the account 2026-08-19 with these exact settings.
 * elevenLabsVoiceover falls back to eleven_multilingual_v2 if a v3
 * call fails.
 */
export function ambientVoiceoverOptions(): VoiceoverOptions {
  return {
    voiceId:
      process.env.AMBIENT_ELEVENLABS_VOICE_ID ||
      AMBIENT_VOICES[Math.floor(Math.random() * AMBIENT_VOICES.length)],
    modelId: "eleven_v3",
    voiceSettings: {
      // v3 stability is effectively discrete: 0.0 Creative / 0.5 Natural /
      // 1.0 Robust. 0.5 still sounded flat to Keenan (2026-08-19, "meh")
      // — 0.0 Creative is the most emotional, expressive delivery.
      // Verified live on Hope with inline tags (HTTP 200).
      stability: 0.0,
      similarity_boost: 0.8,
      style: 0.5,
      use_speaker_boost: true,
      speed: 0.85,
    },
    openaiInstructions:
      "You are a warm, unhurried female narrator guiding a quiet moment of reflection. Speak slowly and evenly, voice low and soft, with long natural pauses at punctuation. Calm, grounded, soothing — like a meditation guide who never performs. Never chipper, never announcer-like, never rushed.",
  };
}

/**
 * The text actually sent to TTS (2026-08-19): the scriptwriter's
 * vocalScript carries eleven_v3 audio tags ([softly], [sighs]...) placed
 * where the delivery should shift; without one, a leading [softly] still
 * sets the register. The stored script stays clean — email, captions,
 * and the admin UI never see tags. If TTS falls back to
 * eleven_multilingual_v2 the tags are stripped there, not spoken.
 */
export function ambientTtsText(
  script: Pick<AmbientScript, "script" | "vocalScript">
): string {
  if (script.vocalScript) {
    return /^\s*\[/.test(script.vocalScript)
      ? script.vocalScript
      : `[softly] ${script.vocalScript}`;
  }
  return `[softly] ${script.script}`;
}
