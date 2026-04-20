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

// ─── Life Matrix defaults ────────────────────────────────────────────────────────

export const DEFAULT_LIFE_AREAS = [
  { name: "Health", key: "health", color: "#14B8A6", icon: "heart-pulse" },
  { name: "Wealth", key: "wealth", color: "#F59E0B", icon: "trending-up" },
  { name: "Relationships", key: "relationships", color: "#F43F5E", icon: "users" },
  { name: "Spirituality", key: "spirituality", color: "#A855F7", icon: "sparkles" },
  { name: "Career", key: "career", color: "#3B82F6", icon: "briefcase" },
  { name: "Growth", key: "growth", color: "#22C55E", icon: "book-open" },
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
