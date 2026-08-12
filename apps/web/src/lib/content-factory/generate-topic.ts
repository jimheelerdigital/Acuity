/**
 * Content Factory — AI-powered topic generation.
 *
 * Uses Claude to generate a fresh carousel topic (headline + reasons)
 * each time, seeded with positioning context and recent headlines to
 * avoid duplicates within a 30-day window.
 */

import Anthropic from "@anthropic-ai/sdk";
import { isMood, type Mood, type StyleLane } from "./brand";
import type { SlideEmotion } from "./animate-cover";

const anthropic = new Anthropic();

// Sonnet for creative copy — fast and cheap (~$0.01/call)
const MODEL = "claude-sonnet-4-6";
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

const STYLE_LANE_KEYS: StyleLane[] = [
  "cinematicReal",
  "toon3d",
  "claymation",
  "flatGraphic",
  "paperDiorama",
];

export interface GeneratedTopic {
  slug: string;
  headline: string;
  style: "hook" | "listicle";
  lane: StyleLane;
  reasons: string[];
  /**
   * Engineered comment gap (2026-08-12): the most obvious reason,
   * deliberately kept off the slides so viewers add it in the comments.
   */
  withheldReason?: string;
  /** Dominant mood of the post — drives cover expression + motion fallback. */
  mood?: Mood;
  /** Bespoke emotion direction for the cover slide. */
  coverEmotion?: SlideEmotion;
  /** Bespoke emotion direction per reason slide, same order as `reasons`. */
  reasonEmotions?: SlideEmotion[];
}

const SYSTEM_PROMPT = `You are a social media content strategist for Ripple, an AI-powered voice self-reflection app. Your job is to write carousel topics that stop the scroll and make people feel deeply seen.

TARGET AUDIENCE: Women aged 40–50 carrying a heavy mental load — work, family, aging parents, invisible labor. They are capable, busy, reflective women who want clarity and relief, not productivity hacks or wellness clichés.

BRAND VOICE: Mirror, not a coach. Reflect, don't advise. Warm but honest.

OPTIMIZATION GOAL: Every headline and reason list is engineered to drive SAVES, SHARES, and COMMENTS — the three signals the algorithm rewards most. Likes don't matter.
- SAVES come from reference value: content she'll want to return to ("save this for the next hard week").
- SHARES come from identity recognition: content she immediately sends to a friend, sister, or group chat with "this is so us."
- COMMENTS come from self-identification: lists where she HAS to say which number is her.

RULES FOR HEADLINES:
- EVERY headline MUST start with a number. No exceptions. No vague headlines without a number.
- Short, punchy, scroll-stopping — under 60 characters ideal
- VARY the headline format every time. Rotate across these numbered structures — do NOT default to "signs" repeatedly:
  • "X reasons..." (e.g. "6 reasons you're exhausted and none of them are sleep")
  • "X signs..." (e.g. "7 signs you're burnt out, not just tired")
  • "X things nobody tells you about..." (e.g. "5 things nobody tells you about the mental load")
  • "X things you do that..." (e.g. "5 things you do every day that nobody notices")
  • "X habits..." (e.g. "6 habits that are secretly draining you")
  • "X truths..." (e.g. "5 truths about midlife nobody says out loud")
  • "X lies you tell yourself..." (e.g. "6 lies you tell yourself to keep the peace")
  • "X questions you've been avoiding..." (e.g. "5 questions you've been avoiding since your 40th")
  • "X quiet ways you..." (e.g. "5 quiet ways you abandon yourself every day")
  • "X things you'd never say out loud..." (e.g. "6 things you'd never say out loud but think daily")
  • "X reminders for..." — save-bait format (e.g. "7 reminders for the week you're barely holding it together")
  • "X texts you should send..." — share-bait format (e.g. "5 things every exhausted friend needs to hear")
- The strongest hooks combine a number + a curiosity gap + a quiet accusation the reader can't deny. "5 things you celebrate for others but never for yourself" works because she has to swipe to find out if she's guilty — and she already knows she is.
- The number in the headline MUST match the number of reason slides generated
- Emotionally provocative — make them think "that's me" and then "I need to send this to her"
- No emojis, no all-caps, no clickbait that doesn't deliver
- US English spelling only (color not colour, realize not realise, etc.)

RULES FOR REASON SLIDES:
- Each reason is one short, punchy statement (under 50 characters ideal)
- Written in second person ("you") — speak directly to the reader
- Emotionally resonant — each one should land like "ouch, yeah"
- At least one reason should be so specific and so relatable that she screenshots or shares it — hyper-specific beats general ("you rehearse the argument in the shower" beats "you overthink")
- No ellipses (...), no unnecessary punctuation
- Each reason makes the viewer want to swipe to the next one
- The last reason should feel like a mic drop or emotional climax — the one she sends to a friend
- US English spelling only

ENGINEERED COMMENT GAP:
Also write "withheldReason" — the MOST OBVIOUS, most universally relatable reason for this topic, deliberately kept OFF the slide list. The list should feel almost complete but missing the one everyone thinks of first, so viewers rush to the comments to add it ("how did you not include X??"). The withheld reason must genuinely belong on the list (same voice, same specificity) and must NOT overlap with any listed reason. It is used as comment bait in the caption, never shown on a slide.

CONTENT THEMES TO DRAW FROM:
- Mental load and invisible labor
- Repeating patterns and self-sabotage
- Failed journaling / voice vs writing
- Emotional exhaustion vs laziness
- Identity loss inside roles (mom, wife, employee)
- Relationship dynamics and communication
- Self-care vs wellness culture BS
- 3am thoughts and unprocessed feelings
- Permission to change, grow, evolve after 40
- The gap between knowing and doing
- Boundaries, people-pleasing, shutting down
- Sunday scaries, burnout, decision fatigue

EMOTION DIRECTION (these posts are animated — the character's face and motion MUST match the text):
Every post has a dominant mood and EVERY slide (cover + each reason) gets its own emotion direction matched to the emotional weight of its exact text. Available moods: "heavy" (exhausted, drained), "tender" (vulnerable, quietly sad), "wry" (knowing, self-aware, "ouch, that's me"), "frustrated" (fed up, tense), "hopeful" (relief, release, healing).
- Never default to happy or joyous. If a slide's text is draining, an accusation, or an "ouch" truth, the woman must read tired, tender, or fed up — not smiling.
- The mood can shift across the arc (e.g. heavy → heavy → frustrated → tender → hopeful when the last reason lands as release). The cover carries the post's dominant mood.
- For each slide also write a "motion": ONE physical micro-gesture the woman performs in a 4-second video, embodying that slide's feeling.

STRICT RULES for every "motion":
- She stays in the same spot and pose. Lips closed — no talking, no mouthing words.
- No walking, no standing up, no sitting down, no turning around, no leaving, no new actions, no props, no camera directions.
- ONLY movements of her face, eyes, head, shoulders, hands, and breath. Think: a slow blink, a jaw tightening, shoulders dropping, a hand pressed to her chest, a head shake of disbelief.
- Under 20 words, present tense, written as a continuation of "She ..." (e.g. "lets her shoulders sink with a long exhale, eyes closing briefly").

OUTPUT FORMAT (strict JSON, no markdown):
{
  "headline": "the carousel headline",
  "style": "hook" or "listicle",
  "reasons": ["reason 1", "reason 2", ...],
  "withheldReason": "the obvious one deliberately left off the list",
  "reasonCount": 5 or 6 or 7 or 8 or 9 or 10,
  "mood": "heavy" | "tender" | "wry" | "frustrated" | "hopeful",
  "cover": { "mood": "...", "motion": "..." },
  "reasonEmotions": [{ "mood": "...", "motion": "..." }, ...]
}

"reasonEmotions" MUST have exactly one entry per reason, in the same order as "reasons".

Generate 5-10 reasons per topic. Vary the count each time.`;

/**
 * Generate a fresh carousel topic using Claude, avoiding recent headlines.
 *
 * `maxReasons` caps the reason count (used by the fully animated daily
 * post, where every reason slide becomes a video). The cap must be given
 * to Claude — not applied after the fact — because the headline's number
 * has to match the reason count.
 */
export async function generateTopic(
  recentHeadlines: string[],
  opts?: { maxReasons?: number }
): Promise<GeneratedTopic> {
  const { prisma } = await import("@/lib/prisma");

  const avoidList = recentHeadlines.length > 0
    ? `\n\nDO NOT repeat or closely resemble any of these recent headlines:\n${recentHeadlines.map((h) => `- ${h}`).join("\n")}`
    : "";

  const maxReasons = opts?.maxReasons;
  const reasonCap = maxReasons
    ? `\n\nIMPORTANT: Generate at most ${maxReasons} reasons for this topic (5-${maxReasons}). The number in the headline must match the reason count.`
    : "";

  const userPrompt = `Generate one new carousel topic for Ripple's Instagram/TikTok.${avoidList}${reasonCap}

Return ONLY valid JSON, no other text.`;

  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const durationMs = Date.now() - start;
    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    const costCents = Math.ceil(
      (tokensIn * INPUT_COST_PER_TOKEN + tokensOut * OUTPUT_COST_PER_TOKEN) *
        100
    );

    await prisma.claudeCallLog.create({
      data: {
        purpose: "carousel-topic-generation",
        model: MODEL,
        tokensIn,
        tokensOut,
        costCents,
        durationMs,
        success: true,
      },
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Parse JSON from response (handle potential markdown wrapping)
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr);

    // Build slug from headline
    const slug = parsed.headline
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 60);

    // Pick a random style lane
    const lane =
      STYLE_LANE_KEYS[Math.floor(Math.random() * STYLE_LANE_KEYS.length)];

    // Emotion directions — validated lightly here (mood must be from the
    // taxonomy); motion safety is enforced at video-prompt build time.
    const mood: Mood | undefined = isMood(parsed.mood) ? parsed.mood : undefined;
    const parseEmotion = (raw: unknown): SlideEmotion => {
      const e = (raw ?? {}) as { mood?: unknown; motion?: unknown };
      return {
        mood: isMood(e.mood) ? e.mood : mood,
        motion: typeof e.motion === "string" ? e.motion : undefined,
      };
    };
    const reasons = parsed.reasons as string[];
    const rawReasonEmotions = Array.isArray(parsed.reasonEmotions)
      ? (parsed.reasonEmotions as unknown[])
      : [];
    const reasonEmotions = reasons.map((_, i) => parseEmotion(rawReasonEmotions[i]));

    return {
      slug,
      headline: parsed.headline,
      style: parsed.style === "hook" ? "hook" : "listicle",
      lane,
      reasons,
      withheldReason:
        typeof parsed.withheldReason === "string" && parsed.withheldReason.trim()
          ? parsed.withheldReason.trim()
          : undefined,
      mood,
      coverEmotion: parseEmotion(parsed.cover),
      reasonEmotions,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    await prisma.claudeCallLog.create({
      data: {
        purpose: "carousel-topic-generation",
        model: MODEL,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        durationMs,
        success: false,
        errorMessage:
          err instanceof Error ? err.message : "Unknown error",
      },
    });
    throw err;
  }
}
