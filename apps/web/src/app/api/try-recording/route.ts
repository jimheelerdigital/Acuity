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

  // ── 3. Parse — JSON (direct-to-storage) or multipart (legacy) ──────
  //
  // Same dual-accept as /api/record and the mobile try endpoint. The
  // browser gets fresh JS on every load so it converts immediately, but
  // the multipart branch stays for one release to match the other two —
  // one wire contract to reason about, one release to remove.
  const contentType = req.headers.get("content-type") ?? "";
  const isJsonUpload = contentType.includes("application/json");

  let audioFile: Blob | null = null;
  let storagePath: string | null = null;
  let rawMime = "audio/webm";

  if (isJsonUpload) {
    let jsonBody: Record<string, unknown>;
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
    // Flat, unguessable paths minted by /api/record/upload-url. Rejecting
    // separators keeps a caller from pointing outside that namespace.
    if (storagePath.includes("/") || storagePath.includes("..")) {
      return NextResponse.json(
        { error: "Invalid storagePath" },
        { status: 400 }
      );
    }
    if (typeof jsonBody.mimeType === "string") rawMime = jsonBody.mimeType;
  } else {
    let formData: FormData;
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
    rawMime = audioFile.type || "audio/webm";
  }

  const mimeType = normalizeAudioMimeType(rawMime);
  if (!mimeType) {
    return NextResponse.json(
      { error: `Unsupported audio type: ${rawMime}` },
      { status: 415 }
    );
  }

  // ── 4. Generate session token ──────────────────────────────────────
  const sessionToken = randomBytes(32).toString("hex");

  // ── 5. Get the audio bytes ─────────────────────────────────────────
  const { supabase } = await import("@/lib/supabase.server");
  const ext = extensionForMimeType(mimeType);
  let audioPath: string;
  let audioBuffer: Buffer;

  if (storagePath) {
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

    // One extraction per uploaded object — otherwise a caller could replay
    // the same storagePath and re-run Whisper + Claude on our dime, past
    // the rate limiter, which counts requests rather than recordings.
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
      console.error("[try-recording] Download failed:", dlError);
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
      .upload(audioPath, audioBuffer, { contentType: mimeType, upsert: false });

    if (uploadError) {
      console.error("[try-recording] Upload failed:", uploadError);
      return NextResponse.json(
        { error: "Audio upload failed" },
        { status: 502 }
      );
    }
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

  // ── 9. Notify Keenan ────────────────────────────────────────────────
  try {
    const { getResendClient } = await import("@/lib/resend");
    const resend = getResendClient();
    const referrer = req.headers.get("referer") ?? "unknown";
    const summary = (extraction.summary as string) ?? "No summary";
    const taskCount = Array.isArray(extraction.tasks) ? extraction.tasks.length : 0;
    const goalCount = Array.isArray(extraction.goals) ? extraction.goals.length : 0;
    const now = new Date();

    await resend.emails.send({
      from: "keenan@getacuity.io",
      to: "keenan@heelerdigital.com",
      subject: "\uD83C\uDFA4 New Try It First recording",
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;">
          <h2 style="margin:0 0 16px;font-size:18px;">New Try It First Recording</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:6px 0;color:#666;width:140px;">IP Address</td><td style="padding:6px 0;">${clientIp}</td></tr>
            <tr><td style="padding:6px 0;color:#666;">Landing page</td><td style="padding:6px 0;">${referrer}</td></tr>
            <tr><td style="padding:6px 0;color:#666;">Timestamp</td><td style="padding:6px 0;">${now.toLocaleString("en-US", { timeZone: "America/Chicago" })} CT</td></tr>
            <tr><td style="padding:6px 0;color:#666;">Tasks extracted</td><td style="padding:6px 0;">${taskCount}</td></tr>
            <tr><td style="padding:6px 0;color:#666;">Goals extracted</td><td style="padding:6px 0;">${goalCount}</td></tr>
            <tr><td style="padding:6px 0;color:#666;">Signup status</td><td style="padding:6px 0;">Pending signup — 5 min window</td></tr>
          </table>
          <div style="margin-top:16px;padding:12px 16px;background:#f5f3f0;border-radius:8px;">
            <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">AI Summary</p>
            <p style="margin:0;font-size:14px;line-height:1.5;">${summary}</p>
          </div>
        </div>
      `,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[try-recording] Notification email failed:", err);
  }

  // ── 10. Return extraction + set cookie ─────────────────────────────
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
