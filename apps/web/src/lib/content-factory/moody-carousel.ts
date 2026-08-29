/**
 * Content Factory — MOODY discipline carousel (2026-08-28, per Keenan).
 *
 * Cloned from a reference format that performs ("TRUST THE PROCESS"
 * style): a ~6-slide photo carousel of dark, moody, hyper-realistic
 * architecture/interior photography with clean white text centered
 * mid-frame. Cover = short commanding title; each item slide = a
 * numbered name ("4. Reset day.") + 2-3 short punchy paragraphs ending
 * on a command ("Bring order back.").
 *
 * TWO FUNNELS, same skeleton, different soul (both audience-growth
 * only — NO product CTA anywhere):
 * - "women": Keenan's core demographic (women ~40-50, mental load) —
 *   quiet-discipline/reset content in the existing brand voice, softer
 *   warm-but-dim visuals.
 * - "men": young aspiring men — discipline / trust-the-process /
 *   self-improvement command energy, stark dark visuals like the
 *   reference.
 *
 * Captions clone the reference: pure discovery hashtags, NO question
 * (per Keenan 2026-08-28 — deliberate exception to the question+tags
 * caption rule, which still governs every other lane).
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();
const CLAUDE_MODEL = "claude-sonnet-4-6";
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

export type MoodyAudience = "women" | "men";

export interface MoodyItem {
  /** Short item name, e.g. "Reset day." */
  name: string;
  /** 2-3 short paragraphs; the last is a punchy one-line command. */
  lines: string[];
  /** Scene for this slide's background image. */
  scene: string;
}

export interface MoodyTopic {
  slug: string;
  /** Cover title — short, commanding ("TRUST THE PROCESS" energy). */
  title: string;
  coverScene: string;
  items: MoodyItem[];
}

export const AUDIENCE_BRIEF: Record<MoodyAudience, string> = {
  men: `AUDIENCE: young aspiring men (18-30) deep in the self-improvement / discipline / "trust the process" niche. They save posts that read like orders from a future self: monk mode, order, focus, momentum, delayed gratification, becoming undeniable.
VOICE: calm command energy. Short declarative sentences. No softness, no hedging, no "maybe try". Direct second person. The tone of a mentor who's already made it and doesn't waste words. Never bro-slang, never yelling, never toxic — controlled, austere, certain.
TOPICS to rotate: discipline systems, monk mode, dopamine control, morning/evening order, cutting noise, training, focus blocks, silence, patience, becoming hard to distract.`,
  women: `AUDIENCE: women roughly 40-50 carrying a heavy mental load — always holding it together for everyone else. They save posts that feel like quiet permission to reclaim order and protect their peace.
VOICE: quiet strength. Short declarative sentences with warmth underneath — a woman who has stopped explaining herself. Direct second person. Never preachy, never girlboss, never clinical. Discipline framed as self-respect: boundaries, resets, saying no, protecting energy, doing less on purpose.
TOPICS to rotate: protecting your peace, reset rituals, boundaries without guilt, quiet mornings, dropping what drains you, unhurried order, saying no, letting the phone go dark.`,
};

export const SCENE_BRIEF: Record<MoodyAudience, string> = {
  men: `SCENES: dark minimalist luxury architecture and interiors — floor-to-ceiling glass walls with rain or dark forest beyond, polished concrete, black furniture, empty gyms at night, stone stairways, dim libraries. Desaturated, near-monochrome, overcast or night light. Every scene DIM and shadowed (white text must read on it). No people ever.`,
  women: `SCENES: the same moody cinematic photography but softer and warmer — dim quiet-luxury interiors in low warm light: rain on tall windows with linen curtains, a dark kitchen lit by one small lamp, a deep armchair by a dusk window, a bath in half-light, a shadowed hallway with warm evening glow. Muted, subdued, DIM (white text must read on it) — moody but gentle, never bright or airy. No people ever.`,
};

const buildMoodySystemPrompt = (
  audience: MoodyAudience
) => `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 item slides of white text centered on cinematic photography.

${AUDIENCE_BRIEF[audience]}

${SCENE_BRIEF[audience]}

FORMAT — study this real slide and match its rhythm exactly:
"4. Reset day.

Clean your space, organize your room, car, digital files, notes.

Chaos outside = chaos inside.

Bring order back."

RULES:
- "title": the cover text. 2-4 words, commanding, works in ALL CAPS ("TRUST THE PROCESS", "PROTECT YOUR PEACE"). No number, no punctuation except a period if natural.
- Exactly 5 items. Each item:
  - "name": 1-3 words + period ("Reset day.", "Go quiet.").
  - "lines": 2-3 short paragraphs. First expands the item concretely in one sentence (can use lists: "room, car, digital files, notes"). Optional middle line: a compressed truth, equations welcome ("Chaos outside = chaos inside."). Last line: a 2-5 word command ("Bring order back.").
- Every sentence short. No commas chained past two. No metaphors that need decoding. Read it out loud — it should sound inevitable, not written.
- US English. No emojis, no hashtags, no quotes, no advice-verbs like "try to" or "consider". Never mention any app, product, journaling, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph (place, light, weather, materials) following SCENES above. Every scene in the post is a DIFFERENT location — vary boldly.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "name": "...", "lines": ["...", "...", "..."], "scene": "..." }
  ]
}`;

/**
 * Shared generation core for every moody-family carousel (discipline,
 * memento, questions): one Claude call, ClaudeCallLog bookkeeping, JSON
 * parse + validation, slug. `requireName` is off for formats whose
 * slides carry no "N. Name." header (memento/questions); `minLines`
 * allows single-line slides (questions).
 */
async function generateMoodyFamilyTopic(opts: {
  purpose: string;
  system: string;
  user: string;
  slugPrefix: string;
  requireName: boolean;
  minLines: number;
}): Promise<MoodyTopic> {
  const { prisma } = await import("@/lib/prisma");
  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1200,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });

    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    await prisma.claudeCallLog.create({
      data: {
        purpose: opts.purpose,
        model: CLAUDE_MODEL,
        tokensIn,
        tokensOut,
        costCents: Math.ceil(
          (tokensIn * INPUT_COST_PER_TOKEN + tokensOut * OUTPUT_COST_PER_TOKEN) * 100
        ),
        durationMs: Date.now() - start,
        success: true,
      },
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr) as {
      title?: string;
      coverScene?: string;
      items?: { name?: string; lines?: string[]; scene?: string }[];
    };

    const title = (parsed.title ?? "").trim();
    const items = (parsed.items ?? [])
      .filter(
        (it) =>
          (!opts.requireName || typeof it.name === "string") &&
          Array.isArray(it.lines) &&
          it.lines.length >= opts.minLines &&
          typeof it.scene === "string"
      )
      .map((it) => ({
        name: (it.name ?? "").trim(),
        lines: it.lines!.map((l) => l.trim()).filter(Boolean),
        scene: it.scene!.trim(),
      }));
    if (!title || items.length < 4) {
      throw new Error(
        `${opts.purpose} unusable: title="${title}", ${items.length} valid items`
      );
    }

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);

    return {
      slug: `${opts.slugPrefix}-${slug}`,
      title,
      coverScene: (parsed.coverScene ?? "").trim() || items[0].scene,
      items: items.slice(0, 6),
    };
  } catch (err) {
    await prisma.claudeCallLog.create({
      data: {
        purpose: opts.purpose,
        model: CLAUDE_MODEL,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        durationMs: Date.now() - start,
        success: false,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      },
    });
    throw err;
  }
}

function avoidBlock(recentHeadlines: string[]): string {
  return recentHeadlines.length > 0
    ? `\n\nDo NOT repeat or closely resemble any of these recent titles:\n${recentHeadlines.map((h) => `- ${h}`).join("\n")}`
    : "";
}

/** Generate one moody-carousel topic for the given audience funnel. */
export async function generateMoodyTopic(
  audience: MoodyAudience,
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  return generateMoodyFamilyTopic({
    purpose: `moody-carousel-topic-${audience}`,
    system: buildMoodySystemPrompt(audience),
    user: `Write one new post for the ${audience === "men" ? "young aspiring men" : "women 40-50"} funnel.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: `moody-${audience}`,
    requireName: true,
    minLines: 2,
  });
}

/** Image prompt for one moody slide — dark cinematic, text-free, no people. */
export function buildMoodyImagePrompt(
  audience: MoodyAudience | "universal",
  scene: string
): string {
  const style =
    audience === "men"
      ? "Dark, moody, minimalist luxury architecture photography. Desaturated, near-monochrome color grade — charcoal, slate, black, cold glass. Overcast or night light, deep shadows, austere and powerful."
      : audience === "universal"
        ? "Dark, moody, cinematic photography. Muted, desaturated color grade with deep shadow — dusk, night, or heavy overcast light. Vast, still, contemplative — the weight of time made visible."
        : "Dark, moody, quiet-luxury interior photography with soft warmth. Muted, subdued color grade — deep shadow with one source of low warm light. Calm, intimate, cinematic, dim.";
  return [
    `Hyper-realistic cinematic photograph: ${scene}`,
    style,
    "The entire frame is DIM and shadowed — dark enough that clean white text placed at the center of the image would be perfectly legible.",
    "Shot on a full-frame camera, editorial architecture-magazine quality, true-to-life materials and light. Indistinguishable from a real photograph.",
    "Vertical 9:16 composition, calm and uncluttered in the middle of the frame.",
    "NO people, NO animals, NO screens with content.",
    "Absolutely NO text, letters, words, numbers, logos, or watermarks anywhere in the image.",
  ].join("\n");
}

// ─── Captions: pure discovery hashtags, cloned from the reference ─────
// (2026-08-28, per Keenan — no question on these two funnels.)
const MEN_CORE_TAGS = ["#fyp", "#motivation", "#mindset", "#mentality"];
const MEN_ROTATING_TAGS = [
  "#discipline",
  "#selfimprovement",
  "#trusttheprocess",
  "#growth",
  "#success",
  "#focus",
];
const WOMEN_CORE_TAGS = ["#fyp", "#selfcare", "#mentalhealth", "#mindfulness"];
const WOMEN_ROTATING_TAGS = [
  "#innerpeace",
  "#protectyourpeace",
  "#healing",
  "#selflove",
  "#boundaries",
  "#peacefullife",
];

/** Hashtag-only caption: 4 core tags + 2 rotating (slug-deterministic). */
export function buildMoodyCaption(audience: MoodyAudience, slug: string): string {
  const core = audience === "men" ? MEN_CORE_TAGS : WOMEN_CORE_TAGS;
  const rotating = audience === "men" ? MEN_ROTATING_TAGS : WOMEN_ROTATING_TAGS;
  let hash = 0;
  for (const c of slug) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  const h = Math.abs(hash);
  const extra = [
    rotating[h % rotating.length],
    rotating[(h + 3) % rotating.length],
  ];
  return [...core, ...new Set(extra)].join(" ");
}

// ─── MEMENTO MORI carousel (2026-08-28 PM, per Keenan) ────────────────
// One universal lane: a cover + 5 slides of sobering time-math ("You'll
// see your parents about 15 more times."), each landing on a short
// command. Same moody skeleton (dark photography, white centered text,
// hashtag-only caption) but NO "N. Name." number headers — the numbers
// ARE the content.

const MEMENTO_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 slides of white text centered on cinematic photography. The niche: MEMENTO MORI TIME-MATH — sobering, concrete numbers about how finite life is, each slide ending on a short command to act on it.

AUDIENCE: everyone scrolling at midnight. The numbers must hit universally — parents, weekends, summers, healthy years, hours on a phone. No gendered content, no niche jargon.

SCENES: dark cinematic photography, vast and contemplative — an empty beach at last light, a night sky over a black ridgeline, a long empty road at dusk, a single lit window in a dark house, an empty chair by a cold window, autumn leaves on wet pavement. Every frame DIM (white text must read on it). No people ever.

FORMAT — each slide reads like this (match the rhythm):
"You'll see your parents about 15 more times.

One visit a year. Do the math.

Call them tonight."

RULES:
- "title": the cover text. 2-5 words, commanding, works in ALL CAPS ("YOU'RE ON THE CLOCK", "DO THE MATH"). No number in the title.
- Exactly 5 items. Each item's "lines": 2-3 short paragraphs.
  - First line: ONE concrete, honest number about finite time ("~1,200 Saturdays left before you're 60.", "About 30 more summers."). Plausible arithmetic only — never invented statistics, never fake precision, hedge with "about" or "~".
  - Optional middle line: the one-sentence math or truth behind it.
  - Last line: a 2-5 word command ("Call them tonight.", "Stop wasting them.").
- Vary the subject across the 5 slides: parents, weekends/summers, healthy years, time with your kids or friends, hours lost to the phone. Never two slides on the same subject.
- Every sentence short. No metaphors that need decoding. It should feel like cold arithmetic, not poetry.
- US English. No emojis, no hashtags, no quotes, no advice-verbs like "try to". Never mention any app, product, journaling, or AI. Never mention death by name on the cover.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph (place, light, weather) per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "lines": ["...", "...", "..."], "scene": "..." }
  ]
}`;

/** Generate one memento mori topic (universal audience). */
export async function generateMementoTopic(
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  return generateMoodyFamilyTopic({
    purpose: "memento-carousel-topic",
    system: MEMENTO_SYSTEM_PROMPT,
    user: `Write one new memento mori time-math post.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "memento",
    requireName: false,
    minLines: 2,
  });
}

const MEMENTO_CORE_TAGS = ["#fyp", "#mindset", "#deepthoughts", "#perspective"];
const MEMENTO_ROTATING_TAGS = [
  "#mementomori",
  "#lifeisshort",
  "#timeflies",
  "#presence",
  "#intentionalliving",
  "#wakeupcall",
];

/** Hashtag-only caption for the memento lane (universal pool). */
export function buildMementoCaption(slug: string): string {
  let hash = 0;
  for (const c of slug) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  const h = Math.abs(hash);
  const extra = [
    MEMENTO_ROTATING_TAGS[h % MEMENTO_ROTATING_TAGS.length],
    MEMENTO_ROTATING_TAGS[(h + 3) % MEMENTO_ROTATING_TAGS.length],
  ];
  return [...MEMENTO_CORE_TAGS, ...new Set(extra)].join(" ");
}

// ─── HARD QUESTIONS carousel (2026-08-28 PM, per Keenan) ──────────────
// Women's funnel: cover ("ANSWER HONESTLY" energy) + 5 slides, ONE
// question each, no answers anywhere. The reader supplies the answer —
// that's the save/share mechanic. Women's soft-dim visuals, hashtag-only
// caption from the women's pool.

const QUESTIONS_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 slides of white text centered on cinematic photography. The niche: HARD QUESTIONS — each slide is ONE question the reader can't answer comfortably. No answers, no advice, anywhere. The question does all the work.

AUDIENCE: women roughly 40-50 carrying a heavy mental load — always holding it together for everyone else. The questions should press gently on what they already know but avoid saying out loud: lost pieces of themselves, one-sided giving, deferred wants, who they're becoming.
VOICE: quiet, direct, unsparing but never cruel. Second person. A question a wise friend would ask and then just wait.

${SCENE_BRIEF["women"]}

RULES:
- "title": the cover text. 2-4 words, commanding, works in ALL CAPS ("ANSWER HONESTLY", "READ THESE SLOWLY"). Not itself a question.
- Exactly 5 items. Each item's "lines": exactly ONE line — the question. 8-20 words, ends with "?". Plain words, no metaphors that need decoding, no "why don't you" advice-in-disguise.
- Each question hits a DIFFERENT nerve: identity, resentment, time, what she's postponing, what she'd never admit. Never two questions on the same nerve.
- The questions must be answerable only by the reader — never rhetorical, never yes-obvious.
- US English. No emojis, no hashtags, no quotes. Never mention any app, product, journaling, therapy, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "lines": ["...?"], "scene": "..." }
  ]
}`;

/** Generate one hard-questions topic (women's funnel). */
export async function generateQuestionsTopic(
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  return generateMoodyFamilyTopic({
    purpose: "questions-carousel-topic",
    system: QUESTIONS_SYSTEM_PROMPT,
    user: `Write one new hard-questions post.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "questions",
    requireName: false,
    minLines: 1,
  });
}

// ─── RULES I BROKE carousel (2026-08-28 late PM, per Keenan) ──────────
// Replaces the negative "video" lane (6 UTC). Women's funnel: an
// inversion of the discipline format — instead of five commands, five
// QUIET REBELLIONS ("1. I stopped answering right away.") each with a
// short justification. Same numbered moody skeleton, first person.

const RULES_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 slides of white text centered on cinematic photography. The niche: RULES I BROKE — five polite, invisible rules the writer quietly stopped following to get her life back. Not advice. A first-person record of small rebellions.

AUDIENCE: women roughly 40-50 carrying a heavy mental load — always holding it together for everyone else. Each broken rule should be one they still obey, and reading it should feel like permission.
VOICE: first person, quiet, settled, unapologetic. A woman who has stopped explaining herself, telling you what she quit doing — not telling you what to do. Never preachy, never girlboss, never bitter.

${SCENE_BRIEF["women"]}

FORMAT — each slide reads like this (match the rhythm):
"1. I stopped answering right away.

A text is not a summons. It waited hours to matter to them.

It can wait an hour for me."

RULES:
- "title": the cover text. 3-7 words, first person, works in ALL CAPS ("RULES I BROKE TO GET MY LIFE BACK", "POLITE RULES I QUIT"). No number.
- Exactly 5 items. Each item:
  - "name": the broken rule as a short first-person past-tense line + period ("I stopped answering right away.", "I let the house be imperfect."). 4-8 words.
  - "lines": 1-2 short paragraphs. First: the quiet reasoning in one or two plain sentences. Optional last line: a short settled closer (2-6 words) — a statement, never a command to the reader.
- Every rebellion is SMALL and concrete — answering instantly, over-explaining, hosting every holiday, being the default parent contact, apologizing for resting. Never dramatic (no quitting jobs, leaving marriages).
- Each of the 5 breaks a DIFFERENT kind of rule: availability, explanation, appearance, obligation, self-denial. Never two on the same kind.
- Every sentence short. US English. No emojis, no hashtags, no quotes, no advice-verbs. Never mention any app, product, journaling, therapy, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "name": "...", "lines": ["...", "..."], "scene": "..." }
  ]
}`;

/** Generate one rules-I-broke topic (women's funnel, replaces negative). */
export async function generateRulesTopic(
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  return generateMoodyFamilyTopic({
    purpose: "rules-carousel-topic",
    system: RULES_SYSTEM_PROMPT,
    user: `Write one new rules-I-broke post.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "rules",
    requireName: true,
    minLines: 1,
  });
}

// ─── MISSED CONNECTIONS carousel (2026-08-28 late PM, per Keenan) ─────
// Replaces the positive lane (8 UTC). Universal: near-miss math about
// the people you almost knew — cousin of memento mori, but the finite
// thing is CONNECTION, not time. Each slide a small ghost story told in
// plausible numbers.

const MISSED_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 slides of white text centered on cinematic photography. The niche: MISSED-CONNECTION MATH — quiet, concrete numbers about the people we walk past, lose touch with, or never quite meet. Each slide is a small ghost story told in plausible arithmetic.

AUDIENCE: everyone scrolling at midnight. The numbers must hit universally — strangers passed, friends drifted, conversations not started, calls not made. No gendered content.

SCENES: dark cinematic photography of in-between public places, empty of people — a rain-streaked bus window at night, an empty train platform under sodium light, a crosswalk at dusk, an airport gate after the last flight, a diner counter at closing, a lit phone booth on a dark street. Every frame DIM (white text must read on it). No people ever.

FORMAT — each slide reads like this (match the rhythm):
"You'll walk past about 80,000 strangers in your life.

One of them would have been your best friend.

You were looking at your phone."

RULES:
- "title": the cover text. 2-5 words, works in ALL CAPS ("THE PEOPLE YOU MISSED", "ALMOST FRIENDS"). No number in the title.
- Exactly 5 items. Each item's "lines": 2-3 short paragraphs.
  - First line: ONE concrete, plausible number about near-missed connection ("You'll walk past about 80,000 strangers.", "The average friendship that fades takes about 2 years to go quiet."). Plausible arithmetic only — never invented precision, hedge with "about" or "~".
  - Middle line: the quiet human truth inside the number.
  - Last line: a short landing — a statement or gentle command (2-6 words: "Look up.", "Text them first.", "You were almost friends.").
- Vary the subject across the 5 slides: strangers passed, friendships gone quiet, family you rarely see, conversations never started, the people one choice removed. Never two slides on the same subject.
- Every sentence short. It should feel like cold arithmetic with an ache inside — never sentimental, never poetry.
- US English. No emojis, no hashtags, no quotes, no advice-verbs like "try to". Never mention any app, product, journaling, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "lines": ["...", "...", "..."], "scene": "..." }
  ]
}`;

/** Generate one missed-connections topic (universal, replaces positive). */
export async function generateMissedTopic(
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  return generateMoodyFamilyTopic({
    purpose: "missed-carousel-topic",
    system: MISSED_SYSTEM_PROMPT,
    user: `Write one new missed-connection math post.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "missed",
    requireName: false,
    minLines: 2,
  });
}

const MISSED_CORE_TAGS = ["#fyp", "#deepthoughts", "#perspective", "#mindset"];
const MISSED_ROTATING_TAGS = [
  "#sonder",
  "#connection",
  "#strangers",
  "#lifelessons",
  "#presence",
  "#almost",
];

/** Hashtag-only caption for the missed-connections lane (universal pool). */
export function buildMissedCaption(slug: string): string {
  let hash = 0;
  for (const c of slug) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  const h = Math.abs(hash);
  const extra = [
    MISSED_ROTATING_TAGS[h % MISSED_ROTATING_TAGS.length],
    MISSED_ROTATING_TAGS[(h + 3) % MISSED_ROTATING_TAGS.length],
  ];
  return [...MISSED_CORE_TAGS, ...new Set(extra)].join(" ");
}

// ─── DELETE THIS AFTER READING carousel (2026-08-28 late PM) ──────────
// Replaces the selfie lane (12 UTC). Women's funnel: a cover styled
// like a warning ("DELETE THIS AFTER READING") + 5 slides, each ONE
// truth you're not supposed to say out loud. Single-line slides render
// in the premium QUOTE serif italic, like the questions lane.

const FORBIDDEN_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 slides of white text centered on cinematic photography. The niche: FORBIDDEN TRUTHS — each slide is ONE line you're not supposed to say out loud. The post is framed like a note the reader shouldn't have seen. No advice, no answers, anywhere.

AUDIENCE: women roughly 40-50 carrying a heavy mental load — always holding it together for everyone else. Each line should name something she has thought and never said: the unspoken ledger of marriage, motherhood, friendship, aging, wanting more.
VOICE: quiet, flat, devastatingly honest. Plain statements. Never cruel, never cynical for its own sake — the sting is recognition, not shock.

${SCENE_BRIEF["women"]}

FORMAT — each slide is ONE line like:
"You don't miss him. You miss being chosen."
"Some of the love you give is just fear with better manners."

RULES:
- "title": the cover text. 3-6 words with warning-label energy, works in ALL CAPS ("DELETE THIS AFTER READING", "DON'T SCREENSHOT THIS", "YOU DIDN'T SEE THIS"). Not a question.
- Exactly 5 items. Each item's "lines": exactly ONE line — the truth. 8-18 words, a plain declarative statement (may be two short sentences). No question marks.
- Each line hits a DIFFERENT nerve: love, motherhood or family, friendship, self, time. Never two lines on the same nerve.
- Short declarative words. No metaphors that need decoding, no clichés, no advice-verbs. Read each line out loud — it should feel like something overheard, not written.
- US English. No emojis, no hashtags, no quotes around the lines. Never mention any app, product, journaling, therapy, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "lines": ["..."], "scene": "..." }
  ]
}`;

/** Generate one forbidden-truths topic (women's funnel, replaces selfie). */
export async function generateForbiddenTopic(
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  return generateMoodyFamilyTopic({
    purpose: "forbidden-carousel-topic",
    system: FORBIDDEN_SYSTEM_PROMPT,
    user: `Write one new forbidden-truths post.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "forbidden",
    requireName: false,
    minLines: 1,
  });
}

// ─── LATE BLOOMERS carousel (2026-08-28 night, per Keenan) ────────────
// Universal lane: real, verifiable people who started late — one person
// per slide, numbered like the discipline lanes ("1. Vera Wang."). The
// daily fn passes recently-used NAMES in the avoid list so the same
// person never repeats within 30 days.

const BLOOMERS_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 slides of white text centered on cinematic photography. The niche: LATE BLOOMERS — real, famous people who started late and still made it. Proof, not pep talk.

AUDIENCE: everyone scrolling at midnight who quietly believes their window has closed. Every slide should read as evidence that it hasn't.

SCENES: dark cinematic photography, vast and contemplative — an empty stage in low light, a desk lamp over an open notebook at night, a long road at dawn, a workshop in half-light, a city window lit late. Every frame DIM (white text must read on it). No people ever.

FORMAT — each slide reads like this (match the rhythm):
"1. Vera Wang.

Figure skater, then journalist. Didn't design her first dress until 40.

The empire came after."

RULES:
- "title": the cover text. 2-5 words, works in ALL CAPS ("THEY ALL STARTED LATE", "YOUR WINDOW ISN'T CLOSED"). No number in the title.
- Exactly 5 items. Each item:
  - "name": the person's real full name + period ("Vera Wang.").
  - "lines": 1-2 short paragraphs. First: what they were doing before and the REAL age they started or broke through — only widely documented facts about famous people (Vera Wang, Julia Child, Samuel L. Jackson, Toni Morrison, Ray Kroc caliber). If you are not certain of the age, pick someone you are certain about. Last line: a short settled statement (2-6 words), never a command.
- Vary the fields across the 5 slides: business, writing, film or music, food, art or science. Never two people from the same field.
- NEVER invent people, ages, or facts. Real names, real documented timelines only.
- Every sentence short. US English. No emojis, no hashtags, no quotes, no advice-verbs. Never mention any app, product, journaling, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "name": "...", "lines": ["...", "..."], "scene": "..." }
  ]
}`;

/** Generate one late-bloomers topic (universal). Pass recent NAMES too. */
export async function generateBloomersTopic(
  recentHeadlinesAndNames: string[]
): Promise<MoodyTopic> {
  return generateMoodyFamilyTopic({
    purpose: "bloomers-carousel-topic",
    system: BLOOMERS_SYSTEM_PROMPT,
    user: `Write one new late-bloomers post.${avoidBlock(recentHeadlinesAndNames)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "bloomers",
    requireName: true,
    minLines: 1,
  });
}

// ─── WHAT ___ TAUGHT ME carousel (2026-08-28 night, per Keenan) ───────
// Women's funnel: the teacher rotates daily (grief, silence, burnout,
// an empty house...) so the title itself is the dedupe key. Five
// first-person lessons, no headers.

const TAUGHT_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 slides of white text centered on cinematic photography. The niche: WHAT ___ TAUGHT ME — one hard teacher per post (grief, silence, burnout, an empty house, being the strong one, waiting rooms), five quiet first-person lessons it left behind.

AUDIENCE: women roughly 40-50 carrying a heavy mental load — always holding it together for everyone else. The lessons should feel earned, not quoted — like a woman telling the truth about what a hard season actually gave her.
VOICE: first person, quiet, settled. Plain sentences with warmth underneath. Never preachy, never inspirational-poster, never bitter.

${SCENE_BRIEF["women"]}

FORMAT — each slide reads like this (match the rhythm):
"Nobody is coming to grade how well I held it together.

So I stopped performing it."

RULES:
- "title": the cover text — "WHAT ___ TAUGHT ME" with ONE hard teacher filled in ("WHAT GRIEF TAUGHT ME", "WHAT THE QUIET HOUSE TAUGHT ME"). Pick a DIFFERENT teacher than any recent title. 3-7 words.
- Exactly 5 items. Each item's "lines": 1-2 short paragraphs — one lesson, first person, concrete. Optional second paragraph: a short settled closer (2-8 words), a statement, never a command to the reader.
- Each lesson hits a DIFFERENT nerve: what she dropped, what she kept, what she stopped believing, what she now protects, what surprised her. Never two on the same nerve.
- Every sentence short. US English. No emojis, no hashtags, no quotes, no advice-verbs. Never mention any app, product, journaling, therapy, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "lines": ["...", "..."], "scene": "..." }
  ]
}`;

/** Generate one what-X-taught-me topic (women's funnel). */
export async function generateTaughtTopic(
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  return generateMoodyFamilyTopic({
    purpose: "taught-carousel-topic",
    system: TAUGHT_SYSTEM_PROMPT,
    user: `Write one new what-it-taught-me post.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "taught",
    requireName: false,
    minLines: 1,
  });
}

// ─── ONE YEAR FROM NOW carousel (2026-08-28 night, per Keenan) ────────
// Universal lane: forward-pointing time math — five concrete
// transformations a single year holds, each grounded in plausible
// arithmetic. Memento mori's hopeful twin.

const YEAR_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 slides of white text centered on cinematic photography. The niche: ONE YEAR FROM NOW — concrete, arithmetic proof of what a single year quietly holds. Forward-pointing time math. Not motivation — evidence.

AUDIENCE: everyone scrolling at midnight and telling themselves it's too late to start. No gendered content.

SCENES: dark cinematic photography, vast and contemplative — a road disappearing into pre-dawn fog, a single lit window before sunrise, a calendar-blank horizon at first light, an empty running track at night, a doorway opening onto early morning. Every frame DIM (white text must read on it). No people ever.

FORMAT — each slide reads like this (match the rhythm):
"A year from now you could have read 24 books.

Two a month. Twenty minutes a night.

The year passes either way."

RULES:
- "title": the cover text. 2-5 words, works in ALL CAPS ("ONE YEAR FROM NOW", "THE YEAR PASSES ANYWAY"). No number in the title.
- Exactly 5 items. Each item's "lines": 2-3 short paragraphs.
  - First line: ONE concrete thing a year could hold, with an honest number ("A year from now you could have walked ~1,000 miles."). Plausible arithmetic only — hedge with "about" or "~" where needed, never fake precision.
  - Middle line: the small daily math that gets there ("Three miles a day. That's all.").
  - Last line: a short landing (2-6 words) — a statement or quiet command ("Start tonight.", "The year passes either way.").
- Vary the subject across the 5 slides: body, mind or skill, money, a relationship repaired, something quit. Never two slides on the same subject.
- It should feel like cold arithmetic pointed forward — never a pep talk, never poetry.
- Every sentence short. US English. No emojis, no hashtags, no quotes, no advice-verbs like "try to". Never mention any app, product, journaling, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "lines": ["...", "...", "..."], "scene": "..." }
  ]
}`;

/** Generate one one-year-from-now topic (universal). */
export async function generateYearTopic(
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  return generateMoodyFamilyTopic({
    purpose: "year-carousel-topic",
    system: YEAR_SYSTEM_PROMPT,
    user: `Write one new one-year-from-now post.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "year",
    requireName: false,
    minLines: 2,
  });
}

// ─── THINGS THAT ARE STILL FREE carousel (2026-08-28 night) ───────────
// Universal lane: five free things, numbered like the discipline lanes
// ("1. Watching it rain.") with one quiet expansion each. Quietly
// devastating positivity.

const FREE_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 slides of white text centered on cinematic photography. The niche: THINGS THAT ARE STILL FREE — small, real, available-tonight things money never touched. Quietly devastating in how obvious they are.

AUDIENCE: everyone scrolling at midnight. Universal — no gendered content, no niche jargon.

SCENES: dark cinematic photography, calm and contemplative — rain sliding down a dark window, a bench under a streetlamp, dawn light through thin curtains, a quiet dock at dusk, steam rising off a cup by a dark window. Every frame DIM (white text must read on it). No people ever.

FORMAT — each slide reads like this (match the rhythm):
"1. Watching it rain.

No ticket, no line, no upgrade. The best seat is the one by the window.

It's playing tonight."

RULES:
- "title": the cover text. 3-6 words, works in ALL CAPS ("STILL FREE", "THINGS THAT ARE STILL FREE"). No number in the title.
- Exactly 5 items. Each item:
  - "name": the free thing, 2-5 words + period ("Watching it rain.", "Being early.", "Saying it first.").
  - "lines": 1-2 short paragraphs. First: one quiet, concrete expansion of why it matters. Optional last line: a short settled closer (2-6 words), a statement, never a command.
- Vary the kind of free thing across the 5 slides: something in nature, something about time, something human, something sensory, something done alone. Never two of the same kind.
- Never saccharine, never a gratitude lecture — the tone is someone pointing out what was on the table the whole time.
- Every sentence short. US English. No emojis, no hashtags, no quotes, no advice-verbs. Never mention any app, product, journaling, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "name": "...", "lines": ["...", "..."], "scene": "..." }
  ]
}`;

/** Generate one still-free topic (universal). */
export async function generateFreeTopic(
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  return generateMoodyFamilyTopic({
    purpose: "free-carousel-topic",
    system: FREE_SYSTEM_PROMPT,
    user: `Write one new things-that-are-still-free post.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "free",
    requireName: true,
    minLines: 1,
  });
}

// ─── YOU'RE NOT BEHIND carousel (2026-08-28 night, per Keenan) ────────
// Women's funnel: five timeline lies, each named as a header ("1.
// Married by thirty.") and quietly dismantled underneath.

const BEHIND_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 slides of white text centered on cinematic photography. The niche: YOU'RE NOT BEHIND — five timeline lies the reader was handed, each named and quietly dismantled. Not a pep talk — a correction of the record.

AUDIENCE: women roughly 40-50 carrying a heavy mental load — measuring themselves against a schedule nobody actually agreed to. Reading it should feel like someone finally saying the quiet part: the deadline was made up.
VOICE: quiet, certain, a little dry. Second person. Never girlboss, never preachy, never "it's never too late!" cheerfulness — flat, factual permission.

${SCENE_BRIEF["women"]}

FORMAT — each slide reads like this (match the rhythm):
"1. Figured out by forty.

Nobody is. The ones who look it just stopped narrating the doubt.

The schedule was made up."

RULES:
- "title": the cover text. 2-5 words, works in ALL CAPS ("YOU'RE NOT BEHIND", "THE TIMELINE WAS MADE UP"). No number.
- Exactly 5 items. Each item:
  - "name": the timeline lie as a short deadline phrase + period ("Married by thirty.", "Career settled by forty.", "Body back by summer."). 2-6 words.
  - "lines": 1-2 short paragraphs. First: dismantle the lie in one or two plain sentences — where it came from, or the quiet truth that breaks it. Optional last line: a short settled closer (2-6 words), a statement, never a command.
- Each of the 5 lies comes from a DIFFERENT domain: love or marriage, career, money, body, self or purpose. Never two on the same domain.
- Every sentence short. US English. No emojis, no hashtags, no quotes, no advice-verbs. Never mention any app, product, journaling, therapy, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "name": "...", "lines": ["...", "..."], "scene": "..." }
  ]
}`;

/** Generate one you're-not-behind topic (women's funnel). */
export async function generateBehindTopic(
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  return generateMoodyFamilyTopic({
    purpose: "behind-carousel-topic",
    system: BEHIND_SYSTEM_PROMPT,
    user: `Write one new you're-not-behind post.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "behind",
    requireName: true,
    minLines: 1,
  });
}

// ─── NOBODY TELLS YOU carousel (2026-08-28 night, per Keenan) ─────────
// Women's funnel: the subject rotates daily ("NOBODY TELLS YOU ABOUT
// 45", "...ABOUT THE QUIET HOUSE") so the title is the dedupe key.
// Five unspoken truths, no headers.

const NOBODY_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 slides of white text centered on cinematic photography. The niche: NOBODY TELLS YOU — one life season per post, five truths about it that nobody says out loud beforehand.

AUDIENCE: women roughly 40-50 carrying a heavy mental load. The seasons rotate: turning 45, the year the kids stop needing you, a long marriage, caring for aging parents, friendship after 40, the quiet house. Each truth should land as recognition — "so it's not just me."
VOICE: quiet, flat, honest. Plain statements with warmth underneath. Never bitter, never dramatic — the sting is recognition.

${SCENE_BRIEF["women"]}

FORMAT — each slide reads like this (match the rhythm):
"The hardest part isn't the missing. It's that the missing becomes normal.

Nobody warns you about that part."

RULES:
- "title": the cover text — "NOBODY TELLS YOU" plus ONE specific season ("NOBODY TELLS YOU ABOUT 45", "NOBODY TELLS YOU ABOUT THE QUIET HOUSE"). Pick a DIFFERENT season than any recent title. 4-8 words.
- Exactly 5 items. Each item's "lines": 1-2 short paragraphs — one unspoken truth about that season, plain declarative sentences. Optional second paragraph: a short settled closer (2-8 words), a statement, never a command.
- Each truth hits a DIFFERENT nerve of the season: the body, the relationships, the identity, the surprise good part, the part she'd never admit. Exactly ONE of the 5 truths is unexpectedly good.
- Every sentence short. US English. No emojis, no hashtags, no quotes, no advice-verbs. Never mention any app, product, journaling, therapy, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "lines": ["...", "..."], "scene": "..." }
  ]
}`;

/** Generate one nobody-tells-you topic (women's funnel). */
export async function generateNobodyTopic(
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  return generateMoodyFamilyTopic({
    purpose: "nobody-carousel-topic",
    system: NOBODY_SYSTEM_PROMPT,
    user: `Write one new nobody-tells-you post.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "nobody",
    requireName: false,
    minLines: 1,
  });
}

// ─── UNSENT TEXTS carousel (2026-08-28 night, per Keenan) ─────────────
// Women's funnel: five messages typed and deleted — ONE per slide, in
// the premium QUOTE serif like the forbidden lane. Each to a different
// unnamed recipient.

const UNSENT_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 slides of white text centered on cinematic photography. The niche: UNSENT TEXTS — messages someone typed, read back, and deleted. Each slide is ONE deleted message. No commentary, no advice, anywhere.

AUDIENCE: women roughly 40-50 carrying a heavy mental load. Each message should read as something she herself has typed and erased — to a husband, a mother, an old friend, a grown child, someone gone, or herself.
VOICE: first person, raw but restrained — the honesty of a message that was never going to be sent. Plain texting language, not literary. Lowercase is allowed where it feels real.

${SCENE_BRIEF["women"]}

FORMAT — each slide is ONE message like:
"i'm not mad. i'm just tired of being the only one who notices."
"you were my best friend for 20 years. i don't even know what happened."

RULES:
- "title": the cover text. 2-5 words, works in ALL CAPS ("TYPED AND DELETED", "TEXTS I NEVER SENT"). Not a question.
- Exactly 5 items. Each item's "lines": exactly ONE line — the deleted message. 6-20 words. It must sound like a real text: plain words, contractions, no polish.
- Each message is to a DIFFERENT unnamed recipient: a partner, a parent, an old friend, a grown child or family member, someone gone or her past self. Never name names.
- Each hits a DIFFERENT nerve: exhaustion, drifted love, grief, resentment, tenderness. Exactly ONE of the 5 is tender instead of heavy.
- No metaphors, no aphorisms — these are texts, not quotes. If it sounds writerly, rewrite it plainer.
- US English. No emojis, no hashtags, no quotation marks around the lines. Never mention any app, product, journaling, therapy, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "lines": ["..."], "scene": "..." }
  ]
}`;

/** Generate one unsent-texts topic (women's funnel). */
export async function generateUnsentTopic(
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  return generateMoodyFamilyTopic({
    purpose: "unsent-carousel-topic",
    system: UNSENT_SYSTEM_PROMPT,
    user: `Write one new unsent-texts post.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "unsent",
    requireName: false,
    minLines: 1,
  });
}

// ─── Universal-lane caption (bloomers / year / free) ──────────────────
const UNIVERSAL_CORE_TAGS = ["#fyp", "#mindset", "#perspective", "#motivation"];
const UNIVERSAL_ROTATING_TAGS = [
  "#lifelessons",
  "#growth",
  "#presence",
  "#intentionalliving",
  "#reminder",
  "#itsnottoolate",
];

/** Hashtag-only caption for the forward-looking universal lanes. */
export function buildUniversalCaption(slug: string): string {
  let hash = 0;
  for (const c of slug) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  const h = Math.abs(hash);
  const extra = [
    UNIVERSAL_ROTATING_TAGS[h % UNIVERSAL_ROTATING_TAGS.length],
    UNIVERSAL_ROTATING_TAGS[(h + 3) % UNIVERSAL_ROTATING_TAGS.length],
  ];
  return [...UNIVERSAL_CORE_TAGS, ...new Set(extra)].join(" ");
}

// ─── THIS IS YOUR SIGN — single static image (2026-08-28 night) ───────
// Replaces the animated quote loop (which Keenan eliminated the same
// night). ONE dark cinematic image with ONE permission-giving line in
// bold confident lettering (per Keenan: "no fancy italics. bold,
// confident lettering"). Positive polarity — the warm cousin of the
// dead quote format.

export interface SignTopic {
  slug: string;
  /** The full sign line, starts with "THIS IS YOUR SIGN". */
  line: string;
  scene: string;
}

const SIGN_SYSTEM_PROMPT = `You write ONE line for a dark, moody single-image post. The format: bold white text on a dim cinematic photograph. The line always begins "THIS IS YOUR SIGN TO ..." and gives the reader quiet permission to do the thing they've been waiting for a sign to do.

AUDIENCE: women roughly 40-50 carrying a heavy mental load — always holding it together for everyone else. The sign should release something specific: rest, a boundary, a call, letting something go, starting something small.
VOICE: warm, certain, plain. Permission — never pressure, never hustle, never "go get it queen" energy.

RULES:
- ONE line, 8-16 words total, beginning exactly "THIS IS YOUR SIGN TO". Specific and concrete, not generic ("...to stop rehearsing the apology you don't owe", not "...to live your best life").
- No emojis, no hashtags, no quotes. Never mention any app, product, journaling, therapy, or AI.
- "scene": one concrete sentence describing the photograph — dim quiet-luxury interiors or nature in low warm light (rain on tall windows, a dark kitchen lit by one lamp, dusk through linen curtains). DIM, no people ever.
- "theme": 2-4 words naming what the sign releases (for repeat-avoidance).

OUTPUT (strict JSON, no markdown):
{ "line": "...", "scene": "...", "theme": "..." }`;

/** Generate one this-is-your-sign line + scene (women's funnel). */
export async function generateSignTopic(
  recentLines: string[]
): Promise<SignTopic> {
  const { prisma } = await import("@/lib/prisma");
  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      system: SIGN_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Write one new sign.${avoidBlock(recentLines)}\n\nReturn ONLY valid JSON.`,
        },
      ],
    });

    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    await prisma.claudeCallLog.create({
      data: {
        purpose: "sign-image-topic",
        model: CLAUDE_MODEL,
        tokensIn,
        tokensOut,
        costCents: Math.ceil(
          (tokensIn * INPUT_COST_PER_TOKEN + tokensOut * OUTPUT_COST_PER_TOKEN) * 100
        ),
        durationMs: Date.now() - start,
        success: true,
      },
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr) as {
      line?: string;
      scene?: string;
      theme?: string;
    };
    const line = (parsed.line ?? "").trim();
    const scene = (parsed.scene ?? "").trim();
    if (!line.toUpperCase().startsWith("THIS IS YOUR SIGN") || !scene) {
      throw new Error(`sign-image-topic unusable: line="${line}"`);
    }

    const slug = line
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);

    return { slug: `sign-${slug}`, line, scene };
  } catch (err) {
    await prisma.claudeCallLog.create({
      data: {
        purpose: "sign-image-topic",
        model: CLAUDE_MODEL,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        durationMs: Date.now() - start,
        success: false,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      },
    });
    throw err;
  }
}
