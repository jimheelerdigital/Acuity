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
  ripple: [
    "the mental load she carries",
    "time and space that is only hers",
    "the roles she plays (mother, partner, daughter, friend)",
    "who she is becoming",
    "saying no and taking something back",
    "her friendships",
    "the life she keeps postponing (trips, dreams, plans)",
  ],
  bwk: [
    "luxury cars",
    "luxury watches",
    "homes, cities and views",
    "training and the body",
    "habits and discipline",
    "mentors and role models",
    "brotherhood and the friends in his corner",
    "money, business and ambition",
    "the man he is becoming",
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
}

export interface PickOptionDraft {
  name: string;
  lore: string;
  scene: string;
  /** Calm realistic action for this option's animated clip (every slide animates since 2026-09-30). */
  motion?: string;
}

/** Seed concepts (Keenan approved these 2026-09-30); the writer invents fresh ones in their spirit. */
const SEEDS: Record<PickBrand, string[]> = {
  ripple: [
    "Pick the one job you'd hand off forever",
    "Where are you hiding for one hour where nobody needs you?",
    "Which kind of tired are you today?",
    "Which friend in the group chat are you?",
    "Pick the house you'd disappear to for a week, alone",
    "What would you finally say no to?",
    "Which season of life are you in?",
    "Which Sunday are you having?",
    "Which you would you have coffee with?",
    "What's your 'I need a minute' ritual?",
  ],
  bwk: [
    "Pick your 5am",
    "Which training style is you?",
    "Choose your mentor",
    "Which car are you working toward?",
    "Which room do you build first?",
    "Pick the city you rebuild your life in",
    "Which habit would change your life fastest?",
    "Pick your hard mode for 30 days",
    "Which man are you at 30?",
    "Who's in your corner?",
  ],
};

/**
 * What a pick post must be ABOUT (2026-09-30, after the first dry run
 * produced "WHAT'S YOUR REAL ANSWER TO WHAT'S FOR DINNER?" and "WHAT'S
 * YOUR 11PM KITCHEN HABIT?" — Keenan: "what ... do they have to do with
 * our target audiences?"). Trivia with nothing at stake is out.
 */
const CORE: Record<PickBrand, string> = {
  ripple:
    "the mental load she carries for everyone; being the one who remembers and holds it all together; wanting an hour where nobody needs her; the roles she plays (mother, partner, daughter caring for aging parents, the friend everyone leans on); the season of life she is in and who she is becoming at 40-50; rest, escape and time that is only hers; saying no and taking something back for herself; her friendships.",
  bwk:
    "the LUXURY life he is working toward (exact luxury cars, watches, homes, cities); discipline and the habits he is building; training; money, work and ambition; the man he is becoming; the mentors and role models he learns from; the friends and brothers in his corner; his mornings and routines; where he builds his life; the hard things he chooses on purpose.",
};

const OFF_BRAND =
  "Never trivia or everyday preferences with nothing at stake: food and meals (what's for dinner, snacks, late-night eating), chores, household logistics, coffee orders, generic lifestyle quizzes. The test: the pick has to say something real about who the reader is, what they carry or who they are becoming.";

const AUDIENCE_LINE: Record<PickBrand, string> = {
  ripple:
    "Women roughly 40-50 carrying the mental load for everyone (work, kids, partner, aging parents), scrolling Instagram or Facebook on a phone. They want to feel seen and lighter.",
  bwk: "Men roughly 18-30 building discipline and self-respect in private (training, money, focus), scrolling Instagram or Facebook on a phone. They skip hype and guru talk.",
};

const COMMENT_LEVELS = [
  "Nobody would comment, tag or send it",
  "A few might comment a number",
  "Many would comment their number",
  "Many would comment their number AND tag or send it to a friend",
  "It would start a thread: numbers, reasons, and friends tagged",
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

WHAT EVERY POST MUST BE ABOUT, for this audience: ${CORE[brand]}
${OFF_BRAND}

APPROVED QUESTIONS (Keenan picked these): ${SEEDS[brand].map((s) => `"${s}"`).join(", ")}.
At least three of your five concepts must be one of these approved questions (reworded slightly into a clear cover is fine) that is NOT in the recent list; the rest are new questions on the same subjects and just as strong.

Each concept:
- "question": the cover question, 4-10 words, the way a person would ask it out loud. ${
    brand === "ripple"
      ? "It names her situation plainly so she understands it in one second; never a cryptic command. Never medical, never preachy."
      : "Plain, concrete, calm; never hype or guru talk."
  }
- "why": one line on why this audience would comment and tag on it.
- "family": exactly one of these theme families, copied word for word: ${PICK_FAMILIES[brand].map((f) => `"${f}"`).join(", ")}.
- "seed": only when the request lists RESEARCH SEEDS and this concept is built on one: that seed's label, e.g. "R2". Otherwise leave it out.
The five concepts must be clearly different subjects from each other and from recent posts.

${HUMAN_VOICE_RULES}

OUTPUT (JSON): { "concepts": [{ "question": "...", "why": "...", "family": "...", "seed": "R1 (optional)" }] }`;
}

function optionsSystem(brand: PickBrand): string {
  const people =
    brand === "ripple"
      ? `The photo must SHOW the answer, not an empty room standing in for it. When the answer is a role, a person or an action ("the mom who tracks every school form", "the daughter running Mom's appointments"), show ONE woman in her 40s DOING it, mid-action (signing a permission slip at the kitchen counter, walking her mother into a clinic), seen from behind, over the shoulder, in profile in shadow, or as hands, face not the focus. When the answer is a place or object, show it clearly. (2026-09-30, Keenan: an empty couch for "the partner who holds it all together" and shoes for "the mom of a teenager" "has literally nothing to do with it".)`
      : `The photo must SHOW the answer. When it is a car, watch, city or place, show that exact thing as the hero. When it is a person or an action (a mentor, a friend, a habit), show ONE man (or two for friends) DOING it, seen from behind, over the shoulder or in profile in shadow, face not the focus.`;
  return `${copyObjectives(brand)}

YOUR JOB: write the options for one pick-one post (the reader picks one of five) whose question is given below.

- "title": the cover question in final form, ALL-CAPS ready, 4-10 words, ending with "?" when it is a question. It must make complete sense on its own.
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
      : "\n- Every option is a version of her own life she would recognize and feel seen by, told with warmth, never a list of her failings."
  }
- Every option is SPECIFIC and real AND instantly recognizable, named the way most people would say it: cars as make and model ("Porsche 911 GT3 RS"), watches by brand and model ("Rolex Submariner"), places as city and country ("Tokyo, Japan", "Dubai, UAE", "New York City", "Lake Como, Italy"). Never a neighborhood, building or niche name most readers won't know ("Azabudai Tokyo", "Dubai Marina Penthouse"). Ripple options can be a clearly drawn person or moment. Never a generic category ("The Black Sedan", "The First New Car", "A Walk Alone", "The Desert Rig").${
    brand === "bwk"
      ? `\n- BWK's world is aspirational LUXURY (2026-09-30, per Keenan: "bwk is about luxury cars"). When the question is about something he could own or a place he could live or go, every option is the exact high-end thing by name: cars like the Porsche 911 GT3 RS, Mercedes-AMG G63, Rolls-Royce Cullinan, Aston Martin DB12, Ferrari Roma, Lamborghini Urus, McLaren 750S, Bentley Continental GT, Range Rover SV; watches like the Rolex Submariner, Audemars Piguet Royal Oak, Patek Philippe Nautilus; cities and places like Monaco, Dubai Marina, a Tokyo penthouse, Lake Como. These are examples, pick fresh ones. Never economy, used or ordinary choices. The "lore" line says what picking it says about the man. The scene shows that exact car, watch or place, hyperreal, with no badges, logos or text.`
      : ""
  }
- Stay on the post's subject, which is about: ${CORE[brand]} ${OFF_BRAND}
- "coverScene": the cover photograph: an inviting scene that sets up the question without showing the options. Keep the top quarter of the frame calm (the title sits there).
- "coverMotion": one sentence of calm, realistic movement for the cover's five-second clip (steam rises from the mug as rain runs down the window; mist drifts past the empty track as the light comes up). Nothing fast, no people moving quickly.
- "endCard": 2-6 words, ALL-CAPS ready: a short, direct question asking for THEIR pick that echoes this post's question ("WHERE ARE YOU MOVING?", "WHICH CAR IS YOURS?", "WHERE ARE YOU HIDING?"). It must make sense on its own. Never a "tag the one..." instruction.
- "captionQuestion": one short caption question that gets a number AND a reason in the comments.
No emojis.

${HUMAN_VOICE_RULES}

OUTPUT (JSON):
{ "title": "...", "coverScene": "...", "coverMotion": "...", "options": [{ "name": "...", "lore": "...", "scene": "...", "motion": "..." }], "endCard": "...", "captionQuestion": "..." }`;
}

// ─── Jev selection (pure logic, exported for tests) ──────────────────

/** Jev picks one concept. Returns the index into `concepts` (0 when Jev is off). */
export async function pickConcept(
  brand: PickBrand,
  concepts: PickConcept[],
  loop: PickLoopContext = {}
): Promise<{ index: number; table: string }> {
  if (concepts.length <= 1) return { index: 0, table: "" };
  const { askJev, scoreOf, noulOf, SCROLL_STOP_LEVELS } = await import("./jev");
  const questions: Parameters<typeof askJev>[2] = {};
  const clearQuestions: Parameters<typeof askJev>[2] = {};
  concepts.forEach((_, i) => {
    questions[`scroll_${i}`] = {
      type: "score",
      instructions: `How strongly would the reader described in \`audience\` stop scrolling for a post whose cover asks \`concepts[${i}]\`? Use \`history\` (what has and hasn't worked on this account) as context.`,
      criteria: SCROLL_STOP_LEVELS,
    };
    questions[`comment_${i}`] = {
      type: "score",
      instructions: `A post asks \`concepts[${i}]\` and shows five numbered options. How likely is the reader described in \`audience\` to comment their number, tag a friend or send it on?`,
      criteria: COMMENT_LEVELS,
    };
    questions[`core_${i}`] = {
      type: "noul",
      instructions: `Is \`concepts[${i}]\` about something at the heart of this audience's life, as described in \`core\`, rather than everyday trivia (food, meals, chores, preferences)?`,
      criteria: {
        true: "Yes: it is about who they are, what they carry or who they are becoming",
        false: "No: it is trivia or a preference with nothing at stake",
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
        },
        concepts: qs,
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
    const comment = scoreOf(r, `comment_${i}`) ?? 0;
    const clear = noulOf(rc, `clear_${i}`) ?? 0;
    const core = noulOf(r, `core_${i}`) ?? 0;
    // Performance loop nudge (code, not Jev): proven family +0.05, weak
    // family -0.05, today's focus family +0.03.
    const fam = c.family;
    const label = fam ? loop.familyLabels?.[fam] : undefined;
    const nudge =
      (label === "proven winner" ? 0.05 : label === "weak" ? -0.05 : 0) + (fam && fam === loop.focusFamily ? 0.03 : 0);
    const score = 0.35 * scroll + 0.3 * comment + 0.1 * clear + 0.25 * core + nudge;
    const eligible = clear >= CLEAR_MIN && core >= CORE_MIN;
    if (eligible && score > bestScore) {
      bestScore = score;
      best = i;
    }
    return `${score.toFixed(3)} scroll=${scroll.toFixed(2)} comment=${comment.toFixed(2)} clear=${clear.toFixed(2)} core=${core.toFixed(2)}${nudge ? ` nudge=${nudge.toFixed(2)}` : ""}${eligible ? "" : " INELIGIBLE"}  ${c.question}${fam ? ` [${fam}]` : ""}`;
  });
  // Nothing eligible: take the most on-brand concept rather than the first.
  const coreOf = (i: number) => noulOf(r, `core_${i}`) ?? 0;
  const index = best >= 0 ? best : concepts.reduce((b, _, i) => (coreOf(i) > coreOf(b) ? i : b), 0);
  return { index, table: rows.map((row, i) => `${i === index ? "*" : " "} ${row}`).join("\n") };
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
    { answer: `the cover of a post asking "${title}"`, first: fallback.cover, alts: alts.cover },
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
        concept.why ? `Why it works: ${concept.why}` : "",
        opts.recentNames.length ? `Options used recently (don't repeat): ${opts.recentNames.slice(0, 40).join(", ")}` : "",
        extra,
      ]
        .filter(Boolean)
        .join("\n\n"),
      7000
    )) as {
      title?: string;
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
    return {
      title: typeof checked.title === "string" && checked.title.trim() ? checked.title.trim() : title,
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
      ? "Soft, aesthetically pleasing feminine photography — quiet luxury in warm low light: warm lamplight, candlelight, rain on dark windows, linen and dried flowers. Muted, warm, dreamy color grade with soft shadow. Beautiful, calm, intimate, dim but never cold."
      : "Dark, dominant, moody photography with a muted cinematic grade — deep blacks, charcoal and slate, cold glass and storm light — where the scene's own accent color (a sunset, burnished gold, a car's paint, an ember) is allowed to glow richly. Austere, powerful, commanding.";
  const people =
    brand === "ripple"
      ? "People: only the ones the scene names; a woman shown doing the action, from behind, over the shoulder, in profile in shadow or as hands, face not the focus. No children's faces. No animals unless the scene names one."
      : "People: only the ones the scene names; at most ONE man (or two for a scene about friends) doing the action, from behind, over the shoulder or in profile in shadow, face not the focus. No animals unless the scene names one.";
  return [
    `A REAL photograph a person actually took with a camera: ${scene}`,
    "THE SCENE COMES FIRST: show exactly the place, subject and light described above. If it is a bright store aisle, a sunny garage or a car in a driveway, show exactly that; never swap it for a different room or a generic cozy interior. The style below only sets mood and color grade.",
    style,
    "Overall DIM and shadowed in mood — low-key with deep blacks — but with full contrast and real, crisp highlights, never flat or murky grey.",
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
      ["#mentalload", "#momlife", "#selfcare", "#whichoneareyou"],
      ["#womenover40", "#realmotherhood", "#metime", "#pickone"],
      ["#motherhoodunplugged", "#mentalhealthmatters", "#slowliving", "#commentyournumber"],
    ],
    bwk: [
      ["#discipline", "#selfimprovement", "#mindset", "#pickone"],
      ["#buildyourself", "#motivation", "#consistency", "#whichoneareyou"],
      ["#selfdiscipline", "#growthmindset", "#focus", "#commentyournumber"],
    ],
  };
  const tags = pools[brand][Math.floor(Math.random() * pools[brand].length)];
  return `${question}\n\n${tags.join(" ")}`;
}
