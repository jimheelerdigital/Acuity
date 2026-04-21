// ─── Enums (mirror Prisma enums for client use) ───────────────────────────────

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED";
export type GoalStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "ABANDONED";
export type Mood = "GREAT" | "GOOD" | "NEUTRAL" | "LOW" | "ROUGH";
export type EntryStatus = "PENDING" | "PROCESSING" | "COMPLETE" | "FAILED";

// ─── API Payloads ─────────────────────────────────────────────────────────────

/** Sent by the client to /api/record */
export interface RecordUploadRequest {
  /** Base64-encoded audio blob (mobile) or FormData key "audio" (web) */
  audio?: string;
  mimeType?: string;
  durationSeconds?: number;
}

/** Shape of a single extracted task from Claude */
export interface ExtractedTask {
  title: string;
  description?: string;
  priority: Priority;
  dueDate?: string; // ISO date string
}

/** Shape of a single extracted goal from Claude */
export interface ExtractedGoal {
  title: string;
  description?: string;
  targetDate?: string; // ISO date string
}

/** Life area mention extracted from a brain dump */
export interface LifeAreaMention {
  mentioned: boolean;
  score: number; // 1–10
  themes: string[];
  people: string[];
  goals: string[];
  sentiment: "positive" | "negative" | "neutral";
}

/** All 6 life areas keyed by area-prompt-key (lowercase form). See
 *  `constants.ts::LIFE_AREA_PROMPT_KEYS` for the canonical mapping. */
export interface LifeAreaMentions {
  career: LifeAreaMention;
  health: LifeAreaMention;
  relationships: LifeAreaMention;
  finances: LifeAreaMention;
  personal: LifeAreaMention;
  other: LifeAreaMention;
}

/** Shape of the Claude extraction result stored in Entry.rawAnalysis */
export type ThemeSentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

/** Per-theme sentiment pair — new shape the extraction prompt returns
 *  since the Theme Evolution Map landed (2026-04-20). Backward-compat:
 *  older entries may only have `themes: string[]` in rawAnalysis; the
 *  pipeline parser accepts both shapes and stamps NEUTRAL for legacy. */
export interface ThemeWithSentiment {
  label: string;
  sentiment: ThemeSentiment;
}

export interface ExtractionResult {
  summary: string;
  mood: Mood;
  /** Numeric mood score 1–10 (ROUGH=1–2, LOW=3–4, NEUTRAL=5–6, GOOD=7–8, GREAT=9–10) */
  moodScore: number;
  energy: number; // 1–10
  /** Legacy flat list. Still written to Entry.themes so readers that
   *  haven't moved to the relational ThemeMention model keep working
   *  (weekly reports, life audits, UserMemory.recurringThemes). */
  themes: string[];
  /** Relational source of truth — written to ThemeMention rows by the
   *  extraction pipeline. If a legacy extraction only returned strings,
   *  each pair here has sentiment="NEUTRAL". */
  themesDetailed: ThemeWithSentiment[];
  wins: string[];
  blockers: string[];
  /** 2–4 reflective observations or actionable recommendations */
  insights: string[];
  tasks: ExtractedTask[];
  goals: ExtractedGoal[];
  /** Life area analysis for Life Matrix (may be absent for old entries) */
  lifeAreaMentions?: LifeAreaMentions;
}

/** Response from /api/record */
export interface RecordResponse {
  entryId: string;
  status: EntryStatus;
  transcript: string | null;
  extraction: ExtractionResult;
  tasksCreated: number;
}

// ─── Client-facing DTOs ───────────────────────────────────────────────────────

export interface EntryDTO {
  id: string;
  transcript: string;
  summary: string | null;
  mood: Mood | null;
  moodScore: number | null;
  energy: number | null;
  themes: string[];
  wins: string[];
  blockers: string[];
  insights: string[];
  // Pre-signed URL from the legacy sync pipeline (1-hour TTL). Still
  // populated on trial-era entries. Callers should prefer `audioPath` +
  // a signed-on-demand helper; see `lib/audio.ts::getEntryAudioPath` on
  // the server side.
  audioUrl: string | null;
  // Supabase Storage object path populated by the async pipeline. Not a
  // URL — clients must call a sign-on-demand endpoint before playback.
  audioPath: string | null;
  audioDuration: number | null;
  status: string;
  createdAt: string;
}

export interface TaskDTO {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: Priority;
  status: TaskStatus;
  goalId: string | null;
  entryId: string | null;
  createdAt: string;
}

export interface GoalDTO {
  id: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  status: GoalStatus;
  progress: number;
  areaId: string | null;
  createdAt: string;
}

export interface LifeMapAreaDTO {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  currentScore: number | null;
}

export interface WeeklyReportDTO {
  id: string;
  weekStart: string;
  weekEnd: string;
  summary: string;
  wins: string[];
  challenges: string[];
  nextActions: string[];
  moodAvg: number | null;
  energyAvg: number | null;
  entryCount: number;
  createdAt: string;
}
