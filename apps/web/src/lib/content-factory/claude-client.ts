import Anthropic from "@anthropic-ai/sdk";

/**
 * One model for every piece of content-factory copy (2026-09-26, per
 * Keenan: "start writing in claude opus 5.5 ... then rewrite that makes
 * the copy sound human, and turn the research into topics. use opus 5.5
 * for everything script oriented"). Slide copy, the humanizer rewrite,
 * captions, research distillation, scripts, lane reports and the image
 * checks all go through contentAnthropic below, so the model is set in
 * exactly one place. CONTENT_CLAUDE_MODEL overrides it without a deploy.
 *
 * Opus 5.5 differs from the Sonnet 4.6 / Opus 4.6 calls this replaced:
 * - thinking is always on and its tokens count toward max_tokens, so the
 *   wrapper adds headroom on top of each caller's answer budget;
 * - effort (low / medium / high) is the only depth control;
 * - responses can open with thinking blocks — read text blocks by type
 *   (messageText), never content[0];
 * - temperature / top_p / top_k are rejected, so they're stripped.
 */
export const CONTENT_MODEL = (process.env.CONTENT_CLAUDE_MODEL || "claude-opus-5-5").trim();
/** Served when Opus 5.5 is unavailable to this key or declines a request. */
const FALLBACK_MODEL = "claude-opus-5";

// Opus 5.5 pricing: $4/M input, $20/M output.
export const CONTENT_INPUT_COST_PER_TOKEN = 4 / 1_000_000;
export const CONTENT_OUTPUT_COST_PER_TOKEN = 20 / 1_000_000;

export type ContentEffort = "low" | "medium" | "high";

/** Thinking budget added on top of the caller's max_tokens (answer size). */
const THINKING_HEADROOM: Record<ContentEffort, number> = {
  low: 4_000,
  medium: 10_000,
  high: 20_000,
};

type CreateParams = Omit<Anthropic.MessageCreateParamsNonStreaming, "model"> & {
  model?: string;
  /** Default "medium" (writing). Checks and rewrites pass "low". */
  effort?: ContentEffort;
};

const base = new Anthropic();

function modelUnavailable(err: unknown): boolean {
  if (err instanceof Anthropic.NotFoundError) return true;
  return err instanceof Anthropic.BadRequestError && /model/i.test(err.message);
}

async function create(params: CreateParams): Promise<Anthropic.Message> {
  const {
    effort = "medium",
    max_tokens,
    model: _model,
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

  let res: Anthropic.Message;
  try {
    res = await base.messages.create(body(CONTENT_MODEL));
  } catch (err) {
    if (CONTENT_MODEL === FALLBACK_MODEL || !modelUnavailable(err)) throw err;
    console.warn(
      `[content-claude] ${CONTENT_MODEL} unavailable (${err instanceof Error ? err.message : err}) — using ${FALLBACK_MODEL}`
    );
    return base.messages.create(body(FALLBACK_MODEL));
  }
  if ((res as { stop_reason?: string }).stop_reason === "refusal" && CONTENT_MODEL !== FALLBACK_MODEL) {
    console.warn(`[content-claude] ${CONTENT_MODEL} declined — retrying on ${FALLBACK_MODEL}`);
    res = await base.messages.create(body(FALLBACK_MODEL));
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
