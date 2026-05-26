/**
 * GET /api/admin/adlab/heygen/avatars — list all available HeyGen avatars and looks.
 * Proxies to HeyGen's /v2/avatars endpoint.
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

  try {
    const res = await fetch("https://api.heygen.com/v2/avatars", {
      headers: { "X-Api-Key": key },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `HeyGen API error ${res.status}: ${text}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const avatars = data?.data?.avatars ?? [];

    // Flatten into a usable list: each avatar can have multiple looks
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
        // Avatar with no looks — the avatar_id IS the look_id
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

    // Sort: instant avatars first, then by name
    flat.sort((a, b) => {
      if (a.isInstantAvatar !== b.isInstantAvatar) return a.isInstantAvatar ? -1 : 1;
      return a.avatarName.localeCompare(b.avatarName);
    });

    return NextResponse.json({ avatars: flat, total: flat.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
