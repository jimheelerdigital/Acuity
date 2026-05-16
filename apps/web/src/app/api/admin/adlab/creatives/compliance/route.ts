/**
 * POST /api/admin/adlab/creatives/compliance — run compliance check.
 * Accepts { creativeId } for single, { experimentId } for batch,
 * or { experimentId, skip: true } to bypass and mark all as "pass".
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { callAdLabClaude, extractJson } from "@/lib/adlab/claude";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ComplianceResultSchema = z.object({
  status: z.enum(["pass", "warning", "fail"]),
  notes: z.string(),
  reasons: z.array(z.string()),
});

async function checkCreative(
  creative: { id: string; headline: string; primaryText: string; description: string; cta: string; creativeType?: string; generationPrompt?: string | null },
  bannedPhrases: string[]
): Promise<z.infer<typeof ComplianceResultSchema>> {
  const isVideo = creative.creativeType === "video";

  const systemPrompt = `You are reviewing ad copy for Meta (Facebook/Instagram) ads. Your job is to classify each creative as PASS, WARNING, or FAIL.

FAIL — only use this for content that Meta will definitely reject:
- Directly calling out personal attributes: "Are you depressed?", "As someone with ADHD", "Do you have anxiety?" (Meta prohibits addressing users by personal attributes including race, ethnicity, religion, health conditions, sexual orientation, financial status, criminal record)
- Discriminatory content targeting protected classes
- Claims of guaranteed medical/health outcomes: "Acuity will cure your anxiety", "guaranteed to fix your sleep"
- Deceptive or intentionally misleading claims
- Content promoting illegal activities
- Any phrases on the project's banned phrases list: ${bannedPhrases.map((p) => `"${p}"`).join(", ") || "(none)"}

WARNING — flag but allow to proceed:
- Implied before/after claims that could be interpreted as health promises
- Copy that borders on calling out personal attributes but doesn't directly address the user ("Many people with ADHD find..." is borderline)
- Aggressive urgency or scarcity tactics
- Unverifiable statistics or social proof claims

PASS — everything else, including:
- Emotional language and hooks
- Standard persuasive marketing copy
- Testimonial-style language
- Problem/solution framing
- Bold product benefit claims
- Social proof without specific numbers
- Humor, irony, or provocative statements that aren't discriminatory

Be lenient. Most ad copy is acceptable. Only FAIL content that would genuinely get rejected by Meta's automated ad review. When in doubt, mark as WARNING not FAIL.
${isVideo ? "\nThis is a video creative — the script text below is the spoken content. Review it as if a viewer would hear it." : ""}

Return ONLY a JSON object: { "status": "pass" | "warning" | "fail", "notes": "brief explanation", "reasons": ["reason1", ...] }
If status is "pass", reasons should be an empty array.`;

  const userPrompt = `Check this ad ${isVideo ? "(video creative)" : "(image creative)"}:
Headline: ${creative.headline}
Primary Text: ${creative.primaryText}
Description: ${creative.description}
CTA: ${creative.cta}${isVideo && creative.generationPrompt ? `\n\nSpoken Video Script:\n${creative.generationPrompt}` : ""}`;

  try {
    const raw = await callAdLabClaude({
      purpose: "compliance-check",
      systemPrompt,
      userPrompt,
      maxTokens: 500,
    });

    return ComplianceResultSchema.parse(JSON.parse(extractJson(raw)));
  } catch {
    // If compliance check itself fails, pass with a warning rather than blocking
    return { status: "warning", notes: "Compliance check failed — manual review recommended", reasons: ["check_failed"] };
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { creativeId, experimentId, skip } = await req.json();

  // Skip compliance: mark all creatives as "pass" immediately
  if (skip && experimentId) {
    const experiment = await prisma.adLabExperiment.findUnique({
      where: { id: experimentId },
      include: { angles: { include: { creatives: { select: { id: true } } } } },
    });
    if (!experiment) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }
    const allIds = experiment.angles.flatMap((a) => a.creatives.map((c) => c.id));
    await prisma.adLabCreative.updateMany({
      where: { id: { in: allIds } },
      data: { complianceStatus: "pass", complianceNotes: "Skipped — manual review" },
    });
    return NextResponse.json({ checked: allIds.length, skipped: true, results: allIds.map((id) => ({ id, status: "pass" })) });
  }

  let creatives: { id: string; headline: string; primaryText: string; description: string; cta: string; creativeType?: string; generationPrompt?: string | null }[];
  let bannedPhrases: string[] = [];

  if (creativeId) {
    const creative = await prisma.adLabCreative.findUnique({
      where: { id: creativeId },
      include: { angle: { include: { experiment: { include: { project: true } } } } },
    });
    if (!creative) {
      return NextResponse.json({ error: "Creative not found" }, { status: 404 });
    }
    creatives = [creative];
    bannedPhrases = creative.angle.experiment.project.bannedPhrases;
  } else if (experimentId) {
    const experiment = await prisma.adLabExperiment.findUnique({
      where: { id: experimentId },
      include: {
        project: true,
        angles: {
          include: {
            creatives: {
              select: { id: true, headline: true, primaryText: true, description: true, cta: true, creativeType: true, generationPrompt: true },
            },
          },
        },
      },
    });
    if (!experiment) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }
    creatives = experiment.angles.flatMap((a) => a.creatives);
    bannedPhrases = experiment.project.bannedPhrases;
  } else {
    return NextResponse.json({ error: "creativeId or experimentId required" }, { status: 400 });
  }

  // Run compliance in parallel (max 5 concurrent)
  const results: { id: string; status: string; notes: string }[] = [];
  const batchSize = 5;

  for (let i = 0; i < creatives.length; i += batchSize) {
    const batch = creatives.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (creative) => {
        const result = await checkCreative(creative, bannedPhrases);
        await prisma.adLabCreative.update({
          where: { id: creative.id },
          data: {
            complianceStatus: result.status,
            complianceNotes: result.notes + (result.reasons.length > 0 ? `\nReasons: ${result.reasons.join(", ")}` : ""),
            // Only auto-unapprove on fail — warnings still proceed
            ...(result.status === "fail" ? { approved: false } : {}),
          },
        });
        return { id: creative.id, status: result.status, notes: result.notes };
      })
    );
    results.push(...batchResults);
  }

  const failCount = results.filter((r) => r.status === "fail").length;
  const warnCount = results.filter((r) => r.status === "warning").length;

  return NextResponse.json({
    checked: results.length,
    results,
    failCount,
    warnCount,
    passCount: results.length - failCount - warnCount,
  });
}
