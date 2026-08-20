/**
 * Content Factory — CALM-STORY video pipeline (2026-08-20, per Keenan).
 *
 * Replaces the eliminated illustrated STORY format ("we can't get it to
 * work properly, it looks terrible"). This is the second branch of the
 * calm-video family: the SAME soothing Hope voiceover as the ambient
 * format, but the narration is a small STORY told across several
 * photoreal nature/object scenes — each scene's animation matches the
 * beat of the story being told, and scenes dissolve into each other with
 * clean crossfades. NO people ever appear (that rule is what killed the
 * old story format — character consistency across scenes was unwinnable).
 *
 * Pipeline (see carousel-calm-story.ts):
 * 1. Claude writes a 15-45s story script split into scenes, plus one
 *    shared "look" line so every scene reads as the same film
 * 2. gpt-image-2 renders one photoreal 9:16 image per scene (no text,
 *    no people)
 * 3. Higgsfield animates each image (constant loopable motion)
 * 4. ElevenLabs (Hope, eleven_v3) voices the WHOLE narration as one
 *    continuous read — same voice/settings as the ambient format
 * 5. Each scene's clip is looped/trimmed to a window weighted by that
 *    scene's share of the narration words, then all scenes are stitched
 *    with crossfades and the audio is muxed on top
 *
 * Reuses the STORY CarouselFormat + storyVideoUrl/storyVoiced fields —
 * zero schema changes.
 */

import Anthropic from "@anthropic-ai/sdk";

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

export interface CalmStoryScene {
  /** This scene's slice of the continuous narration. */
  narration: string;
  /** What the photoreal image shows — no people, no text. */
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
  /** Full narration = scene narrations joined (one continuous read). */
  script: string;
  /** Same narration with eleven_v3 audio tags — TTS only. */
  vocalScript?: string;
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

function buildSystemPrompt(shape: { key: string; brief: string }): string {
  return `You are a scriptwriter for calm, cinematic story videos for Ripple, an AI-powered voice self-reflection app. Each video is a short STORY told by a soothing female voice over a sequence of breathtaking photoreal scenes (nature, weather, light, objects — NEVER people) that dissolve into each other. The words and the images move together — every scene's picture matches the beat of the story at that moment.

TARGET AUDIENCE: Women aged 40-50 carrying a heavy mental load — work, family, aging parents, invisible labor. Capable, busy, reflective women who want to feel SEEN, not lectured.

THE GOAL: go viral with THIS audience. Success is her watching to the last second, sending it to a friend with "this is me", and saving it for a hard day. BE BOLD — the first line and the first image must capture attention immediately and the story must retain it to the end. This is NOT an ad: no app, product, or brand mention anywhere. The account posting it carries the brand.

BRAND VOICE — MIRROR, NOT A COACH: reflect, don't advise. Name what is true about her inner life so precisely she feels understood. Land on a recognition, a permission, or a question — NEVER instructions, tips, or "you should".

TODAY'S STORY SHAPE (follow it exactly):
${shape.brief}

STRUCTURE:
1. HOOK (scene 1's narration): the first line must stop the scroll on its own — a line too specific or too true to swipe past. NO greetings, NO scene-setting, NO poetic fragments that need context.
2. BUILD: each scene pushes the story one concrete step further — a NEW detail, a NEW turn every scene. No line may restate the previous one in different words. She should never have to work to decode anything.
3. LANDING (last scene): the exhale — the recognition or release the whole story was walking toward. It should hit hard enough that she watches it again.

SCRIPT RULES:
- 40-100 words TOTAL, read slowly (finished videos run 15-45 seconds — VARY the length from post to post; let the story pick its length).
- One continuous narration — it will be read as ONE take, not per-scene. Scene boundaries just mark which image is on screen for which lines.
- WRITE THE WAY A REAL PERSON TALKS. Contractions always ("you're", "it's", "didn't"). Sentence fragments are good. A line can be two words. Trailing thoughts with an em-dash — like this — are good.
- BUILD IN THE PAUSES: ellipses ("...") where the voice would actually stop and breathe, at least 3 times across the script. The TTS reads punctuation literally.
- The test: read it out loud. If it sounds like a caption or an inspirational quote, rewrite it. If it sounds like a tired friend telling you a story at 10pm in her kitchen, keep it.
- No hashtags, no emojis, no CTA, no advice-verbs ("try", "start", "practice", "remember to").

SCENES — how many: usually 3-5, but the STORY decides (2026-08-20, per Keenan: cohesiveness, catchiness, virality first — "if it calls for more or less scenes, do that"). Never fewer than 2 or more than 6. Each scene needs enough narration to sit on (at least ~8 words) — don't slice the script thinner than the story needs.

VISUAL RULES ("visual" per scene):
- A breathtaking photoreal scene that shows THIS beat of the story. The image, the words, and the motion must all be the same moment — if the narration mentions rain, we see the rain; if the story turns at dawn, the light turns with it.
- ABSOLUTELY NO people, NO human figures, NO silhouettes, NO hands, NO faces — not even in the distance. No animals in focus. No text or typography of any kind.
- Scene 1's image must be a scroll-stopper in its own right — bold, cinematic, immediate.
- Composed for a vertical 9:16 frame. One sentence, concrete and specific about light, color, and weather.
- Every scene visually DIFFERENT from the others, but all clearly the same world (see "look").

"look" — ALSO OUTPUT one shared style sentence (color palette, light quality, weather, time of day, lens feel) that applies to EVERY scene, so the video reads as one continuous film instead of stock clips ("Moody blue-hour light, rain-washed colors, soft cinematic haze, everything slightly wet and glowing").

MOTION RULES ("motion" per scene — the clip may loop, so it must read as one continuous shot):
- ONE constant, even, endless environmental movement: rain sliding down the glass, waves rolling in, clouds drifting steadily, a candle flame breathing, fog moving at a constant pace.
- Same rate and direction the entire time — no beginning, middle, or end; any moment looks like any other moment. Lighting, colors, framing identical first frame to last. Nothing enters or leaves the frame. No camera movement.
- Under 20 words, present tense. The motion must belong to this scene's story beat.

ALSO OUTPUT:
- "title": a short scroll-stopping title, max 60 characters, in the same quiet voice
- "caption": the FULL post caption (everything except hashtags — those are added automatically). Written in the voice of a real woman who runs the page — she's in the audience herself. Text-message tone, lowercase-leaning, contractions always, no marketing words, at most one emoji. Structure: line 1 hooks on its own (it's the only line visible before "...more"); then 1-2 short personal lines ("this one got me today"); then one share/save ask in her voice ("send this to the friend who never stops moving"). 3-5 short lines total, blank line between each. The test: would a real person paste this from her Notes app? No "comment below" phrasing ever. No app plug.
- "commentPrompt": one question inviting viewers to share their version (fallback field).
- "captionHook": 1-2 of the personal lines on their own (fallback field).
- "vocalScript": the EXACT full narration with 2-4 ElevenLabs v3 audio performance tags inserted where the delivery should shift. Allowed tags ONLY: [softly], [whispers], [sighs], [exhales]. Start it with [softly]. Tags direct delivery — they never replace or change the words.

OUTPUT FORMAT (strict JSON, no markdown):
{
  "theme": "5-10 word label for this concept (used to avoid future repeats)",
  "title": "...",
  "caption": "the full post caption, in her voice, no hashtags",
  "captionHook": "...",
  "commentPrompt": "...",
  "look": "one shared style sentence for every scene",
  "vocalScript": "the full narration with [softly]/[whispers]/[sighs]/[exhales] tags",
  "scenes": [
    { "narration": "...", "visual": "...", "motion": "..." },
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
      system: buildSystemPrompt(shape),
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
      scenes?: { narration?: unknown; visual?: unknown; motion?: unknown }[];
    };

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
      .map((s) => ({
        narration: (s.narration as string).trim(),
        visual: (s.visual as string).trim(),
        motion:
          typeof s.motion === "string" && s.motion.trim()
            ? s.motion.trim()
            : "the light shifts slowly and evenly across the scene",
      }));
    if (scenes.length < 2) {
      throw new Error(`Calm-story script returned ${scenes.length} usable scenes`);
    }

    const script = scenes.map((s) => s.narration).join(" ");
    const totalWords = script.split(/\s+/).filter(Boolean).length;
    if (totalWords < 30) {
      throw new Error(`Calm-story narration is only ${totalWords} words`);
    }

    // vocalScript must be the same words (tags aside) — if the model
    // paraphrased, fall back to the clean script.
    let vocalScript =
      typeof parsed.vocalScript === "string" ? parsed.vocalScript.trim() : undefined;
    if (vocalScript) {
      const stripped = vocalScript.replace(/\[[a-z][a-z ]*\]\s*/gi, "");
      const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
      if (Math.abs(words(stripped) - totalWords) > 6) {
        console.warn(
          "[calm-story] vocalScript diverged from scenes — using untagged script"
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
      shape: shape.key,
      look:
        typeof parsed.look === "string" && parsed.look.trim()
          ? parsed.look.trim()
          : "Moody cinematic natural light, rich muted colors, soft atmospheric haze",
      scenes,
      script,
      vocalScript,
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
 * Image prompt for one calm-story scene — same photoreal DNA as the
 * ambient format, plus the script's shared "look" line so every scene
 * reads as one continuous film.
 */
export function buildCalmStorySceneImagePrompt(opts: {
  look: string;
  scene: Pick<CalmStoryScene, "visual">;
}): string {
  return [
    `Breathtaking photorealistic cinematic photograph: ${opts.scene.visual}`,
    `Consistent film look across a series of scenes — ${opts.look}`,
    "Shot on a full-frame camera, rich natural color grading, soft gradients, immense depth and atmosphere. Serene, cinematic, awe-inspiring.",
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
    "Crisp, sharp, high-definition cinematic footage with steady soft lighting and clean detail throughout.",
  ].join(" ");
}

/**
 * Split the video's runtime into per-scene windows weighted by each
 * scene's share of the narration words (the narration is ONE continuous
 * read — word share is what keeps each scene on screen while its lines
 * are being spoken). Crossfades consume `xfadeSec` per join, so the
 * windows sum to target + xfade*(n-1). Every window is at least
 * `minSec` so the crossfade math never starves a scene.
 */
export function calmStorySceneWindows(
  scenes: Pick<CalmStoryScene, "narration">[],
  targetSec: number,
  xfadeSec: number = CALM_STORY_XFADE_SEC,
  minSec: number = 2.5
): number[] {
  const counts = scenes.map(
    (s) => s.narration.split(/\s+/).filter(Boolean).length || 1
  );
  const totalWords = counts.reduce((a, b) => a + b, 0);
  const totalSec = targetSec + xfadeSec * (scenes.length - 1);
  const floor = Math.max(minSec, xfadeSec * 2 + 0.2);
  let windows = counts.map((c) => (c / totalWords) * totalSec);
  // Enforce the floor, taking the deficit from the largest windows.
  windows = windows.map((w) => Math.max(floor, w));
  const excess = windows.reduce((a, b) => a + b, 0) - totalSec;
  if (excess > 0.05) {
    const shrinkable = windows.map((w) => Math.max(0, w - floor));
    const shrinkTotal = shrinkable.reduce((a, b) => a + b, 0);
    if (shrinkTotal > 0) {
      windows = windows.map(
        (w, i) => w - (shrinkable[i] / shrinkTotal) * Math.min(excess, shrinkTotal)
      );
    }
  }
  return windows.map((w) => Math.round(w * 100) / 100);
}
