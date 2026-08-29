/**
 * Content Factory — QUOTE LOOP video (2026-08-28 PM, per Keenan).
 *
 * One devastating line burned on a dark cinematic scene that loops
 * FOREVER — the viewer can't tell where it starts or ends, so they sit
 * with the line and reread it. Runs on BOTH moody funnels (women 18 UTC,
 * men 19 UTC) with the same visual DNA as the moody carousels.
 *
 * The loop is guaranteed by MATH, not by the model (per Keenan: "must
 * actually loop"): seamlessLoopWithOverlay crossfades the Higgsfield
 * clip into itself and trims a segment whose first and last frames are
 * pixel-identical, burns the quote in the same encode, then stream-copy
 * concatenates copies to 12-18s. Ambient-lane lesson applies to the
 * scene itself: ONE barely-perceptible motion, nothing appears or
 * leaves, minimal single-subject frames only.
 *
 * Env knobs:
 * - HIGGSFIELD_QUOTE_VIDEO_MODEL — better-model override for this lane
 *   (per Keenan: "use a better model of higgsfield if needed"); falls
 *   back to HIGGSFIELD_VIDEO_MODEL.
 * - HIGGSFIELD_QUOTE_CLIP_DURATION — seconds per source clip
 *   (default 10; drop to 5 if the model rejects 10).
 */

import Anthropic from "@anthropic-ai/sdk";
import { AUDIENCE_BRIEF, SCENE_BRIEF, type MoodyAudience } from "./moody-carousel";

const anthropic = new Anthropic();
const CLAUDE_MODEL = "claude-sonnet-4-6";
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

/** Seconds per Higgsfield source clip before looping. */
export function quoteClipDuration(): number {
  const d = Number(process.env.HIGGSFIELD_QUOTE_CLIP_DURATION);
  return Number.isFinite(d) && d > 0 ? d : 10;
}

/** Optional better-model override for the quote lane. */
export function quoteVideoModel(): string | undefined {
  return process.env.HIGGSFIELD_QUOTE_VIDEO_MODEL || undefined;
}

/** Final video length window — 12-18s (per Keenan 2026-08-28). */
export const QUOTE_LOOP_MIN_SEC = 12;
export const QUOTE_LOOP_MAX_SEC = 18;

export interface QuoteConcept {
  slug: string;
  /** The single burned-in line. */
  quote: string;
  /** Short label persisted as storyTheme so future quotes avoid repeats. */
  theme: string;
  /** The photograph the clip animates from. */
  scene: string;
  /** ONE barely-perceptible natural motion, under 15 words. */
  motion: string;
}

const buildQuoteSystemPrompt = (
  audience: MoodyAudience
) => `You write single-line quote videos for a dark, moody, minimal account. Each post is ONE short devastating line of white text centered on a looping cinematic scene. The viewer stops, rereads it, and sits with it.

${AUDIENCE_BRIEF[audience]}

${SCENE_BRIEF[audience]}

THE QUOTE:
- ONE line, 6-16 words. No attribution, no quotation marks.
- It must sting with recognition — a compressed truth the viewer already suspects about themselves ("Nobody is coming to save you. Good — you were enough all along." energy for men; "You stopped asking for things so long ago they think you don't want any." energy for women).
- Short declarative words. No metaphors that need decoding, no rhymes, no clichés ("hard work pays off"), no advice-verbs ("try to", "remember to").
- Second person or plain statement. Read it out loud — it should sound inevitable.

THE SCENE (this image will be gently animated and looped, so):
- One concrete sentence describing the photograph (place, light, weather, materials) per SCENES above. DIM — white text must be perfectly legible at frame center.
- The scene must contain exactly ONE natural, continuous, repeatable motion and nothing else that could move: rain streaking down glass, steam rising from a cup, a candle flame, snow falling past a window, curtains barely stirring, fog drifting past towers.
- Keep the middle of the frame calm and uncluttered — the text lives there.
- "motion": that ONE movement in under 15 words ("rain streaks slowly down the glass").

RULES:
- US English. No emojis, no hashtags. Never mention any app, product, journaling, or AI.
- "theme": a 2-4 word label of the quote's subject (for repeat-avoidance).

OUTPUT (strict JSON, no markdown):
{
  "quote": "...",
  "theme": "...",
  "scene": "...",
  "motion": "..."
}`;

/** Generate one quote-loop concept for the given funnel. */
export async function generateQuoteConcept(
  audience: MoodyAudience,
  avoid: string[]
): Promise<QuoteConcept> {
  const { prisma } = await import("@/lib/prisma");

  const avoidBlock =
    avoid.length > 0
      ? `\n\nDo NOT repeat or closely resemble any of these recent quotes/themes:\n${avoid.map((h) => `- ${h}`).join("\n")}`
      : "";
  const userPrompt = `Write one new quote video for the ${audience === "men" ? "young aspiring men" : "women 40-50"} funnel.${avoidBlock}\n\nReturn ONLY valid JSON.`;

  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 600,
      system: buildQuoteSystemPrompt(audience),
      messages: [{ role: "user", content: userPrompt }],
    });

    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    await prisma.claudeCallLog.create({
      data: {
        purpose: `quote-loop-concept-${audience}`,
        model: CLAUDE_MODEL,
        tokensIn,
        tokensOut,
        costCents: Math.ceil(
          (tokensIn * INPUT_COST_PER_TOKEN + tokensOut * OUTPUT_COST_PER_TOKEN) * 100
        ),
        durationMs: Date.now() - start,
        success: true,
      },
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr) as {
      quote?: string;
      theme?: string;
      scene?: string;
      motion?: string;
    };

    const quote = (parsed.quote ?? "").trim();
    const scene = (parsed.scene ?? "").trim();
    const motion = (parsed.motion ?? "").trim();
    if (!quote || quote.split(/\s+/).length < 4 || !scene || !motion) {
      throw new Error(
        `Quote concept unusable: quote="${quote.slice(0, 60)}", scene=${Boolean(scene)}, motion=${Boolean(motion)}`
      );
    }

    const slug = quote
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 48);

    return {
      slug: `quote-${audience}-${slug}`,
      quote,
      theme: (parsed.theme ?? "").trim() || quote.slice(0, 40),
      scene,
      motion,
    };
  } catch (err) {
    await prisma.claudeCallLog.create({
      data: {
        purpose: `quote-loop-concept-${audience}`,
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
 * i2v prompt for the quote clip — the ambient-lane lesson verbatim: ONE
 * barely-perceptible motion, locked camera, scene never changes. The
 * seamless loop is enforced by ffmpeg afterwards, but the calmer and
 * more constant the motion, the less visible the self-dissolve at the
 * loop point.
 */
export function buildQuoteVideoPrompt(concept: Pick<QuoteConcept, "motion">): string {
  return [
    `Subtle, minimal ambient motion — one gentle natural movement only: ${concept.motion}.`,
    "The scene is a living photograph: the single movement continues smoothly at a constant speed the whole time.",
    "The scene itself NEVER changes — nothing new appears, nothing leaves, nothing transforms.",
    "Fixed, locked, completely static camera — no pan, no zoom, no drift, no push-in.",
    "Hyper-realistic, crisp, cinematic, true-to-life light and materials.",
  ].join(" ");
}
