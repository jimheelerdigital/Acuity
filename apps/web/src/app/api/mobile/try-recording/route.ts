/**
 * POST /api/mobile/try-recording
 *
 * Mobile-facing twin of /api/try-recording. Onboarding-v2 slice 1
 * (2026-05-25). Accepts an anonymous recording from the mobile
 * pain-first flow, runs the same Whisper + Claude pipeline as the
 * web Try It Now flow, writes a TrySession row, and returns the
 * extraction so the slice 7 reveal screen can render it.
 *
 * Key differences from the web sibling:
 *   - No `acuity_try_session` cookie check — mobile uses an
 *     AsyncStorage device UUID (`anonDeviceId`) instead. The server
 *     stamps the column on the TrySession for per-device analytics
 *     + future per-device rate limiting; it is NOT used as a
 *     "you've already tried" gate today because the spec's mobile
 *     funnel intentionally allows a re-try after the slice 9
 *     extraction reveals.
 *   - Different rate limit bucket: tryRecordingByIpMobile (3/hr per
 *     IP, vs web's 5/hr).
 *   - 24-hour TrySession TTL (vs web's 5 minutes). The mobile signup
 *     flow has more steps (slices 7-10) before the user reaches the
 *     claim step, so a longer window keeps the funnel from breaking.
 *   - No Keenan notification email — that's a web-marketing artifact.
 *
 * Multipart contract:
 *   - audio       : Blob   (required, ≤ MAX_AUDIO_BYTES)
 *   - anonDeviceId: string (required, the AsyncStorage UUID)
 *
 * Response shape mirrors the web route's success body so the
 * processing slideshow + reveal screens can be shared composition-
 * for-composition: { sessionToken, extraction, expiresAt }.
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
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const TRY_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const TRY_STORAGE_BUCKET = "voice-entries-try";
const MIN_TRANSCRIPT_CHARS = 10;
const MAX_DEVICE_ID_LEN = 128;

export async function POST(req: NextRequest) {
  // ── 1. Rate limiting ────────────────────────────────────────────────
  const ipId = identifierFromRequest(req, "mobile-try-recording");
  const ipRl = await checkRateLimit(limiters.tryRecordingByIpMobile, ipId);
  if (!ipRl.success) return rateLimitedResponse(ipRl);

  const globalRl = await checkRateLimit(limiters.tryRecordingDaily, "global");
  if (!globalRl.success) {
    return NextResponse.json(
      {
        error: "TRY_DAILY_CAP_REACHED",
        message: "We're at today's free-recording cap. Try again tomorrow.",
      },
      { status: 429 }
    );
  }

  // ── 2. Parse multipart ───────────────────────────────────────────────
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

  const anonDeviceIdRaw = formData.get("anonDeviceId");
  const anonDeviceId =
    typeof anonDeviceIdRaw === "string" ? anonDeviceIdRaw.trim() : "";
  if (
    !anonDeviceId ||
    anonDeviceId.length > MAX_DEVICE_ID_LEN
  ) {
    return NextResponse.json(
      { error: "Missing or invalid anonDeviceId" },
      { status: 400 }
    );
  }

  const rawMime = audioFile.type || "audio/mp4";
  const mimeType = normalizeAudioMimeType(rawMime);
  if (!mimeType) {
    return NextResponse.json(
      { error: `Unsupported audio type: ${rawMime}` },
      { status: 415 }
    );
  }
  const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

  // ── 3. Single-use sessionToken ─────────────────────────────────────
  const sessionToken = randomBytes(32).toString("hex");

  // ── 4. Upload audio to try bucket ──────────────────────────────────
  const { supabase } = await import("@/lib/supabase.server");
  const ext = extensionForMimeType(mimeType);
  const audioPath = `${sessionToken}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(TRY_STORAGE_BUCKET)
    .upload(audioPath, audioBuffer, {
      contentType: mimeType,
      upsert: false,
    });
  if (uploadError) {
    safeLog.error("mobile.try-recording.upload_failed", {
      err: uploadError.message,
    });
    return NextResponse.json(
      { error: "Audio upload failed" },
      { status: 502 }
    );
  }

  // ── 5. Whisper → Claude ────────────────────────────────────────────
  let transcript: string;
  try {
    transcript = await transcribeAudio(audioBuffer, mimeType);
  } catch (err) {
    safeLog.error("mobile.try-recording.transcribe_failed", {
      err: err instanceof Error ? err.message : "unknown",
    });
    await supabase.storage.from(TRY_STORAGE_BUCKET).remove([audioPath]);
    return toClientError(err, 502);
  }
  if (transcript.length < MIN_TRANSCRIPT_CHARS) {
    await supabase.storage.from(TRY_STORAGE_BUCKET).remove([audioPath]);
    return NextResponse.json(
      { error: "Recording too short or unclear. Try again." },
      { status: 422 }
    );
  }

  let extraction: Record<string, unknown>;
  try {
    const todayISO = new Date().toISOString().slice(0, 10);
    extraction = (await extractFromTranscript(
      transcript,
      todayISO
    )) as unknown as Record<string, unknown>;
  } catch (err) {
    safeLog.error("mobile.try-recording.extract_failed", {
      err: err instanceof Error ? err.message : "unknown",
    });
    await supabase.storage.from(TRY_STORAGE_BUCKET).remove([audioPath]);
    return toClientError(err, 502);
  }

  // ── 6. Client IP ───────────────────────────────────────────────────
  const xff = req.headers.get("x-forwarded-for");
  const clientIp =
    xff?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  // ── 7. Persist TrySession ──────────────────────────────────────────
  const { prisma } = await import("@/lib/prisma");
  const trySession = await prisma.trySession.create({
    data: {
      sessionToken,
      // Prisma's Json input doesn't accept Record<string, unknown>
      // directly; the web sibling does the same cast.
      extractionData: extraction as object,
      audioPath,
      transcript,
      ipAddress: clientIp,
      anonDeviceId,
      expiresAt: new Date(Date.now() + TRY_SESSION_TTL_MS),
    },
  });

  safeLog.info("mobile.try-recording.created", {
    trySessionId: trySession.id,
    anonDeviceId,
  });

  return NextResponse.json(
    {
      sessionToken,
      extraction,
      expiresAt: trySession.expiresAt.toISOString(),
    },
    { status: 201 }
  );
}
