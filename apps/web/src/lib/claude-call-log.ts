import type Anthropic from "@anthropic-ai/sdk";

import { safeLog } from "@/lib/safe-log";

/**
 * ClaudeCallLog for the product's own AI calls (2026-10-18, audit
 * 2026-10-17 "Unlogged AI cost").
 *
 * The content factory, AdLab and MRI already wrote ClaudeCallLog rows; the
 * calls that cost money PER USER did not: extraction (pipeline.ts), memory,
 * free-tier summaries, people NER, the weekly report, and the four Opus 5.5
 * flagship features (Ask your past, weekly user insights, Life Audit,
 * State of Me). So `claude_call_log.user_attributed_usd` read $0.
 *
 * `loggedMessagesCreate` wraps `anthropic.messages.create` for a
 * non-streaming call: times it, prices it from the model's list price, and
 * writes one row — success or failure — tagged with purpose + userId. The
 * log write never throws into the caller; a failed log is a safeLog.warn.
 */

/**
 * USD per million tokens, copied from the official table at
 * https://platform.claude.com/docs/en/about-claude/pricing (read 2026-10-18).
 * Cache writes (5-minute) bill at 1.25x input on every model; cache reads at
 * 0.1x input, except Opus 5.5 and Sonnet 5.5 at 0.05x. Order matters: the
 * first match wins, so "-5-5" rows sit above their "-5" siblings.
 * Haiku 5.5 is tiered by prompt length and isn't used by the product, so it
 * is deliberately absent (an unknown model logs a warning, see priceFor).
 */
const PRICE_PER_MTOK: Array<{ match: RegExp; input: number; output: number; cacheRead: number }> = [
  { match: /^claude-opus-5-5/, input: 4, output: 20, cacheRead: 0.05 },
  { match: /^claude-opus-5(?!-5)/, input: 5, output: 25, cacheRead: 0.1 },
  { match: /^claude-sonnet-5-5/, input: 2, output: 10, cacheRead: 0.05 },
  { match: /^claude-sonnet-5(?!-5)/, input: 2, output: 10, cacheRead: 0.1 },
  { match: /^claude-sonnet-4-6/, input: 3, output: 15, cacheRead: 0.1 },
  { match: /^claude-haiku-4-5/, input: 1, output: 5, cacheRead: 0.1 },
  { match: /^claude-opus-4-[5-8]/, input: 5, output: 25, cacheRead: 0.1 },
  // Opus 4 and 4.1, bare or dated ("claude-opus-4-20250514").
  { match: /^claude-opus-4(-1)?($|-\d{8})/, input: 15, output: 75, cacheRead: 0.1 },
];
const CACHE_WRITE_FACTOR = 1.25;

export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** Price for a model, or Sonnet 4.6 rates when the model is unknown (logClaudeCall warns). */
export function priceFor(model: string): { input: number; output: number; cacheRead: number; known: boolean } {
  const hit = PRICE_PER_MTOK.find((p) => p.match.test(model));
  if (hit) return { input: hit.input, output: hit.output, cacheRead: hit.cacheRead, known: true };
  // Unknown model: price as Sonnet 4.6 so the row isn't $0, and warn.
  return { input: 3, output: 15, cacheRead: 0.1, known: false };
}

/** Whole cents, rounded up so a one-token call is never free. */
export function costCentsFor(model: string, usage: UsageLike): number {
  const p = priceFor(model);
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const usd =
    (usage.input_tokens * p.input +
      cacheRead * p.input * p.cacheRead +
      cacheWrite * p.input * CACHE_WRITE_FACTOR +
      usage.output_tokens * p.output) /
    1_000_000;
  return usd > 0 ? Math.max(1, Math.ceil(usd * 100)) : 0;
}

export interface LogClaudeCallInput {
  purpose: string;
  model: string;
  usage: UsageLike | null;
  durationMs: number;
  success: boolean;
  errorMessage?: string | null;
  userId?: string | null;
}

/** Write the row. Never throws. */
export async function logClaudeCall(input: LogClaudeCallInput): Promise<void> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const usage = input.usage ?? { input_tokens: 0, output_tokens: 0 };
    const tokensIn =
      usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
    await prisma.claudeCallLog.create({
      data: {
        purpose: input.purpose,
        model: input.model,
        tokensIn,
        tokensOut: usage.output_tokens,
        costCents: costCentsFor(input.model, usage),
        durationMs: Math.max(0, Math.round(input.durationMs)),
        success: input.success,
        errorMessage: input.errorMessage ? String(input.errorMessage).slice(0, 500) : null,
        userId: input.userId ?? null,
      },
    });
    if (!priceFor(input.model).known) {
      safeLog.warn("claude-call-log.unknown-model-price", { model: input.model, purpose: input.purpose });
    }
  } catch (err) {
    safeLog.warn("claude-call-log.write-failed", {
      purpose: input.purpose,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

type MessagesClient = { messages: { create: Anthropic["messages"]["create"] } };

/**
 * `anthropic.messages.create(params)` with a ClaudeCallLog row around it.
 * Non-streaming calls only (we need the final `usage`). The error path logs
 * a failed row (0 tokens) and rethrows unchanged.
 */
export async function loggedMessagesCreate(
  client: MessagesClient,
  params: Anthropic.MessageCreateParamsNonStreaming,
  meta: { purpose: string; userId?: string | null }
): Promise<Anthropic.Message> {
  const startedAt = Date.now();
  try {
    const message = (await client.messages.create(params)) as Anthropic.Message;
    await logClaudeCall({
      purpose: meta.purpose,
      model: message.model || params.model,
      usage: message.usage,
      durationMs: Date.now() - startedAt,
      success: true,
      userId: meta.userId,
    });
    return message;
  } catch (err) {
    await logClaudeCall({
      purpose: meta.purpose,
      model: params.model,
      usage: null,
      durationMs: Date.now() - startedAt,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
      userId: meta.userId,
    });
    throw err;
  }
}
