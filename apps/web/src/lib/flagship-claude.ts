import type Anthropic from "@anthropic-ai/sdk";

import { CLAUDE_FLAGSHIP_MAX_TOKENS, CLAUDE_FLAGSHIP_MODEL } from "@acuity/shared";

/**
 * Request + reply helpers for the flagship calls (Ask your past self, user
 * insights, Life Audit, State of Me). 2026-10-14, per Keenan: "change the
 * model from opus 4.7 to 5.5 low thinking" — 20% cheaper per token.
 *
 * Opus 5.5 differs from 4.7 in ways these calls hit:
 * - thinking is always on (it can't be disabled), and its tokens count
 *   toward max_tokens, so the answer budget gets headroom on top;
 * - effort is the depth control: "low" here;
 * - the reply opens with a thinking block, so the answer is read from the
 *   text blocks by type, never content[0].
 */
const THINKING_HEADROOM = 4_000;

export function flagshipRequest(
  params: Omit<Anthropic.MessageCreateParamsNonStreaming, "model" | "max_tokens">
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    ...params,
    model: CLAUDE_FLAGSHIP_MODEL,
    max_tokens: CLAUDE_FLAGSHIP_MAX_TOKENS + THINKING_HEADROOM,
    // output_config is newer than this SDK version's types; the API accepts it.
    output_config: { effort: "low" },
  } as unknown as Anthropic.MessageCreateParamsNonStreaming;
}

/** The answer text of a reply (all text blocks, skipping thinking). */
export function flagshipText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
