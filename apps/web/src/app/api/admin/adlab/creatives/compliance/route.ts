/**
 * POST /api/admin/adlab/creatives/compliance — run compliance check.
 * Accepts { experimentId } for batch check,
 * or { experimentId, skip: true } to bypass and mark all as "pass".
 *
 * Three-tier verdict system:
 * - PASS (green): compliant, ready to launch
 * - WARNING (yellow): minor issues, allow launch but flag for review
 * - FAIL (red): likely to be rejected by Meta or hard rule violation, block from launch
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { callAdLabClaude, extractJson } from "@/lib/adlab/claude";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const COMPLIANCE_SYSTEM_PROMPT = `You are a Meta advertising compliance reviewer and brand voice auditor for Acuity, an AI voice journaling app. Review each ad creative against Meta's Advertising Standards and the brand voice rules provided. Be strict on Meta policy violations (these get ads rejected and waste money). Be helpful on brand voice issues (flag but don't block). Return ONLY valid JSON, no markdown.

## META ADVERTISING STANDARDS (violations = FAIL):

1. Personal Attributes: No phrasing that asserts or implies personal attributes. "Are you depressed?", "Do you struggle with anxiety?", "As someone with ADHD" — these ALL get rejected. "You" statements about pain points are fine ("You feel stuck"), but direct health/mental health claims about the user are not ("You have anxiety").

2. Before/After Claims: No claims that imply guaranteed health/wellness results ("In 30 days you'll feel like a new person"). Subtle implication is allowed ("See what changes"), direct promises are not.

3. Misleading Claims: No claims about what the product does that it doesn't actually do. Acuity extracts tasks, tracks goals, detects patterns, generates weekly reports. It does NOT diagnose conditions, replace therapy, cure anything, or guarantee outcomes.

4. Profanity/Shocking Content: No profanity, graphic imagery descriptions, or shock value content.

5. Meta Platform References: No references to "Facebook", "Instagram", "Meta" by name in ad copy.

6. Image Text Ratio: If the creative describes overlaid text covering more than ~20% of the image area, flag it (Meta deprioritizes text-heavy images in delivery).

7. Landing Page: Ads for Acuity must link to getacuity.io domain.

## BRAND VOICE CHECKS (violations = WARNING):

1. Uses "brain dump" instead of "daily debrief"
2. Uses "journaling" prominently (prefer "shutdown ritual" or "daily debrief" in acquisition)
3. References a specific time of day ("every night", "at 9pm", "before bed") — Acuity is any-time
4. Gendered language that skews exclusively male or female
5. Tone is too aggressive, combative, or salesy vs. warm/observational
6. Primary text exceeds 125 characters (Meta best practice for mobile — text gets truncated)
7. Headline exceeds 40 characters (gets truncated on mobile placements)

## QUALITY CHECKS (violations = WARNING):

1. Generic copy that doesn't connect to an emotional angle — sounds like it could be for any app
2. No clear value proposition or differentiation
3. Testimonial sounds fake or too polished (no specific details)

## VERDICT RULES:

- Any Meta policy violation → FAIL
- Brand voice or quality issues only → WARNING (multiple minor issues can still be WARNING, not FAIL)
- No issues → PASS
- When in doubt between WARNING and FAIL, choose WARNING. Only FAIL for things Meta will actually reject.`;

interface CreativeForReview {
  id: string;
  headline: string;
  primaryText: string;
  description: string;
  cta: string;
  creativeType: string;
  generationPrompt: string | null;
}

interface ComplianceIssue {
  rule: string;
  severity: "warning" | "fail";
  explanation: string;
  suggestion: string;
}

interface ComplianceVerdict {
  creativeId: string;
  verdict: "PASS" | "WARNING" | "FAIL";
  issues: ComplianceIssue[];
}

async function checkCreativesBatch(creatives: CreativeForReview[]): Promise<ComplianceVerdict[]> {
  const creativesForPrompt = creatives.map((c, i) => {
    const charCounts = `[headline: ${c.headline.length} chars, primaryText: ${c.primaryText.length} chars]`;
    return `--- Creative ${i + 1} (ID: ${c.id}) ${charCounts} ---
Type: ${c.creativeType}
Headline: ${c.headline}
Primary Text: ${c.primaryText}
Description: ${c.description}
CTA: ${c.cta}${c.creativeType === "video" && c.generationPrompt ? `\nVideo Script: ${c.generationPrompt}` : ""}`;
  }).join("\n\n");

  const userPrompt = `Review these ${creatives.length} ad creative(s) for compliance:

${creativesForPrompt}

Return a JSON array with one object per creative:
[
  {
    "creativeId": "the creative ID from above",
    "verdict": "PASS" | "WARNING" | "FAIL",
    "issues": [
      {
        "rule": "short rule name (e.g. 'Personal Attributes', 'Headline Length')",
        "severity": "warning" | "fail",
        "explanation": "what specifically is wrong",
        "suggestion": "how to fix it"
      }
    ]
  }
]

If verdict is PASS, issues should be an empty array. Return ONLY the JSON array.`;

  try {
    const raw = await callAdLabClaude({
      purpose: "compliance-check",
      systemPrompt: COMPLIANCE_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 2000,
    });

    const parsed = JSON.parse(extractJson(raw));
    if (!Array.isArray(parsed)) {
      throw new Error("Expected array response");
    }

    // Validate and normalize the response
    return parsed.map((item: Record<string, unknown>) => ({
      creativeId: String(item.creativeId || ""),
      verdict: (["PASS", "WARNING", "FAIL"].includes(item.verdict as string) ? item.verdict : "WARNING") as "PASS" | "WARNING" | "FAIL",
      issues: Array.isArray(item.issues) ? item.issues.map((issue: Record<string, unknown>) => ({
        rule: String(issue.rule || "Unknown"),
        severity: issue.severity === "fail" ? "fail" : "warning",
        explanation: String(issue.explanation || ""),
        suggestion: String(issue.suggestion || ""),
      })) : [],
    }));
  } catch (err) {
    console.error("[adlab-compliance] Batch check failed:", err);
    // Return warnings for all creatives in the batch rather than blocking
    return creatives.map((c) => ({
      creativeId: c.id,
      verdict: "WARNING" as const,
      issues: [{
        rule: "Check Failed",
        severity: "warning" as const,
        explanation: "Automated compliance check failed — manual review recommended",
        suggestion: "Review ad copy manually against Meta policies before launch",
      }],
    }));
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { experimentId, skip } = await req.json();

  if (!experimentId) {
    return NextResponse.json({ error: "experimentId required" }, { status: 400 });
  }

  // Skip compliance: mark all creatives as "pass" immediately
  if (skip) {
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
    return NextResponse.json({ checked: allIds.length, skipped: true, failCount: 0, warnCount: 0, passCount: allIds.length });
  }

  // Load all creatives for the experiment
  const experiment = await prisma.adLabExperiment.findUnique({
    where: { id: experimentId },
    include: {
      angles: {
        include: {
          creatives: {
            select: {
              id: true,
              headline: true,
              primaryText: true,
              description: true,
              cta: true,
              creativeType: true,
              generationPrompt: true,
            },
          },
        },
      },
    },
  });

  if (!experiment) {
    return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
  }

  const creatives: CreativeForReview[] = experiment.angles.flatMap((a) => a.creatives);

  if (creatives.length === 0) {
    return NextResponse.json({ error: "No creatives to check" }, { status: 400 });
  }

  // Send all creatives in one batch to Claude (up to ~15 creatives is fine in one call)
  // For very large experiments, split into batches of 10
  const batchSize = 10;
  const allVerdicts: ComplianceVerdict[] = [];

  for (let i = 0; i < creatives.length; i += batchSize) {
    const batch = creatives.slice(i, i + batchSize);
    const verdicts = await checkCreativesBatch(batch);
    allVerdicts.push(...verdicts);
  }

  // Save results to DB
  for (const verdict of allVerdicts) {
    const status = verdict.verdict.toLowerCase(); // "pass" | "warning" | "fail"
    const notes = verdict.issues.length > 0
      ? verdict.issues.map((i) => `[${i.severity.toUpperCase()}] ${i.rule}: ${i.explanation}${i.suggestion ? ` → ${i.suggestion}` : ""}`).join("\n")
      : "";

    await prisma.adLabCreative.update({
      where: { id: verdict.creativeId },
      data: {
        complianceStatus: status,
        complianceNotes: notes || null,
        // Auto-unapprove on fail so it can't be launched
        ...(status === "fail" ? { approved: false } : {}),
      },
    });
  }

  const failCount = allVerdicts.filter((v) => v.verdict === "FAIL").length;
  const warnCount = allVerdicts.filter((v) => v.verdict === "WARNING").length;
  const passCount = allVerdicts.filter((v) => v.verdict === "PASS").length;

  return NextResponse.json({
    checked: allVerdicts.length,
    failCount,
    warnCount,
    passCount,
    results: allVerdicts,
  });
}
