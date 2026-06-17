// MRI Diagnostic Dashboard — AI Insights generation.
//
// Builds the aggregates-only snapshot (snapshot.ts), sends it to Claude
// (CLAUDE_MODEL), parses + zod-validates the JSON output, and persists both
// an AdminInsight row (the surfaced result) and a ClaudeCallLog row
// (purpose 'admin_insights', cost/tokens/duration) — modeled on the
// callAdLabClaude() pattern in lib/adlab/claude.ts.
//
// Writes here are the only mutations in the MRI layer: AdminInsight +
// ClaudeCallLog. Everything else is read-only.

import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "@acuity/shared";

import { prisma } from "@/lib/prisma";
import { extractJson } from "@/lib/adlab/claude";

import { buildSnapshot } from "./snapshot";
import { InsightsOutputSchema } from "./types";
import type { Snapshot } from "./types";

const anthropic = new Anthropic();

// Sonnet pricing: $3/M input, $15/M output (matches lib/adlab/claude.ts).
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

const MAX_TOKENS = 4000;

// Verbatim system prompt from mri-spec.md.
const SYSTEM_PROMPT = `You are the diagnostic analyst for Acuity, a voice journaling iOS/Android/web app. You receive a metrics snapshot and produce 3-5 actionable insights for the founder.

Your role:
- Identify the BIGGEST leaks and frustration signals, in order of business impact
- Surface patterns and themes, not just isolated numbers
- Be specific: cite the exact metric, the affected user count, the location in the funnel
- Recommend a concrete next action for each insight

Rules:
- NEVER recommend generic advice ("improve onboarding"). Always reference specific data from the snapshot.
- If two metrics point at the same root cause, group them as one insight with both as evidence.
- If conversion is healthy in one slice and broken in another (e.g., iOS converts at 71%, web at 19%), call out the gap.
- Severity:
  - "critical" = active revenue loss, customer-facing breakage, >20% of users affected
  - "warning" = friction with material conversion impact, 5-20% of users affected
  - "info" = optimization opportunities, leading indicators worth watching
- Limit to 3-5 insights total. Better to have 3 sharp ones than 8 mediocre.

Output ONLY valid JSON in this shape:
{
  "summary": "One-paragraph synthesis (3-4 sentences) of the top issues right now.",
  "insights": [
    {
      "severity": "critical" | "warning" | "info",
      "category": "funnel" | "errors" | "conversion" | "engagement" | "revenue" | "acquisition",
      "title": "Short headline (under 80 chars)",
      "evidence": "Specific numbers from the snapshot proving this is a real issue",
      "affectedUserCount": <number or null>,
      "recommendedAction": "Concrete next step, ideally something Jimmy can execute this week"
    }
  ]
}`;

/**
 * Resolve a human range label (e.g. "30d") into a [start, end] window.
 * Mirrors the admin TimeRangeSelector buckets; defaults to a 30-day window.
 */
function resolveRange(range: string): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end);
  const days =
    range === "7d"
      ? 7
      : range === "60d"
      ? 60
      : range === "90d"
      ? 90
      : range === "all"
      ? 3650
      : 30;
  start.setUTCDate(start.getUTCDate() - days);
  return { start, end };
}

/**
 * Generate a fresh AI Insights row: build the snapshot, call Claude, validate,
 * and persist AdminInsight + ClaudeCallLog. Returns the AdminInsight row.
 *
 * @param generatedBy  Admin user id, "cron", or undefined for ad-hoc.
 * @param range        Range label fed to buildSnapshot (default "30d").
 */
export async function generateInsights(generatedBy?: string, range = "30d") {
  const { start, end } = resolveRange(range);

  const snapshot: Snapshot = await buildSnapshot(prisma, range, start, end);
  const userMessage = JSON.stringify(snapshot);

  const model = CLAUDE_MODEL;
  const startedAt = Date.now();

  let responseText: string;
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    tokensIn = response.usage.input_tokens;
    tokensOut = response.usage.output_tokens;
    responseText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const durationMs = Date.now() - startedAt;
    const costCents = Math.ceil(
      (tokensIn * INPUT_COST_PER_TOKEN + tokensOut * OUTPUT_COST_PER_TOKEN) * 100
    );

    await prisma.claudeCallLog.create({
      data: {
        purpose: "admin_insights",
        model,
        tokensIn,
        tokensOut,
        costCents,
        durationMs,
        success: true,
      },
    });

    // Parse + validate Claude's JSON output.
    const parsed = JSON.parse(extractJson(responseText));
    const validated = InsightsOutputSchema.parse(parsed);

    const row = await prisma.adminInsight.create({
      data: {
        snapshotData: snapshot as unknown as object,
        insights: validated.insights as unknown as object,
        summary: validated.summary,
        modelUsed: model,
        tokensIn,
        tokensOut,
        costCents,
        rangeUsed: range,
        generatedBy: generatedBy ?? null,
      },
    });

    return row;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const costCents = Math.ceil(
      (tokensIn * INPUT_COST_PER_TOKEN + tokensOut * OUTPUT_COST_PER_TOKEN) * 100
    );
    await prisma.claudeCallLog
      .create({
        data: {
          purpose: "admin_insights",
          model,
          tokensIn,
          tokensOut,
          costCents,
          durationMs,
          success: false,
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        },
      })
      .catch(() => {
        /* logging failure must not mask the original error */
      });
    throw err;
  }
}

/**
 * Most recent AdminInsight by generatedAt, or null if none exists yet.
 */
export async function getLatestInsight() {
  return prisma.adminInsight.findFirst({
    orderBy: { generatedAt: "desc" },
  });
}
