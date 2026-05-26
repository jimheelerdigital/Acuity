/**
 * POST /api/admin/adlab/video/generate — generate a UGC-style video script for an angle.
 * Returns the script for user review before sending to HeyGen.
 *
 * Accepts: { angleId }
 * Returns: { scriptText, hookLine, primaryAvatar, secondaryAvatar? }
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { callAdLabClaude, extractJson } from "@/lib/adlab/claude";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface AvatarConfig {
  id: string;
  voiceId: string;
  name: string;
  gender: string;
}

// Default fallback avatars — used only when no primary/secondary configured on the project
const DEFAULT_PRIMARY: AvatarConfig = { id: "josh_lite3_20230714", voiceId: "131a436c47064f708210df6628ef8f32", name: "Josh", gender: "male" };
const DEFAULT_SECONDARY: AvatarConfig = { id: "Angela-inblackskirt-20220820", voiceId: "2d5b0e6cf36f460aa7fc47e3eee4ba54", name: "Angela", gender: "female" };

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
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
        creatives: { take: 3 },
      },
    });

    if (!angle) {
      return NextResponse.json({ error: "Angle not found" }, { status: 404 });
    }

    const project = angle.experiment.project;

    // Gather existing copy from this angle's creatives for context
    const sampleCopy = angle.creatives
      .map((c) => `Headline: "${c.headline}" | Primary: "${c.primaryText}"`)
      .join("\n");

    // Generate video script via Claude
    const systemPrompt = `Write a 15-30 second UGC-style video script for a TikTok/Reels ad. The speaker is a real person sharing their genuine experience with Acuity, an AI voice journal app. They talk directly to camera casually — like telling a friend about something they discovered.

Rules:
- Start with a hook in the first 2 seconds that stops scrolling
- Never say 'download now' or 'link in bio' — end with a natural recommendation
- Sound like a real person, not a copywriter. Use contractions. One filler word is fine.
- Mention 'Acuity' exactly once, naturally
- Talk about EXPERIENCE and RESULT, not features
- Under 75 words
- Match the emotional angle provided
- Don't mention pricing or trial length

PRODUCT: ${project.name}
BRAND VOICE: ${project.brandVoiceGuide}

ANGLE:
- Hypothesis: ${angle.hypothesis}
- Target persona: ${angle.targetPersona}
- Value surface: ${angle.valueSurface}

TOPIC BRIEF: ${angle.experiment.topicBrief}

${sampleCopy ? `EXISTING AD COPY FOR THIS ANGLE (match the tone):\n${sampleCopy}` : ""}

Return ONLY valid JSON: { "scriptText": "the full script", "hookLine": "just the first sentence/hook" }`;

    const raw = await callAdLabClaude({
      purpose: "video-script",
      systemPrompt,
      userPrompt: "Generate one UGC-style video script. Return only the JSON.",
      maxTokens: 500,
    });

    const parsed = JSON.parse(extractJson(raw));
    const scriptText = parsed.scriptText as string;
    const hookLine = parsed.hookLine as string;

    if (!scriptText || !hookLine) {
      return NextResponse.json({ error: "Script generation returned empty result" }, { status: 500 });
    }

    // Resolve avatars from project settings, fall back to defaults
    const primaryAvatar = ((project as Record<string, unknown>).videoPrimaryAvatar as AvatarConfig | null) || DEFAULT_PRIMARY;
    const secondaryRaw = (project as Record<string, unknown>).videoSecondaryAvatar as AvatarConfig | null;
    const secondaryAvatar = secondaryRaw?.id ? secondaryRaw : null;

    // Save script to angle (status = generating, meaning script ready for review)
    await prisma.adLabAngle.update({
      where: { id: angleId },
      data: {
        videoScriptText: scriptText,
        videoHookLine: hookLine,
        videoAvatarId: primaryAvatar.id,
        videoStatus: "generating",
      },
    });

    return NextResponse.json({
      scriptText,
      hookLine,
      primaryAvatar,
      secondaryAvatar,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[adlab-video-generate] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
