import type { Mood } from "./types";

// ─── App ──────────────────────────────────────────────────────────────────────

export const APP_NAME = "Acuity";
export const APP_TAGLINE = "The daily debrief that turns chaos into clarity.";

// ─── Recording ────────────────────────────────────────────────────────────────

export const MAX_RECORDING_SECONDS = 600; // 10 minutes
export const MIN_RECORDING_SECONDS = 5;
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB (Whisper limit)
export const SUPPORTED_AUDIO_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/m4a",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
] as const;

// ─── Life Areas (canonical 6 — reconciled 2026-04-19) ───────────────────────
//
// Source of truth: product spec. Three forms in the codebase, all derived
// from the same enum:
//
//   `LifeArea`               UPPER_SNAKE_CASE enum stored on
//                            `LifeMapArea.area` and `Goal.lifeArea`.
//   `LIFE_AREA_PROMPT_KEYS`  lowercase form sent to/received from Claude
//                            (extraction JSON keys, Compression prompt
//                            output keys) and used as the suffix on
//                            UserMemory column names (`${key}Summary`,
//                            `${key}Mentions`, `${key}Baseline`).
//   `LIFE_AREA_DISPLAY`      user-facing display string.
//
// Reconciliation notes:
//   - `Wealth` → `FINANCES` (matches product spec / common UX vocabulary).
//   - `Spirituality` removed; covered by `PERSONAL` (broader: purpose,
//     values, personal growth, meaning).
//   - `Growth` removed; the catch-all bucket is now `OTHER`.

export const LIFE_AREAS = [
  "CAREER",
  "HEALTH",
  "RELATIONSHIPS",
  "FINANCES",
  "PERSONAL",
  "OTHER",
] as const;

export type LifeArea = (typeof LIFE_AREAS)[number];

export const LIFE_AREA_DISPLAY: Record<LifeArea, string> = {
  CAREER: "Career",
  HEALTH: "Health",
  RELATIONSHIPS: "Relationships",
  FINANCES: "Finances",
  PERSONAL: "Personal Growth",
  OTHER: "Other",
};

/**
 * Goal group metadata — drives the grouped sections on the Goals
 * screen (mirror of the Tasks group pattern). The 6 values + order
 * match the product spec: Career / Health / Finances / Relationships
 * / Personal Growth / Hobbies. Internally the groups map back to the
 * existing LifeArea enum (OTHER = Hobbies) so no schema change is
 * required and existing goals populate groups automatically.
 *
 * Icon names are Lucide identifiers; each platform imports the same
 * icon from its respective lucide-react / lucide-react-native
 * package, so copy stays platform-agnostic here.
 */
export type GoalGroupId = LifeArea;

export interface GoalGroupMeta {
  id: GoalGroupId;
  label: string;
  icon:
    | "Briefcase"
    | "HeartPulse"
    | "Wallet"
    | "Users"
    | "Sprout"
    | "Palette";
  color: string;
  order: number;
}

export const GOAL_GROUPS: GoalGroupMeta[] = [
  { id: "CAREER", label: "Career", icon: "Briefcase", color: "#3B82F6", order: 0 },
  { id: "HEALTH", label: "Health", icon: "HeartPulse", color: "#14B8A6", order: 1 },
  { id: "FINANCES", label: "Finances", icon: "Wallet", color: "#F59E0B", order: 2 },
  { id: "RELATIONSHIPS", label: "Relationships", icon: "Users", color: "#F43F5E", order: 3 },
  { id: "PERSONAL", label: "Personal Growth", icon: "Sprout", color: "#A855F7", order: 4 },
  { id: "OTHER", label: "Hobbies", icon: "Palette", color: "#71717A", order: 5 },
];

/** Find group metadata for a life-area value. Falls back to OTHER
 *  (Hobbies) for anything unrecognized — e.g. a legacy goal whose
 *  lifeArea somehow doesn't match the canonical 6. */
export function goalGroupForArea(area: string | null | undefined): GoalGroupMeta {
  const match = GOAL_GROUPS.find((g) => g.id === area);
  return match ?? GOAL_GROUPS[GOAL_GROUPS.length - 1];
}

export const LIFE_AREA_PROMPT_KEYS: Record<LifeArea, string> = {
  CAREER: "career",
  HEALTH: "health",
  RELATIONSHIPS: "relationships",
  FINANCES: "finances",
  PERSONAL: "personal",
  OTHER: "other",
};

export const LIFE_AREA_BY_PROMPT_KEY: Record<string, LifeArea> = Object.fromEntries(
  Object.entries(LIFE_AREA_PROMPT_KEYS).map(([area, key]) => [
    key,
    area as LifeArea,
  ])
);

export const DEFAULT_LIFE_AREAS = [
  { enum: "CAREER" as LifeArea, key: "career", name: "Career", color: "#3B82F6", icon: "briefcase" },
  { enum: "HEALTH" as LifeArea, key: "health", name: "Health", color: "#14B8A6", icon: "heart-pulse" },
  { enum: "RELATIONSHIPS" as LifeArea, key: "relationships", name: "Relationships", color: "#F43F5E", icon: "users" },
  { enum: "FINANCES" as LifeArea, key: "finances", name: "Finances", color: "#F59E0B", icon: "trending-up" },
  { enum: "PERSONAL" as LifeArea, key: "personal", name: "Personal Growth", color: "#A855F7", icon: "sparkles" },
  { enum: "OTHER" as LifeArea, key: "other", name: "Other", color: "#71717A", icon: "more-horizontal" },
] as const;

export type LifeAreaKey = (typeof DEFAULT_LIFE_AREAS)[number]["key"];

// ─── Mood labels ──────────────────────────────────────────────────────────────

export const MOOD_LABELS: Record<string, string> = {
  GREAT: "Great",
  GOOD: "Good",
  NEUTRAL: "Neutral",
  LOW: "Low",
  ROUGH: "Rough",
};

export const MOOD_EMOJI: Record<string, string> = {
  GREAT: "🚀",
  GOOD: "😊",
  NEUTRAL: "😐",
  LOW: "😔",
  ROUGH: "😣",
};

/**
 * Map a 1-10 mood score to the 5-bucket enum. Kept symmetric so a
 * legacy consumer reading the string label still behaves well when
 * the new slider is used:
 *   1–2 ROUGH · 3–4 LOW · 5–6 NEUTRAL · 7–8 GOOD · 9–10 GREAT
 */
export function moodBucketFromScore(score: number): Mood {
  const n = Math.max(1, Math.min(10, Math.round(score)));
  if (n <= 2) return "ROUGH";
  if (n <= 4) return "LOW";
  if (n <= 6) return "NEUTRAL";
  if (n <= 8) return "GOOD";
  return "GREAT";
}

/** Short word describing a 1-10 score — used beneath the slider thumb. */
export function moodLabelForScore(score: number): string {
  const bucket = moodBucketFromScore(score);
  return MOOD_LABELS[bucket];
}

// ─── Priority ─────────────────────────────────────────────────────────────────

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const PRIORITY_COLOR: Record<string, string> = {
  LOW: "#94A3B8",
  MEDIUM: "#60A5FA",
  HIGH: "#F59E0B",
  URGENT: "#EF4444",
};

// ─── Stripe ───────────────────────────────────────────────────────────────────

export const PLAN_FREE_ENTRY_LIMIT = 7; // entries per week on free plan
export const PLAN_PRO_NAME = "Acuity Pro";

// ─── Whisper ──────────────────────────────────────────────────────────────────

export const WHISPER_MODEL = "whisper-1";
export const WHISPER_LANGUAGE = "en"; // set to undefined for auto-detect

// ─── Claude ───────────────────────────────────────────────────────────────────

// Sonnet-4-6 is the current default for extraction, weekly synthesis, memory
// compression, and life-map insights — the "everything else" model per the
// 2026-04-19 decision. Flagship work (Day 14 Life Audit, Quarterly audits —
// not yet built) uses claude-opus-4-7 and should reference a separate
// CLAUDE_FLAGSHIP_MODEL constant when those land.
export const CLAUDE_MODEL = "claude-sonnet-4-6";
export const CLAUDE_MAX_TOKENS = 2048;

// Opus-4-7 is reserved for flagship long-form outputs where quality
// matters more than cost: Day 14 Life Audit, Quarterly audits, Annual
// memoir. Sonnet handles the per-entry extraction + weekly synthesis
// + memory compression + lifemap insights.
export const CLAUDE_FLAGSHIP_MODEL = "claude-opus-4-7";
// Long-form Claude output budget. Day 14 Life Audit target is ~1000
// words of narrative + a few hundred tokens of metadata; 4096 tokens
// leaves headroom. Don't raise without measuring — longer tokens =
// longer wall-clock = tighter per-step Hobby ceiling.
export const CLAUDE_FLAGSHIP_MAX_TOKENS = 4096;
