/**
 * The Acuity extraction pipeline:
 *   Audio → Supabase Storage → Whisper (transcription) → Claude (extraction) → Prisma
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

import {
  CLAUDE_MAX_TOKENS,
  CLAUDE_MODEL,
  WHISPER_LANGUAGE,
  WHISPER_MODEL,
  type ExtractionResult,
  type Mood,
  type Priority,
} from "@acuity/shared";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const STORAGE_BUCKET = "voice-entries";

// ─── Step 1: Upload Audio ────────────────────────────────────────────────────

export async function uploadAudio(
  buffer: Buffer,
  userId: string,
  entryId: string,
  mimeType: string
): Promise<string> {
  const { supabase } = await import("@/lib/supabase");

  const ext = mimeType.split("/")[1]?.replace("x-m4a", "m4a") ?? "webm";
  const path = `${userId}/${entryId}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType: mimeType, upsert: false });

  if (uploadError) {
    throw new Error(`Supabase upload failed: ${uploadError.message}`);
  }

  const { data, error: signError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 60 * 60); // 1 hour expiry

  if (signError || !data?.signedUrl) {
    throw new Error(
      `Failed to create signed URL: ${signError?.message ?? "no data"}`
    );
  }

  return data.signedUrl;
}

// ─── Step 2: Transcribe ──────────────────────────────────────────────────────

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  filename = "recording.webm"
): Promise<string> {
  const file = await toFile(audioBuffer, filename, { type: mimeType });

  const response = await openai.audio.transcriptions.create({
    file,
    model: WHISPER_MODEL,
    language: WHISPER_LANGUAGE,
    response_format: "text",
  });

  return (response as unknown as string).trim();
}

// ─── Step 3: Extract ─────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are Acuity's extraction engine. Your job is to analyse a user's nightly voice brain dump and return a structured JSON object. Be empathetic, precise, and actionable.

Return ONLY valid JSON matching this exact schema — no markdown, no prose:

{
  "summary": "2-3 sentence synthesis of the day",
  "mood": "GREAT" | "GOOD" | "NEUTRAL" | "LOW" | "ROUGH",
  "moodScore": <integer 1–10, where ROUGH=1-2, LOW=3-4, NEUTRAL=5-6, GOOD=7-8, GREAT=9-10>,
  "energy": <integer 1–10>,
  "themes": ["theme1", "theme2"],          // up to 5 short theme labels
  "wins": ["win1", "win2"],                // things that went well today
  "blockers": ["blocker1"],                // obstacles or frustrations
  "insights": ["insight1", "insight2"],     // 2-4 reflective observations or actionable recommendations
  "tasks": [
    {
      "title": "action item",
      "description": "optional detail",
      "priority": "LOW" | "MEDIUM" | "HIGH" | "URGENT",
      "dueDate": "YYYY-MM-DD" | null
    }
  ],
  "goals": [
    {
      "title": "goal statement",
      "description": "optional detail",
      "targetDate": "YYYY-MM-DD" | null
    }
  ]
}

Guidelines:
- Extract only tasks the user explicitly mentioned wanting to do
- Infer priority from urgency language ("need to", "ASAP", "important" → HIGH; "maybe", "someday" → LOW)
- Only include goals if the user expressed a clear medium-to-long term aspiration
- Keep theme labels short (1-3 words)
- Insights should be reflective observations the user might not have noticed, or concrete next-step recommendations
- moodScore should be a nuanced score that reflects the overall emotional tone, not just a direct map from the mood label
- Today's date context will be provided in the user message`;

export async function extractFromTranscript(
  transcript: string,
  todayISO: string
): Promise<ExtractionResult> {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: CLAUDE_MAX_TOKENS,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Today's date: ${todayISO}\n\nBrain dump transcript:\n\n${transcript}`,
      },
    ],
  });

  const rawText =
    message.content[0].type === "text" ? message.content[0].text : "";

  // Strip any accidental markdown code fences
  const jsonText = rawText
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();

  const parsed = JSON.parse(jsonText) as ExtractionResult;

  // Validate + coerce
  return {
    summary: String(parsed.summary ?? ""),
    mood: validateMood(parsed.mood),
    moodScore: clamp(Number(parsed.moodScore ?? 5), 1, 10),
    energy: clamp(Number(parsed.energy ?? 5), 1, 10),
    themes: ensureStringArray(parsed.themes).slice(0, 5),
    wins: ensureStringArray(parsed.wins),
    blockers: ensureStringArray(parsed.blockers),
    insights: ensureStringArray(parsed.insights).slice(0, 4),
    tasks: (parsed.tasks ?? []).map((t) => ({
      title: String(t.title),
      description: t.description ? String(t.description) : undefined,
      priority: validatePriority(t.priority),
      dueDate: t.dueDate ?? undefined,
    })),
    goals: (parsed.goals ?? []).map((g) => ({
      title: String(g.title),
      description: g.description ? String(g.description) : undefined,
      targetDate: g.targetDate ?? undefined,
    })),
  };
}

// ─── Step 4: Orchestrator ────────────────────────────────────────────────────

export async function processEntry({
  entryId,
  userId,
  audioBuffer,
  mimeType,
  durationSeconds,
}: {
  entryId: string;
  userId: string;
  audioBuffer: Buffer;
  mimeType: string;
  durationSeconds?: number;
}) {
  const { prisma } = await import("@/lib/prisma");

  // ── PENDING → PROCESSING ──────────────────────────────────────────────────
  await prisma.entry.update({
    where: { id: entryId },
    data: { status: "PROCESSING" },
  });

  try {
    // ── Upload audio (non-fatal) ──────────────────────────────────────────
    let audioUrl: string | null = null;
    try {
      audioUrl = await uploadAudio(audioBuffer, userId, entryId, mimeType);
    } catch (err) {
      console.error("[pipeline] uploadAudio failed (non-fatal):", err);
    }

    // ── Transcribe ────────────────────────────────────────────────────────
    const transcript = await transcribeAudio(audioBuffer, mimeType);

    if (transcript.trim().length < 10) {
      throw new Error("Transcript too short — no speech detected");
    }

    // ── Extract ───────────────────────────────────────────────────────────
    const todayISO = new Date().toISOString().split("T")[0];
    const extraction = await extractFromTranscript(transcript, todayISO);

    // ── Persist everything in one transaction ─────────────────────────────
    const result = await prisma.$transaction(async (tx) => {
      // Update the Entry with all extracted data → COMPLETE
      const entry = await tx.entry.update({
        where: { id: entryId },
        data: {
          audioUrl,
          audioDuration: durationSeconds ?? null,
          transcript,
          summary: extraction.summary,
          mood: extraction.mood,
          moodScore: extraction.moodScore,
          energy: extraction.energy,
          themes: extraction.themes,
          wins: extraction.wins,
          blockers: extraction.blockers,
          rawAnalysis: extraction as unknown as object,
          status: "COMPLETE",
        },
      });

      // Create extracted Tasks
      let tasksCreated = 0;
      if (extraction.tasks.length > 0) {
        const { count } = await tx.task.createMany({
          data: extraction.tasks.map((t) => ({
            userId,
            entryId,
            text: t.title,
            title: t.title,
            description: t.description ?? null,
            priority: t.priority,
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
          })),
        });
        tasksCreated = count;
      }

      // Create extracted Goals (deduplicate by title)
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

      // Fetch the tasks we just created so we can return them
      const tasks = await tx.task.findMany({
        where: { entryId },
        orderBy: { createdAt: "asc" },
      });

      return { entry, tasks, tasksCreated, extraction };
    });

    return result;
  } catch (err) {
    // ── Any failure → FAILED ──────────────────────────────────────────────
    await prisma.entry
      .update({
        where: { id: entryId },
        data: { status: "FAILED" },
      })
      .catch(() => {});

    throw err;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const VALID_MOODS: Mood[] = ["GREAT", "GOOD", "NEUTRAL", "LOW", "ROUGH"];
function validateMood(value: unknown): Mood {
  return VALID_MOODS.includes(value as Mood) ? (value as Mood) : "NEUTRAL";
}

const VALID_PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
function validatePriority(value: unknown): Priority {
  return VALID_PRIORITIES.includes(value as Priority)
    ? (value as Priority)
    : "MEDIUM";
}

function ensureStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
