/**
 * Model calls for UGC outreach, with cost returned to the caller so each run
 * can report what it spent. Every call is logged to ClaudeCallLog
 * (purpose "ugc:<step>") like the rest of the repo.
 *
 * Haiku 4.5 (rough filter) goes straight through the SDK; the 5.5 models go
 * through contentAnthropic (claude-client.ts) for its thinking headroom,
 * effort control and fallback.
 */
import Anthropic from "@anthropic-ai/sdk";

import { contentAnthropic, lastJsonText, messageText, type ContentEffort } from "@/lib/content-factory/claude-client";
import { MODEL_PRICES } from "@/lib/ugc/config";

export type UserContent = string | Anthropic.MessageParam["content"];

export async function callUgcModel(params: {
  purpose: string;
  model: string;
  system: string;
  user: UserContent;
  maxTokens: number;
  effort?: ContentEffort;
}): Promise<{ text: string; costUsd: number }> {
  const { prisma } = await import("@/lib/prisma");
  const start = Date.now();
  const is5x = /-5(-5)?$/.test(params.model);
  try {
    const request = {
      max_tokens: params.maxTokens,
      system: params.system,
      messages: [{ role: "user" as const, content: params.user }],
    };
    const res = is5x
      ? await contentAnthropic.messages.create({ ...request, model: params.model, effort: params.effort ?? "low" })
      : await new Anthropic().messages.create({ ...request, model: params.model });
    const price = MODEL_PRICES[res.model] ?? MODEL_PRICES[params.model] ?? { in: 4 / 1e6, out: 20 / 1e6 };
    const costUsd = res.usage.input_tokens * price.in + res.usage.output_tokens * price.out;
    await prisma.claudeCallLog
      .create({
        data: {
          purpose: `ugc:${params.purpose}`,
          model: res.model,
          tokensIn: res.usage.input_tokens,
          tokensOut: res.usage.output_tokens,
          costCents: Math.ceil(costUsd * 100),
          durationMs: Date.now() - start,
          success: true,
        },
      })
      .catch(() => {});
    return { text: messageText(res), costUsd };
  } catch (err) {
    await prisma.claudeCallLog
      .create({
        data: {
          purpose: `ugc:${params.purpose}`,
          model: params.model,
          tokensIn: 0,
          tokensOut: 0,
          costCents: 0,
          durationMs: Date.now() - start,
          success: false,
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      })
      .catch(() => {});
    throw err;
  }
}

/** The last complete JSON value in a reply (models sometimes think first). */
export function parseJsonReply<T>(text: string): T {
  return JSON.parse(lastJsonText(text)) as T;
}

/** Fetch an image URL as a base64 block for the scorer; null on any failure. */
export async function imageBlock(url: string | null | undefined): Promise<Anthropic.ImageBlockParam | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0];
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 3_500_000) return null;
    return {
      type: "image",
      source: { type: "base64", media_type: type as "image/jpeg", data: buf.toString("base64") },
    };
  } catch {
    return null;
  }
}
