/**
 * POST /api/admin/adlab/experiments/[id]/learn — run learning loop on concluded experiment.
 * Analyzes winning/losing patterns and appends to project.learnedPatterns.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { callAdLabClaude, extractJson } from "@/lib/adlab/claude";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LearningResultSchema = z.object({
  winningValueSurfaces: z.array(z.object({
    surface: z.string(),
    avgCplCents: z.number(),
  })),
  cheapestPersonas: z.array(z.object({
    persona: z.string(),
    avgCplCents: z.number(),
  })),
  winningCreativeType: z.object({
    overall: z.string(),
    byPersona: z.array(z.object({ persona: z.string(), type: z.string() })).optional(),
  }).optional(),
  copyPatterns: z.array(z.string()),
  visualPatterns: z.array(z.string()),
  scriptPatterns: z.array(z.string()).optional(),
  recommendations: z.array(z.string()),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Allow both admin auth and cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const { requireAdmin } = await import("@/lib/admin-guard");
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }

  const experiment = await prisma.adLabExperiment.findUnique({
    where: { id: params.id },
    include: {
      project: true,
      angles: {
        include: {
          creatives: {
            include: {
              ads: {
                include: {
                  metrics: true,
                  decisions: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!experiment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Build data summary for Claude
  const adSummaries = experiment.angles.flatMap((angle) =>
    angle.creatives.flatMap((creative) =>
      creative.ads.map((ad) => {
        const totalSpend = ad.metrics.reduce((s, m) => s + m.spendCents, 0);
        const totalConversions = ad.metrics.reduce((s, m) => s + m.conversions, 0);
        return {
          angleSurface: angle.valueSurface,
          anglePersona: angle.targetPersona,
          hypothesis: angle.hypothesis,
          creativeType: creative.creativeType,
          headline: creative.headline,
          primaryText: creative.primaryText,
          generationPrompt: creative.generationPrompt,
          status: ad.status,
          totalSpendCents: totalSpend,
          totalConversions,
          cplCents: totalConversions > 0 ? Math.round(totalSpend / totalConversions) : null,
        };
      })
    )
  );

  const systemPrompt = `You are an advertising performance analyst. Analyze this concluded ad experiment and extract reusable patterns.

Return a JSON object with:
- winningValueSurfaces: array of { surface, avgCplCents } sorted by lowest CPL
- cheapestPersonas: array of { persona, avgCplCents } sorted by lowest CPL
- winningCreativeType: { overall: "image" | "video", byPersona: [{ persona, type }] } — which format won overall and per persona
- copyPatterns: 3-5 string patterns from winning ad copy (hook structure, length, tone)
- visualPatterns: 3-5 string patterns from winning IMAGE ad prompts (composition, color, subject)
- scriptPatterns: 3-5 string patterns from winning VIDEO ad scripts (hook structure, pacing, CTA placement)
- recommendations: 2-3 concrete directions for the next experiment

Each ad has a creativeType field ("image" or "video"). Compare performance across formats.
Only include data-backed observations. If a metric is null or zero, note it but don't fabricate conclusions.`;

  try {
    const raw = await callAdLabClaude({
      purpose: "learning-loop",
      systemPrompt,
      userPrompt: `Analyze this experiment:\n\nTopic: ${experiment.topicBrief}\n\nAd performance data:\n${JSON.stringify(adSummaries, null, 2)}`,
      maxTokens: 2000,
    });

    const result = LearningResultSchema.parse(JSON.parse(extractJson(raw)));

    // Save conclusion summary
    const summaryText = [
      "## Winning Value Surfaces",
      ...result.winningValueSurfaces.map((s) => `- ${s.surface}: $${(s.avgCplCents / 100).toFixed(2)} CPL`),
      "\n## Cheapest Personas",
      ...result.cheapestPersonas.map((p) => `- ${p.persona}: $${(p.avgCplCents / 100).toFixed(2)} CPL`),
      result.winningCreativeType ? `\n## Creative Format Winner\n- Overall: ${result.winningCreativeType.overall}` : "",
      result.winningCreativeType?.byPersona?.length ? result.winningCreativeType.byPersona.map((p) => `- ${p.persona}: ${p.type}`).join("\n") : "",
      "\n## Copy Patterns",
      ...result.copyPatterns.map((p) => `- ${p}`),
      "\n## Image Visual Patterns",
      ...result.visualPatterns.map((p) => `- ${p}`),
      result.scriptPatterns?.length ? "\n## Video Script Patterns" : "",
      ...(result.scriptPatterns || []).map((p) => `- ${p}`),
      "\n## Recommendations",
      ...result.recommendations.map((r) => `- ${r}`),
    ].filter(Boolean).join("\n");

    await prisma.adLabExperiment.update({
      where: { id: params.id },
      data: { conclusionSummary: summaryText },
    });

    // Append to project.learnedPatterns
    const existingPatterns = (experiment.project.learnedPatterns as unknown[]) || [];
    const newPattern = {
      experimentId: params.id,
      concludedAt: new Date().toISOString(),
      ...result,
    };

    await prisma.adLabProject.update({
      where: { id: experiment.projectId },
      data: {
        learnedPatterns: [...existingPatterns, newPattern],
      },
    });

    return NextResponse.json({ success: true, summary: summaryText });
  } catch (err) {
    return NextResponse.json(
      { error: "Learning loop failed", detail: String(err) },
      { status: 500 }
    );
  }
}
