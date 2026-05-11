/**
 * POST /api/admin/adlab/research — generate angle hypotheses for an experiment.
 * Accepts { experimentId }. Calls Claude twice: once for angles, once for scoring.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { callAdLabClaude, extractJson } from "@/lib/adlab/claude";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALUE_SURFACES = [
  "problem",
  "outcome",
  "social_proof",
  "mechanism",
  "story",
  "comparison",
  "identity",
  "urgency",
] as const;

const AngleSchema = z.object({
  hypothesis: z.string(),
  targetPersona: z.string(),
  valueSurface: z.enum(VALUE_SURFACES),
  researchNotes: z.string(),
});

const AnglesArraySchema = z.array(AngleSchema).length(8);

const ScoreSchema = z.array(
  z.object({
    index: z.number(),
    score: z.number().min(1).max(10),
  })
);

export async function POST(req: NextRequest) {
  try {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { experimentId } = await req.json();
  if (!experimentId) {
    return NextResponse.json({ error: "experimentId required" }, { status: 400 });
  }

  console.log("[adlab-research] Starting research for experiment:", experimentId);

  const experiment = await prisma.adLabExperiment.findUnique({
    where: { id: experimentId },
    include: { project: true },
  });

  if (!experiment) {
    return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
  }

  const project = experiment.project;
  const audience = (project.targetAudience ?? {}) as Record<string, unknown>;
  const learnedPatterns = (project.learnedPatterns ?? []) as unknown[];

  console.log("[adlab-research] Project loaded:", project.name, "| brandVoiceGuide:", !!project.brandVoiceGuide, "| audience:", !!project.targetAudience, "| usps:", Array.isArray(project.usps), "| bannedPhrases:", Array.isArray(project.bannedPhrases));

  // ── Step 1: Generate 8 angle hypotheses ───────────────────────────
  const systemPrompt = `You are an expert direct-response advertising strategist. Your job is to generate testable ad angle hypotheses for split testing on Meta (Facebook/Instagram).

PROJECT CONFIG:
- Product: ${project.name}
- Brand voice: ${project.brandVoiceGuide}
- Target audience: ${JSON.stringify(audience, null, 2)}
- USPs: ${JSON.stringify(project.usps)}
- Banned phrases (never use): ${(project.bannedPhrases ?? []).join(", ")}
${Array.isArray(learnedPatterns) && learnedPatterns.length > 0 ? `\nPast winning patterns from this project (use as priors, not constraints):\n${JSON.stringify(learnedPatterns, null, 2)}` : ""}

VALUE SURFACE DEFINITIONS:
- problem: Lead with the pain the user already feels
- outcome: Lead with the result they want
- social_proof: Lead with what others have experienced
- mechanism: Lead with how the product works
- story: Lead with a narrative arc
- comparison: Lead with contrast to alternatives
- identity: Lead with who the user is/wants to be
- urgency: Lead with scarcity or time pressure

REQUIREMENTS:
- Return EXACTLY 8 distinct angle hypotheses as a JSON array
- Each angle must span a different creative territory — no two should feel like the same ad
- The 8 angles must span at least 5 different valueSurface values (forces diversity)
- Each hypothesis must be testable: specific enough that you could measure whether it resonates

Return ONLY a JSON array (no preamble, no markdown fences) of exactly 8 objects, each with:
{ "hypothesis": "1-2 sentence testable claim", "targetPersona": "specific persona from audience config", "valueSurface": "one of the 8 values above", "researchNotes": "3 bullet points of supporting reasoning, separated by newlines" }`;

  const userPrompt = `Generate 8 angle hypotheses for this experiment:

Topic brief: ${experiment.topicBrief}

Return only the JSON array.`;

  let angles: z.infer<typeof AnglesArraySchema>;

  // Attempt 1
  try {
    const raw = await callAdLabClaude({
      purpose: "research-angles",
      systemPrompt,
      userPrompt,
      maxTokens: 4000,
    });

    const parsed = JSON.parse(extractJson(raw));
    angles = AnglesArraySchema.parse(parsed);
  } catch (err1) {
    // Attempt 2 with error feedback
    try {
      const retryPrompt = `${userPrompt}\n\nIMPORTANT: Your previous response failed validation: ${err1 instanceof Error ? err1.message : String(err1)}\nReturn EXACTLY 8 objects in a JSON array. Each must have: hypothesis, targetPersona, valueSurface (one of: ${VALUE_SURFACES.join(", ")}), researchNotes.`;

      const raw2 = await callAdLabClaude({
        purpose: "research-angles-retry",
        systemPrompt,
        userPrompt: retryPrompt,
        maxTokens: 4000,
      });

      const parsed2 = JSON.parse(extractJson(raw2));
      angles = AnglesArraySchema.parse(parsed2);
    } catch (err2) {
      return NextResponse.json(
        { error: "Failed to generate angles after 2 attempts", detail: String(err2) },
        { status: 500 }
      );
    }
  }

  // ── Step 2: Score each angle ──────────────────────────────────────
  const scorePrompt = `Score each of these 8 ad angle hypotheses on a 1-10 scale. Consider:
(a) Differentiation: how unique is this angle vs. typical ads in the ${project.name} category?
(b) Persona-surface fit: how well does the valueSurface match the targetPersona's psychology?

Angles:
${angles.map((a, i) => `${i}: [${a.valueSurface}] ${a.hypothesis} (persona: ${a.targetPersona})`).join("\n")}

Return ONLY a JSON array of { "index": <0-7>, "score": <1-10> } objects.`;

  let scores: z.infer<typeof ScoreSchema> = angles.map((_, i) => ({ index: i, score: 5 }));

  try {
    const scoreRaw = await callAdLabClaude({
      purpose: "research-scoring",
      systemPrompt: "You are an advertising scoring engine. Return only JSON.",
      userPrompt: scorePrompt,
      maxTokens: 500,
    });

    const parsedScores = JSON.parse(extractJson(scoreRaw));
    scores = ScoreSchema.parse(parsedScores);
  } catch {
    // Scoring failed — use default scores of 5
    console.warn("[adlab] Scoring failed, using default scores");
  }

  // ── Step 3: Persist angles ────────────────────────────────────────
  const scoreMap = new Map(scores.map((s) => [s.index, s.score]));

  const created = await Promise.all(
    angles.map((angle, i) =>
      prisma.adLabAngle.create({
        data: {
          experimentId,
          hypothesis: angle.hypothesis,
          targetPersona: angle.targetPersona,
          valueSurface: angle.valueSurface,
          researchNotes: angle.researchNotes,
          score: scoreMap.get(i) ?? 5,
        },
      })
    )
  );

  // Update experiment status
  await prisma.adLabExperiment.update({
    where: { id: experimentId },
    data: { status: "awaiting_approval" },
  });

  return NextResponse.json({
    experimentId,
    angles: created,
    status: "awaiting_approval",
  });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[adlab-research] Research endpoint error:", message, stack);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
