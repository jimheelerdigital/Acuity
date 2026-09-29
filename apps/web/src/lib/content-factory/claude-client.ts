import Anthropic from "@anthropic-ai/sdk";

/**
 * One model for every piece of content-factory copy (2026-09-26, per
 * Keenan: "start writing in claude opus 5.5 ... then rewrite that makes
 * the copy sound human, and turn the research into topics. use opus 5.5
 * for everything script oriented"). Slide copy, the humanizer rewrite,
 * captions, research distillation, scripts, lane reports and the image
 * checks all go through contentAnthropic below, so the model is set in
 * exactly one place. CONTENT_CLAUDE_MODEL overrides it without a deploy.
 * Since 2026-09-28 the writing model is Sonnet 5.5 and the image checks
 * pass model: VISION_MODEL (Opus 5.5).
 *
 * Opus 5.5 / Sonnet 5.5 differ from the Sonnet 4.6 / Opus 4.6 calls this replaced:
 * - thinking is always on and its tokens count toward max_tokens, so the
 *   wrapper adds headroom on top of each caller's answer budget;
 * - effort (low / medium / high) is the only depth control;
 * - responses can open with thinking blocks — read text blocks by type
 *   (messageText), never content[0];
 * - temperature / top_p / top_k are rejected, so they're stripped.
 */
// 2026-09-28 (per Keenan: "change script writing to sonnet 5.5 across all
// script writing"): Sonnet 5.5, released that day — $2/$10 per MTok, half
// of Opus 5.5 and faster. Same request surface as Opus 5.5 for these calls
// (adaptive thinking on by default, no sampling params, effort explicit).
export const CONTENT_MODEL = (process.env.CONTENT_CLAUDE_MODEL || "claude-sonnet-5-5").trim();
/**
 * The image checks (checkMoodyImageQuality, verifyBakedQuote) stay on Opus
 * 5.5 — judging an image isn't script writing, and Opus is the stronger
 * judge of CGI looks and garbled detail.
 */
export const VISION_MODEL = (process.env.CONTENT_VISION_MODEL || "claude-opus-5-5").trim();

/** Previous generation of the same tier, if a model is unavailable or declines. */
function fallbackFor(model: string): string | null {
  if (model.startsWith("claude-sonnet-5-5")) return "claude-sonnet-5";
  if (model.startsWith("claude-opus-5-5")) return "claude-opus-5";
  return null;
}

// Sonnet 5.5 pricing: $2/M input, $10/M output.
export const CONTENT_INPUT_COST_PER_TOKEN = 2 / 1_000_000;
export const CONTENT_OUTPUT_COST_PER_TOKEN = 10 / 1_000_000;

export type ContentEffort = "low" | "medium" | "high";

/** Thinking budget added on top of the caller's max_tokens (answer size). */
const THINKING_HEADROOM: Record<ContentEffort, number> = {
  low: 4_000,
  medium: 10_000,
  high: 20_000,
};

type CreateParams = Omit<Anthropic.MessageCreateParamsNonStreaming, "model"> & {
  model?: string;
  /**
   * Default "high" — Anthropic's starting point for Sonnet 5.5 on
   * non-latency-sensitive work like copywriting (2026-09-28). Checks and
   * the humanizer rewrite pass "low".
   */
  effort?: ContentEffort;
};

const base = new Anthropic();

function modelUnavailable(err: unknown): boolean {
  if (err instanceof Anthropic.NotFoundError) return true;
  return err instanceof Anthropic.BadRequestError && /model/i.test(err.message);
}

async function create(params: CreateParams): Promise<Anthropic.Message> {
  const {
    effort = "high",
    max_tokens,
    model: requested,
    temperature: _temperature,
    top_p: _topP,
    top_k: _topK,
    ...rest
  } = params;
  const body = (model: string) =>
    ({
      ...rest,
      model,
      max_tokens: max_tokens + THINKING_HEADROOM[effort],
      // output_config is newer than this SDK version's types; the API accepts it.
      output_config: { effort },
    }) as unknown as Anthropic.MessageCreateParamsNonStreaming;

  const model = requested ?? CONTENT_MODEL;
  const fallback = fallbackFor(model);
  let res: Anthropic.Message;
  try {
    res = await base.messages.create(body(model));
  } catch (err) {
    if (!fallback || !modelUnavailable(err)) throw err;
    console.warn(
      `[content-claude] ${model} unavailable (${err instanceof Error ? err.message : err}) — using ${fallback}`
    );
    return base.messages.create(body(fallback));
  }
  if ((res as { stop_reason?: string }).stop_reason === "refusal" && fallback) {
    console.warn(`[content-claude] ${model} declined — retrying on ${fallback}`);
    res = await base.messages.create(body(fallback));
  }
  return res;
}

/** Drop-in for `new Anthropic()` in content-factory code: same messages.create shape. */
export const contentAnthropic = { messages: { create } };

/** All text blocks joined — thinking blocks are skipped. */
export function messageText(res: Anthropic.Message): string {
  return res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
}

interface CallClaudeParams {
  purpose: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  effort?: ContentEffort;
}

/**
 * Blog / SEO / AdLab callers (auto-blog, blog triage, fix-years, AdLab
 * routes) stay on Opus 4.6 — they write long articles inside 300s steps,
 * and the 2026-09-26 switch covered the social pipeline only. Social
 * callers use callContentClaude (Opus 5.5).
 */
const LEGACY_MODEL = "claude-opus-4-6";
// Opus 4.6 pricing: $5/M input, $25/M output (was logged at the old $15/$75).
const LEGACY_INPUT_COST_PER_TOKEN = 5 / 1_000_000;
const LEGACY_OUTPUT_COST_PER_TOKEN = 25 / 1_000_000;

export function callClaude(params: CallClaudeParams): Promise<string> {
  return loggedCall(params, false);
}

/** callClaude on the content model (Opus 5.5) — every social-pipeline caller. */
export function callContentClaude(params: CallClaudeParams): Promise<string> {
  return loggedCall(params, true);
}

async function loggedCall(params: CallClaudeParams, content: boolean): Promise<string> {
  const { purpose, systemPrompt, userPrompt, maxTokens = 4000, effort } = params;
  const model = content ? CONTENT_MODEL : LEGACY_MODEL;
  const { prisma } = await import("@/lib/prisma");

  const start = Date.now();
  try {
    const request = {
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user" as const, content: userPrompt }],
    };
    const response = content
      ? await contentAnthropic.messages.create({ ...request, effort })
      : await base.messages.create({ ...request, model: LEGACY_MODEL });

    const durationMs = Date.now() - start;
    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    const costCents = Math.ceil(
      (content
        ? tokensIn * CONTENT_INPUT_COST_PER_TOKEN + tokensOut * CONTENT_OUTPUT_COST_PER_TOKEN
        : tokensIn * LEGACY_INPUT_COST_PER_TOKEN + tokensOut * LEGACY_OUTPUT_COST_PER_TOKEN) * 100
    );

    await prisma.claudeCallLog.create({
      data: {
        purpose,
        model,
        tokensIn,
        tokensOut,
        costCents,
        durationMs,
        success: true,
      },
    });

    return messageText(response);
  } catch (err) {
    const durationMs = Date.now() - start;
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error";

    await prisma.claudeCallLog.create({
      data: {
        purpose,
        model,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        durationMs,
        success: false,
        errorMessage,
      },
    });

    throw err;
  }
}

/**
 * The JSON answer inside a model reply (2026-09-28, Sonnet 5.5 prompting
 * guide): asked for JSON in the prompt, Sonnet 5.5 / Opus 5.5 sometimes
 * work the problem out in text first and write the JSON LAST, or draft a
 * value before the final one. Parsing the whole reply (or first "{" to
 * last "}") then fails or grabs the draft. This returns the source text of
 * the LAST complete top-level JSON value; the input unchanged if none
 * parses, so the caller's JSON.parse still throws its usual error.
 */
export function lastJsonText(reply: string): string {
  const text = reply.replace(/```(?:json)?/g, "");
  let last: string | null = null;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch !== "{" && ch !== "[") {
      i++;
      continue;
    }
    const end = matchingBracket(text, i);
    if (end > i) {
      const candidate = text.slice(i, end + 1);
      try {
        JSON.parse(candidate);
        last = candidate;
        i = end + 1; // values nested inside this one don't count on their own
        continue;
      } catch {
        // not valid JSON from here — keep scanning
      }
    }
    i++;
  }
  return last ?? reply.trim();
}

/** Index of the bracket closing the one at `start`, string-aware; -1 if unbalanced. */
function matchingBracket(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
