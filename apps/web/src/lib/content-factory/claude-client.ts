import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

interface CallClaudeParams {
  purpose: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

// Opus pricing: $15/M input, $75/M output
const INPUT_COST_PER_TOKEN = 15 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 75 / 1_000_000;

export async function callClaude(params: CallClaudeParams): Promise<string> {
  const { purpose, systemPrompt, userPrompt, maxTokens = 4000 } = params;
  const model = "claude-opus-4-6";
  const { prisma } = await import("@/lib/prisma");

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
        purpose,
        model,
        tokensIn,
        tokensOut,
        costCents,
        durationMs,
        success: true,
      },
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    return text;
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
