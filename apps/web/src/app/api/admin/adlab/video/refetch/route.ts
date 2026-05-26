/**
 * POST /api/admin/adlab/video/refetch — re-download a video from HeyGen and persist to Supabase.
 * Used to recover videos where the stored URL has expired (HeyGen URLs are temporary).
 *
 * Accepts: { creativeId } or { angleId }
 * - creativeId: re-fetch a specific video creative
 * - angleId: re-fetch the angle-level video (legacy single-avatar flow)
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HEYGEN_BASE = "https://api.heygen.com";

function heygenHeaders(): Record<string, string> {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY not configured");
  return { "X-Api-Key": key, "Content-Type": "application/json" };
}

async function fetchFreshVideoUrl(heygenVideoId: string): Promise<string> {
  const res = await fetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${heygenVideoId}`, {
    headers: heygenHeaders(),
  });
  if (!res.ok) {
    throw new Error(`HeyGen status API error ${res.status}`);
  }
  const data = await res.json();
  const status = data?.data?.status;
  if (status !== "completed") {
    throw new Error(`HeyGen video status is "${status}", not completed`);
  }
  const videoUrl = data?.data?.video_url;
  if (!videoUrl) {
    throw new Error("HeyGen returned no video_url");
  }
  return videoUrl;
}

async function downloadAndUpload(heygenVideoUrl: string, filename: string): Promise<string> {
  const { supabase } = await import("@/lib/supabase.server");

  const res = await fetch(heygenVideoUrl);
  if (!res.ok) throw new Error(`Failed to download video: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  if (buffer.length < 1000) {
    throw new Error(`Video file too small (${buffer.length} bytes) — URL may be expired`);
  }

  console.log(`[adlab-refetch] Uploading to Supabase: ${filename}, ${buffer.length} bytes`);

  const { error } = await supabase.storage
    .from("adlab-videos")
    .upload(filename, buffer, { contentType: "video/mp4", upsert: true });

  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  const { data } = supabase.storage.from("adlab-videos").getPublicUrl(filename);
  return data.publicUrl;
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const { creativeId, angleId } = await req.json();

    if (creativeId) {
      // Re-fetch a specific video creative
      const creative = await prisma.adLabCreative.findUnique({
        where: { id: creativeId },
        select: { id: true, heygenVideoId: true, angleId: true, videoPresenterTag: true },
      });

      if (!creative) return NextResponse.json({ error: "Creative not found" }, { status: 404 });
      if (!creative.heygenVideoId) return NextResponse.json({ error: "No HeyGen video ID stored — cannot re-fetch" }, { status: 400 });

      const freshUrl = await fetchFreshVideoUrl(creative.heygenVideoId);
      const tag = (creative.videoPresenterTag || "video").replace(/[^a-z0-9]/gi, "_").toLowerCase();
      const supabaseUrl = await downloadAndUpload(freshUrl, `${creative.angleId}_${tag}.mp4`);

      await prisma.adLabCreative.update({
        where: { id: creativeId },
        data: { videoUrl: supabaseUrl },
      });

      return NextResponse.json({ videoUrl: supabaseUrl, status: "refetched" });
    }

    if (angleId) {
      // Re-fetch angle-level video (legacy)
      const angle = await prisma.adLabAngle.findUnique({
        where: { id: angleId },
        select: { id: true, heygenVideoId: true },
      });

      if (!angle) return NextResponse.json({ error: "Angle not found" }, { status: 404 });
      if (!angle.heygenVideoId) return NextResponse.json({ error: "No HeyGen video ID stored — cannot re-fetch" }, { status: 400 });

      const freshUrl = await fetchFreshVideoUrl(angle.heygenVideoId);
      const supabaseUrl = await downloadAndUpload(freshUrl, `${angleId}.mp4`);

      await prisma.adLabAngle.update({
        where: { id: angleId },
        data: { videoUrl: supabaseUrl },
      });

      return NextResponse.json({ videoUrl: supabaseUrl, status: "refetched" });
    }

    return NextResponse.json({ error: "creativeId or angleId required" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[adlab-refetch] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
