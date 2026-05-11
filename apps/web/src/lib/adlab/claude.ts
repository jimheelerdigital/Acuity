/**
 * AdLab-specific Claude caller. Uses claude-sonnet-4-5 (cheaper than Opus)
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
}

export async function callAdLabClaude(params: AdLabClaudeParams): Promise<string> {
  const { purpose, systemPrompt, userPrompt, maxTokens = 4000 } = params;
  const model = "claude-sonnet-4-5-20241022";
  const { prisma } = await import("@/lib/prisma");

  console.log(`[adlab-claude] Calling model=${model} purpose=${purpose} maxTokens=${maxTokens}`);
  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
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
