/**
 * POST /api/admin/adlab/creatives/generate — generate 3 creative variants for an angle.
 * Accepts { angleId }. Generates copy via Claude + image via Ideogram.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { callAdLabClaude, extractJson } from "@/lib/adlab/claude";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CreativeSchema = z.object({
  headline: z.string().max(40),
  primaryText: z.string().max(125),
  description: z.string().max(30),
  cta: z.string(),
});

const CreativesArraySchema = z.array(CreativeSchema).length(3);

async function generateImage(prompt: string): Promise<string | null> {
  const apiKey = process.env.IDEOGRAM_API_KEY;
  if (!apiKey) {
    console.warn("[adlab] IDEOGRAM_API_KEY not set, skipping image generation");
    return null;
  }

  try {
    const res = await fetch("https://api.ideogram.ai/generate", {
      method: "POST",
      headers: {
        "Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_request: {
          prompt,
          model: "V_2",
          aspect_ratio: "ASPECT_1_1",
          magic_prompt_option: "AUTO",
        },
      }),
    });

    if (!res.ok) {
      console.error("[adlab] Ideogram error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    return data.data?.[0]?.url ?? null;
  } catch (err) {
    console.error("[adlab] Ideogram fetch failed:", err);
    return null;
  }
}

async function generateHeyGenVideo(
  _script: string,
  _project: { name: string }
): Promise<string | null> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    console.warn("[adlab] HEYGEN_API_KEY not set, skipping video generation");
    return null;
  }

  // TODO: Implement HeyGen video generation when API key is configured.
  // 1. POST to HeyGen API with avatar script
  // 2. Poll for completion (max 5 min)
  // 3. Return video URL
  return null;
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { angleId } = await req.json();
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

  // ── Step 1: Generate copy via Claude ──────────────────────────────
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

Return ONLY a JSON array of exactly 3 objects, each with: headline, primaryText, description, cta`;

  let creatives: z.infer<typeof CreativesArraySchema>;

  try {
    const raw = await callAdLabClaude({
      purpose: "creative-copy",
      systemPrompt,
      userPrompt: `Generate 3 ad creative variants. Return only the JSON array.`,
      maxTokens: 2000,
    });

    creatives = CreativesArraySchema.parse(JSON.parse(extractJson(raw)));
  } catch (err) {
    return NextResponse.json(
      { error: "Copy generation failed", detail: String(err) },
      { status: 500 }
    );
  }

  // ── Step 2: Generate images via Ideogram ──────────────────────────
  const imageResults = await Promise.all(
    creatives.map(async (creative) => {
      const imagePrompt = [
        project.imageStylePrompt,
        `Scene: Visual metaphor for "${angle.hypothesis}" targeting ${angle.targetPersona}.`,
        `The ad headline is "${creative.headline}".`,
        project.logoUrl
          ? `Place the project logo (provided at ${project.logoUrl}) in the bottom right corner of the image, sized at approximately 5% of the image width. Keep it subtle and use the logo file exactly as provided — do not redesign or stylize it.`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const imageUrl = await generateImage(imagePrompt);
      return { imageUrl, imagePrompt };
    })
  );

  // ── Step 3: Generate video if enabled ─────────────────────────────
  let videoUrl: string | null = null;
  if (project.videoEnabled) {
    const scriptPrompt = `Write a 25-second video ad script for an avatar spokesperson.
Structure: Hook (5s) → Value (15s) → CTA (5s).
Product: ${project.name}. Angle: ${angle.hypothesis}. Persona: ${angle.targetPersona}.
Keep it conversational, direct, under 75 words. Return only the script text.`;

    try {
      const script = await callAdLabClaude({
        purpose: "creative-video-script",
        systemPrompt: "You are a video ad scriptwriter.",
        userPrompt: scriptPrompt,
        maxTokens: 500,
      });
      videoUrl = await generateHeyGenVideo(script, project);
    } catch {
      console.warn("[adlab] Video script generation failed");
    }
  }

  // ── Step 4: Persist creatives ─────────────────────────────────────
  const created = await Promise.all(
    creatives.map((creative, i) =>
      prisma.adLabCreative.create({
        data: {
          angleId,
          headline: creative.headline,
          primaryText: creative.primaryText,
          description: creative.description,
          cta: creative.cta,
          imageUrl: imageResults[i]?.imageUrl ?? null,
          imagePrompt: imageResults[i]?.imagePrompt ?? null,
          videoUrl: i === 0 ? videoUrl : null, // video on first variant only
          complianceStatus: "pending",
          approved: false,
        },
      })
    )
  );

  return NextResponse.json({ creatives: created });
}
