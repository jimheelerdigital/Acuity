/**
 * Content Factory — caption builder.
 *
 * Builds the carousel caption from headline + numbered reasons +
 * a fixed Ripple closing line + 6 hashtags.
 */

import type { CarouselTopic } from "./topics";

// Link-in-bio pointer added 2026-08-16: captions previously named the app
// with no path to it. The bio link should point at goripple.io/go/tiktok
// (or /go/instagram etc.) so social traffic is UTM-attributed.
const CLOSING_LINE =
  "Ripple — debrief daily. See your life clearly. Start your free week — link in bio. 🌊";

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
function pickHashtags(topic: { slug: string }): string[] {
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

/**
 * Caption for standalone STORY posts (2026-08-16). Stories are narrative,
 * not listicles — so the caption is a hook + a share-your-version question
 * instead of a numbered list + comment-gap bait.
 */
export function buildStoryCaption(opts: {
  slug: string;
  title: string;
  captionHook?: string;
  commentPrompt?: string;
}): string {
  const lines: string[] = [];
  lines.push(opts.captionHook?.trim() || opts.title);
  lines.push("");
  if (opts.commentPrompt) {
    const q = opts.commentPrompt.trim().replace(/\s*👇?\s*$/, "");
    lines.push(`${q} Tell me in the comments 👇`);
    lines.push("");
  }
  lines.push(pickBySlug(opts.slug, SAVE_SHARE_CTAS, 1));
  lines.push("");
  lines.push(CLOSING_LINE);
  lines.push("");
  lines.push(pickHashtags({ slug: opts.slug }).join(" "));
  return lines.join("\n");
}

// Reach-only hashtags for plug-free posts: no brand or product-category
// tags — these captions compete on relatability, not conversion.
const REACH_HASHTAGS = [
  "#mentalload",
  "#womenintheirmidlife",
  "#momlife",
  "#selfreflection",
  "#selfawareness",
  "#knowyourself",
  "#emotionalintelligence",
  "#innerwork",
  "#mindfulmoments",
  "#midlifeshift",
  "#burnoutrecovery",
  "#overthinkersclub",
  "#mentalhealthmatters",
  "#patternbreaker",
];

// Plain share lines for ambient captions (2026-08-19, per Keenan: the
// caption must lead with a QUESTION, read like a person wrote it, and
// keep emojis minimal). No "tell me in the comments 👇" boilerplate —
// the question itself does that work.
const AMBIENT_SHARE_LINES = [
  "Save this for the day you need it.",
  "Send this to someone who's carrying a lot right now.",
  "If this found you at the right time, pass it on.",
  "Save it. You'll want it again.",
];

/**
 * Caption for AMBIENT calm posts (2026-08-19, per Keenan: "this video is
 * NOT a plug for acuity — the goal is to build a following of our target
 * market"). No Ripple closing line, no branded hashtags. Structure:
 * question first (it's the only line visible in the feed), then the
 * hook line, then a plain share ask, then reach hashtags.
 */
export function buildAmbientCaption(opts: {
  slug: string;
  title: string;
  captionHook?: string;
  commentPrompt?: string;
}): string {
  const lines: string[] = [];

  // Lead with the question — it invites a comment without asking for one.
  const question = opts.commentPrompt?.trim().replace(/\s*👇\s*$/, "");
  const hook = opts.captionHook?.trim();
  if (question) {
    lines.push(question);
    lines.push("");
    if (hook && hook !== question) {
      lines.push(hook);
      lines.push("");
    }
  } else {
    lines.push(hook || opts.title);
    lines.push("");
  }
  lines.push(pickBySlug(opts.slug, AMBIENT_SHARE_LINES));
  lines.push("");

  let hash = 0;
  for (const c of opts.slug) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  const selected = new Set<string>();
  let i = Math.abs(hash);
  while (selected.size < 6) {
    selected.add(REACH_HASHTAGS[i % REACH_HASHTAGS.length]);
    i++;
  }
  lines.push([...selected].join(" "));
  return lines.join("\n");
}
