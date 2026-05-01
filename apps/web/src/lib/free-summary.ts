import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { CLAUDE_HAIKU_MAX_TOKENS, CLAUDE_HAIKU_MODEL } from "@acuity/shared";

/**
 * FREE-tier one-sentence summary. v1.1 free-tier redesign — FREE
 * recordings get Whisper transcript + a tiny Haiku summary, then
 * short-circuit the rest of the extraction pipeline (no themes,
 * tasks, goals, lifeAreaMentions, embeddings).
 *
 * Cost: ~$0.0007 per call at our prompt sizes (vs ~$0.011 for the
 * full Sonnet extraction). See docs/v1-1/free-tier-phase2-plan.md §2.
 *
 * 30s timeout matches pipeline.ts. Throws on failure — caller (the
 * Inngest step) decides whether to retry. The persisted transcript
 * means a Haiku failure leaves a recoverable state: the user's words
 * are saved; the summary can be filled in later.
 */
const SDK_TIMEOUT_MS = 30_000;
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: SDK_TIMEOUT_MS,
});

const SYSTEM_PROMPT =
  "You write one short, plain-English sentence summarizing a voice debrief. " +
  "No metadata, no analysis, no quotes. Just the sentence — under 25 words.";

export async function summarizeForFreeTier(transcript: string): Promise<string> {
  const cleaned = transcript.trim();
  if (cleaned.length === 0) {
    throw new Error("summarizeForFreeTier: empty transcript");
  }

  const res = await anthropic.messages.create({
    model: CLAUDE_HAIKU_MODEL,
    max_tokens: CLAUDE_HAIKU_MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: cleaned }],
  });

  const block = res.content[0];
  if (!block || block.type !== "text") {
    throw new Error("summarizeForFreeTier: no text block in Haiku response");
  }
  const summary = block.text.trim();
  if (summary.length === 0) {
    throw new Error("summarizeForFreeTier: empty Haiku response");
  }
  return summary;
}
