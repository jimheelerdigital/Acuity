/**
 * POST /api/record
 *
 * Accepts a multipart/form-data body with the following fields:
 *   audio        — Blob | File (required)
 *   durationSeconds — string (optional)
 *
 * Pipeline:
 *   1. Authenticate the session
 *   2. Parse + validate the audio file
 *   3. Upload to Supabase Storage
 *   4. Transcribe via OpenAI Whisper
 *   5. Extract tasks/goals/mood via Claude
 *   6. Persist Entry + Tasks + Goals to Postgres
 *   7. Return structured JSON
 */

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractFromTranscript, transcribeAudio } from "@/lib/pipeline";
import {
  MAX_AUDIO_BYTES,
  SUPPORTED_AUDIO_TYPES,
  type RecordResponse,
} from "@acuity/shared";

export const runtime = "nodejs"; // need fs/Buffer APIs
export const maxDuration = 120; // Whisper + Claude can be slow

export async function POST(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // ── 2. Parse multipart form data ───────────────────────────────────────────
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
      { error: `Audio file exceeds the 25 MB limit` },
      { status: 413 }
    );
  }

  const mimeType = audioFile.type || "audio/webm";
  if (!SUPPORTED_AUDIO_TYPES.includes(mimeType as (typeof SUPPORTED_AUDIO_TYPES)[number])) {
    return NextResponse.json(
      { error: `Unsupported audio type: ${mimeType}` },
      { status: 415 }
    );
  }

  const durationSeconds = formData.get("durationSeconds")
    ? Number(formData.get("durationSeconds"))
    : undefined;

  const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

  // ── 3. Upload to Supabase Storage ──────────────────────────────────────────
  let audioUrl: string | undefined;
  try {
    audioUrl = await uploadAudioToSupabase(audioBuffer, userId, mimeType);
  } catch (err) {
    // Non-fatal: we can still transcribe without a stored URL
    console.error("[record] Supabase upload failed:", err);
  }

  // ── 4. Transcribe ──────────────────────────────────────────────────────────
  let transcript: string;
  try {
    transcript = await transcribeAudio(audioBuffer, mimeType);
  } catch (err) {
    console.error("[record] Whisper transcription failed:", err);
    return NextResponse.json(
      { error: "Transcription failed. Please try again." },
      { status: 502 }
    );
  }

  if (transcript.trim().length < 10) {
    return NextResponse.json(
      { error: "Transcript too short — no speech detected" },
      { status: 422 }
    );
  }

  // ── 5. Extract with Claude ─────────────────────────────────────────────────
  const todayISO = new Date().toISOString().split("T")[0];
  let extraction: Awaited<ReturnType<typeof extractFromTranscript>>;
  try {
    extraction = await extractFromTranscript(transcript, todayISO);
  } catch (err) {
    console.error("[record] Claude extraction failed:", err);
    return NextResponse.json(
      { error: "AI extraction failed. Please try again." },
      { status: 502 }
    );
  }

  // ── 6. Persist ─────────────────────────────────────────────────────────────
  const { entryId, tasksCreated } = await prisma.$transaction(async (tx) => {
    // Create the Entry
    const entry = await tx.entry.create({
      data: {
        userId,
        audioUrl: audioUrl ?? null,
        audioDuration: durationSeconds ?? null,
        transcript,
        summary: extraction.summary,
        mood: extraction.mood,
        energy: extraction.energy,
        themes: extraction.themes,
        wins: extraction.wins,
        blockers: extraction.blockers,
        rawAnalysis: extraction as object,
      },
    });

    // Create extracted Tasks
    let tasksCreated = 0;
    if (extraction.tasks.length > 0) {
      const result = await tx.task.createMany({
        data: extraction.tasks.map((t) => ({
          userId,
          entryId: entry.id,
          title: t.title,
          description: t.description ?? null,
          priority: t.priority,
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
        })),
      });
      tasksCreated = result.count;
    }

    // Create extracted Goals (skip if same title already exists)
    for (const g of extraction.goals) {
      const existing = await tx.goal.findFirst({
        where: { userId, title: { equals: g.title, mode: "insensitive" } },
      });
      if (!existing) {
        await tx.goal.create({
          data: {
            userId,
            title: g.title,
            description: g.description ?? null,
            targetDate: g.targetDate ? new Date(g.targetDate) : null,
          },
        });
      }
    }

    return { entryId: entry.id, tasksCreated };
  });

  // ── 7. Respond ─────────────────────────────────────────────────────────────
  const response: RecordResponse = {
    entryId,
    transcript,
    extraction,
    tasksCreated,
  };

  return NextResponse.json(response, { status: 201 });
}

// ─── Supabase Storage helper ──────────────────────────────────────────────────

async function uploadAudioToSupabase(
  buffer: Buffer,
  userId: string,
  mimeType: string
): Promise<string> {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const ext = mimeType.split("/")[1]?.replace("webm", "webm") ?? "webm";
  const path = `${userId}/${Date.now()}.${ext}`;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "acuity-audio";

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, { contentType: mimeType, upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
