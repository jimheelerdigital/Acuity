/**
 * Content Factory — caption builder.
 *
 * FORMAT (2026-08-28, per Keenan: "just give me a thought provoking
 * question and then 3-4 hashtags. this goes for all posts" / "ask one
 * question, give a few hashtags, be done"): every caption on every
 * post is ONE thought-provoking question + 3-4 hashtags. No bio plug,
 * no "send this to", no comment CTAs, no share/save asks — ever. The
 * question is written by the LLM per post (topic.captionQuestion /
 * script.caption); the pool below is the fallback only.
 */

import type { CarouselTopic } from "./topics";

// FALLBACK questions (only when the LLM question is missing) — picked
// deterministically by slug so captions vary across posts but stay
// stable per post.
const FALLBACK_QUESTIONS = [
  "when did being tired become your baseline?",
  "when's the last time you did something just for you?",
  "what would you do with one hour nobody needed you?",
  "when did resting start feeling like something you have to earn?",
  "who checks on you?",
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

/**
 * 3-4 hashtags per post (2026-08-28, per Keenan: "a few hashtags"):
 * 1 mega-reach + 2-3 niche, rotated deterministically by slug.
 */
export function pickHashtags(slug: string): string[] {
  let hash = 0;
  for (const c of slug) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  const h = Math.abs(hash);

  const nicheCount = 2 + (h % 2); // 3 or 4 tags total, varies by post
  const mega = MEGA_HASHTAGS[h % MEGA_HASHTAGS.length];
  const niche = new Set<string>();
  let j = h >> 3;
  while (niche.size < nicheCount) {
    niche.add(NICHE_HASHTAGS[j % NICHE_HASHTAGS.length]);
    j++;
  }
  return [mega, ...niche];
}

// ONE question + hashtags, nothing else (2026-08-28, per Keenan). The
// old hook/ask/plug assembly is GONE — no bio plug on any post.
export function buildCaption(topic: CarouselTopic): string {
  const question =
    topic.captionQuestion?.trim() || pickBySlug(topic.slug, FALLBACK_QUESTIONS);
  return `${question}\n\n${pickHashtags(topic.slug).join(" ")}`;
}

/**
 * Caption for AMBIENT calm posts — same format as everything else
 * (2026-08-28, per Keenan: one thought-provoking question + a few
 * hashtags, all posts). The LLM writes the question (`caption`); the
 * commentPrompt/pool lines are fallbacks.
 */
export function buildAmbientCaption(opts: {
  slug: string;
  title: string;
  /** LLM-written thought-provoking question (entire caption body). */
  caption?: string;
  captionHook?: string;
  commentPrompt?: string;
}): string {
  const question =
    opts.caption?.trim() ||
    opts.commentPrompt?.trim().replace(/\s*👇\s*$/, "") ||
    pickBySlug(opts.slug, FALLBACK_QUESTIONS);
  return `${question}\n\n${pickHashtags(opts.slug).join(" ")}`;
}
