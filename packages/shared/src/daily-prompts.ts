/**
 * Library of daily journal prompts shown in the "Try this today" card
 * on Home when we don't have a personalized Claude-generated prompt.
 *
 * Selection is deterministic per-day per-user via a small hash:
 * `pickDailyPrompt(userId, date)` always returns the same prompt for
 * the same (userId, YYYY-MM-DD) pair. Cheap + stable, no Redis cache
 * needed for the library path. The personalized-from-Claude path is
 * layered on top and memoized separately.
 *
 * Tone: open-ended, non-judgmental, NOT prescriptive. Every prompt
 * is answerable in 60 seconds of talking. Tested against the "would
 * a therapist ask this?" bar, not the "would a self-help book say
 * this?" bar.
 */
export const DAILY_PROMPTS: string[] = [
  "What's been on your mind that you haven't said out loud?",
  "Describe a moment from today that surprised you.",
  "What would you tell yourself from a week ago?",
  "What are you avoiding that you know you need to face?",
  "Who did you think about today that you haven't talked to in a while?",
  "What's something small that made today feel like today?",
  "If this week had a soundtrack, what would be playing?",
  "What are you tired of explaining to other people?",
  "What pattern did you notice in yourself this week?",
  "What does your body feel like right now?",
  "What would you do with an extra free hour tomorrow?",
  "What part of your day do you wish you could rewind?",
  "What's a recurring thought you can't quite place?",
  "What did you learn about yourself today that you didn't know yesterday?",
  "What would someone who knows you well say you're actually working on?",
  "Where did your attention keep wandering today?",
  "What's something you used to believe that you don't anymore?",
  "What's bubbling up that you haven't made time to sit with?",
  "What choice are you sitting on?",
  "What went well today that you might not have noticed in the moment?",
];

/**
 * Deterministic pick. Same (userId, dateKey) → same prompt. A new
 * calendar day rolls to the next prompt in the sequence so a user
 * recording daily sees variety.
 */
export function pickDailyPrompt(userId: string, dateKey: string): string {
  const input = `${userId}:${dateKey}`;
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = Math.abs(h) % DAILY_PROMPTS.length;
  return DAILY_PROMPTS[idx];
}
