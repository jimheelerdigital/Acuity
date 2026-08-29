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

const AUDIENCE_BRIEF: Record<MoodyAudience, string> = {
  men: `AUDIENCE: young aspiring men (18-30) deep in the self-improvement / discipline / "trust the process" niche. They save posts that read like orders from a future self: monk mode, order, focus, momentum, delayed gratification, becoming undeniable.
VOICE: calm command energy. Short declarative sentences. No softness, no hedging, no "maybe try". Direct second person. The tone of a mentor who's already made it and doesn't waste words. Never bro-slang, never yelling, never toxic — controlled, austere, certain.
TOPICS to rotate: discipline systems, monk mode, dopamine control, morning/evening order, cutting noise, training, focus blocks, silence, patience, becoming hard to distract.`,
  women: `AUDIENCE: women roughly 40-50 carrying a heavy mental load — always holding it together for everyone else. They save posts that feel like quiet permission to reclaim order and protect their peace.
VOICE: quiet strength. Short declarative sentences with warmth underneath — a woman who has stopped explaining herself. Direct second person. Never preachy, never girlboss, never clinical. Discipline framed as self-respect: boundaries, resets, saying no, protecting energy, doing less on purpose.
TOPICS to rotate: protecting your peace, reset rituals, boundaries without guilt, quiet mornings, dropping what drains you, unhurried order, saying no, letting the phone go dark.`,
};

const SCENE_BRIEF: Record<MoodyAudience, string> = {
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

/** Generate one moody-carousel topic for the given audience funnel. */
export async function generateMoodyTopic(
  audience: MoodyAudience,
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  const { prisma } = await import("@/lib/prisma");

  const avoidBlock =
    recentHeadlines.length > 0
      ? `\n\nDo NOT repeat or closely resemble any of these recent titles:\n${recentHeadlines.map((h) => `- ${h}`).join("\n")}`
      : "";
  const userPrompt = `Write one new post for the ${audience === "men" ? "young aspiring men" : "women 40-50"} funnel.${avoidBlock}\n\nReturn ONLY valid JSON.`;

  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1200,
      system: buildMoodySystemPrompt(audience),
      messages: [{ role: "user", content: userPrompt }],
    });

    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    await prisma.claudeCallLog.create({
      data: {
        purpose: `moody-carousel-topic-${audience}`,
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
          typeof it.name === "string" &&
          Array.isArray(it.lines) &&
          it.lines.length >= 2 &&
          typeof it.scene === "string"
      )
      .map((it) => ({
        name: it.name!.trim(),
        lines: it.lines!.map((l) => l.trim()).filter(Boolean),
        scene: it.scene!.trim(),
      }));
    if (!title || items.length < 4) {
      throw new Error(
        `Moody topic unusable: title="${title}", ${items.length} valid items`
      );
    }

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);

    return {
      slug: `moody-${audience}-${slug}`,
      title,
      coverScene:
        (parsed.coverScene ?? "").trim() ||
        items[0].scene,
      items: items.slice(0, 6),
    };
  } catch (err) {
    await prisma.claudeCallLog.create({
      data: {
        purpose: `moody-carousel-topic-${audience}`,
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

/** Image prompt for one moody slide — dark cinematic, text-free, no people. */
export function buildMoodyImagePrompt(
  audience: MoodyAudience,
  scene: string
): string {
  const style =
    audience === "men"
      ? "Dark, moody, minimalist luxury architecture photography. Desaturated, near-monochrome color grade — charcoal, slate, black, cold glass. Overcast or night light, deep shadows, austere and powerful."
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
