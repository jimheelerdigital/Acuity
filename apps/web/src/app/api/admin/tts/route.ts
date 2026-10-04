/**
 * POST /api/admin/tts
 *
 * One-off voiceovers with ElevenLabs (2026-10-04, per Keenan: dinosaur
 * documentary voiceovers in a specific ElevenLabs voice). The API key only
 * lives in Vercel, so generation runs here: text → MP3 → uploaded to the
 * public adlab-creatives bucket under voiceover/ → returns the URL.
 *
 * Body: { text: string, voiceId: string, modelId?: string,
 *         stability?: number, similarity?: number, style?: number }
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return NextResponse.json({ error: "ELEVENLABS_API_KEY is not set" }, { status: 500 });

  const body = (await req.json().catch(() => null)) as {
    text?: string; voiceId?: string; modelId?: string; stability?: number; similarity?: number; style?: number;
  } | null;
  const text = body?.text?.trim();
  const voiceId = body?.voiceId?.trim();
  if (!text || !voiceId || !/^[A-Za-z0-9]{10,40}$/.test(voiceId)) {
    return NextResponse.json({ error: "text and a valid voiceId are required" }, { status: 400 });
  }
  if (text.length > 3000) return NextResponse.json({ error: "text too long" }, { status: 400 });

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_192`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: body?.modelId ?? "eleven_multilingual_v2",
      voice_settings: {
        stability: body?.stability ?? 0.5,
        similarity_boost: body?.similarity ?? 0.8,
        style: body?.style ?? 0.15,
        use_speaker_boost: true,
      },
    }),
    signal: AbortSignal.timeout(100_000),
  });
  if (!res.ok) {
    return NextResponse.json({ error: `ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}` }, { status: 502 });
  }
  const audio = Buffer.from(await res.arrayBuffer());
  const { supabase } = await import("@/lib/supabase.server");
  const name = `voiceover/${voiceId}-${Date.now()}.mp3`;
  const { error } = await supabase.storage.from("adlab-creatives").upload(name, audio, { contentType: "audio/mpeg", upsert: true });
  if (error) return NextResponse.json({ error: `upload failed: ${error.message}` }, { status: 500 });
  return NextResponse.json({ url: supabase.storage.from("adlab-creatives").getPublicUrl(name).data.publicUrl, bytes: audio.length });
}
