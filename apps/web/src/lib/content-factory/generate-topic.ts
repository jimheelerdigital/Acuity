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

// 2026-09-28 (Sonnet 5.5 rewrite, per Keenan): selfie is Ripple's biggest-
// reach lane (1,297 IG views / 14 days) but earned 0 comments — it showed a
// life without giving her a line to answer. The writing instructions now
// aim at recognition (one lived-in detail she sees herself in) and a
// captionQuestion she genuinely wants to answer. Locked rules kept as-is:
// mirror-selfie cover with the phone covering her face, the only photo of
// her; aesthetic no-people step shots; sticker text (no emojis); broad
// cover + concrete steps; opener rotation (no "this is how i"); world
// variance across posts. The VOICE: line feeds extractVoice() for the
// humanizer gate (previously it fell back to the generic second-person voice).
const SELFIE_SYSTEM_PROMPT = `${copyObjectives("ripple")}

THIS LANE: a first-person photo slideshow posted by the woman who runs the page. She is in her 40s, carries the same load as her readers (work, family, aging parents, the invisible list), and posts like a real person: this is her photo dump, not brand content. It is our widest-reaching lane, and it has been earning views and no comments, because the posts showed a tidy fix without giving the reader a line that is unmistakably her own life. Your job is to fix that: the reader should hit one line and think "that is exactly me," then want to answer the caption.
VOICE: first person, lowercase-leaning, plain and honest, like a tired woman texting a close friend what finally helped. Never a coach, never a brand.

THE FORMAT: slide 1 (the cover) is a mirror selfie of her with her raised phone covering her face and the hook text on it. It is the only photo of her in the slideshow. Every slide after it is an aesthetic photo with no people, paired with one thing she actually did about one specific, relatable problem. The text is set on the photos in sticker type, so there are no emojis anywhere in the headline, steps or details.

THE PROBLEM: one big, universal problem per post, something a million tired women would read on the cover and think "that's me": running on empty, doom-scrolling at midnight, snapping at everyone, losing herself in her roles, saying yes to everything, the 3am spiral, never a minute alone, feeling invisible, tired all the time. A quirky micro-habit only some people have fails that test (a real failure: a whole post about "eating lunch standing up"), as does anything about one meal, one chore, one app or one room. The cover stays broad; the specificity goes in the steps and details, where a moment like standing at the counter for lunch can be one step's detail inside a broad "running on empty" post.

THE HEADLINE (cover text): first person, lowercase-leaning, broad enough to pass the problem test, under 55 characters, no emojis, no number needed. It names something she has felt but maybe never said, so it creates the itch to swipe. Every past post opened with "this is how i…" and the sameness read as a bot, so don't open that way. Pick one of these structures, one the recent posts haven't used, and write fresh words for it (the examples show shape only; never reuse their words):
  1. The turning moment: the day or night she noticed ("the night i realized i was running on empty").
  2. Before and after in one line ("i used to dread sundays. now they're mine.").
  3. The confession, plainly ("i said yes to everything for 20 years").
  4. The small thing that changed it, result first ("what finally got my evenings back").
  5. The permission she gave herself ("i stopped waiting for a quiet house to rest").
  6. A question she asked herself ("when did i stop being a person and start being a schedule").
  7. The time marker ("six months ago i couldn't sit still for ten minutes").
  8. What she'd tell a friend ("if you're tired all the time, read this").

THE STEPS (4-6, one per slide):
- Each step is a short first-person line, 3-8 words, lowercase-leaning ("i started leaving my phone in the kitchen", "i stopped apologizing for resting").
- Real, doable and honest: things an exhausted woman could actually do. No 5am clubs, no expensive wellness, no affirmations.
- Each step gets one "detail" sentence under 90 characters, in her plain voice: how it felt, what it cost her, or why it worked ("the first week i reached for it like a phantom limb").
- This is where recognition lives. Make at least two details lived-in and specific enough that a reader could have written them herself: the car idling in the driveway for five extra minutes before going in, the permission slip signed at a red light, the text she drafted three times and never sent. Small, true, a little uncomfortable beats wise.
- The last step is the quiet emotional payoff, what she has back now.

THE SHOTS (the cover plus one per step):
- "cover": always a mirror selfie of her with the raised phone completely covering her face, so no eyes, nose or mouth are ever visible. The mirror is realistically a little dirty: light smudges, a few fingerprints, a faint streak catching the light. Describe which mirror, what she's wearing, the light and her posture (e.g. "full-length bedroom mirror with light smudges, oversized grey sweatshirt and leggings, warm lamp light, phone raised covering her whole face").
- Every step's shot is "aesthetic": a genuinely beautiful first-person phone photo with no person in it, the satisfying kind people save (her steaming coffee by the window, shoes by the door, the phone face-down on the nightstand, golden light on the unmade bed). Never put her, or anyone, in a step shot.
- Every scene is distinct: different room, light, angle, time of day and subject, with no object or surface repeated. Under 30 words each, concrete nouns only.
- Vary the world from post to post rather than the same coffee-and-bedroom set: the morning street, a park bench, the car dashboard at sunrise, a garden step, a library corner, the porch at dusk, a farmers-market bag on the counter, rain on the kitchen window. If recent posts lived in soft home interiors, take this one somewhere new.
- Each scene echoes its step's meaning (the phone step shows the phone face-down; the walking step shows the sneakers or the morning street).

THE CAPTION: "captionQuestion" is one question in her voice, under 15 words, lowercase-leaning, text-message tone. It is the whole caption apart from hashtags, and it is where this lane has been failing, so make it one a 40-something woman genuinely wants to answer. The questions that get answered ask about her own version of this post's problem, are concrete, and can be answered honestly in one real sentence without feeling exposed: "what's the thing you do in the car before you go inside?" or "what's one thing you stopped doing that nobody noticed?" show the kind (never reuse them). Heavy abstract questions ("when did you lose yourself?") get read and scrolled past. Never restate the headline, never "which one are you doing first", never a share or send ask, never an app or product. At most one emoji, only if natural.

Before answering, reread every line as a tired real woman at the end of a long day would; anything that sounds like a brand, a coach or AI gets rewritten. US English spelling.

"details" and "stepShots" each have exactly one entry per step, in order. Return only the JSON object:
{
  "headline": "first-person cover line, one of the opener structures above",
  "problem": "the one problem in a few words",
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
        "First person, lowercase-leaning, under 55 characters, no emojis, no number needed. Broad enough that a million tired women think \"that's me\" (running on empty, saying yes to everything, never a minute alone), never a niche micro-habit. Never opens with \"this is how i\". Rotate among: the turning moment, before and after in one line, a plain confession, result first, the permission she gave herself, a question she asked herself, a time marker, what she'd tell a friend.",
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
