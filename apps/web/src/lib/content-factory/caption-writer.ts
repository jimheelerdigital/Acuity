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

const LIFE_QUESTION = `one question the reader genuinely wants to answer about their own life, the kind someone answers in the comments with a real sentence and not just "yes". It is personal and specific to this post, and easy to answer honestly ("what's the one thing you'd drop tomorrow if nobody would notice?" is the kind, not the words). A yes/no question, a quiz, or "which one are you?" earns little. If an existing question is given and it already does this, keep it or tighten it; if it's generic, replace it.`;

const anthropic = contentAnthropic;
const CLAUDE_MODEL = CONTENT_MODEL;
const INPUT_COST_PER_TOKEN = CONTENT_INPUT_COST_PER_TOKEN;
const OUTPUT_COST_PER_TOKEN = CONTENT_OUTPUT_COST_PER_TOKEN;

const BANNED_TAGS = new Set([
  "#fyp",
  "#foryou",
  "#foryoupage",
  "#viral",
  "#explore",
  "#trending",
]);

// 2026-10-03, per Keenan: "write as if we're talking TO the other person".
const YOU_RULE =
  'TALK TO THE READER: every line speaks straight to them as "you" about their own life. Never describe the reader as "she/her" or "he/him" ("when a free day shows up, she can\'t hear what she wants" becomes "when a free day shows up, you can\'t hear what you want").';

const BRAND = {
  ripple: {
    audience:
      "women roughly 40–50 carrying the household's invisible mental load",
    voice:
      "warm and on her side — name what she is carrying, point at the next small step, never lecture. Short sentences, her own words, specifics over abstractions.",
    keywords:
      "mental load, invisible labor, women over 40, midlife, overthinking, burnout, emotional exhaustion, self care for moms, feeling unseen, journaling",
    tags: "#mentalload #womenover40 #midlife #overthinking #burnout #momlife #selfcare #emotionalhealth #invisiblelabor #journaling",
    question: LIFE_QUESTION,
    // 2026-10-02: every Ripple caption that day leaned on "mental load".
    extra:
      'VARIETY: don\'t lean on the phrases "mental load" or "invisible labor" in the caption text; name the specific thing from this post instead (the appointment, the group chat, the free Saturday). They can stay in the hashtags. ' +
      YOU_RULE,
  },
  bwk: {
    // 2026-09-30 BWK revamp (Keenan: "it's about grinding so you can live
    // the lifestyle you want"). Matches copy-objectives.ts.
    audience:
      "young men roughly 18–30 pushing for their highest output: growth, becoming their best self, and earning the lifestyle they want",
    voice:
      "confident, direct, ambitious: a man already living it pulling the reader up with him. Names the dream and the work it takes. No shaming, no guru or course-seller tone, no get-rich-quick.",
    keywords:
      "discipline, self improvement, growth, ambition, luxury lifestyle, success, grind, hard work, becoming your best self, mindset, wealth building",
    tags: "#discipline #selfimprovement #growth #ambition #luxurylifestyle #success #mindset #grind #motivation #buildwithkey",
    question: LIFE_QUESTION,
    extra: YOU_RULE,
  },
  mythicals: {
    audience:
      "fans of fantasy, mythology, legendary creatures and epic warriors — gamers, D&D players, anime and fantasy-film fans",
    voice:
      "playful and epic — a friend hyping a debate. Make the choice feel personal and invite a pick and a reason. Never corny, never lore-dumping.",
    keywords:
      "mythical creatures, dragons, fantasy art, legendary beasts, mythology, fantasy warriors, which one would you choose, pick your fighter, epic fantasy",
    tags: "#mythicalcreatures #dragon #fantasyart #mythology #legendary #fantasy #pickone #whichoneareyou #epicfantasy #beasts",
    // 2026-10-02: the life-question rule turned fantasy posts into self-help
    // ("what's the real-life habit behind that?"). Mythicals stays fun.
    question:
      'one question that stays INSIDE the fantasy: which one they pick and why, who wins and how, what they would do with it, who they would bring. It should be fun to argue about in the comments with a real sentence ("which one do you pick, and what\'s the first thing you\'d make it guard?" is the kind, not the words). Never turn it into a real-life lesson, habit, self-improvement or "what does this say about you" question; this audience is here for fun. If the post names a person (your bro, her), the question is about that same person.',
    extra: "",
  },
} as const;

interface WrittenCaption {
  firstLine: string;
  secondLine: string;
  question: string;
  hashtags: string[];
}

/**
 * Fixed quiz line on every Mythicals caption (2026-10-01, per Keenan: grow
 * the following through the quiz funnel first). Added in code, after the
 * writer, because the writer is told never to market. The plain domain
 * reads on Instagram (where caption links don't click) and links on
 * Facebook/TikTok.
 */
const MYTHICALS_QUIZ_LINE =
  "Which legendary creature are you? Take the free quiz at legendarymythicals.com/quiz";

function assemble(
  c: WrittenCaption,
  brand?: "ripple" | "bwk" | "mythicals"
): string {
  const tags = c.hashtags
    .map((t) =>
      (t.startsWith("#") ? t : `#${t}`)
        .toLowerCase()
        .replace(/[^#a-z0-9_]/g, "")
    )
    .filter((t) => t.length > 1 && !BANNED_TAGS.has(t))
    .slice(0, 4);
  return [
    [c.firstLine.trim(), c.secondLine.trim()].filter(Boolean).join("\n"),
    c.question.trim(),
    brand === "mythicals" ? MYTHICALS_QUIZ_LINE : "",
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
  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
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
- "question": ${b.question}${b.extra ? `\n\n${b.extra}` : ""}
- "hashtags": exactly 4, one broad and three niche, chosen for this post (prefer from: ${b.tags}). Never #fyp, #foryou or #viral, which add noise and no reach.

LIMITS, and why: no app name, product mention, "link in bio", "follow for more", "save this" or "send this to", because asking reads as marketing and the post has to earn it. Never "brain dump", never a recording duration ("60 seconds", "one minute"), never a fixed time of day ("nightly", "before bed", "at 9pm"). No medical or mental-health claims about the reader ("your anxiety"). At most one emoji. Avoid AI tells like "in a world where", "it's not just X, it's Y", "let's dive in", "journey", "unlock", "transform", "game-changer" and chains of em-dashes.

Return only the JSON object: {"firstLine": string, "secondLine": string, "question": string, "hashtags": string[]}`,
        messages: [
          {
            role: "user",
            content: `POST HEADLINE: ${opts.headline}
SLIDE TEXT:
${opts.slideText.map((t, i) => `${i + 1}. ${t}`).join("\n") || "(none)"}
EXISTING QUESTION: ${opts.question ?? "(none)"}${feedback ? `\n\nA REVIEWER REJECTED YOUR LAST DRAFT: ${feedback} Write a new one that fixes this.` : ""}`,
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
      if (
        !parsed.firstLine ||
        !parsed.question ||
        !Array.isArray(parsed.hashtags)
      )
        return null;
      const problem =
        attempt === 0
          ? await captionProblem(
              opts.brand,
              opts.headline,
              opts.slideText,
              parsed
            )
          : null;
      if (problem) {
        console.warn(
          `[caption-writer] Jev rejected ${opts.brand} caption for "${opts.headline}": ${problem}`
        );
        feedback = problem;
        continue;
      }
      return assemble(parsed, opts.brand);
    } catch (err) {
      console.error(
        `[caption-writer] failed: ${err instanceof Error ? err.message : err}`
      );
      return null;
    }
  }
  return null;
}

/**
 * Jev caption check (2026-10-02, per Keenan: "TRIPLE CHECK that all of our
 * social scripts were run through jev"). Captions were the one piece of
 * reader-facing copy Jev never saw. Returns the reason to rewrite, or null
 * when it passes or Jev has no opinion (fail open). One rewrite at most;
 * the second draft ships either way.
 */
async function captionProblem(
  brand: "ripple" | "bwk" | "mythicals",
  headline: string,
  slideText: string[],
  c: WrittenCaption
): Promise<string | null> {
  const { askJev, noulOf } = await import("./jev");
  const caption = [c.firstLine, c.secondLine, c.question]
    .filter(Boolean)
    .join("\n");
  const questions: Parameters<typeof askJev>[2] = {
    fits: {
      type: "noul",
      instructions:
        "Does this caption clearly belong to this post: it talks about the same topic as the headline and slides, and anyone it mentions (her, him, your bro) is the same person the post is about?",
    },
    sense: {
      type: "noul",
      instructions:
        "Does every sentence of the caption make sense on its own and read like something a real person would write?",
    },
  };
  if (brand === "mythicals") {
    questions.forced = {
      type: "noul",
      instructions:
        "This is a fun fantasy post. Does the caption's question turn it into a real-life lesson, a habit, self-improvement, or a 'what does this say about you' question instead of staying about the fantasy pick itself?",
    };
  }
  const r = await askJev(
    `caption-check:${brand}`,
    { brand, headline, slides: slideText, caption },
    questions
  );
  const fits = noulOf(r, "fits");
  const sense = noulOf(r, "sense");
  const forced = noulOf(r, "forced");
  if (fits !== null && fits < 0.4)
    return "the caption doesn't match the post's topic or names the wrong person.";
  if (sense !== null && sense < 0.4)
    return "part of the caption doesn't make sense or sounds unnatural.";
  if (forced !== null && forced >= 0.6)
    return "the question turns a fun fantasy post into a real-life lesson; keep it about the fantasy pick.";
  return null;
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
export async function ensureWrittenCaption(
  carouselPostId: string
): Promise<string | null> {
  try {
    const post = await prisma.carouselPost.findUnique({
      where: { id: carouselPostId },
      select: {
        caption: true,
        captionWrittenAt: true,
        headline: true,
        lane: true,
        slides: {
          orderBy: { order: "asc" },
          select: { overlayText: true, kind: true },
        },
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
    console.error(
      `[caption-writer] ensure failed for ${carouselPostId}: ${err instanceof Error ? err.message : err}`
    );
    return null;
  }
}
