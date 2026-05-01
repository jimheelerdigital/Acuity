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

// 30s per-call timeout. SDK default is 600s (10 min); a stuck
// upstream would otherwise tie up the Vercel function for the full
// duration, burning $$ on Active CPU and blocking Inngest's retry
// budget. 30s is well above p99 latency for either Whisper or Claude
// at our prompt sizes, so legitimate calls aren't truncated. Both
// SDKs throw an APITimeoutError on hit, which Inngest will retry.
const SDK_TIMEOUT_MS = 30_000;
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: SDK_TIMEOUT_MS,
});
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: SDK_TIMEOUT_MS,
});

// DIAG (2026-05-01) — runtime evidence of which ANTHROPIC_API_KEY the
// Vercel function instance is actually seeing. The dashboard shows
// suffix "hwAA" but Anthropic Console reports that key has never been
// used; production calls 401 with "invalid x-api-key". This logs the
// last 4 chars only (never the full key) so we can compare to what
// the dashboard claims is set. Fires once per cold-start and once per
// extractFromTranscript invocation. Remove once the source is found.
{
  const k = process.env.ANTHROPIC_API_KEY;
  // eslint-disable-next-line no-console
  console.log(
    "[anthropic-key-diag] cold-start suffix=" +
      (k && k.length >= 4 ? k.slice(-4) : "(empty/short)") +
      " length=" +
      (k?.length ?? 0)
  );
}

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

/**
 * Theme-block guideline. Two variants:
 *   - "legacy" (V0): the original "1-3 words" rule. Produces event-
 *     level themes that don't recur ("Demo No-Shows", "anniversary
 *     dinner"). 80% singletons in production by 2026-04-30 audit.
 *   - "dispositional" (V5): the v1.1 rewrite. Steers Claude toward
 *     dispositional patterns that recur across entries ("intention
 *     without follow-through", "presence with family"). Phase 2
 *     bench (docs/v1-1/theme-extraction-phase2.md) showed 6 patterns
 *     recurring 2-3× across 20 sample entries vs zero for V0.
 *
 * Both variants emit the SAME JSON shape (`themes: [{ label, sentiment }]`)
 * so `recordThemesFromExtraction` works unchanged either way. The
 * variant only changes how Claude is steered to populate the array.
 *
 * Selection at call time via `useDispositionalThemes`, gated by the
 * `v1_1_dispositional_themes` feature flag in process-entry.ts.
 */
const LEGACY_THEME_GUIDELINE =
  "- Keep theme labels short (1-3 words). Per-theme sentiment reflects the user's emotional framing of that specific theme in this entry: POSITIVE if they expressed satisfaction/progress, NEGATIVE if strain/frustration, NEUTRAL if they mentioned it factually without strong valence. Up to 5 themes per entry.";

const DISPOSITIONAL_THEME_GUIDELINE = `- Themes are DISPOSITIONAL PATTERNS, not event-level descriptions. A pattern is something that would plausibly recur across this user's future entries about completely different topics — describing HOW the user shows up, not WHAT happened today.

  Internal two-step (do not include in output):
  1. Surface: what literally happened today (a phrase you discard).
  2. Pattern: the dispositional reading. Apply the RECURRENCE TEST: "Could this same label honestly fit an entry six months from now about a completely different domain (work vs family vs health vs hobbies)?" If no, drop the candidate.

  Prefer these CANONICAL SHAPES — they describe dispositions and recur cleanly across users and topics:
    "X compounding" / "X compounding into Y" — small disciplined acts adding up
    "Y without explanation" / "Y without closure" — receiving outcomes without clarity
    "Z over W" — choosing one orientation over another ("connection over performance", "presence over productivity", "clarity over cleverness", "reactive over deep work")
    "defending K" — protecting time, energy, or attention from drift
    "presence with M" — being undivided with people
    "rules I break for myself" / "rules I break repeatedly" — gap between intent and action
    "X as Y lever" — recognizing what changes what ("sleep as performance lever", "movement as cognitive fuel")
    "noticing what restores me" / "noticing my own avoidance" — meta-awareness of self-state
    "intention without follow-through" — recurring inability to execute on stated plans
    "showing up tired" / "showing up scattered" — recurring posture under load

  You are not limited to these shapes — new patterns are fine if they pass the recurrence test.

  DO NOT return:
    - Proper names of people, places, products, sports, hobbies, or domains. "Celtics", "Briarwood", "Keenan", "Mike", "golf", "karate", "demo", "anniversary" are entities — they belong in entity extraction (a separate pipeline shipping later), not in themes. Replace a person's name with the role they play in the pattern.
    - Today-specific phrases. "Demo no-shows", "leg day reluctance", "anniversary dinner", "nice weather" are events. Drop them.
    - Generic abstractions like "self-awareness", "productivity", "wellbeing", "fulfillment". Reframe as the specific dispositional posture ("noticing my own performing", "reactive over deep work").

  Output rules:
    - 0-3 themes per entry. Two themes is common when the entry is rich enough to expose a disposition + a recurring tension. One theme is fine for sparse entries. Empty array IS valid output for a single-line entry where no pattern emerges. Never pad to fill a quota.
    - Sentiment: POSITIVE = a strength being leaned into; NEGATIVE = friction or frustration with the pattern; NEUTRAL = mentioned without strong valence.
    - Lowercase labels except where genuinely required by grammar.
    - Reuse is the goal — when a familiar pattern fits, prefer the familiar phrasing over inventing a new one.`;

function buildExtractionSystemPrompt(useDispositional: boolean): string {
  const themeGuideline = useDispositional
    ? DISPOSITIONAL_THEME_GUIDELINE
    : LEGACY_THEME_GUIDELINE;
  return `You are Acuity's extraction engine. Your job is to analyse a user's nightly voice debrief and return a structured JSON object. Be empathetic, precise, and actionable.

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
  "progressSuggestions": [
    {
      "goalText": "verbatim phrase matching an existing goal the user already has",
      "suggestedProgressPct": <integer 0-100, the new total progress value not a delta>,
      "rationale": "one short sentence quoting the transcript that justifies the update"
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
- progressSuggestions: populate ONLY when the transcript contains concrete, quantifiable evidence of progress on an existing user goal from the memory context — e.g. "closed our first $100k deal" against a "close $1M" goal. goalText must match an existing goal. suggestedProgressPct is the new total percent (not a delta) — infer from the numeric relationship when possible (e.g. $100k of $1M → 10), otherwise leave conservative. rationale is one short sentence that QUOTES a phrase from the transcript. Do NOT invent progress or guess percentages without clear evidence. Skip if unsure — these get shown to the user for validation before anything is written, so precision beats enthusiasm.
${themeGuideline}
- Insights should be reflective observations the user might not have noticed, or concrete next-step recommendations
- moodScore should be a nuanced score that reflects the overall emotional tone
- Today's date context will be provided in the user message
${LIFE_AREA_EXTRACTION_SCHEMA}`;
}

const LEGACY_EXTRACTION_SYSTEM_PROMPT = buildExtractionSystemPrompt(false);
const DISPOSITIONAL_EXTRACTION_SYSTEM_PROMPT =
  buildExtractionSystemPrompt(true);

export async function extractFromTranscript(
  transcript: string,
  todayISO: string,
  memoryContext?: string,
  goalContext?: { title: string; description: string | null } | null,
  taskGroupNames?: string[],
  dimensionContext?: string | null,
  useDispositionalThemes = false
): Promise<ExtractionResult> {
  const contextBlock = memoryContext
    ? `Here is what you know about this user from their entire history with Acuity:\n${memoryContext}\n\nUse these historical patterns to enrich your extraction — for example, if a goal has been mentioned multiple times before, note it as recurring rather than new.\n\n`
    : "";

  // Life-dimension context: when the recorder was opened from a
  // dimension detail's "Record about this" button, we tell the
  // extractor which area this entry is about. Human-readable name
  // lands in the prompt; the key stays in Entry.dimensionContext.
  const DIMENSION_NAME_BY_KEY: Record<string, string> = {
    career: "Career",
    health: "Health",
    relationships: "Relationships",
    finances: "Finances",
    personal: "Personal Growth",
    other: "Other",
  };
  const dimensionBlock =
    dimensionContext && DIMENSION_NAME_BY_KEY[dimensionContext]
      ? `This entry is specifically about the user's ${DIMENSION_NAME_BY_KEY[dimensionContext]} life area. Weight that area's lifeAreaMentions entry accordingly, and anchor wins/blockers/themes/insights to it when they clearly belong.\n\n`
      : "";

  // Task group classification. When the user has TaskGroups set up
  // (default 5 get seeded on first /api/tasks fetch), give the model
  // that exact list as the allowed enum for each task's groupName.
  // Empty list = classifier is disabled for this call; tasks extract
  // without a groupName and land ungrouped until the user runs
  // recategorize from the settings page.
  const taskGroupsBlock =
    taskGroupNames && taskGroupNames.length > 0
      ? `The user's task groups (each extracted task MUST be classified into one of these, case-sensitive; fall back to "Other" when unsure): ${taskGroupNames.join(", ")}. Emit each task's chosen group as a "groupName" field alongside title/description/priority/dueDate.\n\n`
      : "";

  // Goal context: when the user opens the recorder from a specific goal,
  // tell the extractor this entry is deliberately about that goal. The
  // model should treat wins/blockers/tasks as belonging to this goal's
  // surface area and prefer the goal's existing title/phrasing when
  // describing it back in the summary.
  const goalBlock = goalContext
    ? `This entry is specifically about the user's existing goal titled: "${goalContext.title}"${
        goalContext.description
          ? `\nGoal description: ${goalContext.description}`
          : ""
      }\nAnchor wins/blockers/tasks/insights to this goal when they clearly belong to it, and reuse the goal's existing phrasing rather than inventing a new name.\n\n`
    : "";

  const systemPrompt = useDispositionalThemes
    ? DISPOSITIONAL_EXTRACTION_SYSTEM_PROMPT
    : LEGACY_EXTRACTION_SYSTEM_PROMPT;

  // DIAG (2026-05-01) — per-call suffix log alongside the cold-start
  // log at module-load. See the cold-start block above for context.
  {
    const k = process.env.ANTHROPIC_API_KEY;
    // eslint-disable-next-line no-console
    console.log(
      "[anthropic-key-diag] extract-call suffix=" +
        (k && k.length >= 4 ? k.slice(-4) : "(empty/short)") +
        " length=" +
        (k?.length ?? 0)
    );
  }

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: CLAUDE_MAX_TOKENS,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `${contextBlock}${goalBlock}${dimensionBlock}${taskGroupsBlock}Today's date: ${todayISO}\n\nDaily debrief transcript:\n\n${transcript}`,
      },
    ],
  });

  const rawText =
    message.content[0].type === "text" ? message.content[0].text : "";

  const jsonText = rawText
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();

  // Guard against malformed / truncated JSON. Claude usually returns
  // clean JSON but a long-tail of edge cases (token cap mid-object,
  // unescaped quotes inside transcript echoes, partial responses on
  // upstream timeout retry) can cause the parse to throw. Re-raise as
  // a typed Error with the raw response trimmed to 500 chars so the
  // pipeline's catch block can mark Entry FAILED with a useful message.
  let parsed: ExtractionResult;
  try {
    parsed = JSON.parse(jsonText) as ExtractionResult;
  } catch (err) {
    const preview = jsonText.slice(0, 500);
    throw new Error(
      `Claude returned malformed JSON (${
        err instanceof Error ? err.message : "parse error"
      }). Preview: ${preview}`
    );
  }

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

  // Observability for the v1.1 dispositional-themes rollout. Logs
  // which prompt variant produced this extraction's themes plus
  // distribution stats so we can verify lab improvements
  // (docs/v1-1/theme-extraction-phase2.md) hold at production scale.
  // Theme labels are non-PII (no transcript content, no names by
  // construction in V5). safeLog also redacts known-sensitive fields.
  const { safeLog } = await import("./safe-log");
  safeLog.info("extract.theme_prompt", {
    variant: useDispositionalThemes ? "v5_dispositional" : "v0_legacy",
    themeCount: themesDetailed.length,
    labels: themesDetailed.map((t) => t.label),
    transcriptLength: transcript.length,
  });

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
      // Claude-assigned group name. Resolved to a TaskGroup.id at
      // persist time via task-groups::resolveGroupName. Missing or
      // unknown names fall back to "Other".
      groupName:
        typeof (t as { groupName?: unknown }).groupName === "string"
          ? (t as { groupName: string }).groupName
          : undefined,
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
    progressSuggestions: Array.isArray(parsed.progressSuggestions)
      ? parsed.progressSuggestions
          .filter(
            (
              s
            ): s is {
              goalText: string;
              suggestedProgressPct: number;
              rationale: string;
            } =>
              !!s &&
              typeof s === "object" &&
              typeof (s as { goalText?: unknown }).goalText === "string" &&
              typeof (s as { suggestedProgressPct?: unknown })
                .suggestedProgressPct === "number" &&
              typeof (s as { rationale?: unknown }).rationale === "string"
          )
          .map((s) => ({
            goalText: s.goalText.slice(0, 200),
            suggestedProgressPct: clamp(
              Math.round(Number(s.suggestedProgressPct)),
              0,
              100
            ),
            rationale: s.rationale.slice(0, 500),
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
  goalId,
  dimensionContext,
}: {
  entryId: string;
  userId: string;
  audioBuffer: Buffer;
  mimeType: string;
  durationSeconds?: number;
  /** Set when the recording was initiated from a goal detail/card. Passed
   *  through to extraction so Claude anchors the entry to that goal. */
  goalId?: string | null;
  /** Set when the recording was initiated from a dimension detail's
   *  "Record about this" button. Lowercase key from DEFAULT_LIFE_AREAS. */
  dimensionContext?: string | null;
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

    // ── FREE / PRO branch ─────────────────────────────────────────────────
    // Mirror of process-entry.ts. Even though the sync path is being
    // retired (see route.ts:38-41), it's still live; both paths must
    // honour the v1.1 entitlement split or behavior diverges based on
    // an unrelated infrastructure flag.
    const userRow = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { subscriptionStatus: true, trialEndsAt: true },
    });
    const { entitlementsFor } = await import("@/lib/entitlements");
    const ent = entitlementsFor(userRow);

    if (!ent.canExtractEntries) {
      // FREE branch — Haiku summary, recording stats, streak, return.
      const { summarizeForFreeTier } = await import("@/lib/free-summary");
      const summary = await summarizeForFreeTier(transcript);
      const entryRow = await prisma.entry.update({
        where: { id: entryId },
        data: {
          audioUrl,
          audioDuration: durationSeconds ?? null,
          transcript,
          summary,
          status: "COMPLETE",
        },
      });

      // Recording stats — mirror of process-entry.ts step.
      try {
        const existingUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { firstRecordingAt: true },
        });
        if (existingUser) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              firstRecordingAt:
                existingUser.firstRecordingAt ?? entryRow.createdAt,
              lastRecordingAt: entryRow.createdAt,
              totalRecordings: { increment: 1 },
            },
          });
        }
      } catch (err) {
        console.error(
          "[pipeline] free-tier recording stats update failed (non-fatal):",
          err
        );
      }

      // Streak — mirror of process-entry.ts step.
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            timezone: true,
            lastSessionDate: true,
            currentStreak: true,
            longestStreak: true,
            lastStreakMilestone: true,
          },
        });
        if (user) {
          const { computeStreakUpdate } = await import("@/lib/streak");
          const now = new Date();
          const update = computeStreakUpdate({
            now,
            timezone: user.timezone || "America/Chicago",
            lastSessionDate: user.lastSessionDate,
            currentStreak: user.currentStreak,
            longestStreak: user.longestStreak,
            lastStreakMilestone: user.lastStreakMilestone,
          });
          await prisma.user.update({
            where: { id: userId },
            data: {
              lastSessionDate: now,
              currentStreak: update.currentStreak,
              longestStreak: update.longestStreak,
              lastStreakMilestone: update.milestoneHit
                ? update.milestoneHit
                : undefined,
            },
          });
        }
      } catch (err) {
        console.error(
          "[pipeline] free-tier streak update failed (non-fatal):",
          err
        );
      }

      return { entry: entryRow, tasks: [], tasksCreated: 0, extraction: null };
    }

    // ── PRO/TRIAL path (existing pipeline, unchanged) ────────────────────

    // ── Build memory context ──────────────────────────────────────────────
    const { buildMemoryContext } = await import("@/lib/memory");
    const memoryContext = await buildMemoryContext(userId);

    // ── Build goal context (when recording is goal-linked) ────────────────
    let goalContext: { title: string; description: string | null } | null =
      null;
    if (goalId) {
      const goal = await prisma.goal.findFirst({
        where: { id: goalId, userId },
        select: { title: true, description: true },
      });
      if (goal) goalContext = goal;
    }

    // ── Ensure default TaskGroups exist + fetch names for the prompt ─────
    const { ensureDefaultTaskGroups } = await import("@/lib/task-groups");
    await ensureDefaultTaskGroups(prisma, userId);
    const taskGroups = await prisma.taskGroup.findMany({
      where: { userId },
      orderBy: { order: "asc" },
      select: { name: true },
    });
    const taskGroupNames = taskGroups.map((g) => g.name);

    // ── Extract with memory + goal + dimension + task groups ─────────────
    const todayISO = new Date().toISOString().split("T")[0];
    const extraction = await extractFromTranscript(
      transcript,
      todayISO,
      memoryContext || undefined,
      goalContext,
      taskGroupNames,
      dimensionContext ?? null
    );

    // ── Persist everything in one transaction ─────────────────────────────
    const { recordThemesFromExtraction } = await import("@/lib/themes");
    const { persistSubGoalSuggestions, persistProgressSuggestions } =
      await import("@/lib/goals");
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

      // Tasks: extracted but NOT persisted yet. User reviews + commits
      // via /api/entries/[id]/commit-extraction. The raw list lives on
      // Entry.rawAnalysis.tasks and is rendered by the review banner on
      // the entry detail page. extractionCommittedAt stays null until
      // the user decides.
      const tasksCreated = 0;

      // Goals: matching re-mentions of EXISTING user goals still bump
      // lastMentionedAt + entryRefs (observational metadata, no new
      // row). NEW goals from the extraction are NOT auto-created —
      // they're surfaced in the review banner for the user to confirm.
      for (const g of extraction.goals) {
        const existing = await tx.goal.findFirst({
          where: { userId, title: { equals: g.title, mode: "insensitive" } },
        });
        if (existing) {
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
        // else: NEW goals surface in the review banner — see
        // /api/entries/[id]/extraction GET route.
      }

      // Anchor-goal bump — when the user recorded "Add a reflection" on
      // a specific goal, Entry.goalId is set. The extraction.goals loop
      // above only touches goals Claude emitted by title; the anchor
      // goal won't appear there unless the user spoke its exact title.
      // Explicitly bump the anchor's lastMentionedAt + entryRefs so the
      // reflection always counts toward "last mentioned" and shows up
      // in the goal's linked-entries list.
      if (goalId) {
        const anchor = await tx.goal.findFirst({
          where: { id: goalId, userId },
          select: { id: true, entryRefs: true },
        });
        if (anchor) {
          const refs = Array.from(
            new Set([...(anchor.entryRefs ?? []), entryId])
          );
          await tx.goal.update({
            where: { id: anchor.id },
            data: { lastMentionedAt: new Date(), entryRefs: refs },
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

      // Progress suggestions — Claude emits these when the transcript
      // evidences concrete progress on an existing goal. Persisted
      // PENDING; the goal detail page shows a banner + review modal
      // where the user accepts/edits/dismisses before anything writes
      // to Goal.progress.
      if (
        extraction.progressSuggestions &&
        extraction.progressSuggestions.length > 0
      ) {
        await persistProgressSuggestions(
          tx,
          userId,
          entryId,
          goalId ?? null,
          extraction.progressSuggestions
        );
      }

      const tasks = await tx.task.findMany({
        where: { entryId },
        orderBy: { createdAt: "asc" },
      });

      return { entry, tasks, tasksCreated, extraction };
    });

    // ── Recording stats (drives trial onboarding sequence) ────────────────
    // Mirror of the process-entry.ts step.run("update-recording-stats")
    // block so sync-path entries (ENABLE_INNGEST_PIPELINE unset) also
    // flip firstRecordingAt on successful persist. Non-fatal.
    try {
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstRecordingAt: true },
      });
      if (existingUser) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            firstRecordingAt:
              existingUser.firstRecordingAt ?? result.entry.createdAt,
            lastRecordingAt: result.entry.createdAt,
            totalRecordings: { increment: 1 },
          },
        });
      }
    } catch (err) {
      console.error(
        "[pipeline] recording stats update failed (non-fatal):",
        err
      );
    }

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
    // Mark FAILED so the user sees a concrete error state instead of a
    // permanently-PROCESSING entry. If THIS write also fails (deleted
    // mid-flight, pool exhaustion), log it loudly — silent swallow
    // here was the bug. Inngest will surface the original error via
    // its retry log either way.
    await prisma.entry
      .update({
        where: { id: entryId },
        data: { status: "FAILED" },
      })
      .catch((updateErr) => {
        // eslint-disable-next-line no-console
        console.error(
          `[pipeline] CRITICAL: failed to mark entry ${entryId} FAILED — entry will be stuck:`,
          updateErr
        );
      });

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

  // All 6 required keys are populated by the loop above (keys list is
  // exactly the LifeAreaMentions keys). TS can't prove that from a loop
  // over a wider Record, so go through unknown — matches the error's own
  // suggested resolution.
  return result as unknown as LifeAreaMentions;
}
