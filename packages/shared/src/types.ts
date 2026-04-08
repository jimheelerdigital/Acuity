// ─── Enums (mirror Prisma enums for client use) ───────────────────────────────

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED";
export type GoalStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "ABANDONED";
export type Mood = "GREAT" | "GOOD" | "NEUTRAL" | "LOW" | "ROUGH";

// ─── API Payloads ─────────────────────────────────────────────────────────────

/** Sent by the client to /api/record */
export interface RecordUploadRequest {
  /** Base64-encoded audio blob (mobile) or FormData key "audio" (web) */
  audio?: string;
  mimeType?: string;
  durationSeconds?: number;
}

/** Shape of the Claude extraction result stored in Entry.rawAnalysis */
export interface ExtractionResult {
  summary: string;
  mood: Mood;
  energy: number; // 1–10
  themes: string[];
  wins: string[];
  blockers: string[];
  tasks: ExtractedTask[];
  goals: ExtractedGoal[];
}

export interface ExtractedTask {
  title: string;
  description?: string;
  priority: Priority;
  dueDate?: string; // ISO date string
}

export interface ExtractedGoal {
  title: string;
  description?: string;
  targetDate?: string; // ISO date string
}

/** Response from /api/record */
export interface RecordResponse {
  entryId: string;
  transcript: string;
  extraction: ExtractionResult;
  tasksCreated: number;
}

// ─── Client-facing DTOs ───────────────────────────────────────────────────────

export interface EntryDTO {
  id: string;
  transcript: string;
  summary: string | null;
  mood: Mood | null;
  energy: number | null;
  themes: string[];
  wins: string[];
  blockers: string[];
  audioUrl: string | null;
  audioDuration: number | null;
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
