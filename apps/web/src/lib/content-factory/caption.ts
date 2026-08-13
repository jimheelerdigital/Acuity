/**
 * Content Factory — caption builder.
 *
 * Builds the carousel caption from headline + numbered reasons +
 * a fixed Ripple closing line + 6 hashtags.
 */

import type { CarouselTopic } from "./topics";

const CLOSING_LINE = "Ripple — debrief daily. See your life clearly. 🌊";

// First caption line (2026-08-12, per Keenan): only this line shows in
// the feed before "...more", so it must be a SECOND hook — never a
// restatement of the headline the cover already shows. {n} is replaced
// with a deterministic reason number so the tease is specific.
const FIRST_LINE_HOOKS = [
  "Number {n} is the one nobody says out loud.",
  "You'll want to argue with number {n}. That's the point.",
  "Be honest with yourself about number {n}.",
  "The last one is the one you'll send her.",
  "If nobody's said it to you today — this is for you.",
  "Read number {n} twice.",
];

// Natural-language keyword line for Instagram caption search (captions
// are indexed now) — free discovery for the exact phrases our audience
// actually types.
const SEO_LINE =
  "For women in their 40s carrying the mental load — burnout, invisible labor, overthinking, and finally hearing yourself again.";

// Engagement CTAs — every caption asks for a comment, a save, and a
// share. These three signals outrank likes in the algorithm. One line
// is picked per pool, deterministically by slug, so captions vary
// across posts but stay stable per post.
const COMMENT_CTAS = [
  "Which one is you? Drop the number 👇",
  "Which one hit hardest? Tell me the number 👇",
  "Be honest — which number called you out? 👇",
  "If you made it to the last one, tell me which was yours 👇",
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
      "Which one called you out?",
    ],
  },
  {
    match: /\blies\b/i,
    lines: [
      "Which one do you tell the most?",
      "Which one did you tell today?",
      "Which one felt personal?",
    ],
  },
  {
    match: /\breminders?\b/i,
    lines: [
      "Which one did you need today?",
      "Which one are you keeping?",
      "Which one hit home?",
    ],
  },
  {
    match: /\bquestions?\b/i,
    lines: [
      "Which one are you avoiding?",
      "Which one stopped you?",
      "Which one can't you answer?",
    ],
  },
  {
    match: /\bhabits?\b/i,
    lines: [
      "Which one is yours?",
      "Which one hits the hardest?",
      "Which one called you out?",
    ],
  },
];

const ENGAGEMENT_LINES_DEFAULT = [
  "Which one hits the hardest?",
  "Which one is you?",
  "Which one hit home?",
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

const SAVE_SHARE_CTAS = [
  "Save this for the week you need the reminder. Send it to the friend who needs it today. 🤍",
  "Save this — you'll want it again. And send it to her. You know who. 🤍",
  "Keep this one. Share it with the friend who never puts herself first. 🤍",
  "Save it for your next hard day — and pass it to the one carrying too much. 🤍",
];

function pickBySlug(slug: string, pool: string[], offset = 0): string {
  let hash = 0;
  for (const c of slug) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  return pool[(Math.abs(hash) + offset) % pool.length];
}

const HASHTAG_POOL = [
  "#mentalload",
  "#selfawareness",
  "#voicejournal",
  "#selfreflection",
  "#rippleapp",
  "#knowyourself",
  "#dailydebrief",
  "#womenintheirmidlife",
  "#momlife",
  "#patternbreaker",
  "#emotionalintelligence",
  "#innerwork",
  "#mindfulmoments",
  "#midlifeshift",
  "#burnoutrecovery",
  "#overthinkersclub",
  "#mentalhealthmatters",
  "#journaling",
  "#carouselpost",
];

/**
 * Pick 6 hashtags: always include #rippleapp and #voicejournal,
 * then fill with topic-relevant ones from the pool.
 */
function pickHashtags(topic: CarouselTopic): string[] {
  const must = ["#rippleapp", "#voicejournal"];
  const pool = HASHTAG_POOL.filter((h) => !must.includes(h));

  // Simple deterministic selection based on slug hash so the same topic
  // always gets the same hashtags (no randomness in generation).
  let hash = 0;
  for (const c of topic.slug) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;

  const selected = new Set(must);
  let i = Math.abs(hash);
  while (selected.size < 6) {
    selected.add(pool[i % pool.length]);
    i++;
  }

  return [...selected];
}

export function buildCaption(topic: CarouselTopic): string {
  const lines: string[] = [];

  // First line = second hook (the only line visible before "...more").
  // {n} points at a deterministic mid-list reason so the tease is real.
  const teaseN = Math.min(
    topic.reasons.length,
    2 + (Math.abs(topic.slug.length * 7) % Math.max(1, topic.reasons.length - 1))
  );
  lines.push(
    pickBySlug(topic.slug, FIRST_LINE_HOOKS, 2).replace("{n}", String(teaseN))
  );
  lines.push("");

  // Headline
  lines.push(topic.headline);
  lines.push("");

  // Numbered reasons
  topic.reasons.forEach((reason, i) => {
    lines.push(`${i + 1}. ${reason}`);
  });

  lines.push("");
  lines.push(pickBySlug(topic.slug, COMMENT_CTAS));
  lines.push("");
  lines.push(pickBySlug(topic.slug, SAVE_SHARE_CTAS, 1));
  lines.push("");
  lines.push(CLOSING_LINE);
  lines.push("");
  lines.push(SEO_LINE);
  lines.push("");

  // Hashtags
  const tags = pickHashtags(topic);
  lines.push(tags.join(" "));

  return lines.join("\n");
}
