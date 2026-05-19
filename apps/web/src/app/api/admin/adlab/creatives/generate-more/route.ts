/**
 * POST /api/admin/adlab/creatives/generate-more — generate additional creatives
 * for an existing experiment, avoiding duplication with existing ones.
 *
 * Accepts:
 *   experimentId: string
 *   scalingMode: "more_of_type" | "new_angles" | "new_copy_lengths"
 *   preferredType?: "mechanism" | "pain_point" | "screenshot" (for more_of_type mode)
 *   useReferenceImages?: boolean
 *
 * Generates 3 new creatives per advanced angle, passing existing creative
 * descriptions to Claude so it avoids duplication.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { callAdLabClaude, extractJson } from "@/lib/adlab/claude";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CreativeSchema = z.object({
  headline: z.string().max(255),
  primaryText: z.string().max(2000),
  description: z.string().max(255),
  cta: z.string(),
});

const CreativesArraySchema = z.array(CreativeSchema).length(3);

// ─── gpt-image-2 generation ───────────────────────────────────────────────

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000 });
  }
  return _openai;
}

async function generateImage(prompt: string, referenceImageUrl?: string): Promise<{ imageBuffer: Buffer } | null> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("[adlab] OPENAI_API_KEY not set, skipping image generation");
    return null;
  }

  try {
    if (referenceImageUrl) {
      try {
        const imgRes = await fetch(referenceImageUrl);
        if (imgRes.ok) {
          const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
          const file = await OpenAI.toFile(imgBuffer, "reference.png", { type: "image/png" });
          const response = await openai().images.edit({
            model: "gpt-image-2",
            image: file,
            prompt,
            n: 1,
            size: "1024x1024",
          });
          const b64 = response.data?.[0]?.b64_json;
          if (b64) return { imageBuffer: Buffer.from(b64, "base64") };
        }
      } catch (refErr) {
        console.warn("[adlab] Reference image edit failed, falling back:", refErr instanceof Error ? refErr.message : refErr);
      }
    }

    const response = await openai().images.generate({
      model: "gpt-image-2",
      prompt,
      n: 1,
      size: "1024x1024",
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) return null;
    return { imageBuffer: Buffer.from(b64, "base64") };
  } catch (err) {
    console.error("[adlab] Image generation failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function uploadToSupabase(buffer: Buffer, filename: string, contentType: string): Promise<string | null> {
  try {
    const { supabase } = await import("@/lib/supabase.server");
    const { error } = await supabase.storage.from("adlab-creatives").upload(filename, buffer, { contentType, upsert: true });
    if (error) {
      console.error("[adlab] Supabase upload failed:", error.message);
      return null;
    }
    const { data } = supabase.storage.from("adlab-creatives").getPublicUrl(filename);
    return data.publicUrl;
  } catch (err) {
    console.error("[adlab] Supabase upload error:", err);
    return null;
  }
}

// ─── Scaling mode prompt builders ─────────────────────────────────────────

function buildMoreOfTypeInstructions(preferredType: string): string {
  const typeDescriptions: Record<string, string> = {
    mechanism: "Focus on HOW the product works — the specific mechanism, process, or method. Show the inner workings. Use diagrams, step-by-step visuals, or close-up product shots.",
    pain_point: "Lead with the PAIN the audience feels right now. Agitate the problem before offering the solution. Use emotional, relatable scenarios.",
    screenshot: "Use product screenshots, UI mockups, or real app visuals. Show the actual product experience — what the user sees when they use it.",
  };
  return `SCALING DIRECTION: Generate MORE creatives in the "${preferredType}" style.
${typeDescriptions[preferredType] || ""}
Keep the same general creative approach but vary the specific hooks, visuals, and copy angles.`;
}

function buildNewAnglesInstructions(existingAngles: string[]): string {
  return `SCALING DIRECTION: Generate creatives using DIFFERENT angles from the same topic.
The following angles have already been used — do NOT repeat them:
${existingAngles.map((a, i) => `${i + 1}. ${a}`).join("\n")}

Find fresh angles: different emotional hooks, different audience segments, different value propositions from the same topic brief.`;
}

function buildNewCopyLengthsInstructions(existingLengths: { short: number; long: number; oneLiner: number }): string {
  const needed: string[] = [];
  if (existingLengths.short > existingLengths.long) needed.push("LONG (150-250 characters primaryText)");
  if (existingLengths.short > existingLengths.oneLiner) needed.push("ONE-LINER (under 60 characters primaryText)");
  if (existingLengths.long > existingLengths.short) needed.push("SHORT (60-125 characters primaryText)");
  if (needed.length === 0) needed.push("LONG (150-250 characters)", "ONE-LINER (under 60 characters)", "SHORT (60-125 characters)");

  return `SCALING DIRECTION: Generate creatives with DIFFERENT copy lengths.
Current distribution: ${existingLengths.short} short, ${existingLengths.long} long, ${existingLengths.oneLiner} one-liner.
Prioritize these lengths: ${needed.join(", ")}.
Each of the 3 variants should use a DIFFERENT copy length.`;
}

// ─── Main endpoint ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const { experimentId, scalingMode, preferredType, useReferenceImages } = await req.json();

    if (!experimentId) {
      return NextResponse.json({ error: "experimentId required" }, { status: 400 });
    }
    if (!scalingMode || !["more_of_type", "new_angles", "new_copy_lengths"].includes(scalingMode)) {
      return NextResponse.json({ error: "scalingMode must be one of: more_of_type, new_angles, new_copy_lengths" }, { status: 400 });
    }

    const experiment = await prisma.adLabExperiment.findUnique({
      where: { id: experimentId },
      include: {
        project: true,
        angles: {
          where: { advanced: true },
          include: { creatives: true },
        },
      },
    });

    if (!experiment) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }

    const project = experiment.project;
    const allExistingCreatives = experiment.angles.flatMap((a) => a.creatives);

    if (allExistingCreatives.length === 0) {
      return NextResponse.json({ error: "No existing creatives to build on" }, { status: 400 });
    }

    // Determine next batch number
    const maxBatch = allExistingCreatives.reduce((max, c) => Math.max(max, (c as Record<string, unknown>).batchNumber as number || 0), 0);
    const nextBatch = maxBatch + 1;

    // Load reference image if requested
    let referenceImageUrl: string | undefined;
    if (useReferenceImages) {
      try {
        const refImages = await prisma.adLabReferenceImage.findMany({
          where: { experimentId },
          orderBy: { createdAt: "asc" },
          take: 1,
        });
        if (refImages.length > 0) referenceImageUrl = refImages[0].imageUrl;
      } catch {
        console.warn("[adlab] Could not load reference images");
      }
    }

    // Build existing creative descriptions for dedup
    const existingDescriptions = allExistingCreatives.map((c) =>
      `[${c.creativeType}] Headline: "${c.headline}" | Primary: "${c.primaryText.slice(0, 100)}..." | CTA: ${c.cta}`
    );

    // Build scaling-specific instructions
    let scalingInstructions = "";
    if (scalingMode === "more_of_type") {
      scalingInstructions = buildMoreOfTypeInstructions(preferredType || "mechanism");
    } else if (scalingMode === "new_angles") {
      const existingAngles = experiment.angles.map((a) => a.hypothesis);
      scalingInstructions = buildNewAnglesInstructions(existingAngles);
    } else if (scalingMode === "new_copy_lengths") {
      const lengths = { short: 0, long: 0, oneLiner: 0 };
      for (const c of allExistingCreatives) {
        const len = c.primaryText.length;
        if (len < 60) lengths.oneLiner++;
        else if (len <= 125) lengths.short++;
        else lengths.long++;
      }
      scalingInstructions = buildNewCopyLengthsInstructions(lengths);
    }

    // Generate across all advanced angles
    const allCreated: string[] = [];
    const errors: { angleId: string; error: string }[] = [];

    for (let ai = 0; ai < experiment.angles.length; ai++) {
      const angle = experiment.angles[ai];

      // Pause between angles for rate limits
      if (ai > 0) await new Promise((r) => setTimeout(r, 5_000));

      const angleExistingCreatives = angle.creatives.map((c) =>
        `- Headline: "${c.headline}" | Primary: "${c.primaryText.slice(0, 120)}..." | CTA: ${c.cta}`
      );

      const systemPrompt = `You are an expert Meta Ads copywriter. Generate 3 NEW creative variants for a Facebook/Instagram ad.

PROJECT:
- Product: ${project.name}
- Brand voice: ${project.brandVoiceGuide}
- USPs: ${JSON.stringify(project.usps)}
- Banned phrases: ${project.bannedPhrases.join(", ")}

ANGLE:
- Hypothesis: ${angle.hypothesis}
- Target persona: ${angle.targetPersona}
- Value surface: ${angle.valueSurface}

${scalingInstructions}

EXISTING CREATIVES FOR THIS ANGLE (do NOT duplicate these — use different hooks, copy lengths, image concepts, and people/scenarios):
${angleExistingCreatives.length > 0 ? angleExistingCreatives.join("\n") : "None yet."}

ALL EXISTING CREATIVES ACROSS EXPERIMENT (avoid similar headlines/hooks):
${existingDescriptions.join("\n")}

CONSTRAINTS:
- headline: max 255 characters (Meta limit)
- primaryText: 1-3 sentences, roughly 80-200 characters. Max 2000 characters.
- description: max 255 characters
- cta: one of: LEARN_MORE, SIGN_UP, GET_OFFER, DOWNLOAD, SUBSCRIBE, CONTACT_US, APPLY_NOW, BOOK_TRAVEL, SHOP_NOW, WATCH_MORE
- Each variant MUST be meaningfully different from ALL existing creatives

CRITICAL — Meta advertising policy compliance:
- NEVER use 'you' or 'your' implying the reader has a specific personal attribute
- NEVER reference specific medical/mental health conditions directed at the reader
- NEVER use before/after framing implying personal transformation
- USE third-person or general framing instead

Return ONLY a JSON array of exactly 3 objects, each with: headline, primaryText, description, cta`;

      try {
        const raw = await callAdLabClaude({
          purpose: "creative-copy-more",
          systemPrompt,
          userPrompt: "Generate 3 NEW ad creative variants that are different from the existing ones. Return only the JSON array.",
          maxTokens: 2000,
        });

        const copyVariants = CreativesArraySchema.parse(JSON.parse(extractJson(raw)));

        // Generate images for each variant
        if (project.imageEnabled) {
          for (let vi = 0; vi < copyVariants.length; vi++) {
            const variant = copyVariants[vi];
            if (vi > 0) await new Promise((r) => setTimeout(r, 3000));

            const imagePrompt = [
              project.imageStylePrompt,
              `Scene: Visual metaphor for "${angle.hypothesis}" targeting ${angle.targetPersona}.`,
              `The ad headline is "${variant.headline}".`,
              "Use a DIFFERENT composition, color palette, and person/scenario than previous creatives for this angle.",
            ].join("\n");

            const imageResult = await generateImage(imagePrompt, referenceImageUrl);

            const creative = await prisma.adLabCreative.create({
              data: {
                angleId: angle.id,
                creativeType: "image",
                headline: variant.headline,
                primaryText: variant.primaryText,
                description: variant.description,
                cta: variant.cta,
                generationPrompt: imagePrompt,
                complianceStatus: "pending",
                approved: false,
                batchNumber: nextBatch,
              },
            });

            if (imageResult) {
              const imageUrl = await uploadToSupabase(imageResult.imageBuffer, `${creative.id}.png`, "image/png");
              if (imageUrl) {
                await prisma.adLabCreative.update({
                  where: { id: creative.id },
                  data: { imageUrl },
                });
              }
            }

            allCreated.push(creative.id);
          }
        }
      } catch (err) {
        console.error(`[adlab-generate-more] Angle ${angle.id} failed:`, err instanceof Error ? err.message : err);
        errors.push({ angleId: angle.id, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const creatives = await prisma.adLabCreative.findMany({
      where: { id: { in: allCreated } },
    });

    return NextResponse.json({
      creatives,
      batchNumber: nextBatch,
      created: allCreated.length,
      errors,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[adlab-generate-more] UNCAUGHT ERROR:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
