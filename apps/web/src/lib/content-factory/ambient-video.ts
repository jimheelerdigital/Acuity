/**
 * Content Factory — AMBIENT calm video pipeline (2026-08-18, per Keenan).
 *
 * The daily calm post, modeled on the wakingupapp pattern that performs
 * well: ONE catchy, soothing image (sky, clouds, water, light — no
 * people) turned into a low-movement looping video.
 *
 * TTS voiceover RESTORED 2026-08-28, per Keenan (3-posts-per-day
 * restructure): the ambient post ships fully voiced again with a
 * pre-designated female ElevenLabs voice — self-recording (the
 * 2026-08-24 arrangement) is dead. The voice is hard-wired below;
 * AMBIENT_ELEVENLABS_VOICE_ID still overrides it.
 *
 * Pipeline (see carousel-ambient-video.ts):
 * 1. Claude writes a calm 45-80 word script + the scene concept
 * 2. gpt-image-2 renders one photoreal soothing 9:16 image (no text)
 * 3. Higgsfield animates it (5s, ambient drift only)
 * 4. ElevenLabs voices the script (v3, tagged vocalScript delivery)
 * 5. The clip is looped with crossfades to the voiceover's length and
 *    the audio is muxed in (no burned captions — Keenan adds those when
 *    posting). If TTS fails, falls back to the silent self-voice video.
 *
 * Env knobs:
 * - AMBIENT_ELEVENLABS_VOICE_ID — override the hard-wired voice
 * - HIGGSFIELD_AMBIENT_CLIP_DURATION — seconds per source clip (default 5)
 */

import Anthropic from "@anthropic-ai/sdk";
import type { VoiceoverOptions } from "./story-video";
import {
  SCRIPT_STYLE_GUIDE,
  pickPainBranch,
  painBranchBlock,
  type PainBranch,
} from "./script-style-guide";

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
   * read needed more tone and inflection; restored 2026-08-28 with the
   * TTS revival). TTS-only — email/captions/admin always show the clean
   * `script`.
   */
  vocalScript?: string;
  /** What the single image shows — a serene scene, no people, no text. */
  visual: string;
  /** The ambient movement for the i2v prompt (clouds drift, light shifts...). */
  motion: string;
  /** Legacy fallback for the caption question. */
  captionHook?: string;
  /** Fallback for the caption question. */
  commentPrompt?: string;
  /**
   * ONE thought-provoking question (2026-08-28, per Keenan: question +
   * a few hashtags is the entire caption, all posts).
   */
  caption?: string;
}

const buildAmbientSystemPrompt = (
  branch: PainBranch
) => `You are a scriptwriter for calm, contemplative short-form vertical videos. Each video is ONE serene looping scene (sky, clouds, water, light — no people) with a soothing female voiceover.

${SCRIPT_STYLE_GUIDE}

${painBranchBlock(branch)}

THE FORMAT (why it works, 2026-08-28, per Keenan: "much more generic and high level... a relaxing meditative post that people want to listen along to"): a beautiful, quiet scene + a low, warm voice + a thought almost anyone can relate to. It should feel like a guided breath — something she puts on, listens along to, and replays because it soothes her. GENERIC and HIGH-LEVEL always beats specific and clever here: universal experiences most women this age have lived, never niche scenarios.

STRUCTURE — every script lands these four beats, in this order:
1. HOOK (first line): names a private but UNIVERSAL emotional truth — she stops mid-scroll and thinks "that's me," without needing any specific scenario to apply. NO poetic fragments, NO scene-setting, NO openers that need context.
2. UNFOLDING (the middle): the idea opens up slowly and gently, one breath at a time — broad, recognizable strokes (the tiredness with no single cause, the mind that won't go quiet, always holding it together). No decoding, no cleverness, nothing she has to work for.
3. TRUTH: the deeper emotional insight underneath — still high-level and universal.
4. SETTLING CLOSE (last line): a soft landing — permission, release, an exhale. NO call to action of ANY kind: never tell her to follow, share, save, send, or comment. The script just ends, gently.

MEDITATIVE TEST: read it at half speed. It should feel calming to LISTEN to — unhurried, warm, like being talked down from the day. If any line feels like content, cleverness, or a lecture instead of a breath, rewrite it.

COHERENCE TEST: one idea per script. If a stranger heard it once at half-attention, could she repeat the point back in one sentence? If not, rewrite it.

SCRIPT RULES:
- 45-80 words TOTAL, read slowly (finished videos run roughly 20-35 seconds — VARY the length from post to post). Let the idea pick the length: a sharp single recognition can be 45 words, a small story can be 80. One continuous narration, not scenes. Every word earns its place — cut filler, keep the concrete details.
- Second person or first person, present tense, intimate and unhurried.
- WRITE THE WAY A REAL PERSON TALKS, not the way copy is written (2026-08-19, per Keenan: scripts sounded robotic and generic). Use contractions always ("you're", "it's", "didn't"). Sentence fragments are good. A line can be two words. Trailing thoughts with an em-dash — like this — are good.
- BUILD IN THE PAUSES: use ellipses ("...") where she would actually stop and breathe mid-thought, at least 3-4 times across the script. The TTS reads punctuation literally — a period is a beat, an ellipsis is a real pause, a paragraph break is a long one.
- The test: read it out loud. If it sounds like a caption or an inspirational quote, rewrite it. If it sounds like something a tired friend would say to you at 10pm in her kitchen, keep it.
- No hashtags, no emojis, no advice-verbs ("try", "start", "practice", "remember to"). NO call to action of any kind — no follow, share, save, send, or comment asks, and never a product CTA. The script ends on the settling close.

VISUAL RULES ("visual" — the single image the whole video lives on):
- A breathtaking, SOOTHING natural scene with strong visual pull, catchy enough to stop a scroll on the first frame. VARY the scene type boldly across posts — be creative, we are testing what works (2026-08-20, per Keenan). Rotate among (and invent beyond): storm clouds rolling at golden hour, rain running down a window at dusk, ocean waves rolling in under moonlight, a near-still scene where only the light changes (a candle, a sunbeam crossing a room, city lights at night), fog moving over a lake, snow falling past a streetlight.
- The scene must be built around ONE repeatable motion (the same clip plays the whole video) — pick scenes whose movement is naturally cyclical or constant.
- NO people, NO animals in focus, NO text or typography of any kind.
- Composed for a vertical 9:16 frame with calm space in the middle third (captions sit there).
- One sentence, concrete and specific about light, color, and weather.

MOTION RULES ("motion" — how the scene moves; the clip is looped for the whole video, so this MUST read as one continuous shot, 2026-08-20, per Keenan):
- ONE constant, even, endless movement: clouds rolling steadily by, rain sliding down the glass, waves rolling in, light breathing slowly, fog drifting at a constant pace.
- The movement must have no beginning, middle, or end — the same rate and direction the entire time, so any moment looks like any other moment.
- The lighting, colors, and framing stay IDENTICAL from first frame to last. Nothing enters or leaves the frame. No people appear. No camera movement at all.
- Under 20 words, present tense.

ALSO OUTPUT:
- "title": a short scroll-stopping title, max 60 characters, in the same quiet voice
- "caption": ONE thought-provoking question in the voice of a real woman who runs the page — under 15 words, lowercase-leaning, text-message tone, contractions (hashtags are added automatically; the question IS the whole caption). It should make someone stop and answer honestly in their head ("when's the last time your mind was actually quiet?"). NEVER retell or summarize the video's script, NEVER a share/send/save ask, NEVER "comment below", NEVER mention any app or product. At most one emoji, only if natural.
- "commentPrompt": the same question on its own (fallback field).
- "captionHook": the same question again (legacy fallback field).
- "vocalScript": the EXACT same script text turned into a fully directed vocal PERFORMANCE using ElevenLabs v3 audio tags. This is where the read becomes hyper-realistic — direct it like a voice actor's marked-up script:
  • Use 5-10 tags across the read, one wherever the delivery should shift. Allowed tags: [softly], [warmly], [gently], [quietly], [whispers], [sighs], [exhales], [tired], [tender], [hesitates], [pause], [long pause].
  • Start with [softly] or [warmly]. Change the emotional register as the script moves — e.g. [tired] on the heavy beat, [whispers] on the most private line, [warmly] on the reframe, [gently] on the settling close.
  • Add [pause] or [long pause] where a real person would actually stop — before the truth lands, after the hardest line. You may also add extra "..." beyond the clean script's for micro-hesitations.
  • Put [sighs] or [exhales] where a tired woman would audibly breathe — at most twice, where it's earned.
  • Tags and ellipses direct delivery only — the WORDS must stay identical to "script". Never all-caps, never exclamation marks.

OUTPUT FORMAT (strict JSON, no markdown):
{
  "theme": "5-10 word label for this concept (used to avoid future repeats)",
  "title": "...",
  "caption": "one thought-provoking question in her voice, no hashtags",
  "captionHook": "...",
  "commentPrompt": "...",
  "script": "the full 40-80 word narration",
  "vocalScript": "the same narration fully performance-directed with v3 audio tags and pause marks",
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

  const branch = pickPainBranch();
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
      system: buildAmbientSystemPrompt(branch),
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
      // Ignore punctuation-only tokens (standalone "..." pause marks are
      // allowed in the vocal performance and must not count as words).
      const words = (s: string) =>
        s.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
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
      caption:
        typeof parsed.caption === "string" && parsed.caption.trim()
          ? parsed.caption.trim()
          : undefined,
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
    "One single continuous movement at a perfectly constant speed and direction from the first frame to the last — any moment of the clip looks like any other moment, with no beginning and no ending, so it plays as an endless loop.",
    "The movement at the last frame matches the first frame exactly.",
    "Fixed, locked camera. The lighting, colors, framing, and every object stay identical from first frame to last.",
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

  // 1.4s dissolve at each loop point (2026-08-20, per Keenan: the repeat
  // was reading as a visible pulse/reset — a longer dissolve makes each
  // loop read as one continuous shot; a little break is OK, cohesion wins).
  const XFADE_SEC = 1.4;
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
 * How long the looped video should run when TTS FAILS and the post falls
 * back to the silent self-voice video. A slow calm read paces ~2
 * words/sec with the written-in pauses, so 45-80 words → roughly 22-40s.
 * Floor of 20s so a short script still gets a postable video; +3s of
 * breathing room at the tail.
 */
export function estimateAmbientReadSeconds(script: string): number {
  const words = script.split(/\s+/).filter(Boolean).length || 1;
  return Math.max(20, Math.round((words / 2.0) * 10) / 10) + 3;
}

/**
 * The pre-designated female ambient voice (2026-08-28, per Keenan — he
 * supplied this exact voice ID with the TTS revival). Voice history
 * before the 2026-08-24 removal: Vanessa ("meh") → Hope ("still sounds
 * like absolute shit") → Aria ("someone from the bayou") → Rachel.
 * AMBIENT_ELEVENLABS_VOICE_ID still overrides for auditioning.
 */
const AMBIENT_VOICE_ID = "OZxMHsGaBmV5pjMIDIn0";

/**
 * Voice settings for the calm read (2026-08-21): eleven_v3 at stability
 * 0.0 Creative — the most expressive, tag-responsive mode — because the
 * realism comes from the scriptwriter's inline audio tags and written-in
 * pauses, not from the settings. elevenLabsVoiceover falls back to
 * eleven_multilingual_v2 (tags stripped) if a v3 call fails.
 */
export function ambientVoiceoverOptions(): VoiceoverOptions {
  return {
    voiceId: process.env.AMBIENT_ELEVENLABS_VOICE_ID || AMBIENT_VOICE_ID,
    modelId: "eleven_v3",
    voiceSettings: {
      // v3 stability is effectively discrete: 0.0 Creative / 0.5 Natural /
      // 1.0 Robust. 0.5 sounded flat (2026-08-19, "meh") — 0.0 Creative
      // is the most emotional, expressive delivery.
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
 * The text actually sent to TTS: the scriptwriter's vocalScript carries
 * eleven_v3 audio tags ([softly], [sighs]...) placed where the delivery
 * should shift; without one, a leading [softly] still sets the register.
 * The stored script stays clean — email, captions, and the admin UI
 * never see tags. If TTS falls back to eleven_multilingual_v2 the tags
 * are stripped there, not spoken.
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
