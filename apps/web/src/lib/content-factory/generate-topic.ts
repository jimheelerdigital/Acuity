/**
 * Content Factory — AI-powered topic generation.
 *
 * Uses Claude to generate a fresh carousel topic (headline + reasons)
 * each time, seeded with positioning context and recent headlines to
 * avoid duplicates within a 30-day window.
 */

import {
  contentAnthropic,
  CONTENT_MODEL,
  CONTENT_INPUT_COST_PER_TOKEN,
  CONTENT_OUTPUT_COST_PER_TOKEN,
  lastJsonText,
} from "./claude-client";
import {
  CAROUSEL_PERSONA,
  FORCED_STYLE_LANE,
  isMood,
  type CarouselVisualStyle,
  type Mood,
  type StyleLane,
} from "./brand";
import type { SlideEmotion } from "./animate-cover";
import { fetchGrowthosResearch, growthosResearchBlock } from "./growthos-research";
import { humanizePass, extractVoice, HUMAN_VOICE_RULES } from "./humanizer";
import { withHeadlineRetry } from "./headline-history";
import { copyObjectives } from "./copy-objectives";
import { CLAIMS_RULE, PRODUCT_ONE_LINER, PRODUCT_WHAT_IT_DOES, TIME_OF_DAY_RULE } from "@/lib/positioning";

const anthropic = contentAnthropic;

// Sonnet for creative copy — fast and cheap (~$0.01/call)
const MODEL = CONTENT_MODEL;
const INPUT_COST_PER_TOKEN = CONTENT_INPUT_COST_PER_TOKEN;
const OUTPUT_COST_PER_TOKEN = CONTENT_OUTPUT_COST_PER_TOKEN;

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
  // Persona-aware since 2026-10-06 (brand.ts CAROUSEL_PERSONA). The
  // midlife text is the original heroine's, unchanged.
  avatar:
    CAROUSEL_PERSONA === "ambitious"
      ? `For each slide write a "scene" — ONE moment starring the SAME animated character: a driven, slightly tired but determined lead in their mid-20s rendered like a modern Pixar film, physically ACTING OUT that slide's exact text with posture, face, and hands (hunched over a laptop at a cluttered desk, pulling on a jacket at the door with earbuds in, staring at a glowing phone in the dark).
- Describe their action, expression, and the room. They appear in EVERY slide and must read as the same person each time.
- Each scene must be DIFFERENT from every other slide's — different room, different action, different light, different distance. Under 30 words, concrete.`
      : `For each slide write a "scene" — ONE moment starring the SAME animated character: a relatable, tired-but-warm woman in her 40s rendered like a modern Pixar film, physically ACTING OUT that slide's exact text with her posture, face, and hands (slumped at the kitchen table over cold coffee, mid-laugh pulling on sneakers by the door, staring at a glowing phone in the dark).
- Describe her action, expression, and the room. She appears in EVERY slide and must read as the same woman each time.
- Each scene must be DIFFERENT from every other slide's — different room, different action, different light, different distance. Under 30 words, concrete.`,
  illustrated: `For each slide write a "scene" — ONE illustrated still, like a frame of background art from a modern animated film. NO people, no characters, no silhouettes:
- The feeling lives in rooms, objects, weather, and light: a lamp-lit kitchen at night with dishes waiting, rain streaking an attic window, a quiet hallway with light under one door.
- Each scene must be DIFFERENT from every other slide's — different room or place, different subject, different light. Under 30 words, concrete nouns only.`,
  nature: `For each slide write a "scene" — ONE breathtaking hyper-realistic NATURE scene whose weather, season, and light embody that slide's exact text (fog sitting low over a still lake, a single tree in an open field at dusk, waves hitting rocks under a grey sky, morning sun breaking through pines).
- NO people, no animals in focus, no buildings.
- Each scene must be DIFFERENT from every other slide's — different landscape, different weather, different time of day. Under 30 words, concrete nouns only.`,
};

// 2026-09-28 (Sonnet 5.5 rewrite, per Keenan): opens with the Ripple brief,
// explains the reason behind each rule instead of stacking capitals. Every
// locked rule is kept: number-first simple/broad headline with no filler and
// the clarity test, headline number = item count, 2-5 word items + one
// detail sentence under 90 chars, complete lists, per-slide mood + scene.
const buildSystemPrompt = (
  visualStyle: CarouselVisualStyle
) => `${copyObjectives("ripple")}

THIS LANE: a numbered list carousel. A cover headline, then one slide per item: a short main answer with one supporting sentence under it. Each post is one of two archetypes, roughly half and half over time so the feed stays fresh:
1. RESONANCE: a "that's me" recognition list (signs, truths, quiet habits, the lies we tell ourselves). She sees herself in item after item, which is what gets it sent to a sister or a group chat and gets her naming her number in the comments.
2. ACTIONABLE: a genuinely helpful list she saves to come back to, like the classic "7 things to do every day for yourself" infographic. Every item is something an exhausted woman could really do this week: no 5am routines, nothing expensive, no 20-step plans.
VOICE: warm, plain, specific. A real woman talking to a friend, never a brand, a therapist's pamphlet, or wellness-speak.

THE HEADLINE is the wide-open door, so it has to be simple and broad enough that a huge number of women instantly think "that's me." The specificity and depth belong in the slides.
- It starts with a number, and that number matches the number of items.
- It is the number plus a dead-simple, plain phrase. Shapes to rotate: "X signs…", "X ways…", "X reasons…", "X things…", "X habits…", "X reminders…".
  Simple and broad, the right register: "5 signs you're burnt out", "6 reasons to keep pushing", "5 ways to get out of a slump", "8 things holding you back", "6 ways to gain momentum", "5 ways to have a better day".
  Too clever, too written: "6 small things you do when you've given everything away today", "6 signs you've made yourself the easiest person to disappoint", "8 things you stopped wanting because wanting hurt too much".
  These are illustrations of register; never reuse their words.
- Simplicity test: if it contains a subordinate clause, a poetic turn, a clever accusation, or anything that takes a beat to parse, cut it down until a stranger could repeat it after hearing it once.
- No filler: drop words like "today", "right now", "in your life", "for real". If a word can go without changing the meaning, it goes.
- Clarity test: read it aloud. It should sound like a complete, natural phrase a friend would text, understood on the first read.
- Under about 40 characters, no emojis, no all caps, no clickbait the slides don't deliver.

THE ITEMS (each "reason" is one slide):
- A short main answer of 2 to 5 words, sticky-note length (about 30 characters at most), never a full sentence: "more rest", "asking for help", "water before coffee", "one honest no".
- RESONANCE items name the thing she does or feels ("replying instantly to everyone"). ACTIONABLE items name a doable habit, and the last one lands emotionally, not just practically.
- The list is complete: include the most obvious, most relatable item. A list that visibly skips the one everyone thinks of first reads as broken.
- No near-duplicates, no ellipses, no unnecessary punctuation. Each item should make her want the next one.

THE DETAILS (one per item, required, shown smaller under the main answer):
- One sentence, under 90 characters, sentence case. It adds something the main answer can't; never repeat its words back.
- RESONANCE details land the specific, undeniable beat of recognition ("Even the group chat gets a faster reply than your own needs do."). The more lived-in the detail, the more she feels seen: the permission slip, the dishwasher, the appointment she booked for everyone but herself.
- ACTIONABLE details say how or why in plain words ("Your brain sorts itself out when your hands are busy and your phone isn't.").

Before answering, reread everything as a tired woman at the end of a long day would. Anything that sounds like a brand, a pamphlet or AI, or needs decoding, gets rewritten. Check grammar, that the headline number matches the item count, and US English spelling (color, realize).

THEMES TO DRAW FROM: mental load and invisible labor; repeating patterns and self-sabotage; failed journaling, and saying it out loud vs writing it; emotional exhaustion vs laziness; losing herself inside her roles (mom, wife, employee); relationships and communication; real self-care vs wellness-culture nonsense; 3am thoughts and unprocessed feelings; permission to change after 40; the gap between knowing and doing; boundaries, people-pleasing, shutting down; Sunday scaries, burnout, decision fatigue.

VISUAL DIRECTION: these are static image carousels, and you direct each still. The post has a dominant mood, and every slide (cover and each item) gets its own "mood" and "scene" matched to the emotional weight of its exact text. Moods: "heavy" (exhausted, drained), "tender" (vulnerable, quietly sad), "wry" (knowing, "ouch, that's me"), "frustrated" (fed up, tense), "hopeful" (relief, release). Don't default to happy: a draining or "ouch" slide should look tired, tender or fed up. The mood can shift across the arc (heavy → frustrated → tender → hopeful as the last item lands); the cover carries the dominant mood. ACTIONABLE posts usually lean hopeful or tender, still matched to each slide's text.

${SCENE_DIRECTION[visualStyle]}

THE CAPTION: "captionQuestion" is one question in the voice of the real woman who runs the page, under 15 words, lowercase-leaning, text-message tone with contractions. It should be something she genuinely wants to answer about her own life, and easy to answer honestly in one real sentence ("when did being tired become your baseline?" shows the register). It never restates the headline or summarizes the slides, never asks her to share or send, never asks "which one are you doing first", never mentions an app or product. At most one emoji, only if natural. This question plus a few hashtags is the entire caption.

Write 5-10 items and vary the count from post to post. "details" and "reasonEmotions" each have exactly one entry per item, in the same order as "reasons".

Return only the JSON object:
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
  "captionQuestion": "one question in the page-owner's voice"
}`;

// ─── Selfie slideshow topics (2026-08-25, per Keenan) ────────────────────────

export interface GeneratedSelfieTopic {
  slug: string;
  /** First-person cover line, e.g. "the night i realized i was running on empty". */
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

// 2026-10-13 (per Keenan, after "the day i snapped over a wet towel and
// cried" shipped as a cover about one bad day over five unrelated habit
// slides: "it just makes absolutely no sense... let's focus on building
// posts about ripple at this point. what we do, how it helps people, from
// the first person avatar"): the lane is now HER STORY OF USING RIPPLE.
// Cover = what changed for her, clear on its own; slides = her before,
// then what Ripple actually does for her (real features only, in plain
// words, Ripple named), then the payoff. Every slide must follow from the
// one before it. Locked rules kept: mirror-selfie cover with the phone
// covering her face (the only photo of her), aesthetic no-people step
// shots, sticker text (no emojis), opener rotation (no "this is how i").
// Previous version: 2026-09-28 Sonnet 5.5 rewrite (recognition-first
// habit lists, no product mentions).
const SELFIE_SYSTEM_PROMPT = `${copyObjectives("ripple")}

THIS LANE ASKS FOR THE PRODUCT. Every post is a woman's own first-person story of how Ripple helps her, posted by the woman who runs the page. She is in her 40s, carries the same load as her readers (work, kids, a partner, aging parents, the running list in her head), and she uses Ripple herself. This is her telling a friend what actually helped, not an ad.
VOICE: first person, lowercase-leaning, a woman who has lived a lot of life telling it straight: hard things said plainly and matter-of-factly, short fragments next to one easy longer sentence, concrete facts from her real life, dry humor aimed at herself, and a soft or funny turn at the end. Not advice, just what she noticed. Never a coach, never a brand, never a salesperson.

WHAT RIPPLE IS (the only things you may say it does): ${PRODUCT_ONE_LINER}
What it does, concretely:
${PRODUCT_WHAT_IT_DOES.map((x) => `- ${x}`).join("\n")}
Never invent a feature, a number, a price or a result that isn't in that list. ${CLAIMS_RULE} ${TIME_OF_DAY_RULE} Never a recording duration ("60 seconds", "two minutes", "a few minutes"). Customer words like "voice journal" and "brain dump" are fine; when she names the feature itself it's a "debrief".

THE ONE TEST EVERY POST MUST PASS: a stranger reads the cover, then the slides in order, and understands exactly what happened to her and what Ripple did, with no guessing. The cover makes a promise and the slides deliver exactly that promise, in order, as one story. Every slide follows from the one before it. A cover about one moment followed by slides about something else is a failure, however good each line is on its own.

THE FORMAT: slide 1 (the cover) is a mirror selfie of her with her raised phone covering her face and the hook text on it. It is the only photo of her in the post. Every slide after it is an aesthetic photo with no people, carrying one line of her story plus a short detail line under it. The text is set on the photos in sticker type, so there are no emojis anywhere.

THE STORY (4-6 steps, one per slide, in this order):
1. Her before: the specific load she was carrying, so the reader thinks "that's me" (e.g. "i was keeping my whole family's life in my head").
2. Then what she started doing: talking it out to Ripple instead of carrying it, named plainly at least once ("so i started talking it all out to ripple").
3. One to three slides on what Ripple actually did with it, each one real feature from the list above, shown through her life (her to-do list with the dentist and the permission slip already on it; it noticing she always mentions the same thing; her weekly report showing what moved).
4. The last slide is the payoff: what she has back now, in her life, not in the app.

THE HEADLINE (cover text): first person, lowercase-leaning, under 55 characters, no emojis. It must make complete sense to a stranger with nothing else to go on, and it says or clearly sets up that something changed for her, so the slides are the answer. Plain words beat clever ones. Don't open with "this is how i". It may name Ripple or describe it plainly ("the app i talk to"). Pick one of these structures, one the recent posts haven't used, and write fresh words (the examples show shape only; never reuse their words):
  1. Result first ("how i stopped carrying the whole list in my head").
  2. Before and after in one line ("i used to forget everything. now nothing slips.").
  3. The confession, then the fix ("i was the family's memory. now an app is.").
  4. What she'd tell a friend ("if your head never shuts off, try this").
  5. What it noticed that she didn't ("the thing my voice journal noticed about me").
  6. The turning moment, only if the slides tell what happened after it ("the week i stopped keeping it all in my head").

THE STEP LINES: each step is one plain first-person sentence, 4-12 words, that makes sense on its own without the detail line under it ("i just talk, and ripple pulls out my to-do list"). No fragments that only make sense with the detail ("i laughed at dinner and noticed" fails). Each step gets one "detail" sentence under 90 characters in her voice: the concrete, lived-in specific (the dentist on thursday, her mom's refill, the form due friday; "it had my sister's birthday on there before i remembered it"). Honest, small and specific beats big claims.

THE SHOTS (the cover plus one per step):
- "cover": always a mirror selfie of her with the raised phone completely covering her face, so no eyes, nose or mouth are ever visible. The mirror is realistically a little dirty: light smudges, a few fingerprints, a faint streak catching the light. Describe which mirror, what she's wearing, the light and her posture (e.g. "full-length bedroom mirror with light smudges, oversized grey sweatshirt and leggings, warm lamp light, phone raised covering her whole face").
- Every step's shot is "aesthetic": a beautiful first-person phone photo with no person in it. Her own hand holding her phone or a mug is fine. Phone screens are dark or face down, never showing an app.
- Each shot shows the exact moment its step describes, so the picture and the words obviously go together: the "my head was full" step shows the overflowing fridge calendar and sticky notes; the "i just talk" step shows her hand holding her phone in the car or on a walk; the to-do step shows the permission slip and the pharmacy bag on the counter. A pretty photo that has nothing to do with its line is a failure.
- Every scene is distinct: different place, light and angle, no object or surface repeated. Under 30 words each, concrete nouns only. Vary the world from post to post (the car, a walk, the kitchen counter, the porch, the school pickup line, a park bench).

THE CAPTION: "captionQuestion" is one question in her voice, under 15 words, lowercase-leaning, that a 40-something woman genuinely wants to answer about her own version of this load ("what's the one thing you're always the only one who remembers?" shows the kind; never reuse it). Concrete, answerable in one honest sentence. No app or product name in the caption, no share or send ask. At most one emoji, only if natural.

Before answering, read the cover and then each slide in order as a stranger would. If any line needs another line to make sense, or the story jumps, rewrite it. Anything that sounds like an ad, a coach or AI gets rewritten. US English spelling.

"details" and "stepShots" each have exactly one entry per step, in order. Return only the JSON object:
{
  "headline": "first-person cover line, clear on its own",
  "problem": "the load she was carrying, in a few words",
  "steps": ["i ...", ...],
  "details": ["one sentence", ...],
  "stepCount": 4 | 5 | 6,
  "mood": "heavy" | "tender" | "wry" | "frustrated" | "hopeful",
  "cover": { "scene": "mirror selfie scene, phone covering her face, slightly dirty mirror" },
  "stepShots": [{ "type": "aesthetic", "scene": "..." }, ...],
  "captionQuestion": "one question in her voice"
}`;

/**
 * Generate a first-person selfie-slideshow topic (2026-08-25, per
 * Keenan: realistic mirror-selfie avatar slideshow — same list
 * mechanics as the "7 ways" posts but told as HER story, with steps
 * that fix the problem). 2026-09-23: cross-lane headline dedupe, and
 * the old "this is how i..." opener (all 46 posts to date) is rejected
 * with one retry so the rotating opener structures actually rotate.
 */
export async function generateSelfieTopic(
  recentHeadlines: string[],
  feedback?: string | null
): Promise<GeneratedSelfieTopic> {
  return withHeadlineRetry({
    label: "selfie-topic",
    generate: (extra) => generateSelfieTopicOnce(recentHeadlines, feedback, extra),
    headlineOf: (t) => t.headline,
    reject: (t) =>
      /^\s*this is how i\b/i.test(t.headline)
        ? `\n\nREJECTED: your headline "${t.headline}" opens with "this is how i", which every past post used. Pick a different opener structure from the list.`
        : null,
    // Jev best-of-5 cover pick (2026-09-30).
    bestCover: {
      brand: "ripple",
      lane: "selfie",
      rules:
        "First person, lowercase-leaning, under 55 characters, no emojis. This post is her story of how Ripple (an app she talks to) helps her: the cover must make complete sense to a stranger on its own and set up exactly what the slides show, that something changed for her. It may name Ripple or describe it plainly. Never a duration, a time of day or a therapy claim. Never opens with \"this is how i\".",
      contextOf: (t) =>
        t.steps.map((s, i) => `${s}${t.details[i] ? `: ${t.details[i]}` : ""}`).join("\n"),
      setHeadline: (t, headline) =>
        headline.length > 60 || /^\s*this is how i\b/i.test(headline)
          ? t
          : { ...t, headline, slug: slugify(headline) },
    },
  });
}

async function generateSelfieTopicOnce(
  recentHeadlines: string[],
  feedback: string | null | undefined,
  extra: string
): Promise<GeneratedSelfieTopic> {
  const { prisma } = await import("@/lib/prisma");

  const avoidList =
    recentHeadlines.length > 0
      ? `\n\nRECENT POSTS — this ground is already covered:\n${recentHeadlines.map((h) => `- ${h}`).join("\n")}\nYour post must be genuinely NEW against that list — a different problem, different steps, different rooms and shots. Not the same fix under a new headline.`
      : "";

  // Learning loop (2026-09-14): real engagement numbers from
  // performance.ts, so topics lean into what the audience rewards.
  const userPrompt = `Write one new first-person selfie slideshow post.${avoidList}${feedback ?? ""}${extra}\n\nReturn ONLY valid JSON, no other text.`;

  // Reddit audience pulse (2026-09-17) — soft, angle inspiration only.
  let pulse = "";
  try {
    const { getAudiencePulse } = await import("./reddit-trends");
    pulse = await getAudiencePulse("ripple");
  } catch {
    /* soft — generate without the pulse */
  }

  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      // HUMAN_VOICE_RULES (2026-09-04): prevention layer — the full
      // humanizer gate still runs on the output below.
      system: `${SELFIE_SYSTEM_PROMPT}${pulse}\n\n${HUMAN_VOICE_RULES}`,
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
    const jsonStr = lastJsonText(text);
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

    // Humanizer approval gate (2026-09-04, per Keenan: "every single
    // script must pass through this first in order to be approved
    // content"). Reader-facing text only — shots/scenes never go
    // through. Fails open on error.
    let gatedHeadline = parsed.headline as string;
    let gatedSteps = steps;
    let gatedDetails = details;
    let gatedCaptionQuestion =
      typeof parsed.captionQuestion === "string"
        ? (parsed.captionQuestion as string)
        : undefined;
    try {
      const gated = await humanizePass({
        purpose: "humanize:selfie-topic",
        voice: extractVoice(SELFIE_SYSTEM_PROMPT),
        payload: {
          headline: gatedHeadline,
          steps,
          details,
          captionQuestion: gatedCaptionQuestion ?? "",
        },
      });
      if (
        typeof gated.headline === "string" &&
        gated.headline.trim() &&
        Array.isArray(gated.steps) &&
        gated.steps.length === steps.length &&
        gated.steps.every((s) => typeof s === "string" && s.trim()) &&
        Array.isArray(gated.details) &&
        gated.details.length === details.length
      ) {
        gatedHeadline = gated.headline.trim();
        gatedSteps = gated.steps.map((s) => s.trim());
        gatedDetails = details.map((d, i) =>
          typeof gated.details[i] === "string" ? gated.details[i].trim() : d
        );
        if (
          gatedCaptionQuestion &&
          typeof gated.captionQuestion === "string" &&
          gated.captionQuestion.trim()
        ) {
          gatedCaptionQuestion = gated.captionQuestion.trim();
        }
      }
    } catch (err) {
      console.warn(
        `[content-factory] humanize gate failed for selfie-topic — shipping ungated copy:`,
        err
      );
    }

    return {
      slug,
      headline: gatedHeadline,
      steps: gatedSteps,
      details: gatedDetails,
      mood: isMood(parsed.mood) ? parsed.mood : undefined,
      coverScene:
        typeof parsed.cover?.scene === "string" && parsed.cover.scene.trim()
          ? parsed.cover.scene.trim()
          : "full-length bedroom mirror selfie, casual sweatshirt, warm lamp light, phone raised covering her whole face, mirror lightly smudged",
      stepShots,
      captionQuestion: gatedCaptionQuestion?.trim() || undefined,
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
type GenerateTopicOpts = {
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
};

export async function generateTopic(
  recentHeadlines: string[],
  opts?: GenerateTopicOpts
): Promise<GeneratedTopic> {
  // Cross-lane headline dedupe (2026-09-23) — skipped for a mandated
  // topic: Keenan picked that headline on purpose.
  if (opts?.mandate) return generateTopicOnce(recentHeadlines, opts, "");
  return withHeadlineRetry({
    label: "carousel-topic",
    generate: (extra) => generateTopicOnce(recentHeadlines, opts, extra),
    headlineOf: (t) => t.headline,
    // Jev best-of-5 cover pick (2026-09-30). The number must still match
    // the item count, so setHeadline re-checks it and keeps the original
    // on any mismatch.
    bestCover: {
      brand: "ripple",
      lane: opts?.archetype ? `carousel-${opts.archetype}` : "carousel",
      rules:
        "A numbered list headline: starts with the same number as the current cover (it must equal the item count), then a dead-simple, broad plain phrase (\"X signs...\", \"X ways...\", \"X reasons...\", \"X things...\", \"X habits...\", \"X reminders...\"). No subordinate clause, no poetic turn, no clever accusation, no filler words like \"today\" or \"right now\". Under about 40 characters, no emojis, not all caps, sentence case with a lowercase phrase. A stranger could repeat it after hearing it once.",
      contextOf: (t) =>
        t.reasons.map((r, i) => `${r}${t.details?.[i] ? `: ${t.details[i]}` : ""}`).join("\n"),
      setHeadline: (t, headline) => {
        const n = headline.match(/^\s*(\d+)\b/);
        if (!n || Number(n[1]) !== t.reasons.length || headline.length > 50) return t;
        return { ...t, headline, slug: slugify(headline) };
      },
    },
  });
}

/** Same slug rule the generators use on the model's headline. */
function slugify(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

async function generateTopicOnce(
  recentHeadlines: string[],
  opts: GenerateTopicOpts | undefined,
  extra: string
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

  const userPrompt = `Generate one new carousel topic for Ripple's Instagram/TikTok.${avoidList}${reasonCap}${archetypeBlock}${performanceBlock}${researchBlock}${mandateBlock}${extra}

Return ONLY valid JSON, no other text.`;

  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      // 2026-08-24: raised from 1000 — per-slide "scene" directions added
      // ~500 output tokens and were getting the JSON truncated mid-array.
      max_tokens: 2500,
      // HUMAN_VOICE_RULES appended 2026-09-04 (humanizer prevention layer).
      system: `${buildSystemPrompt(opts?.visualStyle ?? "aesthetic")}\n\n${HUMAN_VOICE_RULES}`,
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
    const jsonStr = lastJsonText(text);
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

    // HUMANIZER approval gate (2026-09-04, per Keenan: every social post
    // runs through it before generation). Reader-facing strings only —
    // scene/motion/mood directions never go through. Fails open.
    let gatedHeadline: string = parsed.headline;
    let gatedReasons = reasons;
    let gatedDetails = details;
    let gatedCaptionQuestion =
      typeof parsed.captionQuestion === "string" && parsed.captionQuestion.trim()
        ? parsed.captionQuestion.trim()
        : undefined;
    try {
      const gated = await humanizePass<{
        headline: string;
        reasons: string[];
        details: string[];
        captionQuestion: string;
      }>({
        purpose: "humanize:carousel-topic",
        voice: extractVoice(buildSystemPrompt(opts?.visualStyle ?? "aesthetic")),
        payload: {
          headline: parsed.headline,
          reasons,
          details,
          captionQuestion: gatedCaptionQuestion ?? "",
        },
      });
      const okStrings = (arr: unknown, len: number, allowEmpty: boolean) =>
        Array.isArray(arr) &&
        arr.length === len &&
        arr.every((s) => typeof s === "string" && (allowEmpty || s.trim()));
      if (
        typeof gated.headline === "string" &&
        gated.headline.trim() &&
        okStrings(gated.reasons, reasons.length, false) &&
        okStrings(gated.details, details.length, true)
      ) {
        gatedHeadline = gated.headline.trim();
        gatedReasons = gated.reasons.map((s) => s.trim());
        gatedDetails = gated.details.map((s) => s.trim());
        if (gatedCaptionQuestion && typeof gated.captionQuestion === "string" && gated.captionQuestion.trim()) {
          gatedCaptionQuestion = gated.captionQuestion.trim();
        }
      }
    } catch {
      console.warn("[generate-topic] humanizer gate failed — shipping ungated copy");
    }

    return {
      slug,
      headline: gatedHeadline,
      style: parsed.style === "hook" ? "hook" : "listicle",
      lane,
      reasons: gatedReasons,
      details: gatedDetails,
      mood,
      coverEmotion: parseEmotion(parsed.cover),
      reasonEmotions,
      captionQuestion: gatedCaptionQuestion,
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
