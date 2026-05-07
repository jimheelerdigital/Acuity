/**
 * POST /api/admin/adlab/creatives/generate — generate creatives for an angle.
 * Accepts { angleId }. Generates:
 *   - 3 copy variants via Claude (shared between image and video)
 *   - 3 image creatives via gpt-image-2 (if project.imageEnabled)
 *   - 3 video creatives via HeyGen (if project.videoEnabled)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { callAdLabClaude, extractJson } from "@/lib/adlab/claude";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // images + videos can be slow

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

async function generateImageWithLogo(
  prompt: string,
  logoUrl: string | null
): Promise<{ imageBuffer: Buffer } | null> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("[adlab] OPENAI_API_KEY not set, skipping image generation");
    return null;
  }

  try {
    // Download logo if available — pass as reference image to gpt-image-2
    const images: Array<{ source: { type: "base64"; media_type: string; data: string } }> = [];

    if (logoUrl) {
      try {
        const logoRes = await fetch(logoUrl);
        if (logoRes.ok) {
          const logoBuf = Buffer.from(await logoRes.arrayBuffer());
          const contentType = logoRes.headers.get("content-type") || "image/png";
          images.push({
            source: {
              type: "base64",
              media_type: contentType,
              data: logoBuf.toString("base64"),
            },
          });
        }
      } catch (err) {
        console.warn("[adlab] Failed to download logo for reference:", err);
      }
    }

    // Call gpt-image-2 via the images.generate endpoint
    const response = await openai().images.generate({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "medium",
    } as Parameters<typeof openai extends () => infer R ? R["images"]["generate"] : never>[0]);

    // gpt-image-1 returns base64 by default
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

// ─── HeyGen video generation ─────────────────────────────────────────────

async function generateHeyGenVideo(script: string): Promise<Buffer | null> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    console.warn("[adlab] HEYGEN_API_KEY not set, skipping video generation");
    return null;
  }

  try {
    // Create video
    const createRes = await fetch("https://api.heygen.com/v2/video/generate", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        video_inputs: [
          {
            character: {
              type: "avatar",
              avatar_id: "Anna_public_3_20240108", // Default avatar — make configurable per project later
              avatar_style: "normal",
            },
            voice: {
              type: "text",
              input_text: script,
              voice_id: "2d5b0e6cf36f460aa7fc47e3eee4ba54", // Default neutral voice
            },
          },
        ],
        dimension: { width: 1080, height: 1080 },
      }),
    });

    if (!createRes.ok) {
      console.error("[adlab] HeyGen create failed:", createRes.status, await createRes.text());
      return null;
    }

    const { data } = await createRes.json();
    const videoId = data?.video_id;
    if (!videoId) {
      console.error("[adlab] HeyGen returned no video_id");
      return null;
    }

    // Poll for completion (max 5 minutes, 10s intervals)
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 10_000));

      const statusRes = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
        headers: { "X-Api-Key": apiKey },
      });

      if (!statusRes.ok) continue;

      const statusData = await statusRes.json();
      if (statusData.data?.status === "completed") {
        const videoUrl = statusData.data.video_url;
        if (!videoUrl) return null;

        // Download video
        const videoRes = await fetch(videoUrl);
        if (!videoRes.ok) return null;
        return Buffer.from(await videoRes.arrayBuffer());
      } else if (statusData.data?.status === "failed") {
        console.error("[adlab] HeyGen video failed:", statusData.data.error);
        return null;
      }
    }

    console.error("[adlab] HeyGen video timed out after 5 minutes");
    return null;
  } catch (err) {
    console.error("[adlab] HeyGen error:", err);
    return null;
  }
}

// ─── Main endpoint ────────────────────────────────────────────────────────

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

  // ── Step 2: CATEGORY 1 — Image creatives (gpt-image-2) ───────────
  if (project.imageEnabled) {
    for (const variant of copyVariants) {
      const imagePrompt = [
        project.imageStylePrompt,
        `Scene: Visual metaphor for "${angle.hypothesis}" targeting ${angle.targetPersona}.`,
        `The ad headline is "${variant.headline}".`,
        "Use the provided reference image as the brand logo. Place it in the bottom-right corner at approximately 5% of the image width. Use the logo file exactly as provided — do not stylize, recolor, recreate, or redesign it.",
      ].join("\n");

      const imageResult = await generateImageWithLogo(imagePrompt, project.logoUrl);

      let imageUrl: string | null = null;
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
        imageUrl = await uploadToSupabase(
          imageResult.imageBuffer,
          `${creative.id}.png`,
          "image/png"
        );
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

  // ── Step 3: CATEGORY 2 — Video creatives (HeyGen) ────────────────
  if (project.videoEnabled) {
    for (const variant of copyVariants) {
      const scriptPrompt = `Write a 25-second video ad script for an avatar spokesperson.
Structure: Hook (5s, match this headline angle: "${variant.headline}") → Value (15s, core benefit) → CTA (5s, action: "${variant.cta}").
Product: ${project.name}. Angle: ${angle.hypothesis}. Persona: ${angle.targetPersona}.
Keep it conversational, direct, 75-90 spoken words. Return only the script text, no formatting.`;

      let script = "";
      try {
        script = await callAdLabClaude({
          purpose: "creative-video-script",
          systemPrompt: "You are a video ad scriptwriter. Return only the spoken script text.",
          userPrompt: scriptPrompt,
          maxTokens: 500,
        });
      } catch {
        console.warn("[adlab] Video script generation failed");
        continue;
      }

      const creative = await prisma.adLabCreative.create({
        data: {
          angleId,
          creativeType: "video",
          headline: variant.headline,
          primaryText: variant.primaryText,
          description: variant.description,
          cta: variant.cta,
          generationPrompt: script,
          complianceStatus: "pending",
          approved: false,
        },
      });

      const videoBuffer = await generateHeyGenVideo(script);
      if (videoBuffer) {
        const videoUrl = await uploadToSupabase(
          videoBuffer,
          `${creative.id}.mp4`,
          "video/mp4"
        );
        if (videoUrl) {
          await prisma.adLabCreative.update({
            where: { id: creative.id },
            data: { videoUrl },
          });
        }
      }

      allCreated.push(creative.id);
    }
  }

  const creatives = await prisma.adLabCreative.findMany({
    where: { id: { in: allCreated } },
  });

  return NextResponse.json({ creatives });
}
