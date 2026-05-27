/**
 * PUT  — save custom funnel copy for an experiment
 * POST — AI-generate custom funnel copy from the topic brief
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { customPainHook, customBridge, customPromise, customPaywallHook } = await req.json();

  await prisma.adLabExperiment.update({
    where: { id: params.id },
    data: { customPainHook, customBridge, customPromise, customPaywallHook },
  });

  return NextResponse.json({ ok: true });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const experiment = await prisma.adLabExperiment.findUnique({
    where: { id: params.id },
    include: {
      angles: {
        where: { advanced: true },
        take: 1,
        orderBy: { score: "desc" },
      },
    },
  });

  if (!experiment) {
    return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
  }

  const angle = experiment.angles[0];
  const context = `Topic brief: ${experiment.topicBrief}${angle ? `\nAngle: ${angle.hypothesis}\nTarget persona: ${angle.targetPersona}` : ""}`;

  try {
    const { callAdLabClaude, extractJson } = await import("@/lib/adlab/claude");

    const raw = await callAdLabClaude({
      purpose: "funnel-copy",
      systemPrompt: `You are a conversion copywriter for Acuity, an AI voice journal app. Generate pain-specific funnel copy for an ad campaign.

${context}

Generate these 4 pieces of copy as JSON:
1. "painHook": { "headline": "short gut-punch headline, 6-10 words", "subheadline": "one sentence expanding on the pain, under 20 words" }
2. "bridge": "Two sentences. First acknowledges what they've tried. Second positions Acuity as the answer. Under 30 words total."
3. "promise": "One sentence promise of what Acuity will do for this specific pain. Under 25 words. Second person."
4. "paywallHook": "One sentence that assumes they've already experienced Acuity and nudges them to commit. Under 20 words."

Rules:
- Write in second person
- Make it feel like a gut punch, not a sales pitch
- Never say "AI-powered" or "journaling app"
- Reference the specific pain from the topic brief
- Keep each piece under 2 sentences`,
      userPrompt: "Generate the 4 pieces of funnel copy. Return only valid JSON.",
      maxTokens: 500,
    });

    const parsed = JSON.parse(extractJson(raw));

    const result = {
      customPainHook: parsed.painHook ? JSON.stringify(parsed.painHook) : null,
      customBridge: parsed.bridge || null,
      customPromise: parsed.promise || null,
      customPaywallHook: parsed.paywallHook || null,
    };

    // Save to database
    await prisma.adLabExperiment.update({
      where: { id: params.id },
      data: result,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[funnel-copy] Generation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
