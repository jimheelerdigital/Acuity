/**
 * Content Factory — 30-second story video pipeline (2026-08-11).
 *
 * Alongside each daily carousel post, a standalone vertical video is produced:
 * 1. Claude invents its OWN viral story concept for the demographic —
 *    fully independent of the carousel's headline/reasons (2026-08-12,
 *    per Keenan) — and writes a ~30s 6-scene script (narration + visual
 *    direction + safe micro-motion per scene), deduped against recent
 *    themes/headlines via CarouselPost.storyTheme
 * 2. gpt-image-2 renders 6 text-free scene images — scene 1 from text,
 *    scenes 2-6 via images.edit against scene 1's render so she is the
 *    SAME woman throughout (2026-08-16, per Keenan)
 * 3. Higgsfield animates each image with the current i2v model
 * 4. Each scene's narration line is voiced separately (per-scene TTS)
 *    and its clip is cut/extended to that audio's exact length
 * 5. Clips and per-scene audio are concatenated in lockstep (0.35s gap
 *    after each line) so every word plays on its own scene
 * 6. Captions come straight from the script text, chunked 3-4 words and
 *    timed over each scene's measured audio, then muxed in as PNGs
 * 7. The finished MP4 is emailed to Keenan, ready to post
 *
 * VOICEOVER NOTE: the Higgsfield *platform* API has no text-to-speech
 * endpoint (verified against their full OpenAPI spec 2026-08-11 — only
 * image and image-to-video models exist). The voiceover therefore uses
 * OpenAI TTS with the key we already have for gpt-image-2. Env knobs:
 * - STORY_TTS_MODEL (default "gpt-4o-mini-tts")
 * - STORY_TTS_VOICE (default "sage" — warm female voice)
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
import { isMood, type Mood, MOOD_EXPRESSIONS, VISUAL_DNA_NOTEXT, STYLE_LANES, type StyleLane } from "./brand";
import { isSafeMotion } from "./animate-cover";

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
  /** Short label of the concept — persisted so future scripts avoid repeats. */
  theme: string;
  scenes: StoryScene[];
  mood?: Mood;
  /** Short scroll-stopping title for the post (admin/email/caption). */
  title: string;
  /** 1-2 caption lines that tee up the video, same voice. */
  captionHook?: string;
  /** One question inviting viewers to share their version. */
  commentPrompt?: string;
}

const SCRIPT_SYSTEM_PROMPT = `You are a short-form viral video scriptwriter for Ripple, an AI-powered voice self-reflection app. You invent an ORIGINAL ~30-second vertical story video with a voiceover. This is a STANDALONE piece — it is not based on any other post. You choose the concept.

TARGET AUDIENCE: Women aged 40-50 carrying a heavy mental load — work, family, aging parents, invisible labor. They are capable, busy, reflective women who want to feel SEEN, not lectured. BRAND VOICE: mirror, not a coach — reflect, don't advise. Warm but honest. US English spelling.

YOUR JOB: invent ONE hyper-specific, emotionally true concept this audience would watch to the end, send to a friend with "this is me", and comment on. NOT a listicle read aloud — a tiny story, confession, or recognition with a beginning, middle, and landing.

CONCEPT FORMATS (pick whichever fits your idea best — vary across days, never repeat a recent theme):
- The confession: a private truth she'd never say out loud ("I love my family. And some days I fantasize about a hotel room, alone, with nobody needing me.")
- The specific moment: one tiny real scene told in detail — sitting in the car in the driveway an extra five minutes, the 3am ceiling stare, re-reading a text she never sent.
- The invisible tribute: everything she did today that nobody saw, finally made visible and named.
- The pattern: a behavior she'll recognize with a jolt ("You rehearse conversations that are never going to happen.")
- The permission: the thing she's been waiting her whole adult life for someone to tell her she's allowed to do.

VIRALITY RULES:
- Scene 1's narration is the HOOK — the first two seconds decide everything. Open mid-thought with a line too specific to scroll past ("You've answered 'what's for dinner' every night for eleven years."). Never open with a greeting or a setup.
- Escalate: every scene gets more specific or more vulnerable than the one before, so she has to keep watching to see where it lands.
- Scene 6 is the landing: the emotional release or recognition — the exhale. The story IS the whole video (2026-08-14, per Keenan: these are viral videos, not ads) — NEVER mention Ripple, any app, or any product in the narration. The account posting it carries the brand; the script never sells.
- Specificity is the whole game. "The permission slip you signed at a red light" beats "you're always busy" every single time. Concrete objects, real times of day, exact phrases she's actually said.

NARRATION RULES:
- TOTAL narration across all 6 scenes: 65-80 words (that is ~30 seconds spoken at a calm pace). Each scene's line is ~10-14 words.
- Second person, present tense, intimate — like a voice memo from someone who gets it.
- Every line must read as natural spoken English — if a line needs a second read to parse, rewrite it.
- No hashtags, no emojis, no "hey guys", no CTA of any kind, no app or brand mentions.

VISUAL RULES (each scene becomes ONE illustrated image of the same woman):
- "visual": one sentence describing the scene — the same woman (~40s) shown in the EXACT moment the narration describes. HARD RULE (2026-08-16, per Keenan: image, words, and motion must all be the same beat): every object, place, and action the narration mentions appears in the image — if the line mentions a phone, the phone is in her hands; if it's the driveway, she's in the parked car. Never a generic "woman in a room" while the narration talks about something else. No text in the image, no other adults in focus.
- COHERENCE CHECK before you output: for each scene, narration + visual + motion must all describe the SAME moment — if any one of the three could belong to a different scene, rewrite it.
- Every scene must be visually DIFFERENT (kitchen, car, hallway, bedroom, porch, bathroom mirror, sofa...) — EXCEPT scene 6.
- LOOP RULE: scene 6 returns to the SAME setting, framing, and composition as scene 1 (the only allowed repeat) — just calmer, resolved. The video's last frame should flow seamlessly back into its first frame so rewatches feel intentional.
- She is always fully clothed and NEVER inside a bathtub or shower. Bathroom scenes show her at the mirror or sitting on the closed edge of the tub. She is always already settled in a stable seated or standing position that she can hold for the whole clip.

MOTION RULES (each image is animated for a few seconds — the character's movement; 2026-08-16, per Keenan: the motion MUST act out that scene's narration, not a generic idle):
- "motion": the physical action that VISIBLY performs this scene's narration line. If the narration says she reads the text again, her eyes drop to the phone in her hands; if she can't say the words, her lips press shut and her jaw works. The viewer must see the story happening.
- Present tense, continuation of "She ..." (e.g. "grips the steering wheel tighter, then lets her hands fall to her lap with a shaking exhale").
- She stays in the same spot and pose, lips closed — no talking, no walking, no standing up, no turning around, no camera directions. She may interact with objects the "visual" already shows (phone, mug, wheel, letter) but no NEW props appear.
- Make it emotionally unmistakable — real feeling in the face and hands, not just breathing. Under 25 words.

MOOD: every scene gets a "mood" from: "heavy", "tender", "wry", "frustrated", "hopeful". The arc usually moves heavy/frustrated → tender → hopeful by scene 6. Faces must match — never default to smiling.

ALSO OUTPUT (for the post wrapped around the video):
- "title": a short scroll-stopping title for this story, max 60 characters, in her voice — NOT a numbered-listicle format ("The 11 minutes I spent in my own driveway")
- "captionHook": 1-2 caption lines that tee up the video without spoiling the turn
- "commentPrompt": one question inviting viewers to share their version of this moment ("Where do you hide when the house is full?")

OUTPUT FORMAT (strict JSON, no markdown):
{
  "theme": "5-10 word label for this concept (used to avoid future repeats)",
  "title": "...",
  "captionHook": "...",
  "commentPrompt": "...",
  "mood": "dominant mood of the whole video",
  "scenes": [
    { "narration": "...", "visual": "...", "motion": "...", "mood": "..." },
    ... exactly 6 scenes ...
  ]
}`;

/**
 * Invent a standalone ~30s story concept and write its 6-scene script
 * (2026-08-12, per Keenan: fully independent of the carousel — its own
 * viral idea every time, deduped against recent themes and headlines).
 * Logs the Claude call to ClaudeCallLog like the topic generator.
 */
export async function generateStoryScript(input: {
  /** Recent story themes + carousel headlines the new concept must not resemble. */
  avoid: string[];
}): Promise<StoryScript> {
  const { prisma } = await import("@/lib/prisma");

  const avoidBlock =
    input.avoid.length > 0
      ? `\n\nDo NOT reuse or closely resemble any of these recent concepts and headlines:\n${input.avoid.map((a) => `- ${a}`).join("\n")}`
      : "";

  const userPrompt = `Invent one new standalone story video concept for this audience and write the 6-scene, ~30-second script.${avoidBlock}

Return ONLY valid JSON.`;

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
      theme?: unknown;
      title?: unknown;
      captionHook?: unknown;
      commentPrompt?: unknown;
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

    // 2026-08-16, per Keenan: a motion that trips the i2v safety filter
    // used to be silently swapped for a RANDOM mood-pool gesture at
    // submit time — the animation stopped matching the story. Now unsafe
    // motions are rewritten HERE into a safe gesture that still acts out
    // that scene's narration; the pool is only the last resort.
    await rewriteUnsafeMotions(scenes);

    const theme =
      typeof parsed.theme === "string" && parsed.theme.trim()
        ? parsed.theme.trim()
        : scenes[0].narration.slice(0, 80);
    const title =
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim().slice(0, 80)
        : scenes[0].narration.slice(0, 60);

    return {
      theme,
      scenes,
      mood: isMood(parsed.mood) ? parsed.mood : undefined,
      title,
      captionHook:
        typeof parsed.captionHook === "string" ? parsed.captionHook.trim() : undefined,
      commentPrompt:
        typeof parsed.commentPrompt === "string" ? parsed.commentPrompt.trim() : undefined,
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
 * Rewrite motions that trip the i2v safety filter into safe gestures
 * that still act out their scene's narration. Mutates `scenes` in place;
 * a failed call or a still-unsafe rewrite leaves the motion untouched
 * (the submit-time pool fallback remains the last resort). One Claude
 * call covers all unsafe scenes.
 */
async function rewriteUnsafeMotions(scenes: StoryScene[]): Promise<void> {
  const unsafe = scenes
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.motion && !isSafeMotion(s.motion));
  if (unsafe.length === 0) return;
  console.warn(
    `[story-video] ${unsafe.length} scene motion(s) tripped the safety filter — rewriting: ${unsafe
      .map(({ i, s }) => `#${i} "${s.motion}"`)
      .join("; ")}`
  );
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `These video-scene motions were rejected because they contain movement a locked-in-place character can't do (walking, standing up, turning around, talking, camera moves, doors/windows). Rewrite each into a gesture that still ACTS OUT its narration line while she stays in the same spot and pose, lips closed — only her face, eyes, head, shoulders, hands, breath, and objects already in the scene. Under 20 words each, present tense, continuation of "She ...".

${unsafe.map(({ s }, k) => `${k + 1}. narration: "${s.narration}"\n   rejected motion: "${s.motion}"`).join("\n")}

Return ONLY a JSON array of ${unsafe.length} rewritten motion strings, in order.`,
        },
      ],
    });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const arr = JSON.parse(
      text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    ) as unknown[];
    unsafe.forEach(({ s, i }, k) => {
      const m = arr[k];
      if (isSafeMotion(m)) {
        console.log(`[story-video] Scene ${i} motion rewritten: "${m}"`);
        s.motion = m.trim();
      } else {
        console.warn(`[story-video] Scene ${i} rewrite still unsafe — leaving original`);
      }
    });
  } catch (err) {
    console.warn(
      `[story-video] Motion rewrite failed — keeping originals: ${err instanceof Error ? err.message : err}`
    );
  }
}

/** Calm spoken pace used to convert measured seconds into a word budget. */
const WORDS_PER_SECOND = 2.4;

// NOTE (2026-08-16, per Keenan): fitNarrationToDuration is GONE. It
// rewrote the six scene lines into one continuous monologue fitted to
// the stitched length — which is exactly why the words never lined up
// with the scenes. The pipeline is now per-scene synced: each scene's
// narration is voiced separately and its clip is cut to that audio.

/**
 * Image prompt for one story scene — mirrors the text-free branch of
 * buildImagePrompt (VISUAL_DNA_NOTEXT, no "slide"/"carousel" wording)
 * so the clips match the carousel's illustration language.
 */
export function buildStoryImagePrompt(opts: {
  lane: string;
  /** The story's own theme label (NOT the carousel headline). */
  theme: string;
  scene: StoryScene;
  sceneIndex: number;
  colorPrompt?: string;
  /**
   * True when the prompt goes to images.edit with scene 1's render as
   * the character reference (2026-08-16, per Keenan: she must be the
   * SAME woman in every scene).
   */
  withReference?: boolean;
}): string {
  const lanePrefix =
    opts.lane in STYLE_LANES ? STYLE_LANES[opts.lane as StyleLane] : STYLE_LANES.cinematicReal;
  const moodLine = isMood(opts.scene.mood) ? MOOD_EXPRESSIONS[opts.scene.mood] : "";
  return [
    opts.withReference
      ? `The woman in the reference image — keep her EXACT face, hairstyle, hair color, age, build, and outfit identical — now in a completely new scene and setting:`
      : "",
    lanePrefix,
    opts.colorPrompt ?? "",
    `An illustrated scene: ${opts.scene.visual}`,
    // NO rotating SCENE_SETTINGS hint here (removed 2026-08-13, per
    // Keenan: the hint injected a second, conflicting location into
    // almost every scene, so the video stopped matching the script).
    // The script's "visual" sentence is the single source of truth for
    // the setting — the prompt already forces one specific setting per
    // scene, so nothing else may contradict it.
    moodLine,
    `Mood context: ${opts.theme} — self-reflection and mental load, for women. The SAME woman appears in a series of scenes; keep her look consistent: ~40s, warm, natural.`,
    // 2026-08-16, per Keenan: rendered scenes showed her mid-speech with
    // her mouth open, plus stray rain/smoke overlays indoors. Both are
    // banned at the image level (the i2v model inherits whatever the
    // start frame shows, so this is where it must be enforced).
    `Her lips are gently closed — she is NOT talking, mouth shut, expression carried by her eyes and posture.`,
    `No rain, smoke, steam, fog, mist, sparkles, or floating particles anywhere unless the scene description explicitly mentions them.`,
    VISUAL_DNA_NOTEXT,
  ].filter(Boolean).join("\n");
}

/** Context lines for per-scene TTS so prosody flows across scene cuts. */
export interface VoiceoverContext {
  previousText?: string;
  nextText?: string;
}

/**
 * Per-call voice overrides (2026-08-18): the AMBIENT calm-video pipeline
 * uses a dedicated soothing voice + steadier delivery settings without
 * touching the story pipeline's expressive defaults.
 */
export interface VoiceoverOptions {
  /** ElevenLabs voice ID override (defaults to ELEVENLABS_VOICE_ID / Matilda). */
  voiceId?: string;
  /** ElevenLabs voice_settings override. */
  voiceSettings?: {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
    /** Playback speed 0.7–1.2 (ElevenLabs), e.g. 0.85 for a slower calm read. */
    speed?: number;
  };
  /** OpenAI TTS fallback style instructions override. */
  openaiInstructions?: string;
}

/**
 * ElevenLabs TTS (2026-08-12, per Keenan: the OpenAI voice sounded
 * robotic). Used whenever ELEVENLABS_API_KEY is set. Default voice is
 * "Matilda" (2026-08-16, per Keenan: Rachel still sounded terrible —
 * Matilda is ElevenLabs' warm, middle-aged narrative voice, the closest
 * premade fit for an intimate confession to women 40-50). Override with
 * ELEVENLABS_VOICE_ID after auditioning in their voice library.
 */
async function elevenLabsVoiceover(
  narration: string,
  apiKey: string,
  ctx?: VoiceoverContext,
  opts?: VoiceoverOptions
): Promise<Buffer> {
  const voiceId =
    opts?.voiceId || process.env.ELEVENLABS_VOICE_ID || "XrExE9yKIg1WjnnlVkGX"; // Matilda
  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: narration,
        model_id: modelId,
        // Per-scene synthesis: surrounding lines keep the intonation
        // continuous across scene boundaries.
        ...(ctx?.previousText ? { previous_text: ctx.previousText } : {}),
        ...(ctx?.nextText ? { next_text: ctx.nextText } : {}),
        // 2026-08-16, per Keenan: the read sounded flat/terrible. Lower
        // stability + higher style = far more expressive, emotional
        // delivery (the intimate confession tone the scripts are written
        // in), while similarity + speaker boost keep the voice grounded.
        voice_settings: opts?.voiceSettings ?? {
          stability: 0.35,
          similarity_boost: 0.8,
          style: 0.55,
          use_speaker_boost: true,
        },
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 5_000) {
    throw new Error(`ElevenLabs returned a suspiciously small file (${buffer.length} bytes)`);
  }
  return buffer;
}

/**
 * Synthesize a voiceover MP3 (per scene or full narration).
 * ElevenLabs when configured (far more natural), OpenAI TTS otherwise.
 * Returns which engine produced the audio so the email can report it —
 * 2026-08-16, per Keenan: the voice kept "sounding terrible" and we
 * couldn't tell whether he was hearing ElevenLabs or the fallback.
 * (Higgsfield's platform API exposes no TTS endpoint — see header note.)
 */
export async function generateVoiceover(
  narration: string,
  ctx?: VoiceoverContext,
  opts?: VoiceoverOptions
): Promise<{ audio: Buffer; engine: string }> {
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (elevenKey) {
    try {
      const audio = await elevenLabsVoiceover(narration, elevenKey, ctx, opts);
      const voiceId =
        opts?.voiceId || process.env.ELEVENLABS_VOICE_ID || "XrExE9yKIg1WjnnlVkGX";
      return { audio, engine: `elevenlabs:${voiceId}` };
    } catch (err) {
      console.error(
        `[story-video] ElevenLabs TTS failed — falling back to OpenAI: ${err instanceof Error ? err.message : err}`
      );
    }
  }
  // 2026-08-16, per Keenan: the "coral" fallback read sounded terrible —
  // switched to "sage" with much stronger emotional-delivery direction.
  const model = process.env.STORY_TTS_MODEL || "gpt-4o-mini-tts";
  const voice = process.env.STORY_TTS_VOICE || "sage";
  const res = await openai().audio.speech.create({
    model,
    voice,
    input: narration,
    response_format: "mp3",
    // gpt-4o-mini-tts supports style instructions; older models ignore it.
    instructions:
      opts?.openaiInstructions ??
      "You are a woman in her mid-40s confessing something true to her closest friend, late at night, voice low. Speak slowly with real emotional weight: let some sentences almost break, let others land flat and tired. Vary your pace — linger on the painful words, rush nothing. Breathe audibly between thoughts. Slightly husky, imperfect, human. Absolutely never chipper, never announcer-like, never smooth-podcast polished.",
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 5_000) {
    throw new Error(`TTS returned a suspiciously small file (${buffer.length} bytes)`);
  }
  return { audio: buffer, engine: `openai:${model}/${voice}` };
}

// ─── Burned-in captions (2026-08-12, per Keenan) ────────────────────────────
// Most viewers watch muted, so the script text is chunked into short,
// precisely-timed captions and burned into the video.

export interface CaptionChunk {
  text: string;
  /** Seconds, relative to the voiceover AUDIO (pre-tempo-fit). */
  start: number;
  end: number;
}

// NOTE (2026-08-16, per Keenan): transcribeCaptionChunks (whisper-1
// word timestamps) is GONE. Re-transcribing our own TTS audio garbled
// the words ("house wants To the") and the emotional read's pauses
// split captions into lone floating words. Captions now come straight
// from the script text via estimateCaptionChunks per scene.

/**
 * Build caption chunks straight from the narration TEXT when there is no
 * voiceover audio to transcribe (2026-08-13, per Keenan: a silent video
 * must still tell the story on screen). Words are grouped with the same
 * rules as the Whisper path (~3-4 words, ≤24 chars) and the video's
 * measured duration is distributed across chunks proportionally to their
 * character length — a close stand-in for spoken pacing. These captions
 * also work as a teleprompter when Keenan records the voiceover himself.
 */
export function estimateCaptionChunks(
  narration: string,
  durationSec: number
): CaptionChunk[] {
  const words = narration.split(/\s+/).filter(Boolean);
  if (words.length === 0 || !Number.isFinite(durationSec) || durationSec <= 0) {
    return [];
  }

  const texts: string[] = [];
  let cur: string[] = [];
  const flush = () => {
    if (cur.length === 0) return;
    texts.push(cur.join(" "));
    cur = [];
  };
  for (const w of words) {
    const chars = cur.reduce((n, x) => n + x.length + 1, 0);
    if (cur.length >= 4 || chars + w.length > 24) flush();
    cur.push(w);
    // Sentence-ending punctuation is a natural pause — break the chunk.
    if (/[.!?]$/.test(w)) flush();
  }
  flush();

  const totalChars = texts.reduce((n, t) => n + t.length, 0);
  const chunks: CaptionChunk[] = [];
  let t = 0;
  for (const text of texts) {
    const span = (text.length / totalChars) * durationSec;
    chunks.push({ text, start: t, end: t + span });
    t += span;
  }
  return chunks;
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
 * Render a static image as a silent MP4 clip of the given duration
 * (2026-08-13, per Keenan: the carousel compilation must contain EVERY
 * slide — when a slide's Higgsfield animation fails all retry waves, its
 * static JPEG becomes a still clip so the slideshow never skips a
 * reason). 1080x1920 @ 30fps to match stitchStoryVideo's normalization.
 */
export async function stillImageClip(image: Buffer, seconds: number): Promise<Buffer> {
  const bin = ffmpegPath();
  if (!bin) throw new Error("ffmpeg-static binary not found in this environment");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "still-clip-"));
  try {
    const inPath = path.join(dir, "in.jpg");
    const outPath = path.join(dir, "out.mp4");
    fs.writeFileSync(inPath, image);
    await runFfmpeg(bin, [
      "-y",
      "-loglevel", "warning",
      "-loop", "1",
      "-i", inPath,
      "-t", seconds.toFixed(2),
      "-vf", "scale=1080:1920:flags=lanczos,fps=30,setsar=1",
      "-c:v", "libx264",
      "-preset", "fast",
      // crf 18 (2026-08-16, per Keenan: clips pass through several x264
      // generations — fit → stitch → mux — and stacked crf-23 encodes
      // left the final video visibly soft).
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outPath,
    ]);
    const out = fs.readFileSync(outPath);
    if (out.length < 20_000) {
      throw new Error(`Still clip is suspiciously small (${out.length} bytes)`);
    }
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Fit a clip to an exact duration (2026-08-16, per Keenan: per-scene
 * narration sync — each scene's clip is cut to the length of its own
 * voiceover line). Longer clips are trimmed; shorter ones are extended
 * by freezing the last frame (extracted with -sseof and turned into a
 * still clip — reuses stillImageClip/stitch, whose filters are already
 * proven on the prod ffmpeg-static binary; tpad is deliberately avoided,
 * unverified there like drawtext was). Output is normalized 1080x1920@30.
 */
export async function fitClipToDuration(clip: Buffer, seconds: number): Promise<Buffer> {
  const bin = ffmpegPath();
  if (!bin) throw new Error("ffmpeg-static binary not found in this environment");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clip-fit-"));
  try {
    const inPath = path.join(dir, "in.mp4");
    const outPath = path.join(dir, "out.mp4");
    fs.writeFileSync(inPath, clip);
    const cur = await probeFileDuration(bin, inPath);

    const pad = seconds - cur;
    if (pad > 0.25) {
      // Freeze the last frame for the remainder.
      const framePath = path.join(dir, "last.jpg");
      await runFfmpeg(bin, [
        "-y", "-loglevel", "warning",
        "-sseof", "-0.1",
        "-i", inPath,
        "-update", "1",
        "-frames:v", "1",
        "-q:v", "2",
        framePath,
      ]);
      const still = await stillImageClip(fs.readFileSync(framePath), pad);
      return await stitchStoryVideo([clip, still]);
    }

    // Trim (or just normalize when already within ~0.25s).
    await runFfmpeg(bin, [
      "-y", "-loglevel", "warning",
      "-i", inPath,
      "-t", Math.min(seconds, cur).toFixed(2),
      "-vf", "scale=1080:1920:flags=lanczos,fps=30,setsar=1",
      "-an",
      "-c:v", "libx264",
      "-preset", "fast",
      // crf 18 (2026-08-16, per Keenan: clips pass through several x264
      // generations — fit → stitch → mux — and stacked crf-23 encodes
      // left the final video visibly soft).
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outPath,
    ]);
    const out = fs.readFileSync(outPath);
    if (out.length < 50_000) {
      throw new Error(`Fitted clip is suspiciously small (${out.length} bytes)`);
    }
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Concatenate per-scene voiceover MP3s into one track, padding each
 * scene's audio with `gapSec` of silence (the same breathing gap added
 * to each scene's video length) so the combined audio timeline matches
 * the combined video timeline exactly — this is what keeps every word
 * on its own scene.
 */
export async function concatAudioWithGaps(audios: Buffer[], gapSec: number): Promise<Buffer> {
  const bin = ffmpegPath();
  if (!bin) throw new Error("ffmpeg-static binary not found in this environment");
  if (audios.length === 0) throw new Error("No audio segments to concat");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audio-concat-"));
  try {
    const inputs: string[] = [];
    audios.forEach((buf, i) => {
      const p = path.join(dir, `seg-${i}.mp3`);
      fs.writeFileSync(p, buf);
      inputs.push("-i", p);
    });
    const pads = audios
      .map((_, i) => `[${i}:a]aresample=44100,apad=pad_dur=${gapSec.toFixed(2)}[a${i}]`)
      .join(";");
    const concat =
      audios.map((_, i) => `[a${i}]`).join("") + `concat=n=${audios.length}:v=0:a=1[a]`;
    const outPath = path.join(dir, "out.mp3");
    await runFfmpeg(bin, [
      "-y", "-loglevel", "warning",
      ...inputs,
      "-filter_complex", `${pads};${concat}`,
      "-map", "[a]",
      "-c:a", "libmp3lame",
      "-b:a", "128k",
      outPath,
    ]);
    const out = fs.readFileSync(outPath);
    if (out.length < 5_000) {
      throw new Error(`Audio concat produced a suspiciously small file (${out.length} bytes)`);
    }
    return out;
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
 *
 * `opts.fadeOutSec` (2026-08-15, per Keenan): fade each clip out to
 * black over the given duration before the cut to the next one — used
 * by the carousel slideshow compilation so slide changes read as
 * transitions instead of hard cuts. Each clip is probed for its real
 * length so the fade lands exactly at its end. (The `fade` filter is
 * confirmed present in the ffmpeg-static linux binary — exact-string
 * verified 2026-08-15, same method that caught the missing drawtext.)
 */
export async function stitchStoryVideo(
  clips: Buffer[],
  opts?: { fadeOutSec?: number }
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

    const fadeSec = opts?.fadeOutSec ?? 0;
    let durations: number[] | null = null;
    if (fadeSec > 0) {
      durations = [];
      for (let i = 0; i < clips.length; i++) {
        durations.push(
          await probeFileDuration(bin, path.join(dir, `clip-${i}.mp4`))
        );
      }
    }

    const norm = clips
      .map((_, i) => {
        let chain = `[${i}:v]scale=1080:1920:flags=lanczos,fps=30,setsar=1`;
        if (durations) {
          const st = Math.max(0, durations[i] - fadeSec);
          chain += `,fade=t=out:st=${st.toFixed(2)}:d=${fadeSec.toFixed(2)}`;
        }
        return `${chain}[v${i}]`;
      })
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
      // crf 18 (2026-08-16, per Keenan: clips pass through several x264
      // generations — fit → stitch → mux — and stacked crf-23 encodes
      // left the final video visibly soft).
      "-crf", "18",
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
 * Stitch clips into one silent vertical MP4 with PROPER BLENDING
 * (2026-08-16, per Keenan): ~0.5s crossfade between every pair of clips,
 * a fade-in from black at the start, and a fade-out at the end — instead
 * of the hard cuts stitchStoryVideo produces. Used for the animated
 * carousel compilation.
 *
 * xfade needs every clip's real duration to compute overlap offsets, so
 * each clip is probed first (ffmpeg "-f null -", no ffprobe in
 * ffmpeg-static). All clips are normalized to 1080x1920 @ 30fps with a
 * shared timebase (settb) — xfade refuses mismatched timebases.
 */
export async function stitchClipsWithCrossfade(
  clips: Buffer[],
  opts?: { crossfadeSec?: number; trimToSec?: number }
): Promise<Buffer> {
  const bin = ffmpegPath();
  if (!bin) throw new Error("ffmpeg-static binary not found in this environment");
  if (clips.length === 0) throw new Error("No clips to stitch");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "story-xfade-"));
  const outVideo = path.join(dir, "out.mp4");
  try {
    const inputs: string[] = [];
    const files: string[] = [];
    clips.forEach((buf, i) => {
      const p = path.join(dir, `clip-${i}.mp4`);
      fs.writeFileSync(p, buf);
      files.push(p);
      inputs.push("-i", p);
    });

    const durations: number[] = [];
    for (const f of files) durations.push(await probeFileDuration(bin, f));

    // Crossfade can't exceed half the shortest clip.
    const minDur = Math.min(...durations);
    const xf = Math.max(0.2, Math.min(opts?.crossfadeSec ?? 0.5, minDur / 2));
    const fadeEdge = 0.4; // fade-in/out from/to black at the very ends

    const norm = clips
      .map(
        (_, i) =>
          `[${i}:v]scale=1080:1920:flags=lanczos,fps=30,setsar=1,settb=AVTB${
            i === 0 ? `,fade=t=in:st=0:d=${fadeEdge}` : ""
          }[v${i}]`
      )
      .join(";");

    let chain = "";
    let last = "v0";
    let offset = 0;
    for (let i = 1; i < clips.length; i++) {
      offset += durations[i - 1] - xf;
      const out = i === clips.length - 1 ? "vx" : `x${i}`;
      chain += `;[${last}][v${i}]xfade=transition=fade:duration=${xf.toFixed(3)}:offset=${offset.toFixed(3)}[${out}]`;
      last = out;
    }

    const total =
      durations.reduce((a, b) => a + b, 0) - (clips.length - 1) * xf;
    // Optional trim in the same encode (2026-08-18, ambient loops): a
    // separate fitClipToDuration pass doubled the encode time and blew
    // Vercel's 300s limit. The fade-out lands on the trimmed end.
    const effEnd =
      opts?.trimToSec && opts.trimToSec < total ? opts.trimToSec : total;
    const finalIn = clips.length === 1 ? "v0" : "vx";
    chain += `;[${finalIn}]fade=t=out:st=${Math.max(0, effEnd - fadeEdge).toFixed(3)}:d=${fadeEdge}[v]`;

    const args = [
      "-y",
      "-loglevel", "warning",
      ...inputs,
      "-filter_complex", `${norm}${chain}`,
      "-map", "[v]",
      ...(opts?.trimToSec ? ["-t", effEnd.toFixed(3)] : []),
      "-an",
      "-c:v", "libx264",
      "-preset", "fast",
      // crf 18 (2026-08-16, per Keenan: clips pass through several x264
      // generations — fit → stitch → mux — and stacked crf-23 encodes
      // left the final video visibly soft).
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outVideo,
    ];

    await runFfmpeg(bin, args);
    const out = fs.readFileSync(outVideo);
    if (out.length < 100_000) {
      throw new Error(
        `Crossfade stitch produced a suspiciously small output (${out.length} bytes from ${clips.length} clips)`
      );
    }
    console.log(
      `[story-video] Crossfade-stitched ${clips.length} clips (xfade=${xf.toFixed(2)}s): ${out.length} bytes`
    );
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Mux the voiceover onto the already-stitched silent video (2026-08-12).
 * If the audio runs longer than the video it is gently sped up (atempo,
 * capped at 1.18×) so the narration lands on the video's end; any tiny
 * remainder is trimmed with -shortest. If the audio is shorter, the
 * video keeps its full length and the audio simply ends early —
 * -shortest is NOT used in that case because it would trim the video.
 *
 * When `captions` are provided (whisper word timings, relative to the
 * audio) they are burned in as timed PNG overlays — each chunk is
 * rendered to a transparent PNG with the sharp/Pango pipeline (proven
 * daily in prod on slides) and composited with ffmpeg's `overlay`
 * filter. 2026-08-14: this REPLACED drawtext, which is absent from the
 * ffmpeg-static linux binary — every drawtext mux threw on Vercel and
 * the silent stitch shipped two days running. Timestamps are divided by
 * the atempo factor so the words stay frame-accurate even when the
 * audio is sped up. Captions sit at 30% height: the scene images keep
 * the top 45% calm and her face in the lower half, so this zone never
 * covers a face and clears the mobile UI's top 15%. Without captions
 * (or if rendering fails) the video stream is copied unchanged.
 *
 * `audio` may be null (2026-08-13, per Keenan): when the voiceover
 * failed, the estimated script captions are still burned in so the
 * silent video reflects the script — no audio stream is added.
 */
export async function muxNarration(
  video: Buffer,
  audio: Buffer | null,
  captions?: CaptionChunk[]
): Promise<Buffer> {
  const bin = ffmpegPath();
  if (!bin) throw new Error("ffmpeg-static binary not found in this environment");
  if (!audio && (!captions || captions.length === 0)) {
    throw new Error("muxNarration called with neither audio nor captions");
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "story-mux-"));
  try {
    const videoPath = path.join(dir, "video.mp4");
    const audioPath = path.join(dir, "voiceover.mp3");
    const outPath = path.join(dir, "out.mp4");
    fs.writeFileSync(videoPath, video);
    if (audio) fs.writeFileSync(audioPath, audio);

    let factor = 1;
    let atempoNeeded = false;
    if (audio) {
      const videoSec = await probeFileDuration(bin, videoPath);
      const audioSec = await probeFileDuration(bin, audioPath);
      if (audioSec > videoSec + 0.15) {
        factor = Math.min(audioSec / videoSec, 1.18);
        atempoNeeded = true;
        console.log(
          `[story-video] Voiceover ${audioSec.toFixed(1)}s vs video ${videoSec.toFixed(1)}s — atempo ${factor.toFixed(3)}`
        );
      }
    }

    // Render each caption chunk to a transparent PNG. If any render
    // fails the whole batch is dropped (audio still muxes) — a missing
    // caption mid-video would look broken, and captions must never be
    // the reason a video ships silent again.
    const capPngs: string[] = [];
    if (captions && captions.length > 0) {
      try {
        const { renderCaptionPng } = await import("./compose");
        for (let i = 0; i < captions.length; i++) {
          const png = await renderCaptionPng(captions[i].text);
          const p = path.join(dir, `cap-${i}.png`);
          fs.writeFileSync(p, png.buffer);
          capPngs.push(p);
        }
        console.log(
          `[story-video] Burning ${capPngs.length} caption chunks as PNG overlays`
        );
      } catch (err) {
        capPngs.length = 0;
        console.warn(
          `[story-video] Caption PNG rendering failed — shipping without captions: ${err instanceof Error ? err.message : err}`
        );
      }
    }

    const args = ["-y", "-loglevel", "warning", "-i", videoPath];
    if (audio) args.push("-i", audioPath);
    for (const p of capPngs) args.push("-i", p);

    if (capPngs.length > 0) {
      // Chain one timed overlay per chunk. scale2ref is avoided and the
      // PNGs are pre-sized (see video-overlay.ts, 2026-08-11: scale2ref
      // produced a frameless shell on Vercel).
      const base = audio ? 2 : 1; // input index of the first caption PNG
      const parts = captions!.slice(0, capPngs.length).map((c, i) => {
        const s = (c.start / factor).toFixed(2);
        const e = (c.end / factor).toFixed(2);
        const src = i === 0 ? "[0:v]" : `[v${i - 1}]`;
        return (
          `${src}[${base + i}:v]overlay=x=(W-w)/2:y=H*0.30:format=auto` +
          `:enable='between(t,${s},${e})'[v${i}]`
        );
      });
      if (audio && atempoNeeded) {
        parts.push(`[1:a]atempo=${factor.toFixed(4)}[aout]`);
      }
      args.push("-filter_complex", parts.join(";"));
      args.push("-map", `[v${capPngs.length - 1}]`);
      if (audio) {
        args.push("-map", atempoNeeded ? "[aout]" : "1:a");
        if (atempoNeeded) args.push("-shortest");
      } else {
        args.push("-an");
      }
      args.push(
        "-c:v", "libx264",
        "-preset", "fast",
        // Final generation: crf 19 keeps the delivery file reasonable
        // while the crf-18 intermediates (fit/still/stitch) preserve
        // detail upstream (2026-08-16, per Keenan: stacked crf-23
        // encodes left the final video visibly soft).
        "-crf", "19",
        "-pix_fmt", "yuv420p"
      );
    } else {
      args.push("-map", "0:v");
      if (audio) {
        args.push("-map", "1:a");
        if (atempoNeeded) {
          args.push("-filter:a", `atempo=${factor.toFixed(4)}`, "-shortest");
        }
      } else {
        args.push("-an");
      }
      args.push("-c:v", "copy");
    }
    if (audio) args.push("-c:a", "aac", "-b:a", "128k");
    args.push("-movflags", "+faststart", outPath);

    await runFfmpeg(bin, args);

    const out = fs.readFileSync(outPath);
    if (out.length < 100_000) {
      throw new Error(`Mux produced a suspiciously small output (${out.length} bytes)`);
    }
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
