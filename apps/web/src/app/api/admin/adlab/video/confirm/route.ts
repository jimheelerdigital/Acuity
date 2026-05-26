/**
 * POST /api/admin/adlab/video/confirm — send script to HeyGen, poll until complete,
 * upload to Supabase, save video URL on the angle.
 *
 * Accepts: { angleId, scriptText, hookLine, avatarId, voiceId }
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — HeyGen rendering can take a while

const HEYGEN_BASE = "https://api.heygen.com";

function heygenHeaders(): Record<string, string> {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY not configured");
  return {
    "X-Api-Key": key,
    "Content-Type": "application/json",
  };
}

async function createHeyGenVideo(params: {
  avatarId: string;
  voiceId: string;
  scriptText: string;
}): Promise<string> {
  const body = {
    video_inputs: [
      {
        character: {
          type: "avatar",
          avatar_id: params.avatarId,
          avatar_style: "normal",
        },
        voice: {
          type: "text",
          input_text: params.scriptText,
          voice_id: params.voiceId,
        },
        background: {
          type: "color",
          value: "#181614",
        },
      },
    ],
    dimension: {
      width: 1080,
      height: 1920,
    },
  };

  console.log("[adlab-heygen] Creating video, avatar:", params.avatarId);

  const res = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
    method: "POST",
    headers: heygenHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[adlab-heygen] Create failed:", res.status, text);

    // Parse specific HeyGen error codes for actionable messages
    if (res.status === 400 || res.status === 404) {
      const lower = text.toLowerCase();
      if (lower.includes("avatar") && (lower.includes("not found") || lower.includes("look"))) {
        throw new Error(
          `HeyGen avatar not found (look_id: ${params.avatarId}). ` +
          `The avatar may have been deleted or the look ID is stale. ` +
          `Update the Avatar Look ID in project settings, or browse available avatars at /api/admin/adlab/heygen/avatars.`
        );
      }
    }

    throw new Error(`HeyGen API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const videoId = data?.data?.video_id;
  if (!videoId) {
    throw new Error("HeyGen did not return a video_id");
  }

  console.log("[adlab-heygen] Video created:", videoId);
  return videoId;
}

async function pollVideoStatus(videoId: string): Promise<{ status: string; videoUrl?: string; error?: string }> {
  const maxAttempts = 60; // 5 minutes at 5s intervals
  const pollInterval = 5000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const res = await fetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${videoId}`, {
      headers: heygenHeaders(),
    });

    if (!res.ok) {
      console.warn(`[adlab-heygen] Poll ${i + 1} failed: ${res.status}`);
      continue;
    }

    const data = await res.json();
    const status = data?.data?.status;
    console.log(`[adlab-heygen] Poll ${i + 1}: status=${status}`);

    if (status === "completed") {
      return { status: "completed", videoUrl: data.data.video_url };
    }
    if (status === "failed") {
      return { status: "failed", error: data.data.error || "HeyGen rendering failed" };
    }
    // "processing" or "pending" — continue polling
  }

  return { status: "timeout", error: "Video processing timed out after 5 minutes" };
}

async function uploadToSupabase(videoUrl: string, filename: string): Promise<string | null> {
  try {
    const { supabase } = await import("@/lib/supabase.server");

    // Download the video from HeyGen
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`Failed to download video: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    console.log(`[adlab-heygen] Uploading to Supabase: ${filename}, size: ${buffer.length} bytes`);

    const { error } = await supabase.storage
      .from("adlab-videos")
      .upload(filename, buffer, { contentType: "video/mp4", upsert: true });

    if (error) {
      console.error("[adlab-heygen] Supabase upload failed:", error.message);
      return null;
    }

    const { data } = supabase.storage.from("adlab-videos").getPublicUrl(filename);
    return data.publicUrl;
  } catch (err) {
    console.error("[adlab-heygen] Supabase upload error:", err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const { angleId, scriptText, hookLine, avatarId, voiceId } = await req.json();

    if (!angleId || !scriptText || !avatarId || !voiceId) {
      return NextResponse.json({ error: "angleId, scriptText, avatarId, voiceId required" }, { status: 400 });
    }

    // Update angle with possibly edited script and mark as processing
    await prisma.adLabAngle.update({
      where: { id: angleId },
      data: {
        videoScriptText: scriptText,
        videoHookLine: hookLine || scriptText.split(/[.!?]/)[0].trim(),
        videoAvatarId: avatarId,
        videoStatus: "processing",
      },
    });

    // Send to HeyGen
    let heygenVideoId: string;
    try {
      heygenVideoId = await createHeyGenVideo({ avatarId, voiceId, scriptText });
    } catch (err) {
      await prisma.adLabAngle.update({
        where: { id: angleId },
        data: { videoStatus: "failed" },
      });
      return NextResponse.json({
        error: `HeyGen creation failed: ${err instanceof Error ? err.message : String(err)}`,
      }, { status: 500 });
    }

    // Save HeyGen video ID for reference
    await prisma.adLabAngle.update({
      where: { id: angleId },
      data: { heygenVideoId },
    });

    // Poll until complete
    const result = await pollVideoStatus(heygenVideoId);

    if (result.status !== "completed" || !result.videoUrl) {
      await prisma.adLabAngle.update({
        where: { id: angleId },
        data: { videoStatus: "failed" },
      });
      return NextResponse.json({
        error: result.error || "Video processing failed",
      }, { status: 500 });
    }

    // Upload to Supabase
    const supabaseUrl = await uploadToSupabase(result.videoUrl, `${angleId}.mp4`);
    const finalUrl = supabaseUrl || result.videoUrl; // Fall back to HeyGen URL if upload fails

    // Save final video URL
    await prisma.adLabAngle.update({
      where: { id: angleId },
      data: {
        videoUrl: finalUrl,
        videoStatus: "complete",
      },
    });

    return NextResponse.json({
      videoUrl: finalUrl,
      heygenVideoId,
      status: "complete",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[adlab-video-confirm] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
