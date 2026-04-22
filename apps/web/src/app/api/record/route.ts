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

import { NextRequest, NextResponse } from "next/server";

import { MAX_AUDIO_BYTES } from "@acuity/shared";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { toClientError } from "@/lib/api-errors";
import { normalizeAudioMimeType, uploadAudioBytes } from "@/lib/audio";
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
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 1b. Rate limit (expensive: Whisper + Claude) ────────────────────────
  // Three-layer cost cap stacked per user: 10/hr for burst control,
  // 30/day to bound daily blast radius, 300/month as a monthly
  // backstop. A compromised account running flat-out can burn at most
  // ~$36/month of OpenAI + Anthropic credit before the daily/monthly
  // caps slam shut. See lib/rate-limit.ts for the rationale behind
  // each number.
  for (const limiter of [
    limiters.expensiveAi,
    limiters.recordDaily,
    limiters.recordMonthly,
  ]) {
    const rl = await checkRateLimit(limiter, `user:${userId}`);
    if (!rl.success) return rateLimitedResponse(rl);
  }

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

  // Normalize MIME to one of the four canonical forms Supabase Storage
  // accepts (webm/mp4/wav/mpeg/ogg). Maps iOS "audio/x-m4a" and Android
  // "audio/aac" to "audio/mp4" so the bucket allowlist stays narrow.
  // Clients still send whatever the OS reports; canonicalization is our
  // job, not theirs. See lib/audio.ts::normalizeAudioMimeType for the
  // full alias map.
  const rawMime = audioFile.type || "audio/webm";
  const mimeType = normalizeAudioMimeType(rawMime);
  if (!mimeType) {
    return NextResponse.json(
      { error: `Unsupported audio type: ${rawMime}` },
      { status: 415 }
    );
  }

  const durationSeconds = formData.get("durationSeconds")
    ? Number(formData.get("durationSeconds"))
    : undefined;

  // Optional — set when the user opens the recorder from a goal card
  // or goal detail ("Record about this goal"). Validated to belong to
  // this user before persisting; silently dropped if it doesn't match
  // (defense in depth — a forged goalId would otherwise leak goal
  // existence via a 403/404).
  const rawGoalId = formData.get("goalId");
  let goalId: string | null =
    typeof rawGoalId === "string" && rawGoalId.length > 0 ? rawGoalId : null;
  if (goalId) {
    const { prisma } = await import("@/lib/prisma");
    const owned = await prisma.goal.findFirst({
      where: { id: goalId, userId },
      select: { id: true },
    });
    if (!owned) goalId = null;
  }

  // Optional life-dimension context. Set when the recorder was opened
  // from a dimension detail's "Record about this" button. Accepts the
  // lowercase key from DEFAULT_LIFE_AREAS; unknown values are dropped
  // rather than persisted so a forged input can't corrupt the column.
  const rawDimensionContext = formData.get("dimensionContext");
  const KNOWN_DIMENSIONS = new Set([
    "career",
    "health",
    "relationships",
    "finances",
    "personal",
    "other",
  ]);
  const dimensionContext: string | null =
    typeof rawDimensionContext === "string" &&
    KNOWN_DIMENSIONS.has(rawDimensionContext)
      ? rawDimensionContext
      : null;

  const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

  const useInngest = process.env.ENABLE_INNGEST_PIPELINE === "1";

  // ── 3a. Async path — upload, create Entry QUEUED, dispatch event ────────
  if (useInngest) {
    const { prisma } = await import("@/lib/prisma");
    const entry = await prisma.entry.create({
      data: { userId, status: "QUEUED", goalId, dimensionContext },
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
    data: { userId, status: "PENDING", goalId, dimensionContext },
  });

  try {
    const result = await processEntry({
      entryId: entry.id,
      userId,
      audioBuffer,
      mimeType,
      durationSeconds,
      goalId,
      dimensionContext,
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
