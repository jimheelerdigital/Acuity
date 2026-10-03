/**
 * "WHICH ONE IS YOU?" pick lanes for Ripple and BWK (2026-09-30, per
 * Keenan: "generate one of these fresh daily for each lane, bwk and
 * ripple. you ask on 5 of these which narrows it down to your one post.
 * you then write the different topics and jev narrows down to the ones we
 * post about (5 total). you then generate the cover slide image, the 5
 * subsequent images, and the ANIMATED cover screen ... stitch them
 * together and add the background music as well. one per lane").
 *
 * The Legendary Mythicals format (question cover → 5 numbered picks →
 * "comment your number" card) applied to each brand's own audience:
 *   1. Sonnet writes 5 post concepts; Jev picks one (scroll-stop +
 *      comment/tag likelihood + cover-only clarity, composite in code).
 *   2. Sonnet writes 8-10 options for it; Jev keeps the best 5 (how much
 *      the audience would want to pick each + a twin check).
 *   3. carousel-daily renders cover + 5 options + end card (template
 *      "pick"); the post-video builder animates ONLY the cover (see
 *      maxAnimatedSlides) and the rest are slow-zoom stills with music.
 * Every Jev step fails open: no answer → the first concept / first five.
 *
 * 2026-10-03 (per Keenan: "focus on first frame being much more engaging
 * with excellent verbiage ... ripple focused on escape and relief, bwk
 * focused on luxury aspiration and motivation. instead of set lanes ...
 * give yourself free reign and set guidelines in jev"): the subject is now
 * free within one guideline per brand (GUIDELINE), enforced by Jev's core
 * gate; no approved-question quota. Every concept pitches its FIRST FRAME
 * (opening image + cover line) and Jev judges that frame, the cover line
 * is best-of-5 (pickCoverLine), and the cover photo is picked for
 * stopping power. Why: watch time 09-12 → 10-03 was Mythicals 12.1s vs
 * Ripple 1.7s / BWK 3.0s; the best-held Ripple/BWK posts were escapes
 * ("Which house would you disappear to, alone?" 14.4s) and luxury trips.
 */

import {
  contentAnthropic,
  CONTENT_MODEL,
  CONTENT_INPUT_COST_PER_TOKEN,
  CONTENT_OUTPUT_COST_PER_TOKEN,
  lastJsonText,
} from "./claude-client";
import { copyObjectives } from "./copy-objectives";
import { humanizePass, HUMAN_VOICE_RULES, copyFlagFor } from "./humanizer";
import type { ChoiceTopic } from "./choice-lane";

export type PickBrand = "ripple" | "bwk";

/** Lane keys that use this format. */
export function isPickLane(lane: string | null | undefined): boolean {
  return !!lane && lane.startsWith("pick-");
}

export interface PickLaneSpec {
  theme?: string;
}

export function parsePickLaneSpec(raw: unknown): PickLaneSpec | null {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return { theme: typeof r.theme === "string" ? r.theme : undefined };
}

export interface PickConcept {
  question: string;
  /** The pitched opening photo (2026-10-03); Jev judges it with the question. */
  firstFrame?: string;
  why: string;
  /** Theme family (PICK_FAMILIES), so the performance loop can learn by theme. */
  family?: string;
  /** Research seed label ("R2") when the concept builds on a competitor brief. */
  seed?: string;
}

/**
 * Theme families the performance loop scores and steers (2026-09-30).
 * Every concept is tagged with one; the scoreboard learns which families
 * win, and the bandit picks a "focus family" for each run.
 */
export const PICK_FAMILIES: Record<PickBrand, string[]> = {
  // 2026-10-03: re-cut around escape & relief / luxury aspiration & motivation.
  ripple: [
    "places she would disappear to",
    "trips and getaways she keeps postponing",
    "mornings, rituals and hours that are only hers",
    "being taken care of for once",
    "rooms and homes made for rest",
    "the day everything is handed off",
    "small everyday escapes",
  ],
  bwk: [
    "luxury cars",
    "luxury watches",
    "homes, penthouses and views",
    "cities and travel at the top",
    "the lifestyle at the top (yachts, jets, private tables)",
    "the grind and discipline that pay for it",
    "the man he is becoming",
    "brotherhood at the top",
  ],
};

/** Loop context passed in by carousel-daily (all optional; absent = pre-loop behavior). */
export interface PickLoopContext {
  /** Bandit-chosen focus family for this run. */
  focusFamily?: string;
  whatWorks?: string;
  whatDoesnt?: string;
  /** Scoreboard label per family. */
  familyLabels?: Record<string, "proven winner" | "solid" | "weak" | "untested">;
  /** How research-seeded posts score vs the rest (scoreboard `sources.research`). */
  researchLabel?: "proven winner" | "solid" | "weak" | "untested";
  /** This account's best / worst recent covers (scoreboard top/bottom), as Jev examples. */
  topTitles?: string[];
  bottomTitles?: string[];
}

export interface PickOptionDraft {
  name: string;
  lore: string;
  scene: string;
  /** Calm realistic action for this option's animated clip (every slide animates since 2026-09-30). */
  motion?: string;
}

/**
 * Examples of the target, not a quota (2026-10-03: free reign). The first
 * ones held viewers longest on these accounts (14.4s / 9.3s vs ~2s).
 */
const SEEDS: Record<PickBrand, string[]> = {
  ripple: [
    "Which house would you disappear to, alone?",
    "One week, no one needs you. Where do you go?",
    "Pick the morning you'd wake up to tomorrow",
    "Somebody else handles everything for a day. What do you do first?",
    "Which bath, which book, which door locked?",
    "Pick your one hour of quiet",
  ],
  bwk: [
    "Your brothers get one weekend. Where do you take them?",
    "Which car are you working toward?",
    "Pick the city you rebuild your life in",
    "First big check. What do you buy?",
    "Which view do you wake up to at 30?",
    "Which watch do you earn first?",
  ],
};

/**
 * What a pick post must be ABOUT (2026-09-30, after the first dry run
 * produced "WHAT'S YOUR REAL ANSWER TO WHAT'S FOR DINNER?" and "WHAT'S
 * YOUR 11PM KITCHEN HABIT?" — Keenan: "what ... do they have to do with
 * our target audiences?"). Trivia with nothing at stake is out.
 */
/**
 * The one guideline per brand (2026-10-03, per Keenan). Jev's core gate
 * enforces it; inside it the writer has free reign.
 */
const CORE: Record<PickBrand, string> = {
  ripple:
    "ESCAPE AND RELIEF. The moment the weight comes off: the places she would disappear to, the trips she keeps postponing, the morning or hour that is only hers, being taken care of for once, the room, bath, view or ritual where nobody needs her, handing everything off. The load she carries is only ever the thing she is escaping FROM, implied, never the subject on the cover. She should feel the exhale the moment she sees the first frame.",
  bwk:
    "LUXURY ASPIRATION AND MOTIVATION. The exact luxury life he is working toward (luxury cars, watches, homes, penthouses, cities, travel, the lifestyle at the top) and the drive that gets him there (discipline, the grind, the brothers in his corner, the man he is becoming). Every post makes him want it and want to work for it.",
};

const OFF_BRAND =
  "Never trivia or everyday preferences with nothing at stake: food and meals (what's for dinner, snacks, late-night eating), chores, household logistics, coffee orders, generic lifestyle quizzes. The test: the pick has to say something real about who the reader is, what they carry or who they are becoming.";

const AUDIENCE_LINE: Record<PickBrand, string> = {
  ripple:
    "Women roughly 40-50 carrying the mental load for everyone (work, kids, partner, aging parents), scrolling Instagram or Facebook on a phone. They stop for escape and relief (a beautiful place, a quiet hour, being taken care of) and scroll past reminders of the load itself.",
  bwk: "Men roughly 18-30 working toward a luxury life (cars, watches, homes, travel) and building the discipline to earn it, scrolling Instagram or Facebook on a phone. They stop for the life at the top and skip hype and guru talk.",
};

const COMMENT_LEVELS = [
  "Nobody would comment, tag or send it",
  "A few might comment a number",
  "Many would comment their number",
  "Many would comment their number AND tag or send it to a friend",
  "It would start a thread: numbers, reasons, and friends tagged",
];

const WATCH_LEVELS = [
  "Swipes away in the first second",
  "Watches one or two options, then leaves",
  "Watches most of it",
  "Watches every option to the end",
  "Watches to the end and rewatches to decide",
];

const PICK_LEVELS = [
  "Not at all: a dull or throwaway pick nobody would choose",
  "A little: fine but forgettable next to the others",
  "Clearly: a pick plenty of people would argue for",
  "Hugely: the one people would fight about in the comments",
];

const CLEAR_MIN = 0.3;
/** On-brand gate: a concept Jev thinks is trivia can never win. */
const CORE_MIN = 0.6; // tested 09-30: approved concepts 0.82-0.95, trivia 0.18-0.50
// Tested 2026-09-30: real near-copies score ~0.6-0.7 in a 9-option batch
// ("Car in the Driveway" vs "Parked Car at Target": 0.64 / 0.60).
const TWIN_MIN = 0.6;
const SPECIFIC_MIN = 0.5;
const LUX_MIN = 0.5;
/**
 * Natural-answer check (2026-09-30, Keenan: "bathroom fan on makes no
 * sense... 'in the bathroom with the fan on' does make sense"; "is jev
 * not proofreading these?"). Tested: clipped/niche names 0.22-0.34,
 * natural answers 0.46-0.82.
 */
const ANSWER_MIN = 0.4;

// ─── Sonnet calls ───────────────────────────────────────────────────

async function callWriter(
  purpose: string,
  system: string,
  user: string,
  maxTokens: number,
  effort?: "low" | "medium" | "high"
): Promise<unknown> {
  const { prisma } = await import("@/lib/prisma");
  const start = Date.now();
  try {
    const response = await contentAnthropic.messages.create({
      max_tokens: maxTokens,
      ...(effort ? { effort } : {}),
      system,
      messages: [{ role: "user", content: user }],
    });
    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    await prisma.claudeCallLog
      .create({
        data: {
          purpose,
          model: CONTENT_MODEL,
          tokensIn,
          tokensOut,
          costCents: Math.ceil((tokensIn * CONTENT_INPUT_COST_PER_TOKEN + tokensOut * CONTENT_OUTPUT_COST_PER_TOKEN) * 100),
          durationMs: Date.now() - start,
          success: true,
        },
      })
      .catch(() => {});
    const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return JSON.parse(lastJsonText(text));
  } catch (err) {
    await prisma.claudeCallLog
      .create({
        data: {
          purpose,
          model: CONTENT_MODEL,
          tokensIn: 0,
          tokensOut: 0,
          costCents: 0,
          durationMs: Date.now() - start,
          success: false,
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        },
      })
      .catch(() => {});
    throw err;
  }
}

function conceptSystem(brand: PickBrand): string {
  return `${copyObjectives(brand)}

YOUR JOB: pitch five PICK-ONE posts for this account. The format: a cover that makes the reader pick one of five, then five numbered options with a photo each, then a card asking the reader to comment their number. The cover does NOT have to be "which one is you?" (2026-09-30, per Keenan: "it doesn't always have to be 'which one is you'"). Vary the shape across the five pitches: "which one is you?", "where are you going?", "what do you buy first?", "pick your...", "who's in your corner?", "if you know her, which one is she?", a one-line setup then the choice ("you get one free Saturday. how do you spend it?"). It works when every option is a version of the reader's own life, so picking one says something about her or him, commenting is as easy as typing a number, and people tag or send it to a friend.

THE GUIDELINE, for this audience: ${CORE[brand]}
${OFF_BRAND}
Inside that guideline you have free reign: any subject, any angle, as long as it fits.

THE FIRST FRAME DECIDES EVERYTHING. These accounts lose people in under two seconds (Legendary Mythicals holds them 12). The first frame is the opening photo plus the cover line, seen for one second before she or he decides to swipe. It has to be the most beautiful, wanted thing in their feed${
    brand === "ripple"
      ? ": the place, light or moment she would give anything to be in right now"
      : ": the car, view or life he is working toward, shown so he can almost touch it"
  }, and the line has to land instantly in plain words.

EXAMPLES of the target (in spirit only; never reuse one from the recent list): ${SEEDS[brand].map((s) => `"${s}"`).join(", ")}.

Each concept:
- "question": the cover question, 4-10 words, the way a person would ask it out loud. ${
    brand === "ripple"
      ? "It names her situation plainly so she understands it in one second; never a cryptic command. Never medical, never preachy."
      : "Plain, concrete, calm; never hype or guru talk."
  }
- "firstFrame": one sentence describing the OPENING PHOTO that sets up the question: a single stunning, specific image (where, what light, what is happening), not a collage of the options.
- "why": one line on why this audience would stop, comment and tag on it.
- "family": exactly one of these theme families, copied word for word: ${PICK_FAMILIES[brand].map((f) => `"${f}"`).join(", ")}.
- "seed": only when the request lists RESEARCH SEEDS and this concept is built on one: that seed's label, e.g. "R2". Otherwise leave it out.
The five concepts must be clearly different subjects from each other and from recent posts.

${HUMAN_VOICE_RULES}

OUTPUT (JSON): { "concepts": [{ "question": "...", "firstFrame": "...", "why": "...", "family": "...", "seed": "R1 (optional)" }] }`;
}

function optionsSystem(brand: PickBrand): string {
  const people =
    brand === "ripple"
      ? `The photo must SHOW the answer, not an empty room standing in for it. When the answer is a role, a person or an action ("the mom who tracks every school form", "the daughter running Mom's appointments"), show ONE woman in her 40s DOING it, mid-action (signing a permission slip at the kitchen counter, walking her mother into a clinic), seen from behind, over the shoulder, in profile in shadow, or as hands, face not the focus. When the answer is a place or object, show it clearly. (2026-09-30, Keenan: an empty couch for "the partner who holds it all together" and shoes for "the mom of a teenager" "has literally nothing to do with it".)`
      : `The photo must SHOW the answer. When it is a car, watch, city or place, show that exact thing as the hero. When it is a person or an action (a mentor, a friend, a habit), show ONE man (or two for friends) DOING it, seen from behind, over the shoulder or in profile in shadow, face not the focus.`;
  return `${copyObjectives(brand)}

YOUR JOB: write the options for one pick-one post (the reader picks one of five) whose question is given below.

- "title": the cover line in final form, ALL-CAPS ready, 4-10 words, ending with "?" when it is a question. It must make complete sense on its own.
- "titleOptions": FOUR more versions of the cover line (same question, different wording; Jev picks the best of the five). This is the most important copy in the post: it sits on the first frame. Plain words, said the way a person would say it out loud, instantly understood, and it makes them want to answer. Vary the shape: a direct question, a one-line setup then the choice, a "you get one..." scenario.
- "options": write 15 candidates (Jev picks the best five later; 2026-09-30, per Keenan: "make it 15 answers and jev picks the top 5"). Each one:
  - "name": the label on the slide: a natural, complete ANSWER to the question, the way a person would actually reply, 1-8 words ("In the bathroom with the fan on", "The car in the driveway", "Tokyo, Japan", "Porsche 911 GT3 RS"). Read the question, then the name: it must make instant sense as the reply. Never a clipped caption ("Bathroom Fan On", "Target With No List"). No numbers; the renderer adds them.
  - "lore": one line on why someone picks this one and what it says about them (used for the caption and ranking, never shown on the slide).
  - "scene": one or two sentences describing a REAL photograph for this option: the place or thing itself, its light and mood. Keep it clean: no stray props added for "story" (no laptops, notebooks, books, mugs, cups, bags, phones or papers) unless the option is literally about that object. The fifteen scenes must look different from each other (setting, time of day, palette). ${people}
  - "motion": ${
    brand === "bwk"
      ? `one sentence of CALM, controlled, premium movement for this option's five-second clip: one slow, deliberate motion and a slow steady camera push-in or drift (the GT3 RS rolls slowly out of the garage as its headlights come on; city lights flicker on below the penthouse as the camera slowly drifts in). Nothing fast or chaotic (2026-10-01, Keenan: BWK "too chaotic right now").`
      : `one sentence of DYNAMIC, clearly visible movement for this option's five-second clip, true to the scene, with the subject moving and the camera moving (she lifts the overflowing laundry basket and turns toward the stairs as the camera follows; waves crash below the terrace as the camera sweeps out). Realistic speed, never a static frame.`
  }
- Every option must be a real, tempting answer; none is a joke or a throwaway, and no two are the same idea in different words.${
    brand === "bwk"
      ? "\n- Every option is something he would be PROUD to pick or is working toward: an ambition, a standard, a kind of man. Never a list of his failures or bad habits."
      : "\n- Every option is an escape or a relief she would want right now (a place, a ritual, an hour, a kind of help), told with warmth, never a list of her failings or chores."
  }
- Every option is SPECIFIC and real AND instantly recognizable, named the way most people would say it: cars as make and model ("Porsche 911 GT3 RS"), watches by brand and model ("Rolex Submariner"), places as city and country ("Tokyo, Japan", "Dubai, UAE", "New York City", "Lake Como, Italy"). Never a neighborhood, building or niche name most readers won't know ("Azabudai Tokyo", "Dubai Marina Penthouse"). Ripple options can be a clearly drawn person or moment. Never a generic category ("The Black Sedan", "The First New Car", "A Walk Alone", "The Desert Rig").${
    brand === "bwk"
      ? `\n- BWK's world is aspirational LUXURY (2026-09-30, per Keenan: "bwk is about luxury cars"). When the question is about something he could own or a place he could live or go, every option is the exact high-end thing by name: cars like the Porsche 911 GT3 RS, Mercedes-AMG G63, Rolls-Royce Cullinan, Aston Martin DB12, Ferrari Roma, Lamborghini Urus, McLaren 750S, Bentley Continental GT, Range Rover SV; watches like the Rolex Submariner, Audemars Piguet Royal Oak, Patek Philippe Nautilus; cities and places like Monaco, Dubai Marina, a Tokyo penthouse, Lake Como. These are examples, pick fresh ones. Never economy, used or ordinary choices. The "lore" line says what picking it says about the man. The scene shows that exact car, watch or place, hyperreal, with no badges, logos or text.`
      : ""
  }
- Stay on the post's subject, which is about: ${CORE[brand]} ${OFF_BRAND}
- "coverScene": the FIRST FRAME photograph (start from the pitched opening photo when given). It is the single most important image in the post: ${
    brand === "ripple"
      ? "the place, light or moment of escape and relief she would give anything to step into right now (a sunlit terrace over the sea, a deep bath with the door locked, a quiet cabin porch at dawn), beautiful and inviting"
      : "the luxury life he is working toward at its most desirable (the car in perfect light, the penthouse view at night, the yacht deck at golden hour), hyperreal and premium"
  }. It sets up the question without showing the five options. Keep the top quarter of the frame calm (the cover line sits there).
- "coverMotion": one sentence of movement for the cover's five-second clip that is VISIBLE FROM THE VERY FIRST FRAME, not a slow build: ${
    brand === "ripple"
      ? "curtains billowing in the sea breeze as sunlight sweeps the room; waves rolling in below the terrace as the camera glides forward"
      : "the car's headlights flare on as the camera glides along its side; city lights sweep below the penthouse glass as the camera pushes in. Controlled and premium, never chaotic"
  }. Realistic speed, no people moving quickly.
- "endCard": 2-6 words, ALL-CAPS ready: a short, direct question asking for THEIR pick that echoes this post's question ("WHERE ARE YOU MOVING?", "WHICH CAR IS YOURS?", "WHERE ARE YOU HIDING?"). It must make sense on its own. Never a "tag the one..." instruction.
- "captionQuestion": one short caption question that gets a number AND a reason in the comments.
No emojis.

${HUMAN_VOICE_RULES}

OUTPUT (JSON):
{ "title": "...", "titleOptions": ["...", "...", "...", "..."], "coverScene": "...", "coverMotion": "...", "options": [{ "name": "...", "lore": "...", "scene": "...", "motion": "..." }], "endCard": "...", "captionQuestion": "..." }`;
}

// ─── Jev selection (pure logic, exported for tests) ──────────────────

/** Jev picks one concept. Returns the index into `concepts` (0 when Jev is off). */
export async function pickConcept(
  brand: PickBrand,
  concepts: PickConcept[],
  loop: PickLoopContext = {}
): Promise<{ index: number; table: string; dims?: Record<string, number> }> {
  if (concepts.length <= 1) return { index: 0, table: "" };
  // Weights learned from our 48h results (jev-calibration.ts); defaults until
  // there are enough scored posts.
  const { readPickWeights } = await import("./jev-calibration");
  const w = await readPickWeights(brand);
  const { askJev, scoreOf, noulOf, SCROLL_STOP_LEVELS } = await import("./jev");
  const questions: Parameters<typeof askJev>[2] = {};
  const clearQuestions: Parameters<typeof askJev>[2] = {};
  concepts.forEach((_, i) => {
    questions[`scroll_${i}`] = {
      type: "score",
      instructions: `The FIRST FRAME of a video is the photo \`concepts[${i}].opening_photo\` with the line \`concepts[${i}].cover_line\` on top, seen for one second. How strongly would the reader described in \`audience\` stop scrolling for it? Use \`history\` (what has and hasn't worked on this account) as context.`,
      criteria: SCROLL_STOP_LEVELS,
    };
    // Watch-through (2026-10-03, per Keenan: view time comes first).
    questions[`watch_${i}`] = {
      type: "score",
      instructions: `A video opens on \`concepts[${i}]\` and then shows five options, one every couple of seconds. How likely is the reader described in \`audience\` to keep watching until the fifth option before deciding, instead of swiping away?`,
      criteria: WATCH_LEVELS,
    };
    questions[`comment_${i}`] = {
      type: "score",
      instructions: `A post asks \`concepts[${i}].cover_line\` and shows five numbered options. How likely is the reader described in \`audience\` to comment their number, tag a friend or send it on?`,
      criteria: COMMENT_LEVELS,
    };
    questions[`core_${i}`] = {
      type: "noul",
      instructions: `Does \`concepts[${i}].cover_line\` fit the guideline in \`core\` (not off-topic and not everyday trivia like food, chores or preferences)?`,
      criteria: {
        true: "Yes: squarely inside the guideline",
        false: "No: off the guideline, or trivia with nothing at stake",
      },
    };
    clearQuestions[`clear_${i}`] = {
      type: "noul",
      instructions: `Reading ONLY \`covers[${i}]\` as an Instagram post cover, with nothing else to go on, can a stranger tell what the post is about?`,
      criteria: {
        true: "Yes: the cover alone clearly names the topic or situation",
        false: "No: it is vague, cryptic or a command whose subject only makes sense after reading the post",
      },
    };
  });
  const qs = concepts.map((c) => c.question);
  const [r, rc] = await Promise.all([
    askJev(
      `pick-concept:${brand}`,
      {
        audience: AUDIENCE_LINE[brand],
        core: CORE[brand],
        history: {
          what_works: loop.whatWorks || "no data yet",
          what_doesnt: loop.whatDoesnt || "no data yet",
          best_recent_covers: loop.topTitles?.length ? loop.topTitles : "no data yet",
          worst_recent_covers: loop.bottomTitles?.length ? loop.bottomTitles : "no data yet",
        },
        concepts: concepts.map((c) => ({ cover_line: c.question, opening_photo: c.firstFrame || "a photo that sets up the question" })),
      },
      questions
    ),
    askJev(`pick-concept-clear:${brand}`, { covers: qs }, clearQuestions),
  ]);
  if (!r || !rc) return { index: 0, table: "jev unavailable — first concept" };
  let best = -1;
  let bestScore = -Infinity;
  const rows = concepts.map((c, i) => {
    const scroll = scoreOf(r, `scroll_${i}`) ?? 0;
    const watch = scoreOf(r, `watch_${i}`) ?? 0;
    const comment = scoreOf(r, `comment_${i}`) ?? 0;
    const clear = noulOf(rc, `clear_${i}`) ?? 0;
    const core = noulOf(r, `core_${i}`) ?? 0;
    // Performance loop nudge (code, not Jev): proven family +0.05, weak
    // family -0.05, today's focus family +0.03.
    const fam = c.family;
    const label = fam ? loop.familyLabels?.[fam] : undefined;
    const nudge =
      (label === "proven winner" ? 0.05 : label === "weak" ? -0.05 : 0) + (fam && fam === loop.focusFamily ? 0.03 : 0);
    const score = w.scroll * scroll + w.watch * watch + w.comment * comment + w.clear * clear + w.core * core + nudge;
    const eligible = clear >= CLEAR_MIN && core >= CORE_MIN;
    if (eligible && score > bestScore) {
      bestScore = score;
      best = i;
    }
    return `${score.toFixed(3)} scroll=${scroll.toFixed(2)} watch=${watch.toFixed(2)} comment=${comment.toFixed(2)} clear=${clear.toFixed(2)} core=${core.toFixed(2)}${nudge ? ` nudge=${nudge.toFixed(2)}` : ""}${eligible ? "" : " INELIGIBLE"}  ${c.question}${fam ? ` [${fam}]` : ""}`;
  });
  // Nothing eligible: take the most on-brand concept rather than the first.
  const coreOf = (i: number) => noulOf(r, `core_${i}`) ?? 0;
  const index = best >= 0 ? best : concepts.reduce((b, _, i) => (coreOf(i) > coreOf(b) ? i : b), 0);
  const dims = {
    scroll: scoreOf(r, `scroll_${index}`) ?? 0,
    watch: scoreOf(r, `watch_${index}`) ?? 0,
    comment: scoreOf(r, `comment_${index}`) ?? 0,
    clear: noulOf(rc, `clear_${index}`) ?? 0,
    core: noulOf(r, `core_${index}`) ?? 0,
  };
  return { index, table: rows.map((row, i) => `${i === index ? "*" : " "} ${row}`).join("\n"), dims };
}

/**
 * Jev keeps the best five options: drop near-copies (at most one of the
 * twin-flagged group survives, the best-scored), then the top five by
 * pick-desire, returned in the writer's original order so the lineup
 * stays varied. Fails open to the first five.
 */
export async function narrowOptions(
  brand: PickBrand,
  title: string,
  options: PickOptionDraft[],
  keep = 5
): Promise<{ options: PickOptionDraft[]; table: string }> {
  if (options.length <= keep) return { options, table: "" };
  const { askJev, scoreOf, noulOf } = await import("./jev");
  const questions: Parameters<typeof askJev>[2] = {};
  options.forEach((_, i) => {
    questions[`want_${i}`] = {
      type: "score",
      instructions: `How much would the reader described in \`audience\`, reading \`question\`, want to pick \`options[${i}]\`?`,
      criteria: PICK_LEVELS,
    };
    questions[`answer_${i}`] = {
      type: "noul",
      instructions: `Read \`question\`, then \`options[${i}]\` as someone's reply. Does it read as a natural, complete answer that a person would actually say, and that makes sense immediately?`,
      criteria: {
        true: "Yes: a natural answer that makes instant sense",
        false: "No: a clipped label, an odd phrase, or it needs explaining",
      },
    };
    questions[`specific_${i}`] = {
      type: "noul",
      instructions: `Is \`options[${i}]\` a specific, exact thing (an exact make and model, a named watch, a named city or place, a clearly drawn person or moment) rather than a generic category like "a black sedan" or "a new car"?`,
    };
    if (brand === "bwk") {
      questions[`lux_${i}`] = {
        type: "noul",
        instructions: `Would a young man see \`options[${i}]\` as a luxury, high-end, aspirational choice? If \`question\` is not about a possession or place (for example a mentor or a habit), answer yes.`,
      };
    }
    questions[`twin_${i}`] = {
      type: "noul",
      instructions: `Ignoring what every option must share to answer \`question\`, is \`options[${i}]\` nearly a copy of one OTHER entry in \`options\`: the same idea, place or look under a different name?`,
    };
  });
  const r = await askJev(
    `pick-options:${brand}`,
    { audience: AUDIENCE_LINE[brand], question: title, options: options.map((o) => ({ name: o.name, why: o.lore })) },
    questions
  );
  if (!r) return { options: options.slice(0, keep), table: "jev unavailable — first five" };
  const scored = options.map((o, i) => ({
    o,
    i,
    want: scoreOf(r, `want_${i}`) ?? 0,
    twin: noulOf(r, `twin_${i}`) ?? 0,
    specific: noulOf(r, `specific_${i}`) ?? 1,
    answer: noulOf(r, `answer_${i}`) ?? 1,
    lux: brand === "bwk" ? noulOf(r, `lux_${i}`) ?? 1 : 1,
  }));
  // Generic or (BWK) non-luxury options go to the back of the line: they
  // only fill slots when too few good ones exist.
  const good = (x: { specific: number; lux: number; answer: number }) =>
    x.specific >= SPECIFIC_MIN && x.lux >= LUX_MIN && x.answer >= ANSWER_MIN;
  const byWant = [...scored].sort((a, b) => Number(good(b)) - Number(good(a)) || b.want - a.want);
  const chosen: typeof scored = [];
  let twinKept = false;
  for (const s of byWant) {
    if (chosen.length >= keep) break;
    if (s.twin >= TWIN_MIN) {
      if (twinKept) continue;
      twinKept = true;
    }
    chosen.push(s);
  }
  // Too many twins to fill five → top up by score, twins allowed.
  for (const s of byWant) {
    if (chosen.length >= keep) break;
    if (!chosen.includes(s)) chosen.push(s);
  }
  const keepSet = new Set(chosen.map((c) => c.i));
  const table = scored
    .map((s) => `${keepSet.has(s.i) ? "*" : " "} want=${s.want.toFixed(2)} twin=${s.twin.toFixed(2)} specific=${s.specific.toFixed(2)} lux=${s.lux.toFixed(2)} answer=${s.answer.toFixed(2)}  ${s.o.name}`)
    .join("\n");
  return { options: scored.filter((s) => keepSet.has(s.i)).map((s) => s.o), table };
}

/**
 * Best-of-5 cover line (2026-10-03, per Keenan: "first frame ... with
 * excellent verbiage"). Jev reads each line on the first-frame photo:
 * scroll-stop, clear to a stranger, natural spoken words. Code composite;
 * unclear lines are ineligible. Returns the index into `lines` (0 = the
 * writer's own title, also the fail-open answer).
 */
export async function pickCoverLine(
  brand: PickBrand,
  lines: string[],
  firstFrame: string
): Promise<{ index: number; table: string }> {
  if (lines.length <= 1) return { index: 0, table: "" };
  const { askJev, scoreOf, noulOf, SCROLL_STOP_LEVELS } = await import("./jev");
  const qs: Parameters<typeof askJev>[2] = {};
  lines.forEach((_, k) => {
    qs[`scroll_${k}`] = {
      type: "score",
      instructions: `The first frame of a video is \`photo\` with \`lines[${k}]\` in white text on top, seen for one second. How strongly would the reader described in \`audience\` stop scrolling?`,
      criteria: SCROLL_STOP_LEVELS,
    };
    qs[`clear_${k}`] = {
      type: "noul",
      instructions: `Reading ONLY \`lines[${k}]\`, can a stranger tell instantly what is being asked?`,
    };
    qs[`natural_${k}`] = {
      type: "noul",
      instructions: `Does \`lines[${k}]\` sound like something a real person would say out loud, in plain words (not slogan, ad copy or a riddle)?`,
    };
  });
  const r = await askJev(`pick-cover-line:${brand}`, { audience: AUDIENCE_LINE[brand], photo: firstFrame, lines }, qs);
  if (!r) return { index: 0, table: "jev unavailable — writer's title" };
  let best = 0;
  let bestScore = -Infinity;
  const rows = lines.map((line, k) => {
    const scroll = scoreOf(r, `scroll_${k}`) ?? 0;
    const clear = noulOf(r, `clear_${k}`) ?? 0;
    const natural = noulOf(r, `natural_${k}`) ?? 0;
    const score = 0.6 * scroll + 0.25 * clear + 0.15 * natural;
    const eligible = clear >= CLEAR_MIN;
    if (eligible && score > bestScore) {
      bestScore = score;
      best = k;
    }
    return `${score.toFixed(3)} scroll=${scroll.toFixed(2)} clear=${clear.toFixed(2)} natural=${natural.toFixed(2)}${eligible ? "" : " INELIGIBLE"}  ${line}`;
  });
  return { index: best, table: rows.map((row, k) => `${k === best ? "*" : " "} ${row}`).join("\n") };
}

// ─── The full topic ──────────────────────────────────────────────────

const SCENE_ALTS = 4;

/** Jev picks the best photo description per slide (cover + options). */
export async function pickScenes(
  brand: PickBrand,
  title: string,
  coverScene: string,
  coverMotion: string,
  options: PickOptionDraft[]
): Promise<{ cover: { scene: string; motion: string }; options: { scene: string; motion: string }[] }> {
  const fallback = {
    cover: { scene: coverScene, motion: coverMotion },
    options: options.map((o) => ({ scene: o.scene, motion: o.motion ?? "" })),
  };
  type Alt = { scene: string; motion: string };
  let alts: { cover: Alt[]; options: Alt[][] } | null = null;
  try {
    const raw = (await callWriter(
      `pick-scenes-${brand}`,
      `${copyObjectives(brand)}

YOUR JOB: write alternative PHOTO descriptions for a pick-one post. For the cover and for each option, write ${SCENE_ALTS} new scenes, each a different way to photograph it: a REAL photograph that shows that exact answer clearly at a glance (the place, car, city or moment the option names), with its own light and mood, and a "motion" line for its five-second clip (${brand === "bwk" ? "calm, controlled and premium: one slow deliberate motion and a slow steady camera drift; nothing fast or chaotic" : "the subject clearly moves and the camera makes a confident move; never a static frame"}). Show the subject WHOLE inside a vertical frame with space around it (a car at a three-quarter angle, nose to tail in frame; never cropped at the edges). Keep every scene clean: no stray props (no laptops, notebooks, books, mugs, cups, bags, phones or papers) unless the option is that object. Never swap the place for a generic cozy interior.${brand === "bwk" ? " BWK photos look like the luxury life: hyperreal, dark and premium." : " Ripple photos are warm and intimate, but the place itself always comes first."} The photo must SHOW the answer: for a role, person or action, show ONE ${brand === "ripple" ? "woman in her 40s" : "man"} doing it mid-action (from behind, over the shoulder or in profile in shadow, face not the focus), never an empty room standing in for it. No text, logos or badges.

OUTPUT (JSON): { "cover": [{ "scene": "...", "motion": "..." }], "options": [[{ "scene": "...", "motion": "..." }]] } with "options" in the same order as given, ${SCENE_ALTS} each.`,
      JSON.stringify({ question: title, cover: coverScene, options: options.map((o) => ({ answer: o.name, why: o.lore, current_scene: o.scene })) }),
      5000,
      "medium"
    )) as { cover?: Alt[]; options?: Alt[][] };
    const clean = (xs: unknown): Alt[] =>
      (Array.isArray(xs) ? xs : [])
        .filter((x): x is Alt => typeof (x as Alt)?.scene === "string" && !!(x as Alt).scene.trim())
        .map((x) => ({ scene: x.scene.trim(), motion: typeof x.motion === "string" ? x.motion.trim() : "" }));
    alts = { cover: clean(raw.cover), options: options.map((_, i) => clean(raw.options?.[i])) };
  } catch (err) {
    console.warn(`[pick-lane] ${brand} scene alternatives failed — keeping first scenes:`, err instanceof Error ? err.message : err);
    return fallback;
  }
  const { askJev, scoreOf, noulOf } = await import("./jev");
  const slides = [
    { answer: `the FIRST FRAME of a post asking "${title}": the single image that makes ${brand === "ripple" ? "her" : "him"} stop scrolling`, first: fallback.cover, alts: alts.cover },
    ...options.map((o, i) => ({ answer: o.name, first: fallback.options[i], alts: alts!.options[i] })),
  ];
  const picked = await Promise.all(
    slides.map(async (sl, j) => {
      const cands = [sl.first, ...sl.alts].slice(0, SCENE_ALTS + 1);
      if (cands.length < 2) return { pick: sl.first, table: "" };
      const qs: Parameters<typeof askJev>[2] = {};
      cands.forEach((_, k) => {
        qs[`fit_${k}`] = {
          type: "score",
          instructions: `How clearly and attractively would a real photograph of \`scenes[${k}]\` show \`answer\` to someone reading \`question\`?`,
          criteria: [
            "Not at all: it shows something else",
            "Loosely: you would need the caption to connect them",
            "Clearly: it obviously shows that answer",
            "Perfectly: it shows that answer at a glance and makes you want it",
          ],
        };
        qs[`props_${k}`] = {
          type: "noul",
          instructions: `Does \`scenes[${k}]\` include objects that have nothing to do with \`answer\` (a laptop, notebook, mug, bag, phone or papers added for decoration)?`,
        };
      });
      const r = await askJev(`pick-scene:${brand}:${j}`, { question: title, answer: sl.answer, scenes: cands.map((c) => c.scene) }, qs);
      if (!r) return { pick: sl.first, table: "jev unavailable" };
      let best = 0;
      let bestScore = -Infinity;
      const rows = cands.map((c, k) => {
        const fit = scoreOf(r, `fit_${k}`) ?? 0;
        const props = noulOf(r, `props_${k}`) ?? 0;
        const score = fit - 0.3 * props;
        if (score > bestScore) {
          bestScore = score;
          best = k;
        }
        return { score, fit, props, scene: c.scene };
      });
      return {
        pick: cands[best],
        table: rows
          .map((x, k) => `${k === best ? "*" : " "} ${x.score.toFixed(2)} fit=${x.fit.toFixed(2)} props=${x.props.toFixed(2)}  ${x.scene.slice(0, 110)}`)
          .join("\n"),
      };
    })
  );
  picked.forEach((p, j) => p.table && console.log(`[pick-lane] ${brand} scene pick, slide ${j} (${slides[j].answer}):\n${p.table}`));
  return { cover: picked[0].pick, options: picked.slice(1).map((p) => p.pick) };
}

export async function generatePickTopic(opts: {
  brand: PickBrand;
  theme?: string;
  recentTitles: string[];
  recentNames: string[];
  feedback?: string | null;
  loop?: PickLoopContext;
}): Promise<ChoiceTopic> {
  const { brand } = opts;
  const loop = opts.loop ?? {};
  const { recentHeadlinesPromptBlock, isRecentHeadline } = await import("./headline-history");

  // 1. Five concepts → Jev picks one.
  const history = await recentHeadlinesPromptBlock();
  // Research seeds (2026-10-01, per Keenan: competitor briefs feed content).
  // How many concepts may build on them follows the scoreboard: weak →
  // usually none (1 in 4 runs still explores), proven winner → 2, else 1.
  const seedSlots =
    loop.researchLabel === "proven winner" ? 2 : loop.researchLabel === "weak" ? (Math.random() < 0.25 ? 1 : 0) : 1;
  let seeds: { id: string }[] = [];
  let seedBlock = "";
  if (seedSlots > 0) {
    try {
      const { getResearchSeeds, renderResearchSeeds } = await import("./competitor-mimic");
      const got = await getResearchSeeds(brand, 3);
      seeds = got;
      if (got.length)
        seedBlock = `RESEARCH SEEDS: what posts for this same audience did far better than usual this week (mechanics, never wording):\n${renderResearchSeeds(got)}\nUp to ${seedSlots} of your concepts that are NOT approved questions may build on a seed: take its situation or angle and turn it into a pick-one question in our own words, and set "seed" to its label. Skip the seeds if none fits the pick-one format naturally.`;
    } catch (err) {
      console.warn(`[pick-lane] ${brand} research seeds unavailable:`, err instanceof Error ? err.message : err);
    }
  }
  const conceptsRaw = (await callWriter(
    `pick-concepts:${brand}`,
    conceptSystem(brand),
    [
      opts.theme ? `Lane notes: ${opts.theme}` : "",
      opts.recentTitles.length
        ? `This lane's recent covers (pick different subjects):\n${opts.recentTitles.slice(0, 30).map((t) => `- ${t}`).join("\n")}`
        : "",
      opts.feedback ?? "",
      loop.focusFamily
        ? `TODAY'S FOCUS (chosen from this account's results): at least three of your five concepts must be in the family "${loop.focusFamily}".`
        : "",
      loop.whatWorks ? `What has worked on this account: ${loop.whatWorks}.` : "",
      loop.whatDoesnt ? `What has not worked: ${loop.whatDoesnt}.` : "",
      seedBlock,
      history,
      "Write exactly five concepts.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    2000
  )) as { concepts?: Partial<PickConcept>[] };
  let concepts: PickConcept[] = (conceptsRaw.concepts ?? [])
    .filter((c) => typeof c?.question === "string" && c.question.trim())
    .map((c) => ({
      question: c.question!.trim(),
      firstFrame: typeof c.firstFrame === "string" ? c.firstFrame.trim() : undefined,
      why: typeof c.why === "string" ? c.why.trim() : "",
      family:
        typeof c.family === "string" && PICK_FAMILIES[brand].includes(c.family.trim()) ? c.family.trim() : undefined,
      seed: typeof c.seed === "string" && /^R[1-9]$/.test(c.seed.trim()) ? c.seed.trim() : undefined,
    }))
    .slice(0, 5);
  const fresh: PickConcept[] = [];
  for (const c of concepts) if (!(await isRecentHeadline(c.question))) fresh.push(c);
  if (fresh.length) concepts = fresh;
  if (!concepts.length) throw new Error(`pick concepts unusable for ${brand}`);
  const picked = await pickConcept(brand, concepts, loop);
  const concept = concepts[picked.index];
  console.log(`[pick-lane] ${brand} concept pick:\n${picked.table}`);

  // 2. Nine options → Jev keeps five. One rewrite if the copy check flags it.
  const writeOptions = async (extra: string) => {
    const raw = (await callWriter(
      `pick-options:${brand}`,
      optionsSystem(brand),
      [
        `The post's question: "${concept.question}"`,
        concept.firstFrame ? `Pitched opening photo (first frame): ${concept.firstFrame}` : "",
        concept.why ? `Why it works: ${concept.why}` : "",
        opts.recentNames.length ? `Options used recently (don't repeat): ${opts.recentNames.slice(0, 40).join(", ")}` : "",
        extra,
      ]
        .filter(Boolean)
        .join("\n\n"),
      7000
    )) as {
      title?: string;
      titleOptions?: unknown;
      coverScene?: string;
      coverMotion?: string;
      options?: Partial<PickOptionDraft>[];
      endCard?: string;
      captionQuestion?: string;
    };
    const options = (raw.options ?? [])
      .filter((o) => typeof o?.name === "string" && typeof o?.scene === "string")
      .map((o) => ({
        name: o.name!.trim(),
        lore: typeof o.lore === "string" ? o.lore.trim() : "",
        scene: o.scene!.trim(),
        motion: typeof o.motion === "string" ? o.motion.trim() : "",
      }));
    const title = (raw.title ?? concept.question).trim();
    if (options.length < 5 || !raw.coverScene) {
      throw new Error(`pick options unusable for ${brand}: ${options.length} options, coverScene=${!!raw.coverScene}`);
    }
    // Copy check (dash fix + Jev sense flag; never rewrites).
    const checked = await humanizePass({
      purpose: `humanize:pick-${brand}`,
      voice: brand === "ripple" ? "warm, plain, on her side" : "calm, certain, plain",
      payload: {
        title,
        names: options.map((o) => o.name),
        endCard: (raw.endCard ?? "").trim(),
        captionQuestion: (raw.captionQuestion ?? "").trim(),
      },
    });
    const titleOptions = (Array.isArray(raw.titleOptions) ? raw.titleOptions : [])
      .filter((t): t is string => typeof t === "string" && !!t.trim())
      .map((t) => t.trim().replace(/\s*[—–]\s*/g, ", "))
      .filter((t) => !copyFlagFor(t))
      .slice(0, 4);
    return {
      title: typeof checked.title === "string" && checked.title.trim() ? checked.title.trim() : title,
      titleOptions,
      coverScene: raw.coverScene.trim(),
      coverMotion: (raw.coverMotion ?? "").trim(),
      options: options.map((o, i) => ({
        ...o,
        name: typeof checked.names?.[i] === "string" && checked.names[i].trim() ? checked.names[i].trim() : o.name,
      })),
      endCard: checked.endCard || "COMMENT YOUR NUMBER.",
      captionQuestion: checked.captionQuestion || "Which one are you, and why?",
    };
  };
  let draft = await writeOptions("");
  const flag = copyFlagFor(draft.title);
  if (flag) {
    try {
      draft = await writeOptions(flag);
    } catch (err) {
      console.warn(`[pick-lane] ${brand} rewrite failed — keeping first draft:`, err instanceof Error ? err.message : err);
    }
  }
  // Best-of-5 cover line on the first frame (2026-10-03).
  const lines = [draft.title, ...draft.titleOptions.filter((t) => t.toLowerCase() !== draft.title.toLowerCase())];
  const line = await pickCoverLine(brand, lines, concept.firstFrame || draft.coverScene);
  console.log(`[pick-lane] ${brand} cover line pick:\n${line.table}`);
  draft.title = lines[line.index];
  const narrowed = await narrowOptions(brand, draft.title, draft.options);
  console.log(`[pick-lane] ${brand} options for "${draft.title}":\n${narrowed.table}`);

  // Best-of-5 photo per slide (2026-09-30, per Keenan: "same with photo
  // prompts"): Sonnet writes 4 more scenes for the cover and each kept
  // option; Jev picks the one that best shows that slide. Fails open to
  // the writer's first scene.
  const scenes = await pickScenes(brand, draft.title, draft.coverScene, draft.coverMotion, narrowed.options);
  draft.coverScene = scenes.cover.scene;
  draft.coverMotion = scenes.cover.motion || draft.coverMotion;
  narrowed.options = narrowed.options.map((o, i) => ({ ...o, scene: scenes.options[i].scene, motion: scenes.options[i].motion || o.motion }));

  // Research seed used by the winning concept → recorded for the loop.
  const seedRow = concept.seed ? seeds[Number(concept.seed.slice(1)) - 1] : undefined;
  const researchSeed = seedRow?.id;
  if (researchSeed) {
    const { markResearchSeedUsed } = await import("./competitor-mimic");
    await markResearchSeedUsed(researchSeed);
    console.log(`[pick-lane] ${brand} concept built on research seed ${concept.seed} (${researchSeed})`);
  }

  const slug = `pick-${brand}-${draft.title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 50)}`;
  return {
    slug,
    title: draft.title,
    coverScene: draft.coverScene,
    coverMotion: draft.coverMotion,
    options: narrowed.options.map((o) => ({ name: o.name, lore: o.lore, scene: o.scene, motion: o.motion ?? "" })),
    endCard: draft.endCard,
    captionQuestion: draft.captionQuestion,
    // Theme family (for the performance loop's recipe); the question is the title.
    category: concept.family ?? "unknown",
    researchSeed,
    jev: picked.dims,
  };
}

// ─── Images + caption ────────────────────────────────────────────────

/**
 * Photo prompt for a pick-lane cover or option. Same realism mandate as
 * buildMoodyImagePrompt (a REAL photograph, tack-sharp, no text), in the
 * brand's look: Ripple = warm, dim, feminine quiet luxury (white text
 * sits on top); BWK = dark, austere, luxurious. Unlike the moody lanes a
 * lone anonymous figure is allowed when the option needs one.
 */
export function buildPickImagePrompt(brand: PickBrand, scene: string, kind: "cover" | "option"): string {
  const style =
    brand === "ripple"
      ? // 2026-10-03: escape & relief — luminous and inviting, not dim and moody.
        "Luminous, inviting escape photography with a feminine quiet-luxury eye: golden-hour and soft daylight, sea air, warm stone, linen, water, open windows. Rich, warm, true color with gentle contrast. Beautiful, airy and aspirational: a place she would give anything to step into right now."
      : "Dark, dominant, moody photography with a muted cinematic grade — deep blacks, charcoal and slate, cold glass and storm light — where the scene's own accent color (a sunset, burnished gold, a car's paint, an ember) is allowed to glow richly. Austere, powerful, commanding.";
  const people =
    brand === "ripple"
      ? "People: only the ones the scene names; a woman shown doing the action, from behind, over the shoulder, in profile in shadow or as hands, face not the focus. No children's faces. No animals unless the scene names one."
      : "People: only the ones the scene names; at most ONE man (or two for a scene about friends) doing the action, from behind, over the shoulder or in profile in shadow, face not the focus. No animals unless the scene names one.";
  return [
    `A REAL photograph a person actually took with a camera: ${scene}`,
    "THE SCENE COMES FIRST: show exactly the place, subject and light described above. If it is a bright store aisle, a sunny garage or a car in a driveway, show exactly that; never swap it for a different room or a generic cozy interior. The style below only sets mood and color grade.",
    style,
    brand === "ripple"
      ? "Bright and luminous overall with real depth and contrast, never washed out, flat or hazy."
      : "Overall DIM and shadowed in mood — low-key with deep blacks — but with full contrast and real, crisp highlights, never flat or murky grey.",
    kind === "cover"
      ? "Keep the TOP QUARTER of the frame calm and darker (the question is set there in white text); the main subject sits in the middle of the frame."
      : "Keep the TOP FIFTH of the frame calm and darker (the option's name is set there in white text); the subject sits in the middle of the frame.",
    "Shot on a full-frame camera, editorial magazine quality, true-to-life materials and light. TACK-SHARP and high-resolution, perfectly focused on the subject. Physically believable optics: honest exposure, natural depth of field, a faint touch of grain. It must be INDISTINGUISHABLE from an unretouched real photograph — no CGI, render, or illustration look, no plastic surfaces, no impossible glow.",
    "ATTENTION TO DETAIL: every element is fully resolved with fine, true texture; no mushy, smeared, or painterly areas anywhere.",
    "Vertical frame. Keep the subject and every important detail inside the central 4:5 area — the edges get cropped.",
    // 2026-09-30, Keenan: "make sure the luxury item always fits the screen.
    // the car one had some issues".
    "FIT THE WHOLE SUBJECT IN FRAME: a car, watch, building or person is shown COMPLETE, never cut off at any edge. Frame a car at a three-quarter angle from the front, nose to tail inside the frame, filling about 60% of the width, with clear space on both sides and above and below. A watch or object sits whole in the center with room around it.",
    people,
    "CLEAN composition: show only what the scene describes. Do NOT add props: no laptops, notebooks, books, mugs, cups, bags, phones or papers unless the scene names them.",
    "Screens may glow softly but show NO readable content.",
    "Absolutely NO text, letters, words, numbers, logos, or watermarks anywhere in the image.",
  ].join("\n");
}

/** Caption used until the caption writer replaces it at publish time. */
export function buildPickCaption(brand: PickBrand, question: string): string {
  const pools: Record<PickBrand, string[][]> = {
    ripple: [
      ["#metime", "#selfcare", "#escape", "#whichoneareyou"],
      ["#womenover40", "#slowliving", "#dreamgetaway", "#pickone"],
      ["#momneedsabreak", "#solotravel", "#quietluxury", "#commentyournumber"],
    ],
    bwk: [
      ["#luxurylifestyle", "#motivation", "#discipline", "#pickone"],
      ["#dreamcar", "#ambition", "#buildyourself", "#whichoneareyou"],
      ["#luxury", "#successmindset", "#grind", "#commentyournumber"],
    ],
  };
  const tags = pools[brand][Math.floor(Math.random() * pools[brand].length)];
  return `${question}\n\n${tags.join(" ")}`;
}
