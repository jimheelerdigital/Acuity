/**
 * Content Factory — AI-powered topic generation.
 *
 * Uses Claude to generate a fresh carousel topic (headline + reasons)
 * each time, seeded with positioning context and recent headlines to
 * avoid duplicates within a 30-day window.
 */

import Anthropic from "@anthropic-ai/sdk";
import { FORCED_STYLE_LANE, isMood, type Mood, type StyleLane } from "./brand";
import type { SlideEmotion } from "./animate-cover";
import { fetchGrowthosResearch, growthosResearchBlock } from "./growthos-research";

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
   * One short supporting sentence per reason (2026-08-16, per Keenan —
   * modeled on "things to do every day for yourself" infographics where
   * each item has a title + a one-line explanation). Same order as
   * `reasons`. Rendered smaller under the main slide text.
   */
  details?: string[];
  /** Dominant mood of the post — drives cover expression + motion fallback. */
  mood?: Mood;
  /** Bespoke emotion direction for the cover slide. */
  coverEmotion?: SlideEmotion;
  /** Bespoke emotion direction per reason slide, same order as `reasons`. */
  reasonEmotions?: SlideEmotion[];
  /**
   * LLM-written caption opener, ONE short line in the page-owner's
   * voice (2026-08-20, per Keenan: captions must read personal, never
   * AI-written; 2026-08-21: short — the caption never repeats the slides).
   */
  captionOpen?: string;
  /** LLM-written comment/share ask line, same voice. */
  captionClose?: string;
}

const SYSTEM_PROMPT = `You are a social media content strategist for Ripple, an AI-powered voice self-reflection app. Your job is to write carousel topics that stop the scroll and make people feel deeply seen.

TARGET AUDIENCE: Women aged 40–50 carrying a heavy mental load — work, family, aging parents, invisible labor. They are capable, busy, reflective women who want clarity and relief, not productivity hacks or wellness clichés.

BRAND VOICE: Mirror, not a coach. Reflect, don't advise. Warm but honest.

OPTIMIZATION GOAL: Every headline and reason list is engineered to drive SAVES, SHARES, and COMMENTS — the three signals the algorithm rewards most. Likes don't matter.
- SAVES come from reference value: content she'll want to return to ("save this for the next hard week").
- SHARES come from identity recognition: content she immediately sends to a friend, sister, or group chat with "this is so us."
- COMMENTS come from self-identification: lists where she HAS to say which number is her.

TWO CONTENT ARCHETYPES — pick ONE per post, and alternate so the feed stays fresh (roughly half and half over time):

1. RESONANCE — "that's me" recognition lists. Signs, truths, quiet ways, lies you tell yourself. She sees herself in every item and has to send it to a friend. Optimized for shares and comments.

2. ACTIONABLE — genuinely helpful, save-worthy lists. Small habits, daily resets, things to do for yourself, questions worth asking yourself. Think of the classic "7 things to do every day for yourself" infographic: each item is a doable habit with a one-line explanation of how or why. Every item must be something a busy, exhausted woman could actually do — no "wake up at 5am", no expensive wellness, no 20-step routines. Optimized for saves ("I'll come back to this").

RULES FOR HEADLINES:
- EVERY headline MUST start with a number. No exceptions. No vague headlines without a number.
- Short, punchy, scroll-stopping — under 60 characters ideal
- VARY the headline format every time — these are starting points, not templates. Remix them, invent new ones in the same spirit. Nothing is set in stone:
  RESONANCE structures:
  • "X reasons..." (e.g. "6 reasons you're exhausted and none of them are sleep")
  • "X signs..." (e.g. "7 signs you're burnt out, not just tired")
  • "X things nobody tells you about..." (e.g. "5 things nobody tells you about the mental load")
  • "X truths..." (e.g. "5 truths about midlife nobody says out loud")
  • "X lies you tell yourself..." (e.g. "6 lies you tell yourself to keep the peace")
  • "X quiet ways you..." (e.g. "5 quiet ways you abandon yourself every day")
  • "X things you'd never say out loud..." (e.g. "6 things you'd never say out loud but think daily")
  • "X texts you should send..." — share-bait format (e.g. "5 things every exhausted friend needs to hear")
  ACTIONABLE structures:
  • "X things to do every day for..." (e.g. "7 things to do every day for yourself")
  • "X tiny habits..." (e.g. "6 tiny habits for the weeks you're running on empty")
  • "X ways to get a piece of yourself back"
  • "X questions to ask yourself..." (e.g. "5 questions to ask yourself before you say yes again")
  • "X small resets for..." (e.g. "6 small resets for when the day already got away from you")
  • "X reminders for..." — save-bait (e.g. "7 reminders for the week you're barely holding it together")
- The strongest hooks combine a number + a curiosity gap + something she can't deny — either a quiet accusation or a need she recognizes. "5 things you celebrate for others but never for yourself" works because she has to swipe to find out if she's guilty — and she already knows she is.
- CLARITY TEST (mandatory — run it before finalizing): read the headline out loud. It must sound like a complete, natural sentence a friend would text you, instantly understandable on the FIRST read. No clipped grammar, no missing words, no phrase that needs a second read to parse. "5 reminders for the week you have nothing left" FAILS (nothing left... to what? the sentence is broken); "5 reminders for when you have nothing left to give" passes. If the headline is even slightly awkward, rewrite it until it's effortless.
- RELATABILITY TEST (mandatory): she must see her actual life in the headline within one second — name a situation she's literally in ("6 signs you're everyone's emergency contact but nobody's priority"), not an abstract concept. The headline names the FEELING or the situation; the reasons stay hidden so she HAS to swipe to find out what they are. If the headline doesn't create that itch to swipe, it's not done.
- The number in the headline MUST match the number of item slides generated
- Emotionally provocative — make them think "that's me" and then "I need to send this to her" (or, for ACTIONABLE, "I need to save this")
- No emojis, no all-caps, no clickbait that doesn't deliver
- US English spelling only (color not colour, realize not realise, etc.)

RULES FOR ITEM SLIDES (each "reason" is one slide) — MAIN ANSWER + EXPLANATION structure (2026-08-16, per Keenan):
- Each item is a SHORT, punchy MAIN ANSWER — 2 to 5 words, like the headline of the slide ("more rest", "a big change", "setting boundaries", "asking for help", "say no once today"). NEVER a full sentence. The details entry carries the explanation.
- Think of the item as what would fit on a sticky note. If it's longer than ~30 characters, cut it down and move the rest into the detail.
- RESONANCE items: name the thing she does or feels in 2-5 words ("the shower argument", "peacekeeping by silence", "replying instantly to everyone"). The detail delivers the "ouch, yeah" recognition in a full sentence.
- ACTIONABLE items: a clear, doable habit named in 2-5 words ("water before coffee", "one honest no", "step outside first"). The detail explains how or why. The last item should land emotionally, not just practically.
- No ellipses (...), no unnecessary punctuation
- Each item makes the viewer want to swipe to the next one
- US English spelling only

COMPLETENESS (2026-08-13, per Keenan): the list must be COMPLETE — include the most obvious, most relatable reason on the slides. Never deliberately withhold one; a list that visibly skips the one everyone thinks of first reads as broken, not clever.

RULES FOR DETAILS (every item ALSO gets one supporting sentence, shown smaller under the main answer — this is the explanation, it is REQUIRED):
- One sentence per item, under 90 characters, sentence case
- The detail carries the meaning the short main answer can't — together they read like "more rest — sometimes it's a good thing to catch up on sleep" or "a big change — your greatest growth can come from big changes"
- RESONANCE details: deepen the recognition with a specific, undeniable beat ("Even the group chat gets a faster reply than your own needs do.")
- ACTIONABLE details: say how or why in plain, human words ("Your brain sorts itself out when your hands are busy and your phone isn't.")
- Written like a real person talking to a friend — warm, direct, zero jargon, zero wellness-speak
- Never repeat the main line's words back at her; add something new
- US English spelling only

TONE + PROOFREAD (non-negotiable):
- Write in as human a tone as possible. Read every line back as if you're a normal, tired person scrolling at 9pm — if a line sounds like a brand, a therapist's pamphlet, or an AI wrote it, rewrite it.
- Every line must make immediate sense on first read. No abstract phrasing, no poetry that needs decoding.
- Proofread the whole set before answering: grammar, natural phrasing, headline number matches item count, no near-duplicate items.

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
- The gesture must ACT OUT that slide's exact text — visible and emotionally unmistakable, never a generic idle (2026-08-16, per Keenan: subtle-only clips read as boring).
- She stays in the same spot and pose. Lips closed — no talking, no mouthing words.
- No walking, no standing up, no sitting down, no turning around, no leaving, no camera directions, no NEW props appearing (she may interact with objects already in the scene).
- Movements of her face, eyes, head, shoulders, hands, and breath. Think: a jaw tightening as she sets the phone face-down, a hand pressed hard to her chest, a fed-up head shake, shoulders finally dropping in relief.
- Under 20 words, present tense, written as a continuation of "She ..." (e.g. "lets her shoulders sink with a long exhale, eyes closing briefly").

CAPTION (2026-08-20, per Keenan: captions must read personal, never AI-written. 2026-08-21: SHORT — the slides carry the content, the caption never repeats them):
The post caption is written by YOU, in the voice of a real woman who runs this page — she's in the audience herself, posting to her own page. Text-message tone, lowercase-leaning, contractions always, no marketing words, no emoji (one at most), nothing that sounds like a brand or a coach.
- "captionOpen": ONE short line, under 12 words. It's the only line visible before "...more", so it must hook on its own — a personal aside ("number 4 took me out"), a confession, or a direct question to her. NEVER restate the headline, NEVER list or summarize the slides — they can read those in the post.
- "captionClose": ONE line — a comment ask or a share/save ask in the same voice ("tell me which number got you", "send this to the friend who never stops moving"). Vary it; never reuse the examples verbatim.
- The test for both: would a real person paste this from their Notes app? If it reads like copy, rewrite it.

OUTPUT FORMAT (strict JSON, no markdown):
{
  "headline": "the carousel headline",
  "archetype": "resonance" | "actionable",
  "style": "hook" or "listicle",
  "reasons": ["item 1", "item 2", ...],
  "details": ["supporting sentence for item 1", "supporting sentence for item 2", ...],
  "reasonCount": 5 or 6 or 7 or 8 or 9 or 10,
  "mood": "heavy" | "tender" | "wry" | "frustrated" | "hopeful",
  "cover": { "mood": "...", "motion": "..." },
  "reasonEmotions": [{ "mood": "...", "motion": "..." }, ...],
  "captionOpen": "one short hook line in the page-owner's voice",
  "captionClose": "one comment/share ask in the same voice"
}

"details" and "reasonEmotions" MUST each have exactly one entry per item, in the same order as "reasons". ACTIONABLE posts usually lean hopeful or tender (calm, relief, small acts of care) — the emotion must still match each slide's exact text.

Generate 5-10 items per topic. Vary the count each time.`;

/**
 * Generate a fresh carousel topic using Claude, avoiding recent headlines.
 *
 * `maxReasons` caps the reason count (used by the fully animated daily
 * post, where every reason slide becomes a video). The cap must be given
 * to Claude — not applied after the fact — because the headline's number
 * has to match the reason count.
 *
 * `performance` (2026-08-12) feeds real engagement data back into the
 * prompt: headlines that performed best/worst on the account, entered
 * manually by Keenan via the admin metrics form.
 */
export async function generateTopic(
  recentHeadlines: string[],
  opts?: {
    maxReasons?: number;
    performance?: { top: string[]; bottom: string[] };
    /**
     * Force the content archetype (2026-08-24, per Keenan: the two daily
     * animated carousels are a deliberate pair — one negative recognition
     * post, one positive actionable post — so the archetype can't be left
     * to the random alternation).
     */
    archetype?: "resonance" | "actionable";
  }
): Promise<GeneratedTopic> {
  const { prisma } = await import("@/lib/prisma");

  const avoidList = recentHeadlines.length > 0
    ? `\n\nDO NOT repeat or closely resemble any of these recent headlines:\n${recentHeadlines.map((h) => `- ${h}`).join("\n")}`
    : "";

  const maxReasons = opts?.maxReasons;
  const reasonCap = maxReasons
    ? `\n\nIMPORTANT: Generate at most ${maxReasons} reasons for this topic (5-${maxReasons}). The number in the headline must match the reason count.`
    : "";

  const archetypeBlock =
    opts?.archetype === "resonance"
      ? `\n\nTODAY'S ARCHETYPE (mandatory, overrides the alternation rule): RESONANCE. Write a "that's me" recognition list — the negative, uncomfortably accurate framing (reasons you're exhausted, signs you're burnt out, quiet ways you abandon yourself). Do NOT write an actionable how-to list today.`
      : opts?.archetype === "actionable"
        ? `\n\nTODAY'S ARCHETYPE (mandatory, overrides the alternation rule): ACTIONABLE. Write a positive, improvement-forward list — ways to fix, break out, or get a piece of yourself back ("7 ways to break out of a slump"). Every item must be TANGIBLE: a concrete thing she could actually do today, with the detail saying how or why it works. Hopeful and forward-moving, never preachy. Do NOT write a signs/reasons recognition list today.`
        : "";

  const perf = opts?.performance;
  const performanceBlock =
    perf && (perf.top.length > 0 || perf.bottom.length > 0)
      ? `\n\nPERFORMANCE FEEDBACK — real engagement data from this account's posted carousels:\n` +
        (perf.top.length > 0
          ? `These headlines performed BEST (most saves/shares/comments):\n${perf.top.map((h) => `- ${h}`).join("\n")}\n`
          : "") +
        (perf.bottom.length > 0
          ? `These headlines performed WORST:\n${perf.bottom.map((h) => `- ${h}`).join("\n")}\n`
          : "") +
        `Study what separates the two groups — the emotional angle, the specificity, the format — and write a topic that leans into what works. Do NOT copy or lightly rephrase a top headline (the avoid list still applies); extract the underlying appeal and apply it to a fresh angle.`
      : "";

  // growthos research feed (2026-08-21) — best-effort: empty string when
  // the link is unconfigured, growthos is unseeded, or the fetch fails.
  let researchBlock = "";
  try {
    researchBlock = growthosResearchBlock(await fetchGrowthosResearch());
  } catch (err) {
    console.warn(
      "[generate-topic] growthos research unavailable:",
      err instanceof Error ? err.message : err
    );
  }

  const userPrompt = `Generate one new carousel topic for Ripple's Instagram/TikTok.${avoidList}${reasonCap}${archetypeBlock}${performanceBlock}${researchBlock}

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

    // Style lane: forced override first (2026-08-19, per Keenan: toon3d
    // "cartoonish realistic" everywhere for now), else random rotation.
    const lane =
      FORCED_STYLE_LANE ??
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

    // One supporting detail sentence per reason (missing/blank → "").
    const rawDetails = Array.isArray(parsed.details)
      ? (parsed.details as unknown[])
      : [];
    const details = reasons.map((_, i) =>
      typeof rawDetails[i] === "string" ? (rawDetails[i] as string).trim() : ""
    );

    return {
      slug,
      headline: parsed.headline,
      style: parsed.style === "hook" ? "hook" : "listicle",
      lane,
      reasons,
      details,
      mood,
      coverEmotion: parseEmotion(parsed.cover),
      reasonEmotions,
      captionOpen:
        typeof parsed.captionOpen === "string" && parsed.captionOpen.trim()
          ? parsed.captionOpen.trim()
          : undefined,
      captionClose:
        typeof parsed.captionClose === "string" && parsed.captionClose.trim()
          ? parsed.captionClose.trim()
          : undefined,
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
