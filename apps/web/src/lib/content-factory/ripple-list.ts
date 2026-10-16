/**
 * Ripple "top N" list lane (2026-10-13, per Keenan: "the other lane should be
 * a top 4-8 ways to ____ ... no faces. scenic backgrounds, super informative,
 * super helpful, and posts that speak to our audience in the language from
 * earlier"; "add ripple in SOME of the posts but not all... animate them.
 * snowy backgrounds, ocean rolling, trees and leaves in autumn ... title
 * shapes as well").
 *
 * One post = a cover (the title) + 4-8 item slides, each a real, specific
 * thing she can do or recognize with a short detail line. Every slide is a
 * people-free landscape from ONE scenic world per post (snow, ocean, autumn
 * woods...), animated by Kling from the writer's per-slide MOTION line.
 * Same candidate pipeline as the selfie lane: Opus drafts 5 (each a different
 * title shape), code rules + Opus plain-sense editor cut, Jev ranks.
 */

import { contentAnthropic, lastJsonText, messageText, VISION_MODEL } from "./claude-client";
import { copyObjectives } from "./copy-objectives";
import { HUMAN_VOICE_RULES, stripDashes } from "./humanizer";
import { CLAIMS_RULE, PRODUCT_ONE_LINER, PRODUCT_WHAT_IT_DOES, TIME_OF_DAY_RULE } from "@/lib/positioning";

export interface ListItem {
  /** Slide headline, e.g. "say the list out loud once a day". */
  line: string;
  /** One supporting sentence under it. */
  detail: string;
  /** Landscape scene for this slide (people-free). */
  scene: string;
  /** One natural movement for the clip (waves roll in, snow falls...). */
  motion: string;
  /** Avatar format only: outdoor view or everyday/home shot. */
  place?: "scenic" | "everyday";
}

export interface RippleListTopic {
  slug: string;
  title: string;
  shape: string;
  world: string;
  /** "scenic" (landscapes only) or "avatar" (walking-avatar cover + mixed slides). */
  format: ListFormat;
  mentionsRipple: boolean;
  coverScene: string;
  coverMotion: string;
  items: ListItem[];
  captionQuestion: string;
  /** Life area (explore) or "theme: <winning theme>" (exploit). */
  area?: string;
  /** Exploit (built on the brief's winning themes) vs explore (new area). */
  draftKind?: "exploit" | "explore";
  /** Winner's Jev answers (candidate-calibration.ts). */
  jev?: Record<string, number> | null;
  rankedBy?: string;
  candidateLog?: string;
  /** Set when no candidate passed: emailed but never auto-posted. */
  held?: string;
}

/**
 * Title shapes (2026-10-13, per Keenan: "more along the lines of five ways to
 * __" ... "they don't need to go. but i need more variance"). Ways and signs
 * lead; the other shapes stay in the mix.
 */
export const LIST_SHAPES = [
  'WAYS: "N ways to ___" (e.g. "5 ways to stop feeling so overwhelmed", "4 ways to get your evenings back"). Each item is a clear, doable instruction to the reader.',
  'SIGNS: "N signs ___" (e.g. "4 signs you\'re due for a breakthrough", "5 signs you\'re carrying too much"). Each item is a sign she\'ll recognize in her own week, said plainly.',
  'THINGS I STOPPED: "N things i stopped doing when ___" (first person, what she quit and what it gave back)',
  'SMALL HABITS: "N small habits that ___" (tiny, doable, specific)',
  'QUESTIONS: "N questions to ask yourself when ___" (each item a question she can actually answer)',
  'THINGS NOBODY TELLS YOU: "N things nobody tells you about ___" (honest, true, a little dry)',
] as const;

/**
 * Life areas, one per draft, so the 5 drafts (and the posts over a week)
 * cover different ground instead of circling "the list in your head".
 */
export const LIST_AREAS = [
  "her kids and the school/activities machine",
  "her partner and the split of the household load",
  "aging parents and being the family's caretaker",
  "work, and doing it all while also running home",
  "friendships she keeps postponing",
  "her own rest, sleep and energy (no health claims)",
  "money, the house and the admin nobody sees",
  "midlife: who she is now that she isn't in her 30s",
  "her own goals and the things she keeps putting off",
  "confidence, saying no and asking for help",
] as const;

/** Per post: 2 "ways", 1 "signs", 2 of the other shapes (shuffled). */
function draftShapes(): string[] {
  const others = [...LIST_SHAPES.slice(2)].sort(() => Math.random() - 0.5).slice(0, 2);
  return [LIST_SHAPES[0], LIST_SHAPES[1], LIST_SHAPES[0], ...others].sort(() => Math.random() - 0.5);
}

/** One scenic world per post (Keenan: snow, rolling ocean, autumn trees...). */
export const LIST_WORLDS = [
  "SNOW: quiet snowy landscapes, snow-heavy pines, a frozen lake, falling snow, soft winter light",
  "OCEAN: a rugged coastline, rolling waves, sea spray on rocks, a long empty beach, golden light on the water",
  "AUTUMN: autumn woods, red and gold leaves, a leaf-covered path, a stream under maples, low warm sun through branches",
  "MOUNTAIN LAKE: misty mountains, a still alpine lake, drifting clouds, pine slopes, early morning mist",
  "SPRING MEADOW: wildflower meadows, a soft breeze in tall grass, blossoming trees, light spring rain, a winding country road",
  "DESERT DAWN: desert dunes at sunrise, long shadows, wind-blown sand, a canyon glowing orange, a wide clear sky",
] as const;

/**
 * Clip motion at REAL speed (2026-10-15, per Keenan: "every post in the '6
 * questions to ask yourself' looks crazy sped up"). Our render plays Kling's
 * clips untouched; the speed-up came from the prompts: "clouds moving fast",
 * fog lifting, sun breaking through, shadows sweeping. Over 5 seconds Kling
 * can only show those as a timelapse. Motion must be something that visibly
 * moves in 5 real seconds.
 */
const REAL_TIME_MOTION = `Each slide's "motion" is the one small natural movement a real camera would catch in five ordinary seconds, filmed in real time: waves rolling in, snow falling, leaves drifting down, grass and branches swaying, rain dimpling water, a stream flowing, steam rising from a mug, a curtain moving in a breeze. NEVER anything that takes minutes or hours in real life: no clouds racing or rolling, no fog lifting or burning off, no sun rising, setting or breaking through, no shadows moving or sweeping, no light changing, no flowers opening, and never the words "fast", "quickly", "rushing" or "timelapse". Every slide's motion is different.`;

const SCENIC_PICTURES = `THE PICTURES: every slide is a breathtaking, people-free landscape photo from the ONE scenic world named in the user message, a different view each slide (wide, close, different light, different spot) so the post feels like one calm place. NO people, NO faces, NO hands, NO animals in focus, NO buildings as the subject, NO text. Each "scene" is under 30 words, concrete nouns only, and leaves calm open sky, water or snow in the upper half for the text. ${REAL_TIME_MOTION}`;

/**
 * Avatar format (2026-10-15, per Keenan: "replace [the story post] with a
 * lists post with the same picture format"): the cover is our avatar walking
 * away through a scenic place (the code adds her; "coverScene" names only
 * the place); item slides mix scenic places with quiet everyday/home shots.
 */
const AVATAR_PICTURES = `THE PICTURES: the COVER shows our recurring woman walking away from the camera through a beautiful outdoor place from the scenic world named in the user message. Write "coverScene" as the place only (the path, the view, the light), under 30 words; the code adds her. Each ITEM slide is a real, people-free photo, and the slides MIX two kinds: scenic outdoor views from that same world, and quiet everyday moments from her real life (a kitchen counter with a coffee mug in morning light, a car parked at school pickup, a calendar on the fridge, a porch chair with a folded blanket, a laundry basket by a sunny window). Where an item names a real thing (a calendar, the car, the kitchen), its picture shows that thing; otherwise a scenic view. At least two scenic and at least two everyday slides. Give every item a "place" field: "scenic" or "everyday". NO people, NO faces, NO hands, NO animals in focus, NO text, letters, readable screens or logos. Each "scene" is under 30 words, concrete nouns only, with calm open space in the upper half for the text. ${REAL_TIME_MOTION}`;

export type ListFormat = "scenic" | "avatar";

const systemFor = (format: ListFormat) => SYSTEM.replace("__PICTURES__", format === "avatar" ? AVATAR_PICTURES : SCENIC_PICTURES);

/**
 * Last line of defense for the motion line: anything that only happens over
 * minutes (or says "fast") becomes a safe real-time movement.
 */
export function realTimeMotion(motion: string, fallback = "a light breeze moves the leaves and grass"): string {
  const m = motion.trim();
  if (!m) return fallback;
  return /(fast|quick(ly)?|rapid(ly)?|rush(es|ing)?|rac(e|es|ing)|timelapse|time-lapse|sweep(s|ing)?|clouds?|shadows?|sun ?(rise|set|rises|sets|rays?|breaks?|light shifts)|fog (lifts|thins|burns|clears)|mist (lifts|thins|burns|clears)|light (shifts|changes|moves|spreads|grows)|blooms?|opens? up|dawn breaks|darkens|brightens)/i.test(m)
    ? fallback
    : m;
}

const SYSTEM = `${copyObjectives("ripple")}

THIS LANE: a "top N" list post that is genuinely useful. The reader saves it because every item is something real she can do or recognize this week, said plainly. Speak to her directly ("you") in the brand voice: plain, honest, specific, a little dry, never a coach, never preachy, never a lecture. Use her own words for her life ("the list in my head", "running everyone's week", "nobody notices until it isn't done") over wellness vocabulary.

THE POST:
READABLE IN 5 SECONDS (2026-10-13, per Keenan: "it needs to be easily readable in 5 seconds ... extremely legible and simple to read"): every slide is one short header and one short subtext, nothing more.
- "title" (the cover): the list's title in lowercase-leaning text, under 55 characters, with the number written as a digit ("5 ways to..."). It names a pain or wish women ~40-50 feel every single day, in plain words a stranger understands on its own. Never names Ripple or any app.
- "items": 4 to 8 items, in a deliberate order. Each "line" is a short, plain instruction or sign, 3 to 7 words, that makes sense on its own (no fragments that need the detail to make sense). Each "detail" is ONE short line under 60 characters (about 10 words) that makes it concrete: what to actually do, what it looks like in her real life, or why it works. Specific beats wise: "write the three things only you can do, then let the rest wait" beats "prioritize".
- Items are genuinely different from each other: no two saying the same thing in other words.
- No numbers inside "line" (the slide adds "1.", "2." itself).

__PICTURES__

THE CAPTION: "captionQuestion" is one question under 15 words, lowercase-leaning, that she genuinely wants to answer about her own version of this list (concrete, answerable in one honest sentence). No app name, no share or save ask.

LIMITS: ${CLAIMS_RULE} ${TIME_OF_DAY_RULE} Never a recording duration. Never promise health or mental-health outcomes, never diagnose ("you have anxiety"), no therapy talk. No emojis, no hashtags, no em dashes. US English.

Return only the JSON object:
{
  "title": "...",
  "coverScene": "...",
  "coverMotion": "...",
  "items": [{ "line": "...", "detail": "...", "scene": "...", "motion": "..." }],
  "captionQuestion": "..."
}`;

function rippleBlock(): string {
  return `\n\nTHIS POST INCLUDES RIPPLE: exactly ONE item (not the first) is something Ripple genuinely helps with, worded as a useful tip in her life, and its "detail" names it plainly as an app ("an app called ripple" or "the ripple app"). What Ripple is: ${PRODUCT_ONE_LINER} It may only do these things:\n${PRODUCT_WHAT_IT_DOES.map((x) => `- ${x}`).join("\n")}\nOne plain mention, no pitch, no price, no "download". The title never names it.`;
}

async function draftOnce(opts: {
  shape: string;
  area: string;
  kind: "exploit" | "explore";
  world: string;
  format: ListFormat;
  mentionsRipple: boolean;
  recent: string[];
  brief: string;
  model: string;
  sameDay: string;
}): Promise<RippleListTopic> {
  const { prisma } = await import("@/lib/prisma");
  const start = Date.now();
  const user = [
    `THIS POST'S TITLE SHAPE: ${opts.shape}`,
    // Exploit vs explore (2026-10-13, per Keenan: "split each of the drafts
    // into the 2 exploit vs explore ... the real results will steer the
    // variety"). Both follow the brief's HOW lessons; exploit drafts also
    // build on a theme that has won, explore drafts take a new life area.
    opts.kind === "exploit"
      ? `THIS DRAFT BUILDS ON WHAT HAS WON: base it on this theme from our results: ${opts.area.replace(/^theme:\s*/, "")}. Come at it from a fresh angle and a specific situation none of the recent titles below used; never reword a recent title.`
      : `THIS POST'S LIFE AREA (other drafts take other areas, so stay in this one): ${opts.area}\nVARIETY: the title must NOT be about "the list in your head", "mental load" or "carrying everything" in general (every recent post went there). Name a specific situation inside this life area instead, and make it clearly different from every recent title below.`,
    opts.format === "avatar"
      ? `THIS POST'S SCENIC WORLD (the cover place and the scenic slides): ${opts.world}`
      : `THIS POST'S SCENIC WORLD (every slide): ${opts.world}`,
    opts.mentionsRipple ? rippleBlock() : "\n\nTHIS POST DOES NOT MENTION RIPPLE OR ANY APP: pure, useful advice.",
    opts.brief ? `\n\n${opts.brief}` : "",
    opts.sameDay,
    opts.recent.length ? `\n\nRECENT TITLES (don't repeat or lightly reword these):\n${opts.recent.map((t) => `- ${t}`).join("\n")}` : "",
    "\n\nReturn ONLY valid JSON.",
  ].join("\n");
  const res = await contentAnthropic.messages.create({
    model: opts.model,
    max_tokens: 2500,
    system: `${systemFor(opts.format)}\n\n${HUMAN_VOICE_RULES}`,
    messages: [{ role: "user", content: user }],
  });
  void prisma.claudeCallLog
    .create({
      data: {
        purpose: "ripple-list-draft",
        model: opts.model,
        tokensIn: res.usage.input_tokens,
        tokensOut: res.usage.output_tokens,
        // Opus 5.5: $4 / $20 per MTok.
        costCents: Math.ceil((res.usage.input_tokens * 4 + res.usage.output_tokens * 20) / 10_000),
        durationMs: Date.now() - start,
        success: true,
      },
    })
    .catch(() => {});
  const p = JSON.parse(lastJsonText(messageText(res))) as {
    title?: string;
    coverScene?: string;
    coverMotion?: string;
    items?: Partial<ListItem>[];
    captionQuestion?: string;
  };
  const clean = (s: unknown) => (typeof s === "string" ? stripDashes(s).trim() : "");
  const items = (p.items ?? [])
    .map((it) => ({
      line: clean(it.line).replace(/^\d+[.)]\s*/, ""),
      detail: clean(it.detail),
      scene: clean(it.scene) || "a wide, calm landscape in soft natural light, no people",
      motion: realTimeMotion(clean(it.motion)),
      ...(opts.format === "avatar" ? { place: it.place === "everyday" ? ("everyday" as const) : ("scenic" as const) } : {}),
    }))
    .filter((it) => it.line)
    .slice(0, 8);
  // The number in the title always matches the slides (2026-10-13: a sample
  // said "6 things" over 7 items).
  const title = clean(p.title).replace(/^\s*(top\s+)?\d+/i, (m, top) => `${top ?? ""}${items.length}`);
  if (!title || items.length < 4) throw new Error(`list draft unusable (${items.length} items)`);
  return {
    slug: title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60),
    title,
    shape: opts.shape.split(":")[0],
    area: opts.area,
    draftKind: opts.kind,
    world: opts.world.split(":")[0],
    format: opts.format,
    mentionsRipple: opts.mentionsRipple,
    coverScene: clean(p.coverScene) || items[0].scene,
    coverMotion: realTimeMotion(clean(p.coverMotion), items[0].motion),
    items,
    captionQuestion: clean(p.captionQuestion),
  };
}

/** Fix only the line(s) the editor flagged (2026-10-14); null if it can't. */
async function repairListLine(t: RippleListTopic, problem: string): Promise<RippleListTopic | null> {
  const { CANDIDATE_WRITER_MODEL } = await import("./candidate-pipeline");
  const res = await contentAnthropic.messages.create({
    model: CANDIDATE_WRITER_MODEL,
    max_tokens: 1500,
    effort: "medium",
    system: `${systemFor(t.format)}\n\n${HUMAN_VOICE_RULES}`,
    messages: [
      {
        role: "user",
        content: `An editor flagged this finished list post: ${problem}\n\nFix ONLY the line(s) that problem names (name the person instead of a bare he/she, make a detail match its line, replace a repeated item with a genuinely different one, or swap an example that another post today already used for a different one). Keep the title, every other item, scenes, motions and caption exactly as they are, and keep every line within its length limits. Return the full post as JSON in the same shape.\n\n${JSON.stringify({ title: t.title, items: t.items, captionQuestion: t.captionQuestion })}`,
      },
    ],
  });
  const j = JSON.parse(lastJsonText(messageText(res))) as { items?: Partial<ListItem>[]; captionQuestion?: string };
  const items = (j.items ?? []).filter((it) => it?.line && it?.detail);
  if (items.length !== t.items.length) return null;
  return {
    ...t,
    items: items.map((it, i) => ({
      line: stripDashes(String(it.line)).replace(/^\d+[.)]\s*/, "").trim(),
      detail: stripDashes(String(it.detail)).trim(),
      scene: t.items[i].scene,
      motion: t.items[i].motion,
      ...(t.items[i].place ? { place: t.items[i].place } : {}),
    })),
    captionQuestion: typeof j.captionQuestion === "string" && j.captionQuestion.trim() ? j.captionQuestion.trim() : t.captionQuestion,
  };
}

/** Opus plain-sense editor for list posts. Fails closed. */
async function listSenseProblem(t: RippleListTopic): Promise<string | null> {
  try {
    const res = await Promise.race([
      contentAnthropic.messages.create({
        model: VISION_MODEL,
        max_tokens: 400,
        effort: "medium",
        system: `You are a blunt, strict copy editor. The reader is a tired 45-year-old woman scrolling Instagram fast. Decide whether this list post makes plain sense and is genuinely useful on ONE read. When in doubt, fail it.

FAIL if ANY of these is true:
- The title, read ALONE, doesn't say one clear thing she instantly understands.
- An item's line doesn't make sense on its own, or is vague advice anyone could write ("practice self-care", "be kind to yourself") instead of something specific she can do or recognize.
- Two items say the same thing.
- A detail line is garbled, contradicts its line, or uses a he/she/they with no clear person.
- Anything claims to treat, diagnose or cure, or talks about her mental health as a condition.
- It mentions Ripple more than once, or in a way that doesn't make clear it's an app, or reads like an ad.

Return only JSON: {"ok": true} or {"ok": false, "problem": "which line fails and why, one sentence"}`,
        messages: [
          {
            role: "user",
            content: `TITLE: ${t.title}\n${t.items.map((it, i) => `${i + 1}. ${it.line}\n   (${it.detail})`).join("\n")}`,
          },
        ],
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("sense check timed out after 60s")), 60_000)),
    ]);
    const parsed = JSON.parse(lastJsonText(messageText(res))) as { ok?: boolean; problem?: string };
    console.log(`[list-sense] "${t.title}": ${parsed.ok ? "ok" : `FAIL ${parsed.problem}`}`);
    return parsed.ok === false ? (parsed.problem ?? "a line doesn't make plain sense") : null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[list-sense] check errored — cutting this candidate: ${msg}`);
    return `sense check unavailable (${msg.slice(0, 80)})`;
  }
}

/**
 * Write the day's list post: 5 Opus drafts (each a different title shape,
 * all in one scenic world), cut, rank. `forceRipple` / `forceWorld` for
 * samples; otherwise ~1 in 3 posts mention Ripple.
 */
export async function generateRippleListTopic(opts: {
  recentTitles: string[];
  /** Scenic worlds of the last list posts (e.g. ["OCEAN", "AUTUMN"]). */
  recentWorlds?: string[];
  /** The last list post's area (cooldown: no area wins twice in a row). */
  lastArea?: string;
  forceRipple?: boolean;
  forceWorld?: string;
  /** Picture format (default scenic). */
  format?: ListFormat;
  /** The day's earlier Ripple posts (same-day.ts): no reused examples. */
  sameDay?: import("./same-day").SameDayPost[];
}): Promise<RippleListTopic> {
  const { CANDIDATE_COUNT, CANDIDATE_WRITER_MODEL, rankCandidates } = await import("./candidate-pipeline");
  const { readBriefBlock } = await import("./weekly-brief");
  const { isRecentHeadline, nearDuplicateOf, noteHeadlineUsed } = await import("./headline-history");
  const brief = await readBriefBlock("ripple");
  const { sameDayPromptBlock, sameDayRepeat } = await import("./same-day");
  const sameDay = opts.sameDay ?? [];
  const mentionsRipple = opts.forceRipple ?? Math.random() < 0.35;
  // No scenic world from the last two list posts (variety, 2026-10-13).
  const recentWorlds = (opts.recentWorlds ?? []).map((w) => w.toLowerCase());
  const freshWorlds = LIST_WORLDS.filter((w) => !recentWorlds.some((r) => w.toLowerCase().startsWith(r)));
  const worldPool = freshWorlds.length ? freshWorlds : [...LIST_WORLDS];
  const world =
    (opts.forceWorld && LIST_WORLDS.find((w) => w.toLowerCase().startsWith(opts.forceWorld!.toLowerCase()))) ||
    worldPool[Math.floor(Math.random() * worldPool.length)];
  const shapes = draftShapes();
  // 2 exploit drafts on the brief's winning themes + 3 explore drafts on life
  // areas chosen by real results (Thompson + ~25% untested), never the last
  // post's area. No themes yet → all five explore.
  const { readWinningThemes, readAreaStats } = await import("./weekly-brief");
  const { chooseArm } = await import("./performance-loop");
  const [themes, areaStats] = await Promise.all([readWinningThemes("ripple"), readAreaStats("ripple")]);
  const exploitAreas = themes
    .map((t) => `theme: ${t}`)
    .filter((a) => a !== opts.lastArea)
    .slice(0, 2);
  const exploreCount = CANDIDATE_COUNT - exploitAreas.length;
  const pool: string[] = LIST_AREAS.filter((a) => a !== opts.lastArea);
  const exploreAreas: string[] = [];
  while (exploreAreas.length < exploreCount && pool.length) {
    const { arm } = chooseArm(pool, areaStats);
    exploreAreas.push(arm);
    pool.splice(pool.indexOf(arm), 1);
  }
  const plan: { area: string; kind: "exploit" | "explore" }[] = [
    ...exploitAreas.map((area) => ({ area, kind: "exploit" as const })),
    ...exploreAreas.map((area) => ({ area, kind: "explore" as const })),
  ];
  const within = <T,>(p: Promise<T>, ms: number) =>
    Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`draft timed out after ${ms}ms`)), ms))]);
  const settled = await Promise.allSettled(
    Array.from({ length: CANDIDATE_COUNT }, (_, i) =>
      within(
        draftOnce({ shape: shapes[i % shapes.length], area: plan[i % plan.length].area, kind: plan[i % plan.length].kind, world, format: opts.format ?? "scenic", mentionsRipple, recent: opts.recentTitles.slice(0, 60), brief, model: CANDIDATE_WRITER_MODEL, sameDay: sameDayPromptBlock(sameDay) }),
        150_000
      )
    )
  );
  const drafts = settled.filter((r): r is PromiseFulfilledResult<RippleListTopic> => r.status === "fulfilled").map((r) => r.value);
  if (drafts.length === 0) {
    const why = settled.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    throw new Error(`[ripple-list] every draft failed: ${why?.reason instanceof Error ? why.reason.message : why?.reason}`);
  }
  const ranked = await rankCandidates({
    brand: "ripple",
    label: "ripple-list",
    candidates: drafts,
    render: (t) => `TITLE: ${t.title}\n${t.items.map((it, i) => `${i + 1}. ${it.line} (${it.detail})`).join("\n")}`,
    reject: async (t) => {
      if (/\bripple\b/i.test(t.title)) return "title names Ripple";
      // Readable in 5 seconds (2026-10-13, per Keenan).
      if (t.title.length > 65) return `title too long to read in 4 seconds (${t.title.length} chars)`;
      const wc = (x: string) => x.split(/\s+/).filter(Boolean).length;
      const longLine = t.items.find((it) => wc(it.line) > 9);
      if (longLine) return `item too long to read in 5 seconds: "${longLine.line}"`;
      const longDetail = t.items.find((it) => it.detail.length > 75);
      if (longDetail) return `detail too long to read in 5 seconds: "${longDetail.detail}"`;
      if (opts.lastArea && t.area === opts.lastArea) return "same area as the last list post";
      const ripples = t.items.filter((it) => /\bripple\b/i.test(`${it.line} ${it.detail}`)).length;
      if (t.mentionsRipple && ripples !== 1) return `should mention Ripple exactly once (found ${ripples})`;
      if (!t.mentionsRipple && ripples > 0) return "mentions Ripple in a brand-free post";
      if (await isRecentHeadline(t.title)) return "title repeats a recent post";
      const near = await nearDuplicateOf(t.title);
      return near ? `too close to recent title "${near}"` : null;
    },
    // A phrase reused from today's other Ripple posts goes to repair like a
    // sense failure (2026-10-16), then the full sense check runs on the fix.
    senseCheck: async (t) => {
      const rep = sameDayRepeat(`${t.title}\n${t.items.map((it) => `${it.line}\n${it.detail}`).join("\n")}`, sameDay);
      if (rep) return `a line reuses "${rep}" from another post going out today; replace that example with a different situation`;
      return listSenseProblem(t);
    },
    repair: repairListLine,
  });
  const candidateLog = `${drafts.length} drafted; ${ranked ? `${ranked.survivors} survived, ranked by ${ranked.rankedBy}` : "none survived"}`;
  if (!ranked) return { ...drafts[0], held: "no candidate passed the plain-sense check", jev: null, rankedBy: "none", candidateLog };
  noteHeadlineUsed(ranked.winner.title);
  return { ...ranked.winner, jev: ranked.jev, rankedBy: ranked.rankedBy, candidateLog };
}

/** Image prompt for one people-free everyday/home slide (avatar format). */
export function buildEverydayScenePrompt(scene: string): string {
  return [
    `A real, beautiful photograph: ${scene}.`,
    "Shot like a calm lifestyle photo someone saves: soft natural light, true color, crisp detail, real depth, a lived-in real home or everyday place. It must look like a genuine photograph, never a render or painting.",
    "Leave calm open space (wall, sky, window light or a plain surface) in the upper half of the frame for text.",
    "ABSOLUTELY NO people, faces, hands, silhouettes, animals in focus, text, letters, readable screens, signs or logos.",
    "9:16 vertical portrait.",
  ].join("\n");
}

/** Image prompt for one people-free scenic slide. */
export function buildListScenePrompt(scene: string, world: string): string {
  return [
    `A breathtaking, real landscape photograph: ${scene}.`,
    `Setting: ${world}.`,
    "Shot like a beautiful nature photo someone saves: natural light, rich true color, crisp detail in rock, water, snow, leaves and grass, real depth. It must look like a genuine photograph, never a render or painting.",
    "Leave calm open space (sky, water, snow or mist) in the upper half of the frame for text.",
    "ABSOLUTELY NO people, faces, hands, silhouettes, animals in focus, vehicles, buildings as the subject, text, letters, signs or logos.",
    "9:16 vertical portrait.",
  ].join("\n");
}
