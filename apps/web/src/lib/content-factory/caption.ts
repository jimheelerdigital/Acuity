/**
 * Content Factory — caption builder.
 *
 * PERSONA (2026-08-20, per Keenan: templated captions read "brutally
 * bad and clearly AI written"): every caption reads like a real woman
 * who runs the page wrote it herself — text-message tone, lowercase-
 * leaning, no marketing copy, minimal emojis. Captions are written by
 * the LLM per post (topic.captionOpen / script.caption); the template
 * lines below are FALLBACKS only, for when the model omits the field.
 */

import type { CarouselTopic } from "./topics";

// Link-in-bio plug — carousels only (calm/calm-story posts are plug-free).
// Rewritten 2026-08-20 in the page-owner's voice, not brand copy.
const CLOSING_LINE =
  "ripple is where i debrief all of this out loud — it's in my bio if you want your free week 🌊";

// FALLBACK first line (only when the LLM caption is missing). Only this
// line shows in the feed before "...more" — it must be a second hook.
const FIRST_LINE_HOOKS = [
  "number {n} is the one i didn't want to admit",
  "i almost didn't post number {n}",
  "be honest about number {n}",
  "the last one is the one you'll send her",
  "if nobody's said this to you today, here",
  "read number {n} twice",
];

// FALLBACK comment ask — one is picked per pool, deterministically by
// slug, so captions vary across posts but stay stable per post.
const COMMENT_CTAS = [
  "which one is you? i'm 3, every time",
  "tell me which number got you",
  "which one called you out? be honest",
  "if you made it to the last one, tell me which was yours",
];

// NOTE (2026-08-13, per Keenan): the "engineered comment gap" (a
// deliberately withheld reason + "comment the one I missed" CTA) is
// REMOVED — the list must be complete. The engagement ask now lives on
// the cover itself (see coverEngagementLine).

// On-cover engagement question (2026-08-13, per Keenan): the cover
// asks what they think — "which one hits the hardest" — to pull
// comments from the first frame. Phrasing follows the headline's noun
// (signs → "which sign", lies → "which one do you tell") and one
// variant is picked deterministically by slug so posts vary but each
// post is stable across re-renders.
const ENGAGEMENT_LINE_FAMILIES: { match: RegExp; lines: string[] }[] = [
  {
    match: /\bsigns?\b/i,
    lines: [
      "Which sign is you?",
      "How many of these are you?",
      "Which one calls you out?",
    ],
  },
  {
    match: /\blies\b/i,
    lines: [
      "Which one do you tell the most?",
      "Which one are you telling today?",
      "Which one feels personal?",
    ],
  },
  {
    match: /\breminders?\b/i,
    lines: [
      "Which one do you need today?",
      "Which one are you keeping?",
      "Which one hits home?",
    ],
  },
  {
    match: /\bquestions?\b/i,
    lines: [
      "Which one are you avoiding?",
      "Which one stops you?",
      "Which one can't you answer?",
    ],
  },
  {
    match: /\bhabits?\b/i,
    lines: [
      "Which one is yours?",
      "Which one hits the hardest?",
      "Which one calls you out?",
    ],
  },
];

// All lines stay PRESENT tense (2026-08-15, per Keenan): the question
// renders on the cover, BEFORE the reader has seen the list — past
// tense ("hit home", "called you out") reads wrong there.
const ENGAGEMENT_LINES_DEFAULT = [
  "Which one hits the hardest?",
  "Which one is you?",
  "Which one hits home?",
  "Be honest — which one is you?",
];

/**
 * The engagement question shown on the cover slide (static + animated).
 * Keep it short — it renders as a sub-line under the headline.
 */
export function coverEngagementLine(headline: string, slug: string): string {
  const family = ENGAGEMENT_LINE_FAMILIES.find((f) => f.match.test(headline));
  return pickBySlug(slug, family ? family.lines : ENGAGEMENT_LINES_DEFAULT, 3);
}

function pickBySlug(slug: string, pool: string[], offset = 0): string {
  let hash = 0;
  for (const c of slug) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  return pool[(Math.abs(hash) + offset) % pool.length];
}

// ── Hashtags (2026-08-20, per Keenan: "GOOD hashtags that are popular
// that can drive traffic, 5 max, on every post") ─────────────────────
// Every post gets exactly 5: 2 MEGA tags (10M+ posts — raw reach) +
// 3 NICHE tags (where this audience actually browses). The mix rotates
// deterministically by slug so posts vary but each post is stable.
// Zero-search-volume brand tags (#rippleapp, #voicejournal) are GONE —
// they drove no discovery.
const MEGA_HASHTAGS = [
  "#selfcare",
  "#selflove",
  "#mentalhealth",
  "#mindfulness",
  "#healing",
  "#motivation",
  "#personalgrowth",
  "#wellness",
];
const NICHE_HASHTAGS = [
  "#mentalload",
  "#momlife",
  "#womenover40",
  "#midlife",
  "#innerpeace",
  "#burnout",
  "#dailyreminder",
  "#emotionalhealth",
  "#overthinking",
  "#anxietyrelief",
  "#mentalhealthawareness",
  "#selfcarereminder",
];

/** 5 hashtags per post: 2 mega-reach + 3 niche, rotated by slug. */
export function pickHashtags(slug: string): string[] {
  let hash = 0;
  for (const c of slug) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  const h = Math.abs(hash);

  const mega = new Set<string>();
  let i = h;
  while (mega.size < 2) {
    mega.add(MEGA_HASHTAGS[i % MEGA_HASHTAGS.length]);
    i++;
  }
  const niche = new Set<string>();
  let j = h >> 3;
  while (niche.size < 3) {
    niche.add(NICHE_HASHTAGS[j % NICHE_HASHTAGS.length]);
    j++;
  }
  return [...mega, ...niche];
}

// SHORT captions (2026-08-21, per Keenan): the numbered list is GONE
// from the caption — it just reiterated the slides. A caption is now
// hook + one ask + plug + hashtags, nothing else.
export function buildCaption(topic: CarouselTopic): string {
  const lines: string[] = [];

  // Opening: the LLM-written personal open (2026-08-20) — or the
  // fallback second-hook tease when the model omitted it.
  const open = topic.captionOpen?.trim();
  if (open) {
    lines.push(open);
  } else {
    const teaseN = Math.min(
      topic.reasons.length,
      2 + (Math.abs(topic.slug.length * 7) % Math.max(1, topic.reasons.length - 1))
    );
    lines.push(
      pickBySlug(topic.slug, FIRST_LINE_HOOKS, 2).replace("{n}", String(teaseN))
    );
  }

  lines.push("");
  const close = topic.captionClose?.trim();
  lines.push(close || pickBySlug(topic.slug, COMMENT_CTAS));
  lines.push("");
  lines.push(CLOSING_LINE);
  lines.push("");
  lines.push(pickHashtags(topic.slug).join(" "));

  return lines.join("\n");
}

// FALLBACK share lines for calm captions, in her voice.
const AMBIENT_SHARE_LINES = [
  "save this for the day you need it",
  "sending this to everyone who's carrying a lot right now",
  "if this found you at the right time, pass it on",
  "save it. you'll want it again",
];

/**
 * Caption for AMBIENT calm posts and CALM-STORY posts (both plug-free —
 * 2026-08-19, per Keenan: these build a following, they don't sell).
 * The LLM writes the whole caption body per post (`caption`) in the
 * page-owner's voice; code only appends the 5 hashtags. The
 * question/hook/share-line assembly is the fallback.
 */
export function buildAmbientCaption(opts: {
  slug: string;
  title: string;
  /** Full LLM-written caption body (everything above the hashtags). */
  caption?: string;
  captionHook?: string;
  commentPrompt?: string;
}): string {
  const body = opts.caption?.trim();
  if (body) {
    return `${body}\n\n${pickHashtags(opts.slug).join(" ")}`;
  }

  // SHORT fallback (2026-08-21, per Keenan): one lead line + one share
  // ask + hashtags. Never both the question and the hook.
  const question = opts.commentPrompt?.trim().replace(/\s*👇\s*$/, "");
  const lead = question || opts.captionHook?.trim() || opts.title;
  return [
    lead,
    "",
    pickBySlug(opts.slug, AMBIENT_SHARE_LINES),
    "",
    pickHashtags(opts.slug).join(" "),
  ].join("\n");
}
