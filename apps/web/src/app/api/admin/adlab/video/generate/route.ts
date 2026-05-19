/**
 * POST /api/admin/adlab/video/generate — generate a UGC-style video script for an angle.
 * Returns the script for user review before sending to HeyGen.
 *
 * Accepts: { angleId }
 * Returns: { scriptText, hookLine, avatarId, voiceId, avatarName }
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { callAdLabClaude, extractJson } from "@/lib/adlab/claude";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Default curated HeyGen avatars — diverse UGC-style lineup
// These are well-known HeyGen public avatar IDs for natural-looking people
const DEFAULT_AVATARS = [
  { id: "Angela-inblackskirt-20220820", voiceId: "2d5b0e6cf36f460aa7fc47e3eee4ba54", name: "Angela", gender: "female" },
  { id: "josh_lite3_20230714", voiceId: "131a436c47064f708210df6628ef8f32", name: "Josh", gender: "male" },
  { id: "Kayla-incasualsuit-20220818", voiceId: "1bd001e7e50f421d891986aad5571760", name: "Kayla", gender: "female" },
  { id: "Tyler-incasualsuit-20220721", voiceId: "077ab11b14f04ce0b49b5f0f3ccb7f09", name: "Tyler", gender: "male" },
  { id: "anna_public_3_20240108", voiceId: "1bd001e7e50f421d891986aad5571760", name: "Anna", gender: "female" },
  { id: "Ethan_public_20240828", voiceId: "131a436c47064f708210df6628ef8f32", name: "Ethan", gender: "male" },
];

function selectAvatar(
  usedAvatarIds: string[],
  projectAvatars: { id: string; voiceId: string; name: string; gender: string }[] | null
): { id: string; voiceId: string; name: string; gender: string } {
  const avatars = projectAvatars && projectAvatars.length > 0 ? projectAvatars : DEFAULT_AVATARS;

  // Determine what gender was last used to alternate
  const lastUsedId = usedAvatarIds[usedAvatarIds.length - 1];
  const lastUsed = avatars.find((a) => a.id === lastUsedId);
  const preferGender = lastUsed?.gender === "female" ? "male" : "female";

  // Filter to preferred gender first
  const preferred = avatars.filter((a) => a.gender === preferGender && !usedAvatarIds.includes(a.id));
  if (preferred.length > 0) return preferred[0];

  // Fall back to any unused avatar
  const unused = avatars.filter((a) => !usedAvatarIds.includes(a.id));
  if (unused.length > 0) return unused[0];

  // All used — cycle back, still prefer gender alternation
  const cycled = avatars.filter((a) => a.gender === preferGender);
  if (cycled.length > 0) return cycled[0];

  return avatars[0];
}

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
          include: {
            project: true,
            angles: { select: { id: true, videoAvatarId: true } },
          },
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

    // Select avatar — rotate through, alternating gender
    const usedAvatarIds = angle.experiment.angles
      .map((a) => a.videoAvatarId)
      .filter((id): id is string => !!id);

    const projectAvatars = (project as Record<string, unknown>).videoAvatars as { id: string; voiceId: string; name: string; gender: string }[] | null;
    const avatar = selectAvatar(usedAvatarIds, Array.isArray(projectAvatars) && projectAvatars.length > 0 ? projectAvatars : null);

    // Save script to angle (status = generating, meaning script ready for review)
    await prisma.adLabAngle.update({
      where: { id: angleId },
      data: {
        videoScriptText: scriptText,
        videoHookLine: hookLine,
        videoAvatarId: avatar.id,
        videoStatus: "generating",
      },
    });

    return NextResponse.json({
      scriptText,
      hookLine,
      avatarId: avatar.id,
      voiceId: avatar.voiceId,
      avatarName: avatar.name,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[adlab-video-generate] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
