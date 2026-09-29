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

async function callOnce(params: Omit<AdLabClaudeParams, "models"> & { model: string }): Promise<string> {
  const { purpose, systemPrompt, userPrompt, maxTokens = 4000, model, outputTool } = params;
  const { prisma } = await import("@/lib/prisma");

  console.log(`[adlab-claude] Calling model=${model} purpose=${purpose} maxTokens=${maxTokens}`);
  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
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
    });

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

    if (outputTool) {
      const tool = response.content.find((b) => b.type === "tool_use") as { input?: unknown } | undefined;
      if (tool?.input) return JSON.stringify(tool.input);
      console.warn(`[adlab-claude] ${purpose}: no ${outputTool.name} tool call (stop_reason: ${response.stop_reason}) — parsing text`);
    }

    return response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
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
