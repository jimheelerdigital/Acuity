/**
 * Content Factory — caption builder.
 *
 * Builds the carousel caption from headline + numbered reasons +
 * a fixed Ripple closing line + 6 hashtags.
 */

import type { CarouselTopic } from "./topics";

const CLOSING_LINE = "Ripple — debrief daily. See your life clearly. 🌊";

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

  // Hashtags
  const tags = pickHashtags(topic);
  lines.push(tags.join(" "));

  return lines.join("\n");
}
