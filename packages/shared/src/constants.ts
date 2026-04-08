// ─── App ──────────────────────────────────────────────────────────────────────

export const APP_NAME = "Acuity";
export const APP_TAGLINE = "Your nightly brain dump. Clarified.";

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

// ─── Life Map defaults ────────────────────────────────────────────────────────

export const DEFAULT_LIFE_AREAS = [
  { name: "Health & Fitness", color: "#22C55E", icon: "heart-pulse" },
  { name: "Career & Work", color: "#6366F1", icon: "briefcase" },
  { name: "Relationships", color: "#F43F5E", icon: "users" },
  { name: "Finance", color: "#F59E0B", icon: "trending-up" },
  { name: "Learning & Growth", color: "#3B82F6", icon: "book-open" },
  { name: "Fun & Creativity", color: "#A855F7", icon: "sparkles" },
] as const;

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

export const CLAUDE_MODEL = "claude-sonnet-4-6";
export const CLAUDE_MAX_TOKENS = 2048;
