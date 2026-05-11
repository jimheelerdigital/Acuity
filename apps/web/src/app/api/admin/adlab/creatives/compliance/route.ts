/**
 * POST /api/admin/adlab/creatives/compliance — run compliance check.
 * Accepts { creativeId } for single or { experimentId } for batch.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { callAdLabClaude, extractJson } from "@/lib/adlab/claude";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ComplianceResultSchema = z.object({
  status: z.enum(["passed", "flagged"]),
  notes: z.string(),
  flaggedReasons: z.array(z.string()),
});

async function checkCreative(
  creative: { id: string; headline: string; primaryText: string; description: string; cta: string; creativeType?: string; generationPrompt?: string | null },
  bannedPhrases: string[]
): Promise<z.infer<typeof ComplianceResultSchema>> {
  const isVideo = creative.creativeType === "video";

  const systemPrompt = `You are a Meta Ads compliance reviewer. Check the ad ${isVideo ? "copy AND spoken video script" : "copy"} below against Meta's advertising policies.

FLAG if the ad contains ANY of these violations:
1. PERSONAL ATTRIBUTES: Uses "you" in a way that implies inferred traits (race, religion, financial status, sexual orientation, mental/physical condition). Example flagged: "Are you struggling with anxiety?" Example OK: "Many people find relief through daily reflection."
2. HEALTH/MEDICAL CLAIMS: Claims to diagnose, treat, cure, or prevent medical conditions.
3. BEFORE/AFTER: Implies unrealistic transformation or uses before/after framing.
4. PROHIBITED FINANCIAL CLAIMS: Guaranteed returns, get-rich language.
5. PROFANITY or vulgar language.
6. SENSATIONAL LANGUAGE: Excessive exclamation marks, all caps, clickbait.
7. PROHIBITED CONTENT: Weapons, drugs, adult content, discrimination.
8. THIRD-PARTY INFRINGEMENT: Unauthorized use of trademarks or celebrity names.
${isVideo ? "\n9. VIDEO-SPECIFIC: Spoken claims that would violate Meta policy when heard (health guarantees, income claims, personal attribute assumptions). The script text is the spoken content — review it as if a viewer would hear it." : ""}

ALSO FLAG if the ad contains any of these project-specific banned phrases:
${bannedPhrases.map((p) => `- "${p}"`).join("\n")}

Return ONLY a JSON object: { "status": "passed" | "flagged", "notes": "brief explanation", "flaggedReasons": ["reason1", ...] }
If passed, flaggedReasons should be an empty array.`;

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
    return { status: "flagged", notes: "Compliance check failed — manual review required", flaggedReasons: ["check_failed"] };
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { creativeId, experimentId } = await req.json();

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
            complianceNotes: result.notes + (result.flaggedReasons.length > 0 ? `\nReasons: ${result.flaggedReasons.join(", ")}` : ""),
            // Auto-unapprove flagged creatives — a flagged creative can never stay approved
            ...(result.status === "flagged" ? { approved: false } : {}),
          },
        });
        return { id: creative.id, status: result.status, notes: result.notes };
      })
    );
    results.push(...batchResults);
  }

  const flaggedCount = results.filter((r) => r.status === "flagged").length;

  return NextResponse.json({
    checked: results.length,
    results,
    flaggedCount,
    flaggedAutoUnapproved: flaggedCount,
  });
}
