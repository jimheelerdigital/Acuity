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

import {
  contentAnthropic,
  CONTENT_MODEL,
  CONTENT_INPUT_COST_PER_TOKEN,
  CONTENT_OUTPUT_COST_PER_TOKEN,
  lastJsonText,
} from "./claude-client";

import { prisma } from "@/lib/prisma";
import { copyObjectives } from "./copy-objectives";

const anthropic = contentAnthropic;
const CLAUDE_MODEL = CONTENT_MODEL;
const INPUT_COST_PER_TOKEN = CONTENT_INPUT_COST_PER_TOKEN;
const OUTPUT_COST_PER_TOKEN = CONTENT_OUTPUT_COST_PER_TOKEN;

const BANNED_TAGS = new Set(["#fyp", "#foryou", "#foryoupage", "#viral", "#explore", "#trending"]);

const BRAND = {
  ripple: {
    audience: "women roughly 40–50 carrying the household's invisible mental load",
    voice:
      "warm and on her side — name what she is carrying, point at the next small step, never lecture. Short sentences, her own words, specifics over abstractions.",
    keywords:
      "mental load, invisible labor, women over 40, midlife, overthinking, burnout, emotional exhaustion, self care for moms, feeling unseen, journaling",
    tags: "#mentalload #womenover40 #midlife #overthinking #burnout #momlife #selfcare #emotionalhealth #invisiblelabor #journaling",
  },
  bwk: {
    audience: "young men roughly 18–30 focused on discipline, self-respect and building a life they respect",
    voice:
      "direct, grounded, zero hype — a man who has his act together talking straight. No grindset clichés, no shaming, no guru tone.",
    keywords:
      "discipline, self improvement, consistency, habits, accountability, dopamine, focus, becoming a better man, mindset, stop procrastinating",
    tags: "#discipline #selfimprovement #consistency #habits #mindset #accountability #selfdiscipline #focus #mensmentalhealth #growth",
  },
  mythicals: {
    audience: "fans of fantasy, mythology, legendary creatures and epic warriors — gamers, D&D players, anime and fantasy-film fans",
    voice:
      "playful and epic — a friend hyping a debate. Make the choice feel personal and invite a pick and a reason. Never corny, never lore-dumping.",
    keywords:
      "mythical creatures, dragons, fantasy art, legendary beasts, mythology, fantasy warriors, which one would you choose, pick your fighter, epic fantasy",
    tags: "#mythicalcreatures #dragon #fantasyart #mythology #legendary #fantasy #pickone #whichoneareyou #epicfantasy #beasts",
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
  brand: "ripple" | "bwk" | "mythicals";
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
      // 2026-09-28 (Sonnet 5.5 rewrite, per Keenan): opens with the brand
      // brief; the caption's job is now framed as earning the comment
      // (a first line the slides don't already say + a question she/he
      // genuinely wants to answer). Same JSON shape and bans as before.
      system: `${copyObjectives(opts.brand)}

THIS JOB: write the caption under one post that is already made (Instagram, Facebook and TikTok). The reader has just swiped the slides. The caption is where a like turns into a comment, and where search finds the post later.
READER: ${b.audience}.
VOICE: ${b.voice}

THE FIELDS:
- "firstLine" (110 characters at most): add something the slides don't already say. A specific moment, the thought behind the post, the part that usually goes unsaid. Repeating the headline wastes the most-read line of the caption. Use words this audience actually searches for where they fit naturally (${b.keywords}), but it must read like a person talking, never like a keyword list. Lowercase is fine.
- "secondLine" (120 characters at most, optional): one more line that makes the reader feel seen. Return "" if it would only be filler; a short caption beats a padded one.
- "question": one question the reader genuinely wants to answer about their own life, the kind someone answers in the comments with a real sentence and not just "yes". It is personal and specific to this post, and easy to answer honestly ("what's the one thing you'd drop tomorrow if nobody would notice?" is the kind, not the words). A yes/no question, a quiz, or "which one are you?" earns little. If an existing question is given and it already does this, keep it or tighten it; if it's generic, replace it.
- "hashtags": exactly 4, one broad and three niche, chosen for this post (prefer from: ${b.tags}). Never #fyp, #foryou or #viral, which add noise and no reach.

LIMITS, and why: no app name, product mention, "link in bio", "follow for more", "save this" or "send this to", because asking reads as marketing and the post has to earn it. Never "brain dump", never a recording duration ("60 seconds", "one minute"), never a fixed time of day ("nightly", "before bed", "at 9pm"). No medical or mental-health claims about the reader ("your anxiety"). At most one emoji. Avoid AI tells like "in a world where", "it's not just X, it's Y", "let's dive in", "journey", "unlock", "transform", "game-changer" and chains of em-dashes.

Return only the JSON object: {"firstLine": string, "secondLine": string, "question": string, "hashtags": string[]}`,
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
    const parsed = JSON.parse(lastJsonText(text)) as WrittenCaption;
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
