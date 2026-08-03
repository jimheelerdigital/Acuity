/**
 * Content Factory — AI-powered topic generation.
 *
 * Uses Claude to generate a fresh carousel topic (headline + reasons)
 * each time, seeded with positioning context and recent headlines to
 * avoid duplicates within a 30-day window.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { StyleLane } from "./brand";

const anthropic = new Anthropic();

// Sonnet for creative copy — fast and cheap (~$0.01/call)
const MODEL = "claude-sonnet-4-6";
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

const STYLE_LANE_KEYS: StyleLane[] = [
  "cinematicReal",
  "toon3d",
  "claymation",
  "stillLife",
  "flatGraphic",
  "paperDiorama",
  "risograph",
];

export interface GeneratedTopic {
  slug: string;
  headline: string;
  style: "hook" | "listicle";
  lane: StyleLane;
  reasons: string[];
}

const SYSTEM_PROMPT = `You are a social media content strategist for Ripple, an AI-powered voice self-reflection app. Your job is to write carousel topics that stop the scroll and make people feel deeply seen.

TARGET AUDIENCE: Women aged 40–50 carrying a heavy mental load — work, family, aging parents, invisible labor. They are capable, busy, reflective women who want clarity and relief, not productivity hacks or wellness clichés.

BRAND VOICE: Mirror, not a coach. Reflect, don't advise. Warm but honest.

RULES FOR HEADLINES:
- Short, punchy, scroll-stopping — under 60 characters ideal
- Use formats like "X signs...", "X reasons...", "X things...", "Top X..."
- Emotionally provocative — make them think "that's me"
- No emojis, no all-caps, no clickbait that doesn't deliver
- US English spelling only (color not colour, realize not realise, etc.)

RULES FOR REASON SLIDES:
- Each reason is one short, punchy statement (under 50 characters ideal)
- Written in second person ("you") — speak directly to the reader
- Emotionally resonant — each one should land like "ouch, yeah"
- No ellipses (...), no unnecessary punctuation
- Each reason makes the viewer want to swipe to the next one
- The last reason should feel like a mic drop or emotional climax
- US English spelling only

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

OUTPUT FORMAT (strict JSON, no markdown):
{
  "headline": "the carousel headline",
  "style": "hook" or "listicle",
  "reasons": ["reason 1", "reason 2", ...],
  "reasonCount": 5 or 6 or 7
}

Generate 5-7 reasons per topic. Vary the count.`;

/**
 * Generate a fresh carousel topic using Claude, avoiding recent headlines.
 */
export async function generateTopic(
  recentHeadlines: string[]
): Promise<GeneratedTopic> {
  const { prisma } = await import("@/lib/prisma");

  const avoidList = recentHeadlines.length > 0
    ? `\n\nDO NOT repeat or closely resemble any of these recent headlines:\n${recentHeadlines.map((h) => `- ${h}`).join("\n")}`
    : "";

  const userPrompt = `Generate one new carousel topic for Ripple's Instagram/TikTok.${avoidList}

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

    return {
      slug,
      headline: parsed.headline,
      style: parsed.style === "hook" ? "hook" : "listicle",
      lane,
      reasons: parsed.reasons as string[],
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
