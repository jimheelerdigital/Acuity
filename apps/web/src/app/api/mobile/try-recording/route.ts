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
 * Request contract — two accepted forms:
 *   JSON (preferred, direct-to-storage):
 *     - storagePath : string (required, object already in voice-entries-try)
 *     - anonDeviceId: string (required, the AsyncStorage UUID)
 *     - mimeType    : string (optional, defaults to audio/mp4)
 *   Multipart (legacy, for app builds already on phones):
 *     - audio       : Blob   (required, ≤ MAX_AUDIO_BYTES)
 *     - anonDeviceId: string (required)
 *
 * Response shape mirrors the web route's success body so the
 * processing slideshow + reveal screens can be shared composition-
 * for-composition: { sessionToken, extraction, expiresAt }.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

import { MAX_AUDIO_BYTES } from "@acuity/shared";

import {
  normalizeAudioMimeType,
  extensionForMimeType,
  verifyStoredAudio,
} from "@/lib/audio";
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

  // ── 2. Parse — JSON (direct-to-storage) or multipart (legacy) ────────
  //
  // Same dual-accept as /api/record, for the same reason: builds already
  // installed on phones post multipart, and this is the ONBOARDING flow —
  // breaking it breaks first-run for every user who hasn't updated. The
  // multipart branch comes out one release after the direct-to-storage
  // build ships.
  const contentType = req.headers.get("content-type") ?? "";
  const isJsonUpload = contentType.includes("application/json");

  let formData: FormData | null = null;
  let audioFile: Blob | null = null;
  let storagePath: string | null = null;
  let jsonBody: Record<string, unknown> = {};

  if (isJsonUpload) {
    try {
      jsonBody = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const rawPath = jsonBody.storagePath;
    storagePath =
      typeof rawPath === "string" && rawPath.trim().length > 0
        ? rawPath.trim()
        : null;
    if (!storagePath) {
      return NextResponse.json(
        { error: "Missing required field: storagePath" },
        { status: 400 }
      );
    }
    // Objects here live at a flat, unguessable path minted by
    // /api/record/upload-url. Rejecting separators keeps a caller from
    // pointing at anything outside that namespace.
    if (storagePath.includes("/") || storagePath.includes("..")) {
      return NextResponse.json(
        { error: "Invalid storagePath" },
        { status: 400 }
      );
    }
  } else {
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid form data — expected multipart/form-data or JSON" },
        { status: 400 }
      );
    }

    const file = formData.get("audio");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Missing required field: audio" },
        { status: 400 }
      );
    }
    audioFile = file;
    if (audioFile.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "Audio file exceeds the 25 MB limit" },
        { status: 413 }
      );
    }
  }

  /** Read a field from whichever wire format this request used. */
  const field = (name: string): string | null => {
    if (isJsonUpload) {
      const v = jsonBody[name];
      return typeof v === "string" ? v : null;
    }
    const v = formData?.get(name);
    return typeof v === "string" ? v : null;
  };

  const anonDeviceId = field("anonDeviceId")?.trim() ?? "";
  if (!anonDeviceId || anonDeviceId.length > MAX_DEVICE_ID_LEN) {
    return NextResponse.json(
      { error: "Missing or invalid anonDeviceId" },
      { status: 400 }
    );
  }

  const rawMime =
    (isJsonUpload ? field("mimeType") : audioFile?.type) || "audio/mp4";
  const mimeType = normalizeAudioMimeType(rawMime);
  if (!mimeType) {
    return NextResponse.json(
      { error: `Unsupported audio type: ${rawMime}` },
      { status: 415 }
    );
  }

  // ── 3. Single-use sessionToken ─────────────────────────────────────
  //
  // Independent of the object path now. The legacy path derived both from
  // the same random value; direct-to-storage mints the path before any
  // session exists, so they are simply two separate identifiers.
  const sessionToken = randomBytes(32).toString("hex");

  // ── 4. Get the audio bytes ─────────────────────────────────────────
  const { supabase } = await import("@/lib/supabase.server");
  const ext = extensionForMimeType(mimeType);
  let audioPath: string;
  let audioBuffer: Buffer;

  if (storagePath) {
    // Confirm the object exists before spending a Whisper call and a
    // Claude call on a claim we haven't verified.
    const check = await verifyStoredAudio(TRY_STORAGE_BUCKET, storagePath);
    if (!check.ok) {
      if (check.reason === "too_large") {
        return NextResponse.json(
          { error: "Audio file exceeds the 25 MB limit" },
          { status: 413 }
        );
      }
      return NextResponse.json(
        { error: "Uploaded audio was not found. Please try recording again." },
        { status: 400 }
      );
    }

    // One extraction per uploaded object. Without this a caller could
    // replay the same storagePath and re-run Whisper + Claude on our dime
    // as often as they liked, sidestepping the rate limiter — which counts
    // requests, not distinct recordings.
    const { prisma: prismaCheck } = await import("@/lib/prisma");
    const alreadyUsed = await prismaCheck.trySession.findFirst({
      where: { audioPath: storagePath },
      select: { id: true },
    });
    if (alreadyUsed) {
      return NextResponse.json(
        { error: "This recording has already been processed." },
        { status: 409 }
      );
    }

    audioPath = storagePath;
    const { data, error: dlError } = await supabase.storage
      .from(TRY_STORAGE_BUCKET)
      .download(storagePath);
    if (dlError || !data) {
      safeLog.error("mobile.try-recording.download_failed", {
        err: dlError?.message ?? "no data",
      });
      return NextResponse.json(
        { error: "Could not read the uploaded audio." },
        { status: 502 }
      );
    }
    audioBuffer = Buffer.from(await data.arrayBuffer());
  } else {
    audioBuffer = Buffer.from(await audioFile!.arrayBuffer());
    audioPath = `${sessionToken}.${ext}`;
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
