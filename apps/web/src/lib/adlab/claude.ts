/**
 * AdLab-specific Claude caller. Uses claude-sonnet-4-6 unless a call passes
 * `models` (the weekly ad copy uses AD_COPY_MODELS)
 * and logs all calls to ClaudeCallLog with "adlab-*" purpose prefixes.
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

// Sonnet pricing: $3/M input, $15/M output
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

interface AdLabClaudeParams {
  purpose: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  /** Models to try in order; the next is used only if the API says a model
   *  doesn't exist (404). Defaults to the legacy single model. */
  models?: string[];
  /** Structured output (2026-09-29): force a tool call with this JSON schema
   *  and return the tool input as JSON text (valid by construction). The
   *  first Sonnet 5.5 weekly batches failed on an unescaped quote. Offered
   *  with tool_choice auto (5.5 can't be forced); falls back to text. */
  outputTool?: { name: string; description: string; schema: Record<string, unknown> };
}

/** Weekly ad copy (2026-09-29, per Keenan: use Sonnet 5.5). Falls back to
 *  Sonnet 5 if 5.5 isn't available to this API key. */
export const AD_COPY_MODELS = ["claude-sonnet-5-5", "claude-sonnet-5"];

export async function callAdLabClaude(params: AdLabClaudeParams): Promise<string> {
  const { models = ["claude-sonnet-4-6"], ...rest } = params;
  for (let i = 0; i < models.length; i++) {
    try {
      return await callOnce({ ...rest, model: models[i] });
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 404 && i < models.length - 1) {
        console.warn(`[adlab-claude] model ${models[i]} not available — falling back to ${models[i + 1]}`);
        continue;
      }
      throw err;
    }
  }
  throw new Error("no model available");
}

/** The Messages request body for one call (shared by live calls and batches). */
function requestParams(params: Omit<AdLabClaudeParams, "models" | "purpose"> & { model: string }): Anthropic.MessageCreateParamsNonStreaming {
  const { systemPrompt, userPrompt, maxTokens = 4000, model, outputTool } = params;
  return {
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    ...(outputTool
      ? {
          // "auto", not a forced tool: Sonnet 5.5 rejects tool_choice
          // type "tool"/"any" (400, 2026-09-29). The prompt tells it to use
          // the tool; a plain-text reply falls through to text parsing.
          tools: [{ name: outputTool.name, description: outputTool.description, input_schema: outputTool.schema as { type: "object" } }],
          tool_choice: { type: "auto" as const },
        }
      : {}),
  };
}

/** The reply as text: the output tool's input as JSON when asked for, else the text blocks. */
function replyText(
  response: Anthropic.Message,
  params: Pick<AdLabClaudeParams, "purpose" | "maxTokens" | "outputTool">
): string {
  const { purpose, maxTokens = 4000, outputTool } = params;
  if (outputTool) {
    // A reply cut off at the token cap is never usable, even if a partial
    // tool call made it in (2026-09-29: every 10-ad Sonnet 5.5 reply hit it).
    if (response.stop_reason === "max_tokens") {
      throw new Error(`reply cut off at ${maxTokens} tokens (${outputTool.name})`);
    }
    const tool = response.content.find((b) => b.type === "tool_use") as { input?: unknown } | undefined;
    if (tool?.input) return JSON.stringify(tool.input);
    console.warn(`[adlab-claude] ${purpose}: no ${outputTool.name} tool call (stop_reason: ${response.stop_reason}) — parsing text`);
  }
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("");
}

async function callOnce(params: Omit<AdLabClaudeParams, "models"> & { model: string }): Promise<string> {
  const { purpose, maxTokens = 4000, model } = params;
  const { prisma } = await import("@/lib/prisma");

  console.log(`[adlab-claude] Calling model=${model} purpose=${purpose} maxTokens=${maxTokens}`);
  const start = Date.now();
  try {
    const response = await anthropic.messages.create(requestParams(params));

    const durationMs = Date.now() - start;
    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    const costCents = Math.ceil(
      (tokensIn * INPUT_COST_PER_TOKEN + tokensOut * OUTPUT_COST_PER_TOKEN) * 100
    );

    await prisma.claudeCallLog.create({
      data: {
        purpose: `adlab-${purpose}`,
        model,
        tokensIn,
        tokensOut,
        costCents,
        durationMs,
        success: true,
      },
    });

    return replyText(response, params);
  } catch (err) {
    console.error(`[adlab-claude] Call failed: model=${model} purpose=${purpose}`, err instanceof Error ? err.message : err);
    const durationMs = Date.now() - start;
    await prisma.claudeCallLog.create({
      data: {
        purpose: `adlab-${purpose}`,
        model,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        durationMs,
        success: false,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      },
    });
    throw err;
  }
}

// ─── Message Batches (2026-10-14, per Keenan: "push the sunday ad drafts to
// saturday and then batch it for Monday") ─────────────────────────────────
// Half price for work that can wait. Results usually come back within an
// hour and always within 24h. This SDK version (0.27) predates the batches
// helpers, so the endpoints are called through the same client's generic
// post/get (same auth, headers and retries as every other call).

export interface AdLabBatchItem extends Omit<AdLabClaudeParams, "models"> {
  /** Unique within the batch; results are matched by it (they come back in any order). */
  customId: string;
  model: string;
}

/** Submit the items as one Message Batch. Returns the batch id. */
export async function submitAdLabBatch(items: AdLabBatchItem[]): Promise<string> {
  const requests = items.map(({ customId, ...p }) => ({ custom_id: customId, params: requestParams(p) }));
  const batch = await anthropic.post<unknown, { id: string }>("/v1/messages/batches", { body: { requests } });
  console.log(`[adlab-claude] batch ${batch.id} submitted: ${items.map((i) => i.purpose).join(", ")}`);
  return batch.id;
}

/** "in_progress" | "canceling" | "ended". */
export async function adLabBatchStatus(batchId: string): Promise<string> {
  const batch = await anthropic.get<unknown, { processing_status: string }>(`/v1/messages/batches/${batchId}`);
  return batch.processing_status;
}

/**
 * The finished batch's replies as text, keyed by customId, each logged to
 * ClaudeCallLog at batch price (50% off) with a "-batch" purpose suffix.
 * An errored, expired or unusable item is left out, so its caller falls back
 * to a live call.
 */
export async function adLabBatchResults(batchId: string, items: AdLabBatchItem[]): Promise<Record<string, string>> {
  const { prisma } = await import("@/lib/prisma");
  const byId = new Map(items.map((i) => [i.customId, i]));
  const res = await anthropic.get(`/v1/messages/batches/${batchId}/results`).asResponse();
  const out: Record<string, string> = {};
  for (const line of (await res.text()).split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as { custom_id: string; result: { type: string; message?: Anthropic.Message } };
    const item = byId.get(row.custom_id);
    if (!item) continue;
    if (row.result.type !== "succeeded" || !row.result.message) {
      console.warn(`[adlab-claude] batch ${batchId} ${item.purpose}: ${row.result.type}`);
      continue;
    }
    const message = row.result.message;
    const tokensIn = message.usage.input_tokens;
    const tokensOut = message.usage.output_tokens;
    await prisma.claudeCallLog.create({
      data: {
        purpose: `adlab-${item.purpose}-batch`,
        model: item.model,
        tokensIn,
        tokensOut,
        costCents: Math.ceil(((tokensIn * INPUT_COST_PER_TOKEN + tokensOut * OUTPUT_COST_PER_TOKEN) / 2) * 100),
        durationMs: 0,
        success: true,
      },
    });
    try {
      out[row.custom_id] = replyText(message, item);
    } catch (err) {
      console.warn(`[adlab-claude] batch ${batchId} ${item.purpose}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return out;
}

/**
 * Extract JSON from a Claude response that may include markdown fences.
 */
export function extractJson(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const bracketMatch = raw.match(/\[[\s\S]*\]/);
  if (bracketMatch) return bracketMatch[0];
  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];
  return raw.trim();
}

/**
 * Like extractJson, but for a top-level OBJECT. extractJson tries `[...]`
 * before `{...}`, so an unfenced object containing arrays comes back as an
 * inner array fragment.
 */
export function extractJsonObject(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenceMatch ? fenceMatch[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body.trim();
}
