/**
 * Content Factory — caption builder.
 *
 * Builds the carousel caption from headline + numbered reasons +
 * a fixed Ripple closing line + 6 hashtags.
 */

import type { CarouselTopic } from "./topics";

const CLOSING_LINE = "Ripple — debrief daily. See your life clearly. 🌊";

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
  lines.push(CLOSING_LINE);
  lines.push("");

  // Hashtags
  const tags = pickHashtags(topic);
  lines.push(tags.join(" "));

  return lines.join("\n");
}
