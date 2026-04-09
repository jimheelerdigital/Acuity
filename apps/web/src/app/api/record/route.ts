/**
 * POST /api/record
 *
 * Accepts multipart/form-data with:
 *   audio          — Blob | File (required)
 *   durationSeconds — string (optional)
 *
 * Creates an Entry (PENDING), runs the full pipeline (upload → transcribe →
 * extract → persist), and returns the completed Entry with extracted data.
 * On failure the Entry status is set to FAILED.
 */

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";
import { processEntry } from "@/lib/pipeline";
import { MAX_AUDIO_BYTES, SUPPORTED_AUDIO_TYPES } from "@acuity/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  // ── 1. Auth ──────────────────────────────────────────────────────────────
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // ── 2. Parse + validate ──────────────────────────────────────────────────
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

  const mimeType = audioFile.type || "audio/webm";
  if (
    !SUPPORTED_AUDIO_TYPES.includes(
      mimeType as (typeof SUPPORTED_AUDIO_TYPES)[number]
    )
  ) {
    return NextResponse.json(
      { error: `Unsupported audio type: ${mimeType}` },
      { status: 415 }
    );
  }

  const durationSeconds = formData.get("durationSeconds")
    ? Number(formData.get("durationSeconds"))
    : undefined;

  const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

  // ── 3. Create Entry (PENDING) ────────────────────────────────────────────
  const { prisma } = await import("@/lib/prisma");
  const entry = await prisma.entry.create({
    data: { userId, status: "PENDING" },
  });

  // ── 4. Run pipeline ──────────────────────────────────────────────────────
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
    const message =
      err instanceof Error ? err.message : "Processing failed";
    return NextResponse.json(
      { error: message, entryId: entry.id, status: "FAILED" },
      { status: 502 }
    );
  }
}
