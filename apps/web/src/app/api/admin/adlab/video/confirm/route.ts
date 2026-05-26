/**
 * POST /api/admin/adlab/video/confirm — send script to HeyGen for BOTH avatars (primary + secondary),
 * poll until complete, upload to Supabase, create video creatives under the angle.
 *
 * Accepts: { angleId, scriptText, hookLine, primaryAvatar: { id, voiceId, name, gender }, secondaryAvatar?: same }
 * If secondaryAvatar is omitted or null, only one video is generated.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — HeyGen rendering can take a while

const HEYGEN_BASE = "https://api.heygen.com";

interface AvatarConfig {
  id: string;
  voiceId: string;
  name: string;
  gender: string;
}

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
    // Enable auto-captions — HeyGen burns bold word-by-word subtitles into the video
    // and returns a separate captioned_video_url in the status response
    caption: true,
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

    if (res.status === 400 || res.status === 404) {
      const lower = text.toLowerCase();
      if (lower.includes("avatar") && (lower.includes("not found") || lower.includes("look"))) {
        throw new Error(
          `HeyGen avatar not found (look_id: ${params.avatarId}). ` +
          `Update the Avatar Look ID in project settings.`
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
  const maxAttempts = 60;
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
    const captionedUrl = data?.data?.captioned_video_url;
    const regularUrl = data?.data?.video_url;
    console.log(`[adlab-heygen] Poll ${i + 1}: status=${status}, captioned=${!!captionedUrl}, regular=${!!regularUrl}`);

    if (status === "completed") {
      // Prefer the captioned version (has burned-in subtitles)
      const videoUrl = captionedUrl || regularUrl;
      if (captionedUrl) {
        console.log("[adlab-heygen] Using captioned video URL");
      } else {
        console.log("[adlab-heygen] No captioned URL available, using regular video URL");
      }
      return { status: "completed", videoUrl };
    }
    if (status === "failed") {
      return { status: "failed", error: data.data.error || "HeyGen rendering failed" };
    }
  }

  return { status: "timeout", error: "Video processing timed out after 5 minutes" };
}

async function uploadToSupabase(videoUrl: string, filename: string): Promise<string> {
  const { supabase } = await import("@/lib/supabase.server");

  // Download the video from HeyGen (URL expires — must persist to our own storage)
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Failed to download video from HeyGen: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  if (buffer.length < 1000) {
    throw new Error(`Downloaded video is suspiciously small (${buffer.length} bytes) — HeyGen URL may have expired`);
  }

  console.log(`[adlab-heygen] Uploading to Supabase: ${filename}, size: ${buffer.length} bytes`);

  const { error } = await supabase.storage
    .from("adlab-videos")
    .upload(filename, buffer, { contentType: "video/mp4", upsert: true });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from("adlab-videos").getPublicUrl(filename);
  return data.publicUrl;
}

/** Process one avatar: create HeyGen video → poll → upload → create creative record */
async function processOneAvatar(params: {
  avatar: AvatarConfig;
  angleId: string;
  scriptText: string;
  hookLine: string;
  presenterTag: string;
  existingCreative: { id: string; headline: string; primaryText: string; description: string; cta: string } | null;
}): Promise<{ status: string; videoUrl?: string; creativeId?: string; error?: string; presenterTag: string }> {
  const { avatar, angleId, scriptText, hookLine, presenterTag, existingCreative } = params;
  const tag = presenterTag;

  try {
    const heygenVideoId = await createHeyGenVideo({
      avatarId: avatar.id,
      voiceId: avatar.voiceId,
      scriptText,
    });

    const result = await pollVideoStatus(heygenVideoId);

    if (result.status !== "completed" || !result.videoUrl) {
      return { status: "failed", error: result.error || `${tag} video failed`, presenterTag: tag };
    }

    // Upload to Supabase — HeyGen URLs expire, so we MUST persist our own copy
    const safeName = avatar.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const finalUrl = await uploadToSupabase(result.videoUrl, `${angleId}_${safeName}.mp4`);

    // Create or update video creative record under this angle
    let creativeId: string;
    if (existingCreative) {
      await prisma.adLabCreative.update({
        where: { id: existingCreative.id },
        data: { videoUrl: finalUrl, videoPresenterTag: tag, heygenVideoId },
      });
      creativeId = existingCreative.id;
    } else {
      const creative = await prisma.adLabCreative.create({
        data: {
          angleId,
          creativeType: "video",
          headline: hookLine,
          primaryText: scriptText,
          description: `Video — ${tag}`,
          cta: "Learn More",
          videoUrl: finalUrl,
          videoPresenterTag: tag,
          heygenVideoId,
          generationPrompt: scriptText,
          approved: true,
        },
      });
      creativeId = creative.id;
    }

    return { status: "complete", videoUrl: finalUrl, creativeId, presenterTag: tag };
  } catch (err) {
    return {
      status: "failed",
      error: `${tag}: ${err instanceof Error ? err.message : String(err)}`,
      presenterTag: tag,
    };
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json();
    const { angleId, scriptText, hookLine, primaryAvatar, secondaryAvatar } = body as {
      angleId: string;
      scriptText: string;
      hookLine: string;
      primaryAvatar: AvatarConfig;
      secondaryAvatar?: AvatarConfig | null;
    };

    // Backward compat: accept old { avatarId, voiceId } format
    const primary: AvatarConfig = primaryAvatar || {
      id: body.avatarId,
      voiceId: body.voiceId,
      name: body.avatarName || body.avatarId || "Unknown",
      gender: "male",
    };

    if (!angleId || !scriptText || !primary.id || !primary.voiceId) {
      return NextResponse.json({ error: "angleId, scriptText, primaryAvatar (with id + voiceId) required" }, { status: 400 });
    }

    // Mark angle as processing
    await prisma.adLabAngle.update({
      where: { id: angleId },
      data: {
        videoScriptText: scriptText,
        videoHookLine: hookLine || scriptText.split(/[.!?]/)[0].trim(),
        videoAvatarId: primary.id,
        videoStatus: "processing",
      },
    });

    // Find existing video creatives for this angle (to update rather than duplicate)
    const existingVideoCreatives = await prisma.adLabCreative.findMany({
      where: { angleId, creativeType: "video" },
      select: { id: true, videoPresenterTag: true, headline: true, primaryText: true, description: true, cta: true },
    });

    const presenterTag = (a: AvatarConfig) => {
      const g = a.gender?.charAt(0).toUpperCase() + a.gender?.slice(1);
      return `${g} — ${a.name}`;
    };

    const primaryTag = presenterTag(primary);
    const existingPrimary = existingVideoCreatives.find((c) => c.videoPresenterTag === primaryTag) || null;

    // Build list of avatar jobs to run in parallel
    const jobs: Promise<{ status: string; videoUrl?: string; creativeId?: string; error?: string; presenterTag: string }>[] = [];

    jobs.push(processOneAvatar({
      avatar: primary,
      angleId,
      scriptText,
      hookLine,
      presenterTag: primaryTag,
      existingCreative: existingPrimary,
    }));

    if (secondaryAvatar?.id && secondaryAvatar?.voiceId) {
      const secTag = presenterTag(secondaryAvatar);
      const existingSec = existingVideoCreatives.find((c) => c.videoPresenterTag === secTag) || null;

      jobs.push(processOneAvatar({
        avatar: secondaryAvatar,
        angleId,
        scriptText,
        hookLine,
        presenterTag: secTag,
        existingCreative: existingSec,
      }));
    }

    // Fire both HeyGen jobs in parallel
    console.log(`[adlab-heygen] Processing ${jobs.length} avatar(s) for angle ${angleId}`);
    const results = await Promise.all(jobs);

    // Check results
    const successes = results.filter((r) => r.status === "complete");
    const failures = results.filter((r) => r.status === "failed");

    // Update angle status based on primary result
    const primaryResult = results[0];
    await prisma.adLabAngle.update({
      where: { id: angleId },
      data: {
        videoUrl: primaryResult.videoUrl || null,
        videoStatus: successes.length > 0 ? "complete" : "failed",
        heygenVideoId: null, // Multiple videos now — tracked per creative
      },
    });

    if (successes.length === 0) {
      return NextResponse.json({
        error: failures.map((f) => f.error).join("; "),
      }, { status: 500 });
    }

    return NextResponse.json({
      status: "complete",
      results: results.map((r) => ({
        presenterTag: r.presenterTag,
        status: r.status,
        videoUrl: r.videoUrl,
        creativeId: r.creativeId,
        error: r.error,
      })),
      totalGenerated: successes.length,
      totalFailed: failures.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[adlab-video-confirm] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
