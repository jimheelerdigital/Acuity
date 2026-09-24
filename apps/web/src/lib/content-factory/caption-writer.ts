/**
 * Content Factory — caption writer (2026-09-24, per Keenan: "you should
 * write the captions for me").
 *
 * Replaces the generator's caption (a bare question + tags, or tags only
 * on the moody lanes) with a full caption written for DISCOVERY:
 *
 *   <searchable first line — the phrases this audience actually types>
 *   <one relatable line in the brand voice>
 *
 *   <the post's thought-provoking question — drives comments>
 *
 *   <4 hashtags: 1 broad + 3 niche, never #fyp/#foryou/#viral>
 *
 * Why: IG and TikTok discovery in 2026 leans on caption keywords (search),
 * and a question is the cheapest comment trigger. #fyp is noise.
 * No app plug and no link line — the CTA lives on the post's end slide.
 *
 * Runs lazily at the two places a caption leaves the building — the TikTok
 * email and IG/FB auto-publish — via ensureWrittenCaption(), which writes
 * the result back to CarouselPost.caption once (captionWrittenAt), so the
 * email and every platform get the SAME caption. Soft: any failure returns
 * the existing caption unchanged.
 */

import Anthropic from "@anthropic-ai/sdk";

import { prisma } from "@/lib/prisma";

const anthropic = new Anthropic();
const CLAUDE_MODEL = "claude-sonnet-4-6";
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

const BANNED_TAGS = new Set(["#fyp", "#foryou", "#foryoupage", "#viral", "#explore", "#trending"]);

const BRAND = {
  ripple: {
    audience: "women roughly 40–50 carrying the household's invisible mental load",
    voice:
      "warm, observational, a mirror not a coach — reflect, never advise or lecture. Short sentences, her own words, specifics over abstractions.",
    keywords:
      "mental load, invisible labor, women over 40, midlife, overthinking, burnout, emotional exhaustion, self care for moms, feeling unseen, journaling",
    tags: "#mentalload #womenover40 #midlife #overthinking #burnout #momlife #selfcare #emotionalhealth #invisiblelabor #journaling",
  },
  bwk: {
    audience: "young men 18–34 focused on discipline, self-respect and building a life they respect",
    voice:
      "direct, grounded, zero hype — a man who has his act together talking straight. No grindset clichés, no shaming, no guru tone.",
    keywords:
      "discipline, self improvement, consistency, habits, accountability, dopamine, focus, becoming a better man, mindset, stop procrastinating",
    tags: "#discipline #selfimprovement #consistency #habits #mindset #accountability #selfdiscipline #focus #mensmentalhealth #growth",
  },
} as const;

interface WrittenCaption {
  firstLine: string;
  secondLine: string;
  question: string;
  hashtags: string[];
}

function assemble(c: WrittenCaption): string {
  const tags = c.hashtags
    .map((t) => (t.startsWith("#") ? t : `#${t}`).toLowerCase().replace(/[^#a-z0-9_]/g, ""))
    .filter((t) => t.length > 1 && !BANNED_TAGS.has(t))
    .slice(0, 4);
  return [
    [c.firstLine.trim(), c.secondLine.trim()].filter(Boolean).join("\n"),
    c.question.trim(),
    tags.join(" "),
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function writeCaption(opts: {
  brand: "ripple" | "bwk";
  headline: string;
  slideText: string[];
  question: string | null;
}): Promise<string | null> {
  const b = BRAND[opts.brand];
  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 800,
      system: `You write the caption for one social post (TikTok + Instagram + Facebook) for ${b.audience}.
VOICE: ${b.voice}

Write:
- firstLine: ≤110 characters. Says plainly what this post is about using words this audience actually SEARCHES (pick naturally from: ${b.keywords}). It must read like a human sentence, not a keyword list. Lowercase is fine.
- secondLine: ≤120 characters, one relatable line that makes her/him feel seen. Optional — return "" if it would be filler.
- question: ONE thought-provoking question that invites a personal answer in the comments. If an existing question is given and it's good, keep it (you may tighten it).
- hashtags: exactly 4 — 1 broad + 3 niche, chosen for THIS post (prefer from: ${b.tags}). Never #fyp, #foryou, #viral.

RULES:
- No app name, no product mention, no "link in bio", no "follow for more", no "save this", no "send this to".
- Never "brain dump". Never a recording duration ("60 seconds", "one minute"). Never a fixed time of day ("nightly", "before bed", "at 9pm").
- No medical/mental-health claims about the reader ("your anxiety"). No emojis beyond at most one.
- No AI tells: no "in a world where", "it's not just X, it's Y", "let's dive in", "journey", "unlock", "transform", "game-changer", em-dash chains.

Return ONLY JSON: {"firstLine": string, "secondLine": string, "question": string, "hashtags": string[]}`,
      messages: [
        {
          role: "user",
          content: `POST HEADLINE: ${opts.headline}
SLIDE TEXT:
${opts.slideText.map((t, i) => `${i + 1}. ${t}`).join("\n") || "(none)"}
EXISTING QUESTION: ${opts.question ?? "(none)"}`,
        },
      ],
    });
    const text = response.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");
    await prisma.claudeCallLog
      .create({
        data: {
          purpose: `caption-writer:${opts.brand}`,
          model: CLAUDE_MODEL,
          tokensIn: response.usage.input_tokens,
          tokensOut: response.usage.output_tokens,
          costCents: Math.ceil(
            (response.usage.input_tokens * INPUT_COST_PER_TOKEN +
              response.usage.output_tokens * OUTPUT_COST_PER_TOKEN) *
              100
          ),
          durationMs: Date.now() - start,
          success: true,
        },
      })
      .catch(() => {});
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    const parsed = JSON.parse(text.slice(s, e + 1)) as WrittenCaption;
    if (!parsed.firstLine || !parsed.question || !Array.isArray(parsed.hashtags)) return null;
    return assemble(parsed);
  } catch (err) {
    console.error(`[caption-writer] failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/** The existing caption's question line, if it has one. */
function existingQuestion(caption: string): string | null {
  const q = caption
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.endsWith("?") && !l.startsWith("#"));
  return q ?? null;
}

/**
 * Return the post's written caption, writing (and saving) it first if this
 * post hasn't had one. Idempotent; never throws.
 */
export async function ensureWrittenCaption(carouselPostId: string): Promise<string | null> {
  try {
    const post = await prisma.carouselPost.findUnique({
      where: { id: carouselPostId },
      select: {
        caption: true,
        captionWrittenAt: true,
        headline: true,
        lane: true,
        slides: { orderBy: { order: "asc" }, select: { overlayText: true, kind: true } },
      },
    });
    if (!post) return null;
    if (post.captionWrittenAt) return post.caption;

    const { laneBrand } = await import("@/lib/content-factory/social-publish");
    const brand = await laneBrand(post.lane);
    const written = await writeCaption({
      brand,
      headline: post.headline,
      slideText: post.slides
        .filter((s) => s.kind !== "SCENE")
        .map((s) => s.overlayText)
        .filter(Boolean)
        .slice(0, 10),
      question: existingQuestion(post.caption),
    });
    if (!written) return post.caption;

    await prisma.carouselPost.update({
      where: { id: carouselPostId },
      data: { caption: written, captionWrittenAt: new Date() },
    });
    return written;
  } catch (err) {
    console.error(`[caption-writer] ensure failed for ${carouselPostId}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
