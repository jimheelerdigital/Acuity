/**
 * POST /api/record
 *
 * Accepts multipart/form-data with:
 *   audio           — Blob | File (required)
 *   durationSeconds — string (optional)
 *
 * Dual-path behavior (INNGEST_MIGRATION_PLAN.md §11 PR 2):
 *   - ENABLE_INNGEST_PIPELINE !== "1" (default): legacy sync path.
 *     Runs the full pipeline inline (upload → Whisper → Claude → DB).
 *     Returns 201 with the completed entry + extraction payload.
 *     Requires Vercel Pro (maxDuration=120).
 *   - ENABLE_INNGEST_PIPELINE === "1": async path.
 *     Uploads audio to Supabase Storage, creates an Entry in QUEUED
 *     status, dispatches an `entry/process.requested` Inngest event,
 *     and returns 202 immediately. Client polls GET /api/entries/[id]
 *     for status transitions.
 */

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { MAX_AUDIO_BYTES } from "@acuity/shared";

import { getAuthOptions } from "@/lib/auth";
import { toClientError } from "@/lib/api-errors";
import { uploadAudioBytes } from "@/lib/audio";
import { inngest } from "@/inngest/client";
import { processEntry } from "@/lib/pipeline";
import { requireEntitlement } from "@/lib/paywall";
import {
  checkRateLimit,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Retained for the sync path. Once we flip ENABLE_INNGEST_PIPELINE=1 in
// production and prove stability, the sync path is removed and this
// maxDuration drops (Inngest PR 4). Hobby ignores values >10 anyway.
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  // ── 1. Auth ──────────────────────────────────────────────────────────────
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // ── 1b. Rate limit (expensive: Whisper + Claude) ────────────────────────
  const rl = await checkRateLimit(limiters.expensiveAi, `user:${userId}`);
  if (!rl.success) return rateLimitedResponse(rl);

  // ── 1c. Paywall: canRecord (§IMPLEMENTATION_PLAN_PAYWALL §1.3) ─────────
  const gate = await requireEntitlement("canRecord", userId);
  if (!gate.ok) return gate.response;

  // ── 2. Parse + validate (shared between both paths) ─────────────────────
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

  // Strip codec params (e.g. "audio/webm;codecs=opus" → "audio/webm")
  const rawMime = audioFile.type || "audio/webm";
  const mimeType = rawMime.split(";")[0];
  if (!mimeType.startsWith("audio/")) {
    return NextResponse.json(
      { error: `Unsupported audio type: ${rawMime}` },
      { status: 415 }
    );
  }

  const durationSeconds = formData.get("durationSeconds")
    ? Number(formData.get("durationSeconds"))
    : undefined;

  const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

  const useInngest = process.env.ENABLE_INNGEST_PIPELINE === "1";

  // ── 3a. Async path — upload, create Entry QUEUED, dispatch event ────────
  if (useInngest) {
    const { prisma } = await import("@/lib/prisma");
    const entry = await prisma.entry.create({
      data: { userId, status: "QUEUED" },
    });

    let objectPath: string;
    try {
      objectPath = await uploadAudioBytes(
        audioBuffer,
        userId,
        entry.id,
        mimeType
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      console.error("[record] Upload failed:", err);
      await prisma.entry.update({
        where: { id: entry.id },
        data: { status: "FAILED", errorMessage: message },
      });
      return toClientError(err, 502, {
        extra: { entryId: entry.id, status: "FAILED" },
      });
    }

    await prisma.entry.update({
      where: { id: entry.id },
      data: {
        audioPath: objectPath,
        audioDuration: durationSeconds ?? null,
      },
    });

    await inngest.send({
      name: "entry/process.requested",
      data: { entryId: entry.id, userId },
    });

    return NextResponse.json(
      { entryId: entry.id, status: "QUEUED" },
      { status: 202 }
    );
  }

  // ── 3b. Sync path (legacy) — unchanged from pre-migration behavior ──────
  const { prisma } = await import("@/lib/prisma");
  const entry = await prisma.entry.create({
    data: { userId, status: "PENDING" },
  });

  try {
    const result = await processEntry({
      entryId: entry.id,
      userId,
      audioBuffer,
      mimeType,
      durationSeconds,
    });

    return NextResponse.json(
      {
        entryId: result.entry.id,
        status: result.entry.status,
        transcript: result.entry.transcript,
        extraction: result.extraction,
        tasksCreated: result.tasksCreated,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[record] Pipeline failed:", err);
    return toClientError(err, 502, {
      extra: { entryId: entry.id, status: "FAILED" },
    });
  }
}
