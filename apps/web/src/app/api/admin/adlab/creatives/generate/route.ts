/**
 * POST /api/admin/adlab/creatives/generate — generate creatives for an angle.
 * Accepts { angleId, useReferenceImages? }. Generates:
 *   - 3 copy variants via Claude
 *   - 3 image creatives via gpt-image-2 (if project.imageEnabled)
 *   - If useReferenceImages is true and experiment has reference images,
 *     uses images.edit() with the first reference image for stylistic direction
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
  headline: z.string().max(40),
  primaryText: z.string().max(125),
  description: z.string().max(30),
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
    // If a reference image is provided, use images.edit() for stylistic direction
    if (referenceImageUrl) {
      try {
        console.log("[adlab] Using reference image for creative direction:", referenceImageUrl);
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
          if (b64) {
            return { imageBuffer: Buffer.from(b64, "base64") };
          }
        }
      } catch (refErr) {
        console.warn("[adlab] Reference image edit failed, falling back to generate:", refErr instanceof Error ? refErr.message : refErr);
      }
    }

    // Standard generation (no reference image or fallback)
    const response = await openai().images.generate({
      model: "gpt-image-2",
      prompt,
      n: 1,
      size: "1024x1024",
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      console.error("[adlab] gpt-image-2 returned no image data");
      return null;
    }

    return { imageBuffer: Buffer.from(b64, "base64") };
  } catch (err) {
    console.error("[adlab] Image generation failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function uploadToSupabase(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string | null> {
  try {
    const { supabase } = await import("@/lib/supabase.server");

    const { error } = await supabase.storage
      .from("adlab-creatives")
      .upload(filename, buffer, { contentType, upsert: true });

    if (error) {
      console.error("[adlab] Supabase upload failed:", error.message);
      return null;
    }

    const { data } = supabase.storage
      .from("adlab-creatives")
      .getPublicUrl(filename);

    return data.publicUrl;
  } catch (err) {
    console.error("[adlab] Supabase upload error:", err);
    return null;
  }
}

// ─── Main endpoint ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { angleId, useReferenceImages } = await req.json();
  if (!angleId) {
    return NextResponse.json({ error: "angleId required" }, { status: 400 });
  }

  const angle = await prisma.adLabAngle.findUnique({
    where: { id: angleId },
    include: {
      experiment: {
        include: { project: true },
      },
    },
  });

  if (!angle) {
    return NextResponse.json({ error: "Angle not found" }, { status: 404 });
  }

  const project = angle.experiment.project;

  // Load reference images if requested
  let referenceImageUrl: string | undefined;
  if (useReferenceImages) {
    try {
      const refImages = await prisma.adLabReferenceImage.findMany({
        where: { experimentId: angle.experimentId },
        orderBy: { createdAt: "asc" },
        take: 1,
      });
      if (refImages.length > 0) {
        referenceImageUrl = refImages[0].imageUrl;
      }
    } catch {
      console.warn("[adlab] Could not load reference images (table may not exist yet)");
    }
  }

  // ── Step 1: Generate 3 copy variants via Claude ───────────────────
  const systemPrompt = `You are an expert Meta Ads copywriter. Generate 3 creative variants for a Facebook/Instagram ad.

PROJECT:
- Product: ${project.name}
- Brand voice: ${project.brandVoiceGuide}
- USPs: ${JSON.stringify(project.usps)}
- Banned phrases: ${project.bannedPhrases.join(", ")}

ANGLE:
- Hypothesis: ${angle.hypothesis}
- Target persona: ${angle.targetPersona}
- Value surface: ${angle.valueSurface}

CONSTRAINTS:
- headline: max 40 characters (Meta limit)
- primaryText: max 125 characters (ideal display length)
- description: max 30 characters
- cta: one of Meta's allowed values: LEARN_MORE, SIGN_UP, GET_OFFER, DOWNLOAD, SUBSCRIBE, CONTACT_US, APPLY_NOW, BOOK_TRAVEL, SHOP_NOW, WATCH_MORE

Each variant should test a meaningfully different hook or angle framing while staying true to the hypothesis.

CRITICAL — All ad copy must comply with Meta's advertising policies. Follow these rules strictly:

- NEVER use 'you' or 'your' in a way that implies the reader has a specific personal attribute — including health conditions, mental health status, financial status, race, religion, sexual orientation, or disability. 'Your therapist' implies the reader is in therapy. 'You pay $150/hr' implies the reader's spending. Rewrite to use general framing: 'Therapy covers 50 minutes' not 'Your therapist gets 50 minutes.'
- NEVER reference specific medical or mental health conditions, treatments, or diagnoses — even indirectly. 'ADHD' 'anxiety' 'depression' 'therapy' as something the reader does are all violations when directed at the reader with 'you/your.'
- NEVER use before/after framing that implies a personal transformation.
- NEVER make health claims or promise therapeutic outcomes.
- NEVER reference financial status or spending habits directed at the reader.
- USE third-person or general framing instead: 'Most people forget what they said by Tuesday' not 'You forget what you said by Tuesday.' 'Therapy covers 1 hour a week' not 'Your therapist gets 50 minutes.'
- The copy can reference therapy, mental health, and productivity as TOPICS — just never attribute them to the specific reader using 'you/your.'

Return ONLY a JSON array of exactly 3 objects, each with: headline, primaryText, description, cta`;

  let copyVariants: z.infer<typeof CreativesArraySchema>;

  try {
    const raw = await callAdLabClaude({
      purpose: "creative-copy",
      systemPrompt,
      userPrompt: `Generate 3 ad creative variants. Return only the JSON array.`,
      maxTokens: 2000,
    });

    copyVariants = CreativesArraySchema.parse(JSON.parse(extractJson(raw)));
  } catch (err) {
    return NextResponse.json(
      { error: "Copy generation failed", detail: String(err) },
      { status: 500 }
    );
  }

  const allCreated: string[] = [];
  const uploadErrors: { creativeId: string; error: string }[] = [];

  // ── Step 2: Image creatives (gpt-image-2) ───────────────────────────
  if (project.imageEnabled) {
    for (let vi = 0; vi < copyVariants.length; vi++) {
      const variant = copyVariants[vi];

      // Rate limit: 3s delay between image generation calls (5/min limit)
      if (vi > 0) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      const imagePrompt = [
        project.imageStylePrompt,
        `Scene: Visual metaphor for "${angle.hypothesis}" targeting ${angle.targetPersona}.`,
        `The ad headline is "${variant.headline}".`,
      ].join("\n");

      const imageResult = await generateImage(imagePrompt, referenceImageUrl);

      // Create the creative row first to get an ID for the filename
      const creative = await prisma.adLabCreative.create({
        data: {
          angleId,
          creativeType: "image",
          headline: variant.headline,
          primaryText: variant.primaryText,
          description: variant.description,
          cta: variant.cta,
          generationPrompt: imagePrompt,
          complianceStatus: "pending",
          approved: false,
        },
      });

      if (imageResult) {
        const imageUrl = await uploadToSupabase(
          imageResult.imageBuffer,
          `${creative.id}.png`,
          "image/png"
        );
        if (imageUrl) {
          await prisma.adLabCreative.update({
            where: { id: creative.id },
            data: { imageUrl },
          });
        } else {
          console.error(`[adlab] Supabase upload failed for image creative ${creative.id}`);
          uploadErrors.push({ creativeId: creative.id, error: "Image upload to Supabase failed" });
        }
      } else {
        console.warn(`[adlab] Image generation returned null for creative ${creative.id}`);
      }

      allCreated.push(creative.id);
    }
  }

  const creatives = await prisma.adLabCreative.findMany({
    where: { id: { in: allCreated } },
  });

  return NextResponse.json({
    creatives,
    ...(uploadErrors.length > 0 ? { uploadErrors } : {}),
  });
}
