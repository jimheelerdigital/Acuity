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
}

export interface PickOptionDraft {
  name: string;
  lore: string;
  scene: string;
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
    "discipline and the habits he is building; training; money, work and ambition (what he is working toward: the car, the home, the business); the man he is becoming; the mentors and role models he learns from; the friends and brothers in his corner; his mornings and routines; where he builds his life; the hard things he chooses on purpose.",
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

// ─── Sonnet calls ───────────────────────────────────────────────────

async function callWriter(purpose: string, system: string, user: string, maxTokens: number): Promise<unknown> {
  const { prisma } = await import("@/lib/prisma");
  const start = Date.now();
  try {
    const response = await contentAnthropic.messages.create({
      max_tokens: maxTokens,
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

YOUR JOB: pitch five "which one is you?" posts for this account. The format: a question cover, then five numbered options with a photo each, then a card asking the reader to comment their number. It works when every option is a version of the reader's own life, so picking one says something about her or him, commenting is as easy as typing a number, and people tag or send it to a friend.

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
The five concepts must be clearly different subjects from each other and from recent posts.

${HUMAN_VOICE_RULES}

OUTPUT (JSON): { "concepts": [{ "question": "...", "why": "..." }] }`;
}

function optionsSystem(brand: PickBrand): string {
  const people =
    brand === "ripple"
      ? `Prefer places, objects and moments over people (a car parked in a quiet driveway, a bath with a book, a café window seat). A woman may appear only when the option truly needs one, and then seen from behind, in soft silhouette or as hands, face never visible.`
      : `Prefer places, objects and scenes over people (an empty gym at dawn, a black car in rain, a desk with one lamp). A man may appear only when the option truly needs one (a mentor, a friend), and then distant, from behind or in silhouette, face never visible.`;
  return `${copyObjectives(brand)}

YOUR JOB: write the options for one "which one is you?" post whose question is given below.

- "title": the cover question in final form, ALL-CAPS ready, 4-10 words, ending with "?" when it is a question. It must make complete sense on its own.
- "options": write 9 candidates (the best five are picked later). Each one:
  - "name": 1-5 words in Title Case, the label on the slide ("The Car in the Driveway", "Empty Gym at 5am"). Easy to recognize and to type as a number in a comment. No numbers; the renderer adds them.
  - "lore": one line on why someone picks this one and what it says about them (used for the caption and ranking, never shown on the slide).
  - "scene": one or two sentences describing a REAL photograph for this option: its place, light, objects and mood. The nine scenes must look different from each other (setting, time of day, palette). ${people}
- Every option must be a real, tempting answer; none is a joke or a throwaway, and no two are the same idea in different words.${
    brand === "bwk"
      ? "\n- Every option is something he would be PROUD to pick or is working toward: an ambition, a standard, a kind of man. Never a list of his failures or bad habits."
      : "\n- Every option is a version of her own life she would recognize and feel seen by, told with warmth, never a list of her failings."
  }
- Stay on the post's subject, which is about: ${CORE[brand]} ${OFF_BRAND}
- "coverScene": the cover photograph: an inviting scene that sets up the question without showing the options. Keep the top quarter of the frame calm (the title sits there).
- "coverMotion": one sentence of calm, realistic movement for the cover's five-second clip (steam rises from the mug as rain runs down the window; mist drifts past the empty track as the light comes up). Nothing fast, no people moving quickly.
- "endCard": 2-6 words, ALL-CAPS ready, asking for their pick in a ${brand === "ripple" ? "warm" : "calm, direct"} voice; vary it ("COMMENT YOUR NUMBER.", "TAG YOUR #3.", "WHICH ONE ARE YOU?").
- "captionQuestion": one short caption question that gets a number AND a reason in the comments.
No emojis.

${HUMAN_VOICE_RULES}

OUTPUT (JSON):
{ "title": "...", "coverScene": "...", "coverMotion": "...", "options": [{ "name": "...", "lore": "...", "scene": "..." }], "endCard": "...", "captionQuestion": "..." }`;
}

// ─── Jev selection (pure logic, exported for tests) ──────────────────

/** Jev picks one concept. Returns the index into `concepts` (0 when Jev is off). */
export async function pickConcept(brand: PickBrand, concepts: PickConcept[]): Promise<{ index: number; table: string }> {
  if (concepts.length <= 1) return { index: 0, table: "" };
  const { askJev, scoreOf, noulOf, SCROLL_STOP_LEVELS } = await import("./jev");
  const questions: Parameters<typeof askJev>[2] = {};
  const clearQuestions: Parameters<typeof askJev>[2] = {};
  concepts.forEach((_, i) => {
    questions[`scroll_${i}`] = {
      type: "score",
      instructions: `How strongly would the reader described in \`audience\` stop scrolling for a post whose cover asks \`concepts[${i}]\`?`,
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
    askJev(`pick-concept:${brand}`, { audience: AUDIENCE_LINE[brand], core: CORE[brand], concepts: qs }, questions),
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
    const score = 0.35 * scroll + 0.3 * comment + 0.1 * clear + 0.25 * core;
    const eligible = clear >= CLEAR_MIN && core >= CORE_MIN;
    if (eligible && score > bestScore) {
      bestScore = score;
      best = i;
    }
    return `${score.toFixed(3)} scroll=${scroll.toFixed(2)} comment=${comment.toFixed(2)} clear=${clear.toFixed(2)} core=${core.toFixed(2)}${eligible ? "" : " INELIGIBLE"}  ${c.question}`;
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
  }));
  const byWant = [...scored].sort((a, b) => b.want - a.want);
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
    .map((s) => `${keepSet.has(s.i) ? "*" : " "} want=${s.want.toFixed(2)} twin=${s.twin.toFixed(2)}  ${s.o.name}`)
    .join("\n");
  return { options: scored.filter((s) => keepSet.has(s.i)).map((s) => s.o), table };
}

// ─── The full topic ──────────────────────────────────────────────────

export async function generatePickTopic(opts: {
  brand: PickBrand;
  theme?: string;
  recentTitles: string[];
  recentNames: string[];
  feedback?: string | null;
}): Promise<ChoiceTopic> {
  const { brand } = opts;
  const { recentHeadlinesPromptBlock, isRecentHeadline } = await import("./headline-history");

  // 1. Five concepts → Jev picks one.
  const history = await recentHeadlinesPromptBlock();
  const conceptsRaw = (await callWriter(
    `pick-concepts:${brand}`,
    conceptSystem(brand),
    [
      opts.theme ? `Lane notes: ${opts.theme}` : "",
      opts.recentTitles.length
        ? `This lane's recent covers (pick different subjects):\n${opts.recentTitles.slice(0, 30).map((t) => `- ${t}`).join("\n")}`
        : "",
      opts.feedback ?? "",
      history,
      "Write exactly five concepts.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    2000
  )) as { concepts?: Partial<PickConcept>[] };
  let concepts = (conceptsRaw.concepts ?? [])
    .filter((c) => typeof c?.question === "string" && c.question.trim())
    .map((c) => ({ question: c.question!.trim(), why: typeof c.why === "string" ? c.why.trim() : "" }))
    .slice(0, 5);
  const fresh: PickConcept[] = [];
  for (const c of concepts) if (!(await isRecentHeadline(c.question))) fresh.push(c);
  if (fresh.length) concepts = fresh;
  if (!concepts.length) throw new Error(`pick concepts unusable for ${brand}`);
  const picked = await pickConcept(brand, concepts);
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
      4000
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
      .map((o) => ({ name: o.name!.trim(), lore: typeof o.lore === "string" ? o.lore.trim() : "", scene: o.scene!.trim() }));
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
    options: narrowed.options.map((o) => ({ name: o.name, lore: o.lore, scene: o.scene, motion: "" })),
    endCard: draft.endCard,
    captionQuestion: draft.captionQuestion,
    category: concept.question,
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
      ? "People: none unless the scene names one; then ONE woman only, seen from behind, in soft silhouette or as hands, face never visible. No children's faces. No animals unless the scene names one."
      : "People: none unless the scene names one; then at most ONE man (or two for a scene about friends), distant, from behind or in silhouette, face never visible. No animals unless the scene names one.";
  return [
    `A REAL photograph a person actually took with a camera: ${scene}`,
    style,
    "Overall DIM and shadowed in mood — low-key with deep blacks — but with full contrast and real, crisp highlights, never flat or murky grey.",
    kind === "cover"
      ? "Keep the TOP QUARTER of the frame calm and darker (the question is set there in white text); the main subject sits in the middle of the frame."
      : "Keep the TOP FIFTH of the frame calm and darker (the option's name is set there in white text); the subject sits in the middle of the frame.",
    "Shot on a full-frame camera, editorial magazine quality, true-to-life materials and light. TACK-SHARP and high-resolution, perfectly focused on the subject. Physically believable optics: honest exposure, natural depth of field, a faint touch of grain. It must be INDISTINGUISHABLE from an unretouched real photograph — no CGI, render, or illustration look, no plastic surfaces, no impossible glow.",
    "ATTENTION TO DETAIL: every element is fully resolved with fine, true texture; no mushy, smeared, or painterly areas anywhere.",
    "Vertical frame. Keep the subject and every important detail inside the central 4:5 area — the edges get cropped.",
    people,
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
