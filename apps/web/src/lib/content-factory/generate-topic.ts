/**
 * Content Factory — AI-powered topic generation.
 *
 * Uses Claude to generate a fresh carousel topic (headline + reasons)
 * each time, seeded with positioning context and recent headlines to
 * avoid duplicates within a 30-day window.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  FORCED_STYLE_LANE,
  isMood,
  type CarouselVisualStyle,
  type Mood,
  type StyleLane,
} from "./brand";
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
   * LLM-written thought-provoking question — the ENTIRE caption above
   * the hashtags (2026-08-28, per Keenan: "just give me a thought
   * provoking question and then 3-4 hashtags. this goes for all posts").
   */
  captionQuestion?: string;
}

/**
 * Per-style scene direction for the daily carousels (2026-08-28, per
 * Keenan: no more AI animation on the negative/positive carousels — JUST
 * image gen, rotating four visual styles).
 */
const SCENE_DIRECTION: Record<CarouselVisualStyle, string> = {
  aesthetic: `For each slide write a "scene" — a PHOTOREAL still, like a casual aesthetic photo taken on a phone in a real home. ONE concrete visual that embodies that slide's exact text:
- NO PEOPLE, EVER. No faces, no bodies, no silhouettes, no reflections of anyone, no mirrors. At most a hand at the edge of frame holding a mug or resting on a table.
- The feeling lives in objects and light: a mug going cold beside an open laptop, a phone face-down on rumpled sheets, rain on the kitchen window over an untouched to-do list, one lit candle in a dark kitchen, a kettle steaming with nobody there.
- Each scene must be DIFFERENT from every other slide's — different room, different subject, different light, different distance (close-up, tabletop, doorway). Under 30 words, concrete nouns only, no abstractions.`,
  avatar: `For each slide write a "scene" — ONE moment starring the SAME animated character: a relatable, tired-but-warm woman in her 40s rendered like a modern Pixar film, physically ACTING OUT that slide's exact text with her posture, face, and hands (slumped at the kitchen table over cold coffee, mid-laugh pulling on sneakers by the door, staring at a glowing phone in the dark).
- Describe her action, expression, and the room. She appears in EVERY slide and must read as the same woman each time.
- Each scene must be DIFFERENT from every other slide's — different room, different action, different light, different distance. Under 30 words, concrete.`,
  illustrated: `For each slide write a "scene" — ONE illustrated still, like a frame of background art from a modern animated film. NO people, no characters, no silhouettes:
- The feeling lives in rooms, objects, weather, and light: a lamp-lit kitchen at night with dishes waiting, rain streaking an attic window, a quiet hallway with light under one door.
- Each scene must be DIFFERENT from every other slide's — different room or place, different subject, different light. Under 30 words, concrete nouns only.`,
  nature: `For each slide write a "scene" — ONE breathtaking hyper-realistic NATURE scene whose weather, season, and light embody that slide's exact text (fog sitting low over a still lake, a single tree in an open field at dusk, waves hitting rocks under a grey sky, morning sun breaking through pines).
- NO people, no animals in focus, no buildings.
- Each scene must be DIFFERENT from every other slide's — different landscape, different weather, different time of day. Under 30 words, concrete nouns only.`,
};

const buildSystemPrompt = (
  visualStyle: CarouselVisualStyle
) => `You are a social media content strategist for Ripple, an AI-powered voice self-reflection app. Your job is to write carousel topics that stop the scroll and make people feel deeply seen.

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
- Short, punchy, scroll-stopping — under 40 characters ideal
- ⭐ SIMPLE, BROAD, MASS-APPEAL (2026-08-28, per Keenan — THE most important headline rule, it overrides everything else): the headline must name a feeling or situation so universal that a TON of people instantly think "that's me". Number + dead-simple noun phrase, nothing more.
  GOOD — exactly this simple and this broad:
  • "5 signs you're burnt out"
  • "6 reasons to keep pushing"
  • "5 ways to get out of a slump"
  • "8 things holding you back"
  • "6 signs you're falling behind"
  • "6 ways to gain momentum"
  • "5 ways to have a better day"
  BAD — too specific, too clever, too written (never produce headlines like these):
  • "6 small things you do when you've given everything away today"
  • "6 signs you've made yourself the easiest person to disappoint"
  • "8 things you stopped wanting because wanting hurt too much"
  SIMPLICITY TEST (mandatory): if the headline contains a subordinate clause, a poetic turn, an "ouch"-clever accusation, or ANY idea that takes a beat to parse, it FAILS — cut it down until it's a phrase a stranger could repeat back after hearing it once. The specificity, cleverness, and emotional depth belong in the SLIDES; the headline is the wide-open door as many people as possible can walk through.
  NO FILLER WORDS (2026-08-28, per Keenan): never pad the headline with trailing filler like "today", "right now", "in your life", "for real". "5 ways to reset your mind" is perfect; "6 ways to reset your mind today" is not. If a word can be cut without changing the meaning, cut it.
  Formats to rotate: "X signs...", "X ways...", "X reasons...", "X things...", "X habits...", "X reminders..." — always with a broad, plain object ("you're burnt out", "you're doing too much", "to get your energy back", "holding you back").
- CLARITY TEST (mandatory — run it before finalizing): read the headline out loud. It must sound like a complete, natural phrase a friend would text you, instantly understandable on the FIRST read. No clipped grammar, no missing words. If the headline is even slightly awkward, rewrite it until it's effortless.
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

VISUAL DIRECTION (these posts are STATIC image carousels — every slide is one still image, and YOU direct the imagery):
Every post has a dominant mood and EVERY slide (cover + each reason) gets its own "mood" and "scene" matched to the emotional weight of its exact text. Available moods: "heavy" (exhausted, drained), "tender" (vulnerable, quietly sad), "wry" (knowing, self-aware, "ouch, that's me"), "frustrated" (fed up, tense), "hopeful" (relief, release, healing).
- Never default to happy or joyous. If a slide's text is draining, an accusation, or an "ouch" truth, the visual must read tired, tender, or fed up — not smiling.
- The mood can shift across the arc (e.g. heavy → heavy → frustrated → tender → hopeful when the last reason lands as release). The cover carries the post's dominant mood.

${SCENE_DIRECTION[visualStyle]}

CAPTION (2026-08-28, per Keenan: one question, a few hashtags, done):
- "captionQuestion": ONE thought-provoking question in the voice of the real woman who runs the page — under 15 words, lowercase-leaning, text-message tone, contractions. It should make her audience stop and answer honestly in their heads ("when did being tired become your baseline?"). NEVER restate the headline, NEVER summarize the slides, NEVER a share/send/"send this to" ask, NEVER "which one are you doing first", NEVER mention any app or product. At most one emoji, only if natural.
- That question plus a few hashtags IS the entire caption — nothing else is written.

OUTPUT FORMAT (strict JSON, no markdown):
{
  "headline": "the carousel headline",
  "archetype": "resonance" | "actionable",
  "style": "hook" or "listicle",
  "reasons": ["item 1", "item 2", ...],
  "details": ["supporting sentence for item 1", "supporting sentence for item 2", ...],
  "reasonCount": 5 or 6 or 7 or 8 or 9 or 10,
  "mood": "heavy" | "tender" | "wry" | "frustrated" | "hopeful",
  "cover": { "mood": "...", "scene": "..." },
  "reasonEmotions": [{ "mood": "...", "scene": "..." }, ...],
  "captionQuestion": "one thought-provoking question in the page-owner's voice"
}

"details" and "reasonEmotions" MUST each have exactly one entry per item, in the same order as "reasons". ACTIONABLE posts usually lean hopeful or tender (calm, relief, small acts of care) — the emotion must still match each slide's exact text.

Generate 5-10 items per topic. Vary the count each time.`;

// ─── Selfie slideshow topics (2026-08-25, per Keenan) ────────────────────────

export interface GeneratedSelfieTopic {
  slug: string;
  /** First-person cover line, e.g. "this is how i stopped running on empty". */
  headline: string;
  /** First-person step lines, e.g. "i started saying no without a speech". */
  steps: string[];
  /** One supporting sentence per step, same order. */
  details: string[];
  mood?: Mood;
  /**
   * Mirror-selfie scene direction for the cover — the ONLY selfie in
   * the slideshow (2026-08-28, per Keenan): phone covering her face,
   * mirror a little dirty.
   */
  coverScene: string;
  /**
   * Per-step shot. Since 2026-08-28 every step is forced "aesthetic"
   * (no people) — "mirror" stays in the type for the pipeline's shape
   * but never occurs at runtime.
   */
  stepShots: { type: "mirror" | "aesthetic"; scene: string }[];
  /** ONE thought-provoking question — the entire caption above hashtags. */
  captionQuestion?: string;
}

const SELFIE_SYSTEM_PROMPT = `You are writing a first-person photo slideshow for the woman who runs a self-reflection Instagram/TikTok page. She is 40-something, carries a heavy mental load (work, family, aging parents, invisible labor), and posts like a real person — this is HER photo dump, not brand content.

FORMAT: a swipeable image slideshow. Slide 1 (cover) is a mirror selfie of her — phone raised and COVERING her face — with the hook text burned on. It is the ONLY photo of her in the whole slideshow. Each following slide is an aesthetic no-people photo paired with one thing she actually did to fix ONE specific, relatable problem.

AUDIENCE: women ~40-50 exactly like her. They should feel "she's me, and she figured something out" — never lectured.

THE PROBLEM: pick ONE concrete, deeply relatable problem per post (running on empty, doom-scrolling at midnight, snapping at everyone, losing herself in the roles, saying yes to everything, the 3am spiral, never having a minute alone). Specific beats general.

HEADLINE (cover text): first person, lowercase-leaning, starts with "this is how i" — e.g. "this is how i stopped running on empty" or "this is how i got my evenings back". Under 55 characters. It must create the itch to swipe. No numbers required, no emojis.

STEPS (one per slide, 4-6 total):
- Each step is a short first-person line, 3-8 words, lowercase-leaning: "i started leaving my phone in the kitchen", "i stopped apologizing for resting".
- Real, doable, honest — things an exhausted woman could actually do. No 5am clubs, no expensive wellness, no preachy affirmations.
- Each step gets ONE supporting "detail" sentence, under 90 characters, plain human voice — how it felt or why it worked ("the first week i reached for it like a phantom limb").
- The last step should land emotionally — the quiet payoff.
- No emojis anywhere in headline, steps, or details (the text is burned onto photos in sticker type).

SHOTS (one per step, plus the cover):
- "cover": ALWAYS a mirror selfie of her with her raised phone COMPLETELY covering her face — no eyes, nose, or mouth ever visible. The mirror is a little dirty, realistically: light smudges, a few fingerprints, a faint streak catching the light. Write the scene: which mirror, what she wears, the light, her posture. e.g. "full-length bedroom mirror with light smudges, oversized grey sweatshirt and leggings, warm lamp light, phone raised covering her whole face".
- EVERY step's shot is "aesthetic" — a genuinely beautiful first-person phone photo with NO person in it: her steaming coffee by the window, the journal and pen in morning sun, her shoes by the door, the phone face-down on the nightstand, golden light on the unmade bed. It should be the satisfying, pleasing-to-the-eye kind of shot people save. The cover is the ONLY selfie in the slideshow — never put her (or any person) in a step shot.
- Every scene distinct: different room, light, angle, time of day, and subject — no two aesthetic scenes may feature the same object or surface. Under 30 words each, concrete nouns only.
- Each scene must visually echo its step's meaning (the step about the phone shows the phone face-down; the step about walking shows the sneakers or the morning street).

CAPTION — one question, nothing else:
- "captionQuestion": ONE thought-provoking question in her voice, under 15 words, lowercase-leaning, text-message tone — the kind a real woman would type that makes someone stop and answer honestly in their head ("when did resting start feeling like something you have to earn?"). Never restate the headline, never "which one are you doing first", never a share/send ask, never mention any app or product. At most one emoji, and only if it feels natural.
- That question plus a few hashtags IS the entire caption — do not write anything else.

TONE TEST: read every line as a tired real woman at 9pm. If anything sounds like a brand, a coach, or AI, rewrite it. US English spelling.

OUTPUT (strict JSON, no markdown):
{
  "headline": "this is how i ...",
  "problem": "the one problem in a few words",
  "steps": ["i ...", ...],
  "details": ["one sentence", ...],
  "stepCount": 4 | 5 | 6,
  "mood": "heavy" | "tender" | "wry" | "frustrated" | "hopeful",
  "cover": { "scene": "mirror selfie scene, phone covering her face, slightly dirty mirror" },
  "stepShots": [{ "type": "aesthetic", "scene": "..." }, ...],
  "captionQuestion": "one thought-provoking question in her voice"
}
"details" and "stepShots" MUST each have exactly one entry per step, in order.`;

/**
 * Generate a first-person "this is how i ..." selfie-slideshow topic
 * (2026-08-25, per Keenan: realistic mirror-selfie avatar slideshow —
 * same list mechanics as the "7 ways" posts but told as HER story,
 * with steps that fix the problem).
 */
export async function generateSelfieTopic(
  recentHeadlines: string[]
): Promise<GeneratedSelfieTopic> {
  const { prisma } = await import("@/lib/prisma");

  const avoidList =
    recentHeadlines.length > 0
      ? `\n\nDO NOT pick a problem or headline that repeats or closely resembles any of these recent posts:\n${recentHeadlines.map((h) => `- ${h}`).join("\n")}`
      : "";

  const userPrompt = `Write one new first-person selfie slideshow post.${avoidList}\n\nReturn ONLY valid JSON, no other text.`;

  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SELFIE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const durationMs = Date.now() - start;
    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    const costCents = Math.ceil(
      (tokensIn * INPUT_COST_PER_TOKEN + tokensOut * OUTPUT_COST_PER_TOKEN) * 100
    );
    await prisma.claudeCallLog.create({
      data: {
        purpose: "selfie-topic-generation",
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
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr);

    const steps = (parsed.steps as string[]).filter(
      (s) => typeof s === "string" && s.trim()
    );
    if (steps.length === 0) throw new Error("Selfie topic returned no steps");

    const rawDetails = Array.isArray(parsed.details) ? parsed.details : [];
    const details = steps.map((_, i) =>
      typeof rawDetails[i] === "string" ? (rawDetails[i] as string).trim() : ""
    );

    const AESTHETIC_FALLBACK_SCENE =
      "a beautiful first-person phone photo of a warm home detail in soft golden light, no people";
    // ONE selfie per slideshow (2026-08-28, per Keenan): the cover is
    // the only photo of her — every step slide is forced aesthetic,
    // whatever the model returned.
    const rawShots = Array.isArray(parsed.stepShots) ? parsed.stepShots : [];
    const stepShots = steps.map((_, i) => {
      const s = (rawShots[i] ?? {}) as { type?: unknown; scene?: unknown };
      const modelSaidMirror = s.type === "mirror";
      return {
        type: "aesthetic" as const,
        scene:
          typeof s.scene === "string" && s.scene.trim() && !modelSaidMirror
            ? s.scene.trim()
            : AESTHETIC_FALLBACK_SCENE,
      };
    });

    const slug = (parsed.headline as string)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 60);

    return {
      slug,
      headline: parsed.headline,
      steps,
      details,
      mood: isMood(parsed.mood) ? parsed.mood : undefined,
      coverScene:
        typeof parsed.cover?.scene === "string" && parsed.cover.scene.trim()
          ? parsed.cover.scene.trim()
          : "full-length bedroom mirror selfie, casual sweatshirt, warm lamp light, phone raised covering her whole face, mirror lightly smudged",
      stepShots,
      captionQuestion:
        typeof parsed.captionQuestion === "string" && parsed.captionQuestion.trim()
          ? parsed.captionQuestion.trim()
          : undefined,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    await prisma.claudeCallLog.create({
      data: {
        purpose: "selfie-topic-generation",
        model: MODEL,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        durationMs,
        success: false,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      },
    });
    throw err;
  }
}

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
 *
 * `mandate` (2026-08-25) forces a specific topic: used when Keenan
 * presses Generate on a Niche Lab topic suggestion. The model writes THAT
 * headline/angle instead of inventing its own. Niche data otherwise never
 * touches automatic generation.
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
    /** Mandated topic (headline + angle) — the model writes THIS topic. */
    mandate?: { headline: string; angle?: string };
    /**
     * Visual style for the STATIC daily carousels (2026-08-28, per
     * Keenan: no more AI animation on negative/positive — just image
     * gen, rotating aesthetic / avatar / illustrated / nature). Steers
     * the scene-direction block of the prompt. Defaults to "aesthetic".
     */
    visualStyle?: CarouselVisualStyle;
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
      ? `\n\nTODAY'S ARCHETYPE (mandatory, overrides the alternation rule): RESONANCE. Write a "that's me" recognition list — the negative, uncomfortably accurate framing (reasons you're exhausted, signs you're burnt out, things holding you back). Do NOT write an actionable how-to list today.`
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

  const mandateBlock = opts?.mandate
    ? `\n\nMANDATED TOPIC (overrides everything else, including the avoid list): write THIS exact topic — headline: "${opts.mandate.headline}"${opts.mandate.angle ? `\nAngle to lean into: ${opts.mandate.angle}` : ""}\nYou may lightly polish the headline's wording (and adjust its number to match your reason count), but the subject and angle must stay exactly this.`
    : "";

  const userPrompt = `Generate one new carousel topic for Ripple's Instagram/TikTok.${avoidList}${reasonCap}${archetypeBlock}${performanceBlock}${researchBlock}${mandateBlock}

Return ONLY valid JSON, no other text.`;

  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      // 2026-08-24: raised from 1000 — per-slide "scene" directions added
      // ~500 output tokens and were getting the JSON truncated mid-array.
      max_tokens: 2500,
      system: buildSystemPrompt(opts?.visualStyle ?? "aesthetic"),
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
      const e = (raw ?? {}) as { mood?: unknown; scene?: unknown; motion?: unknown };
      return {
        mood: isMood(e.mood) ? e.mood : mood,
        scene:
          typeof e.scene === "string" && e.scene.trim()
            ? e.scene.trim()
            : undefined,
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
      captionQuestion:
        typeof parsed.captionQuestion === "string" && parsed.captionQuestion.trim()
          ? parsed.captionQuestion.trim()
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
