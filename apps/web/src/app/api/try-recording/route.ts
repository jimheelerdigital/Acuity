/**
 * POST /api/try-recording
 *
 * Unauthenticated endpoint for the "Try it now" recording flow.
 * Accepts audio, processes through Whisper + Claude, stores the result
 * in a TrySession record (not a real Entry), and returns the extraction.
 *
 * Rate limited by:
 *   - 5 per hour per IP (tryRecordingByIp)
 *   - 100 per day globally (tryRecordingDaily, adjustable via TRY_RECORDING_DAILY_CAP)
 *   - Per-session cookie (one try per browser session)
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

import { MAX_AUDIO_BYTES } from "@acuity/shared";

import { normalizeAudioMimeType, extensionForMimeType } from "@/lib/audio";
import { transcribeAudio, extractFromTranscript } from "@/lib/pipeline";
import { toClientError } from "@/lib/api-errors";
import {
  checkRateLimit,
  identifierFromRequest,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Sync pipeline — Whisper + Claude run inline. Needs time.
export const maxDuration = 120;

const TRY_SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TRY_STORAGE_BUCKET = "voice-entries-try";

export async function POST(req: NextRequest) {
  // ── 1. Per-session cookie check ────────────────────────────────────
  const existingToken = req.cookies.get("acuity_try_session")?.value;
  if (existingToken) {
    return NextResponse.json(
      { error: "TRY_ALREADY_USED", message: "You've already tried a recording. Sign up to continue." },
      { status: 403 }
    );
  }

  // ── 2. Rate limiting ───────────────────────────────────────────────
  const ipId = identifierFromRequest(req, "try-recording");
  const ipRl = await checkRateLimit(limiters.tryRecordingByIp, ipId);
  if (!ipRl.success) return rateLimitedResponse(ipRl);

  const globalRl = await checkRateLimit(limiters.tryRecordingDaily, "global");
  if (!globalRl.success) {
    return NextResponse.json(
      { error: "TRY_DAILY_CAP_REACHED", message: "Daily try limit reached. Sign up for unlimited access." },
      { status: 429 }
    );
  }

  // ── 3. Parse + validate audio ──────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data — expected multipart/form-data" },
      { status: 400 }
    );
  }

  const audioFile = formData.get("audio");
  if (!audioFile || !(audioFile instanceof Blob)) {
    return NextResponse.json(
      { error: "Missing required field: audio" },
      { status: 400 }
    );
  }

  if (audioFile.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: "Audio file exceeds the 25 MB limit" },
      { status: 413 }
    );
  }

  const rawMime = audioFile.type || "audio/webm";
  const mimeType = normalizeAudioMimeType(rawMime);
  if (!mimeType) {
    return NextResponse.json(
      { error: `Unsupported audio type: ${rawMime}` },
      { status: 415 }
    );
  }

  const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

  // ── 4. Generate session token ──────────────────────────────────────
  const sessionToken = randomBytes(32).toString("hex");

  // ── 5. Upload audio to try-specific bucket ─────────────────────────
  const { supabase } = await import("@/lib/supabase.server");
  const ext = extensionForMimeType(mimeType);
  const audioPath = `${sessionToken}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(TRY_STORAGE_BUCKET)
    .upload(audioPath, audioBuffer, { contentType: mimeType, upsert: false });

  if (uploadError) {
    console.error("[try-recording] Upload failed:", uploadError);
    return NextResponse.json(
      { error: "Audio upload failed" },
      { status: 502 }
    );
  }

  // ── 6. Run pipeline: Whisper → Claude ──────────────────────────────
  let transcript: string;
  try {
    transcript = await transcribeAudio(audioBuffer, mimeType);
  } catch (err) {
    console.error("[try-recording] Transcription failed:", err);
    // Clean up uploaded audio
    await supabase.storage.from(TRY_STORAGE_BUCKET).remove([audioPath]);
    return toClientError(err, 502);
  }

  if (transcript.length < 10) {
    await supabase.storage.from(TRY_STORAGE_BUCKET).remove([audioPath]);
    return NextResponse.json(
      { error: "Recording too short or unclear. Try again." },
      { status: 422 }
    );
  }

  let extraction: Record<string, unknown>;
  try {
    const todayISO = new Date().toISOString().slice(0, 10);
    extraction = await extractFromTranscript(transcript, todayISO) as unknown as Record<string, unknown>;
  } catch (err) {
    console.error("[try-recording] Extraction failed:", err);
    await supabase.storage.from(TRY_STORAGE_BUCKET).remove([audioPath]);
    return toClientError(err, 502);
  }

  // ── 7. Get client IP for the record ────────────────────────────────
  const xff = req.headers.get("x-forwarded-for");
  const clientIp = xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

  // ── 8. Store TrySession ────────────────────────────────────────────
  const { prisma } = await import("@/lib/prisma");
  const trySession = await prisma.trySession.create({
    data: {
      sessionToken,
      extractionData: extraction,
      audioPath,
      transcript,
      ipAddress: clientIp,
      expiresAt: new Date(Date.now() + TRY_SESSION_TTL_MS),
    },
  });

  // ── 9. Return extraction + set cookie ──────────────────────────────
  const response = NextResponse.json(
    {
      sessionToken,
      extraction,
      expiresAt: trySession.expiresAt.toISOString(),
    },
    { status: 201 }
  );

  // Set cookie so the same browser can't try again. Cookie expires in
  // 24 hours (longer than the session TTL to prevent quick retries).
  response.cookies.set("acuity_try_session", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24 hours
    path: "/",
  });

  return response;
}
