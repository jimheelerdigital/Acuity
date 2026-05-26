/**
 * GET /api/admin/adlab/heygen/avatars — list all available HeyGen avatars, looks, AND voices.
 * Fetches both /v2/avatars and /v2/voices in parallel and returns a combined response.
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const key = process.env.HEYGEN_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "HEYGEN_API_KEY not configured" },
      { status: 500 }
    );
  }

  const headers = { "X-Api-Key": key };

  try {
    // Fetch avatars and voices in parallel
    const [avatarsRes, voicesRes] = await Promise.all([
      fetch("https://api.heygen.com/v2/avatars", { headers }),
      fetch("https://api.heygen.com/v2/voices", { headers }),
    ]);

    if (!avatarsRes.ok) {
      const text = await avatarsRes.text();
      return NextResponse.json(
        { error: `HeyGen avatars API error ${avatarsRes.status}: ${text}` },
        { status: avatarsRes.status }
      );
    }

    const avatarsData = await avatarsRes.json();
    const avatars = avatarsData?.data?.avatars ?? [];

    // Parse voices — handle both success and failure gracefully
    let voices: {
      voiceId: string;
      voiceName: string;
      language: string;
      gender: string;
      isCloned: boolean;
      previewAudio: string | null;
    }[] = [];

    if (voicesRes.ok) {
      const voicesData = await voicesRes.json();
      const rawVoices = voicesData?.data?.voices ?? [];
      voices = rawVoices.map((v: Record<string, unknown>) => ({
        voiceId: (v.voice_id as string) || "",
        voiceName: (v.display_name as string) || (v.name as string) || (v.voice_id as string) || "",
        language: (v.language as string) || "en",
        gender: (v.gender as string) || "unknown",
        isCloned: v.type === "cloned" || v.is_cloned === true,
        previewAudio: (v.preview_audio as string) || null,
      }));
    }

    // Sort voices: cloned first, then by name
    voices.sort((a, b) => {
      if (a.isCloned !== b.isCloned) return a.isCloned ? -1 : 1;
      return a.voiceName.localeCompare(b.voiceName);
    });

    // Flatten avatars into a usable list
    const flat: {
      avatarId: string;
      avatarName: string;
      gender: string;
      lookId: string;
      lookName: string;
      previewUrl: string | null;
      isInstantAvatar: boolean;
    }[] = [];

    for (const avatar of avatars) {
      const isInstant = avatar.avatar_type === "instant" || avatar.avatar_type === "photo";
      if (avatar.avatar_id && !avatar.looks?.length) {
        flat.push({
          avatarId: avatar.avatar_id,
          avatarName: avatar.avatar_name || avatar.avatar_id,
          gender: avatar.gender || "unknown",
          lookId: avatar.avatar_id,
          lookName: "default",
          previewUrl: avatar.preview_image_url || avatar.preview_video_url || null,
          isInstantAvatar: isInstant,
        });
      }
      if (avatar.looks?.length) {
        for (const look of avatar.looks) {
          flat.push({
            avatarId: avatar.avatar_id,
            avatarName: avatar.avatar_name || avatar.avatar_id,
            gender: avatar.gender || "unknown",
            lookId: look.look_id || avatar.avatar_id,
            lookName: look.look_name || "default",
            previewUrl: look.preview_image_url || look.preview_video_url || avatar.preview_image_url || null,
            isInstantAvatar: isInstant,
          });
        }
      }
    }

    flat.sort((a, b) => {
      if (a.isInstantAvatar !== b.isInstantAvatar) return a.isInstantAvatar ? -1 : 1;
      return a.avatarName.localeCompare(b.avatarName);
    });

    return NextResponse.json({
      avatars: flat,
      voices,
      totalAvatars: flat.length,
      totalVoices: voices.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
