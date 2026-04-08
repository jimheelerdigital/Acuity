/**
 * The Acuity extraction pipeline:
 *   Audio → Whisper (transcription) → Claude (extraction) → structured data
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

// ─── Step 1: Transcribe ───────────────────────────────────────────────────────

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

// ─── Step 2: Extract ──────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are Acuity's extraction engine. Your job is to analyse a user's nightly voice brain dump and return a structured JSON object. Be empathetic, precise, and actionable.

Return ONLY valid JSON matching this exact schema — no markdown, no prose:

{
  "summary": "2-3 sentence synthesis of the day",
  "mood": "GREAT" | "GOOD" | "NEUTRAL" | "LOW" | "ROUGH",
  "energy": <integer 1–10>,
  "themes": ["theme1", "theme2"],       // up to 5 short theme labels
  "wins": ["win1", "win2"],              // things that went well today
  "blockers": ["blocker1"],              // obstacles or frustrations
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
    energy: clamp(Number(parsed.energy ?? 5), 1, 10),
    themes: ensureStringArray(parsed.themes).slice(0, 5),
    wins: ensureStringArray(parsed.wins),
    blockers: ensureStringArray(parsed.blockers),
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
