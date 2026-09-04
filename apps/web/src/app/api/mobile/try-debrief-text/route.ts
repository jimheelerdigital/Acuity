import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { extractFromTranscript } from "@/lib/pipeline";
import {
  checkRateLimit,
  identifierFromRequest,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";
import { safeLog } from "@/lib/safe-log";
import { toClientError } from "@/lib/api-errors";

/**
 * POST /api/mobile/try-debrief-text
 *
 * Typed-debrief intake for the mic-denied fallback (spec §4: "Mic denied →
 * stay here, reveal typed debrief field inline. Never Settings-only", and
 * acceptance line 240).
 *
 * Without this, a denied microphone means the user cannot complete a debrief
 * AT ALL — and "first debrief completed" is the north-star action. The typed
 * field was previously unbuildable because every intake path required audio.
 *
 * ── What it does and doesn't do ──────────────────────────────────────
 * Identical to /api/mobile/try-recording MINUS the audio half: no upload, no
 * Whisper. The typed text IS the transcript, so it goes straight to Claude
 * extraction and the response shape is byte-compatible — Screen 5 renders it
 * with no branching, and the claim flow treats the session the same way.
 *
 * Body: { text: string, anonDeviceId: string }
 * 201 : { sessionToken, extraction, expiresAt }   ← same as try-recording
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Must match /api/mobile/try-recording, which declares the same value
 * locally. Duplicated rather than extracted so this change doesn't touch the
 * live audio route; if a third intake path appears, promote it to
 * @acuity/shared instead of copying it again.
 */
const TRY_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const MIN_TEXT_CHARS = 10;
/**
 * Upper bound on typed input.
 *
 * A 120s spoken debrief transcribes to roughly 1,800 characters, so 10k is
 * generous headroom for someone who types a lot. It is a COST control, not a
 * UX one: unlike audio — which is rate-limited by the physical act of
 * speaking — text can be pasted, and every character reaches Claude. Without
 * a cap, one request could carry a novel.
 */
const MAX_TEXT_CHARS = 10_000;
const MAX_DEVICE_ID_LEN = 128;

export async function POST(req: NextRequest) {
  // ── 1. Rate limiting ────────────────────────────────────────────────
  // Reuses the try-recording limiters deliberately. This path is CHEAPER to
  // abuse than audio (no recording required, scriptable), so it must not be
  // the softer door into the same Claude spend.
  const ipId = identifierFromRequest(req, "mobile-try-debrief-text");
  const ipRl = await checkRateLimit(limiters.tryRecordingByIpMobile, ipId);
  if (!ipRl.success) return rateLimitedResponse(ipRl);

  const globalRl = await checkRateLimit(limiters.tryRecordingDaily, "global");
  if (!globalRl.success) {
    return NextResponse.json(
      {
        error: "TRY_DAILY_CAP_REACHED",
        message: "We're at today's free-debrief cap. Try again tomorrow.",
      },
      { status: 429 }
    );
  }

  // ── 2. Parse + validate ─────────────────────────────────────────────
  let body: { text?: unknown; anonDeviceId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < MIN_TEXT_CHARS) {
    return NextResponse.json(
      { error: "That's a bit short for Ripple to work with. Add a little more." },
      { status: 422 }
    );
  }
  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json(
      { error: `Debrief text exceeds the ${MAX_TEXT_CHARS} character limit` },
      { status: 413 }
    );
  }

  const anonDeviceId =
    typeof body.anonDeviceId === "string" ? body.anonDeviceId.trim() : "";
  if (!anonDeviceId || anonDeviceId.length > MAX_DEVICE_ID_LEN) {
    return NextResponse.json(
      { error: "Missing or invalid anonDeviceId" },
      { status: 400 }
    );
  }

  const sessionToken = randomBytes(32).toString("hex");

  // ── 3. Straight to extraction — no Whisper ─────────────────────────
  // The typed text is already the transcript. Nothing is transcribed, so
  // there is no audio to upload, clean up, or roll back on failure — which
  // is why this handler is markedly simpler than its audio sibling.
  let extraction: Record<string, unknown>;
  try {
    const todayISO = new Date().toISOString().slice(0, 10);
    extraction = (await extractFromTranscript(
      text,
      todayISO
    )) as unknown as Record<string, unknown>;
  } catch (err) {
    safeLog.error("mobile.try-debrief-text.extract_failed", {
      err: err instanceof Error ? err.message : "unknown",
    });
    return toClientError(err, 502);
  }

  // ── 4. Persist TrySession ──────────────────────────────────────────
  const xff = req.headers.get("x-forwarded-for");
  const clientIp =
    xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

  const { prisma } = await import("@/lib/prisma");
  const trySession = await prisma.trySession.create({
    data: {
      sessionToken,
      extractionData: extraction as object,
      // NULL, not a sentinel. There was never a recording — see the schema
      // comment on TrySession.audioPath.
      audioPath: null,
      transcript: text,
      ipAddress: clientIp,
      anonDeviceId,
      expiresAt: new Date(Date.now() + TRY_SESSION_TTL_MS),
    },
  });

  safeLog.info("mobile.try-debrief-text.created", {
    trySessionId: trySession.id,
    anonDeviceId,
    chars: text.length,
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
