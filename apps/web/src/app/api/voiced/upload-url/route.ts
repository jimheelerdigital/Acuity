/**
 * POST /api/voiced/upload-url — a signed Supabase upload URL for Keenan's
 * recording (2026-09-30, voiced daily videos). The phone uploads straight
 * to Storage, so Vercel's request body limit never applies.
 *
 * Auth: the HMAC token from the script email (no login).
 * Body: { date, brand, t, filename }
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const AUDIO_EXT = new Set(["m4a", "mp3", "wav", "aac", "mp4", "caf", "ogg", "webm", "3gp", "amr"]);

export async function POST(req: NextRequest) {
  const { isVoicedBrand, isVoicedDate, checkVoicedToken, voicedDir } = await import("@/lib/content-factory/voiced");
  const body = (await req.json().catch(() => ({}))) as { date?: string; brand?: string; t?: string; filename?: string };
  if (!isVoicedDate(body.date) || !isVoicedBrand(body.brand) || !checkVoicedToken(body.date, body.brand, body.t)) {
    return NextResponse.json({ error: "This link isn't valid." }, { status: 403 });
  }
  const ext = (body.filename?.split(".").pop() ?? "m4a").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!AUDIO_EXT.has(ext)) {
    return NextResponse.json({ error: "That doesn't look like an audio file (m4a, mp3 or wav)." }, { status: 400 });
  }
  const path = `${voicedDir(body.date, body.brand)}/recording-${Date.now()}.${ext}`;
  const { supabase } = await import("@/lib/supabase.server");
  const { data, error } = await supabase.storage.from("content-factory").createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ error: `Couldn't start the upload: ${error?.message ?? "unknown"}` }, { status: 500 });
  }
  return NextResponse.json({ signedUrl: data.signedUrl, path });
}
