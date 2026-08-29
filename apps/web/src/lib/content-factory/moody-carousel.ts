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
