/**
 * Content Factory — CALM-STORY video pipeline (2026-08-20, per Keenan).
 *
 * Replaces the eliminated illustrated STORY format ("we can't get it to
 * work properly, it looks terrible"). This is the second branch of the
 * calm-video family: the SAME calm female voiceover as the ambient
 * format, but the narration is a small STORY told across several
 * ANIMATED nature/object scenes (2026-08-21, per Keenan: "make it
 * animated and not hyperrealistic" — soft-3D animated-film style, the
 * same family as the toon3d look winning on carousels) — each scene's
 * animation matches the beat of the story being told, and scenes
 * dissolve into each other with clean crossfades. NO people ever appear
 * (that rule is what killed the old story format — character consistency
 * across scenes was unwinnable).
 *
 * Pipeline (see carousel-calm-story.ts):
 * 1. Claude writes a 15-45s story script split into scenes, plus one
 *    shared "look" line so every scene reads as the same film
 * 2. gpt-image-2 renders one animated-film 9:16 image per scene (no
 *    text, no people)
 * 3. Higgsfield animates each image (constant loopable motion)
 * 4. ElevenLabs (shared ambient voice, eleven_v3) voices EACH SCENE separately
 *    (2026-08-21, per Keenan: "break it down to perfectly match the
 *    script") with previous/next-text context for prosody continuity
 * 5. Each scene's clip is looped/trimmed to EXACTLY its narration's
 *    measured duration (+ fixed margins), the scenes are stitched with
 *    crossfades, and the per-scene audio (joined with matching gaps) is
 *    muxed on top — sync is exact by construction
 *
 * Reuses the STORY CarouselFormat + storyVideoUrl/storyVoiced fields —
 * zero schema changes.
 */

import Anthropic from "@anthropic-ai/sdk";
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

/** Seconds per Higgsfield source clip before looping (same knob family as ambient). */
export function calmStoryClipDuration(): number {
  const d = Number(process.env.HIGGSFIELD_AMBIENT_CLIP_DURATION);
  return Number.isFinite(d) && d > 0 ? d : 5;
}

/** Crossfade between scene clips ("a clean fade in to the next clip"). */
export const CALM_STORY_XFADE_SEC = 0.8;

/**
 * Timing constants for exact per-scene sync (2026-08-21). A scene's
 * narration plays only while that scene is fully visible: each narration
 * gets MARGIN seconds of air on either side of it, crossfades happen
 * inside the silent gaps, and the audio gap between narrations is
 * exactly crossfade + 2·margin so words never straddle a transition.
 * TAIL equals GAP because concatAudioWithGaps pads the final segment by
 * the gap too — audio and video end together, so mux never time-warps.
 */
export const CALM_STORY_MARGIN_SEC = 0.3;
export const CALM_STORY_GAP_SEC =
  CALM_STORY_XFADE_SEC + 2 * CALM_STORY_MARGIN_SEC; // 1.4
export const CALM_STORY_TAIL_SEC = CALM_STORY_GAP_SEC;

export interface CalmStoryScene {
  /** This scene's slice of the narration (voiced as its own read). */
  narration: string;
  /** Narration with eleven_v3 audio tags ([softly]...) — TTS only. */
  vocal?: string;
  /** What the animated-film image shows — no people, no text. */
  visual: string;
  /** ONE constant loopable environmental movement for the i2v prompt. */
  motion: string;
}

export interface CalmStoryScript {
  /** Short label of the concept — persisted so future scripts avoid repeats. */
  theme: string;
  /** Short scroll-stopping title for the post (admin/email/caption). */
  title: string;
  /** Which story shape this script used (variety tracking). */
  shape: string;
  /** ONE shared style sentence appended to every scene's image prompt. */
  look: string;
  scenes: CalmStoryScene[];
  /** Full narration = scene narrations joined (email/captions/admin). */
  script: string;
  /** Full LLM-written post caption body (persona voice, no hashtags). */
  caption?: string;
  captionHook?: string;
  commentPrompt?: string;
}

/**
 * The three story shapes rotate randomly (2026-08-20, per Keenan: "i
 * want a mix... keep everything fresh and find out what works best").
 */
const STORY_SHAPES: { key: string; brief: string }[] = [
  {
    key: "third-person mini-story",
    brief: `THIRD-PERSON MINI-STORY: a tiny true-feeling story about one specific woman — "she". One evening, one moment, one turn. Told like you watched it happen from across the street: concrete, quiet, no moral until the last line. The viewer should recognize herself in "her" without ever being addressed. The scenes show the WORLD of the story (the kitchen window at dusk, the parked car in the rain, the porch light) — never the woman herself.`,
  },
  {
    key: "second-person arc",
    brief: `SECOND-PERSON ARC: spoken straight to "you", present tense — a recognition that builds scene by scene. Each scene pushes one step deeper into the thing she's never said out loud, and the last scene hands her the release. The scenes are the landscapes of her inner weather (storm building, rain on glass, first light) — the visuals track the emotional arc exactly.`,
  },
  {
    key: "parable",
    brief: `PARABLE: a short story about something in nature or the physical world — a river, a tide, a candle, a tree in wind, a lighthouse — told plainly, and then landed on her life in the final lines ("that's what you've been doing"). The metaphor must be so clean a stranger gets it at half-attention. The scenes ARE the parable's world, so narration and image match beat for beat.`,
  },
];

/** Pick this run's story shape at random. */
export function pickStoryShape(): { key: string; brief: string } {
  return STORY_SHAPES[Math.floor(Math.random() * STORY_SHAPES.length)];
}

/**
 * Visual worlds (2026-08-21, per Keenan: "more variation in whats
 * posted. it does NOT need to stick to the orange and purple theme").
 * One world is assigned per run so consecutive posts look different —
 * blue skies, oceans, rain, fireplaces, nature — not the same warm
 * sunset palette every time. The scenes are different views/moments
 * inside the assigned world.
 */
const CALM_STORY_WORLDS = [
  "a wide blue daytime sky with white clouds slowly flowing",
  "an open ocean with waves rolling in, endlessly",
  "a sunset sky with glowing clouds drifting",
  "a rainy day — raindrops sliding down a window pane",
  "a fireplace with flames breathing steadily in a dim cozy room",
  "a misty forest with fog drifting between the trees",
  "a moonlit lake at night, soft ripples crossing dark water",
  "snow falling steadily past a warm window light",
  "a golden field with tall grass moving in a soft wind",
  "a mountain valley with low clouds drifting through at dawn",
];

/** Pick this run's visual world at random. */
export function pickStoryWorld(): string {
  return CALM_STORY_WORLDS[Math.floor(Math.random() * CALM_STORY_WORLDS.length)];
}

function buildSystemPrompt(
  shape: { key: string; brief: string },
  world: string,
  branch: PainBranch
): string {
  return `You are a scriptwriter for calm, cinematic story videos. Each video is a short STORY told by a soothing female voice over a sequence of breathtaking ANIMATED scenes — soft-3D animated-film style, like a still from a high-end animated feature (nature, weather, light, objects — NEVER people, NEVER photorealistic) — that dissolve into each other. The words and the images move together — every scene's picture matches the beat of the story at that moment, and each scene's narration plays exactly while its image is on screen.

${SCRIPT_STYLE_GUIDE}

${painBranchBlock(branch)}

THE GOAL: go viral with THIS audience by making her feel seen — this account understands her. BE BOLD — the first line and the first image must capture attention immediately and the story must retain it to the last second.

TODAY'S STORY SHAPE (follow it exactly):
${shape.brief}

STRUCTURE — the story must land all five beats, in this order, across the scenes:
1. HOOK (scene 1's first line): names a private, specific emotional truth — a line too true to swipe past. NO greetings, NO scene-setting, NO poetic fragments that need context.
2. SCENE: one concrete daily-life moment she recognizes (or the parable's world), told in specifics — a NEW detail or turn every scene, nothing restated.
3. TRUTH: the deeper emotional insight underneath the moment.
4. REFRAME: show her she is not broken, dramatic, lazy, or failing.
5. FOLLOWER CTA: the final line of the last scene — one soft audience-building ask from the approved family, in the same quiet voice.

SCRIPT RULES:
- 45-85 words TOTAL, read slowly (finished videos run 20-35 seconds — VARY the length from post to post; let the story pick its length).
- The narration is voiced SCENE BY SCENE — each scene's lines are their own short read that plays exactly while that scene is on screen, with a small breath between scenes. Every scene's narration must work as a complete spoken phrase (never split a sentence across two scenes).
- WRITE THE WAY A REAL PERSON TALKS. Contractions always ("you're", "it's", "didn't"). Sentence fragments are good. A line can be two words. Trailing thoughts with an em-dash — like this — are good.
- BUILD IN THE PAUSES: ellipses ("...") where the voice would actually stop and breathe, at least 3 times across the script. The TTS reads punctuation literally.
- The test: read it out loud. If it sounds like a caption or an inspirational quote, rewrite it. If it sounds like a tired friend telling you a story at 10pm in her kitchen, keep it.
- No hashtags, no emojis, no advice-verbs ("try", "start", "practice", "remember to"). The ONLY call to action is the single soft follower CTA that ends the script — never a product CTA.

SCENES — how many: usually 3-5, but the STORY decides (2026-08-20, per Keenan: cohesiveness, catchiness, virality first — "if it calls for more or less scenes, do that"). Never fewer than 2 or more than 6. Each scene needs enough narration to sit on (at least ~8 words) — don't slice the script thinner than the story needs.

TODAY'S VISUAL WORLD (set the whole video inside it): ${world}. Every scene is a different view, angle, or moment inside this world — a different framing, a different distance, a shifting detail — so the video reads as one place seen deeply, not a montage. Let the world's natural palette drive the "look" — do NOT force everything toward the same warm orange-and-purple sunset tones; blues, greys, greens, silvers, and firelight ambers are all welcome. If today's story shape truly demands a different world, pick another equally soothing one — but never default back to the same look post after post.

VISUAL RULES ("visual" per scene):
- A breathtaking ANIMATED-FILM scene that shows THIS beat of the story — soft-3D animated style, rounded forms, hand-crafted warmth, glowing painterly light. NEVER photorealistic, NEVER live-action, NEVER a photograph. The image, the words, and the motion must all be the same moment — if the narration mentions rain, we see the rain; if the story turns at dawn, the light turns with it.
- ABSOLUTELY NO people, NO human figures, NO silhouettes, NO hands, NO faces — not even in the distance. No animals in focus. No text or typography of any kind.
- Scene 1's image must be a scroll-stopper in its own right — bold, cinematic, immediate.
- Composed for a vertical 9:16 frame. One sentence, concrete and specific about light, color, and weather.
- Every scene visually DIFFERENT from the others, but all clearly the same world (see "look").

"look" — ALSO OUTPUT one shared style sentence (color palette, light quality, weather, time of day, rendering feel) that applies to EVERY scene, so the video reads as one continuous animated film instead of stock clips ("Moody blue-hour palette, rain-washed colors, soft glowing haze, everything gently rounded and softly lit").

MOTION RULES ("motion" per scene — the clip may loop, so it must read as one continuous shot):
- ONE constant, even, endless environmental movement: rain sliding down the glass, waves rolling in, clouds drifting steadily, a candle flame breathing, fog moving at a constant pace.
- Same rate and direction the entire time — no beginning, middle, or end; any moment looks like any other moment. Lighting, colors, framing identical first frame to last. Nothing enters or leaves the frame. No camera movement.
- Under 20 words, present tense. The motion must belong to this scene's story beat.

ALSO OUTPUT:
- "title": a short scroll-stopping title, max 60 characters, in the same quiet voice
- "caption": the FULL post caption (everything except hashtags — those are added automatically). Written in the voice of a real woman who runs the page — she's in the audience herself. Text-message tone, lowercase-leaning, contractions always, no marketing words, at most one emoji. KEEP IT SHORT: exactly 2 lines, blank line between them. Line 1 hooks on its own, under 12 words (it's the only line visible before "...more") — a personal aside or a question to her. Line 2 is one share/save ask in her voice ("send this to the friend who never stops moving"). NEVER retell, quote, or summarize the story — the video tells it; the caption doesn't repeat it. The test: would a real person paste this from her Notes app? No "comment below" phrasing ever. No app plug.
- "commentPrompt": one question inviting viewers to share their version (fallback field).
- "captionHook": 1-2 of the personal lines on their own (fallback field).
- "vocal" (per scene): the scene's narration turned into a directed vocal PERFORMANCE with ElevenLabs v3 audio tags — this is where the read becomes hyper-realistic. 1-3 tags per scene, placed where the delivery should shift. Allowed tags: [softly], [warmly], [gently], [quietly], [whispers], [sighs], [exhales], [tired], [tender], [hesitates], [pause], [long pause]. Scene 1's vocal starts with [softly] or [warmly]; the register should move across the story — [tired] on the heavy beat, [whispers] on the most private line, [warmly] on the reframe, [gently] on the CTA. Add [pause] (or extra "...") where a real person would actually stop, and [sighs]/[exhales] only where a tired woman would audibly breathe. Tags direct delivery — the WORDS must stay identical to "narration". Never all-caps, never exclamation marks.

OUTPUT FORMAT (strict JSON, no markdown):
{
  "theme": "5-10 word label for this concept (used to avoid future repeats)",
  "title": "...",
  "caption": "the full post caption, in her voice, no hashtags",
  "captionHook": "...",
  "commentPrompt": "...",
  "look": "one shared style sentence for every scene",
  "scenes": [
    { "narration": "...", "vocal": "same words fully performance-directed with v3 audio tags and pause marks", "visual": "...", "motion": "..." },
    ... 2-6 scenes, however many the story needs ...
  ]
}`;
}

/**
 * Invent one calm-story concept and write its scene-split script. Logs
 * the Claude call to ClaudeCallLog like the other generators.
 */
export async function generateCalmStoryScript(input: {
  /** Recent themes + headlines the new concept must not resemble. */
  avoid: string[];
}): Promise<CalmStoryScript> {
  const { prisma } = await import("@/lib/prisma");

  const shape = pickStoryShape();
  const world = pickStoryWorld();
  const branch = pickPainBranch();
  const avoidBlock =
    input.avoid.length > 0
      ? `\n\nDo NOT reuse or closely resemble any of these recent concepts and headlines:\n${input.avoid.map((a) => `- ${a}`).join("\n")}`
      : "";

  const userPrompt = `Write one new calm-story video script for this audience using today's story shape (${shape.key}).${avoidBlock}

Return ONLY valid JSON.`;

  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1400,
      system: buildSystemPrompt(shape, world, branch),
      messages: [{ role: "user", content: userPrompt }],
    });

    const durationMs = Date.now() - start;
    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    await prisma.claudeCallLog.create({
      data: {
        purpose: "calm-story-script",
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
    const parsed = JSON.parse(jsonStr) as Record<string, unknown> & {
      scenes?: {
        narration?: unknown;
        vocal?: unknown;
        visual?: unknown;
        motion?: unknown;
      }[];
    };

    // Punctuation-only tokens don't count (standalone "..." pause marks
    // are allowed in the vocal performance).
    const wordCount = (s: string) =>
      s.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
    const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
    const scenes: CalmStoryScene[] = rawScenes
      .filter(
        (s) =>
          typeof s.narration === "string" &&
          (s.narration as string).trim() &&
          typeof s.visual === "string" &&
          (s.visual as string).trim()
      )
      .slice(0, 6)
      .map((s) => {
        const narration = (s.narration as string).trim();
        // Per-scene vocal must be the same words (tags aside) — if the
        // model paraphrased, TTS falls back to the clean narration.
        let vocal =
          typeof s.vocal === "string" && s.vocal.trim() ? s.vocal.trim() : undefined;
        if (vocal) {
          const stripped = vocal.replace(/\[[a-z][a-z ]*\]\s*/gi, "");
          if (Math.abs(wordCount(stripped) - wordCount(narration)) > 2) {
            vocal = undefined;
          }
        }
        return {
          narration,
          vocal,
          visual: (s.visual as string).trim(),
          motion:
            typeof s.motion === "string" && s.motion.trim()
              ? s.motion.trim()
              : "the light shifts slowly and evenly across the scene",
        };
      });
    if (scenes.length < 2) {
      throw new Error(`Calm-story script returned ${scenes.length} usable scenes`);
    }

    const script = scenes.map((s) => s.narration).join(" ");
    const totalWords = wordCount(script);
    if (totalWords < 30) {
      throw new Error(`Calm-story narration is only ${totalWords} words`);
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
      shape: shape.key,
      look:
        typeof parsed.look === "string" && parsed.look.trim()
          ? parsed.look.trim()
          : "Soft moody light, rich muted colors, gently rounded forms, warm glowing haze",
      scenes,
      script,
      caption:
        typeof parsed.caption === "string" && parsed.caption.trim()
          ? parsed.caption.trim()
          : undefined,
      captionHook:
        typeof parsed.captionHook === "string" ? parsed.captionHook.trim() : undefined,
      commentPrompt:
        typeof parsed.commentPrompt === "string"
          ? parsed.commentPrompt.trim()
          : undefined,
    };
  } catch (err) {
    await prisma.claudeCallLog.create({
      data: {
        purpose: "calm-story-script",
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
 * Image prompt for one calm-story scene — ANIMATED, not photoreal
 * (2026-08-21, per Keenan: "make it animated and not hyperrealistic").
 * Soft-3D animated-film style — the same family as the toon3d look
 * that's outperforming everything on carousels — plus the script's
 * shared "look" line so every scene reads as one continuous film.
 */
export function buildCalmStorySceneImagePrompt(opts: {
  look: string;
  scene: Pick<CalmStoryScene, "visual">;
}): string {
  return [
    `Breathtaking still frame from a high-end soft 3D animated film: ${opts.scene.visual}`,
    `Consistent animated-film look across a series of scenes — ${opts.look}`,
    "Soft 3D animation style, Pixar-inspired environments: rounded organic shapes, hand-crafted warmth, painterly glowing light, rich color grading, gentle gradients, immense depth and atmosphere. Serene, cinematic, awe-inspiring.",
    "NOT photorealistic, NOT live-action, NOT a photograph — a beautiful animated scene.",
    "Vertical 9:16 composition.",
    "ABSOLUTELY NO people, NO human figures, NO silhouettes, NO hands, NO faces anywhere. NO animals in focus.",
    "Absolutely NO text, letters, words, numbers, logos, or watermarks anywhere in the image.",
  ].join("\n");
}

/**
 * Image-to-video prompt for one scene clip: one constant loop-friendly
 * environmental movement (the clip may be looped to fill its scene
 * window, so it must read as a continuous shot).
 */
export function buildCalmStorySceneVideoPrompt(
  scene: Pick<CalmStoryScene, "motion">
): string {
  return [
    `The scene breathes in slow motion: ${scene.motion}.`,
    "One single continuous movement at a perfectly constant speed and direction from the first frame to the last — any moment of the clip looks like any other moment, with no beginning and no ending, so it plays as an endless loop.",
    "The movement at the last frame matches the first frame exactly.",
    "Fixed, locked camera. The lighting, colors, framing, and every object stay identical from first frame to last. No people appear.",
    "Crisp, sharp, high-definition animated footage — the soft 3D animated-film rendering style of the source image is preserved exactly, never drifting toward live-action realism.",
  ].join(" ");
}

/**
 * Per-scene video windows from MEASURED narration durations (2026-08-21,
 * per Keenan: "break it down to perfectly match the script. clip down
 * the videos if needed to match"). Each scene is voiced separately, so
 * its window is exactly its narration length plus fixed margins, and the
 * crossfades land inside the silent gaps between narrations:
 *
 *   window_i = narration_i
 *            + margin on each interior side (air before/after the words)
 *            + xfade per junction the scene participates in
 *            + tail on the last scene (audio's trailing pad)
 *
 * With the audio segments joined by CALM_STORY_GAP_SEC of silence
 * (= xfade + 2*margin), narration i starts exactly `margin` seconds
 * after scene i becomes fully visible and ends `margin` seconds before
 * its outgoing crossfade begins — words never straddle a transition,
 * and the summed video length equals the audio length exactly.
 */
export function calmStorySceneWindows(
  narrationSecs: number[],
  xfadeSec: number = CALM_STORY_XFADE_SEC,
  marginSec: number = CALM_STORY_MARGIN_SEC,
  tailSec: number = CALM_STORY_TAIL_SEC
): number[] {
  const n = narrationSecs.length;
  return narrationSecs.map((a, i) => {
    const junctions = n === 1 ? 0 : i === 0 || i === n - 1 ? 1 : 2;
    const leading = i === 0 ? 0 : marginSec;
    const trailing = i === n - 1 ? tailSec : marginSec;
    const w = a + leading + trailing + xfadeSec * junctions;
    return Math.round(w * 100) / 100;
  });
}

/**
 * Fallback narration-length estimate for the silent path (TTS failed):
 * the calm read paces ~2.2 words/sec; every scene gets at least 2s.
 */
export function estimateNarrationSecs(
  scenes: Pick<CalmStoryScene, "narration">[]
): number[] {
  return scenes.map((s) => {
    const words = s.narration.split(/\s+/).filter(Boolean).length || 1;
    return Math.max(2, Math.round((words / 2.2) * 100) / 100);
  });
}

/** TTS text for one scene: its tagged vocal, always opening [softly]. */
export function calmStorySceneTtsText(scene: CalmStoryScene): string {
  const raw = scene.vocal || scene.narration;
  return /^\s*\[/.test(raw) ? raw : `[softly] ${raw}`;
}
