/**
 * The Acuity extraction pipeline:
 *   Audio → Supabase Storage → Whisper (transcription) → Claude (extraction) → Prisma
 *   + Memory update → Life Matrix update
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
  type LifeAreaMention,
  type LifeAreaMentions,
  type Mood,
  type Priority,
} from "@acuity/shared";

import { extensionForMimeType } from "./audio";
import { LIFE_AREA_EXTRACTION_SCHEMA } from "./prompts/lifemap";

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
  const { supabase } = await import("@/lib/supabase.server");

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
  filename?: string
): Promise<string> {
  // Whisper reads format from the filename extension, so we must feed
  // it a name that matches the actual content. Default derived from
  // the canonical MIME when the caller doesn't specify — audio/mp4
  // → recording.m4a (NOT .mp4; Whisper's MP4 demuxer looks for video
  // tracks and trips on audio-only files).
  const resolvedFilename =
    filename ?? `recording.${extensionForMimeType(mimeType)}`;
  const file = await toFile(audioBuffer, resolvedFilename, { type: mimeType });

  const response = await openai.audio.transcriptions.create({
    file,
    model: WHISPER_MODEL,
    language: WHISPER_LANGUAGE,
    response_format: "text",
  });

  return (response as unknown as string).trim();
}

// ─── Step 3: Extract ─────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are Acuity's extraction engine. Your job is to analyse a user's nightly voice debrief and return a structured JSON object. Be empathetic, precise, and actionable.

Return ONLY valid JSON matching this exact schema — no markdown, no prose:

{
  "summary": "2-3 sentence synthesis of the day",
  "mood": "GREAT" | "GOOD" | "NEUTRAL" | "LOW" | "ROUGH",
  "moodScore": <integer 1–10, where ROUGH=1-2, LOW=3-4, NEUTRAL=5-6, GOOD=7-8, GREAT=9-10>,
  "energy": <integer 1–10>,
  "themes": [
    { "label": "short theme (1-3 words)", "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE" }
  ],
  "wins": ["win1", "win2"],
  "blockers": ["blocker1"],
  "insights": ["insight1", "insight2"],
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
  ],
  "subGoalSuggestions": [
    {
      "parentGoalText": "verbatim phrase matching an existing goal the user already has",
      "suggestedAction": "the concrete next step the user mentioned under that goal"
    }
  ],
  "lifeAreaMentions": {
    "career": { "mentioned": bool, "score": 1-10, "themes": [], "people": [], "goals": [], "sentiment": "positive"|"negative"|"neutral" },
    "health": { ... },
    "relationships": { ... },
    "finances": { ... },
    "personal": { ... },
    "other": { ... }
  }
}

Guidelines:
- Extract only tasks the user explicitly mentioned wanting to do
- Infer priority from urgency language ("need to", "ASAP", "important" → HIGH; "maybe", "someday" → LOW)
- Only include goals if the user expressed a clear medium-to-long term aspiration
- subGoalSuggestions: populate ONLY when the user references HOW they'll pursue an existing goal the memory context mentions. parentGoalText must match the phrasing of one of the user's existing goals. suggestedAction is the concrete next step. Skip if unsure — orphan suggestions get dropped.
- Keep theme labels short (1-3 words). Per-theme sentiment reflects the user's emotional framing of that specific theme in this entry: POSITIVE if they expressed satisfaction/progress, NEGATIVE if strain/frustration, NEUTRAL if they mentioned it factually without strong valence. Up to 5 themes per entry.
- Insights should be reflective observations the user might not have noticed, or concrete next-step recommendations
- moodScore should be a nuanced score that reflects the overall emotional tone
- Today's date context will be provided in the user message
${LIFE_AREA_EXTRACTION_SCHEMA}`;

export async function extractFromTranscript(
  transcript: string,
  todayISO: string,
  memoryContext?: string
): Promise<ExtractionResult> {
  const contextBlock = memoryContext
    ? `Here is what you know about this user from their entire history with Acuity:\n${memoryContext}\n\nUse these historical patterns to enrich your extraction — for example, if a goal has been mentioned multiple times before, note it as recurring rather than new.\n\n`
    : "";

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: CLAUDE_MAX_TOKENS,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `${contextBlock}Today's date: ${todayISO}\n\nDaily debrief transcript:\n\n${transcript}`,
      },
    ],
  });

  const rawText =
    message.content[0].type === "text" ? message.content[0].text : "";

  const jsonText = rawText
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();

  const parsed = JSON.parse(jsonText) as ExtractionResult;

  // Theme parsing accepts both the new { label, sentiment }[] shape and
  // the legacy string[] shape. Legacy entries get NEUTRAL sentiment.
  // Normalization (lowercase, plural-stem) is deferred to the
  // persistence layer — ExtractionResult carries raw labels so Entry
  // themes match what the user actually said.
  const rawThemes: unknown[] = Array.isArray(parsed.themes) ? parsed.themes : [];
  const themesDetailed = rawThemes
    .slice(0, 5)
    .map((t) => {
      if (typeof t === "string") {
        return { label: t, sentiment: "NEUTRAL" as const };
      }
      if (t && typeof t === "object" && typeof (t as { label?: unknown }).label === "string") {
        const label = String((t as { label: unknown }).label);
        const sent = String(
          (t as { sentiment?: unknown }).sentiment ?? ""
        ).toUpperCase();
        const sentiment =
          sent === "POSITIVE" || sent === "NEGATIVE" ? sent : "NEUTRAL";
        return { label, sentiment: sentiment as "POSITIVE" | "NEGATIVE" | "NEUTRAL" };
      }
      return null;
    })
    .filter((t): t is { label: string; sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL" } => t !== null);

  return {
    summary: String(parsed.summary ?? ""),
    mood: validateMood(parsed.mood),
    moodScore: clamp(Number(parsed.moodScore ?? 5), 1, 10),
    energy: clamp(Number(parsed.energy ?? 5), 1, 10),
    themes: themesDetailed.map((t) => t.label),
    themesDetailed,
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
    subGoalSuggestions: Array.isArray(parsed.subGoalSuggestions)
      ? parsed.subGoalSuggestions
          .filter(
            (s): s is { parentGoalText: string; suggestedAction: string } =>
              !!s &&
              typeof s === "object" &&
              typeof (s as { parentGoalText?: unknown }).parentGoalText === "string" &&
              typeof (s as { suggestedAction?: unknown }).suggestedAction === "string"
          )
          .map((s) => ({
            parentGoalText: s.parentGoalText.slice(0, 200),
            suggestedAction: s.suggestedAction.slice(0, 200),
          }))
          .slice(0, 5)
      : [],
    lifeAreaMentions: validateLifeAreaMentions(parsed.lifeAreaMentions),
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

    // ── Build memory context ──────────────────────────────────────────────
    const { buildMemoryContext } = await import("@/lib/memory");
    const memoryContext = await buildMemoryContext(userId);

    // ── Extract with memory context ───────────────────────────────────────
    const todayISO = new Date().toISOString().split("T")[0];
    const extraction = await extractFromTranscript(
      transcript,
      todayISO,
      memoryContext || undefined
    );

    // ── Persist everything in one transaction ─────────────────────────────
    const { recordThemesFromExtraction } = await import("@/lib/themes");
    const { persistSubGoalSuggestions } = await import("@/lib/goals");
    const result = await prisma.$transaction(async (tx) => {
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

      // Relational Theme + ThemeMention writes alongside the legacy
      // Entry.themes String[]. Inside the same transaction so a mention
      // write failure aborts the whole persist rather than leaving
      // half-populated state.
      await recordThemesFromExtraction(
        tx,
        userId,
        entry.id,
        entry.createdAt,
        extraction.themesDetailed
      );

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
              lastMentionedAt: new Date(),
              entryRefs: [entryId],
            },
          });
        } else {
          const refs = Array.from(new Set([...(existing.entryRefs ?? []), entryId]));
          await tx.goal.update({
            where: { id: existing.id },
            data: {
              lastMentionedAt: new Date(),
              entryRefs: refs,
              ...(!existing.editedByUser && g.description
                ? { description: g.description }
                : {}),
            },
          });
        }
      }

      // Goal sub-goal suggestions — fuzzy-match parentGoalText against
      // the user's existing goals, create GoalSuggestion rows. Runs
      // AFTER the goal upserts above so a brand-new goal from this same
      // entry is eligible as a suggestion's parent.
      if (extraction.subGoalSuggestions && extraction.subGoalSuggestions.length > 0) {
        await persistSubGoalSuggestions(
          tx,
          userId,
          entryId,
          extraction.subGoalSuggestions
        );
      }

      const tasks = await tx.task.findMany({
        where: { entryId },
        orderBy: { createdAt: "asc" },
      });

      return { entry, tasks, tasksCreated, extraction };
    });

    // ── Post-transaction: update memory + life map (non-fatal) ────────────
    try {
      const { updateUserMemory, updateLifeMap } = await import("@/lib/memory");
      await updateUserMemory(userId, result.entry, extraction);
      await updateLifeMap(userId, extraction.lifeAreaMentions);
    } catch (err) {
      console.error("[pipeline] memory/lifemap update failed (non-fatal):", err);
    }

    // ── Embed for Ask-Your-Past-Self (non-fatal) ──────────────────────────
    // Mirror of the process-entry.ts step.run("embed-entry") block so sync-
    // path entries (ENABLE_INNGEST_PIPELINE unset) are still indexed for
    // semantic search. Failures leave the entry un-embedded until the
    // backfill script catches it.
    try {
      const { buildEmbedText, embedText } = await import("@/lib/embeddings");
      const text = buildEmbedText({
        summary: result.entry.summary,
        transcript: result.entry.transcript,
      });
      if (text) {
        const vec = await embedText(text);
        await prisma.entry.update({
          where: { id: entryId },
          data: { embedding: vec },
        });
      }
    } catch (err) {
      console.warn("[pipeline] embedding failed (non-fatal):", err);
    }

    return result;
  } catch (err) {
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

const VALID_SENTIMENTS = ["positive", "negative", "neutral"] as const;

function validateLifeAreaMentions(
  raw: unknown
): LifeAreaMentions | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  const keys: (keyof LifeAreaMentions)[] = [
    "career",
    "health",
    "relationships",
    "finances",
    "personal",
    "other",
  ];

  const result: Record<string, LifeAreaMention> = {};

  for (const key of keys) {
    const val = (raw as Record<string, unknown>)[key];
    if (!val || typeof val !== "object") {
      result[key] = {
        mentioned: false,
        score: 5,
        themes: [],
        people: [],
        goals: [],
        sentiment: "neutral",
      };
      continue;
    }

    const v = val as Record<string, unknown>;
    result[key] = {
      mentioned: Boolean(v.mentioned),
      score: clamp(Number(v.score ?? 5), 1, 10),
      themes: ensureStringArray(v.themes),
      people: ensureStringArray(v.people),
      goals: ensureStringArray(v.goals),
      sentiment: VALID_SENTIMENTS.includes(v.sentiment as any)
        ? (v.sentiment as "positive" | "negative" | "neutral")
        : "neutral",
    };
  }

  return result as LifeAreaMentions;
}
